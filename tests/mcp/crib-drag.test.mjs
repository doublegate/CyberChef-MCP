/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * One cancellation, two modes, and a filter far stronger than the printability test everyone uses.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import tool from "../../src/node/tools/crib-drag.mjs";

const KEY = "hunter2!";
const P1 = "The quick brown fox jumps over the lazy dog near the river bank at dawn.";
const P2 = "Meet me by the old clock tower at midnight and bring the sealed letter.";

/** @returns {string} Hex ciphertext of `text` under a repeating key. */
const encrypt = (text, key = KEY) => Buffer.from(
    [...text].map((c, i) => (c.charCodeAt(0) & 0xff) ^ key.charCodeAt(i % key.length))
).toString("hex");

const run = (args) => tool.run(tool.inputSchema.parse(args));

describe("crib_drag", () => {
    it("reads a span of the second plaintext out of two ciphertexts under one key", async () => {
        const r = await run({
            ciphertext: encrypt(P1), "ciphertext_b": encrypt(P2), crib: " the ", top: 20
        });

        expect(r.mode).toMatch(/span of the OTHER plaintext/);
        // " the " appears in P1 at 3 places; dragging it against C1^C2 exposes whatever P2 held
        // at those offsets. The key never enters the computation at all.
        const texts = r.results.map(x => x.result);
        expect(texts.some(t => P2.includes(t))).toBe(true);
    });

    it("recovers key bytes from one ciphertext and a known fragment", async () => {
        const r = await run({ ciphertext: encrypt(P1), crib: "The quick", top: 5 });

        expect(r.mode).toMatch(/span of the KEY/);
        const hit = r.results.find(x => x.offset === 0);
        expect(hit.result.startsWith(KEY)).toBe(true);
        // Deliberately NOT asserting it ranks first. In this mode the result is key material, not
        // prose, so an English score is a weak hint -- and the tool says so rather than presenting
        // the ordering as trustworthy. `key_length` is what decides here.
        expect(r.score_meaning).toMatch(/Weak/);
    });

    it("uses key periodicity as the filter, which printability cannot match", async () => {
        const withLength = await run({
            ciphertext: encrypt(P1), crib: "The quick", "key_length": KEY.length, top: 50
        });
        const without = await run({ ciphertext: encrypt(P1), crib: "The quick", top: 50 });

        // A wrong offset can easily be printable. It can hardly ever be periodic with the key's
        // period, because that requires the derived bytes to repeat every k positions by accident.
        expect(withLength.results.length).toBeLessThan(without.results.length);
        for (const hit of withLength.results) expect(hit.key_consistent).toBe(true);
    });

    it("recovers the whole key when the crib is at least as long as it", async () => {
        const r = await run({
            ciphertext: encrypt(P1), crib: "The quick", "key_length": KEY.length, top: 5
        });

        expect(r.recovered_key.hex).toBe(Buffer.from(KEY, "latin1").toString("hex"));
        expect(r.recovered_key.offset).toBe(0);
    });

    it("says the key length is wrong rather than returning nothing in particular", async () => {
        const r = await run({
            ciphertext: encrypt(P1), crib: "The quick", "key_length": 5, top: 5
        });

        expect(r.results).toHaveLength(0);
        // "the crib is wrong" and "the key length is wrong" are different problems and the caller
        // fixes them differently, so both are named.
        expect(r.assessment).toMatch(/the crib is wrong, or the key length is/);
    });

    it("ranks by a length-normalised score, so offsets are comparable", async () => {
        const r = await run({
            ciphertext: encrypt(P1), "ciphertext_b": encrypt(P2), crib: " the ", top: 10
        });

        // A raw log-probability SUM would rank a long fragment above a good one, which is exactly
        // the failure Cryptopals challenge 4 is built to expose.
        for (let i = 1; i < r.results.length; i++) {
            expect(r.results[i - 1].score).toBeGreaterThanOrEqual(r.results[i].score);
        }
    });

    it("refuses a crib longer than the data it would be dragged along", async () => {
        await expect(run({ ciphertext: encrypt("short"), crib: "much longer than that" }))
            .rejects.toThrow(/only \d+ to drag it along/);
    });

    it("rejects malformed hex rather than decoding it to something", async () => {
        await expect(run({ ciphertext: "zzzz", crib: "the" })).rejects.toThrow(/not valid hex/);
    });
});
