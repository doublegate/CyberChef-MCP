#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Measure what a tool RESULT costs, through a real MCP client.
 *
 * WHY THIS EXISTS
 * ---------------
 * `measure:surfaces` measures `tools/list`. Nothing measured a result, and every claim in the
 * v3.2.0 efficiency track is about result size -- a `response_format` enum measured elsewhere at
 * 65% reduction, truncation with guidance, richer error suggestions. Shipping those on someone
 * else's numbers is the "asserted, not measured" failure this project keeps writing up, so the
 * measurement comes before the change.
 *
 * WHAT IT MEASURES
 * ----------------
 * Result payload bytes -- the `result` object, not the framed JSON-RPC message. The envelope is a
 * few dozen constant bytes; excluding it keeps comparisons between tools exact. Same convention as
 * `tool-surface.mjs`, and the same reason for bytes rather than tokens: no tokenizer is in this
 * repository, and counting Claude tokens with a GPT tokenizer would swap one unvalidated proxy for
 * another.
 *
 * The cases are chosen to span the shapes a caller actually hits: a short transform, a large
 * transform, a listing, a description, an analysis, and an error. An efficiency change that helps
 * only the verbose end is worth knowing about before it is made.
 *
 * Run with `npm run measure:results`.
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

const payloadBytes = value => Buffer.byteLength(JSON.stringify(value), "utf8");

const SHORT = "Hello, world";
const LARGE = "A".repeat(64 * 1024);

const CASES = [
    ["short transform", "cyberchef_bake",
        { input: SHORT, recipe: [{ op: "To Base64" }] }],
    ["large transform (64 KB in)", "cyberchef_bake",
        { input: LARGE, recipe: [{ op: "To Base64" }] }],
    ["analysis", "cyberchef_bake",
        { input: SHORT, recipe: [{ op: "Entropy", args: ["Shannon scale"] }] }],
    ["magic (unknown data)", "cyberchef_magic",
        { input: "SGVsbG8sIHdvcmxk" }],
    ["category index", "cyberchef_categories", {}],
    ["list one category", "cyberchef_list_operations", { category: "Hashing" }],
    ["describe one operation", "cyberchef_describe_operation", { operations: "AES Encrypt" }],
    ["describe five operations", "cyberchef_describe_operation",
        { operations: ["AES Encrypt", "Gzip", "To Base64", "MD5", "Entropy"] }],
    ["search", "cyberchef_search", { query: "base64" }],
    ["error: unknown operation", "cyberchef_bake",
        { input: SHORT, recipe: [{ op: "Not A Real Operation" }] }],
    ["error: missing argument", "cyberchef_describe_operation", {}]
];

const client = new Client({ name: "result-measure", version: "0.0.0" }, { capabilities: {} });
await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, CYBERCHEF_LOG_LEVEL: "silent", CYBERCHEF_TOOL_SURFACE: "index" }
}));

const rows = [];
try {
    for (const [label, name, args] of CASES) {
        const result = await client.callTool({ name, arguments: args });
        const bytes = payloadBytes(result);
        const text = result.content?.map(c => c.text ?? "").join("") ?? "";
        rows.push({ label, tool: name, bytes, chars: text.length, isError: Boolean(result.isError) });
    }
} finally {
    await client.close();
}

const pad = (s, n) => String(s).padStart(n);
process.stdout.write(
    "\ntool result payloads, measured through a real MCP client.\n" +
    "The JSON-RPC envelope and newline delimiter are excluded, as in measure:surfaces.\n\n" +
    "  case                            bytes    text chars  err\n");
for (const r of rows) {
    process.stdout.write(
        `  ${r.label.padEnd(30)} ${pad(r.bytes, 7)} ${pad(r.chars, 11)}  ${r.isError ? "yes" : "-"}\n`);
}

const total = rows.reduce((n, r) => n + r.bytes, 0);
const median = [...rows].sort((a, b) => a.bytes - b.bytes)[rows.length >> 1].bytes;
process.stdout.write(
    `\n  ${rows.length} cases, ${total} bytes total, median ${median} bytes.\n` +
    "  Read the SHAPE before proposing a format flag: an enum that halves the verbose cases\n" +
    "  buys nothing on a catalogue whose median result is a short transform.\n\n");
