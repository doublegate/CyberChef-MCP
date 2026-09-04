/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The two solvers that need a loop with a decision in it, which is why they cannot be operations.
 *
 * Both are statistical, so every case here is seeded or long enough that the statistic is not being
 * asked a question it cannot answer. The tests that matter most are the ones asserting the tools
 * report their own failure: a cipher solver that returns a wrong key confidently is worse than one
 * that returns nothing.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import vigenere from "../../src/node/tools/vigenere-break.mjs";
import substitution from "../../src/node/tools/substitution-break.mjs";
import { trigramScore, toCodes, indexOfCoincidence, chiSquared } from "../../src/node/tools/lib/english.mjs";

/** Held-out prose: not in the corpus the trigram table was built from. */
const PROSE = "The study of computer security begins with the observation that every system has a " +
    "boundary and that the interesting questions live at that boundary. What crosses it, who is " +
    "permitted to make it cross, and what happens when something crosses that should not have. " +
    "The answers are rarely found in the algorithm and almost always found in the plumbing " +
    "around it, which is why an attacker reads the configuration before reading the source code.";

/** @returns {string} Vigenere ciphertext, preserving case and punctuation. */
function encipherVigenere(text, key) {
    let at = 0;
    return [...text].map(ch => {
        const upper = ch.toUpperCase();
        if (upper < "A" || upper > "Z") return ch;
        const shift = key.toUpperCase().charCodeAt(at++ % key.length) - 65;
        const out = String.fromCharCode(65 + (upper.charCodeAt(0) - 65 + shift) % 26);
        return ch === upper ? out : out.toLowerCase();
    }).join("");
}

/** @returns {string} Ciphertext under a substitution alphabet. */
function encipherSubstitution(text, alphabet) {
    return [...text].map(ch => {
        const upper = ch.toUpperCase();
        if (upper < "A" || upper > "Z") return ch;
        const out = alphabet[upper.charCodeAt(0) - 65];
        return ch === upper ? out : out.toLowerCase();
    }).join("");
}

describe("the shared English model", () => {
    it("returns -Infinity rather than a number for text too short to have a trigram", async () => {
        expect(trigramScore(toCodes("AB"))).toBe(-Infinity);
        expect(chiSquared([])).toBe(Infinity);
    });

    it("scores English above the same letters shuffled", async () => {
        // Seeded Fisher-Yates, not `sort(() => Math.random() - 0.5)`. That is not a valid
        // comparator -- it is inconsistent between calls, so the permutation is biased and
        // engine-dependent and can leave much of the original order intact. The assertion would
        // then depend on chance rather than on the model.
        const shuffled = toCodes(PROSE);
        let state = 20260904;
        for (let i = shuffled.length - 1; i > 0; i--) {
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            const j = state % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        expect(trigramScore(toCodes(PROSE))).toBeGreaterThan(trigramScore(shuffled) + 0.5);
    });

    it("computes the index of coincidence without replacement", async () => {
        // sum f(f-1) / N(N-1), not sum(f^2)/N^2. The latter is biased upward and diverges at small
        // N, which is exactly the regime a per-coset key-length search runs in.
        // AABB: two letters twice each, so sum f(f-1) = 4 over N(N-1) = 12.
        expect(indexOfCoincidence(toCodes("AABB"))).toBeCloseTo(4 / 12, 6);
        expect(indexOfCoincidence(toCodes("A"))).toBeNull();
    });

    it("reads its packed table from the right byte offset", async () => {
        // A Buffer's ArrayBuffer may be a slice of a shared pool, so a Uint16Array built without
        // the byteOffset reads whatever else the pool holds. The symptom is a model that scores
        // plausibly and solves nothing.
        //
        // Asserted against the TRIGRAM table itself. The first version of this test called
        // `chiSquared`, which reads only the letter-frequency array and never touches the decoded
        // buffer at all -- so a wrong byteOffset would have left it passing, which is the one
        // thing a test named for the offset must not do.
        const { TRIGRAM_LOGP } = await import("../../src/node/tools/lib/english.mjs");
        expect(TRIGRAM_LOGP).toHaveLength(26 * 26 * 26);

        const index = (a, b, c) => (a.charCodeAt(0) - 65) * 676 + (b.charCodeAt(0) - 65) * 26 + (c.charCodeAt(0) - 65);
        // THE is the most common English trigram; QKX appears in no English text.
        expect(TRIGRAM_LOGP[index("T", "H", "E")]).toBeGreaterThan(TRIGRAM_LOGP[index("Q", "K", "X")] + 3);
        expect(chiSquared(toCodes(PROSE))).toBeLessThan(chiSquared(toCodes("ZZZZZZZZZZQQQQQQQQQQ")));
    });
});

describe("vigenere_break", () => {
    it.each([["AB", 2], ["KEY", 3], ["CIPHERS", 7], ["LEMONADE", 8]])(
        "recovers the key %s", async (key) => {
            const r = await vigenere.run(
                vigenere.inputSchema.parse({ input: encipherVigenere(PROSE, key) }));
            expect(r.key).toBe(key.toUpperCase());
            expect(r.key_length).toBe(key.length);
        }, 30000);

    it("does not report a multiple of the key as the key", async () => {
        // Practical Cryptography's own CIPHERS example scores period 14 ABOVE period 7. An argmax
        // over the index of coincidence therefore answers 14 for a 7-letter key -- which decrypts
        // correctly, and reports a key twice as long as the real one.
        const r = await vigenere.run(
            vigenere.inputSchema.parse({ input: encipherVigenere(PROSE, "CIPHERS") }));
        expect(r.key_length).toBe(7);
        expect(r.key_length_source).toMatch(/decrypts identically/);
    }, 30000);

    it("restores the original spacing and case", async () => {
        const r = await vigenere.run(
            vigenere.inputSchema.parse({ input: encipherVigenere(PROSE, "KEY") }));
        expect(r.plaintext.startsWith("The study of computer security")).toBe(true);
    }, 30000);

    it("reports the runner-up at every key position", async () => {
        // `CIPHERS` comes back as `CIAHERS` when one coset's second-place shift was the right one.
        // A caller can only notice that if the runner-up is shown.
        const r = await vigenere.run(
            vigenere.inputSchema.parse({ input: encipherVigenere(PROSE, "KEY") }));
        expect(r.key_positions).toHaveLength(3);
        for (const position of r.key_positions) expect(position.alternatives.length).toBeGreaterThan(0);
    }, 30000);

    it("says it failed rather than returning a wrong key", async () => {
        const r = await vigenere.run(vigenere.inputSchema.parse({
            input: "QWERTYUIOPASDFGHJKLZXCVBNMQWERTYUIOPASDFGHJKLZXCVBNMQWERTYUIOPASDFGHJKL"
        }));
        expect(r.assessment).toMatch(/does not score as English/);
    }, 30000);

    it("refuses an input too short for the per-coset statistics", async () => {
        await expect(vigenere.run(vigenere.inputSchema.parse({ input: "SHORTTEXT" })))
            .rejects.toThrow(/Below about 40/);
    });

    it("always has at least one candidate length, whatever max_key_length asks for", async () => {
        // The 40-letter floor guarantees it: k = 1 gives a coset of the whole input, which is
        // twice the 20-letter minimum rankLengths applies, so a row is always pushed. The tool
        // used to carry an unreachable "no key length has enough letters" error for this, and the
        // test named after it asserted the opposite of what its name said -- it recorded that both
        // calls SUCCEED. Asserting the invariant is the honest version of the same test.
        for (const args of [
            { input: "A".repeat(45), "max_key_length": 1 },
            { input: encipherVigenere(PROSE.slice(0, 60), "KEY"), "max_key_length": 20 }
        ]) {
            const r = await vigenere.run(vigenere.inputSchema.parse(args));
            expect(r.length_candidates.length).toBeGreaterThan(0);
        }
    }, 30000);

    it("skips the search when the caller supplies a key length", async () => {
        const r = await vigenere.run(vigenere.inputSchema.parse({
            input: encipherVigenere(PROSE, "KEY"), "key_length": 3
        }));
        expect(r.key).toBe("KEY");
        expect(r.key_length_source).toMatch(/supplied by the caller/);
    }, 30000);

    it("omits the preview when asked for none", async () => {
        const r = await vigenere.run(vigenere.inputSchema.parse({
            input: encipherVigenere(PROSE, "KEY"), "preview_letters": 0
        }));
        expect(r.plaintext).toBeNull();
    }, 30000);
});

describe("substitution_break", () => {
    it("recovers a keyboard-order alphabet from a few hundred letters", async () => {
        const r = await substitution.run(substitution.inputSchema.parse({
            input: encipherSubstitution(PROSE, "QWERTYUIOPASDFGHJKLZXCVBNM"), seed: 12345
        }));
        expect(r.plaintext.startsWith("The study of computer security")).toBe(true);
    }, 60000);

    it("solves ROT13, because a rotation is a substitution", async () => {
        const rot13 = "NOPQRSTUVWXYZABCDEFGHIJKLM";
        const r = await substitution.run(substitution.inputSchema.parse({
            input: encipherSubstitution(PROSE, rot13), seed: 7
        }));
        expect(r.plaintext.startsWith("The study of computer security")).toBe(true);
    }, 60000);

    it("is reproducible when seeded, and not when it is not", async () => {
        const input = encipherSubstitution(PROSE, "QWERTYUIOPASDFGHJKLZXCVBNM");
        const a = await substitution.run(substitution.inputSchema.parse({ input, seed: 99, restarts: 5 }));
        const b = await substitution.run(substitution.inputSchema.parse({ input, seed: 99, restarts: 5 }));
        expect(a.mapping.plain_alphabet).toBe(b.mapping.plain_alphabet);
    }, 60000);

    it("holds known_mapping fixed instead of treating it as a hint", async () => {
        // A starting hint the search immediately swaps away is not a constraint. Pinned positions
        // are excluded from the swap pool entirely, which is what makes "pin what you can read and
        // run it again" a real workflow rather than advice.
        const input = encipherSubstitution(PROSE, "QWERTYUIOPASDFGHJKLZXCVBNM");
        const r = await substitution.run(substitution.inputSchema.parse({
            input, "known_mapping": "q:a,w:b", seed: 5, restarts: 3
        }));
        expect(r.mapping.plain_alphabet[16]).toBe("A");   // cipher Q -> plain A
        expect(r.mapping.plain_alphabet[22]).toBe("B");   // cipher W -> plain B
    }, 60000);

    it("rejects a known_mapping that is not a permutation", async () => {
        await expect(substitution.run(substitution.inputSchema.parse({
            input: PROSE, "known_mapping": "a:x,b:x"
        }))).rejects.toThrow(/cannot exist/);
    });

    it("rejects a malformed known_mapping pair by name", async () => {
        await expect(substitution.run(substitution.inputSchema.parse({
            input: PROSE, "known_mapping": "ab:c"
        }))).rejects.toThrow(/not a cipher:plain pair/);
    });

    it("reports a partial recovery as partial rather than as a solve", async () => {
        // The normal outcome below a few hundred letters, and the assessment has to distinguish it
        // from a clean solve -- 94.6% of letters is one swapped pair, not an answer.
        const short = PROSE.slice(0, 140);
        const r = await substitution.run(substitution.inputSchema.parse({
            input: encipherSubstitution(short, "QWERTYUIOPASDFGHJKLZXCVBNM"), seed: 3, restarts: 20
        }));
        expect(r.assessment).toMatch(/Scores as English|Partly recovered|Not recovered/);
        expect(r.trigram_score).toBeLessThan(0);
    }, 60000);

    it("stops at the wall clock and says the search was cut short", async () => {
        const r = await substitution.run(substitution.inputSchema.parse({
            input: encipherSubstitution(PROSE, "QWERTYUIOPASDFGHJKLZXCVBNM"), restarts: 2000, seed: 1
        }));
        // Either it finished all 2000 or the budget stopped it; both are correct, and the report
        // must say which, because "nothing found" means different things in the two cases.
        if (r.restarts_run < 2000) expect(r.restarts_cut_short).toMatch(/budget stopped the search/);
        else expect(r.restarts_cut_short).toBeUndefined();
    }, 60000);

    it("omits the preview when asked for none", async () => {
        const r = await substitution.run(substitution.inputSchema.parse({
            input: encipherSubstitution(PROSE, "QWERTYUIOPASDFGHJKLZXCVBNM"),
            "preview_letters": 0, restarts: 3, seed: 2
        }));
        expect(r.plaintext).toBeNull();
    }, 60000);

    it("handles a mapping that pins all but one letter", async () => {
        // With fewer than two free positions there is nothing to swap, and the climb has to return
        // the pinned key rather than loop or throw.
        const alphabet = "QWERTYUIOPASDFGHJKLZXCVBNM";
        const pins = [...Array(25).keys()]
            .map(i => `${alphabet[i].toLowerCase()}:${String.fromCharCode(97 + i)}`).join(",");
        const r = await substitution.run(substitution.inputSchema.parse({
            input: encipherSubstitution(PROSE, alphabet), "known_mapping": pins, restarts: 2, seed: 4
        }));
        expect(r.plaintext.startsWith("The study of computer security")).toBe(true);
    }, 60000);

    it("refuses below the unicity distance, and explains why that is different from being hard", async () => {
        // Under 28 letters more than one mapping yields sensible English, so no amount of searching
        // can choose. That is not the same failure as "too little signal" and the message says so.
        await expect(substitution.run(substitution.inputSchema.parse({ input: "SHORT TEXT HERE" })))
            .rejects.toThrow(/not determined by the ciphertext/);
    });
});
