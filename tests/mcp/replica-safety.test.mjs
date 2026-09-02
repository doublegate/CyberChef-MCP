/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Recipe storage under more than one replica.
 *
 * Recipe storage is a JSON file, so it is local to one process unless deliberately placed on a
 * shared volume. v2.6.0 does not externalise it -- adding a database or a Redis dependency to a
 * security toolkit to coordinate one JSON file is the wrong trade -- so the constraint is real and
 * documented rather than engineered away.
 *
 * What is NOT acceptable is losing data quietly when someone hits it. Two replicas sharing one
 * file both load, both modify, and both save; without a check the second rename discards the
 * first one's work and nothing reports it. Measured with the check disabled:
 *
 *     A saved. A sees: [ 'saved-by-A' ]
 *     B saved WITHOUT complaint
 *     on disk now:     [ 'saved-by-B' ]      <- A's recipe is gone
 *
 * These tests pin the detection, and pin honestly what it does not promise.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RecipeStorage } from "../../src/node/recipe-storage.mjs";

let dir, file;

/** A minimal valid recipe body. */
function recipeNamed(name) {
    return { name, operations: [{ op: "To Base64", args: {} }] };
}

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cyberchef-replica-"));
    file = join(dir, "recipes.json");
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe("concurrent writers to one storage file", () => {
    it("refuses a stale write instead of discarding the other writer's work", async () => {
        const a = new RecipeStorage(file);
        const b = new RecipeStorage(file);
        await a.initialize();
        await b.initialize();

        await a.create(recipeNamed("saved-by-A"));

        // B is holding the generation it loaded at startup, so its next save is based on a version
        // of the file that no longer exists.
        await expect(b.create(recipeNamed("saved-by-B")))
            .rejects.toThrow(/changed underneath this process/i);

        // The decisive assertion: A's work is still there.
        const fresh = new RecipeStorage(file);
        await fresh.load();
        expect((await fresh.getAll()).map(r => r.name)).toEqual(["saved-by-A"]);
    });

    it("says what to do about it, not just that it happened", async () => {
        const a = new RecipeStorage(file);
        const b = new RecipeStorage(file);
        await a.initialize();
        await b.initialize();
        await a.create(recipeNamed("first"));

        // An error that reports a generation mismatch and stops there leaves the operator to guess.
        await expect(b.create(recipeNamed("second")))
            .rejects.toThrow(/CYBERCHEF_RECIPE_STORAGE|single replica/i);
    });

    it("lets the stale writer recover by reloading", async () => {
        const a = new RecipeStorage(file);
        const b = new RecipeStorage(file);
        await a.initialize();
        await b.initialize();

        await a.create(recipeNamed("from-A"));
        await b.create(recipeNamed("rejected")).catch(() => {});

        // Reloading is the documented recovery, so it has to actually work.
        await b.load();
        await b.create(recipeNamed("from-B"));

        const fresh = new RecipeStorage(file);
        await fresh.load();
        expect((await fresh.getAll()).map(r => r.name).sort()).toEqual(["from-A", "from-B"]);
    });

    it("does not fire for a single writer making many saves", async () => {
        // The check must be invisible in the ordinary case, which is one process. A false positive
        // here would break every single-replica deployment.
        const only = new RecipeStorage(file);
        await only.initialize();
        for (let i = 0; i < 10; i++) {
            await only.create(recipeNamed(`recipe-${i}`));
        }
        expect(await only.getAll()).toHaveLength(10);
    });
});

describe("upgrading a store written before v2.6.0", () => {
    it("accepts a file with no generation field", async () => {
        // Pre-v2.6.0 files have no `generation`. Treating a missing field as a conflict would make
        // the first save after an upgrade fail for everyone.
        const legacy = {
            version: "1.0.0",
            recipes: [],
            lastModified: new Date().toISOString()
        };
        await writeFile(file, JSON.stringify(legacy, null, 2), "utf8");

        const storage = new RecipeStorage(file);
        await storage.load();
        await expect(storage.create(recipeNamed("after-upgrade"))).resolves.toBeTruthy();

        const written = JSON.parse(await readFile(file, "utf8"));
        expect(written.generation).toBe(1);
    });
});

describe("what the check does not claim", () => {
    it("is a conflict detector, not a lock", async () => {
        // Stated as a test so the limitation is part of the record rather than only a comment.
        // There is a window between reading the on-disk generation and the rename, and Node has no
        // portable advisory locking. The guarantee is "the ordinary stale-writer case is caught",
        // not mutual exclusion -- so the generation advances by exactly one per successful save
        // and is never used to serialise anything.
        const storage = new RecipeStorage(file);
        await storage.initialize();
        await storage.create(recipeNamed("one"));
        const afterFirst = JSON.parse(await readFile(file, "utf8")).generation;
        await storage.create(recipeNamed("two"));
        const afterSecond = JSON.parse(await readFile(file, "utf8")).generation;
        expect(afterSecond - afterFirst).toBe(1);
    });
});
