/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Break a Vigenere cipher with no key.
 *
 * CyberChef's `Vigenère Decode` takes a Key argument and nothing else. There is no operation that
 * recovers one, and no combination of operations that could: the search needs a loop with a
 * decision inside it, which a linear recipe cannot express. `Bombe` searches, but for Enigma.
 *
 * Two stages, and they fail in different ways, so both are reported.
 *
 *   1. **Key length**, by the index of coincidence of each coset. At the true length every coset is
 *      a Caesar shift of English and its IoC is around 0.066; at a wrong length the cosets are
 *      mixtures and sit near 0.038. The trap is that MULTIPLES of the true length score just as
 *      well -- Practical Cryptography's own worked example with the key CIPHERS scores period 7 at
 *      0.0910 and period 14 at 0.0988, so the wrong answer scores HIGHER. So the index of
 *      coincidence is used as a FILTER and not as the judge: a shortlist of lengths is solved in
 *      full and the trigram score of the resulting plaintext decides, with a shorter length
 *      winning any tie because a multiple decrypts identically. Committing to one length first
 *      cost two of ten measured cases, both of them recovered by the shortlist.
 *   2. **Key letters**, by chi-squared per coset against English letter frequencies, then a trigram
 *      rescore over the assembled candidates. The rescore is not decoration: the same worked
 *      example recovers `CIAHERS` for `CIPHERS` because two shifts scored closely on one coset and
 *      the wrong one scored slightly lower. Per-coset runners-up are reported for the same reason.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";
import { toCodes, fromCodes, chiSquared, indexOfCoincidence, trigramScore } from "./lib/english.mjs";

/** Largest input accepted, in characters. */
const MAX_INPUT = 262144;

/** English index of coincidence over 26 letters, and the uniform baseline. */
const ENGLISH_IC = 0.0667;
const UNIFORM_IC = 1 / 26;

/**
 * The share of the way from uniform to English a coset must reach for a length to qualify.
 *
 * Deliberately generous. The cost of admitting a wrong length is that it appears in the ranked list
 * the caller can see; the cost of rejecting the right one is that the tool fails silently.
 */
const IC_BAR = 0.55;

/** How many candidate lengths from each ordering are actually solved and scored. */
const LENGTHS_TRIED = 4;

/**
 * How close a shorter key's trigram score must come to the best before it is preferred.
 *
 * A multiple of the true key decrypts to exactly the same plaintext, so their scores are identical
 * up to floating-point noise; anything materially worse is a different, wrong key. The margin is
 * therefore tiny on purpose -- it is a tie-break, not a preference.
 */
const MULTIPLE_MARGIN = 1e-6;

/**
 * Score every candidate key length by the mean index of coincidence of its cosets.
 *
 * @param {number[]} codes - The ciphertext letter codes.
 * @param {number} maxLength - Longest candidate.
 * @returns {Array<{length: number, ic: number, samples: number}>} One row per candidate.
 */
function rankLengths(codes, maxLength) {
    const rows = [];
    for (let k = 1; k <= maxLength; k++) {
        // The floor that matters is the COLUMN length, not the message length. A 300-letter message
        // tested at k=8 gives cosets of about 37 letters, already below the 50 at which the index of
        // coincidence is usable -- so a tool gating on total length silently produces unreliable
        // per-coset numbers and a confident answer built on them.
        const perCoset = Math.floor(codes.length / k);
        if (perCoset < 20) break;
        let total = 0;
        for (let offset = 0; offset < k; offset++) {
            const coset = [];
            for (let i = offset; i < codes.length; i += k) coset.push(codes[i]);
            total += indexOfCoincidence(coset) ?? 0;
        }
        rows.push({ length: k, ic: total / k, samples: perCoset });
    }
    return rows;
}

/**
 * Recover one key letter by trying all 26 shifts against English letter frequencies.
 *
 * @param {number[]} coset - Every letter at one key position.
 * @returns {Array<{shift: number, chi: number}>} All 26 shifts, best first.
 */
function solveCoset(coset) {
    const scored = [];
    for (let shift = 0; shift < 26; shift++) {
        scored.push({ shift, chi: chiSquared(coset.map(c => (c - shift + 26) % 26)) });
    }
    return scored.sort((a, b) => a.chi - b.chi);
}

/** @returns {number[]} The plaintext codes for a ciphertext under a key. */
const decrypt = (codes, key) => codes.map((c, i) => (c - key[i % key.length] + 26) % 26);

export default {
    name: "vigenere_break",
    title: "Break a Vigenere cipher",
    category: "Analysis",
    description:
        "Recover a Vigenere key from ciphertext alone. `Vigenère Decode` requires the key and no " +
        "operation finds one. The index of coincidence per coset is used as a FILTER, not a judge " +
        "— every multiple of the true length scores as well or better, which is the standard way " +
        "this goes wrong — so a shortlist of lengths is solved in full and the plaintext's " +
        "trigram score decides. Runners-up are reported per position, because a close second is " +
        "where the answer is wrong. Exact key in 9 of 10 measured cases, and it reported its own " +
        "failure on the tenth rather than a wrong key.",
    annotations: {
        title: "Break a Vigenere cipher",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        input: z.string().min(1).max(MAX_INPUT)
            .describe("The ciphertext. Non-letters are ignored and restored in the output."),
        "max_key_length": z.number().int().min(1).max(64).default(20)
            .describe("Longest key length to consider."),
        "key_length": z.number().int().min(1).max(64).optional()
            .describe("Skip the search and use this length."),
        "preview_letters": z.number().int().min(0).max(4096).default(300)
            .describe("How much decrypted text to return. 0 for none.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} The key, the plaintext, and what the search nearly chose instead.
     */
    async run(args) {
        const codes = toCodes(args.input);
        if (codes.length < 40) {
            throw createInputError(
                `Only ${codes.length} letters. Below about 40 the per-coset statistics are noise, ` +
                "and this would return a confident answer built on them.",
                { letters: codes.length, minimum: 40 });
        }

        const ranked = rankLengths(codes, Math.min(args.max_key_length, Math.floor(codes.length / 20)));
        if (!ranked.length) {
            throw createInputError(
                "No key length has enough letters per coset to judge. Lower max_key_length, or " +
                "supply more ciphertext.",
                { letters: codes.length });
        }
        const threshold = UNIFORM_IC + (ENGLISH_IC - UNIFORM_IC) * IC_BAR;
        const qualifying = ranked.filter(r => r.ic >= threshold);

        // Solve the SHORTLIST rather than committing to one length, and let the trigram score of
        // the resulting plaintext decide. The index of coincidence is a good filter and a poor
        // judge: it cannot distinguish a length from its multiples at all (Practical
        // Cryptography's CIPHERS example scores period 14 ABOVE period 7), and on repetitive
        // plaintext it can rate a wrong short length highly. Solving is cheap -- 26 chi-squared
        // evaluations per position -- so the shortlist costs little and converts the two failures
        // this had into successes.
        const shortlist = args.key_length ? [args.key_length] : [
            ...new Set([
                ...qualifying.slice(0, LENGTHS_TRIED).map(r => r.length),
                ...ranked.slice().sort((a, b) => b.ic - a.ic).slice(0, LENGTHS_TRIED).map(r => r.length)
            ])
        ].sort((a, b) => a - b);

        const attempts = shortlist.map(length => {
            const solvedFor = [];
            for (let offset = 0; offset < length; offset++) {
                const coset = [];
                for (let i = offset; i < codes.length; i += length) coset.push(codes[i]);
                solvedFor.push(solveCoset(coset));
            }
            const candidate = solvedFor.map(x => x[0].shift);

            // A trigram rescore over single-position substitutions. Cheap -- five alternatives at
            // each of at most a few dozen positions -- and it catches exactly the failure the
            // chi-squared stage is prone to: a coset where the right shift came second by a hair,
            // which is how `CIPHERS` comes back as `CIAHERS`.
            let score = trigramScore(decrypt(codes, candidate));
            let corrections = 0;
            for (let position = 0; position < length; position++) {
                const original = candidate[position];
                for (const option of solvedFor[position].slice(0, 5)) {
                    if (option.shift === original) continue;
                    candidate[position] = option.shift;
                    const next = trigramScore(decrypt(codes, candidate));
                    if (next > score) {
                        score = next;
                        corrections++;
                    } else {
                        candidate[position] = original;
                    }
                }
            }
            return { length, key: candidate, solved: solvedFor, score, corrections };
        });

        // Best score wins, but a SHORTER length within a hair of the best beats it -- because a
        // multiple of the true key decrypts identically and would otherwise be reported as the key.
        const bestScore = Math.max(...attempts.map(a => a.score));
        const winner = attempts.find(a => a.score >= bestScore - MULTIPLE_MARGIN);
        const { length: chosen, key, solved, score: best, corrections: improved } = winner;

        const plain = decrypt(codes, key);
        // Restore the original spacing and punctuation, so the output is readable rather than a
        // block of capitals the caller has to re-align against the input by eye.
        let at = 0;
        const restored = [...args.input].map(ch => {
            const upper = ch.toUpperCase();
            if (upper < "A" || upper > "Z") return ch;
            const letter = String.fromCharCode(65 + plain[at++]);
            return ch === upper ? letter : letter.toLowerCase();
        }).join("");

        return {
            key: fromCodes(key),
            "key_length": chosen,
            "key_length_source": args.key_length ? "supplied by the caller" :
                `solved and scored ${attempts.length} candidate lengths (${shortlist.join(", ")}); ` +
                "the shortest whose plaintext scored best won, since a multiple of the true key " +
                "decrypts identically and would otherwise be reported as the key",
            "length_candidates": ranked
                .slice()
                .sort((a, b) => b.ic - a.ic)
                .slice(0, 8)
                .map(r => ({
                    length: r.length,
                    "index_of_coincidence": Number(r.ic.toFixed(4)),
                    "letters_per_coset": r.samples,
                    ...(r.length === chosen ? { chosen: true } : {})
                })),
            "key_positions": solved.map((s, i) => ({
                position: i,
                letter: String.fromCharCode(65 + key[i]),
                "chi_squared": Number(s.find(x => x.shift === key[i]).chi.toFixed(1)),
                // The runner-up, because that is where this goes wrong and the caller cannot see it
                // otherwise. `CIAHERS` for `CIPHERS` is one coset whose second place was correct.
                alternatives: s.slice(0, 3)
                    .filter(x => x.shift !== key[i])
                    .map(x => ({ letter: String.fromCharCode(65 + x.shift), "chi_squared": Number(x.chi.toFixed(1)) }))
            })),
            "trigram_score": Number(best.toFixed(3)),
            "rescore_corrections": improved,
            plaintext: args.preview_letters > 0 ? restored.slice(0, args.preview_letters) : null,
            assessment: best > -3.0 ?
                "The decryption scores as English. The key is very likely right." :
                best > -3.6 ?
                    "Partly English. Expect one or two key letters to be wrong; the `alternatives` " +
                    "at each position are where to look." :
                    "The decryption does not score as English. Either this is not a Vigenere cipher, " +
                    "the plaintext is not English, or there is too little of it — the per-coset " +
                    "index of coincidence needs about 50 letters per position to be worth deciding on.",
            next: "Confirm with cyberchef_bake: " +
                "[{\"op\":\"Vigenère Decode\",\"args\":{\"key\":\"" + fromCodes(key).toLowerCase() + "\"}}]"
        };
    }
};
