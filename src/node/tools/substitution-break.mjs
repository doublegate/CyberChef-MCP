/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Break a monoalphabetic substitution cipher with no key.
 *
 * CyberChef's `Substitute` requires the mapping. There is no operation that finds one, and there
 * cannot be one: the search is hill-climbing with random restarts, which is a loop with a decision
 * inside it, and a linear recipe has no way to express that.
 *
 * The method is Practical Cryptography's, with its published parameters: swap two key letters at
 * random, accept only improvements, stop a climb after 1000 non-improving swaps, and restart from
 * a fresh random key many times keeping the global best. It is hill-climbing with restarts, not
 * simulated annealing -- that site publishes no temperature schedule anywhere, and attributing one
 * to it is a common error.
 *
 * **What it will and will not do.** Measured on four held-out prose passages with 120 restarts:
 *
 *     100 letters    63.3% of letters recovered
 *     150 letters    83.6%
 *     250 letters    91.2%
 *     350 letters    95.9%
 *
 * So at a few hundred letters it recovers most of the mapping and typically leaves one or two
 * letter pairs swapped -- 9 of 12 reach 95% of letters at 350, and 0 of 12 do at 100. That is a
 * solution, and the output says so. It is also why `known_mapping` exists: pinning the letters you
 * can already read and re-running is how the last pairs come out, and it is what a human does.
 *
 * The theoretical floor is 28 characters (the unicity distance for simple substitution) and the
 * practical one is around 100, verbatim from the same source: "you will have trouble breaking
 * ciphers less than 100 characters in length."
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";
import { toCodes, fromCodes, trigramHistogram, scoreKey, trigramScore } from "./lib/english.mjs";

/** Largest input accepted, in characters. */
const MAX_INPUT = 262144;

/** Fewest letters worth attempting. Below the unicity distance the answer is not determined at all. */
const MIN_LETTERS = 28;

/** Non-improving swaps before a climb is abandoned. Practical Cryptography's published figure. */
const STALE_LIMIT = 1000;

/** Wall-clock ceiling, so a large `restarts` cannot outlive the call timeout. */
const BUDGET_MS = 20000;

/**
 * One hill climb from a random starting key.
 *
 * @param {Int32Array} histogram - The ciphertext's trigram histogram.
 * @param {Uint8Array} pinned - 26 entries: a plaintext code, or 255 for unpinned.
 * @param {Function} random - Returns a float in [0, 1).
 * @returns {{key: Uint8Array, score: number}} The local optimum reached.
 */
function climb(histogram, pinned, random) {
    const key = new Uint8Array(26);
    const free = [];
    const used = new Set();
    for (let i = 0; i < 26; i++) {
        if (pinned[i] !== 255) {
            key[i] = pinned[i];
            used.add(pinned[i]);
        } else {
            free.push(i);
        }
    }
    const available = [];
    for (let i = 0; i < 26; i++) if (!used.has(i)) available.push(i);
    for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
    }
    free.forEach((slot, i) => {
        key[slot] = available[i];
    });

    // Only unpinned positions are ever swapped, which is what makes `known_mapping` a real
    // constraint rather than a starting hint the search immediately discards.
    if (free.length < 2) return { key, score: scoreKey(histogram, key) };
    let score = scoreKey(histogram, key);
    let stale = 0;
    while (stale < STALE_LIMIT) {
        const a = free[Math.floor(random() * free.length)];
        const b = free[Math.floor(random() * free.length)];
        if (a === b) {
            stale++;
            continue;
        }
        [key[a], key[b]] = [key[b], key[a]];
        const next = scoreKey(histogram, key);
        if (next > score) {
            score = next;
            stale = 0;
        } else {
            [key[a], key[b]] = [key[b], key[a]];
            stale++;
        }
    }
    return { key, score };
}

/**
 * A seeded generator, so a caller can reproduce a solve exactly.
 *
 * Deterministic on request rather than by default: the search genuinely benefits from independent
 * restarts, and a fixed seed that produced a bad local optimum would produce it every time. But an
 * irreproducible answer is not one anybody can debug, so the seed is offered.
 *
 * @param {number|null} seed - The seed, or null for a non-deterministic source.
 * @returns {Function} A function returning floats in [0, 1).
 */
function generator(seed) {
    if (seed === null) return Math.random;
    // mulberry32: 32 bits of state, adequate for shuffling a 26-element array.
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export default {
    name: "substitution_break",
    title: "Break a substitution cipher",
    category: "Analysis",
    description:
        "Recover a monoalphabetic substitution mapping from ciphertext alone, by hill-climbing " +
        "on English trigram fitness with random restarts. `Substitute` needs the mapping and no " +
        "operation finds one. Also solves Caesar, ROT-N and Atbash. Measured on held-out prose: " +
        "83.6% of letters at 150, 91.2% at 250, 95.9% at 350 — so expect one or two letter pairs " +
        "still swapped. Pin what you can read with `known_mapping` and run it again.",
    annotations: {
        title: "Break a substitution cipher",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
    },
    inputSchema: z.object({
        input: z.string().min(1).max(MAX_INPUT)
            .describe("The ciphertext. Non-letters are ignored and restored in the output."),
        restarts: z.number().int().min(1).max(2000).default(120)
            .describe(
                "Independent hill climbs. More is better and slower; the measured figures used " +
                "120. Bounded by a 20-second wall clock."),
        "known_mapping": z.string().max(128).default("")
            .describe(
                "Letters you already know, as comma-separated `cipher:plain` pairs, e.g. " +
                "\"q:t,w:h\". Held fixed and never swapped."),
        seed: z.number().int().min(0).max(4294967295).optional()
            .describe(
                "Make the search reproducible. Unset is non-deterministic, which is the right " +
                "default: a fixed seed that lands in a bad local optimum lands there every time."),
        "preview_letters": z.number().int().min(0).max(4096).default(400)
            .describe("How much decrypted text to return. 0 for none.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} The mapping, the plaintext, and how far to trust it.
     */
    async run(args) {
        const codes = toCodes(args.input);
        if (codes.length < MIN_LETTERS) {
            throw createInputError(
                `Only ${codes.length} letters. ${MIN_LETTERS} is the unicity distance for a simple ` +
                "substitution — below it the plaintext is not determined by the ciphertext at all, " +
                "so more than one mapping produces sensible English and no amount of searching can " +
                "choose between them.",
                { letters: codes.length, minimum: MIN_LETTERS });
        }

        const pinned = new Uint8Array(26).fill(255);
        if (args.known_mapping.trim()) {
            for (const pair of args.known_mapping.split(",")) {
                const match = /^\s*([A-Za-z])\s*:\s*([A-Za-z])\s*$/.exec(pair);
                if (!match) {
                    throw createInputError(
                        `"${pair.trim()}" is not a cipher:plain pair. Use single letters, e.g. "q:t".`,
                        { received: pair.trim(), expected: "cipher:plain, comma separated" });
                }
                pinned[match[1].toUpperCase().charCodeAt(0) - 65] = match[2].toUpperCase().charCodeAt(0) - 65;
            }
            const plains = [...pinned].filter(v => v !== 255);
            if (new Set(plains).size !== plains.length) {
                throw createInputError(
                    "known_mapping sends two cipher letters to the same plaintext letter. A " +
                    "substitution is a permutation, so that mapping cannot exist.",
                    { mapping: args.known_mapping });
            }
        }

        const histogram = trigramHistogram(codes);
        const random = generator(args.seed ?? null);
        const deadline = Date.now() + BUDGET_MS;
        let best = null;
        let ran = 0;
        for (let r = 0; r < args.restarts; r++) {
            if (Date.now() > deadline) break;
            // Yield between restarts. Each climb is bounded by STALE_LIMIT and takes a couple of
            // milliseconds, but 2,000 of them back to back is twenty seconds during which nothing
            // else on the server runs -- and the `deadline` above cannot fire while they do, so
            // the budget stops being a budget. The same rule the other tools follow.
            if ((r & 0x1f) === 0 && r > 0) await new Promise(resolve => setImmediate(resolve));
            const attempt = climb(histogram, pinned, random);
            ran++;
            if (!best || attempt.score > best.score) best = attempt;
        }

        const plain = codes.map(c => best.key[c]);
        const score = trigramScore(plain);
        let at = 0;
        const restored = [...args.input].map(ch => {
            const upper = ch.toUpperCase();
            if (upper < "A" || upper > "Z") return ch;
            const letter = String.fromCharCode(65 + plain[at++]);
            return ch === upper ? letter : letter.toLowerCase();
        }).join("");

        return {
            // Both directions, because a caller who wants to re-encrypt needs the inverse and
            // deriving it by hand from a 26-letter string is exactly the sort of step that gets
            // done backwards.
            mapping: {
                "cipher_alphabet": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                "plain_alphabet": fromCodes([...best.key])
            },
            "restarts_run": ran,
            ...(ran < args.restarts ? {
                "restarts_cut_short": `The ${BUDGET_MS / 1000}-second budget stopped the search after ` +
                    `${ran} of ${args.restarts} restarts.`
            } : {}),
            "trigram_score": Number(score.toFixed(3)),
            plaintext: args.preview_letters > 0 ? restored.slice(0, args.preview_letters) : null,
            assessment: score > -3.3 ?
                "Scores as English. Read it — if two letters look transposed throughout, pin the " +
                "ones you are sure of with known_mapping and run it again." :
                score > -4.2 ?
                    "Partly recovered. This is the normal outcome below a few hundred letters: most " +
                    "of the mapping is right and a pair or two is swapped. Pin what you can read " +
                    "into known_mapping and run it again." :
                    `Not recovered. With ${codes.length} letters that may simply be too little — the ` +
                    "practical floor is around 100 and the theoretical one is 28 — or the plaintext " +
                    "is not English, or this is not a simple substitution.",
            next: "Apply the mapping with cyberchef_bake: " +
                "[{\"op\":\"Substitute\",\"args\":{\"plaintext\":\"ABCDEFGHIJKLMNOPQRSTUVWXYZ\"," +
                `"ciphertext":"${fromCodes([...best.key])}"}}]`
        };
    }
};
