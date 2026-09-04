/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The analyses that need the whole corpus. Every case here is one a `Fork` recipe cannot express,
 * because each branch would see one sample and nothing combines them.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import tool from "../../src/node/tools/corpus-diff.mjs";

const hex = (bytes) => Buffer.from(bytes).toString("hex");
const run = (args) => tool.run(tool.inputSchema.parse(args));

/** A fixed-layout record: 4-byte magic, 1-byte type from a small set, 4-byte unique id, 1 flag bit. */
const record = (type, id, flag) => hex([
    0xde, 0xad, 0xbe, 0xef,
    type,
    (id >> 24) & 0xff, (id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff,
    flag ? 0x81 : 0x80
]);

describe("corpus_diff", () => {
    it("separates constant, enumerated and unique offsets", async () => {
        const r = await run({
            samples: [record(1, 1000, false), record(2, 1001, true), record(1, 1002, false), record(2, 1003, true)]
        });

        const kinds = r.structure.fields.map(f => `${f.offset}:${f.length}:${f.kind}`);
        expect(kinds[0]).toBe("0:4:constant");                    // the magic
        expect(r.structure.columns[4].kind).toBeUndefined();      // per-offset detail, not a field
        expect(r.structure.columns[4].distinct).toBe(2);          // the type tag
        expect(r.structure.columns[8].distinct).toBe(4);          // the low byte of a unique id
    });

    it("sees a field that moves only one bit inside an otherwise steady byte", async () => {
        const r = await run({
            samples: [record(1, 1000, false), record(1, 1001, true), record(1, 1002, false), record(1, 1003, true)]
        });

        // Byte level says "this offset varies" and stops. Bit level says WHICH bit, which is the
        // difference between "a field is here" and "a one-bit flag is here" -- and packed flags
        // and sub-byte counters are exactly what byte-level variance cannot resolve.
        const flags = r.structure.columns[9];
        expect(flags.varying_bits).toBe(1);
        expect(flags.distinct).toBe(2);
    });

    it("finds a repeated cipher block and says where it is", async () => {
        const block = [...Array(16).keys()];
        const other = block.map(b => b ^ 0xff);
        const r = await run({ samples: [hex([...block, ...other, ...block]), hex([...other, ...other])] });

        expect(r.ecb.samples_with_repeats).toBe(2);
        // The OFFSETS, not only a count: where the repeat sits is what tells you the record layout.
        expect(r.ecb.findings[0].repeats[0].offsets).toEqual([0, 32]);
    });

    it("finds a block shared between two different samples, which no single-input tool can", async () => {
        const shared = [...Array(16).keys()];
        const r = await run({
            samples: [hex([...shared, ...shared.map(b => b ^ 1)]), hex([...shared.map(b => b ^ 2), ...shared])]
        });

        expect(r.ecb.blocks_shared_between_samples).toHaveLength(1);
        expect(r.ecb.blocks_shared_between_samples[0].places).toHaveLength(2);
    });

    it("detects a reused nonce and hands back the XOR that breaks it", async () => {
        const nonce = Array.from({ length: 12 }, (_, i) => i);
        const keystream = Array.from({ length: 16 }, (_, i) => (i * 37 + 11) & 0xff);
        const p1 = [...Buffer.from("attack at dawn!!")];
        const p2 = [...Buffer.from("retreat at dusk!")];
        const r = await run({
            samples: [
                hex([...nonce, ...p1.map((b, i) => b ^ keystream[i])]),
                hex([...nonce, ...p2.map((b, i) => b ^ keystream[i])])
            ]
        });

        expect(r.nonce_reuse.collisions).toHaveLength(1);
        // The keystream cancels. This is P1 xor P2 and nothing else, which is the exploit as well
        // as the evidence -- and it is exactly what crib_drag takes as input.
        const expected = hex(p1.map((b, i) => b ^ p2[i]));
        expect(r.nonce_reuse.collisions[0].bodies_xored_hex).toBe(expected);
        expect(r.next).toMatch(/crib_drag/);
    });

    it("warns that offsets are meaningless when the samples are not the same length", async () => {
        const r = await run({ samples: [hex([1, 2, 3, 4, 5, 6]), hex([1, 2, 3])] });

        expect(r.lengths.uniform).toBe(false);
        expect(r.structure.caveat).toMatch(/only the common prefix was compared/);
    });

    it("says what a clean ECB result does and does not rule out", async () => {
        const r = await run({
            samples: [hex(Array.from({ length: 32 }, (_, i) => i)), hex(Array.from({ length: 32 }, (_, i) => 255 - i))]
        });

        // "No repeats" is not "not ECB". It is "no repeated plaintext block", which for short or
        // high-entropy plaintext is the expected result under ECB too.
        expect(r.ecb.assessment).toMatch(/rules out nothing at all/);
    });

    it("runs only the analyses asked for", async () => {
        const r = await run({ samples: [hex([1, 2, 3, 4]), hex([1, 2, 3, 5])], analyses: ["fields"] });
        expect(r.structure).toBeDefined();
        expect(r.ecb).toBeUndefined();
        expect(r.nonce_reuse).toBeUndefined();
    });

    it("skips the nonce check when the prefix length is zero", async () => {
        const r = await run({
            samples: [hex([1, 2, 3, 4]), hex([1, 2, 3, 5])], "nonce_prefix_bytes": 0
        });
        expect(r.nonce_reuse).toBeUndefined();
    });

    it("says so when no two samples share a nonce", async () => {
        const ascending = hex(Array.from({ length: 32 }, (_, i) => i));
        const descending = hex(Array.from({ length: 32 }, (_, i) => 255 - i));
        const r = await run({ samples: [ascending, descending] });
        expect(r.nonce_reuse.collisions).toHaveLength(0);
        expect(r.nonce_reuse.assessment).toMatch(/re-run with nonce_prefix_bytes/);
    });

    it("accepts raw and base64 as well as hex", async () => {
        const raw = await run({ samples: ["abcd", "abce"], "input_format": "Raw" });
        expect(raw.samples).toBe(2);
        const b64 = await run({
            samples: [Buffer.from([1, 2, 3, 4]).toString("base64"), Buffer.from([1, 2, 3, 5]).toString("base64")],
            "input_format": "Base64"
        });
        expect(b64.lengths.shortest).toBe(4);
    });

    it("rejects a sample that decodes to nothing", async () => {
        // Non-empty as a string, empty as bytes. The schema's min(1) catches the first case; this
        // is the one it cannot.
        await expect(run({ samples: [Buffer.from([1, 2]).toString("base64"), "  "], "input_format": "Base64" }))
            .rejects.toThrow(/decoded to nothing/);
    });

    it("rejects malformed hex rather than analysing whatever it decodes to", async () => {
        await expect(run({ samples: ["dead", "zz"] })).rejects.toThrow(/samples\[1\] is not valid hex/);
    });
});
