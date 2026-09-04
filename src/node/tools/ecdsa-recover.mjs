/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Recover an ECDSA private key from signatures that reused, or nearly reused, a nonce.
 *
 * CyberChef has `ECDSA Sign`, `ECDSA Verify`, `ECDSA Signature Conversion` and
 * `Generate ECDSA Key Pair`. All four operate on ONE signature. Nothing in the catalogue looks at
 * two signatures together, and that is exactly where ECDSA fails in practice: the algorithm is
 * sound and its implementations leak the nonce.
 *
 * This is the second category of registry tool — a statistic computed ACROSS inputs. `Fork` applies
 * one recipe to each branch and cannot compute anything over the branches, so "do any two of these
 * signatures share an r" is not expressible as a recipe no matter how it is written.
 *
 * ## The mathematics, and why it is this short
 *
 * ECDSA signs with `s = k^-1 (z + r d) mod n`, where `k` is a per-signature secret nonce, `d` the
 * private key and `z` the message hash truncated to the curve order's bit length. `r` is derived
 * from `k` alone, so **two signatures with the same `r` used the same `k`**. Subtracting:
 *
 *     k = (z1 - z2) / (s1 - s2)   mod n
 *     d = (s1 k - z1) / r         mod n
 *
 * No search, no lattice, no factoring. Two modular inversions recover the key outright. This is the
 * PlayStation 3 firmware-signing key (fail0verflow, 27C3, 2010) and the Android SecureRandom Bitcoin
 * thefts of 2013, and it is still found in the field because a nonce is easy to generate badly and
 * nothing about a valid signature reveals that it was.
 *
 * ## What it will not do
 *
 * It does **not** attack a *biased* nonce — the lattice/HNP attacks (Howgrave-Graham & Smart,
 * Minerva, TPM-FAIL) that need many signatures and an LLL reduction. Those are a different tool
 * with a different failure mode, and claiming them here would be the "exactness honesty" violation
 * this project treats as a defect: an approximate answer presented as a determination. What is here
 * is exact or it is nothing, and the report says which.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";
import { MAX_OPERAND_CHARS, modInverse, parseInteger } from "./rsa-attack.mjs";

/**
 * The curves, by name, with the order `n` each `k` and `d` live modulo.
 *
 * Only `n` is needed. The recovery never touches a curve point: `r` arrives as a number in the
 * signature and is used as a scalar, so the group law, the field prime and the base point are all
 * irrelevant here. That is why this is a small table rather than a dependency — pulling in an
 * elliptic-curve library to read one constant out of it would add a production dependency to an
 * image whose size is a tracked metric.
 *
 * Values are the standard orders from SEC 2 v2 and FIPS 186-4.
 *
 * Ed25519 is deliberately absent. It is not ECDSA: EdDSA derives its nonce deterministically by
 * hashing the private key with the message, so nonce reuse across two different messages cannot
 * happen and the attack this tool implements does not exist there. Listing the curve to be helpful
 * would offer a caller an answer that is meaningless rather than wrong, which is worse. The enum
 * rejects it and the schema error names what is accepted.
 */
const CURVES = {
    "secp256k1": {
        n: 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,
        note: "Bitcoin, Ethereum, and most cryptocurrency signing."
    },
    "secp256r1": {
        n: 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n,
        note: "Also called P-256 or prime256v1. TLS, JWT ES256, WebAuthn."
    },
    "secp384r1": {
        n: 0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973n,
        note: "P-384. JWT ES384."
    },
    "secp521r1": {
        n: 0x1fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa51868783bf2f966b7fcc0148f709a5d03bb5c9b8899c47aebb6fb71e91386409n,
        note: "P-521. JWT ES512."
    },
    "secp192r1": {
        n: 0xffffffffffffffffffffffff99def836146bc9b1b4d22831n,
        note: "P-192. Legacy; present because old firmware still signs with it."
    },
    "secp224r1": {
        n: 0xffffffffffffffffffffffffffff16a2e0b8f03e13dd29455c5c2a3dn,
        note: "P-224."
    }
};

/** Largest number of signatures accepted, bounding the pairwise scan below. */
const MAX_SIGNATURES = 512;

/**
 * Reduce a message hash to a scalar the way ECDSA does.
 *
 * FIPS 186-4 §6.4: when the hash is longer than the order, the LEFTMOST `bitlen(n)` bits are used —
 * a truncation, not a reduction mod n. Getting this wrong is the single most likely reason a
 * correct implementation of the algebra above returns a wrong key, because it only shows up when
 * the digest is wider than the curve (SHA-512 on P-256, say) and is invisible on the common
 * SHA-256/secp256k1 pairing where the two are the same width.
 *
 * @param {bigint} hash - The message hash as an integer.
 * @param {number} hashBits - The hash's width in bits, from the input's own length.
 * @param {bigint} n - The curve order.
 * @returns {bigint} The scalar `z`.
 */
function truncateHash(hash, hashBits, n) {
    const orderBits = n.toString(2).length;
    return hashBits > orderBits ? hash >> BigInt(hashBits - orderBits) : hash;
}

/**
 * Recover `k` and `d` from one pair of signatures sharing an `r`.
 *
 * @param {Object} a - The first signature, with `r`, `s`, `z` as bigints.
 * @param {Object} b - The second.
 * @param {bigint} n - The curve order.
 * @returns {{k: bigint, d: bigint}|null} The recovered values, or null when the pair degenerates.
 */
function recoverFromPair(a, b, n) {
    const sDiff = ((a.s - b.s) % n + n) % n;
    // s1 == s2 with r1 == r2 means the two signatures are over the same hash: the same signature
    // twice, or a duplicate in the input. There is no information in it and `1/0` does not exist.
    if (sDiff === 0n) return null;
    const zDiff = ((a.z - b.z) % n + n) % n;
    const sInv = modInverse(sDiff, n);
    if (sInv === null) return null;
    const k = (zDiff * sInv) % n;
    const rInv = modInverse(a.r, n);
    if (rInv === null) return null;
    const d = ((((a.s * k - a.z) % n) + n) % n * rInv) % n;
    // d = 0 is not a private key; it means the algebra degenerated rather than that the key is
    // zero, and returning it would be a confident wrong answer.
    if (d === 0n || k === 0n) return null;
    return { k, d };
}

export default {
    name: "ecdsa_recover",
    title: "Recover an ECDSA key from a reused nonce",
    category: "Analysis",
    description:
        "Recover an ECDSA private key from two signatures that reused a nonce, detected by a " +
        "shared `r`. Exact algebra, not a search: k = (z1-z2)/(s1-s2), d = (s1·k - z1)/r. The " +
        "four ECDSA operations all work on ONE signature and nothing compares two, which is where " +
        "ECDSA actually fails — the PS3 firmware key and the 2013 Android Bitcoin thefts were both " +
        "this. Does NOT attack merely biased nonces; that needs a lattice and is not implemented.",
    annotations: {
        title: "Recover an ECDSA key from a reused nonce",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        curve: z.enum(Object.keys(CURVES)).default("secp256k1")
            .describe(
                "The curve the signatures are over. Only its order `n` is used, so this must be " +
                "right — a wrong curve produces a plausible number that verifies against nothing."),
        signatures: z.array(z.object({
            // Bounded, like every other field here. A 521-bit value is 132 hex digits and
            // MAX_OPERAND_CHARS is 5000, so the cap is nowhere near a legitimate input -- it is
            // there because an unbounded string multiplied by MAX_SIGNATURES is a way to make the
            // server do arbitrary work before any validation of meaning happens.
            r: z.string().min(1).max(MAX_OPERAND_CHARS)
                .describe("Signature r, decimal or 0x-prefixed hex."),
            s: z.string().min(1).max(MAX_OPERAND_CHARS)
                .describe("Signature s, decimal or 0x-prefixed hex."),
            hash: z.string().min(1).max(MAX_OPERAND_CHARS)
                .describe(
                    "The MESSAGE HASH that was signed, as 0x-prefixed hex — not the message. Hex " +
                    "because a digest's WIDTH matters: it is truncated to the curve's bit length " +
                    "per FIPS 186-4, and only hex can express a leading zero byte. Decimal is " +
                    "accepted and cannot state its own width."),
            label: z.string().max(120).optional()
                .describe("An optional name, echoed back so a caller can tell which pair matched.")
        })).min(2).max(MAX_SIGNATURES)
            .describe(
                "Two or more signatures over the same key. Every pair sharing an `r` is reported.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} The recovered key, or what was checked and found absent.
     */
    async run(args) {
        const { n, note } = CURVES[args.curve];

        const parsed = args.signatures.map((sig, index) => {
            const hash = parseInteger(sig.hash, `signatures[${index}].hash`);
            // The hash's WIDTH, which is not the same as its value's bit length: a digest is a
            // fixed number of bytes and a leading zero byte is part of it, so `0x00ab...` is 256
            // bits and not 248. Only hex can carry that, so hex is measured as written and rounded
            // up to whole BYTES -- an earlier version used `(digits) * 4`, which over-reports by
            // up to 3 bits on an odd-length string and truncated a hash that needed no truncation,
            // producing a plausible wrong key. A decimal hash cannot express its own width at all;
            // there the value's bit length is the only available answer and it under-reports a
            // digest with leading zero bits. Give hashes as hex.
            const written = String(sig.hash).trim();
            const hashBits = /^0[xX]/.test(written) ?
                Math.ceil((written.length - 2) / 2) * 8 :
                hash.toString(2).length;
            const r = parseInteger(sig.r, `signatures[${index}].r`) % n;
            const s = parseInteger(sig.s, `signatures[${index}].s`) % n;
            if (r === 0n || s === 0n) {
                throw createInputError(
                    `signatures[${index}] has r or s equal to zero mod the curve order. ECDSA ` +
                    "rejects such a signature as invalid, so this is a transcription error or the " +
                    "wrong curve — not a signature an attack can use.",
                    { index, curve: args.curve });
            }
            return { r, s, z: truncateHash(hash, hashBits, n), label: sig.label ?? `#${index}`, index };
        });

        // Group by r rather than scanning pairs. The pairwise version is O(n^2) and this is the
        // same question asked once: an `r` seen twice IS a reused nonce, by construction.
        const byR = new Map();
        for (const sig of parsed) {
            const key = sig.r.toString(16);
            if (!byR.has(key)) byR.set(key, []);
            byR.get(key).push(sig);
        }

        const recoveries = [];
        const degenerate = [];
        for (const group of byR.values()) {
            if (group.length < 2) continue;
            for (let i = 0; i < group.length - 1; i++) {
                const found = recoverFromPair(group[i], group[i + 1], n);
                if (found) {
                    recoveries.push({
                        "private_key_hex": found.d.toString(16).padStart(n.toString(16).length, "0"),
                        "private_key_decimal": found.d.toString(),
                        "nonce_hex": found.k.toString(16),
                        "from": [group[i].label, group[i + 1].label],
                        "shared_r": `0x${group[i].r.toString(16)}`
                    });
                } else {
                    degenerate.push([group[i].label, group[i + 1].label]);
                }
            }
        }

        // Distinct keys, not distinct pairs. Several pairs sharing one nonce all recover the same
        // d, and reporting it three times reads as three findings.
        const distinct = [...new Set(recoveries.map(entry => entry.private_key_hex))];

        if (recoveries.length === 0) {
            return {
                curve: args.curve,
                "signatures_examined": parsed.length,
                "distinct_r_values": byR.size,
                recovered: false,
                ...(degenerate.length > 0 ? {
                    "degenerate_pairs": degenerate,
                    "degenerate_note":
                        "These pairs share an r but have equal s, which means they are signatures " +
                        "over the same hash — the same signature listed twice, not a reused nonce " +
                        "across two messages."
                } : {}),
                assessment: byR.size === parsed.length ?
                    "Every signature has a distinct r, so no nonce was reused. That is the normal " +
                    "and correct case. It does NOT mean the nonces are sound: a biased or " +
                    "partially-known nonce leaves every r distinct and is still attackable, by a " +
                    "lattice method this tool does not implement." :
                    "Signatures share an r but no key came out; see degenerate_pairs.",
                next: "If you suspect bias rather than reuse, this is the wrong tool and there is " +
                    "no right one here yet — that needs an LLL reduction over many signatures."
            };
        }

        return {
            curve: args.curve,
            "curve_note": note,
            "signatures_examined": parsed.length,
            recovered: true,
            "distinct_keys": distinct.length,
            recoveries,
            assessment:
                `Exact recovery from a reused nonce. The key is derived by two modular inversions, ` +
                `not searched for, so it is correct if the inputs are: a wrong curve or a hash ` +
                `that was not the one signed produces a plausible number that verifies against ` +
                `nothing. Check it by signing something and verifying with the public key you ` +
                `already have.`,
            next: "Verify with cyberchef_bake: " +
                "[{\"op\":\"ECDSA Sign\",\"args\":{...}}] using the recovered key, then " +
                "[{\"op\":\"ECDSA Verify\"}] against the known public key."
        };
    }
};
