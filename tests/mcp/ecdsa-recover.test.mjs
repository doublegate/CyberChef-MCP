/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * `ecdsa_recover`, against signatures produced by real curve arithmetic.
 *
 * The vectors are GENERATED here rather than asserted, and generated the hard way: the test carries
 * a secp256k1 point multiplication and signs with it, so `r` is genuinely `(kG).x mod n` and the
 * signatures are ones `ECDSA Verify` would accept. That matters because the easy version of this
 * test — pick `d`, `k`, `z1`, `z2`, compute `s1` and `s2` from the signing equation, assert the
 * tool returns `d` — proves only that the tool's algebra matches the test's algebra. Both could be
 * wrong in the same way and the test would pass.
 *
 * The curve code is test-only on purpose. Putting it in the tool would add a group-law
 * implementation to production for a recovery that never evaluates a curve point: `r` arrives in
 * the signature and is used as a scalar throughout.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import tool from "../../src/node/tools/ecdsa-recover.mjs";

// secp256k1, from SEC 2 v2.
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

/** @returns {bigint} `a` modulo `m`, non-negative. */
const mod = (a, m) => ((a % m) + m) % m;

/** @returns {bigint} The modular inverse of `a` mod `m`, by the extended Euclidean algorithm. */
function inv(a, m) {
    let [prevR, r] = [mod(a, m), m];
    let [prevS, s] = [1n, 0n];
    while (r !== 0n) {
        const q = prevR / r;
        [prevR, r] = [r, prevR - q * r];
        [prevS, s] = [s, prevS - q * s];
    }
    return mod(prevS, m);
}

/** @returns {{x: bigint, y: bigint}|null} `a + b` on the curve; null is the point at infinity. */
function add(a, b) {
    if (a === null) return b;
    if (b === null) return a;
    if (a.x === b.x && mod(a.y + b.y, P) === 0n) return null;
    const lambda = a.x === b.x && a.y === b.y ?
        mod(3n * a.x * a.x * inv(2n * a.y, P), P) :
        mod((b.y - a.y) * inv(b.x - a.x, P), P);
    const x = mod(lambda * lambda - a.x - b.x, P);
    return { x, y: mod(lambda * (a.x - x) - a.y, P) };
}

/** @returns {{x: bigint, y: bigint}} `k * G`, by double-and-add. */
function multiply(k) {
    let result = null;
    let addend = { x: GX, y: GY };
    for (let e = k; e > 0n; e >>= 1n) {
        if (e & 1n) result = add(result, addend);
        addend = add(addend, addend);
    }
    return result;
}

/**
 * Sign a hash with an explicitly chosen nonce.
 *
 * @param {bigint} d - The private key.
 * @param {bigint} k - The nonce.
 * @param {bigint} z - The message hash as a scalar.
 * @returns {{r: string, s: string, hash: string}} The signature, in the tool's input shape.
 */
function sign(d, k, z) {
    const r = mod(multiply(k).x, N);
    const s = mod(inv(k, N) * (z + r * d), N);
    return { r: `0x${r.toString(16)}`, s: `0x${s.toString(16)}`, hash: `0x${z.toString(16)}` };
}

// A key and a nonce, arbitrary but fixed so the test is deterministic.
const D = 0xc0ffee00c0ffee11c0ffee22c0ffee33c0ffee44c0ffee55c0ffee66c0ffee77n;
const K = 0x0badc0de0badc0de0badc0de0badc0de0badc0de0badc0de0badc0de0badc0den;
// Exactly 64 hex digits -- 256 bits, the same width as the curve order. Written out in groups
// below rather than as one run, because the first version of this constant was 65 digits by
// miscounting, which made it a 260-bit hash on a 256-bit curve: the tool correctly truncated it,
// the signature had been made over the untruncated value, and the recovered key was wrong. The
// test was at fault and it took a while to believe that.
const Z1 = 0x5f6c5e7c_8a9b0c1d_2e3f4051_62738495_a6b7c8d9_eaf01020_30405060_70809abcn;
const Z2 = 0x1122334455667788990011223344556677889900112233445566778899001122n;

describe("ecdsa_recover", () => {
    it("recovers the private key from two signatures sharing a nonce", async () => {
        const a = sign(D, K, Z1);
        const b = sign(D, K, Z2);
        // The reuse is real: same k, so the same r falls out of the curve rather than being set.
        expect(a.r).toBe(b.r);

        const out = await tool.run({
            curve: "secp256k1",
            signatures: [{ ...a, label: "first" }, { ...b, label: "second" }]
        });

        expect(out.recovered).toBe(true);
        expect(out.distinct_keys).toBe(1);
        expect(BigInt(`0x${out.recoveries[0].private_key_hex}`)).toBe(D);
        expect(BigInt(out.recoveries[0].nonce_hex.startsWith("0x") ?
            out.recoveries[0].nonce_hex : `0x${out.recoveries[0].nonce_hex}`)).toBe(K);
        expect(out.recoveries[0].from).toEqual(["first", "second"]);
    });

    it("says nothing was found when every nonce is distinct, and says what that does not prove",
        async () => {
            const out = await tool.run({
                curve: "secp256k1",
                signatures: [sign(D, K, Z1), sign(D, K + 1n, Z2)]
            });

            expect(out.recovered).toBe(false);
            expect(out.distinct_r_values).toBe(2);
            // The honesty requirement: distinct nonces are not sound nonces, and a caller who
            // reads "no reuse" as "safe" has been misled by the tool rather than by the maths.
            expect(out.assessment).toContain("biased");
        });

    it("reports a duplicated signature as degenerate rather than recovering a wrong key", async () => {
        const a = sign(D, K, Z1);
        const out = await tool.run({ curve: "secp256k1", signatures: [a, { ...a }] });

        // Same r AND same s means one signature listed twice. s1 - s2 is zero, 1/0 does not exist,
        // and the tempting bug is to return whatever the arithmetic produced anyway.
        expect(out.recovered).toBe(false);
        expect(out.degenerate_pairs).toHaveLength(1);
        expect(out.degenerate_note).toContain("same hash");
    });

    it("truncates a hash wider than the curve, per FIPS 186-4", async () => {
        // The failure this pins: reducing mod n instead of taking the leftmost bitlen(n) bits.
        // Invisible on SHA-256 with secp256k1, where the widths match, so it is tested where they
        // do not -- a 512-bit hash on a 256-bit curve.
        const wide = (Z1 << 256n) | Z2;
        const z = wide >> 256n;
        const a = sign(D, K, z);
        const b = sign(D, K, mod(Z2, N));

        const out = await tool.run({
            curve: "secp256k1",
            signatures: [
                { r: a.r, s: a.s, hash: `0x${wide.toString(16).padStart(128, "0")}` },
                { r: b.r, s: b.s, hash: `0x${Z2.toString(16)}` }
            ]
        });

        expect(out.recovered).toBe(true);
        expect(BigInt(`0x${out.recoveries[0].private_key_hex}`)).toBe(D);
    });

    it("measures a hash written with separators by its cleaned length", async () => {
        // `parseInteger` strips whitespace, underscores and colons, all reasonable ways to write a
        // digest. Deriving the width from the RAW string then over-reports it by one byte per
        // separator, truncates a hash that needed no truncation, and recovers a key that is wrong
        // with nothing looking wrong. Found in review on PR #118.
        const a = sign(D, K, Z1);
        const b = sign(D, K, Z2);
        const grouped = a.hash.slice(2).replace(/(..)/g, "$1:").replace(/:$/, "");

        const out = await tool.run({
            curve: "secp256k1",
            signatures: [{ r: a.r, s: a.s, hash: `0x${grouped}` }, b]
        });

        expect(out.recovered).toBe(true);
        expect(BigInt(`0x${out.recoveries[0].private_key_hex}`)).toBe(D);
    });

    it("refuses a signature whose r or s is zero rather than dividing by it", async () => {
        await expect(tool.run({
            curve: "secp256k1",
            signatures: [{ r: "0", s: "1", hash: "0x01" }, { r: "1", s: "1", hash: "0x02" }]
        })).rejects.toThrow(/equal to zero/);
    });

    it("accepts every curve it documents, and refuses one it does not", () => {
        // A curve missing from the enum is a tool that silently cannot be used for it; a curve
        // present but absent from the table would throw at run time on a property of undefined.
        const sig = { r: "1", s: "1", hash: "0x01" };
        for (const curve of ["secp192r1", "secp224r1", "secp256k1", "secp256r1", "secp384r1", "secp521r1"]) {
            expect(tool.inputSchema.safeParse({ curve, signatures: [sig, sig] }).success).toBe(true);
        }
        expect(tool.inputSchema.safeParse({ curve: "curve25519", signatures: [sig, sig] }).success)
            .toBe(false);
    });

    it("is registered, and does not shadow an operation or meta-tool", async () => {
        const { buildRegistry } = await import("../../src/node/tools/index.mjs");
        const names = buildRegistry().list().map(entry => entry.name);
        expect(names).toContain("ecdsa_recover");
        // Registration throws on a name that shadows an operation or a meta-tool, so reaching
        // here is most of the assertion; the prefix rule is checked because it is the one a new
        // tool gets wrong by copying an operation tool's name.
        expect(tool.name.startsWith("cyberchef_")).toBe(false);
    });
});
