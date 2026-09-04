/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Crib dragging: pull a guessed fragment of plaintext along a ciphertext and see where it fits.
 *
 * The whole tool rests on one cancellation. For a repeating or one-time key,
 *
 *     C1 = P1 xor K,  C2 = P2 xor K   =>   C1 xor C2 = P1 xor P2
 *
 * The key is gone. Guess a substring of P1 at some offset, XOR it into `C1 xor C2` there, and what
 * comes out is the corresponding substring of P2 -- and if it reads like language, the guess was
 * right and you have just learned a piece of the OTHER message. Accept it, and it becomes the next
 * crib to drag against P1. That alternation is the technique, and it is why this tool returns
 * fragments to feed back rather than a decryption.
 *
 * The same algebra serves the single-ciphertext known-plaintext case with no second code path,
 * because `crib xor C` is the key there rather than the other plaintext. What changes is what makes
 * a hit believable, and in that case there is a much stronger test than printability -- see
 * `key_length` below.
 *
 * Modelled on SpiderLabs/cribdrag (GPLv3, Daniel Crowley, DEF CON 21). Three of its design choices
 * are kept deliberately: every offset is printed rather than only the hits, candidates are FLAGGED
 * rather than sorted away, and the charset test is ANCHORED so one bad byte disqualifies a
 * fragment. See THIRD-PARTY-NOTICES.md.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";
import { ENGLISH_BYTE_FREQ } from "./xor-key-length.mjs";

/** Largest ciphertext accepted, in bytes. The scan is O(input x crib), so this bounds it directly. */
const MAX_BYTES = 262144;

/**
 * Mean log-probability per byte against English.
 *
 * Length-normalised on purpose. Cryptopals' challenge 4 needs a score comparable ACROSS inputs of
 * different lengths -- the whole exercise is picking one line out of many -- and a raw chi-squared
 * or log-probability SUM is length-dependent, so it ranks long fragments above good ones.
 *
 * A byte-level model rather than quadgrams. Quadgram log-probability separates English from
 * wrong-key output by about four decades and is the right instrument for scoring a whole candidate
 * plaintext, but its published table is 389,373 entries and 3.3 MB, and its own author puts the
 * practical floor at 100 characters -- "you will have trouble breaking ciphers less than 100
 * characters in length". Crib fragments are five to twenty bytes. At that length the statistic is
 * BIASED rather than merely noisy, so the larger model would buy nothing here.
 *
 * @param {number[]} bytes - The candidate fragment.
 * @returns {number} Mean log10 probability per byte; higher is more English-like.
 */
function englishScore(bytes) {
    if (!bytes.length) return -Infinity;
    let total = 0;
    for (const b of bytes) total += Math.log10(ENGLISH_BYTE_FREQ[b]);
    return total / bytes.length;
}

/**
 * Whether every byte of a fragment is inside the permitted character class.
 *
 * Anchored, in cribdrag's sense: a single byte outside the class disqualifies the whole fragment.
 * That is the point -- a real hit produces text throughout, and a near-miss produces text with one
 * control character in the middle of it.
 *
 * @param {number[]} bytes - The candidate fragment.
 * @returns {boolean} Whether all of them are printable ASCII, tab, newline or carriage return.
 */
const allPrintable = (bytes) =>
    bytes.every(b => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127));

/** @returns {string} A fragment rendered with non-printable bytes escaped. */
const render = (bytes) =>
    bytes.map(b => (b >= 32 && b < 127 ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, "0")}`)).join("");

/**
 * Decode an input according to its declared format.
 *
 * @param {string} value - The text.
 * @param {string} format - Raw, Hex or Base64.
 * @param {string} label - Field name, for the error message.
 * @returns {number[]} The bytes.
 */
function decode(value, format, label) {
    if (format === "Raw") return [...value].map(ch => ch.charCodeAt(0) & 0xff);
    const cleaned = format === "Hex" ? value.replace(/[\s,:]/g, "") : value.trim();
    if (format === "Hex" && (cleaned.length % 2 || !/^[0-9a-f]*$/i.test(cleaned))) {
        throw createInputError(`${label} is not valid hex.`, { field: label, received: value.slice(0, 60) });
    }
    return [...Buffer.from(cleaned, format === "Hex" ? "hex" : "base64")];
}

export default {
    name: "crib_drag",
    title: "Crib drag",
    category: "Analysis",
    description:
        "Drag a guessed plaintext fragment along a XOR ciphertext and report every offset where " +
        "it fits, ranked. With TWO ciphertexts under one key their XOR cancels the key, so a crib " +
        "guessed in one message yields the matching span of the OTHER. With ONE ciphertext and a " +
        "known fragment it yields key bytes instead; supply `key_length` and periodicity becomes " +
        "a far stronger filter than printability, recovering the whole key when the crib is at " +
        "least as long as it.",
    annotations: {
        title: "Crib drag",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        ciphertext: z.string().min(1).max(MAX_BYTES * 2).describe("The ciphertext to drag along."),
        "ciphertext_b": z.string().max(MAX_BYTES * 2).optional()
            .describe(
                "A second ciphertext under the SAME key. Every hit is then a span of the other " +
                "plaintext. Omit it to recover key bytes instead."),
        crib: z.string().min(1).max(256).describe("The guessed plaintext fragment, e.g. \" the \"."),
        "input_format": z.enum(["Raw", "Hex", "Base64"]).default("Hex")
            .describe("How the ciphertexts are encoded. The crib is always literal text."),
        "key_length": z.number().int().min(1).max(4096).optional()
            .describe(
                "Single-ciphertext mode only: the repeating key's length, if known. Derived bytes " +
                "must then agree mod this length, which rejects far more offsets than printability."),
        top: z.number().int().min(1).max(200).default(10)
            .describe("How many offsets to report, best first."),
        "printable_only": z.boolean().default(true)
            .describe("Report only fully printable results. False when the plaintext is not text.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} The ranked offsets, and what each one means in the mode used.
     */
    async run(args) {
        const format = args.input_format;
        const a = decode(args.ciphertext, format, "ciphertext");
        const b = args.ciphertext_b ? decode(args.ciphertext_b, format, "ciphertext_b") : null;
        const crib = [...args.crib].map(ch => ch.charCodeAt(0) & 0xff);

        if (a.length > MAX_BYTES || (b && b.length > MAX_BYTES)) {
            throw createInputError(
                `Ciphertexts are limited to ${MAX_BYTES} bytes; the scan is O(input x crib).`,
                { maximum: MAX_BYTES });
        }

        // In two-ciphertext mode the key is already gone, and the working buffer is only as long as
        // the SHORTER message -- past that there is nothing to cancel against.
        const target = b ? a.slice(0, Math.min(a.length, b.length)).map((x, i) => x ^ b[i]) : a;
        if (target.length < crib.length) {
            throw createInputError(
                `The crib is ${crib.length} bytes and there are only ${target.length} to drag it ` +
                "along. In two-ciphertext mode the usable length is that of the shorter message.",
                { cribLength: crib.length, available: target.length });
        }

        const keyLength = b ? null : (args.key_length ?? null);
        const results = [];
        for (let offset = 0; offset + crib.length <= target.length; offset++) {
            const out = crib.map((c, i) => c ^ target[offset + i]);

            // The periodicity constraint, and it is much stronger than printability. In the
            // single-ciphertext repeating-key case a true hit at offset i must be consistent with
            // the key at i mod k -- so a fragment longer than k has to be internally periodic with
            // period k, which almost no wrong offset is. A wrong offset can easily be printable;
            // it can hardly ever be periodic.
            let periodic = null;
            if (keyLength) {
                periodic = true;
                for (let i = 0; i < out.length - keyLength && periodic; i++) {
                    if (out[i] !== out[i + keyLength]) periodic = false;
                }
                if (!periodic) continue;
            }

            const printable = allPrintable(out);
            if (args.printable_only && b && !printable) continue;
            results.push({
                offset,
                result: render(out),
                score: Number(englishScore(out).toFixed(3)),
                ...(b ? { printable } : {}),
                ...(periodic === null ? {} : { "key_consistent": periodic })
            });
        }

        results.sort((x, y) => y.score - x.score);
        const shown = results.slice(0, args.top);

        // With a known key length and a crib at least that long, one accepted hit is the whole key
        // -- every key byte is covered by the fragment's first `keyLength` bytes.
        let recoveredKey = null;
        if (keyLength && shown.length && crib.length >= keyLength) {
            const bytes = shown[0].result;
            recoveredKey = {
                offset: shown[0].offset,
                hex: crib.slice(0, keyLength)
                    .map((c, i) => (c ^ target[shown[0].offset + i]).toString(16).padStart(2, "0")).join(""),
                note: `The crib is at least as long as the key, so the best-scoring offset covers ` +
                    `every key byte at once. Confirm it by decrypting: ${bytes.slice(0, 24)}`
            };
        }

        return {
            mode: b ?
                "two ciphertexts under one key — every result is a span of the OTHER plaintext" :
                "one ciphertext with a known fragment — every result is a span of the KEY",
            // The ranking function is only meaningful in one of the two modes, and saying which
            // matters more than the ordering does. In two-ciphertext mode the result IS plaintext
            // and an English score ranks it properly. In single-ciphertext mode the result is KEY
            // material -- often a word, so not noise, but not prose either -- so the score is a
            // weak hint and `key_length` is the filter that actually decides. Presenting the two
            // orderings as equally trustworthy would be the misleading part.
            "score_meaning": b ?
                "How English-like the recovered plaintext span is. A sound ranking in this mode." :
                "How English-like the recovered KEY bytes are. Weak: keys are often words but are " +
                "not prose, so a correct offset can rank below a wrong one. Supply key_length — " +
                "periodicity decides this mode, not the score.",
            "offsets_examined": target.length - crib.length + 1,
            "offsets_reported": shown.length,
            results: shown,
            ...(recoveredKey ? { "recovered_key": recoveredKey } : {}),
            assessment: shown.length === 0 ?
                keyLength ?
                    "No offset produced a key fragment consistent with that key length. Either the " +
                    "crib is wrong, or the key length is." :
                    "No offset produced a fully printable result. Try a shorter crib, or set " +
                    "printable_only to false if the plaintext is not text." :
                `${shown.length} offsets survived. Ranking is a length-normalised English score, ` +
                "so it is comparable across offsets — but scoring a five-byte fragment is guesswork " +
                "at the edges, which is why every surviving offset is listed rather than only the best.",
            next: b ?
                "Take a plausible result, and drag it back as the crib for the other message. " +
                "Alternating between the two is how the pair unwinds." :
                "Pass a recovered key to cyberchef_bake: " +
                "[{\"op\":\"XOR\",\"args\":{\"key\":{\"string\":\"<hex>\",\"option\":\"Hex\"}}}]"
        };
    }
};
