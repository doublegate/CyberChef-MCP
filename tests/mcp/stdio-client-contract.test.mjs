/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The stdio contract, asserted with a REAL MCP client rather than with raw JSON-RPC.
 *
 * This suite exists because of two defects that shipped in every release from v1.8.0 through
 * v2.0.0 and that no existing test could have caught -- every other test speaks raw JSON-RPC to
 * the server, or calls the handlers directly, and neither validates what a client actually
 * requires:
 *
 *   1. `zod-to-json-schema` targets Zod v3 and FAILS SILENTLY against v4. Every tool advertised
 *      `{"$schema": "http://json-schema.org/draft-07/schema#"}` -- no `type`, no `properties`,
 *      no `required`. Raw JSON-RPC does no schema validation, so 524 tools "listed fine"; the
 *      official SDK client rejected the whole response with 524 `invalid_value` errors on
 *      `tools[N].inputSchema.type`. Confirmed against the PUBLISHED images: 483/483 empty on
 *      v1.9.0, 524/524 on v2.0.0.
 *
 *   2. Pino's default destination is fd 1, so every startup line went to STDOUT -- which the MCP
 *      stdio transport reserves exclusively for JSON-RPC. The code carried a comment claiming it
 *      wrote to stderr, and nothing implemented it.
 *
 * The lesson these encode: a protocol server must be tested through a client that ENFORCES the
 * protocol. A hand-rolled request proves the server answers; it does not prove the answer is
 * usable. So this suite drives the real `@modelcontextprotocol/sdk` client over a real child
 * process, and deliberately duplicates no assertions that the handler-level suites already make.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, "../../src/node/mcp-server.mjs");

// Booting the real server loads a 500-tool schema build, so this is generous on purpose: a
// timeout here should mean "broken", not "busy CI runner".
const BOOT_TIMEOUT_MS = 120_000;

describe("stdio contract, via the official MCP client", () => {
    let client;
    let tools;

    beforeAll(async () => {
        client = new Client({ name: "contract-test", version: "0.0.0" }, { capabilities: {} });
        // The SDK client validates every response against the MCP schema. That validation IS the
        // assertion: `connect` and `listTools` throw if the server answers something a compliant
        // client cannot accept, which is exactly what happened before the Zod 4 fix.
        //
        // CYBERCHEF_TOOL_SURFACE=all on purpose. The default is `index`, which pre-loads almost
        // nothing -- and the point of this suite is that EVERY generated operation tool carries a
        // valid schema. Against the default it would check two dozen tools and miss the 500 that
        // regressed last time.
        await client.connect(new StdioClientTransport({
            command: process.execPath,
            args: [SERVER],
            env: {
                ...process.env,
                CYBERCHEF_TOOL_SURFACE: "all",
                // Its own recipe store: the default is ./recipes.json and vitest runs test files
                // in parallel, so shared spawners race the replica generation guard.
                CYBERCHEF_RECIPE_STORAGE: join(tmpdir(), `cyberchef-stdio-contract-${process.pid}.json`)
            }
        }));
        ({ tools } = await client.listTools());
    }, BOOT_TIMEOUT_MS);

    afterAll(async () => {
        await client?.close();
    });

    it("completes initialize and tools/list without a schema violation", () => {
        // Reaching this line at all is the headline assertion -- beforeAll would have thrown.
        expect(Array.isArray(tools)).toBe(true);
        expect(tools.length).toBeGreaterThan(500);
    });

    it("gives EVERY tool a non-empty object input schema", () => {
        // The regression, stated as the thing that was actually wrong. Before the fix this found
        // all 524; an assertion on "some tool" would have passed against a totally broken server.
        const empty = tools.filter(t => t.inputSchema?.type !== "object");
        expect(empty.map(t => t.name)).toEqual([]);
    });

    it("describes the arguments of a tool that takes some", () => {
        // `type: "object"` alone is not enough -- a bare `{type:"object"}` would satisfy the check
        // above while telling a model nothing. This pins the payload a caller actually needs.
        const toBase64 = tools.find(t => t.name === "cyberchef_to_base64");
        expect(toBase64).toBeDefined();
        expect(Object.keys(toBase64.inputSchema.properties ?? {})).toContain("input");
        expect(toBase64.inputSchema.required).toContain("input");
    });

    it("keeps zero-argument tools valid rather than special-casing them", () => {
        // These legitimately take no arguments, so `properties` is absent -- but they must still
        // be well-formed objects, not the empty envelope the old converter produced for everything.
        const noArgs = tools.find(t => t.name === "cyberchef_cache_stats");
        expect(noArgs).toBeDefined();
        expect(noArgs.inputSchema.type).toBe("object");
    });

    it("executes a tool call end to end", async () => {
        const res = await client.callTool({
            name: "cyberchef_to_base64",
            arguments: { input: "Hello v2.1.0" }
        });
        expect(res.content[0].text).toBe(Buffer.from("Hello v2.1.0").toString("base64"));
    }, BOOT_TIMEOUT_MS);

    it("dispatches a registry tool, which is a different branch from an operation", async () => {
        // Registry tools are not in OperationConfig and take a separate path through
        // `handleCallTool`. Exercised through the client rather than by calling `run` directly,
        // because that path is where the schema, the capability hand-off, the timeout wrapper and
        // the content block all live -- and a direct `run` call touches none of them.
        const res = await client.callTool({
            name: "cyberchef_hash_identify",
            arguments: { input: "$2b$12$GhvMmNVjRW29ulnudl.LbuAnUtN/LRfe1JsBm1Xu6LE3059z5Tr8m" }
        });
        expect(res.isError).toBeFalsy();
        const parsed = JSON.parse(res.content[0].text);
        expect(parsed.most_likely.format).toBe("bcrypt");
        expect(parsed.next).toBe("hashcat -m 3200");
    }, BOOT_TIMEOUT_MS);

    it("returns a structured error for a malformed registry call", async () => {
        // The invalid-argument branch of the registry dispatch. It has to come back as a normal
        // MCP error result rather than a thrown internal, which is what a Zod issue would be if it
        // escaped -- and the message has to name the field the caller got wrong.
        const res = await client.callTool({
            name: "cyberchef_rsa_attack",
            arguments: { modulus: "f".repeat(9000) }
        });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toMatch(/INVALID_INPUT/);
        expect(res.content[0].text).toMatch(/modulus/);
    }, BOOT_TIMEOUT_MS);

    it("reports an unknown argument on a registry tool rather than ignoring it", async () => {
        const res = await client.callTool({
            name: "cyberchef_hash_identify",
            arguments: { hash: "5f4dcc3b5aa765d61d8327deb882cf99" }   // the field is `input`
        });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toMatch(/input/);
    }, BOOT_TIMEOUT_MS);
});

describe("stdio stream separation", () => {
    /**
     * Run the server with one request and capture the two streams SEPARATELY.
     *
     * Not done with the SDK client: the client consumes stdout, so it cannot show what else was
     * written there. The point of this test is which fd the bytes landed on.
     *
     * @returns {Promise<{stdout: string, stderr: string}>} The captured streams.
     */
    function runOnce() {
        return new Promise((resolveRun, rejectRun) => {
            const child = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", d => {
                stdout += d;
            });
            child.stderr.on("data", d => {
                stderr += d;
            });
            child.on("error", rejectRun);
            child.on("close", () => resolveRun({ stdout, stderr }));
            child.stdin.write(JSON.stringify({
                jsonrpc: "2.0", id: 1, method: "tools/list", params: {}
            }) + "\n");
            child.stdin.end();
        });
    }

    it("writes ONLY JSON-RPC to stdout, and the logs to stderr", async () => {
        const { stdout, stderr } = await runOnce();

        const lines = stdout.split("\n").filter(l => l.trim());
        expect(lines.length).toBeGreaterThan(0);

        // Every stdout line must parse as JSON-RPC. Asserted per line rather than by grepping for
        // `"level"`, so ANY future stray write fails this -- a bare `console.log`, a dependency's
        // banner, a progress bar -- not just pino's.
        for (const line of lines) {
            const parsed = JSON.parse(line);
            expect(parsed.jsonrpc, `stray stdout line: ${line.slice(0, 120)}`).toBe("2.0");
        }

        // And the diagnostics did not simply vanish: they must still be somewhere.
        expect(stderr).toContain("CyberChef MCP Server");
    }, BOOT_TIMEOUT_MS);
});
