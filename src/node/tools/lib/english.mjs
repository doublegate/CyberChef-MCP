/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The English language model the cipher-breaking tools share, and the scoring built on it.
 *
 * One module rather than a copy per tool, because a fitness function that differs between two
 * solvers is a fitness function whose thresholds cannot be compared -- and comparing them is
 * exactly what a caller does when one tool says "this is Vigenere" and the other says "this is a
 * substitution".
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { TRIGRAM_TABLE_B64 } from "./english-trigrams.mjs";

/** Relative frequency of A-Z in English, from the data-compression.com table. */
export const LETTER_FREQ = [
    0.0651738, 0.0124248, 0.0217339, 0.0349835, 0.1041442, 0.0197881, 0.0158610, 0.0492888,
    0.0558094, 0.0009033, 0.0050529, 0.0331490, 0.0202124, 0.0564513, 0.0596302, 0.0137645,
    0.0008606, 0.0497563, 0.0515760, 0.0729357, 0.0225134, 0.0082903, 0.0171272, 0.0013692,
    0.0145984, 0.0007836
];

/**
 * Trigram log-probabilities, indexed `a*676 + b*26 + c` over A=0..Z=25.
 *
 * Decoded once at module load. The floor for an unobserved trigram is `log10(0.01 / total)`, which
 * follows the released `ngram_score.py` rather than the article's table -- the two differ by a
 * factor of ten, and every published threshold is calibrated against the code. A threshold from
 * one is meaningless against the other.
 */
export const TRIGRAM_LOGP = (() => {
    const bytes = Buffer.from(TRIGRAM_TABLE_B64, "base64");
    // A Buffer's underlying ArrayBuffer may be a slice of a larger pool, so the byteOffset matters:
    // constructing the view without it reads whatever else the pool happens to hold.
    const packed = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    let total = 0;
    for (const count of packed) total += count;
    const floor = Math.log10(0.01 / total);
    const out = new Float32Array(packed.length);
    for (let i = 0; i < packed.length; i++) out[i] = packed[i] ? Math.log10(packed[i] / total) : floor;
    return out;
})();

/**
 * Whether a single code point counts as one letter, and the code it maps to.
 *
 * Exported because the solvers restore the original spacing and case by walking the input in step
 * with the plaintext codes, and the two sides MUST use the same rule. They did not: `toCodes`
 * uppercased the whole string first, so `"ß"` became `"SS"` and produced TWO codes, while the
 * restore walk tested `ch.toUpperCase()` against the range `"A"` to `"Z"` -- which `"SS"` satisfies
 * as a string comparison -- and consumed ONE. Every letter after that point came back shifted by
 * one, and a long enough tail read past the end of the plaintext into `String.fromCharCode(NaN)`.
 *
 * Reproduced: "Straße ..." decrypted to "Strase ..." with the rest of the sentence intact but the
 * indices off by one. The ligatures `ﬁ`, `ﬂ` and `ﬀ` do the same; `"ŉ"` does the reverse, since its
 * uppercase `"ʼN"` fails the range test while the old `toCodes` kept the `N`.
 *
 * One predicate now, used by both, so they cannot disagree.
 *
 * @param {string} ch - A single code point.
 * @returns {number} 0-25 for a letter, or -1.
 */
export function letterCode(ch) {
    const upper = ch.toUpperCase();
    // `length === 1` is the whole fix: a code point whose uppercase form EXPANDS is not one letter,
    // and treating it as one is what desynchronised the two walks.
    if (upper.length !== 1 || upper < "A" || upper > "Z") return -1;
    return upper.charCodeAt(0) - 65;
}

/** @returns {number[]} A-Z as 0-25, everything else dropped. */
export const toCodes = (text) =>
    [...text].map(letterCode).filter(code => code >= 0);

/** @returns {string} Letter codes rendered back to text. */
export const fromCodes = (codes) => codes.map(c => String.fromCharCode(65 + c)).join("");

/**
 * Mean trigram log-probability per position.
 *
 * Normalised by length so that scores from texts of different lengths are comparable, which is what
 * a caller ranking candidate keys needs and what a raw sum does not give.
 *
 * @param {number[]} codes - Letter codes.
 * @returns {number} Mean log10 probability; higher is more English-like.
 */
export function trigramScore(codes) {
    if (codes.length < 3) return -Infinity;
    let total = 0;
    for (let i = 0; i + 2 < codes.length; i++) {
        total += TRIGRAM_LOGP[codes[i] * 676 + codes[i + 1] * 26 + codes[i + 2]];
    }
    return total / (codes.length - 2);
}

/**
 * A trigram histogram of a ciphertext, prepared for repeated scoring under different keys.
 *
 * This is what makes hill-climbing affordable. Scoring a candidate key by decrypting the whole text
 * is O(n) per evaluation and a solve needs hundreds of thousands of evaluations; scoring it by
 * walking the DISTINCT trigrams is O(number of distinct trigrams), which for English tops out in
 * the low thousands and does not grow with the text after that. On a 350-letter ciphertext the
 * difference is roughly a factor of ten, and it grows from there.
 *
 * @param {number[]} codes - The ciphertext letter codes.
 * @returns {Int32Array} Flattened triples of (a, b, c, count).
 */
export function trigramHistogram(codes) {
    const counts = new Map();
    for (let i = 0; i + 2 < codes.length; i++) {
        const key = codes[i] * 676 + codes[i + 1] * 26 + codes[i + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const out = new Int32Array(counts.size * 4);
    let at = 0;
    for (const [key, count] of counts) {
        out[at++] = Math.floor(key / 676);
        out[at++] = Math.floor(key / 26) % 26;
        out[at++] = key % 26;
        out[at++] = count;
    }
    return out;
}

/**
 * Score a substitution key against a prepared histogram.
 *
 * @param {Int32Array} histogram - From `trigramHistogram`.
 * @param {number[]|Uint8Array} key - Maps a ciphertext letter code to a plaintext letter code.
 * @returns {number} Total log-probability. Comparable only against the same histogram.
 */
export function scoreKey(histogram, key) {
    let total = 0;
    for (let i = 0; i < histogram.length; i += 4) {
        total += histogram[i + 3] *
            TRIGRAM_LOGP[key[histogram[i]] * 676 + key[histogram[i + 1]] * 26 + key[histogram[i + 2]]];
    }
    return total;
}

/**
 * Chi-squared of a letter distribution against English.
 *
 * @param {number[]} codes - Letter codes.
 * @returns {number} The statistic; lower is more English-like.
 */
export function chiSquared(codes) {
    if (!codes.length) return Infinity;
    const counts = new Array(26).fill(0);
    for (const c of codes) counts[c]++;
    let chi = 0;
    for (let i = 0; i < 26; i++) {
        const expected = LETTER_FREQ[i] * codes.length;
        const delta = counts[i] - expected;
        chi += delta * delta / expected;
    }
    return chi;
}

/**
 * Index of coincidence over the 26-letter alphabet, without replacement.
 *
 * `f(f-1)/(N(N-1))` rather than `sum(f^2)/N^2`: the latter is biased upward and diverges at small N,
 * which is precisely the regime a per-column key-length search operates in.
 *
 * @param {number[]} codes - Letter codes.
 * @returns {number|null} The statistic, or null below the length at which it can be computed.
 */
export function indexOfCoincidence(codes) {
    const n = codes.length;
    if (n < 2) return null;
    const counts = new Array(26).fill(0);
    for (const c of codes) counts[c]++;
    let sum = 0;
    for (const f of counts) sum += f * (f - 1);
    return sum / (n * (n - 1));
}
