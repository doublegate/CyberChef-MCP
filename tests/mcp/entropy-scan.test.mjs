/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Where the entropy is, and what a high number does not prove.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import tool from "../../src/node/tools/entropy-scan.mjs";

const raw = (buffer) => buffer.toString("latin1");
const run = (args) => tool.run(tool.inputSchema.parse(args));

describe("entropy_scan", () => {
    it("locates a dense region between two sparse ones", async () => {
        const data = Buffer.concat([
            Buffer.alloc(2048, 0x41), randomBytes(4096), Buffer.alloc(1024, 0x41)
        ]);
        const r = await run({ input: raw(data), "input_format": "Raw" });

        // The offsets are the whole point. A curve shows density; only a region says "there is a
        // 4 KB blob starting at 2048", which is what a carve needs.
        expect(r.regions).toHaveLength(1);
        expect(r.regions[0].start).toBe(2048);
        expect(r.regions[0].length).toBe(4096);
    });

    it("merges adjacent windows into one region", async () => {
        const r = await run({ input: raw(randomBytes(8192)), "input_format": "Raw" });
        // Thirty-two consecutive hits are one finding, not thirty-two. Reporting them separately
        // buries the only fact that matters.
        expect(r.regions).toHaveLength(1);
        expect(r.windows_measured).toBe(32);
    });

    it("applies the packed rule as a conjunction of two thresholds", async () => {
        const r = await run({ input: raw(randomBytes(8192)), "input_format": "Raw" });
        expect(r.packed_test.rule).toMatch(/mean > 6.677 AND peak > 7.199/);
        expect(r.packed_test.verdict).toBe("Both thresholds cleared.");
    });

    it("counts only blocks that are at least half non-zero", async () => {
        // Alignment padding otherwise drags the mean down, which is the omission that makes the
        // Lyda and Hamrock rule look like it does not work.
        const data = Buffer.concat([randomBytes(2048), Buffer.alloc(8192, 0)]);
        const r = await run({ input: raw(data), "input_format": "Raw" });
        expect(r.packed_test.blocks_counted).toBe(8);      // 2048/256, the zero blocks excluded
    });

    it("separates compressed-looking from encrypted-looking on the second axis", async () => {
        const structured = Buffer.from(Array.from({ length: 8192 }, (_, i) => (i * 7) % 200));
        const uniform = randomBytes(8192);

        const a = await run({ input: raw(structured), "input_format": "Raw" });
        const b = await run({ input: raw(uniform), "input_format": "Raw" });

        // Both are dense. Only one is uniform, and entropy alone cannot tell them apart.
        expect(a.second_axis.chi_squared).toBeGreaterThan(b.second_axis.chi_squared * 4);
        expect(a.second_axis.reading).toMatch(/COMPRESSION or/);
        expect(b.second_axis.reading).toMatch(/consistent with encrypted/);
    });

    it("says what a clean scan does not establish", async () => {
        const r = await run({ input: raw(Buffer.alloc(4096, 0x41)), "input_format": "Raw" });
        expect(r.regions).toHaveLength(0);
        expect(r.assessment).toMatch(/real negative/);
    });

    it("says what a positive does not establish either", async () => {
        const r = await run({ input: raw(randomBytes(4096)), "input_format": "Raw" });
        // 7.0 is folklore. NDSS 2020 calibrated it as roughly what XOR with a three-byte key
        // produces, and found over 30% of low-entropy malware packed anyway.
        expect(r.assessment).toMatch(/THREE-BYTE KEY/);
        expect(r.assessment).toMatch(/not evidence of absence/);
    });

    it("refuses a window larger than the data instead of measuring it once", async () => {
        await expect(run({ input: raw(randomBytes(64)), "input_format": "Raw", "window_bytes": 256 }))
            .rejects.toThrow(/window larger than the data/);
    });

    it("supports overlapping windows", async () => {
        const r = await run({
            input: raw(randomBytes(1024)), "input_format": "Raw",
            "window_bytes": 256, "step_bytes": 64
        });
        expect(r.windows_measured).toBe(13);
    });

    it("accepts base64 as well as hex and raw", async () => {
        const data = Buffer.alloc(1024, 0x41);
        const r = await run({ input: data.toString("base64"), "input_format": "Base64" });
        expect(r.bytes).toBe(1024);
    });

    it("rejects an input that decodes to nothing", async () => {
        await expect(run({ input: "  ", "input_format": "Base64" })).rejects.toThrow(/decoded to nothing/);
    });

    it("caps the region list", async () => {
        const r = await run({ input: raw(randomBytes(8192)), "input_format": "Raw", "max_regions": 1 });
        expect(r.regions).toHaveLength(1);
    });

    it("rejects malformed hex", async () => {
        await expect(run({ input: "zzzz", "input_format": "Hex" })).rejects.toThrow(/not valid hex/);
    });
});
