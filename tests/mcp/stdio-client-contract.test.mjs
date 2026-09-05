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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, "../../src/node/mcp-server.mjs");
const CERT_LEAF = readFileSync(resolve(HERE, "fixtures/cert-leaf.pem"), "utf8");
const CERT_INTER = readFileSync(resolve(HERE, "fixtures/cert-inter.pem"), "utf8");

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

    it("returns tools in the same order every time", async () => {
        // The 2026-07-28 spec asks for deterministic order so a client can cache the list and so
        // an unchanged prefix keeps hitting an LLM's prompt cache. Byte equality of the whole
        // payload is what a client actually caches on, so that is what is asserted.
        const first = await client.listTools();
        const second = await client.listTools();
        expect(JSON.stringify(second.tools)).toBe(JSON.stringify(first.tools));
    });

    it("sorts within each tier, and keeps the navigation tier first", async () => {
        // Three tiers -- meta, registry, operation -- each sorted, then concatenated. A single
        // flat sort would bury cyberchef_bake among 504 alphabetically-earlier operation names,
        // which is the opposite of what the index surface is for. Tier order is part of the
        // contract, so both halves are pinned.
        const { tools } = await client.listTools();
        const names = tools.map(t => t.name);

        expect(names[0]).toBe("cyberchef_bake");

        // Every tier is individually non-decreasing. Tier boundaries are found by the sort
        // resetting, which is exactly the property being asserted, so count them instead: three
        // tiers means at most two descents across the whole list.
        const descents = names.filter((n, i) => i > 0 && names[i - 1] > n).length;
        expect(descents).toBeLessThanOrEqual(2);
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

    /**
     * A minimal valid call for every registry tool.
     *
     * Written out rather than generated, because a generated payload would satisfy the schema and
     * exercise nothing -- and "the schema accepts it" is precisely the claim that was false for
     * three releases while a green suite watched.
     */
    const REGISTRY_CALLS = {
        // A real two-certificate chain from tests/mcp/fixtures. Read from disk rather than
        // inlined: a PEM block is multi-line and pasting one into this table would make the
        // fixture table unreadable for every other entry.
        "cyberchef_cert_chain": [{ input: CERT_LEAF + CERT_INTER },
                                 r => expect(r.chain.map(c => c.subject)).toEqual(["CN=example.test", "CN=Test Intermediate"])],
        "cyberchef_classical_cipher": [{ cipher: "polybius", input: "BAT" }, r => expect(r.output).toBe("121144")],
        "cyberchef_corpus_diff": [{ samples: ["deadbeef", "deadbeee"] }, r => expect(r.samples).toBe(2)],
        "cyberchef_crib_drag": [{ ciphertext: "00112233445566778899aabb", crib: "the" }, r => expect(r.mode).toBeTruthy()],
        "cyberchef_cyclic_pattern": [{ mode: "generate", length: 64 }, r => expect(r.pattern).toBeTruthy()],
        // A real secp256k1 nonce-reuse pair: r is (kG).x mod n and both signatures verify.
        // Generated by the curve arithmetic in tests/mcp/ecdsa-recover.test.mjs, which is where
        // the arithmetic is asserted; this fixture exists to prove the tool answers through a
        // real client with a real schema, which a direct run() call does not.
        "cyberchef_ecdsa_recover": [{ signatures: [
            { r: "0x4cd3c1723e7836f4178d5e19517e872d63ee1eb32c638ae6b6da4843f848e475",
                s: "0x86712f38fbea3081c77f6668482843ab93ef90fc6375ff0cfde6a7cb1efcab62",
                hash: "0x5f6c5e7c8a9b0c1d2e3f405162738495a6b7c8d9eaf010203040506070809abc" },
            { r: "0x4cd3c1723e7836f4178d5e19517e872d63ee1eb32c638ae6b6da4843f848e475",
                s: "0xc5922f2655e10601f9cf3be74efa9de7bc75843a55cfc57d8f90e8e13cd35a36",
                hash: "0x1122334455667788990011223344556677889900112233445566778899001122" }
        ] }, r => expect(r.recoveries[0].private_key_hex)
            .toBe("c0ffee00c0ffee11c0ffee22c0ffee33c0ffee44c0ffee55c0ffee66c0ffee77")],
        "cyberchef_entropy_scan": [{ input: "A".repeat(1024), "input_format": "Raw" }, r => expect(r.bytes).toBe(1024)],
        "cyberchef_hash_crack": [{ hashes: ["5f4dcc3b5aa765d61d8327deb882cf99"] }, r => expect(r.cracked[0].plaintext).toBe("password")],
        "cyberchef_hash_identify": [{ input: "5f4dcc3b5aa765d61d8327deb882cf99" }, r => expect(r.most_likely).toBeTruthy()],
        "cyberchef_hash_statistics": [{ input: "a:5f4dcc3b5aa765d61d8327deb882cf99\nb:5f4dcc3b5aa765d61d8327deb882cf99" }, r => expect(r.entries).toBe(2)],
        "cyberchef_jwt_weakness": [{ token: "eyJhbGciOiJub25lIn0.eyJzdWIiOiJhIn0." }, r => expect(r.findings.length).toBeGreaterThan(0)],
        "cyberchef_plaintext_check": [{ input: "The quick brown fox jumps over the lazy dog." }, r => expect(r.verdict).toBe("plaintext")],
        "cyberchef_rsa_attack": [{ modulus: "32416190071", "public_exponent": "65537" }, r => expect(r.attempted.length).toBeGreaterThan(0)],
        "cyberchef_rsa_multi_key": [{ keys: [{ modulus: "32416190071" }, { modulus: "1000003" }] }, r => expect(r.keys_examined).toBe(2)],
        "cyberchef_substitution_break": [{ input: "GUR DHVPX OEBJA SBK WHZCF BIRE GUR YNML QBT NAQ GURA EHAF NJNL SEBZ GUR SNEZ", restarts: 5, seed: 1 }, r => expect(r.mapping.plain_alphabet).toHaveLength(26)],
        "cyberchef_timestamp_identify": [{ value: "1756900000" }, r => expect(r.interpretations.length).toBeGreaterThan(0)],
        "cyberchef_vigenere_break": [{ input: "Nyw ceoni sj gsqzynob wowebmdc lokmxw gsdr dro yfcobzkdsyx drkd ofobc wicdow rkc k lyexnkbi" }, r => expect(r.key).toBeTruthy()],
        "cyberchef_xor_key_length": [{ input: "0b1b1b0c4e0f1b0c4e0a1b1b0c4e0f1b0c4e0a1b1b0c4e0f1b0c4e0a1b1b0c4e0f1b0c4e0a", "input_format": "Hex", "preview_bytes": 0 }, r => expect(r.key_length).toBeGreaterThan(0)]
    };

    it("has a client-driven call for every registry tool, with none missing", async () => {
        // Derived from the REGISTRY, not from the advertised list filtered by REGISTRY_CALLS.
        // The first version did the latter -- it kept only names already in REGISTRY_CALLS and
        // then compared that to REGISTRY_CALLS -- which is an identity, and could not fail. A new
        // registry tool with no case here would have sailed through the test written to catch
        // exactly that.
        const { buildRegistry } = await import("../../src/node/tools/index.mjs");
        const { ToolRegistry } = await import("../../src/node/tools/registry.mjs");
        const expected = buildRegistry().list().map(tool => ToolRegistry.exposedName(tool.name));

        expect(expected.sort()).toEqual(Object.keys(REGISTRY_CALLS).sort());
        // And every one of them is actually advertised, so the fixtures cannot describe a tool
        // the server does not serve.
        const advertised = new Set(tools.map(t => t.name));
        for (const name of expected) expect(advertised.has(name), name).toBe(true);
    });

    it.each(Object.keys(REGISTRY_CALLS))(
        "%s answers through a real client, not just through run()",
        async (name) => {
            // The v2.1.0 lesson, applied to all sixteen rather than to one. Every test written
            // before v2.1.0 spoke raw JSON-RPC or called handlers directly, and raw JSON-RPC does
            // no schema validation -- so three releases shipped with every tool carrying an empty
            // inputSchema while the suite stayed green. A direct `run()` call touches none of the
            // schema, the capability hand-off, the timeout wrapper or the content block.
            const [args, check] = REGISTRY_CALLS[name];
            const res = await client.callTool({ name, arguments: args });
            expect(res.isError, res.content?.[0]?.text).toBeFalsy();
            const parsed = JSON.parse(res.content[0].text);
            check(parsed);
        }, 60000);
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
