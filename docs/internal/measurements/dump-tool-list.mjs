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
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [cmd, ...args] = process.argv.slice(2);

// A usage message, not a security check. This script spawns the command you hand it, by design --
// that is what makes it useful for comparing two builds without editing anything, and there is no
// privilege boundary to defend: the person typing the command is the person running the script.
//
// What IS worth guarding is the empty case. With no arguments `cmd` is `undefined` and the failure
// surfaces as an opaque spawn error from inside the SDK, several frames from the actual mistake.
if (!cmd) {
    console.error("usage: node dump-tool-list.mjs <server-command> [args...]\n" +
        "   eg: node dump-tool-list.mjs node ../../../src/node/mcp-server.mjs");
    process.exit(2);
}

const client = new Client({ name: "dump-tool-list", version: "0" }, { capabilities: {} });

// The server initialises its recipe store at startup against the CURRENT WORKING DIRECTORY, so
// without this it writes `./recipes.json` wherever this is run from -- and that file is
// gitignored, which is why two of them accumulated unnoticed before anyone looked.
const storeDir = mkdtempSync(join(tmpdir(), "dump-tool-list-"));

try {
    // INSIDE the try. `connect` spawns the server, so it is the call most likely to reject here --
    // and a rejection outside would skip the cleanup below, leaving both the temp directory and
    // possibly the process behind. The first version of this file made exactly that mistake.
    await client.connect(new StdioClientTransport({
        command: cmd,
        args,
        env: {
            ...process.env,
            CYBERCHEF_TOOL_SURFACE: "index",
            CYBERCHEF_LOG_LEVEL: "silent",
            CYBERCHEF_RECIPE_STORAGE: join(storeDir, "recipes.json")
        }
    }));

    const { tools } = await client.listTools();
    console.error("bytes:", Buffer.byteLength(JSON.stringify({ tools }), "utf8"),
        "tools:", tools.length);
    console.log(JSON.stringify(
        tools.map(t => ({ name: t.name, bytes: Buffer.byteLength(JSON.stringify(t)) }))));
} catch (err) {
    // A clean one-line failure and exit 2, rather than a stack trace from an unhandled rejection.
    // The most common cause is a server command that does not start, and the message a reader
    // needs then is which command was tried -- not the SDK's internal frames.
    console.error(`failed against \`${[cmd, ...args].join(" ")}\`: ${err.message}`);
    process.exitCode = 2;
} finally {
    // Both of them, and neither is allowed to prevent the other. A probe that tidies up only on
    // the happy path is a probe that litters precisely when something went wrong.
    await client.close().catch(() => {
        // Already failing, or never connected. The directory removal below is what matters here.
    });
    rmSync(storeDir, { recursive: true, force: true });
}
