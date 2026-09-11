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
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, "../../src/node/mcp-server.mjs");
const CERT_LEAF = readFileSync(resolve(HERE, "fixtures/cert-leaf.pem"), "utf8");
const CERT_INTER = readFileSync(resolve(HERE, "fixtures/cert-inter.pem"), "utf8");

/**
 * A real ML-DSA-44 public key, produced by `node:crypto` here rather than committed as a fixture.
 *
 * The table below says payloads are written out rather than generated, and this does not
 * contradict it: that rule is about a payload derived from the tool's own SCHEMA, which satisfies
 * the schema by construction and therefore tests nothing. This is the opposite -- a real artefact
 * from an independent implementation of FIPS 204, which is what the DER path has to parse in the
 * field. A 1,312-byte key inlined as base64 would be the same bytes, frozen, and unreadable.
 */
const ML_DSA_44_PUBLIC = generateKeyPairSync("ml-dsa-44")
    .publicKey.export({ type: "spki", format: "pem" });

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

    // ---- v4.1.0: the dispatcher, through the official client ----------------------------------
    //
    // These exist because the feature shipped without them. The auth suite calls
    // `cyberchef_analyse` only with EMPTY arguments, to inspect authorisation and schema errors,
    // and the contract tests below call registry tools directly. So the release's central promise
    // -- that all nineteen run identically through the dispatcher, under both spellings -- was
    // verified by hand and never by the suite. Reviewer-found.

    it("runs every registry tool through cyberchef_analyse, identically to a direct call", async () => {
        const { buildRegistry, ToolRegistry } = await import("../../src/node/tools/index.mjs");
        // DISCOVERED from the registry, with a fixture per tool. A hand-written list would have to
        // be edited by the change that adds a twentieth tool, which is the change most likely to
        // get its dispatch wrong.
        // Keys QUOTED: registry tool names are snake_case by contract -- the registry throws on a
        // `cyberchef_` prefix and `ToolRegistry.exposedName` adds it -- so these are data, not
        // identifiers, and the camelcase lint rule is right to object to the bare form.
        const FIXTURES = {
            "hash_identify": { input: "5d41402abc4b2a76b9719d911017c592" },
            "cyclic_pattern": { mode: "generate", length: 32 },
            // 512 bytes: the default window is 256 and the tool refuses input smaller than its
            // window, on the ground that the `Entropy` operation already measures a whole buffer.
            "entropy_scan": { input: "abcdefghijklmnop".repeat(32) },
            "timestamp_identify": { value: "1700000000" },
            "plaintext_check": { input: "the quick brown fox jumps over the lazy dog" }
        };

        // EVERY registered tool is covered, not just the ones with a fixture.
        //
        // Filtering to `FIXTURES` would have meant a twentieth tool arriving with no dispatcher
        // parity coverage and this test still passing -- the exact "gate that lists its targets
        // instead of discovering them" failure this repository keeps writing findings about.
        //
        // A success fixture is not cheap for all nineteen (some need certificates, corpora or
        // tuned inputs), so coverage is split by what is affordable rather than by what is
        // convenient: tools WITH a fixture are checked for byte-identical SUCCESS, and every
        // other registered tool is checked for byte-identical REFUSAL under empty arguments.
        // Both directions prove the same property -- the dispatcher returns exactly what the
        // direct call returns -- and every tool is in one bucket or the other by construction.
        const allTools = buildRegistry().list();
        const tools = allTools.filter(t => FIXTURES[t.name]);
        expect(tools.length, "no fixtures matched any registered tool").toBeGreaterThan(0);

        const unfixtured = allTools.filter(t => !FIXTURES[t.name]);

        const text = r => r.content?.[0]?.text ?? "";
        // Error payloads carry a `Timestamp:` line, so two calls a few milliseconds apart differ
        // by the clock alone. Normalising it is not a weakening of the comparison: the property
        // under test is that the dispatcher returns the same ANSWER as the direct call, and the
        // wall clock is the one field guaranteed to differ between any two calls. Found by this
        // test reporting `cert_chain` as a mismatch on a 4 ms gap.
        const stable = r => text(r).replace(/Timestamp: \S+/g, "Timestamp: <normalised>");
        const wrong = [];
        for (const tool of tools) {
            const exposed = ToolRegistry.exposedName(tool.name);
            const args = FIXTURES[tool.name];

            const direct = await client.callTool({ name: exposed, arguments: args });
            const bare = await client.callTool({
                name: "cyberchef_analyse", arguments: { tool: tool.name, arguments: args } });
            const prefixed = await client.callTool({
                name: "cyberchef_analyse", arguments: { tool: exposed, arguments: args } });

            if (direct.isError) {
                // Report WHY. A fixture that stops matching a tool's schema is a likely failure
                // here, and "the direct call failed" without the reason turns a one-line fix into
                // a guessing loop.
                wrong.push(`${exposed}: the DIRECT call failed, so the fixture is wrong -- ` +
                    `${(direct.content?.[0]?.text ?? "").slice(0, 200)}`);
                continue;
            }

            // BYTE equality, not shape equality. "Behaves identically" is the charter's word, and
            // the only way the dispatcher can be trusted to mean it is if the payload matches.
            if (stable(bare) !== stable(direct)) {
                wrong.push(`${exposed}: bare name through the dispatcher differs from the direct call`);
            }
            if (stable(prefixed) !== stable(direct)) {
                wrong.push(`${exposed}: cyberchef_-prefixed name differs from the direct call`);
            }
        }

        // The refusal half, for every tool without a success fixture.
        for (const tool of unfixtured) {
            const exposed = ToolRegistry.exposedName(tool.name);
            const direct = await client.callTool({ name: exposed, arguments: {} });
            const via = await client.callTool({
                name: "cyberchef_analyse", arguments: { tool: tool.name, arguments: {} } });

            if (!direct.isError) {
                // Not a failure of the dispatcher -- it means this tool accepts empty arguments,
                // so a refusal cannot be the thing compared. Say so, and ask for a fixture.
                wrong.push(`${exposed}: accepts empty arguments, so add a FIXTURES entry for it ` +
                    "and it will be covered by the success comparison above");
                continue;
            }
            if (stable(via) !== stable(direct)) {
                wrong.push(`${exposed}: the dispatcher's refusal differs from the direct call's` +
                    `\n  direct: ${text(direct).slice(0, 180)}` +
                    `\n  via   : ${text(via).slice(0, 180)}`);
            }
        }

        expect(wrong.join("\n")).toBe("");
    }, 180000);

    it("refuses an unknown analysis tool, naming the field and what is available", async () => {
        const res = await client.callTool({
            name: "cyberchef_analyse", arguments: { tool: "no_such_tool", arguments: {} } });
        expect(res.isError).toBe(true);
        const text = res.content?.[0]?.text ?? "";
        expect(text).toMatch(/Unknown analysis tool/);
        // The available set, so a caller can correct the call without a second round trip.
        expect(text).toMatch(/hash_identify/);
    }, 120000);

    it("reports a schema violation against the SELECTED tool, not the dispatcher", async () => {
        const res = await client.callTool({
            name: "cyberchef_analyse", arguments: { tool: "hash_identify", arguments: {} } });
        expect(res.isError).toBe(true);
        const text = res.content?.[0]?.text ?? "";
        // Naming `cyberchef_analyse` here would hand the caller a schema complaint about a tool
        // whose schema was not the one violated.
        expect(text).toMatch(/cyberchef_hash_identify/);
        expect(text).not.toMatch(/Invalid arguments for cyberchef_analyse/);
    }, 120000);

    it("lists the analysis tools through cyberchef_categories", async () => {
        // The `analysisTools` member is the only way a caller walking the hierarchy finds these
        // tools now that they are off the index. Without this assertion the member could vanish
        // and every category test would stay green, because they only inspect `categories`.
        const { buildRegistry } = await import("../../src/node/tools/index.mjs");
        const registered = buildRegistry().list().map(t => t.name).sort();

        const res = await client.callTool({ name: "cyberchef_categories", arguments: {} });
        const body = JSON.parse(res.content[0].text);

        expect(body.analysisTools, "cyberchef_categories no longer advertises the analysis tools")
            .toBeTruthy();
        expect(body.analysisTools.count).toBe(registered.length);
        expect(body.analysisTools.tools.map(t => t.tool).sort()).toEqual(registered);
        // The usage string is the navigation instruction; if it stops naming both steps, a caller
        // is left with a list and no route.
        expect(body.analysisTools.usage).toMatch(/cyberchef_describe_operation/);
        expect(body.analysisTools.usage).toMatch(/cyberchef_analyse/);
    }, 120000);

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

        // THE TIER BOUNDARY, not alphabetical neighbours.
        //
        // The first version of this assertion pinned `names[0]` to a literal and then checked
        // `bake` against `magic` -- which a flat alphabetical sort satisfies too, since both sort
        // before `magic`. It asserted nothing about tiering while its own comment claimed it did.
        //
        // The property that actually distinguishes tiered from flat: a LATE-sorting meta-tool must
        // still precede an EARLY-sorting operation. Under a flat sort `cyberchef_a1z26_cipher_*`
        // leads the whole list and `cyberchef_worker_stats` trails it.
        const { buildRegistry, ToolRegistry } = await import("../../src/node/tools/index.mjs");
        const registry = new Set(buildRegistry().list().map(t => ToolRegistry.exposedName(t.name)));
        const { default: OperationConfig } =
            await import("../../src/core/config/OperationConfig.json", { with: { type: "json" } });
        const { sanitizeToolName } = await import("../../src/node/lib/tool-schema.mjs");
        const operationNames = new Set(
            Object.keys(OperationConfig).map(sanitizeToolName).filter(Boolean));

        const isOperation = n => operationNames.has(n);
        const isMeta = n => !registry.has(n) && !isOperation(n);

        const lastMeta = names.reduce((acc, n, i) => isMeta(n) ? i : acc, -1);
        const firstOperation = names.findIndex(isOperation);

        expect(lastMeta, "no meta-tools found -- the tier detection itself broke").toBeGreaterThan(-1);
        expect(firstOperation, "no operation tools found on the `all` surface").toBeGreaterThan(-1);
        expect(lastMeta,
            `Tiering is gone: the last meta-tool (${names[lastMeta]}) is at ${lastMeta} but an ` +
            `operation (${names[firstOperation]}) appears at ${firstOperation}. A single flat ` +
            "sort would bury the navigation tools among 504 alphabetically-earlier operations, " +
            "which is the opposite of what the index surface is for."
        ).toBeLessThan(firstOperation);

        // And the first tool is a navigation tool -- whichever one sorts first. Asserted by tier
        // membership rather than by name, so adding a meta-tool that sorts earlier still passes.
        expect(isMeta(names[0]), `first tool ${names[0]} is not a meta-tool`).toBe(true);

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
        // The OID path, which is the one that can answer `definite`. The byte-length path is
        // covered in pqc-identify.test.mjs; what a real client adds here is that a 1,312-byte
        // PEM survives the schema and the transport intact.
        "cyberchef_pqc_identify": [{ input: ML_DSA_44_PUBLIC },
                                   r => expect(r).toMatchObject({ algorithm: "ML-DSA-44", confidence: "definite", standard: "FIPS 204" })],
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
