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

    it("merges overlapping windows into one region, not one region per window", async () => {
        // With any step smaller than the window, the next window STARTS before the previous one
        // ends. An equality test never merges, so a single 2 KB blob came back as 29 regions --
        // which then compete with each other for the max_regions slots.
        const data = Buffer.concat([Buffer.alloc(512, 0x41), randomBytes(2048), Buffer.alloc(512, 0x41)]);
        const r = await run({
            input: raw(data), "input_format": "Raw", "window_bytes": 256, "step_bytes": 64
        });

        expect(r.regions).toHaveLength(1);
        expect(r.regions[0].start).toBe(512);
        expect(r.regions[0].end).toBe(2560);
    });

    it("rejects malformed base64 as strictly as malformed hex", async () => {
        await expect(run({ input: "not base64 at all!!", "input_format": "Base64" }))
            .rejects.toThrow(/not valid base64/);
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

    it("refuses a window count that would hold the server for tens of seconds", async () => {
        // The bound is (bytes - window) / step, NOT the input size, and the schema permits a
        // one-byte step. Measured before the fix: 8 MB at window 16 step 1 is 8.4 million windows
        // and 29,219 ms, against the 30-second timeout every operation tool is held to -- one
        // legal call holding the event loop for twenty-nine seconds with no way to interrupt it.
        await expect(run({
            input: raw(randomBytes(1048576)), "input_format": "Raw",
            "window_bytes": 16, "step_bytes": 1
        })).rejects.toThrow(/windows, and the limit is/);
    });

    it("says which step_bytes would fit rather than only that this one does not", async () => {
        try {
            await run({
                input: raw(randomBytes(1048576)), "input_format": "Raw",
                "window_bytes": 16, "step_bytes": 1
            });
            throw new Error("should have been refused");
        } catch (error) {
            // A refusal that does not name the way out is a refusal the caller has to guess past.
            expect(error.context?.hint ?? error.message).toMatch(/step_bytes of at least \d+ fits/);
        }
    });

    it("stays interruptible and still separates regions on a large input", async () => {
        // Large enough to cross the yield interval, and shaped so the region sort has more than
        // one region to order. Both were uncovered: the yield callback never ran on a small input,
        // and a single region never exercises the comparator that ranks them by peak entropy.
        const blob = () => randomBytes(4096);
        const gap = () => Buffer.alloc(4096, 0x41);
        const data = Buffer.concat([blob(), gap(), blob(), gap(), blob()]);
        // Window 256, not 64: a 64-byte window holds at most 64 distinct values, so its entropy
        // cannot exceed 6 bits and nothing ever reaches the 7.0 threshold. The window has to be
        // wide enough for the statistic to be able to say what the test is asking it to say.
        const r = await run({
            input: raw(data), "input_format": "Raw", "window_bytes": 256, "step_bytes": 4
        });

        expect(r.windows_measured).toBeGreaterThan(4096);
        expect(r.regions.length).toBeGreaterThan(1);
        for (let i = 1; i < r.regions.length; i++) {
            expect(r.regions[i - 1].peak_entropy).toBeGreaterThanOrEqual(r.regions[i].peak_entropy);
        }
    }, 30000);

    it("rejects malformed hex", async () => {
        await expect(run({ input: "zzzz", "input_format": "Hex" })).rejects.toThrow(/not valid hex/);
    });
});
