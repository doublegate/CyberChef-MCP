/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The `cyberchef-migrate` CLI.
 *
 * `docs/v2.0.0-breaking-changes.md` has told readers to run this command since **v1.8.0** and it
 * did not exist until v2.2.0 -- only the two MCP tools were ever built, and those are reachable
 * only from inside a session, which is no use to someone with a directory of recipe files.
 *
 * The tests that matter most here are the destructive ones. A migration tool rewrites files people
 * cannot regenerate, so "keeps a backup" and "refuses to overwrite that backup" are the properties
 * worth pinning; everything else is reporting.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(process.cwd(), "src/node/cli/migrate.mjs");
const LEGACY = JSON.stringify([{ op: "From Base64", args: ["A-Za-z0-9+/=", true] }]);
const MODERN = JSON.stringify({ name: "m", operations: [{ op: "To Hex", args: { delimiter: "Space" } }] });

let dir;

/**
 * Run the CLI, capturing output and exit status rather than throwing on a non-zero exit.
 *
 * The exit status is part of this tool's contract -- it is what makes it usable as a pre-upgrade
 * check in a pipeline -- so a helper that threw on non-zero would hide the thing under test.
 *
 * @param {string[]} args - CLI arguments.
 * @param {string} [stdin] - Optional stdin.
 * @returns {{status: number, stdout: string, stderr: string}} The result.
 */
function run(args, stdin) {
    try {
        const stdout = execFileSync(process.execPath, [CLI, ...args], {
            encoding: "utf8", input: stdin, stdio: ["pipe", "pipe", "pipe"]
        });
        return { status: 0, stdout, stderr: "" };
    } catch (err) {
        return { status: err.status, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
    }
}

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cyberchef-migrate-"));
});

// afterEACH, not afterAll: `beforeEach` mints a new directory per test, so an `afterAll` removed
// only the last one and left the rest in the system temp directory after every run.
afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
});

/**
 * Write a recipe fixture.
 *
 * @param {string} name - File name.
 * @param {string} contents - JSON text.
 * @returns {string} The path.
 */
function fixture(name, contents) {
    const path = join(dir, name);
    writeFileSync(path, contents);
    return path;
}

describe("cyberchef-migrate: reporting", () => {
    it("reports a legacy array recipe as needing changes, and exits non-zero", () => {
        // Non-zero without --write is the point: it lets the command gate an upgrade.
        const res = run([fixture("legacy.json", LEGACY)]);
        expect(res.status).toBe(1);
        expect(res.stdout).toMatch(/CHANGES/);
        expect(res.stdout).toMatch(/Recipe passed as array instead of object/);
    });

    it("does NOT call a legacy recipe compatible just because nothing is breaking", () => {
        // The defect this pins. `compatible` means "no BREAKING issues", and every legacy format
        // this tool converts is a `warning`. Keying the report off `compatible` announced
        // "already v2-compatible" for a recipe it was about to rewrite.
        const res = run([fixture("legacy.json", LEGACY)]);
        expect(res.stdout).not.toMatch(/already v2-compatible|clean/);
    });

    it("reports a v2 recipe as clean, and exits zero", () => {
        const res = run([fixture("modern.json", MODERN)]);
        expect(res.status).toBe(0);
        expect(res.stdout).toMatch(/clean/);
    });

    it("converts to stdout without touching the file", () => {
        const path = fixture("legacy.json", LEGACY);
        const res = run(["--stdout", path]);
        expect(JSON.parse(res.stdout).operations[0].op).toBe("From Base64");
        expect(readFileSync(path, "utf8")).toBe(LEGACY);
    });

    it("reads a recipe from stdin", () => {
        const res = run(["-"], LEGACY);
        expect(res.stdout).toMatch(/<stdin>/);
    });

    it("emits a machine-readable report", () => {
        const parsed = JSON.parse(run(["--json", fixture("legacy.json", LEGACY)]).stdout);
        expect(parsed.results).toHaveLength(1);
        expect(parsed.results[0].issues.length).toBeGreaterThan(0);
    });
});

describe("cyberchef-migrate: writing, which is the part that can lose data", () => {
    it("keeps the original in a .bak before rewriting", () => {
        const path = fixture("legacy.json", LEGACY);
        const res = run(["--write", path]);
        expect(res.status).toBe(0);
        expect(readFileSync(`${path}.bak`, "utf8")).toBe(LEGACY);
        expect(JSON.parse(readFileSync(path, "utf8")).operations).toBeDefined();
    });

    it("refuses to overwrite an existing .bak", () => {
        // Without this, a second run replaces the backup with the ALREADY-MIGRATED file, and the
        // original is gone. The tool would then have destroyed the only copy of what it converted.
        const path = fixture("legacy.json", LEGACY);
        writeFileSync(`${path}.bak`, "an earlier backup");
        const res = run(["--write", path]);
        expect(res.status).toBe(1);
        expect(res.stderr).toMatch(/not overwriting it/);
        expect(readFileSync(`${path}.bak`, "utf8")).toBe("an earlier backup");
        expect(readFileSync(path, "utf8")).toBe(LEGACY);
    });

    it("overwrites the .bak only when forced", () => {
        const path = fixture("legacy.json", LEGACY);
        writeFileSync(`${path}.bak`, "an earlier backup");
        expect(run(["--write", "--force", path]).status).toBe(0);
        expect(readFileSync(`${path}.bak`, "utf8")).toBe(LEGACY);
    });

    it("leaves an already-clean file completely alone", () => {
        const path = fixture("modern.json", MODERN);
        expect(run(["--write", path]).status).toBe(0);
        expect(readFileSync(path, "utf8")).toBe(MODERN);
        expect(existsSync(`${path}.bak`)).toBe(false);
    });

    it("refuses to --write stdin", () => {
        const res = run(["--write", "-"], LEGACY);
        expect(res.status).toBe(1);
        expect(res.stderr).toMatch(/cannot --write stdin/);
    });
});

describe("cyberchef-migrate: usage", () => {
    it("prints help and the version", () => {
        expect(run(["--help"]).stdout).toMatch(/USAGE/);
        expect(run(["--version"]).stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("rejects an unknown option and no input, with status 2", () => {
        expect(run(["--nonsense", "x.json"]).status).toBe(2);
        expect(run([]).status).toBe(2);
    });

    it("reports an unreadable file rather than crashing", () => {
        const res = run([join(dir, "missing.json")]);
        expect(res.status).toBe(1);
        expect(res.stderr).toMatch(/ERROR/);
    });

    it("reports malformed JSON as an error, not as a compatible recipe", () => {
        const res = run([fixture("bad.json", "{not json")]);
        expect(res.status).toBe(1);
        expect(res.stderr).toMatch(/ERROR/);
    });
});
