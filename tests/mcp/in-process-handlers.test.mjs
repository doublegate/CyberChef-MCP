/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The request handlers, driven in-process by a real MCP client.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `handler-dispatch.test.mjs` opens by declaring it "Tests all handler branches in the CallTool
 * request handler". It does not. It imports thirty-odd helpers re-exported from `mcp-server.mjs`
 * and asserts on those; `createMcpServer()` is never called, and until this file was written
 * **no test in the suite invoked a request handler in-process at all**.
 *
 * That had two consequences, and the second is what actually hurt:
 *
 *   1. Coverage of `mcp-server.mjs` read 14.51% -- 46 of 309 statements. The whole tool-call
 *      handler (lines ~466-1090) counted as dead. The v2.1.0 merge added 252 lines to that file
 *      and pushed all four global thresholds under, which is how the coverage gate went red on
 *      `master` while every one of the 805 tests passed.
 *   2. The handlers were only ever exercised through a SPAWNED SERVER -- `stdio-client-contract`
 *      and the `examples/` scripts. Those are real tests and they catch real defects, but v8
 *      attributes nothing a child process does to the parent, so the modules they cover most
 *      thoroughly (`tool-catalog.mjs` read 2.17%) looked untested. "Tested but not measurably
 *      tested" is indistinguishable from "untested" to a threshold gate, and it hid the drop.
 *
 * The fix is not to lower the gate or to mock the handlers. `InMemoryTransport.createLinkedPair()`
 * connects a real `Client` to a real server object in ONE process, so these are genuine protocol
 * round trips -- request validation, dispatch, and response shape all real -- and the coverage is
 * attributed where it belongs.
 *
 * Every branch of the tool-call dispatch is reached from here, including the failure paths, which
 * is the part that had never been asserted anywhere.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

/**
 * Recipe storage resolves `CYBERCHEF_RECIPE_STORAGE` at MODULE LOAD, into a `const`. Setting it
 * after the import would be ignored and the recipe tests below would write `./recipes.json` into
 * the repository root. Hence the dynamic import: env first, module second.
 */
let createMcpServer;
let storageDir;

beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "cyberchef-mcp-handlers-"));
    process.env.CYBERCHEF_RECIPE_STORAGE = join(storageDir, "recipes.json");
    process.env.CYBERCHEF_RECIPE_BACKUP = "false";
    ({ createMcpServer } = await import("../../src/node/mcp-server.mjs"));
});

afterAll(async () => {
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
});

/**
 * A connected client/server pair sharing this process.
 *
 * @returns {Promise<{client: Client, close: Function}>} The client and its teardown.
 */
async function connected() {
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "in-process-test", version: "1.0.0" }, { capabilities: {} });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return {
        client,
        /** @returns {Promise<void>} Closes both ends. */
        async close() {
            await client.close();
            await server.close();
        }
    };
}

/**
 * Call a tool and return its first text content block.
 *
 * @param {Client} client - The connected client.
 * @param {string} name - Tool name.
 * @param {Object} args - Tool arguments.
 * @returns {Promise<string>} The text payload.
 */
async function callText(client, name, args = {}) {
    const res = await client.callTool({ name, arguments: args });
    return res.content?.[0]?.text ?? "";
}

/**
 * Call a tool and JSON-parse its text payload.
 *
 * @param {Client} client - The connected client.
 * @param {string} name - Tool name.
 * @param {Object} args - Tool arguments.
 * @returns {Promise<*>} The parsed payload.
 */
async function callJson(client, name, args = {}) {
    return JSON.parse(await callText(client, name, args));
}

describe("in-process handlers: tools/list", () => {
    it("lists tools whose schemas are structurally valid", async () => {
        const { client, close } = await connected();
        try {
            const { tools } = await client.listTools();
            expect(tools.length).toBeGreaterThan(0);

            // The v2.1.0 defect in one assertion: a schema that is merely present is not a schema.
            // `zod-to-json-schema@3` emitted a bare {"$schema": ...} envelope for 524 tools across
            // three releases, and every raw-JSON-RPC test accepted it.
            for (const tool of tools) {
                expect(tool.inputSchema, tool.name).toBeDefined();
                expect(tool.inputSchema.type, tool.name).toBe("object");
                expect(tool.description, tool.name).toBeTruthy();
            }
        } finally {
            await close();
        }
    });

    it("advertises BOTH argument forms for a recipe step (F-09)", async () => {
        const { client, close } = await connected();
        try {
            // This declared `type: "array"` only -- positional -- while the implementation has
            // accepted NAMED arguments since DEP005, and named arguments are the entire reason a
            // model can use these operations correctly. A client that validates outbound arguments
            // against `inputSchema` therefore could not send the supported form at all, and
            // `cyberchef_recipe_create` disagreed two tools away by declaring an object.
            const { tools } = await client.listTools();
            const args = tools.find(t => t.name === "cyberchef_bake")
                .inputSchema.properties.recipe.items.properties.args;

            const kinds = (args.anyOf || []).map(s => s.type).sort();
            expect(kinds).toEqual(["array", "object"]);
        } finally {
            await close();
        }
    });

    it("runs a recipe step given named, positional or absent arguments", async () => {
        const { client, close } = await connected();
        try {
            const named = await callText(client, "cyberchef_bake", {
                input: "Hello", recipe: [{ op: "To Base64", args: { alphabet: "A-Za-z0-9+/=" } }]
            });
            const positional = await callText(client, "cyberchef_bake", {
                input: "Hello", recipe: [{ op: "To Base64", args: ["A-Za-z0-9+/="] }]
            });
            const omitted = await callText(client, "cyberchef_bake", {
                input: "Hello", recipe: [{ op: "To Base64" }]
            });
            expect(named).toBe("SGVsbG8=");
            expect(positional).toBe(named);
            expect(omitted).toBe(named);
        } finally {
            await close();
        }
    });

    it("declares outputSchema only where this server defines the shape", async () => {
        const { client, close } = await connected();
        try {
            const { tools } = await client.listTools();
            const withSchema = tools.filter(t => t.outputSchema).map(t => t.name).sort();

            // The 504 operations deliberately have none: their output is whatever CyberChef
            // returns, undocumented and varying per operation, so a schema would be a claim
            // rather than a contract -- and a wrong one makes the SDK reject valid results.
            expect(withSchema).toEqual(["cyberchef_categories", "cyberchef_list_operations"]);
        } finally {
            await close();
        }
    });

    it("returns structuredContent that satisfies the declared schema", async () => {
        const { client, close } = await connected();
        try {
            // The SDK validates structuredContent against outputSchema, so a mismatch throws
            // here rather than reaching a caller.
            const cats = await client.callTool({ name: "cyberchef_categories", arguments: {} });
            expect(cats.structuredContent.categories.length).toBeGreaterThan(0);
            expect(typeof cats.structuredContent.totalOperations).toBe("number");

            // `content` must remain, for clients that do not read structured results.
            expect(cats.content[0].text).toBeTruthy();
            expect(JSON.parse(cats.content[0].text)).toEqual(cats.structuredContent);

            const listed = await client.callTool({
                name: "cyberchef_list_operations", arguments: { category: "Compression" }
            });
            expect(listed.structuredContent.category).toBe("Compression");
            expect(listed.structuredContent.operations.length).toBeGreaterThan(0);
        } finally {
            await close();
        }
    });

    it("exposes the navigation index and the executor", async () => {
        const { client, close } = await connected();
        try {
            const names = (await client.listTools()).tools.map(t => t.name);
            for (const required of [
                "cyberchef_bake",
                "cyberchef_search",
                "cyberchef_categories",
                "cyberchef_list_operations",
                "cyberchef_describe_operation",
                "cyberchef_magic"
            ]) expect(names, required).toContain(required);
        } finally {
            await close();
        }
    });
});

describe("in-process handlers: bake and search", () => {
    it("bakes a recipe and returns decoded text, not character codes", async () => {
        const { client, close } = await connected();
        try {
            // The v2.1.0 dish-output defect: this used to come back as
            // [72,101,108,108,111,44,32,67,104,101,102,33].
            const text = await callText(client, "cyberchef_bake", {
                input: "SGVsbG8sIENoZWYh",
                recipe: [{ op: "From Base64" }]
            });
            expect(text).toBe("Hello, Chef!");
        } finally {
            await close();
        }
    });

    it("runs a flow-control operation, which NodeRecipe refuses outright", async () => {
        const { client, close } = await connected();
        try {
            const text = await callText(client, "cyberchef_bake", {
                input: "aGVsbG8=",
                recipe: [{ op: "Magic", args: { depth: 1 } }]
            });
            expect(text.length).toBeGreaterThan(0);
        } finally {
            await close();
        }
    });

    it("searches operations by keyword", async () => {
        const { client, close } = await connected();
        try {
            const results = await callJson(client, "cyberchef_search", { query: "base64" });
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
        } finally {
            await close();
        }
    });

    // The input ceiling is deliberately NOT asserted through a round trip. MAX_INPUT_SIZE is
    // 100 MB, so proving the limit that way means allocating a >100 MB string and then watching
    // the server correctly base64-encode it -- minutes of work to test one comparison. The
    // boundary itself is unit-tested in tool-schema.test.mjs, where it costs nothing.
});

describe("in-process handlers: the navigation hierarchy", () => {
    it("returns the category index", async () => {
        const { client, close } = await connected();
        try {
            const index = await callJson(client, "cyberchef_categories");
            expect(index.categories.length).toBeGreaterThan(0);
            expect(index.totalOperations).toBeGreaterThan(500);
            expect(index.categories[0]).toHaveProperty("examples");
        } finally {
            await close();
        }
    });

    it("lists the operations in a category", async () => {
        const { client, close } = await connected();
        try {
            const listing = await callJson(client, "cyberchef_list_operations", {
                category: "Data format"
            });
            expect(listing.category).toBe("Data format");
            expect(listing.operations.length).toBeGreaterThan(0);
            expect(listing.operations[0]).toHaveProperty("summary");
        } finally {
            await close();
        }
    });

    it("matches a category case-insensitively", async () => {
        const { client, close } = await connected();
        try {
            const listing = await callJson(client, "cyberchef_list_operations", {
                category: "dATa foRMat"
            });
            expect(listing.category).toBe("Data format");
        } finally {
            await close();
        }
    });

    it("reports an unknown category as a structured error naming the valid ones", async () => {
        const { client, close } = await connected();
        try {
            const res = await client.callTool({
                name: "cyberchef_list_operations",
                arguments: { category: "Nonexistent" }
            });
            expect(res.isError).toBe(true);
            expect(res.content[0].text).toMatch(/Available:/);
        } finally {
            await close();
        }
    });

    it("describes operations, including the argument schema", async () => {
        const { client, close } = await connected();
        try {
            const described = await callJson(client, "cyberchef_describe_operation", {
                operations: ["AES Encrypt", "To Base64"]
            });
            expect(described.operations).toHaveLength(2);
            const aes = described.operations[0];
            expect(aes.operation).toBe("AES Encrypt");
            expect(aes.args.length).toBeGreaterThan(0);
            // The toggleString shape that made all 63 key-taking operations uncallable.
            const key = aes.args.find(a => a.name === "key");
            expect(key.shape).toBe("string, or {string, option}");
        } finally {
            await close();
        }
    });

    it("reports an unknown operation without failing the whole call", async () => {
        const { client, close } = await connected();
        try {
            const described = await callJson(client, "cyberchef_describe_operation", {
                operations: ["Not A Real Operation"]
            });
            expect(described.operations[0].error).toMatch(/No such operation/);
        } finally {
            await close();
        }
    });

    it("names the missing argument instead of describing nothing", async () => {
        // ADDED IN v3.1.0. `operations` is required and nothing enforced it, so a call using the
        // singular `operation` -- the tool's own name, and the spelling this repository's prose
        // uses -- reached `describeOperations(undefined)` and answered "No such operation" for an
        // operation named `""`, with `isError` unset. Findings log F-05.
        //
        // There is a sibling of this test in `tool-surface.test.mjs` that drives a SPAWNED server
        // through a real client. It proves the behaviour and contributes NO coverage: v8 does not
        // instrument the child process, so the guard read as four uncovered lines until this
        // in-process case existed. Both are kept -- the spawned one proves it over the wire, this
        // one measures it -- and the asymmetry is worth knowing before chasing a patch-coverage
        // failure for code a passing test already exercises.
        const { client, close } = await connected();
        try {
            const wrong = await client.callTool({
                name: "cyberchef_describe_operation", arguments: { operation: "To Base64" }
            });

            expect(wrong.isError).toBe(true);
            expect(wrong.content[0].text).toMatch(/requires `operations`/);
            expect(wrong.content[0].text).not.toMatch(/No such operation/);

            // Null is the other way to arrive with nothing, and it takes the same branch.
            const nulled = await client.callTool({
                name: "cyberchef_describe_operation", arguments: { operations: null }
            });
            expect(nulled.isError).toBe(true);

            // ...and `arguments` omitted ENTIRELY, which the MCP schema permits. Review caught
            // this: the guard read `args.operations` on an `args` that forty call sites assumed
            // was always an object, so omitting it threw and leaked
            // `OPERATION_FAILED: Cannot read properties of undefined` as the tool result -- a
            // worse error than the one the guard was added to fix.
            const absent = await client.callTool({ name: "cyberchef_describe_operation" });
            expect(absent.isError).toBe(true);
            expect(absent.content[0].text).toMatch(/requires `operations`/);
            expect(absent.content[0].text).not.toMatch(/Cannot read properties/);
        } finally {
            await close();
        }
    });
});

describe("in-process handlers: recipe management", () => {
    it("round-trips a recipe through create, get, list, update, execute, export and delete", async () => {
        const { client, close } = await connected();
        try {
            const created = await callJson(client, "cyberchef_recipe_create", {
                name: "b64-roundtrip",
                description: "encode then decode",
                operations: [{ op: "To Base64" }]
            });
            expect(created.id).toBeTruthy();

            const fetched = await callJson(client, "cyberchef_recipe_get", { id: created.id });
            expect(fetched.name).toBe("b64-roundtrip");

            const listed = await callJson(client, "cyberchef_recipe_list", {});
            expect(listed.recipes?.length ?? listed.length).toBeGreaterThan(0);

            const updated = await callJson(client, "cyberchef_recipe_update", {
                id: created.id,
                description: "updated description"
            });
            expect(updated.description).toBe("updated description");

            const executed = await callText(client, "cyberchef_recipe_execute", {
                id: created.id,
                input: "Hello"
            });
            expect(executed).toBe("SGVsbG8=");

            const exported = await callText(client, "cyberchef_recipe_export", {
                id: created.id,
                format: "json"
            });
            expect(exported.length).toBeGreaterThan(0);

            const imported = await callJson(client, "cyberchef_recipe_import", {
                data: exported,
                format: "json"
            });
            expect(imported.id).toBeTruthy();

            const deleted = await callJson(client, "cyberchef_recipe_delete", { id: created.id });
            expect(deleted.success).toBe(true);
        } finally {
            await close();
        }
    });

    it("validates and tests a saved recipe", async () => {
        const { client, close } = await connected();
        try {
            // Both tools require a COMPLETE recipe -- `id` and `version` included -- so the
            // subject has to be created first. That is recorded as a defect (F-02 in
            // docs/internal/v2.2.0-findings-log.md): `id` and `version` are server-assigned, so
            // neither tool can check a draft, which is when checking is most useful. These
            // assertions pin the behaviour as it currently stands; they change when F-02 does.
            const saved = await callJson(client, "cyberchef_recipe_create", {
                name: "validate-subject",
                operations: [{ op: "To Base64" }]
            });

            const validated = await callJson(client, "cyberchef_recipe_validate", { recipe: saved });
            expect(validated.valid).toBe(true);
            expect(validated.operationCount).toBe(1);

            const tested = await callJson(client, "cyberchef_recipe_test", {
                recipe: saved,
                testInputs: ["Hello"]
            });
            expect(tested).toBeTruthy();

            await callJson(client, "cyberchef_recipe_delete", { id: saved.id });
        } finally {
            await close();
        }
    });

    it("validates and tests a DRAFT recipe, with no server-assigned fields (F-02)", async () => {
        const { client, close } = await connected();
        try {
            // `id`, `version`, `created` and `updated` are assigned by the server when a recipe is
            // stored. Requiring them here made "check this before I save it" -- the only
            // interesting use of a validate tool -- impossible: it failed with
            // `expected string, received undefined` on two values only the server can supply.
            const draft = { name: "draft", operations: [{ op: "To Base64" }] };

            const validated = await callJson(client, "cyberchef_recipe_validate", { recipe: draft });
            expect(validated.valid).toBe(true);
            expect(validated.operationCount).toBe(1);

            const tested = await callJson(client, "cyberchef_recipe_test", {
                recipe: draft,
                testInputs: ["Hello"]
            });
            expect(tested.passed).toBe(1);
            expect(tested.results[0].output).toBe("SGVsbG8=");
        } finally {
            await close();
        }
    });

    it("still rejects a draft that is genuinely wrong", async () => {
        const { client, close } = await connected();
        try {
            // Relaxing the server-assigned fields must not relax what actually decides whether a
            // recipe is correct: the operation names, their arguments, and a non-empty list.
            const badOp = await callJson(client, "cyberchef_recipe_validate", {
                recipe: { name: "b", operations: [{ op: "Nope" }] }
            });
            expect(badOp.valid).toBe(false);
            expect(badOp.error).toMatch(/Invalid operation name/);

            const empty = await callJson(client, "cyberchef_recipe_validate", {
                recipe: { name: "e", operations: [] }
            });
            expect(empty.valid).toBe(false);
        } finally {
            await close();
        }
    });
});

describe("in-process handlers: subsystem tools", () => {
    it("runs a batch and reports per-item results", async () => {
        const { client, close } = await connected();
        try {
            const result = await callJson(client, "cyberchef_batch", {
                operations: [
                    { tool: "cyberchef_to_base64", arguments: { input: "one" } },
                    { tool: "cyberchef_to_base64", arguments: { input: "two" } }
                ],
                mode: "parallel"
            });
            expect(result.results ?? result).toBeTruthy();
        } finally {
            await close();
        }
    });

    it("exports telemetry in both shapes", async () => {
        const { client, close } = await connected();
        try {
            expect(await callJson(client, "cyberchef_telemetry_export", {})).toBeTruthy();
            expect(await callJson(client, "cyberchef_telemetry_export", { format: "summary" })).toBeTruthy();
        } finally {
            await close();
        }
    });

    it("reports and clears the cache", async () => {
        const { client, close } = await connected();
        try {
            expect(await callJson(client, "cyberchef_cache_stats")).toHaveProperty("size");
            expect((await callJson(client, "cyberchef_cache_clear")).success).toBe(true);
        } finally {
            await close();
        }
    });

    it("reports quota and rate-limit state together", async () => {
        const { client, close } = await connected();
        try {
            const info = await callJson(client, "cyberchef_quota_info");
            expect(info).toHaveProperty("quota");
            expect(info).toHaveProperty("rateLimit");
        } finally {
            await close();
        }
    });

    it("previews a migration in both modes and rejects a third", async () => {
        const { client, close } = await connected();
        try {
            const recipe = [{ op: "To Base64", args: [] }];
            expect(await callJson(client, "cyberchef_migration_preview", { recipe })).toBeTruthy();

            const transformed = await callJson(client, "cyberchef_migration_preview", {
                recipe, mode: "transform"
            });
            expect(transformed).toHaveProperty("transformed");

            const bad = await client.callTool({
                name: "cyberchef_migration_preview",
                arguments: { recipe, mode: "nonsense" }
            });
            expect(bad.isError).toBe(true);
        } finally {
            await close();
        }
    });

    it("reports deprecation and worker-pool state", async () => {
        const { client, close } = await connected();
        try {
            expect(await callJson(client, "cyberchef_deprecation_stats")).toBeTruthy();
            expect(await callJson(client, "cyberchef_worker_stats")).toHaveProperty("enabled");
        } finally {
            await close();
        }
    });
});

describe("in-process handlers: operation tools and failure paths", () => {
    it("runs an operation tool directly", async () => {
        const { client, close } = await connected();
        try {
            expect(await callText(client, "cyberchef_to_base64", { input: "Hello" })).toBe("SGVsbG8=");
        } finally {
            await close();
        }
    });

    it("accepts a toggleString key as a bare string and as {string, option}", async () => {
        const { client, close } = await connected();
        try {
            const bare = await callText(client, "cyberchef_aes_encrypt", {
                input: "Hello",
                key: "00112233445566778899aabbccddeeff",
                iv: "00000000000000000000000000000000",
                mode: "CBC",
                "input_arg": "Raw",
                output: "Hex"
            });
            expect(bare).toMatch(/^[0-9a-f]+$/);

            const structured = await callText(client, "cyberchef_aes_encrypt", {
                input: "Hello",
                key: { string: "00112233445566778899aabbccddeeff", option: "Hex" },
                iv: { string: "00000000000000000000000000000000", option: "Hex" },
                mode: "CBC",
                "input_arg": "Raw",
                output: "Hex"
            });
            expect(structured).toBe(bare);
        } finally {
            await close();
        }
    });

    it("returns a structured error for an unknown tool", async () => {
        const { client, close } = await connected();
        try {
            const res = await client.callTool({
                name: "cyberchef_definitely_not_an_operation",
                arguments: { input: "x" }
            });
            expect(res.isError).toBe(true);
        } finally {
            await close();
        }
    });

    it("returns a structured error for a tool outside the namespace", async () => {
        const { client, close } = await connected();
        try {
            const res = await client.callTool({ name: "not_cyberchef_at_all", arguments: {} });
            expect(res.isError).toBe(true);
        } finally {
            await close();
        }
    });

    it("surfaces an operation failure as an error, not a silent wrong answer", async () => {
        const { client, close } = await connected();
        try {
            const res = await client.callTool({
                name: "cyberchef_bake",
                arguments: { input: "x", recipe: [{ op: "No Such Operation" }] }
            });
            expect(res.isError).toBe(true);
        } finally {
            await close();
        }
    });
});
