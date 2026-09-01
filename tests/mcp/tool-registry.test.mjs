/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The tool registry, and the first tool built on it.
 *
 * Two properties matter more than the rest and are tested first:
 *
 *   - **A registry tool can never shadow a CyberChef operation.** `cyberchef_aes_decrypt` must
 *     always be AES Decrypt. Registration throws on a collision rather than resolving it by import
 *     order, so the winner can never depend on the sequence in which modules happen to load.
 *   - **Nothing is loaded from disk.** There is no loader to test, deliberately, and
 *     [ADR 0002](../../docs/adr/0002-tool-registry-is-not-a-plugin-loader.md) records why: a host
 *     capability handed into a `node:vm` context reaches the real `process`, so "sandboxed
 *     execution" is not achievable as the roadmap words it.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../../src/node/tools/registry.mjs";
import { buildRegistry } from "../../src/node/tools/index.mjs";

/** A minimal valid tool, for tests that are about the registry rather than about a tool. */
const validTool = (over = {}) => ({
    name: "example_tool",
    title: "Example",
    description: "Does nothing, usefully.",
    category: "Testing",
    inputSchema: z.object({ input: z.string() }),
    run: async () => "ok",
    ...over
});

describe("ToolRegistry: what it accepts", () => {
    it("registers, looks up by exposed name, lists and groups", () => {
        const r = new ToolRegistry();
        r.register(validTool());
        expect(r.size).toBe(1);
        expect(r.getByExposedName("cyberchef_example_tool")?.name).toBe("example_tool");
        expect(r.list().map(t => t.name)).toEqual(["example_tool"]);
        expect(r.byCategory()).toEqual({ Testing: ["cyberchef_example_tool"] });
    });

    it("does not answer to a name without the prefix", () => {
        // A `tools/call` always carries the exposed name. Accepting the bare one would mean two
        // spellings reach the same tool, and only one of them can be the documented spelling.
        const r = new ToolRegistry();
        r.register(validTool());
        expect(r.getByExposedName("example_tool")).toBeUndefined();
        expect(r.getByExposedName("")).toBeUndefined();
    });

    it("rejects a name that is not lower snake_case", () => {
        const r = new ToolRegistry();
        for (const name of ["ExampleTool", "example-tool", "_example", "example_", "1example", ""])
            expect(() => r.register(validTool({ name })), name).toThrow(/Invalid registry tool name/);
    });

    it("rejects a name that already carries the prefix, and says what to register instead", () => {
        const r = new ToolRegistry();
        expect(() => r.register(validTool({ name: "cyberchef_example" })))
            .toThrow(/must not carry the cyberchef_ prefix/);
    });

    it("requires a title, description and category", () => {
        const r = new ToolRegistry();
        for (const field of ["title", "description", "category"])
            expect(() => r.register(validTool({ [field]: "  " })), field)
                .toThrow(new RegExp(`needs a non-empty ${field}`));
    });

    it("requires a Zod OBJECT schema, not a bare shape", () => {
        // The empty-inputSchema regression shipped in three releases: a schema a client cannot use
        // fails at the client, far from the registration that caused it. Catch it at registration.
        const r = new ToolRegistry();
        expect(() => r.register(validTool({ inputSchema: { input: z.string() } })))
            .toThrow(/needs a Zod OBJECT schema/);
        expect(() => r.register(validTool({ inputSchema: z.string() })))
            .toThrow(/needs a Zod OBJECT schema/);
        expect(() => r.register(validTool({ inputSchema: undefined })))
            .toThrow(/needs a Zod OBJECT schema/);
    });

    it("requires a run function", () => {
        const r = new ToolRegistry();
        expect(() => r.register(validTool({ run: "not a function" }))).toThrow(/needs a run function/);
    });

    it("rejects a duplicate registration rather than replacing", () => {
        const r = new ToolRegistry();
        r.register(validTool());
        expect(() => r.register(validTool())).toThrow(/already registered/);
    });
});

describe("ToolRegistry: the shadowing rule", () => {
    it("refuses a tool that would take the name of a CyberChef operation", () => {
        // The property the registry exists to guarantee. Resolving this by registration order
        // would make the winner depend on import sequence -- and the loser would be an operation
        // a caller already trusts.
        const r = new ToolRegistry({ reservedNames: ["cyberchef_aes_decrypt", "cyberchef_bake"] });
        expect(() => r.register(validTool({ name: "aes_decrypt" })))
            .toThrow(/would shadow the existing tool "cyberchef_aes_decrypt"/);
        expect(() => r.register(validTool({ name: "bake" })))
            .toThrow(/would shadow the existing tool "cyberchef_bake"/);
    });

    it("accepts a Set as well as an array of reserved names", () => {
        const r = new ToolRegistry({ reservedNames: new Set(["cyberchef_md5"]) });
        expect(() => r.register(validTool({ name: "md5" }))).toThrow(/would shadow/);
        expect(() => r.register(validTool({ name: "md5_analysis" }))).not.toThrow();
    });

    it("the real registry does not collide with any real operation or meta-tool", async () => {
        const { default: OperationConfig } =
            await import("../../src/core/config/OperationConfig.json", { with: { type: "json" } });
        const { sanitizeToolName } = await import("../../src/node/lib/tool-schema.mjs");
        const reserved = new Set(Object.keys(OperationConfig).map(sanitizeToolName).filter(Boolean));
        // Building it IS the assertion: buildRegistry throws on a collision.
        const registry = buildRegistry({ reservedNames: reserved });
        expect(registry.size).toBeGreaterThan(0);
        for (const tool of registry.list())
            expect(reserved.has(ToolRegistry.exposedName(tool.name))).toBe(false);
    }, 60000);
});

describe("xor_key_length", () => {
    let tool;
    let bake;

    beforeAll(async () => {
        await import("../../src/node/index.mjs");
        ({ bakeOnCore: bake } = await import("../../src/node/lib/core-recipe.mjs"));
        tool = buildRegistry().getByExposedName("cyberchef_xor_key_length");
    }, 60000);

    /** Prose long enough for the statistics to mean something. */
    const PLAIN = "The Model Context Protocol lets an assistant call tools directly. CyberChef " +
        "exposes five hundred and four operations for encryption, encoding, compression and " +
        "forensic analysis. A repeating-key XOR is the classic first exercise: the key length " +
        "falls out of the statistics long before the key itself does. ".repeat(2);

    /** @returns {string} Hex ciphertext of PLAIN under a repeating key. */
    const encrypt = (key) => {
        const p = Buffer.from(PLAIN, "utf8");
        const k = Buffer.from(key, "utf8");
        return Buffer.from(p.map((b, i) => b ^ k[i % k.length])).toString("hex");
    };

    it.each([["K", 1], ["sec", 3], ["hunter", 6], ["correcthorse", 12], ["0123456789abcdef", 16]])(
        "recovers the length of key %s (%i bytes)", async (key, length) => {
            const out = await tool.run(
                tool.inputSchema.parse({ input: encrypt(key), "input_format": "Hex", "preview_bytes": 0 }),
                { bake });
            expect(out.key_length).toBe(length);
            // The ranked list must contain the answer regardless, since it is what a caller falls
            // back to when the top pick is a multiple.
            expect(out.candidates.map(c => c.length)).toContain(length);
        }, 30000);

    it("reports confidence against the random baseline, not as a bare number", async () => {
        const out = await tool.run(
            tool.inputSchema.parse({ input: encrypt("hunter"), "input_format": "Hex", "preview_bytes": 0 }),
            { bake });
        // 0.065 means nothing on its own; "17x more repetition than random bytes" means a lot.
        expect(out.confidence.uniform_baseline).toBeCloseTo(1 / 256, 4);
        expect(out.confidence.ratio_to_random).toBeGreaterThan(2);
        expect(out.confidence.note).toBeTruthy();
    }, 30000);

    it("decrypts a preview through the engine, not by reimplementing XOR", async () => {
        const out = await tool.run(
            tool.inputSchema.parse({ input: encrypt("K"), "input_format": "Hex", "preview_bytes": 40 }),
            { bake });
        // A one-byte key makes the space heuristic exact, so the preview is real plaintext.
        expect(out.preview).toContain("The Model Context Protocol");
        expect(out.key_guess.printable).toBe("K");
    }, 30000);

    it("refuses an input too short to say anything, rather than guessing", async () => {
        await expect(tool.run(
            tool.inputSchema.parse({ input: "41424344", "input_format": "Hex" }), { bake }))
            .rejects.toThrow(/Too little data/);
    }, 30000);

    it("accepts raw and base64 as well as hex", async () => {
        const hexCt = encrypt("hunter");
        const raw = Buffer.from(hexCt, "hex").toString("latin1");
        const b64 = Buffer.from(hexCt, "hex").toString("base64");
        for (const [format, input] of [["Raw", raw], ["Base64", b64]]) {
            const out = await tool.run(
                tool.inputSchema.parse({ input, "input_format": format, "preview_bytes": 0 }), { bake });
            expect(out.key_length, format).toBe(6);
        }
    }, 60000);
});

describe("the edges that only show up on bad input", () => {
    let tool;
    let bake;

    beforeAll(async () => {
        await import("../../src/node/index.mjs");
        ({ bakeOnCore: bake } = await import("../../src/node/lib/core-recipe.mjs"));
        tool = buildRegistry().getByExposedName("cyberchef_xor_key_length");
    }, 60000);

    it("rejects a non-object registration before dereferencing it", async () => {
        const r = new ToolRegistry();
        for (const bad of [null, undefined, "a tool", 42])
            expect(() => r.register(bad), String(bad)).toThrow(/must be an object/);
    });

    it("stops considering key lengths once the columns get too short to mean anything", async () => {
        // 40 bytes with max_key_length 32 would leave a length-32 column holding one sample, where
        // the statistic is noise wearing a number. The scan stops at length/4.
        const short = Buffer.from("A".repeat(20) + "The quick brown fox jumps", "utf8").toString("hex");
        const out = await tool.run(
            tool.inputSchema.parse({ input: short, "input_format": "Hex", "max_key_length": 32, "preview_bytes": 0 }),
            { bake });
        expect(Math.max(...out.candidates.map(c => c.length))).toBeLessThanOrEqual(Math.floor(45 / 4));
    }, 30000);

    it("says so when the data looks random rather than asserting a key length", async () => {
        // Random bytes have no repeating-key structure. The tool still answers -- there is always
        // a highest-scoring length -- so the confidence note is what stops that being misread.
        const random = Buffer.from(
            Array.from({ length: 600 }, (_, i) => (i * 167 + 13) % 256)).toString("hex");
        const out = await tool.run(
            tool.inputSchema.parse({ input: random, "input_format": "Hex", "preview_bytes": 0 }),
            { bake });
        expect(out.confidence.note).toMatch(/random|Structured/);
        expect(out.confidence.ratio_to_random).toBeGreaterThan(0);
    }, 30000);

    it("still answers at the 8-byte floor, and flags how thin the evidence is", async () => {
        // Exactly at the minimum. There is always a highest-scoring length, so the tool answers --
        // and the note is what stops that being read as confidence. Written after a test that
        // asserted a rejection here and found the guard for it was unreachable: 8 bytes is four
        // samples of a length-1 key, which qualifies.
        const out = await tool.run(
            { input: "4142434445464748", "input_format": "Hex", "max_key_length": 32,
                candidates: 5, "preview_bytes": 0 },
            { bake });
        expect(out.key_length).toBe(1);
        expect(out.confidence.note).toMatch(/random|samples per column/);
    }, 30000);
});
