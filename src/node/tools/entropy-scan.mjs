/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Where in this file is the entropy high, and what does that actually license you to conclude?
 *
 * CyberChef's `Entropy` operation has a "Curve" mode, and it is close to this without being it: the
 * bin size is hardcoded at 256 bytes, there is no threshold, and the output is a chart rather than
 * a list of regions. So it can show you that something is dense; it cannot tell you where the dense
 * part starts and stops, which is the question a carve or a key hunt actually asks.
 *
 * **The 7.0 threshold is folklore and this tool does not use it alone.** The sourced rule is Lyda
 * and Hamrock's (IEEE S&P 2007), and it is a CONJUNCTION of two numbers, not one: mean file entropy
 * above 6.677 AND highest-block entropy above 7.199, over 256-byte blocks. The detail almost always
 * dropped is that only blocks with at least half their bytes non-zero are counted, because
 * alignment padding otherwise drags the score down. Their own table: plain text 4.347/4.715, native
 * executables 5.099/6.227, packed 6.801/7.233, encrypted 7.175/7.303.
 *
 * And the threshold is weak as an inference regardless. Mantovani et al. (NDSS 2020) found over 30%
 * of 50,000 low-entropy Windows malware samples were nonetheless runtime-packed, and calibrated
 * what the number means: real x86 `.text` measures 6.2 +/- 0.3, XOR with a two-byte key gives
 * 6.7 +/- 0.3, and 7.0 "is obtained on average by xor-ing the code with a key of 3 bytes". So
 * "entropy above 7" means "has been XORed with a key of three bytes or more", which is a very low
 * bar to clear and not a finding on its own.
 *
 * Hence the second axis. Chi-squared and serial correlation separate COMPRESSED data from properly
 * encrypted data, which entropy alone cannot: both are near 8 bits per byte, and only one of them
 * has structure left.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";

/** Largest input accepted, in bytes. The scan is O(n), but the region list is what a caller reads. */
const MAX_BYTES = 8388608;

/**
 * Most windows a single scan will measure.
 *
 * The bound that matters is not the input size, it is `(bytes - window) / step` -- and the schema
 * permits 8 MB with a one-byte step, which is 8.4 million windows. Measured: **29,219 ms**, against
 * the 30-second timeout every operation tool is held to. One legal call therefore sat on the event
 * loop for twenty-nine seconds, starving every other request on a shared server, and the timeout
 * could not fire because the work is synchronous.
 *
 * 500,000 windows is about 1.2 seconds at the measured 2.3 us per window. It is also far more than
 * anyone reads: `max_regions` caps the output at 256 regions, so a scan producing millions of
 * windows is measuring detail that never leaves the function.
 *
 * Refused rather than silently downsampled. Quietly widening the step would answer a different
 * question from the one asked, at a resolution the caller did not choose.
 */
const MAX_WINDOWS = 500000;

/** Windows measured between yields. Keeps a long scan interruptible; costs nothing measurable. */
const YIELD_EVERY = 4096;

/** Lyda and Hamrock's two thresholds, and their block size. */
const BINTROPY_MEAN = 6.677;
const BINTROPY_PEAK = 7.199;
const BINTROPY_BLOCK = 256;

/**
 * Shannon entropy of a byte range, in bits per byte.
 *
 * @param {Uint8Array} bytes - The data.
 * @param {number} start - First offset.
 * @param {number} end - One past the last offset.
 * @returns {number} Entropy, 0 to 8.
 */
function entropy(bytes, start, end) {
    const counts = new Uint32Array(256);
    for (let i = start; i < end; i++) counts[bytes[i]]++;
    const n = end - start;
    let h = 0;
    for (const count of counts) {
        if (!count) continue;
        const p = count / n;
        h -= p * Math.log2(p);
    }
    return h;
}

/**
 * Chi-squared of the byte distribution against uniform, and the serial correlation coefficient.
 *
 * These are the second axis, and their job is to separate compressed from encrypted. Both sit near
 * 8 bits of entropy per byte; only compressed data still has structure, and it shows up here as a
 * chi-squared far from the 255 degrees of freedom a uniform source would give.
 *
 * Chunked with a yield between chunks. It is a single linear pass, but a linear pass over the
 * 8 MB the schema permits is a full second of unbroken synchronous work, and a second is enough to
 * starve every other request on a shared server.
 *
 * @param {Uint8Array} bytes - The data.
 * @returns {Promise<{chiSquared: number, serialCorrelation: number}>} Both statistics.
 */
async function uniformityStats(bytes) {
    const counts = new Uint32Array(256);
    for (const b of bytes) counts[b]++;
    const expected = bytes.length / 256;
    let chi = 0;
    for (const count of counts) {
        const delta = count - expected;
        chi += delta * delta / expected;
    }

    // Serial correlation over the byte sequence, wrapping at the end as `ent` does.
    let t1 = 0;
    let t2 = 0;
    let t3 = 0;
    const CHUNK = 1 << 20;
    for (let start = 0; start < bytes.length; start += CHUNK) {
        if (start > 0) await new Promise(resolve => setImmediate(resolve));
        const end = Math.min(start + CHUNK, bytes.length);
        for (let i = start; i < end; i++) {
            const next = bytes[(i + 1) % bytes.length];
            t1 += bytes[i] * next;
            t2 += bytes[i];
            t3 += bytes[i] * bytes[i];
        }
    }
    const n = bytes.length;
    const numerator = n * t1 - t2 * t2;
    const denominator = n * t3 - t2 * t2;
    return {
        chiSquared: chi,
        serialCorrelation: denominator === 0 ? 0 : numerator / denominator
    };
}

/**
 * Decode an input according to its declared format.
 *
 * @param {string} value - The text.
 * @param {string} format - Raw, Hex or Base64.
 * @returns {Uint8Array} The bytes.
 */
function decode(value, format) {
    // `Buffer.from(value, "latin1")` rather than `Uint8Array.from(value, ch => ch.charCodeAt(0) & 0xff)`.
    // Byte-identical -- latin1 takes the low byte of each UTF-16 code unit, which is what the
    // mapper did -- and measured at **14 ms against 675 ms** on 8 MB. The per-character
    // callback is the whole cost, and it was the largest single block of synchronous work in
    // any of these tools.
    if (format === "Raw") return new Uint8Array(Buffer.from(value, "latin1"));
    const cleaned = format === "Hex" ? value.replace(/[\s,:]/g, "") : value.trim();
    if (format === "Hex" && (cleaned.length % 2 || !/^[0-9a-f]*$/i.test(cleaned))) {
        throw createInputError("The input is not valid hex.", { received: value.slice(0, 60) });
    }
    return new Uint8Array(Buffer.from(cleaned, format === "Hex" ? "hex" : "base64"));
}

export default {
    name: "entropy_scan",
    title: "Entropy scan",
    category: "Analysis",
    description:
        "Find WHERE a file's entropy is high, not just whether it is: contiguous regions above a " +
        "threshold, with offsets. CyberChef's `Entropy` curve has a fixed 256-byte bin, no " +
        "threshold and no region output. Applies Lyda and Hamrock's packed-binary rule (a " +
        "CONJUNCTION of mean > 6.677 and peak > 7.199, not the single 7.0 usually quoted) and " +
        "adds chi-squared and serial correlation as a second axis, which is what separates " +
        "compressed from encrypted. Reports what a high number does and does not establish.",
    annotations: {
        title: "Entropy scan",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        input: z.string().min(1).max(MAX_BYTES * 2).describe("The data."),
        "input_format": z.enum(["Raw", "Hex", "Base64"]).default("Raw")
            .describe("How `input` is encoded."),
        "window_bytes": z.number().int().min(16).max(65536).default(256)
            .describe(
                "Window size for the sliding scan. 256 is the sourced figure; a larger window " +
                "hides encryption that exists only in small areas."),
        "step_bytes": z.number().int().min(1).max(65536).optional()
            .describe("Distance between windows. Defaults to the window size, i.e. no overlap."),
        threshold: z.number().min(0).max(8).default(7.0)
            .describe(
                "Bits per byte above which a window counts as high-entropy. 7.0 is conventional " +
                "and weak; the report says why."),
        "max_regions": z.number().int().min(1).max(256).default(32)
            .describe("How many regions to return.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} The regions, the two-threshold verdict, and the second axis.
     */
    async run(args) {
        const bytes = decode(args.input, args.input_format);
        if (bytes.length === 0) throw createInputError("The input decoded to nothing.", {});
        const window = args.window_bytes;
        const step = args.step_bytes ?? window;
        if (bytes.length < window) {
            throw createInputError(
                `The input is ${bytes.length} bytes and the window is ${window}. A window larger ` +
                "than the data measures the whole thing once, which is what the Entropy operation " +
                "already does.",
                { bytes: bytes.length, window });
        }

        const windowCount = Math.floor((bytes.length - window) / step) + 1;
        if (windowCount > MAX_WINDOWS) {
            throw createInputError(
                `That is ${windowCount.toLocaleString("en")} windows, and the limit is ` +
                `${MAX_WINDOWS.toLocaleString("en")}. The scan is bounded by (bytes - window) / ` +
                "step rather than by the input size, and at this resolution it would hold the " +
                "server for tens of seconds. Raise step_bytes.",
                {
                    windows: windowCount,
                    maximum: MAX_WINDOWS,
                    hint: `step_bytes of at least ${Math.ceil((bytes.length - window) / MAX_WINDOWS)} ` +
                        "fits, and the region list is capped at max_regions regardless, so a finer " +
                        "step mostly produces detail that never leaves the tool."
                });
        }

        const windows = [];
        let sinceYield = 0;
        for (let offset = 0; offset + window <= bytes.length; offset += step) {
            // Yield periodically. The bound above keeps this near a second, but a second of
            // unbroken synchronous work still starves every other request on a shared server and
            // leaves the call timeout unable to fire.
            if (++sinceYield >= YIELD_EVERY) {
                sinceYield = 0;
                await new Promise(resolve => setImmediate(resolve));
            }
            windows.push({ offset, entropy: entropy(bytes, offset, offset + window) });
        }

        // Contiguous runs above the threshold, merged. Adjacent windows are one region: reporting
        // fourteen consecutive 256-byte hits as fourteen findings buries the one fact that matters,
        // which is that there is a 3.5 KB blob starting at a particular offset.
        const regions = [];
        for (const w of windows) {
            const last = regions[regions.length - 1];
            if (w.entropy >= args.threshold) {
                if (last && last.end === w.offset) {
                    last.end = w.offset + window;
                    last.peak = Math.max(last.peak, w.entropy);
                    last.windows++;
                    last.total += w.entropy;
                } else {
                    regions.push({
                        start: w.offset, end: w.offset + window,
                        peak: w.entropy, total: w.entropy, windows: 1
                    });
                }
            }
        }

        // Lyda and Hamrock's rule, on their own block size regardless of the scan window. Only
        // blocks at least half non-zero count -- alignment padding otherwise drags the mean down,
        // and that omission is why the rule is so often reported as not working.
        const blocks = [];
        for (let offset = 0; offset + BINTROPY_BLOCK <= bytes.length; offset += BINTROPY_BLOCK) {
            if ((blocks.length & (YIELD_EVERY - 1)) === 0) await new Promise(resolve => setImmediate(resolve));
            let nonZero = 0;
            for (let i = offset; i < offset + BINTROPY_BLOCK; i++) if (bytes[i]) nonZero++;
            if (nonZero * 2 >= BINTROPY_BLOCK) {
                blocks.push(entropy(bytes, offset, offset + BINTROPY_BLOCK));
            }
        }
        const bintropyMean = blocks.length ? blocks.reduce((a, b) => a + b, 0) / blocks.length : null;
        const bintropyPeak = blocks.length ? Math.max(...blocks) : null;
        const packed = bintropyMean !== null &&
            bintropyMean > BINTROPY_MEAN && bintropyPeak > BINTROPY_PEAK;

        const stats = await uniformityStats(bytes);
        const overall = entropy(bytes, 0, bytes.length);

        return {
            bytes: bytes.length,
            "overall_entropy": Number(overall.toFixed(3)),
            "window_bytes": window,
            "step_bytes": step,
            "windows_measured": windows.length,
            regions: regions
                .sort((a, b) => b.peak - a.peak)
                .slice(0, args.max_regions)
                .map(r => ({
                    start: r.start,
                    end: Math.min(r.end, bytes.length),
                    length: Math.min(r.end, bytes.length) - r.start,
                    "peak_entropy": Number(r.peak.toFixed(3)),
                    "mean_entropy": Number((r.total / r.windows).toFixed(3))
                })),
            "packed_test": {
                rule: "Lyda & Hamrock: mean > 6.677 AND peak > 7.199 over 256-byte blocks that are " +
                    "at least half non-zero",
                "blocks_counted": blocks.length,
                "mean_entropy": bintropyMean === null ? null : Number(bintropyMean.toFixed(3)),
                "peak_entropy": bintropyPeak === null ? null : Number(bintropyPeak.toFixed(3)),
                verdict: blocks.length === 0 ?
                    "Not applicable: no 256-byte block was even half non-zero." :
                    packed ? "Both thresholds cleared." : "At least one threshold not cleared.",
                reference: "Their table: plain text 4.347/4.715, native executables 5.099/6.227, " +
                    "packed 6.801/7.233, encrypted 7.175/7.303."
            },
            "second_axis": {
                "chi_squared": Number(stats.chiSquared.toFixed(1)),
                "expected_if_uniform": 255,
                "serial_correlation": Number(stats.serialCorrelation.toFixed(4)),
                reading: stats.chiSquared > 1000 ?
                    "Chi-squared is far from uniform. High entropy here is COMPRESSION or " +
                    "structured data, not encryption — the bytes are dense but not evenly spread." :
                    "Chi-squared is near uniform, which is consistent with encrypted or " +
                    "well-compressed data. It does not distinguish the two."
            },
            assessment: regions.length === 0 ?
                `Nothing reached ${args.threshold} bits per byte in a ${window}-byte window. ` +
                "For a large file that is a real negative; for a small one it may only mean the " +
                "window is larger than the interesting part." :
                `${regions.length} region(s) above ${args.threshold} bits per byte. Read that ` +
                "carefully: 7.0 is folklore, not a sourced threshold, and NDSS 2020 calibrated it " +
                "as roughly what XOR with a THREE-BYTE KEY produces — a very low bar. The same " +
                "study found over 30% of low-entropy malware packed anyway, so a clean scan is not " +
                "evidence of absence either.",
            next: "Carve a region with cyberchef_bake and `Drop bytes` / `Take bytes`, then try " +
                "cyberchef_magic or xor_key_length on it."
        };
    }
};
