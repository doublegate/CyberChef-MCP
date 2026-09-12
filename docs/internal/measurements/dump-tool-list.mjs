/**
 * Dump a server's `tools/list` through a real client, with per-tool byte sizes.
 *
 * Takes the server command as argv, so two builds can be compared without editing anything:
 *
 *     node dump-tool-list.mjs node ../../../src/node/mcp-server.mjs
 *
 * Byte sizes go to stdout as JSON and the totals to stderr, so the output can be piped into `jq`
 * or diffed between builds while the summary stays readable.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [cmd, ...args] = process.argv.slice(2);
const client = new Client({ name: "dump-tool-list", version: "0" }, { capabilities: {} });
await client.connect(new StdioClientTransport({
    command: cmd,
    args,
    env: {
        ...process.env,
        CYBERCHEF_TOOL_SURFACE: "index",
        CYBERCHEF_LOG_LEVEL: "silent",
        // Point the recipe store at a temp directory. The server initialises it at startup and
        // writes `./recipes.json` into the CURRENT WORKING DIRECTORY otherwise -- running this
        // from `docs/internal/measurements/` left a stray file there, and from the repository root
        // it leaves one there. Both are gitignored, which is exactly why they go unnoticed.
        CYBERCHEF_RECIPE_STORAGE: join(mkdtempSync(join(tmpdir(), "dump-tool-list-")), "recipes.json")
    }
}));

try {
    const { tools } = await client.listTools();
    console.error("bytes:", Buffer.byteLength(JSON.stringify({ tools }), "utf8"),
        "tools:", tools.length);
    console.log(JSON.stringify(
        tools.map(t => ({ name: t.name, bytes: Buffer.byteLength(JSON.stringify(t)) })), null, 0));
} finally {
    // `finally`, so a failing `listTools` still closes the transport and does not leave the
    // spawned server running. Node would exit anyway; not relying on that is cheaper than
    // explaining a stray process later.
    await client.close();
}
