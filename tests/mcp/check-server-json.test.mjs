/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * `scripts/check-server-json.mjs`, against documents it must reject.
 *
 * A gate is only worth what it fails on. This one was added in v3.4.0 after `server.json` turned
 * out never to have been validated by anything, and review then found it was itself checking less
 * than it appeared to: field PRESENCE only, so `"transport": "stdio"` — a string where the schema
 * requires an object — passed, and a non-string `version` skipped its own length check while the
 * run still printed "server.json validates".
 *
 * So the fixtures below are the malformed documents, not the good one. The good one is covered by
 * `npm run check:server-json` in CI on every push and pull request; what needs a test is that the
 * checker actually says no.
 *
 * The script reads a fixed path and exits, so each case runs it as a child process against a
 * temporary directory laid out the way it expects: `server.json`, `package.json` and
 * `Dockerfile.mcp` beside a copy of the script.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const SCRIPT = resolve(ROOT, "scripts/check-server-json.mjs");
const SCHEMA = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const NAME = "io.github.doublegate/cyberchef-mcp";

/** A document that passes, as the starting point every case mutates. */
const VALID = {
    $schema: SCHEMA,
    name: NAME,
    description: "A short description well under the hundred-character limit.",
    version: "9.9.9",
    repository: { url: "https://github.com/doublegate/CyberChef-MCP", source: "github" },
    packages: [
        { registryType: "oci", registryBaseUrl: "https://ghcr.io", identifier: "doublegate/x", version: "9.9.9", transport: { type: "stdio" } }
    ]
};

let dir;

/**
 * Run the checker against one document.
 *
 * @param {Object} doc - The `server.json` content.
 * @param {Object} [extra] - Overrides for `mcpName` and the Dockerfile annotation.
 * @returns {{code: number, out: string}} Exit code and combined output.
 */
function run(doc, extra = {}) {
    writeFileSync(join(dir, "server.json"), JSON.stringify(doc, null, 2));
    writeFileSync(join(dir, "package.json"),
        JSON.stringify({ name: "x", mcpName: extra.mcpName ?? NAME }, null, 2));
    writeFileSync(join(dir, "Dockerfile.mcp"),
        `LABEL io.modelcontextprotocol.server.name="${extra.label ?? NAME}"\n`);
    try {
        const out = execFileSync(process.execPath, [join(dir, "scripts/check-server-json.mjs")],
            { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        return { code: 0, out };
    } catch (error) {
        return { code: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
    }
}

/** @returns {Object} A deep-enough copy of the valid document. */
const clone = () => JSON.parse(JSON.stringify(VALID));

describe("check-server-json", () => {
    beforeAll(() => {
        dir = mkdtempSync(join(tmpdir(), "cyberchef-serverjson-"));
        mkdirSync(join(dir, "scripts"));
        copyFileSync(SCRIPT, join(dir, "scripts/check-server-json.mjs"));
    });

    afterAll(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it("accepts a well-formed document", () => {
        const { code, out } = run(VALID);
        expect(out).toContain("server.json validates");
        expect(code).toBe(0);
    });

    it("rejects a transport that is a string rather than an object", () => {
        // The headline. Presence-only checking passed this, and it is a document the registry
        // rejects.
        const doc = clone();
        doc.packages[0].transport = "stdio";
        const { code, out } = run(doc);
        expect(code).toBe(1);
        expect(out).toContain("transport (object)");
    });

    it("rejects a transport naming a type the spec does not define", () => {
        const doc = clone();
        doc.packages[0].transport = { type: "websocket" };
        const { code, out } = run(doc);
        expect(code).toBe(1);
        expect(out).toContain("transport.type");
    });

    it("rejects an sse transport with no url", () => {
        // Different transport types are different schemas; `sse` and `streamable-http` require a
        // url that `stdio` does not.
        const doc = clone();
        doc.packages[0].transport = { type: "sse" };
        const { code, out } = run(doc);
        expect(code).toBe(1);
        expect(out).toContain("transport.url");
    });

    it("rejects a non-string version instead of skipping its length check", () => {
        const doc = clone();
        doc.version = 9.9;
        const { code, out } = run(doc);
        expect(code).toBe(1);
        expect(out).toContain("version is a string");
    });

    it("rejects a description over the hundred-character limit", () => {
        // The error the real file actually had.
        const doc = clone();
        doc.description = "x".repeat(101);
        const { code, out } = run(doc);
        expect(code).toBe(1);
        expect(out).toContain("description length");
    });

    it("names the older schema's spelling rather than calling it an unknown key", () => {
        const doc = clone();
        delete doc.packages[0].registryType;
        // A computed key. The point of this case is a property name that is deliberately NOT
        // camelCase, and the linter's `camelcase` and `dot-notation` rules each reject one of the
        // two literal spellings — so the name goes through a variable instead of arguing with them.
        const supersededKey = "registry_type";
        doc.packages[0][supersededKey] = "oci";
        const { code, out } = run(doc);
        expect(code).toBe(1);
        expect(out).toContain("superseded spelling");
    });

    it("refuses a schema version whose rules it does not carry", () => {
        // The design decision that matters most: the rules are transcribed from one schema
        // version, so a document declaring another must FAIL rather than be checked against rules
        // it was not written to. The version used here is the one this repository declared until
        // v3.5.0 -- a real, still-resolvable schema, which is the case that matters: an obviously
        // bogus URL would fail for the wrong reason.
        const doc = clone();
        doc.$schema = "https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json";
        const { code, out } = run(doc);
        expect(code).toBe(1);
        expect(out).toContain("does not know");
    });

    it("accepts a package with no version, which 2025-12-11 made optional", () => {
        // The one behaviour change in the migration. Until 2025-12-11 `version` was in
        // `Package.required`; it is now optional, because an MCPB package carries its version in
        // the download URL. A checker STRICTER than the schema rejects documents the registry
        // accepts, which is its own kind of wrong answer.
        const doc = clone();
        delete doc.packages[0].version;
        const { code, out } = run(doc);
        expect(out).toContain("server.json validates");
        expect(code).toBe(0);
    });

    it("still rejects a package version that is present but not a string", () => {
        // Optional does not mean unconstrained.
        const doc = clone();
        doc.packages[0].version = 9;
        const { code, out } = run(doc);
        expect(code).toBe(1);
        expect(out).toContain("version (optional, string)");
    });

    it("rejects a mismatched npm ownership proof", () => {
        const { code, out } = run(VALID, { mcpName: "io.github.someone-else/cyberchef-mcp" });
        expect(code).toBe(1);
        expect(out).toContain("mcpName");
    });

    it("rejects a missing OCI ownership annotation", () => {
        const { code, out } = run(VALID, { label: "" });
        expect(code).toBe(1);
        expect(out).toContain("registry annotation");
    });

    it("keeps the encoded schema URL in step with the committed server.json", () => {
        // The transcription's one weakness is going stale, and the guard against that only works
        // if the two agree today.
        const script = readFileSync(SCRIPT, "utf8");
        const committed = JSON.parse(readFileSync(resolve(ROOT, "server.json"), "utf8"));
        expect(script).toContain(committed.$schema);
    });
});
