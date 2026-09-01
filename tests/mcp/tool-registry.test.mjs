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

describe("input bounds: what stops a tool blocking the server", () => {
    const reg = buildRegistry();
    // `async` deliberately: `inputSchema.parse` throws SYNCHRONOUSLY, so a plain arrow would
    // throw before returning a promise and every `.rejects` assertion below would miss it.
    const run = async (name, args) => {
        const t = reg.getByExposedName(`cyberchef_${name}`);
        return await t.run(t.inputSchema.parse(args));
    };

    it("refuses a modulus too large to be a key, in milliseconds rather than minutes", async () => {
        // The measurement that produced this bound: 100 Fermat iterations against a 262,144-bit
        // "modulus" blocked for 72 seconds -- more than twice the 30-second timeout every
        // operation tool is held to, from ONE call. Bounding fermat_iterations does not help,
        // because the cost is in the size of the numbers: a million iterations against a 65-bit
        // modulus is 582 ms.
        const started = Date.now();
        await expect(run("rsa_attack", { modulus: "f".repeat(65536), "fermat_iterations": 100 }))
            .rejects.toThrow();
        expect(Date.now() - started).toBeLessThan(1000);
    });

    it("catches a modulus that is short as text but huge as a number", async () => {
        // 4,990 decimal digits is 16,577 bits: inside the character bound and outside the real
        // one. The character limit is a cheap proxy; the bit length is the property that matters.
        const n = BigInt("9".repeat(4990));
        expect(n.toString(2).length).toBeGreaterThan(16384);
        await expect(run("rsa_attack", { modulus: n.toString() }))
            .rejects.toThrow(/16577 bits.*Nothing above 16384 is an RSA key/s);
    });

    it("still accepts a modulus the size of a real RSA-4096 key", async () => {
        // The bound has to be loose enough to be useless to nobody. RSA-4096 is already unusual,
        // and this is one of them.
        const out = await run("rsa_attack",
            { modulus: "c" + "f".repeat(1023), "fermat_iterations": 50 });
        expect(out.factored).toBe(false);
    });

    it("bounds every string argument on every tool", async () => {
        // Each numeric argument was bounded from the start and every string one was not, which is
        // the shape of the gap: a schema that looks careful because the obvious fields are capped.
        await expect(run("xor_key_length", { input: "a".repeat(1048577) })).rejects.toThrow();
        await expect(run("hash_identify", { input: "a".repeat(4097) })).rejects.toThrow();
        await expect(run("cyclic_pattern", { mode: "find", fragment: "a".repeat(4097) }))
            .rejects.toThrow();
        await expect(run("rsa_attack", { modulus: "1", ciphertext: "9".repeat(5001) }))
            .rejects.toThrow();
    });

    it("skips the small-e attack for an exponent that would kill the process", async () => {
        // integerRoot computes `hi ** k`, so a large k is not slow, it is fatal:
        // "RangeError: Maximum BigInt size exceeded". A 400-digit exponent reached that and the
        // caller got an internal V8 error instead of an answer. `e` cannot be bounded globally --
        // a LARGE e is exactly the signature Wiener's attack looks for.
        const out = await run("rsa_attack", {
            modulus: (1000000007n * 1000000009n).toString(),
            "public_exponent": "9".repeat(400),
            ciphertext: "12345678901234567",
            attacks: ["small_e"]
        });
        expect(out.small_e_recovery).toBeUndefined();
        expect(out.attempted.join(" ")).toMatch(/small_e \(skipped/);
    });

    it("still runs the small-e attack for the exponent it is actually for", async () => {
        const m = 4241788n;
        const out = await run("rsa_attack", {
            modulus: (2n ** 4096n - 1n).toString(), "public_exponent": "3",
            ciphertext: (m ** 3n).toString(), attacks: ["small_e"]
        });
        expect(out.small_e_recovery.message_int).toBe(m.toString());
    });

    it("leaves the Fermat loop interruptible so a timeout can actually fire", async () => {
        // A synchronous loop cannot be timed out: Promise.race never gets a turn, so the bound
        // would only be checked after the work it was meant to bound had finished. The loop
        // yields, and this proves the event loop still runs during a long search.
        let ticked = false;
        const timer = setTimeout(() => {
            ticked = true;
        }, 5);
        await run("rsa_attack", {
            modulus: (1000003n * 32416190071n).toString(), "fermat_iterations": 200000,
            attacks: ["fermat"]
        });
        clearTimeout(timer);
        expect(ticked).toBe(true);
    }, 30000);
});

describe("answers refused rather than guessed", () => {
    const reg = buildRegistry();
    const run = async (name, args) => {
        const t = reg.getByExposedName(`cyberchef_${name}`);
        return await t.run(t.inputSchema.parse(args));
    };

    it("refuses an offset for a fragment shorter than the uniqueness window", async () => {
        // Uniqueness is a property of length-n windows only. With n=4, "aa" occurs 282 times in a
        // 1024-byte pattern, and indexOf reported the first as *the* offset -- a confident wrong
        // overflow offset, which is the one failure this tool exists to prevent.
        await expect(run("cyclic_pattern", { mode: "find", fragment: "aa" }))
            .rejects.toThrow(/only unique in windows of 4/);
    });

    it("still answers for a fragment at or above the window", async () => {
        expect((await run("cyclic_pattern", { mode: "find", fragment: "aaha" })).most_likely.offset)
            .toBe(26);
        // Longer is fine: eight bytes from a 64-bit register is the normal thing to paste.
        expect((await run("cyclic_pattern", { mode: "find", fragment: "aahaaaia" })).most_likely.offset)
            .toBe(26);
    });

    it("blames the hex parse rather than the pattern when Hex is explicit", async () => {
        // Staying silent sent the caller to the "does not appear in the pattern" error, and from
        // there to check the pattern length and alphabet -- both of which were fine.
        await expect(run("cyclic_pattern",
            { mode: "find", fragment: "zzz", "fragment_format": "Hex" }))
            .rejects.toThrow(/even number of hexadecimal digits/);
    });

    it("rejects an alphabet with a repeated symbol", async () => {
        await expect(run("cyclic_pattern", { mode: "generate", alphabet: "aab" }))
            .rejects.toThrow();
    });

    it("says what is missing when mode=find has no fragment", async () => {
        await expect(run("cyclic_pattern", { mode: "find" }))
            .rejects.toThrow(/needs a `fragment`/);
    });

    it("does not let a non-exclusive pattern suppress the ambiguity behind it", async () => {
        // The Cisco type 7 pattern is two decimal digits followed by hex, which an ordinary
        // MD5-length digest beginning "01" satisfies by coincidence. Treated as a definitive
        // structural hit it suppressed every length candidate and reported "Identified by
        // structure, so this is reliable" for what is almost certainly an MD5.
        const out = await run("hash_identify", { input: "0123456789abcdef0123456789abcdef" });
        expect(out.ambiguous).toBe(true);
        expect(out.candidates.map(c => c.format)).toEqual(
            expect.arrayContaining(["Cisco IOS type 7 (reversible)", "MD5", "NTLM"]));
        expect(out.most_likely.confidence).toBe("structural, but not exclusive");
        expect(out.note).toMatch(/not exclusive/);
    });

    it("still identifies a real Cisco type 7, and says it is not a hash", async () => {
        const out = await run("hash_identify", { input: "094F471A1A0A" });
        expect(out.most_likely.format).toBe("Cisco IOS type 7 (reversible)");
        expect(out.most_likely.note).toMatch(/NOT a hash/);
        expect(out.next).toMatch(/No hashcat mode/);
    });

    it("says a hex string of unrecognised length is one, rather than guessing", async () => {
        const out = await run("hash_identify", { input: "abcdef123456" });
        expect(out.identified).toBe(false);
        expect(out.note).toMatch(/matches no digest length this tool knows/);
    });

    it("computes the totient correctly when the two factors are equal", async () => {
        // n = p^2 is a real case, not a hypothetical: Fermat returns p === q for it on its first
        // iteration. phi(p^2) is p(p-1), not (p-1)^2 -- and with the wrong totient the tool
        // reported a private exponent that decrypted 424242 as 368518651580054785.
        const p = 1000000007n;
        const n = p * p;
        const e = 65537n;
        const plain = 424242n;
        let c = 1n, b = plain % n, ex = e;
        while (ex > 0n) {
            if (ex & 1n) c = c * b % n;
            b = b * b % n;
            ex >>= 1n;
        }
        const out = await run("rsa_attack", { modulus: n.toString(), ciphertext: c.toString() });
        expect(out.p).toBe(out.q);
        expect(out.plaintext_int).toBe(plain.toString());
    });
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

describe("cyclic_pattern", () => {
    const tool = buildRegistry().getByExposedName("cyberchef_cyclic_pattern");
    const run = (args) => tool.run(tool.inputSchema.parse(args));

    it("generates the same pattern pwntools does", async () => {
        // The whole value of this tool is interoperability: an offset found here has to match the
        // one a colleague found with `cyclic -l`. Pinned to pwntools' canonical output, which is
        // the de-facto standard for the format.
        const out = await run({ mode: "generate", length: 20 });
        expect(out.pattern).toBe("aaaabaaacaaadaaaeaaa");
    });

    it("finds the offset of a fragment", async () => {
        const out = await run({ mode: "find", fragment: "aaha" });
        expect(out.most_likely.offset).toBe(26);
        expect(out.most_likely.reading).toBe("text");
    });

    it("reads a register value both ways round and offers both offsets", async () => {
        // A crash dump gives you a register, not a string, and the endianness is often unknown.
        // Silently picking one would hand back a plausible wrong number, so both are returned.
        const out = await run({ mode: "find", fragment: "0x61616861" });
        const readings = out.offsets.map(o => `${o.reading}:${o.offset}`);
        expect(readings).toEqual(expect.arrayContaining([
            "hex, big-endian:26", "hex, little-endian:27"
        ]));
        expect(out.note).toMatch(/More than one reading matched/);
    });

    it("every window of the pattern is unique, which is what the offset lookup rests on", async () => {
        const out = await run({ mode: "generate", length: 1024, "subsequence_length": 4 });
        const windows = new Set();
        for (let i = 0; i + 4 <= out.pattern.length; i++) windows.add(out.pattern.slice(i, i + 4));
        expect(windows.size).toBe(out.pattern.length - 3);
    });

    it("refuses a pattern longer than the alphabet can keep unique", async () => {
        // 26^2 = 676 distinct 2-byte windows. Producing 700 would repeat, and a repeated window
        // makes every offset ambiguous -- the one failure mode that matters for this tool.
        await expect(run({ mode: "generate", length: 700, "subsequence_length": 2 }))
            .rejects.toThrow(/676 unique bytes/);
    });

    it("says the fragment is absent rather than guessing an offset", async () => {
        await expect(run({ mode: "find", fragment: "zzzz" }))
            .rejects.toThrow(/does not appear in a 1024-byte pattern/);
    });
});

describe("hash_identify", () => {
    const tool = buildRegistry().getByExposedName("cyberchef_hash_identify");
    const run = (args) => tool.run(tool.inputSchema.parse(args));

    /** Canonical published examples, one per structural format. */
    const CASES = [
        ["$2b$12$GhvMmNVjRW29ulnudl.LbuAnUtN/LRfe1JsBm1Xu6LE3059z5Tr8m", "bcrypt", 3200],
        ["$6$usesomesillystri$nnCrG0XcyKwkRXepV1dRXhqEhP0r2sdjV8bt5gCcljMzCikm9bUX/" +
            "7p3XFtKdxi5sTwUISBZHwcTXhwXYM/rl1", "sha512crypt", 1800],
        ["$1$28772684$iEwNOgGugqO9.bIz5sk8k/", "md5crypt", 500],
        ["$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG",
         "argon2id", null],
        ["$P$984478476IagS59wHZvyQMArzfx58u.", "PHPass (WordPress, phpBB)", 400],
        ["pbkdf2_sha256$260000$abcdefghij$3jFPQqZq0dCJmZWJVbSbwWJcz3Ns1MoLDVLLbAMHhIA=",
         "Django PBKDF2-SHA256", 10000],
        ["{SSHA}0l+HRHhaXA5Y5S6Bh8gYZ+D9dxYzYWx0", "LDAP SSHA (salted SHA-1)", 111],
        ["*2470C0C06DEE42FD1618BB99005ADCA2EC9D1E19", "MySQL 4.1+ (SHA-1 twice)", 300]
    ];

    it.each(CASES)("identifies %s as %s", async (hash, format, hashcat) => {
        const out = await run({ input: hash });
        expect(out.most_likely.format).toBe(format);
        expect(out.most_likely.confidence).toBe("structural");
        if (hashcat !== null) expect(out.most_likely.hashcat_mode).toBe(hashcat);
    });

    it("recognises the explicit-rounds form of a crypt hash", async () => {
        // glibc writes `$6$rounds=N$` when the round count is not the default, and that extra
        // field is a separate branch of the pattern. The digest below is the real hash above with
        // the rounds field spliced in: only the structure is under test here, not the digest.
        const out = await run({
            input: "$6$rounds=656000$usesomesillystri$nnCrG0XcyKwkRXepV1dRXhqEhP0r2sdjV8bt5gCcl" +
                "jMzCikm9bUX/7p3XFtKdxi5sTwUISBZHwcTXhwXYM/rl1"
        });
        expect(out.most_likely.format).toBe("sha512crypt");
    });

    it("gives a runnable hashcat line and the John format name", async () => {
        const out = await run({
            input: "$2b$12$GhvMmNVjRW29ulnudl.LbuAnUtN/LRfe1JsBm1Xu6LE3059z5Tr8m"
        });
        expect(out.next).toBe("hashcat -m 3200");
        expect(out.most_likely.john_format).toBe("bcrypt");
        expect(out.ambiguous).toBe(false);
    });

    it("does not pretend a bare hex digest is one algorithm", async () => {
        // 32 hex characters is MD5, NTLM, MD4 and more. Naming one would be a guess dressed as an
        // answer, so all are listed, `ambiguous` is set, and the note says what the evidence is.
        const out = await run({ input: "5f4dcc3b5aa765d61d8327deb882cf99" });
        const formats = out.candidates.map(c => c.format);
        expect(formats).toEqual(expect.arrayContaining(["MD5", "NTLM", "MD4"]));
        expect(out.ambiguous).toBe(true);
        expect(out.candidates.every(c => c.confidence === "length only")).toBe(true);
        expect(out.note).toMatch(/length ALONE/);
    });

    it("recognises a JWT and says it is not a password hash", async () => {
        const out = await run({
            input: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0." +
                "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        });
        expect(out.most_likely.format).toBe("JWT");
        expect(out.most_likely.note).toMatch(/Not a password hash/);
    });

    it("returns no candidates rather than a wrong one for something that is not a hash", async () => {
        const out = await run({ input: "hello world" });
        expect(out.identified).toBe(false);
        expect(out.candidates).toEqual([]);
        expect(out.note).toMatch(/cyberchef_magic/);
    });
});

describe("rsa_attack", () => {
    const tool = buildRegistry().getByExposedName("cyberchef_rsa_attack");
    const run = (args) => tool.run(tool.inputSchema.parse(args));

    /** Modular inverse, to build a Wiener case from a chosen small d. */
    const modinv = (a, m) => {
        let [old, r] = [a % m, m];
        let [s, t] = [1n, 0n];
        while (r) {
            const q = old / r;
            [old, r] = [r, old - q * r];
            [s, t] = [t, s - q * t];
        }
        return ((s % m) + m) % m;
    };

    it("factors a modulus whose primes are close together (Fermat)", async () => {
        const p = 1000000007n, q = 1000000009n;
        const out = await run({ modulus: (p * q).toString() });
        expect(out.factored).toBe(true);
        expect(out.via).toBe("fermat");
        expect([out.p, out.q].sort()).toEqual([p.toString(), q.toString()].sort());
        expect(out.assessment).toMatch(/close together/);
    });

    it("breaks both keys when two moduli share a prime", async () => {
        const shared = 32416190071n;
        const n1 = shared * 32416189381n;
        const n2 = shared * 32416187567n;
        const out = await run({ modulus: n1.toString(), "other_modulus": n2.toString() });
        expect(out.via).toBe("common_factor");
        expect([out.p, out.q]).toContain(shared.toString());
        expect(out.assessment).toMatch(/BOTH keys are broken/);
    });

    it("recovers a private exponent that was chosen small (Wiener)", async () => {
        const p = 1000003n, q = 1000033n;
        const phi = (p - 1n) * (q - 1n);
        const d = 5n;
        const out = await run({
            modulus: (p * q).toString(),
            "public_exponent": modinv(d, phi).toString(),
            attacks: ["wiener"]
        });
        expect(out.via).toBe("wiener");
        expect(out.private_exponent).toBe("5");
    });

    it("recovers an unpadded small-e message without factoring anything", async () => {
        // e=3 and a message short enough that m^3 never wrapped the modulus. This is a padding
        // failure, not a key failure, and the tool has to report it as the former.
        const m = 4241788n;
        const out = await run({
            modulus: (2n ** 2048n - 1n).toString(),
            "public_exponent": "3",
            ciphertext: (m ** 3n).toString(),
            attacks: ["small_e"]
        });
        expect(out.factored).toBe(false);
        expect(out.small_e_recovery.message_int).toBe(m.toString());
        expect(out.assessment).toMatch(/padding failure/);
    });

    it("decrypts a ciphertext once it has the factors", async () => {
        const p = 1000000007n, q = 1000000009n, n = p * q, e = 65537n;
        const plain = 123456789n;
        let c = 1n, b = plain % n, ex = e;
        while (ex > 0n) {
            if (ex & 1n) c = c * b % n;
            b = b * b % n;
            ex >>= 1n;
        }
        const out = await run({ modulus: n.toString(), ciphertext: c.toString() });
        expect(out.plaintext_int).toBe(plain.toString());
        expect(out.padding_note).toMatch(/padding/);
    });

    it("reports a key it cannot break as unbroken, without claiming it is strong", async () => {
        // Distant primes, so Fermat will not reach it in the iteration budget. The wording matters
        // as much as the result: four ruled-out flaws is not a proof of strength, and a tool that
        // implies otherwise is worse than one that says nothing.
        const out = await run({
            modulus: (1000003n * 32416190071n).toString(),
            "fermat_iterations": 500
        });
        expect(out.factored).toBe(false);
        expect(out.assessment).toMatch(/NOT proof the key is strong/);
        expect(out.next).toMatch(/other_modulus/);
    });

    it("accepts hex as well as decimal, and refuses anything that is neither", async () => {
        const p = 1000000007n, q = 1000000009n;
        const out = await run({ modulus: "0x" + (p * q).toString(16) });
        expect(out.factored).toBe(true);

        await expect(run({ modulus: "not a number" })).rejects.toThrow(/not an integer/);
    });

    it("flags a ciphertext that cannot belong to the key instead of returning nonsense", async () => {
        const p = 1000000007n, q = 1000000009n, n = p * q;
        const out = await run({ modulus: n.toString(), ciphertext: (n + 1n).toString() });
        expect(out.factored).toBe(true);
        expect(out.plaintext).toBeUndefined();
        expect(out.decryption_error).toMatch(/not smaller than the modulus/);
    });

    it("takes the trivial factor out of an even modulus instead of searching for it", async () => {
        const out = await run({ modulus: (2n * 1000000007n).toString() });
        expect(out.p).toBe("2");
        expect(out.q).toBe("1000000007");
    });

    it("reads bare hex, which is how a modulus is usually pasted", async () => {
        // No 0x prefix, and not readable as decimal. Decimal wins where both readings are possible,
        // because guessing wrong there would change the answer without saying so.
        const p = 1000000007n, q = 1000000009n;
        const out = await run({ modulus: (p * q).toString(16) });
        expect(out.factored).toBe(true);
        expect([out.p, out.q]).toContain(p.toString());
    });

    it("renders a non-printable plaintext as hex rather than as mojibake", async () => {
        const p = 1000000007n, q = 1000000009n, n = p * q, e = 65537n;
        const plain = 999999999999n;                       // bytes well outside printable ASCII
        let c = 1n, b = plain % n, ex = e;
        while (ex > 0n) {
            if (ex & 1n) c = c * b % n;
            b = b * b % n;
            ex >>= 1n;
        }
        const out = await run({ modulus: n.toString(), ciphertext: c.toString() });
        expect(out.plaintext).toMatch(/^0x[0-9a-f]+$/);
        expect(out.plaintext_int).toBe((plain % n).toString());
    });

    it("does not treat two identical moduli as a shared-factor break", async () => {
        // gcd(n, n) is n, which factors nothing. Reporting it as a break would be the worst kind
        // of false positive: confident, and about a key that may be perfectly sound.
        const n = 1000003n * 32416190071n;
        const out = await run({
            modulus: n.toString(), "other_modulus": n.toString(),
            attacks: ["common_factor"], "fermat_iterations": 1
        });
        expect(out.factored).toBe(false);
        expect(out.attempted).toContain("common_factor");
    });

    it("does not suggest supplying a second modulus when one was already given", async () => {
        const out = await run({
            modulus: (1000003n * 32416190071n).toString(),
            "other_modulus": (1000033n * 32416187567n).toString(),
            "fermat_iterations": 200
        });
        expect(out.factored).toBe(false);
        expect(out.next).toMatch(/fermat_iterations/);
        expect(out.next).not.toMatch(/pass one as other_modulus/);
    });

    it("reports a small-e recovery alongside the factors when both succeed", async () => {
        // Both paths can fire on one call: the key is weak AND the ciphertext was unpadded. The
        // report has to carry both, because they are separate defects with separate fixes.
        const p = 1000000007n, q = 1000000009n;
        const m = 4241n;
        const out = await run({
            modulus: (p * q).toString(), "public_exponent": "3", ciphertext: (m ** 3n).toString()
        });
        expect(out.factored).toBe(true);
        expect(out.small_e_recovery.message_int).toBe(m.toString());
    });

    it("refuses a modulus or exponent too small to be a key at all", async () => {
        await expect(run({ modulus: "3" })).rejects.toThrow(/at least 4/);
        await expect(run({ modulus: "15", "public_exponent": "1" }))
            .rejects.toThrow(/at least 2/);
    });

    it("still returns correct factors when e and phi(n) are not coprime", async () => {
        // p-1 and q-1 are both even, so e=2 shares a factor with phi and no private exponent
        // exists. The factorisation is still right, and saying "factored, but no d" is the honest
        // answer -- returning a bogus d, or throwing away the factors, would both be worse.
        const p = 1000000007n, q = 1000000009n;
        const out = await run({ modulus: (p * q).toString(), "public_exponent": "2" });
        expect(out.factored).toBe(true);
        expect(out.private_exponent).toBe(null);
        expect(out.warning).toMatch(/not coprime/);
    });
});
