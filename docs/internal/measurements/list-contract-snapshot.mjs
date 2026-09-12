// Dump the FULL tools/list response -- every field, not just names -- for one server module on one
// surface, through a real client. Names are the cheapest half of the contract; descriptions,
// inputSchema, annotations, title and ORDER are the half a naive parity test cannot see.
//
// THE WORKFLOW, because the awkward part is not this script.
//
// An old revision of the server only resolves its relative imports from inside `src/node/`, so
// comparing two revisions means putting the old one THERE, not in a scratch directory:
//
//     git show <ref>:src/node/mcp-server.mjs > src/node/mcp-server.<ref>.mjs
//     node docs/internal/measurements/list-contract-snapshot.mjs \
//          "$PWD/src/node/mcp-server.<ref>.mjs" index > before.json
//     node docs/internal/measurements/list-contract-snapshot.mjs \
//          "$PWD/src/node/mcp-server.mjs"       index > after.json
//     diff before.json after.json ; rm src/node/mcp-server.<ref>.mjs
//
// `src/node/mcp-server.*.mjs` is gitignored so a forgotten copy cannot be committed.
//
// COMPARE SIZES BEFORE BELIEVING A CLEAN DIFF. Two failed captures are also identical, and the
// first run of this produced exactly that -- both files empty, reported as a pass -- because it
// had been placed outside the repository and could not resolve the SDK.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [modulePath, surface] = process.argv.slice(2);

// A usage message, not a security check -- this script imports the module path it is handed, by
// design, which is the whole point of comparing two builds. What is worth guarding is the empty
// case: without it a missing surface silently measures the DEFAULT surface and the run gets
// compared against something else, which is a wrong answer rather than an error.
if (!modulePath || !["index", "curated", "all"].includes(surface)) {
    console.error("usage: node list-contract-snapshot.mjs <abs-path-to-mcp-server.mjs> " +
        "<index|curated|all>");
    process.exit(2);
}

const storeDir = mkdtempSync(join(tmpdir(), "list-contract-"));
process.env.CYBERCHEF_RECIPE_STORAGE = join(storeDir, "recipes.json");
process.env.CYBERCHEF_TOOL_SURFACE = surface;
process.env.CYBERCHEF_LOG_LEVEL = "silent";

// Declared here, assigned inside the try: `import()` and either connect can reject, and the two
// closes belong in `finally` rather than after the call that can throw -- a `listTools()` failure
// would otherwise leave both connections open.
let server;
let client;

try {
    const { createMcpServer } = await import(modulePath);
    server = createMcpServer();
    const [ct, st] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "list-contract", version: "0" }, { capabilities: {} });
    await Promise.all([server.connect(st), client.connect(ct)]);
    const { tools } = await client.listTools();
    // ORDER PRESERVED deliberately -- the 2026-07-28 deterministic-ordering SHOULD is part of the
    // contract, so sorting here would hide exactly the regression worth catching.
    console.log(JSON.stringify(tools, null, 1));
} catch (err) {
    // Reported and non-zero. Silence here is the failure mode this file's own header warns about:
    // an empty capture diffs clean against another empty capture.
    console.error(`list-contract-snapshot failed against ${modulePath} (${surface}): ${err.message}`);
    process.exitCode = 2;
} finally {
    // Guarded, since setup may not have got this far, and each rejection is reported rather than
    // swallowed. Neither close may prevent the directory removal.
    await client?.close().catch(e => console.error(`client close failed: ${e.message}`));
    await server?.close().catch(e => console.error(`server close failed: ${e.message}`));
    rmSync(storeDir, { recursive: true, force: true });
}
