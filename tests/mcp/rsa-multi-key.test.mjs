/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The attacks that need more than one key.
 *
 * Every case here is a full round trip -- encrypt with a known message, attack, compare -- because
 * the failure mode of an RSA attack tool is not throwing, it is returning a number. `rsa_attack`
 * once reported a private exponent that decrypted 424242 as 368518651580054785 and looked entirely
 * healthy doing it.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import tool from "../../src/node/tools/rsa-multi-key.mjs";

/** Distinct primes, small enough to keep the suite fast and large enough to be real factorisations. */
const P = [1000003n, 32416190071n, 2n ** 61n - 1n, 1000000007n, 999999937n, 32416189381n];

const modPow = (b, e, m) => {
    let x = 1n;
    let base = b % m;
    let exp = e;
    while (exp > 0n) {
        if (exp & 1n) x = x * base % m;
        base = base * base % m;
        exp >>= 1n;
    }
    return x;
};

const run = (keys, attacks, extra = {}) => tool.run({
    keys, attacks, "relation_a": "1", "relation_b": "1", ...extra
});

describe("rsa_multi_key", () => {
    describe("batch_gcd", () => {
        it("factors both keys when two moduli share a prime", async () => {
            const r = await run([
                { modulus: String(P[0] * P[1]) },
                { modulus: String(P[1] * P[3]) }
            ], ["batch_gcd"]);

            expect(r.findings).toHaveLength(2);
            for (const f of r.findings) expect(f.p).toBe(String(P[1]));
        });

        it("reports a repeated modulus as its own finding, not as a shared prime", async () => {
            const n = String(P[0] * P[1]);
            const r = await run([{ modulus: n }, { modulus: n }], ["batch_gcd"]);

            // Deduplication is a PRECONDITION of the product tree, not tidiness: two identical
            // moduli make every gcd degenerate. Reporting it is free once you have deduplicated.
            expect(r.findings).toHaveLength(1);
            expect(r.findings[0].key_indices).toEqual([0, 1]);
            expect(r.findings[0].note).toMatch(/SAME modulus/);
            expect(r.findings[0].p).toBeUndefined();
        });

        it("survives the degenerate case, where a modulus divides the product of the others", async () => {
            // The regression vector: 1909 = 23*83, with 23 recurring in 989 = 23*43 and 83 in
            // 1079 = 13*83. Index 0 therefore shares BOTH its primes with two other entries, its
            // quotient in the remainder tree is exactly zero, and the batch gcd returns the modulus
            // itself -- which would read as "this key is unbroken" if it were not detected.
            //
            // Padded past the 16-key crossover on purpose, so this exercises the product tree
            // rather than the pairwise scan it falls back to below that size.
            const vector = [1909, 2923, 291, 205, 989, 62, 451, 1943, 1079, 2419];
            const padding = [10007, 10009, 10037, 10039, 10061, 10067, 10069];
            const r = await run(
                [...vector, ...padding].map(n => ({ modulus: String(n) })), ["batch_gcd"]);

            expect(r.attempted[0]).toMatch(/product tree/);
            const byIndex = new Map(r.findings.map(f => [f.key_indices[0], f.p]));
            expect(byIndex.get(0)).toBe("23");     // recovered by the fallback, not by the tree
            expect(byIndex.get(8)).toBe("83");     // 1079 = 13 * 83
            expect(byIndex.has(7)).toBe(false);    // 1943 = 29 * 67, shares nothing
        });

        it("uses the pairwise scan below the crossover, and says which one ran", async () => {
            const r = await run([
                { modulus: String(P[0] * P[1]) },
                { modulus: String(P[2] * P[3]) }
            ], ["batch_gcd"]);

            // Their failure modes differ -- the pairwise scan has no degenerate case at all -- so
            // which one ran is part of the answer rather than an implementation detail.
            expect(r.attempted[0]).toMatch(/pairwise scan/);
        });
    });

    it("recovers a message sent twice under one modulus with two coprime exponents", async () => {
        const n = P[0] * P[1];
        const m = 424242n;
        const r = await run([
            { modulus: String(n), "public_exponent": "17", ciphertext: String(modPow(m, 17n, n)) },
            { modulus: String(n), "public_exponent": "65537", ciphertext: String(modPow(m, 65537n, n)) }
        ], ["common_modulus"]);

        expect(r.findings[0].plaintext_int).toBe(m.toString());
        // The key is untouched. This is a protocol failure, and the output has to say so or the
        // caller will conclude the modulus was factored.
        expect(r.findings[0].note).toMatch(/key is untouched/);
    });

    it("recovers a broadcast message from e coprime moduli", async () => {
        const m = 12345678901n;
        const moduli = [P[0] * P[1], P[3] * P[4], P[2] * P[5]];
        const r = await run(
            moduli.map(n => ({ modulus: String(n), "public_exponent": "3", ciphertext: String(modPow(m, 3n, n)) })),
            ["hastad"]);

        expect(r.findings[0].plaintext_int).toBe(m.toString());
    });

    it("abandons Hastad for the factorisation when two broadcast moduli share a prime", async () => {
        const m = 999n;
        const moduli = [P[0] * P[1], P[1] * P[3], P[2] * P[5]];
        const r = await run(
            moduli.map(n => ({ modulus: String(n), "public_exponent": "3", ciphertext: String(modPow(m, 3n, n)) })),
            ["hastad"]);

        // Factoring two keys beats recovering one message, so a shared factor is a better outcome
        // than the attack that found it -- not an obstacle to route around.
        expect(r.findings[0].p).toBe(String(P[1]));
        expect(r.findings[0].note).toMatch(/better result/);
    });

    it("says the reconstruction was not an exact power rather than returning a wrong root", async () => {
        // Three DIFFERENT messages. The CRT still produces a number; it is simply not m^3.
        const moduli = [P[0] * P[1], P[3] * P[4], P[2] * P[5]];
        const r = await run(
            moduli.map((n, i) => ({
                modulus: String(n), "public_exponent": "3", ciphertext: String(modPow(1000n + BigInt(i), 3n, n))
            })), ["hastad"]);

        expect(r.findings[0].plaintext_int).toBeUndefined();
        expect(r.findings[0].note).toMatch(/not an exact e-th power/);
    });

    it("recovers a plaintext from two ciphertexts related by a known offset", async () => {
        const n = P[2] * P[5];
        const m2 = 987654321n;
        const r = await run([
            { modulus: String(n), "public_exponent": "3", ciphertext: String(modPow(m2 + 1337n, 3n, n)) },
            { modulus: String(n), "public_exponent": "3", ciphertext: String(modPow(m2, 3n, n)) }
        ], ["franklin_reiter"], { "relation_b": "1337" });

        expect(r.findings[0].plaintext_int).toBe(m2.toString());
    });

    it("reports the wrong relation as a wrong relation, not as a failure to decrypt", async () => {
        const n = P[2] * P[5];
        const m2 = 987654321n;
        const r = await run([
            { modulus: String(n), "public_exponent": "3", ciphertext: String(modPow(m2 + 1337n, 3n, n)) },
            { modulus: String(n), "public_exponent": "3", ciphertext: String(modPow(m2, 3n, n)) }
        ], ["franklin_reiter"], { "relation_b": "9999" });

        expect(r.findings[0].plaintext_int).toBeUndefined();
        expect(r.findings[0].note).toMatch(/does not search for it/);
    });

    it("names the precondition each inapplicable attack was missing", async () => {
        const r = await run([
            { modulus: String(P[0] * P[1]) },
            { modulus: String(P[2] * P[3]) }
        ]);

        // "found nothing" and "never ran" are different answers, and the caller is choosing what
        // to try next on the strength of which one it got.
        expect(r.attempted.join(" ")).toMatch(/common_modulus \(skipped/);
        expect(r.attempted.join(" ")).toMatch(/hastad \(skipped/);
        expect(r.attempted.join(" ")).toMatch(/franklin_reiter \(skipped/);
        expect(r.assessment).toMatch(/relationship BETWEEN the inputs/);
    });

    it("rejects a modulus that is not a modulus", async () => {
        await expect(run([{ modulus: "2" }, { modulus: "77" }], ["batch_gcd"]))
            .rejects.toThrow(/at least 4/);
    });
});
