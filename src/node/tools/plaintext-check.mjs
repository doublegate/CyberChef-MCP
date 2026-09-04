/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Is this plaintext yet?
 *
 * Every automatic-decoding search needs one judgement it cannot avoid: has the candidate stopped
 * being ciphertext. `Magic` makes that judgement internally and never exposes it, and the raw
 * inputs -- `Entropy`, `Chi Square`, `Index of Coincidence`, `Frequency distribution` -- are all
 * operations, so a caller can compute the statistics and still not have the answer.
 *
 * WHAT THE RESEARCH CHANGED ABOUT THIS
 * ------------------------------------
 * The obvious design is to imitate Ciphey's checker stack or Ares' A* heuristic. Reading their
 * source rather than their READMEs says not to:
 *
 *   - Ciphey ships no working A*. `Searchers/__init__.py` is a single line importing `ausearch`,
 *     so `astar.py` is never registered -- and it reads `self.text` and `self.x`, which are never
 *     assigned. Its real search is depth-bucketed FIFO.
 *   - Ares does use A*, but BOTH production call sites pass `&None` for the decoder heuristic;
 *     only unit tests pass a value. Decoder popularity and success-rate adaptation never execute,
 *     and its `railfence` declares a popularity that would produce a negative cost if they did.
 *   - Ciphey's Brandon checker does no chi-squared despite its docstring; the chi-squared lives in
 *     the C++ core and feeds cracker ordering, not the plaintext decision.
 *
 * In all of them the intelligent-ordering layer is unused, mis-scaled or absent, and the boring
 * checks -- minimum length, printable ratio, dictionary hits on distinct words -- do the work. So
 * this implements the checks that demonstrably carry the load, and says which one decided.
 *
 * It answers with a VERDICT and the evidence for it, because a bare score is a number the caller
 * then has to threshold, which is the judgement they came here to avoid.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";

/** English letter frequencies, in percent, A-Z. */
const ENGLISH = [
    8.167, 1.492, 2.782, 4.253, 12.702, 2.228, 2.015, 6.094, 6.966, 0.153, 0.772, 4.025, 2.406,
    6.749, 7.507, 1.929, 0.095, 5.987, 6.327, 9.056, 2.758, 0.978, 2.360, 0.150, 1.974, 0.074
];

/**
 * The most common English words of three letters or more.
 *
 * Three or more deliberately: Ciphey's Brandon checker filters to `len > 2` and takes a `set()`
 * before applying its thresholds, so its published percentages are over DISTINCT words of three
 * or more characters -- the single most misread detail in that design, and one that makes the
 * thresholds meaningless if applied to raw token counts.
 */
const COMMON = new Set([
    "the", "and", "that", "have", "for", "not", "with", "you", "this", "but", "his", "from",
    "they", "say", "her", "she", "will", "one", "all", "would", "there", "their", "what", "out",
    "about", "who", "get", "which", "when", "make", "can", "like", "time", "just", "him", "know",
    "take", "into", "your", "some", "could", "them", "see", "other", "than", "then", "now", "look",
    "only", "come", "its", "over", "also", "back", "after", "use", "two", "how", "our", "work",
    "first", "well", "way", "even", "new", "want", "any", "these", "give", "day", "most", "was",
    "are", "were", "has", "had", "been", "more", "such", "where", "why", "man", "men", "people"
]);

/** Minimum length below which no statistic means anything. */
const MIN_LENGTH = 8;

/**
 * Index of coincidence: ~0.0667 for English, ~0.0385 for uniform random over 26 letters.
 *
 * @param {string} letters - Upper-case A-Z only.
 * @returns {number|null} The IoC, or null when there is too little text to compute one.
 */
function indexOfCoincidence(letters) {
    // 50 letters is the floor at which the statistic is citable. Below it the estimate swings so
    // widely that reporting a number would imply a precision the sample cannot support.
    if (letters.length < 50) return null;
    const counts = new Array(26).fill(0);
    for (const ch of letters) counts[ch.charCodeAt(0) - 65] += 1;
    let total = 0;
    for (const c of counts) total += c * (c - 1);
    return total / (letters.length * (letters.length - 1));
}

/**
 * Chi-squared against English letter frequencies. Lower is more English-like.
 *
 * @param {string} letters - Upper-case A-Z only.
 * @returns {number|null} The statistic, or null when there is too little text.
 */
function chiSquared(letters) {
    if (letters.length < 20) return null;
    const counts = new Array(26).fill(0);
    for (const ch of letters) counts[ch.charCodeAt(0) - 65] += 1;
    let sum = 0;
    for (let i = 0; i < 26; i++) {
        const expected = letters.length * ENGLISH[i] / 100;
        sum += (counts[i] - expected) ** 2 / expected;
    }
    return sum;
}

export default {
    name: "plaintext_check",
    title: "Plaintext check",
    category: "Analysis",
    description:
        "Decide whether a candidate is plaintext, and say which evidence decided it. This is the " +
        "judgement every automatic-decoding search has to make and that no CyberChef operation " +
        "exposes: Entropy, Chi Square and Index of Coincidence give the statistics, not the " +
        "verdict. Reports printable ratio, English word hits, chi-squared against English letter " +
        "frequencies and index of coincidence, with a verdict and the reason for it. Useful as " +
        "the stopping condition when you are peeling layers off unknown data by hand.",
    annotations: {
        title: "Plaintext check",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        input: z.string().min(1).max(1048576)
            .describe("The candidate. At most 1 MB."),
        language: z.enum(["english"]).default("english")
            .describe(
                "Which language model to score against. Only English is implemented; the " +
                "argument exists so a second one does not change the call shape.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} The verdict and the evidence behind it.
     */
    async run(args) {
        const text = args.input;
        if (!text.length) throw createInputError("Empty input.", {});

        // Printable ratio first, and it is the check that does most of the work in practice --
        // the same one that carries Ciphey and Ares while their heuristics sit unused.
        let printable = 0;
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            if ((code >= 32 && code < 127) || code === 9 || code === 10 || code === 13) printable++;
        }
        const printableRatio = printable / text.length;

        const letters = text.toUpperCase().replace(/[^A-Z]/g, "");
        const words = [...new Set(
            text.toLowerCase().split(/[^a-z']+/).filter(w => w.length > 2))];
        const hits = words.filter(w => COMMON.has(w));

        const ioc = indexOfCoincidence(letters);
        const chi = chiSquared(letters);
        const evidence = {
            length: text.length,
            "printable_ratio": Number(printableRatio.toFixed(4)),
            "letters": letters.length,
            "distinct_words_3plus": words.length,
            "common_word_hits": hits.length,
            "common_words_found": hits.slice(0, 12),
            "index_of_coincidence": ioc === null ? null : Number(ioc.toFixed(4)),
            "chi_squared": chi === null ? null : Number(chi.toFixed(1))
        };

        if (text.length < MIN_LENGTH) {
            return {
                verdict: "too short",
                confidence: "none",
                "decided_by": "length",
                evidence,
                note: `Under ${MIN_LENGTH} characters no statistic here means anything. This is a ` +
                    "refusal to guess, not a negative result.",
                next: "Decode more of the data, or judge this one by eye."
            };
        }

        // Ordered so the cheapest decisive evidence answers first, and so the reason returned is
        // the one that actually decided rather than the last one computed.
        if (printableRatio < 0.85) {
            return {
                verdict: "not plaintext",
                confidence: "high",
                "decided_by": "printable ratio",
                evidence,
                note: `${((1 - printableRatio) * 100).toFixed(1)}% of the bytes are not printable ` +
                    "ASCII. Whatever this is, a person cannot read it.",
                next: "cyberchef_magic to identify the encoding, or Detect File Type if it is binary."
            };
        }
        if (hits.length >= 2 && words.length >= 3) {
            return {
                verdict: "plaintext",
                confidence: hits.length >= 4 ? "high" : "moderate",
                "decided_by": "English words",
                evidence,
                note: `${hits.length} of the ${words.length} distinct words of three or more ` +
                    "characters are among the commonest in English. Word hits beat every " +
                    "statistic here: they are the check that survives short input, mixed case " +
                    "and punctuation.",
                next: "This looks like the answer. Stop decoding."
            };
        }
        if (chi !== null && ioc !== null && chi < 200 && ioc > 0.06) {
            return {
                verdict: "probably plaintext",
                confidence: "moderate",
                "decided_by": "letter statistics",
                evidence,
                note: "No common English words matched, but the letter frequencies and index of " +
                    "coincidence both look like natural language. That combination fits a " +
                    "substitution cipher's PLAINTEXT, a proper noun list, or a language other " +
                    "than English.",
                next: "Read it. If it is not English, the statistics cannot tell you which language."
            };
        }
        // 200 letters, not the 50 at which the statistic becomes computable. The two floors are
        // different questions and conflating them produced a confidently wrong answer: ROT13 of a
        // 52-letter sentence measured an IoC of 0.0332 and was called "not plaintext" with
        // moderate confidence. A monoalphabetic substitution PRESERVES the index of coincidence,
        // so that verdict is not merely uncertain, it is backwards -- the same text at 312 letters
        // measures 0.0487 and no longer trips this branch.
        //
        // A statistic you can compute is not a statistic you can decide on.
        if (ioc !== null && letters.length >= 200 && ioc < 0.045) {
            return {
                verdict: "not plaintext",
                confidence: "moderate",
                "decided_by": "index of coincidence",
                evidence,
                note: `An index of coincidence of ${ioc.toFixed(4)} is close to uniform random ` +
                    "(0.0385) and far from English (0.0667). That is the signature of a " +
                    "polyalphabetic cipher or of encrypted data, not of a substitution.",
                next: "If it is a repeating-key cipher, cyberchef_xor_key_length or a Vigenère " +
                    "analysis will find the period."
            };
        }
        return {
            verdict: "undecided",
            confidence: "low",
            "decided_by": "nothing conclusive",
            evidence,
            note: "Printable, but no common English words and no decisive letter statistics. " +
                "That fits a short string, an identifier, base64 that happens to be printable, " +
                "or a language this tool does not model.",
            next: "cyberchef_magic if you think it is still encoded; otherwise judge it by eye."
        };
    }
};
