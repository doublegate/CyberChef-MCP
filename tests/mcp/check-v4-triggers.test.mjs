/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The v4.0.0 trigger watch, tested against fixtures rather than against the internet.
 *
 * WHY THIS EXISTS. A reviewer pointed out that every other script check in this repository has a
 * test beside it -- `check-server-json.test.mjs`, `check-version-consistency` through
 * `tool-surface-figures` -- and this one shipped with none. Its behaviour is entirely about
 * parsing pages that will change, selecting npm tags, telling a missing resource from a failing
 * one, and returning 0/1/2. All of that can silently make a monthly workflow green.
 *
 * THE POINT OF THE FIXTURES. The script's whole purpose is to notice when the outside world moves,
 * so a test that calls the real endpoints would pass today, fail the day something ships, and prove
 * nothing either way. These drive it with a stub `fetch` instead, which makes the interesting cases
 * -- a rollback, an HTTP 429, a page whose shape changed -- reachable at all.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(ROOT, "scripts/check-v4-triggers.mjs");

/** The stub responses that mean "nothing has changed" -- the baseline every case varies from. */
const BASELINE = {
    changelog: "# Changelog\n\nChanges since the most recent release will accumulate here.\n",
    versioning: "# Versioning\n\nThe **current** protocol version is [**2026-07-28**](/specification/2026-07-28/).\n",
    distTags: { "latest": "2.0.0" },
    conformanceTags: { "latest": "0.1.16", "alpha": "0.2.0-alpha.11" },
    schemaIndex: [{ name: "2025-09-29.json" }, { name: "2025-10-17.json" }, { name: "2025-12-11.json" }],
    headStatus: 404
};

/**
 * Run the script with `fetch` replaced by a fixture-driven stub.
 *
 * A child process with `--import`, because the script runs its checks at module top level: there is
 * no exported entry to call, and that is deliberate -- it is a script, not a library.
 *
 * @param {Object} overrides - Fields of BASELINE to replace.
 * @returns {{status: number, stdout: string, stderr: string}} What it produced.
 */
function runWith(overrides = {}) {
    const fixture = { ...BASELINE, ...overrides };
    const preload = `
        const F = ${JSON.stringify(fixture)};
        const json = v => new Response(JSON.stringify(v), { status: 200 });
        globalThis.fetch = async (url, init = {}) => {
            const u = String(url);
            if ((init.method || "GET") === "HEAD") {
                return new Response(null, { status: F.headStatus });
            }
            if (u.includes("/changelog")) return new Response(F.changelog, { status: 200 });
            if (u.includes("/versioning")) return new Response(F.versioning, { status: 200 });
            if (u.includes("api.github.com")) return json(F.schemaIndex);
            if (u.includes("conformance")) return json(F.conformanceTags);
            if (u.includes("registry.npmjs.org")) return json(F.distTags);
            throw new Error("unexpected fetch in test: " + u);
        };
    `;
    const r = spawnSync(process.execPath,
        ["--input-type=module", "-e", `${preload}\nawait import(${JSON.stringify(SCRIPT)});`],
        { cwd: ROOT, encoding: "utf8", timeout: 60000 });
    return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

describe("check-v4-triggers", () => {
    it("exits 0 and fires nothing when the world has not moved", () => {
        const r = runWith();
        expect(r.stdout).toContain("Nothing fired");
        expect(r.stdout).not.toContain("FIRED");
        expect(r.status).toBe(0);
    });

    it("fires when the draft changelog stops being the empty stub", () => {
        const r = runWith({ changelog: "# Changelog\n\n## Key Changes\n\n- Tasks move into core (SEP-2663)\n" });
        expect(r.stdout).toMatch(/FIRED\s+T-1/);
        expect(r.status).toBe(1);
    });

    it("fires when a later protocol revision becomes Current", () => {
        const r = runWith({
            versioning: "The **current** protocol version is [**2027-01-15**](/specification/2027-01-15/)."
        });
        expect(r.stdout).toMatch(/FIRED\s+T-2/);
        expect(r.status).toBe(1);
    });

    it("fires when the SDK moves forward", () => {
        const r = runWith({ distTags: { latest: "2.1.0" } });
        expect(r.stdout).toMatch(/FIRED\s+T-8/);
        expect(r.status).toBe(1);
    });

    it("does NOT fire on a rollback, which is not 'moved past'", () => {
        // The reviewer's case. `newest !== pinned` fires here; `isNewer` must not -- a yanked 2.0.0
        // republished as 1.9.0 is a regression, and sending someone to run the RE-MEASURE ritual
        // over it would be worse than saying nothing.
        const r = runWith({ distTags: { latest: "1.9.0" } });
        expect(r.stdout).not.toContain("FIRED");
        expect(r.status).toBe(0);
    });

    it("compares conformance prereleases numerically, not as strings", () => {
        // `0.2.0-alpha.9` sorts AFTER `0.2.0-alpha.11` as a string. It must not fire.
        expect(runWith({ conformanceTags: { latest: "0.1.16", alpha: "0.2.0-alpha.9" } }).status).toBe(0);
        // ...and the genuine next one must.
        const forward = runWith({ conformanceTags: { latest: "0.1.16", alpha: "0.2.0-alpha.12" } });
        expect(forward.stdout).toMatch(/FIRED\s+T-9/);
        expect(forward.status).toBe(1);
    });

    it("fires when a newer dated schema is published", () => {
        const r = runWith({
            schemaIndex: [{ name: "2025-12-11.json" }, { name: "2026-04-02.json" }],
            headStatus: 200
        });
        expect(r.stdout).toMatch(/FIRED\s+T-10/);
        expect(r.status).toBe(1);
    });

    it("does not fire for a schema that is listed but not published", () => {
        // Committed to the registry's tree is not the same as served. 404 means absent.
        const r = runWith({
            schemaIndex: [{ name: "2025-12-11.json" }, { name: "2026-04-02.json" }],
            headStatus: 404
        });
        expect(r.stdout).not.toContain("FIRED");
        expect(r.status).toBe(0);
    });

    it("exits 2 rather than 0 when a schema probe fails for any reason but 404", () => {
        // The Major finding: 429 and 5xx used to read as "absent", so a rate-limited run reported
        // "nothing fired" and the monthly workflow went green having measured nothing.
        const r = runWith({
            schemaIndex: [{ name: "2025-12-11.json" }, { name: "2026-04-02.json" }],
            headStatus: 429
        });
        expect(r.stderr).toContain("could not complete");
        expect(r.status).toBe(2);
    });

    it("exits 2 when the versioning page shape changes", () => {
        const r = runWith({ versioning: "# Versioning\n\nSomething else entirely.\n" });
        expect(r.stderr).toContain("could not complete");
        expect(r.status).toBe(2);
    });

    it("exits 2 when the changelog is neither the stub nor entries", () => {
        const r = runWith({ changelog: "<html id=\"__next_error__\"></html>" });
        expect(r.stderr).toContain("could not complete");
        expect(r.status).toBe(2);
    });

    it("exits 2 when the schema listing comes back empty", () => {
        // Discovery returning nothing must not mean "no newer schema".
        const r = runWith({ schemaIndex: [] });
        expect(r.stderr).toContain("could not complete");
        expect(r.status).toBe(2);
    });
});
