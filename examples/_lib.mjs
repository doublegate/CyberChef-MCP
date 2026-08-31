/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Shared plumbing for the runnable examples.
 *
 * Kept deliberately small. Every example is meant to be readable on its own, so this file holds
 * only the two things that would otherwise be copied into all eight of them: starting a server,
 * and reporting a failed expectation in a way that makes the script exit non-zero.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Path to the MCP server entry point, resolved relative to this file rather than to the cwd. */
export const SERVER = resolve(HERE, "../src/node/mcp-server.mjs");

/**
 * A throwaway directory for the recipe store, created once per example process.
 *
 * Left behind deliberately rather than cleaned up: it lives under the OS temp
 * directory, and an example that fails mid-run is easier to debug with its store intact.
 */
const RECIPE_DIR = mkdtempSync(join(tmpdir(), "cyberchef-example-"));

/**
 * Connect a client to a freshly spawned stdio server.
 *
 * Each example gets its own process. That is slower than sharing one, and it is the right trade
 * for examples: a reader can run any single file without having started anything else first.
 *
 * @param {string} name - Client name reported to the server.
 * @returns {Promise<Client>} A connected client. Call `close()` when finished.
 */
export async function connect(name = "example") {
    const client = new Client({ name, version: "1.0.0" }, { capabilities: {} });
    await client.connect(new StdioClientTransport({
        command: process.execPath,
        // No `--openssl-legacy-provider`. It was here until v2.2.0, with a comment claiming
        // `Generate all hashes` needed it -- which was wrong twice over: the flag is inert on any
        // Node without a legacy provider module (including the Docker image, where it printed
        // "Unable to load legacy provider." and changed nothing), and the one operation that
        // reached OpenSSL, `LM Hash`, now computes DES in JavaScript instead.
        args: [SERVER],
        // The recipe store defaults to `./recipes.json`, so an example that saves a recipe writes
        // one into the repository root -- which is user data, and may hold keys and IVs, since a
        // saved recipe carries its arguments. Pointed at a temp directory instead. Example 05 did
        // this for itself; doing it here makes every example safe by default.
        env: { ...process.env, CYBERCHEF_RECIPE_STORAGE: join(RECIPE_DIR, "recipes.json") },
        // The server's diagnostics go to stderr; let them through so a reader can see what the
        // server is doing, rather than swallowing the one channel that explains a failure.
        stderr: "inherit"
    }));
    return client;
}

/**
 * Call a tool and return its first text result.
 *
 * The MCP content array is a list of typed blocks. MOST tools return a single text block, so
 * unwrapping it here keeps the examples about CyberChef rather than about MCP shapes -- but since
 * v2.2.0 image and audio operations return `image`/`audio` blocks, which carry `data` and no
 * `text` at all. Example 09 reads the raw block for those.
 *
 * @param {Client} client - A connected client.
 * @param {string} name - Tool name, including the `cyberchef_` prefix.
 * @param {Object} args - Tool arguments.
 * @returns {Promise<string>} The text content of the result.
 */
export async function call(client, name, args = {}) {
    const res = await client.callTool({ name, arguments: args });
    if (res.isError) throw new Error(`${name} failed: ${res.content?.[0]?.text ?? "unknown error"}`);
    return res.content[0].text;
}

/**
 * Assert, and say what was expected when it fails.
 *
 * `node:assert` would do, but its output for a long string diff is hard to read in a terminal and
 * these examples double as tests -- the failure message is the thing a reader sees first.
 *
 * @param {string} label - What is being checked.
 * @param {*} actual - The value produced.
 * @param {*} expected - The value required.
 * @returns {void}
 */
export function expect(label, actual, expected) {
    if (actual !== expected) {
        console.error(`\n  FAILED: ${label}`);
        console.error(`    expected: ${JSON.stringify(expected)}`);
        console.error(`    actual:   ${JSON.stringify(actual)}`);
        process.exitCode = 1;
        throw new Error(`assertion failed: ${label}`);
    }
    console.log(`  ok  ${label}`);
}

/**
 * Print a section heading.
 *
 * @param {string} text - The heading.
 * @returns {void}
 */
export function step(text) {
    console.log(`\n== ${text}`);
}
