/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Everything advertised is callable, and everything callable is advertised.
 *
 * THE DEFECT THIS EXISTS FOR
 * --------------------------
 * Adding a meta-tool means editing two places that must agree: the `META_TOOLS` literal, which
 * feeds `tools/list`, and the dispatch chain in `handleCallTool`. Nothing checked that they did.
 *
 * A tool declared and not dispatched is **advertised and uncallable** -- the caller reads its
 * schema, calls it, and is told the tool does not exist. A tool dispatched and not declared is
 * **callable and invisible**, which is the inverse of this project's rule that listing must never
 * be stricter than dispatch. Both are silent: the registry's shadow check compares against
 * `META_TOOLS`, so it cannot see the dispatch chain at all.
 *
 * This is the shape the project keeps finding -- two sources of one truth and a check that reads
 * only one of them. `check:versions` was built for it, `registry-tool-docs` for it,
 * `tool-surface-figures` for it, and `index-growth` for it. The dispatch chain never had its
 * version.
 *
 * WHY THIS IS BEHAVIOURAL AND NOT SYNTACTIC
 * -----------------------------------------
 * The obvious implementation greps `if (name === "cyberchef_…")` and compares the set against the
 * literal. That was tried first and **fails on its first run against a tool that works**:
 * `cyberchef_analyse` has no top-level branch because it resolves inside the registry-tool block,
 * deliberately, so that a dispatched call and a direct call share one body. See F-01 in
 * `docs/internal/v4.2.0-findings-log.md`.
 *
 * Dispatch shapes differ for reasons and should be allowed to. So this asks the question the check
 * is actually for -- *can a caller use what we advertised?* -- by calling every advertised tool
 * through a real client and reading the answer. A gate whose first output is a false positive is a
 * gate people learn to override.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let createMcpServer;
let storeDir;

beforeAll(async () => {
    // The recipe store is resolved at MODULE LOAD, so the environment must be set before the
    // import -- the same ordering `in-process-handlers.test.mjs` documents. Without it the recipe
    // tools below write `recipes.json` into the repository root.
    storeDir = await mkdtemp(join(tmpdir(), "dispatch-table-"));
    process.env.CYBERCHEF_RECIPE_STORAGE = join(storeDir, "recipes.json");
    ({ createMcpServer } = await import("../../src/node/mcp-server.mjs"));
});

afterAll(async () => {
    if (storeDir) await rm(storeDir, { recursive: true, force: true });
});

/** @returns {Promise<{client: Object, close: Function}>} A connected in-process client. */
async function connected() {
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "dispatch-table", version: "1.0.0" }, { capabilities: {} });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return {
        client,
        async close() {
            await client.close();
            await server.close();
        }
    };
}

/**
 * Does this response mean "the tool you called does not exist"?
 *
 * Keyed to the ERROR CODE and the called name, not to loose wording. Observed through a client:
 *
 *     cyberchef_does_not_exist -> Error [UNSUPPORTED_OPERATION]: Operation '…' not found
 *     cyberchef_analyse {}     -> Error [INVALID_INPUT]: Unknown analysis tool: null …
 *
 * The distinction is the entire mechanism. The first says dispatch never reached a handler; the
 * second says it did and the handler rejected the arguments, which is a PASS for this gate.
 *
 * The first draft of this predicate matched `/Unknown analysis tool/` among others and therefore
 * flagged `cyberchef_analyse` -- a tool that works -- on its first run. That is the same false
 * positive F-01 records the syntactic version producing, arrived at from a different direction,
 * which is worth keeping as a comment: "unknown" appears in both answers and means opposite things.
 *
 * @param {string} text - The response text.
 * @param {string} name - The tool that was called.
 * @returns {boolean} True when the tool was never dispatched.
 */
function isUndispatched(text, name) {
    if (/UNSUPPORTED_OPERATION/.test(text)) return true;
    // Belt and braces: the message shape without the code, anchored on the called name so a
    // complaint about some OTHER name (a recipe step, say) is not misread as this tool missing.
    return new RegExp(`(Operation|Tool) '?${name}'? (not found|is unknown|does not exist)`, "i")
        .test(text);
}

describe("every advertised tool is callable", () => {
    it("dispatches every tool `tools/list` returns, on every surface", async () => {
        // DISCOVERED from the server, per surface. A hand-written list would have to be edited by
        // the same change that adds a tool, which is the change this gate exists to catch.
        const wrong = [];
        for (const surface of ["index", "curated", "all"]) {
            const previous = process.env.CYBERCHEF_TOOL_SURFACE;
            process.env.CYBERCHEF_TOOL_SURFACE = surface;
            const { client, close } = await connected();
            try {
                const { tools } = await client.listTools();
                expect(tools.length, `${surface} listed nothing`).toBeGreaterThan(0);

                for (const tool of tools) {
                    // Called with EMPTY arguments deliberately. Almost every tool rejects them,
                    // and the assertion is about WHICH rejection: a schema complaint proves the
                    // handler was reached, "unknown tool" proves it was not. The two are
                    // distinguishable, which is the whole mechanism here.
                    let res;
                    try {
                        res = await client.callTool({ name: tool.name, arguments: {} });
                    } catch (err) {
                        // A thrown protocol error is also "reached, then rejected" unless it says
                        // the tool is unknown.
                        res = { isError: true, content: [{ type: "text", text: String(err.message) }] };
                    }
                    const text = res.content?.[0]?.text ?? "";
                    if (isUndispatched(text, tool.name)) {
                        wrong.push(`${surface}: ${tool.name} is ADVERTISED but not dispatched -- ` +
                            `a caller reading its schema and calling it is told it does not exist`);
                    }
                }
            } finally {
                await close();
                if (previous === undefined) delete process.env.CYBERCHEF_TOOL_SURFACE;
                else process.env.CYBERCHEF_TOOL_SURFACE = previous;
            }
        }
        expect(wrong.join("\n")).toBe("");
    }, 300000);
});

describe("every callable meta-tool is advertised", () => {
    it("lists every meta-tool dispatch can actually run", async () => {
        // SYNTAX PROPOSES, BEHAVIOUR DECIDES, LISTING IS ASSERTED.
        //
        // The first version of this test read the `META_TOOLS` literal and compared it against
        // `tools/list`. That is CIRCULAR for this direction: deleting a declaration removes the
        // name from both sides at once, so the two still agree and the check passes. Proven by
        // deleting `cyberchef_quota_info`'s entry while leaving its dispatch branch -- the exact
        // "callable but invisible" defect -- and watching all three tests stay green.
        //
        // The fix needs a source of "what can run" that is INDEPENDENT of the declaration. The
        // dispatch chain is the only one, so it is scraped -- but only to propose CANDIDATES.
        // Whether a candidate really dispatches is then settled by calling it, which is what keeps
        // F-01's false positive from coming back: a name the scrape finds but that does not
        // actually dispatch simply drops out instead of failing the run.
        const { readFileSync } = await import("node:fs");
        const src = readFileSync(new URL("../../src/node/mcp-server.mjs", import.meta.url), "utf8");
        const candidates = new Set([
            ...[...src.matchAll(/if \(name === "(cyberchef_[a-z_]+)"/g)].map(m => m[1]),
            ...[...src.matchAll(/^\s{8}name: "(cyberchef_[a-z_]+)"/gm)].map(m => m[1])
        ]);

        // A pattern that matches NOTHING must fail rather than pass vacuously -- the failure mode
        // `check-version-consistency.mjs` was rewritten for.
        expect(candidates.size,
            "both candidate patterns matched nothing; this test has stopped checking"
        ).toBeGreaterThan(15);

        const { client, close } = await connected();
        try {
            const { tools } = await client.listTools();
            const listed = new Set(tools.map(t => t.name));

            const invisible = [];
            for (const name of candidates) {
                if (listed.has(name)) continue;
                // Not listed. Is it nonetheless callable? Empty arguments again: a schema
                // complaint means the handler ran, which means this tool is reachable and hidden.
                let text;
                try {
                    const res = await client.callTool({ name, arguments: {} });
                    text = res.content?.[0]?.text ?? "";
                } catch (err) {
                    text = String(err.message);
                }
                if (!isUndispatched(text, name)) {
                    invisible.push(`${name} dispatches but is absent from tools/list`);
                }
            }

            expect(invisible.join("\n"),
                "A tool that dispatch can run and the listing hides is misinformation, not " +
                "caution -- the inverse of this project's rule that listing must never be " +
                "stricter than dispatch."
            ).toBe("");
        } finally {
            await close();
        }
    }, 180000);

    it("keeps cyberchef_magic on every surface, which neither list covers", async () => {
        // The THIRD case, and the one a two-way check cannot see. `cyberchef_magic` is an entry in
        // OperationConfig dispatched through the operation path, pinned into every surface because
        // it is the entry point for unknown data -- making it three calls deep would invert its
        // cost. It is in neither the META_TOOLS literal nor a meta-tool dispatch branch, so a gate
        // built only on those two would either miss it or report the most important navigation
        // tool on the surface as an orphan.
        for (const surface of ["index", "curated", "all"]) {
            const previous = process.env.CYBERCHEF_TOOL_SURFACE;
            process.env.CYBERCHEF_TOOL_SURFACE = surface;
            const { client, close } = await connected();
            try {
                const { tools } = await client.listTools();
                expect(tools.map(t => t.name), `surface ${surface}`).toContain("cyberchef_magic");
            } finally {
                await close();
                if (previous === undefined) delete process.env.CYBERCHEF_TOOL_SURFACE;
                else process.env.CYBERCHEF_TOOL_SURFACE = previous;
            }
        }
    }, 180000);
});
