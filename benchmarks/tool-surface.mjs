#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Measure what each tool surface costs on the wire, through a real MCP client.
 *
 * WHY THIS EXISTS
 * ---------------
 * `tool-catalog.mjs` opens with the measurement that justifies progressive disclosure, and by
 * v3.1.0 every figure in it had drifted -- the index, the surface the whole design rests on, was
 * documented at ~10 KB and measured at 20 KB. The argument still held by a wide margin, which is
 * exactly why nobody noticed: a claim that stays directionally true is the hardest kind to keep
 * numerically true.
 *
 * A number in a comment is a claim with no test behind it. This is the test.
 *
 * BYTES, NOT TOKENS
 * -----------------
 * Every `~N tokens` figure this project has ever published was bytes divided by four. No
 * tokenizer has ever been in this repository, and adding one would not fix the problem: the
 * consumer here is Claude, Anthropic does not publish its tokenizer as a package, and counting
 * with a GPT tokenizer would substitute a second unvalidated proxy for the first while looking
 * more rigorous. So this reports bytes, which are exact, and states the divisor it would take to
 * reach a token estimate rather than burying it.
 *
 * Run with `npm run measure:surfaces`.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = resolve(ROOT, "src/node/mcp-server.mjs");

/** Bytes of the JSON-RPC payload, which is what actually crosses the wire. */
const wireBytes = value => Buffer.byteLength(JSON.stringify(value), "utf8");

/**
 * Connect a real client to a server started with the given surface.
 *
 * @param {string} surface - `index`, `curated` or `all`.
 * @returns {Promise<{client: Object, close: Function}>} A connected client.
 */
async function connect(surface) {
    const client = new Client({ name: "surface-measure", version: "0.0.0" }, { capabilities: {} });
    await client.connect(new StdioClientTransport({
        command: process.execPath,
        args: [SERVER],
        env: { ...process.env, CYBERCHEF_TOOL_SURFACE: surface, CYBERCHEF_LOG_LEVEL: "silent" }
    }));
    return { client, close: () => client.close() };
}

const rows = [];
for (const surface of ["index", "curated", "all"]) {
    const { client, close } = await connect(surface);
    try {
        const started = Date.now();
        const { tools } = await client.listTools();
        rows.push({
            surface,
            tools: tools.length,
            bytes: wireBytes({ tools }),
            ms: Date.now() - started
        });
    } finally {
        await close();
    }
}

const pad = (s, n) => String(s).padStart(n);
process.stdout.write("\ntools/list, measured through a real MCP client\n\n");
process.stdout.write("  surface     tools      bytes       KB   listTools\n");
for (const r of rows) {
    process.stdout.write(
        `  ${r.surface.padEnd(9)} ${pad(r.tools, 5)} ${pad(r.bytes, 10)} ${pad(Math.round(r.bytes / 1024), 8)} ${pad(r.ms + "ms", 11)}\n`);
}

// The trade the index makes, quantified rather than asserted: reaching an operation costs one
// extra round trip the first time. `tool-catalog.mjs` claims that is worth it; this is the number
// behind the claim.
const { client, close } = await connect("index");
try {
    const describe = await client.callTool({
        name: "cyberchef_describe_operation", arguments: { operations: "To Base64" }
    });
    const detail = wireBytes(describe);
    const index = rows.find(r => r.surface === "index").bytes;
    const all = rows.find(r => r.surface === "all").bytes;
    process.stdout.write(
        `\n  index + one operation schema: ${index + detail} bytes ` +
        `(${(all / (index + detail)).toFixed(1)}x cheaper than \`all\`)\n`);
    process.stdout.write(`  one \`cyberchef_describe_operation\` result: ${detail} bytes\n`);
} finally {
    await close();
}

process.stdout.write(
    "\n  Bytes are exact. A token figure needs a tokenizer this repository does not have;\n" +
    "  every historical \"~N tokens\" claim here was bytes/4, which is optimistic for JSON.\n\n");
