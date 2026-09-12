/**
 * Call every meta-tool through a real client and dump the answers, so two builds can be diffed.
 *
 * This is the instrument the v4.2.0 charter asks for by name: "the full meta-tool surface, called
 * through a real client, before and after -- same answers". A names-only parity check cannot see a
 * tool that still answers but answers DIFFERENTLY, which is exactly what folding `recipe_execute`
 * and `recipe_export` into the dispatch table did.
 *
 * Volatile fields (ids, timestamps, durations, counters) are normalised, because a diff that is
 * never clean is a diff nobody reads.
 *
 *     node meta-tool-answers.mjs /abs/path/to/mcp-server.mjs > answers.json
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [modulePath] = process.argv.slice(2);
if (!modulePath) {
    console.error("usage: node meta-tool-answers.mjs <abs-path-to-mcp-server.mjs>");
    process.exit(2);
}

const storeDir = mkdtempSync(join(tmpdir(), "meta-tool-answers-"));
process.env.CYBERCHEF_RECIPE_STORAGE = join(storeDir, "recipes.json");
process.env.CYBERCHEF_LOG_LEVEL = "silent";
process.env.CYBERCHEF_TOOL_SURFACE = "all";

/**
 * The operation list used by every recipe-tool call below, so the sequence is reproducible.
 *
 * The field is `operations`, not `recipe` -- checked against the declaration rather than assumed.
 * The first draft of this file assumed `recipe` and every call failed identically on both builds,
 * which a diff would have reported as a clean pass.
 */
const OPERATIONS = [{ op: "To Base64", args: {} }];

/**
 * Replace everything that legitimately differs between two runs.
 *
 * Ids and timestamps are generated per run, so without this every field would differ and the real
 * differences would be invisible in the noise.
 *
 * @param {string} text - A response body.
 * @returns {string} The same body with volatile values replaced by stable placeholders.
 */
function normalise(text) {
    return text
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
        .replace(/"(id|recipeId|requestId)":\s*"[^"]*"/g, '"$1": "<id>"')
        .replace(/"(createdAt|updatedAt|timestamp|exportedAt|startedAt)":\s*"?[^",}]*"?/g, '"$1": "<time>"')
        .replace(/"(durationMs|uptimeMs|elapsedMs|ms)":\s*[0-9.]+/g, '"$1": <ms>')
        .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<time>");
}

const server = (await import(modulePath)).createMcpServer();
const [ct, st] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "meta-tool-answers", version: "0" }, { capabilities: {} });
await Promise.all([server.connect(st), client.connect(ct)]);

const out = [];
/**
 * Call one tool and record the normalised answer, success or failure alike.
 *
 * A rejection is an answer too -- the two exceptions this instrument was written to catch differ
 * in their SUCCESS shape, but a dropped `validateInputSize` guard shows up only as a rejection that
 * stopped happening.
 *
 * @param {string} name - Tool name.
 * @param {Object} args - Arguments.
 * @returns {Promise<Object>} The recorded entry.
 */
async function call(name, args) {
    let entry;
    try {
        const res = await client.callTool({ name, arguments: args });
        const raw = res.content?.map(c => c.text ?? `<${c.type}>`).join("\n") ?? "";
        entry = { tool: name, isError: res.isError ?? false, raw, text: normalise(raw) };
    } catch (err) {
        entry = { tool: name, threw: true, raw: String(err.message),
            text: normalise(String(err.message)) };
    }
    // `raw` is for this script's own id extraction only and is stripped before output -- it holds
    // the very values `normalise` exists to hide, so emitting it would make every diff dirty.
    out.push(entry);
    return entry;
}

try {
    // The recipe tools, in an order that gives each one something real to act on.
    const created = await call("cyberchef_recipe_create",
        { name: "probe", description: "answers probe", operations: OPERATIONS });
    const realId = (created.raw.match(/"id":\s*"([^"]+)"/) ?? [])[1];
    if (!realId) {
        // Fail loudly. Without an id every later call rejects identically on both builds, and the
        // diff reports a clean pass on a probe that measured nothing.
        console.error(`recipe_create returned no id, so nothing downstream is real:\n${created.raw}`);
        process.exit(2);
    }

    await call("cyberchef_recipe_list", {});
    await call("cyberchef_recipe_get", { id: realId });
    await call("cyberchef_recipe_validate", { operations: OPERATIONS });
    await call("cyberchef_recipe_test", { id: realId, input: "Hello" });
    await call("cyberchef_recipe_execute", { id: realId, input: "Hello" });
    await call("cyberchef_recipe_export", { id: realId });
    await call("cyberchef_recipe_import", {
        data: JSON.stringify({ name: "imported", operations: OPERATIONS }) });
    await call("cyberchef_recipe_update", { id: realId, name: "probe2" });
    await call("cyberchef_recipe_delete", { id: realId });

    // Everything else on the meta surface.
    await call("cyberchef_bake", { input: "Hello", recipe: OPERATIONS });
    await call("cyberchef_batch", { inputs: ["a", "b"], recipe: OPERATIONS });
    await call("cyberchef_magic", { input: "SGVsbG8=" });
    await call("cyberchef_search", { query: "base64" });
    await call("cyberchef_categories", {});
    await call("cyberchef_describe_operation", { operations: ["To Base64"] });
    await call("cyberchef_list_operations", {});
    await call("cyberchef_analyse", { tool: "hash_identify", arguments: { hash: "5d41402abc4b2a76b9719d911017c592" } });
    await call("cyberchef_worker_stats", {});
    await call("cyberchef_cache_stats", {});
    await call("cyberchef_cache_clear", {});
    await call("cyberchef_quota_info", {});
    await call("cyberchef_telemetry_export", {});

    // Rejections matter as much as successes: a dropped guard is a refusal that stopped happening.
    await call("cyberchef_recipe_execute", {});
    await call("cyberchef_recipe_export", {});
    await call("cyberchef_recipe_get", { id: "does-not-exist" });
    await call("cyberchef_analyse", { tool: "not_a_tool", arguments: {} });

    console.log(JSON.stringify(out.map(({ raw, ...rest }) => rest), null, 1));
} finally {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
    rmSync(storeDir, { recursive: true, force: true });
}
