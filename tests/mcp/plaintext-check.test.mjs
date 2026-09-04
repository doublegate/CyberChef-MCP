/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The judgement every auto-decoding search has to make, and no operation exposes.
 *
 * The cases below are chosen so each one is decided by a DIFFERENT piece of evidence, because the
 * failure mode of a checker like this is not being wrong -- it is being right for a reason it
 * cannot state, which makes it impossible to tell a lucky answer from a sound one.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { randomInt } from "node:crypto";
import plaintextCheck from "../../src/node/tools/plaintext-check.mjs";

const run = (input) => plaintextCheck.run({ input, language: "english" });

describe("plaintext_check", () => {
    it("recognises English by its words, and says so", async () => {
        const r = await run("The quick brown fox jumps over the lazy dog and then runs from the farm.");

        expect(r.verdict).toBe("plaintext");
        expect(r.decided_by).toBe("English words");
        expect(r.evidence.common_word_hits).toBeGreaterThanOrEqual(4);
    });

    it("rejects binary on the printable ratio before computing any statistic", async () => {
        const binary = Array.from({ length: 300 }, (_, i) => String.fromCharCode((i * 97 + 13) % 256)).join("");
        const r = await run(binary);

        expect(r.verdict).toBe("not plaintext");
        expect(r.decided_by).toBe("printable ratio");
        expect(r.confidence).toBe("high");
        // The cheapest check answers first. It is also the one that carries Ciphey and Ares in
        // practice, while their published heuristics sit unused.
        expect(r.next).toMatch(/cyberchef_magic/);
    });

    it("rejects uniform random letters on the index of coincidence", async () => {
        const random = Array.from({ length: 400 }, () => String.fromCharCode(65 + randomInt(26))).join("");
        const r = await run(random);

        expect(r.verdict).toBe("not plaintext");
        expect(r.decided_by).toBe("index of coincidence");
        expect(r.evidence.index_of_coincidence).toBeLessThan(0.045);
    });

    it("does NOT call a short monoalphabetic ciphertext 'not plaintext'", async () => {
        // The regression this test exists for. ROT13 of a 52-letter sentence measured an index of
        // coincidence of 0.0332 and was reported as "not plaintext" with moderate confidence --
        // backwards, because a monoalphabetic substitution PRESERVES the IoC. The same text at
        // 312 letters measures 0.0487.
        //
        // 50 letters is the floor at which the statistic can be COMPUTED. Deciding on it needs
        // 200. Conflating the two floors is what produced a confident wrong answer.
        const r = await run("Gur dhvpx oebja sbk whzcf bire gur ynml qbt naq gura vg ehaf njnl.");

        expect(r.verdict).not.toBe("not plaintext");
        expect(r.verdict).toBe("undecided");
        expect(r.evidence.letters).toBeLessThan(200);
    });

    it("refuses to guess below eight characters, and calls that a refusal", async () => {
        const r = await run("hi");

        expect(r.verdict).toBe("too short");
        expect(r.confidence).toBe("none");
        // "too short" and "not plaintext" are different answers and only one of them is true.
        expect(r.note).toMatch(/refusal to guess, not a negative result/);
    });

    it("says undecided rather than guessing on printable non-English", async () => {
        const r = await run("VGhlIHF1aWNrIGJyb3duIGZveCBqdW1wcyBvdmVyIHRoZSBsYXp5IGRvZw==");

        expect(r.verdict).toBe("undecided");
        expect(r.confidence).toBe("low");
        expect(r.next).toMatch(/cyberchef_magic/);
    });

    it("decides on letter statistics when no common word appears at all", async () => {
        // The only verdict reached by the statistics rather than by the dictionary, and nothing
        // else in this file gets near it: every other case either hits a common word first or
        // fails the printable-ratio check. A change to either threshold would have passed silently.
        const r = await run(
            "Kowalski Nakamura Oyelaran Bergstrom Villanueva Petrosyan Kirchner Almeida " +
            "Rasmussen Fontaine Delacroix Marchetti Novotny Karlsson Ferreira Lindqvist");

        expect(r.decided_by).toBe("letter statistics");
        expect(r.verdict).toBe("probably plaintext");
        expect(r.evidence.common_word_hits).toBe(0);
    });

    it("carries the evidence for whatever it decided", async () => {
        const r = await run("The quick brown fox jumps over the lazy dog and then runs from the farm.");

        // A bare score is a number the caller then has to threshold, which is the judgement they
        // came here to avoid. Every verdict ships the inputs behind it.
        const keys = ["length", "printable_ratio", "letters", "distinct_words_3plus", "common_word_hits", "index_of_coincidence", "chi_squared"];
        for (const key of keys) {
            expect(r.evidence).toHaveProperty(key);
        }
    });
});
