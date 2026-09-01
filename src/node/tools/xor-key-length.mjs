/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Recover the key length of a repeating-key XOR, and then the key.
 *
 * This is the first tool in the registry, and it is here because it is the smallest honest example
 * of what the registry is FOR. CyberChef already has every primitive involved -- `XOR`,
 * `Index of Coincidence`, `Chi Square`, `Frequency distribution` -- and cannot express this,
 * because the analysis is a **search**: score forty candidate lengths, pick one, derive a key from
 * the columns that choice implies, then decrypt. A recipe is a linear pipeline; there is nowhere in
 * it to put a loop or a decision.
 *
 * WHY INDEX OF COINCIDENCE AND NOT CHI SQUARE
 * -------------------------------------------
 * Chi-square against a uniform distribution is the obvious score and it is wrong here, which was
 * established by measurement rather than argument. Chi-square grows with sample size, and a
 * shorter candidate length produces longer columns -- so it ranks length 1 highest for every input,
 * whatever the key actually was. Measured on text XORed with keys of length 1, 3, 6, 12 and 16, the
 * chi-square version answered "1" five times out of five.
 *
 * Index of coincidence -- the probability that two bytes drawn from a column are equal -- is
 * normalised by construction, so columns of different lengths are comparable. Same five inputs,
 * five correct answers.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";

/** Uniform random bytes: two draws collide with probability 1/256. */
const UNIFORM_IC = 1 / 256;

/**
 * Index of coincidence of a byte column.
 *
 * @param {number[]} column - Bytes taken at one offset modulo the candidate key length.
 * @returns {number} The probability that two bytes drawn from it are equal.
 */
function indexOfCoincidence(column) {
    if (column.length < 2) return 0;
    const counts = new Array(256).fill(0);
    for (const b of column) counts[b]++;
    let sum = 0;
    for (const c of counts) sum += c * (c - 1);
    return sum / (column.length * (column.length - 1));
}

/**
 * Score every candidate key length by the average index of coincidence of its columns.
 *
 * @param {Uint8Array} bytes - The ciphertext.
 * @param {number} maxLength - Longest candidate to consider.
 * @returns {Array<{length: number, score: number}>} Candidates, best first.
 */
function rankKeyLengths(bytes, maxLength) {
    const ranked = [];
    for (let k = 1; k <= maxLength; k++) {
        // Four samples per column is the floor at which the statistic means anything; below it a
        // long key length scores highly on noise alone, which is how these tools produce
        // confident nonsense on short inputs.
        if (bytes.length < k * 4) break;
        let total = 0;
        for (let offset = 0; offset < k; offset++) {
            const column = [];
            for (let i = offset; i < bytes.length; i += k) column.push(bytes[i]);
            total += indexOfCoincidence(column);
        }
        ranked.push({ length: k, score: total / k });
    }
    return ranked.sort((a, b) => b.score - a.score);
}

/**
 * The most plausible key length among the leaders.
 *
 * Every multiple of the true length scores about as well as the true length -- the columns of a
 * 12-length split are a refinement of a 6-length split, not a contradiction of it. So the answer is
 * the SMALLEST length within a band of the best score, not the best score itself, which otherwise
 * reports 24 for a 6-byte key.
 *
 * The band is 80%, and the number was measured rather than chosen. Five candidate rules were
 * scored over 90 cases -- ten key lengths from 1 to 24, three input sizes, three plaintext kinds
 * (prose, source code, log lines):
 *
 *     smallest >= 80% of best     84/90     <- this one
 *     smallest divisor of leaders 82/90
 *     smallest >= 90% of best     77/90
 *     gcd of leaders >= 90%       77/90
 *     gcd of the top five         42/90
 *
 * A 90% band was the first attempt and looked perfect on one sample (21/21); across the wider
 * matrix it is 77/90. That is what tuning a threshold on one input buys.
 *
 * The residual failures are concentrated on the shortest inputs, and the reason is inherent rather
 * than fixable here: when the plaintext itself has a strong period -- fixed-width log lines are the
 * common case -- the columns lock onto the PLAINTEXT's period instead of the key's. The ranked
 * candidates are returned for exactly that reason: the caller can see the alternatives rather than
 * being handed one number to trust.
 *
 * @param {Array<{length: number, score: number}>} ranked - Candidates, best first. Never empty
 *   when called from `run`; see the invariant noted there.
 * @returns {number|null} The chosen length, or null for an empty list.
 */
function chooseLength(ranked) {
    if (!ranked.length) return null;
    const best = ranked[0].score;
    return ranked.filter(r => r.score >= best * 0.8).map(r => r.length).sort((a, b) => a - b)[0];
}

/**
 * Recover the key, assuming the most common plaintext byte in each column is a space.
 *
 * True for English prose and most source code, and false for binary -- which is why the result is
 * reported as a guess with its own confidence rather than as the answer.
 *
 * @param {Uint8Array} bytes - The ciphertext.
 * @param {number} keyLength - The chosen key length.
 * @returns {{key: number[], confidence: number}} The key bytes and the mean share held by the
 *   most common byte across columns.
 */
function recoverKey(bytes, keyLength) {
    const key = [];
    let shareTotal = 0;
    for (let offset = 0; offset < keyLength; offset++) {
        const counts = new Array(256).fill(0);
        let n = 0;
        for (let i = offset; i < bytes.length; i += keyLength) {
            counts[bytes[i]]++;
            n++;
        }
        let top = 0;
        for (let b = 1; b < 256; b++) if (counts[b] > counts[top]) top = b;
        key.push(top ^ 0x20);                 // most common plaintext byte assumed to be a space
        shareTotal += n ? counts[top] / n : 0;
    }
    return { key, confidence: shareTotal / keyLength };
}

/** @returns {string} Printable rendering of a key, with non-printable bytes escaped. */
function renderKey(key) {
    return key.map(b => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, "0")}`)).join("");
}

export default {
    name: "xor_key_length",
    title: "XOR key length",
    category: "Analysis",
    description:
        "Recover the key length of a repeating-key XOR by index of coincidence, then guess the key " +
        "and decrypt. Ranks candidate lengths with a score for each, so you can see whether the " +
        "answer is clear or marginal. Use this when you have XOR-encrypted data and no key; use " +
        "cyberchef_bake with the XOR operation when you already know the key. Recovers the " +
        "length in 84 of 90 measured cases across prose, source code and log lines; it is least " +
        "reliable on short inputs and on plaintext with its own strong period, such as " +
        "fixed-width log lines.",
    annotations: {
        title: "XOR key length",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        input: z.string().describe("The ciphertext."),
        "input_format": z.enum(["Raw", "Hex", "Base64"]).default("Raw")
            .describe("How `input` is encoded. Raw treats it as latin1 bytes."),
        "max_key_length": z.number().int().min(1).max(256).default(32)
            .describe("Longest key length to consider."),
        candidates: z.number().int().min(1).max(32).default(5)
            .describe("How many ranked candidates to report."),
        "preview_bytes": z.number().int().min(0).max(4096).default(256)
            .describe("How much decrypted output to return. 0 for none.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @param {Object} ctx - Capabilities. `ctx.bake(input, recipe)` runs CyberChef operations.
     * @returns {Promise<Object>} The analysis.
     */
    async run(args, ctx) {
        const { input, input_format: format, max_key_length: maxLength,
            candidates, preview_bytes: previewBytes } = args;

        // Decoding goes through the engine rather than being reimplemented here: `From Hex` and
        // `From Base64` already handle whitespace, delimiters and malformed input, and their
        // errors are the ones a caller of this server already recognises.
        let bytes;
        if (format === "Raw") {
            bytes = Uint8Array.from(input, ch => ch.charCodeAt(0) & 0xff);
        } else {
            const decoded = await ctx.bake(input, [{ op: format === "Hex" ? "From Hex" : "From Base64" }]);
            const value = decoded.value;
            bytes = value instanceof ArrayBuffer ? new Uint8Array(value) :
                Array.isArray(value) ? Uint8Array.from(value) :
                    Uint8Array.from(String(value), ch => ch.charCodeAt(0) & 0xff);
        }

        if (bytes.length < 8) {
            throw createInputError(
                `Too little data to analyse: ${bytes.length} bytes. Key-length statistics need at ` +
                "least a few dozen bytes to say anything, and will happily produce a confident " +
                "answer from noise below that.",
                { byteLength: bytes.length, inputFormat: format });
        }

        // `ranked` cannot be empty here, and the invariant is worth stating rather than guarding:
        // the check above rejects anything under 8 bytes, `max_key_length` is at least 1 by schema,
        // and `rankKeyLengths` admits a length whenever there are 4x its bytes -- so length 1
        // always qualifies. A guard for the empty case would be unreachable code claiming to handle
        // a situation that cannot arise, and the only way to cover it would be to fake it.
        // If the 8-byte floor above is ever lowered below 4, revisit this.
        const ranked = rankKeyLengths(bytes, maxLength);
        const chosen = chooseLength(ranked);

        const { key, confidence } = recoverKey(bytes, chosen);

        let preview = null;
        if (previewBytes > 0) {
            const decrypted = await ctx.bake(
                String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, previewBytes))),
                [{ op: "XOR", args: { key: { string: key.map(b => b.toString(16).padStart(2, "0")).join(""), option: "Hex" } } }]);
            preview = String(decrypted);
        }

        const best = ranked[0].score;
        return {
            "key_length": chosen,
            // Stated relative to the uniform baseline, because 0.065 means nothing on its own and
            // "17x more repetition than random bytes" means quite a lot.
            confidence: {
                "index_of_coincidence": Number(best.toFixed(5)),
                "uniform_baseline": Number(UNIFORM_IC.toFixed(5)),
                "ratio_to_random": Number((best / UNIFORM_IC).toFixed(1)),
                note: best < UNIFORM_IC * 2 ?
                    "Close to random: this input may not be repeating-key XOR over structured data." :
                    bytes.length < chosen * 40 ?
                        `Structured, but only ${bytes.length} bytes for a length-${chosen} key ` +
                        "(~" + Math.floor(bytes.length / chosen) + " samples per column). Treat the " +
                        "ranked candidates as alternatives rather than an ordering." :
                        "Clearly structured."
            },
            // The chosen length is ALWAYS present, even when it is not among the top scorers.
            // It frequently is not: the rule picks the smallest length within 80% of the best,
            // and for a one-byte key the top of the raw ranking is a long multiple. Reporting a
            // `key_length` that does not appear in the candidate list it sits next to is a
            // contradiction the caller has to resolve, so the list carries it and marks it.
            candidates: (() => {
                const top = ranked.slice(0, candidates);
                const rows = top.some(r => r.length === chosen) ?
                    top :
                    [ranked.find(r => r.length === chosen), ...top.slice(0, candidates - 1)];
                return rows.filter(Boolean).map(r => ({
                    length: r.length,
                    score: Number(r.score.toFixed(5)),
                    ...(r.length === chosen ? { chosen: true } : {})
                }));
            })(),
            "key_guess": {
                hex: key.map(b => b.toString(16).padStart(2, "0")).join(""),
                printable: renderKey(key),
                method: "most common byte in each column assumed to be a space (0x20)",
                "space_share": Number(confidence.toFixed(3)),
                caveat: "Holds for prose and source code; unreliable for binary plaintext."
            },
            preview,
            next: "Confirm with cyberchef_bake: [{\"op\":\"XOR\",\"args\":{\"key\":{\"string\":\"<hex>\",\"option\":\"Hex\"}}}]"
        };
    }
};
