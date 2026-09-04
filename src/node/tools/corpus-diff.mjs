/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Statistics computed ACROSS a set of samples, which is the one thing a CyberChef recipe cannot do.
 *
 * `Fork` applies the same recipe to each branch and each branch produces its own output. There is
 * no operation that takes N inputs and returns one answer about the relationship between them, so
 * "which byte offsets vary across these captures", "do any two of these ciphertext blocks repeat"
 * and "did two of these messages reuse a nonce" have no expression in the catalogue at all. That is
 * a structural gap rather than a missing algorithm, and it is the reason this is a registry tool.
 *
 * Three analyses, all O(N x L), no clustering machinery:
 *
 *   - **Field inference.** Per offset across the corpus: distinct values, entropy, and BIT-level
 *     variance. Bit level is strictly more informative than byte level and the difference is not
 *     academic -- a packed flag field or a sub-byte counter moves one bit and leaves the byte
 *     looking merely "variable". Adjacent offsets with matching variance profiles are grouped into
 *     runs, which is the practical core of what Discoverer (USENIX Security 2007) and FieldHunter
 *     do with far more machinery.
 *   - **ECB detection.** A repeated ciphertext block means a repeated plaintext block, which means
 *     the mode has no diffusion. Offsets are reported, not just a rate: WHERE the repeat sits tells
 *     you what the structure is.
 *   - **Nonce reuse.** Two messages sharing a leading prefix under a stream cipher or counter mode
 *     is catastrophic, and the XOR of the two bodies is both the evidence and the exploit -- the
 *     keystream cancels, exactly as in `crib_drag`, which is where that XOR should be taken next.
 *
 * Field inference assumes fixed-length or left-aligned samples and says so. Variable-length records
 * need an alignment pass first, which is precisely why the academic work needs the machinery this
 * deliberately omits.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";

/** Largest single sample, in bytes. */
const MAX_SAMPLE_BYTES = 65536;

/** Largest number of samples. The analyses are O(N x L), so this and the above bound the work. */
const MAX_SAMPLES = 512;

/**
 * Shannon entropy of a byte column, in bits.
 *
 * @param {Map<number, number>} counts - Byte value to occurrence count.
 * @param {number} total - Number of samples contributing.
 * @returns {number} Entropy in bits, 0 to 8.
 */
function columnEntropy(counts, total) {
    let h = 0;
    for (const count of counts.values()) {
        const p = count / total;
        h -= p * Math.log2(p);
    }
    return h;
}

/**
 * Decode one sample.
 *
 * @param {string} value - The text.
 * @param {string} format - Raw, Hex or Base64.
 * @param {number} index - Position in the input list, for the error message.
 * @returns {Uint8Array} The bytes.
 */
function decode(value, format, index) {
    if (format === "Raw") return Uint8Array.from(value, ch => ch.charCodeAt(0) & 0xff);
    const cleaned = format === "Hex" ? value.replace(/[\s,:]/g, "") : value.trim();
    if (format === "Hex" && (cleaned.length % 2 || !/^[0-9a-f]*$/i.test(cleaned))) {
        throw createInputError(`samples[${index}] is not valid hex.`, { index, received: value.slice(0, 60) });
    }
    return new Uint8Array(Buffer.from(cleaned, format === "Hex" ? "hex" : "base64"));
}

/**
 * Per-offset statistics, grouped into runs of adjacent offsets that behave alike.
 *
 * @param {Uint8Array[]} samples - The corpus.
 * @returns {{columns: Object[], fields: Object[]}} Per-offset detail and the inferred runs.
 */
function inferFields(samples) {
    const width = Math.min(...samples.map(s => s.length));
    const columns = [];
    for (let offset = 0; offset < width; offset++) {
        const counts = new Map();
        // Eight independent bit counters. A field that is one flag inside a byte changes exactly
        // one of these, and at byte level it is indistinguishable from a field that changes wholly.
        const bitOnes = new Array(8).fill(0);
        for (const sample of samples) {
            const byte = sample[offset];
            counts.set(byte, (counts.get(byte) ?? 0) + 1);
            for (let bit = 0; bit < 8; bit++) if (byte & (1 << bit)) bitOnes[bit]++;
        }
        const varyingBits = bitOnes.filter(ones => ones > 0 && ones < samples.length).length;
        columns.push({
            offset,
            distinct: counts.size,
            entropy: Number(columnEntropy(counts, samples.length).toFixed(3)),
            "varying_bits": varyingBits,
            constant: counts.size === 1,
            ...(counts.size === 1 ? { value: samples[0][offset] } : {})
        });
    }

    // Group adjacent offsets whose behaviour matches. Three classes rather than a continuum,
    // because the useful question is which offsets belong to the same field, and a numeric
    // similarity threshold would have to be tuned against a corpus this tool never sees.
    const classify = (c) => c.constant ? "constant" : c.distinct === samples.length ? "unique" : "varying";
    const fields = [];
    for (const column of columns) {
        const kind = classify(column);
        const last = fields[fields.length - 1];
        if (last && last.kind === kind) {
            last.length++;
            last.end = column.offset;
        } else {
            fields.push({ kind, offset: column.offset, end: column.offset, length: 1 });
        }
    }
    return {
        columns,
        fields: fields.map(f => ({
            offset: f.offset,
            length: f.length,
            kind: f.kind,
            note: {
                constant: "Identical in every sample: a magic number, a version, or padding.",
                unique: "Different in every sample: an identifier, a counter, a nonce, or a checksum.",
                varying: "Takes a few values: an enum, a type tag, or a small counter."
            }[f.kind]
        }))
    };
}

export default {
    name: "corpus_diff",
    title: "Corpus difference",
    category: "Analysis",
    description:
        "Compute statistics ACROSS a set of samples rather than within one — the thing a CyberChef " +
        "recipe cannot express, because `Fork` runs each branch separately and nothing combines " +
        "them. Infers record structure by per-offset byte AND bit variance across the corpus, " +
        "grouping adjacent offsets that behave alike into fields; detects ECB or any other " +
        "diffusion-free mode from repeated ciphertext blocks, reporting where they sit rather than " +
        "only how many; and detects nonce reuse between messages, emitting the XOR of the two " +
        "bodies, which is simultaneously the evidence and the way in. Assumes fixed-length or " +
        "left-aligned samples.",
    annotations: {
        title: "Corpus difference",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        samples: z.array(z.string().min(1).max(MAX_SAMPLE_BYTES * 2)).min(2).max(MAX_SAMPLES)
            .describe("The samples to compare. At least two; more makes every statistic here better."),
        "input_format": z.enum(["Raw", "Hex", "Base64"]).default("Hex")
            .describe("How the samples are encoded."),
        "block_size": z.number().int().min(4).max(256).default(16)
            .describe(
                "Cipher block size for the ECB check, in bytes. 16 for AES; 8 for DES, 3DES and " +
                "Blowfish."),
        "nonce_prefix_bytes": z.number().int().min(0).max(64).default(12)
            .describe(
                "How many leading bytes to treat as the nonce or IV when looking for reuse. 12 is " +
                "the GCM default; 16 for a CBC IV; 8 for ChaCha20's original nonce. 0 disables the check."),
        analyses: z.array(z.enum(["fields", "ecb", "nonce_reuse"])).optional()
            .describe("Which analyses to run. All of them by default.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} What the corpus shows that no single sample does.
     */
    async run(args) {
        const format = args.input_format;
        const samples = args.samples.map((s, i) => decode(s, format, i));
        for (const [i, sample] of samples.entries()) {
            if (sample.length > MAX_SAMPLE_BYTES) {
                throw createInputError(
                    `samples[${i}] is ${sample.length} bytes; the limit is ${MAX_SAMPLE_BYTES}.`,
                    { index: i, maximum: MAX_SAMPLE_BYTES });
            }
            if (sample.length === 0) {
                throw createInputError(`samples[${i}] decoded to nothing.`, { index: i });
            }
        }
        const requested = args.analyses?.length ? new Set(args.analyses) : new Set(["fields", "ecb", "nonce_reuse"]);
        const result = {
            samples: samples.length,
            lengths: {
                shortest: Math.min(...samples.map(s => s.length)),
                longest: Math.max(...samples.map(s => s.length)),
                uniform: new Set(samples.map(s => s.length)).size === 1
            }
        };

        if (requested.has("fields")) {
            const { columns, fields } = inferFields(samples);
            result.structure = {
                "offsets_compared": columns.length,
                fields,
                // The full per-offset detail is where a sub-byte field shows up, and it is also the
                // part that gets long. Capped, with the cap stated, rather than truncated silently.
                columns: columns.slice(0, 256),
                ...(columns.length > 256 ? { "columns_truncated_at": 256 } : {}),
                caveat: result.lengths.uniform ?
                    "Samples are all the same length, which is what this analysis assumes." :
                    `Samples differ in length (${result.lengths.shortest}-${result.lengths.longest} ` +
                    "bytes) and only the common prefix was compared. If the records are not " +
                    "left-aligned, these offsets do not line up and the fields are meaningless."
            };
        }

        if (requested.has("ecb")) {
            const size = args.block_size;
            const findings = [];
            for (const [index, sample] of samples.entries()) {
                const seen = new Map();
                const repeats = [];
                for (let offset = 0; offset + size <= sample.length; offset += size) {
                    const block = Buffer.from(sample.subarray(offset, offset + size)).toString("hex");
                    if (seen.has(block)) repeats.push({ block, offsets: [seen.get(block), offset] });
                    else seen.set(block, offset);
                }
                if (repeats.length) findings.push({ sample: index, repeats: repeats.slice(0, 16) });
            }
            // Blocks repeated ACROSS samples matter too, and only this tool can see them: identical
            // blocks in two different messages mean the same key AND the same plaintext block.
            const across = new Map();
            for (const [index, sample] of samples.entries()) {
                for (let offset = 0; offset + args.block_size <= sample.length; offset += args.block_size) {
                    const block = Buffer.from(sample.subarray(offset, offset + args.block_size)).toString("hex");
                    if (!across.has(block)) across.set(block, []);
                    across.get(block).push({ sample: index, offset });
                }
            }
            const shared = [...across.entries()]
                .filter(([, places]) => new Set(places.map(p => p.sample)).size > 1)
                .slice(0, 16)
                .map(([block, places]) => ({ block, places }));
            result.ecb = {
                "block_size": size,
                "samples_with_repeats": findings.length,
                findings,
                "blocks_shared_between_samples": shared,
                assessment: findings.length || shared.length ?
                    "A repeated ciphertext block means a repeated plaintext block, which means the " +
                    "mode has no diffusion — ECB, or a stream cipher with a reused keystream. Where " +
                    "the repeats sit tells you the record structure." :
                    `No repeated ${size}-byte block. That rules out ECB over data with any repetition ` +
                    "in it, and rules out nothing at all for high-entropy or short plaintext."
            };
        }

        if (requested.has("nonce_reuse") && args.nonce_prefix_bytes > 0) {
            const prefix = args.nonce_prefix_bytes;
            const groups = new Map();
            for (const [index, sample] of samples.entries()) {
                if (sample.length <= prefix) continue;
                const nonce = Buffer.from(sample.subarray(0, prefix)).toString("hex");
                if (!groups.has(nonce)) groups.set(nonce, []);
                groups.get(nonce).push(index);
            }
            const collisions = [...groups.entries()].filter(([, list]) => list.length > 1);
            Object.assign(result, { "nonce_reuse": {
                "prefix_bytes": prefix,
                collisions: collisions.slice(0, 16).map(([nonce, indices]) => {
                    const [a, b] = [samples[indices[0]], samples[indices[1]]];
                    const length = Math.min(a.length, b.length) - prefix;
                    const xored = Buffer.from(
                        Array.from({ length }, (_, i) => a[prefix + i] ^ b[prefix + i])).toString("hex");
                    return {
                        nonce,
                        samples: indices,
                        // The XOR is the evidence AND the exploit. Under any keystream cipher the
                        // keystream cancels and this is P1 xor P2 -- the exact input crib_drag takes.
                        "bodies_xored_hex": xored.slice(0, 512),
                        ...(xored.length > 512 ? { truncated: true } : {})
                    };
                }),
                assessment: collisions.length ?
                    "Two messages share a leading prefix. Under a stream cipher or a counter mode " +
                    "that is a total loss of confidentiality for both: the keystream cancels in " +
                    "their XOR. The WOOT '16 survey found 184 HTTPS servers repeating GCM nonces, " +
                    "which fully breaks authenticity as well." :
                    `No two samples share their first ${prefix} bytes. If the real nonce is a ` +
                    "different length, or is not at the front, re-run with nonce_prefix_bytes set to it."
            } });
        }

        result.next =
            "Feed a `bodies_xored_hex` straight into crib_drag as `ciphertext` with input_format " +
            "Hex — it is already P1 xor P2, so a crib guessed in one message reads out the other.";
        return result;
    }
};
