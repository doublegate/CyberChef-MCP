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
import { MAX_OPERAND_CHARS, cleanIntegerText, modInverse, parseInteger } from "./rsa-attack.mjs";

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
 * Recover the candidate `(k, d)` pairs from two signatures sharing an `r`.
 *
 * Returns up to TWO candidates, and that is a property of the mathematics rather than a hedge.
 * See the block comment inside for why the pair alone cannot choose between them.
 *
 * @param {Object} a - The first signature, with `r`, `s`, `z` as bigints.
 * @param {Object} b - The second.
 * @param {bigint} n - The curve order.
 * @returns {Array<{k: bigint, d: bigint, assumption: string}>} The candidates, most likely first.
 */
function recoverFromPair(a, b, n) {
    const zDiff = ((a.z - b.z) % n + n) % n;
    const rInv = modInverse(a.r, n);
    if (rInv === null) return [];

    // TWO denominators, because a shared `r` does not imply a shared `k`.
    //
    // `r` is the x-coordinate of `kG`, and `-kG` has the same x-coordinate — so a signature made
    // with the nonce `n - k` carries the same `r` and a negated `s`. That is not a curiosity: it is
    // what **low-S normalisation** produces. BIP-62, and every Bitcoin implementation since,
    // rewrites `s` to `n - s` whenever `s > n/2`, so of two signatures that genuinely reused a
    // nonce, one may have been normalised and the other not. Then:
    //
    //     shared nonce      k = (z1 - z2) / (s1 - s2)
    //     negated nonce     k = (z1 - z2) / (s1 + s2)
    //
    // BOTH are returned, and this is the part worth being careful about, because the obvious next
    // step does not work.
    //
    // The obvious step is to verify each candidate by checking that it reproduces the signatures
    // it came from. **That check is vacuous, and it was written and measured before this comment
    // replaced it.** Given any denominator `D`, setting `k = (z1-z2)/D` and
    // `d = (s1 k - z1)/r` makes `s1 = k^-1 (z1 + r d)` true *by construction* — and the second
    // equation follows from the first:
    //
    //     k D = z1 - z2  and  k s1 = z1 + r d   =>   k (s1 - D) = z2 + r d
    //
    // so `k^-1 (z2 + r d)` equals `s2` exactly, for the WRONG denominator as much as the right
    // one. Verified numerically: both candidates pass, so the check discriminated nothing while
    // looking like it did.
    //
    // The pair genuinely does not determine which candidate is the key. Choosing needs a third
    // constraint — the public key — and testing a candidate against a public point needs the group
    // law, which would put an elliptic-curve implementation into a tool that otherwise needs one
    // integer per curve. So both are reported, labelled with the assumption each rests on, and the
    // caller is told how to choose. An answer that says "one of these two, and here is how to tell"
    // is worth more than one that picks and is silently wrong half the time.
    const candidates = [];
    const denominators = [
        [((a.s - b.s) % n + n) % n, "shared nonce (the usual case)"],
        [(a.s + b.s) % n, "negated nonce — one signature low-S normalised, e.g. BIP-62"]
    ];
    for (const [denominator, assumption] of denominators) {
        // Zero means the two signatures carry no information relative to each other: identical, or
        // exact negations. `1/0` does not exist and there is nothing to recover either way.
        if (denominator === 0n) continue;
        const sInv = modInverse(denominator, n);
        if (sInv === null) continue;
        const k = (zDiff * sInv) % n;
        if (k === 0n) continue;
        const d = ((((a.s * k - a.z) % n) + n) % n * rInv) % n;
        // d = 0 is not a private key; it means the algebra degenerated rather than that the key is
        // zero, and returning it would be a confident wrong answer.
        if (d === 0n) continue;
        candidates.push({ k, d, assumption });
    }
    return candidates;
}

export default {
    name: "ecdsa_recover",
    title: "Recover an ECDSA key from a reused nonce",
    category: "Analysis",
    description:
        "Recover an ECDSA private key from two signatures that reused a nonce, detected by a " +
        "shared `r`. Exact algebra, not a search: k = (z1-z2)/(s1±s2), d = (s1·k - z1)/r. Returns up to TWO candidates, because a shared `r` means the nonce was k or n-k and the pair cannot choose between them without the public key -- low-S normalisation makes that common. The " +
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
            // `cleanIntegerText`, the same normalisation `parseInteger` applies -- not the raw
            // string. `parseInteger` strips whitespace, underscores and colons, all of which are
            // reasonable ways to write a digest (`ab:cd:ef...`, or grouped with underscores), and
            // measuring the raw text while parsing the cleaned text over-reports the width by one
            // byte per separator. That truncates a hash which needed no truncation, and the tool
            // then recovers a key that is wrong without anything looking wrong. Found in review;
            // it is the second time this exact mismatch appeared in this function, the first being
            // a width derived as `digits * 4`.
            const written = cleanIntegerText(sig.hash);
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
            // EVERY pair in the group, not adjacent ones only. With three signatures sharing an
            // `r`, a degenerate pair at (0,1) -- a duplicate, say -- would otherwise hide a
            // recoverable pair at (0,2), and the schema promises "every pair sharing an `r` is
            // reported". The group is bounded by MAX_SIGNATURES and a shared `r` is rare, so the
            // quadratic term is over a handful of entries rather than over the input.
            for (let i = 0; i < group.length - 1; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    const found = recoverFromPair(group[i], group[j], n);
                    if (found.length === 0) {
                        degenerate.push([group[i].label, group[j].label]);
                        continue;
                    }
                    for (const candidate of found) {
                        recoveries.push({
                            "private_key_hex": candidate.d.toString(16).padStart(n.toString(16).length, "0"),
                            "private_key_decimal": candidate.d.toString(),
                            "nonce_hex": candidate.k.toString(16),
                            assumption: candidate.assumption,
                            "from": [group[i].label, group[j].label],
                            "shared_r": `0x${group[i].r.toString(16)}`
                        });
                    }
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
                        "These pairs share an r but yielded nothing. Either they are the same " +
                        "signature listed twice, or they are exact negations of one another, or " +
                        "the recovered key failed verification against the signatures it came " +
                        "from — which means the hashes given are not the ones that were signed, " +
                        "or the curve is wrong."
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
            // Reported in the success case too, not only when nothing came out. A group of three
            // where one pair is a duplicate and another recovers would otherwise drop the
            // duplicate silently, and "every pair sharing an r is reported" is what the schema
            // promises.
            ...(degenerate.length > 0 ? {
                "degenerate_pairs": degenerate,
                "degenerate_note":
                    "These pairs share an r but carry no information relative to each other: the " +
                    "same signature listed twice, or exact negations of one another."
            } : {}),
            "how_to_choose": distinct.length > 1 ?
                "MORE THAN ONE CANDIDATE, and the pair of signatures cannot choose between them. " +
                "A shared r means the nonce was either k or n-k -- `-kG` has the same " +
                "x-coordinate as `kG` -- and each possibility yields a different key. Both " +
                "reproduce the signatures they came from *by construction*, so no check against " +
                "these two signatures can discriminate; it needs the public key. Test each " +
                "candidate by signing something with it and verifying against the public key you " +
                "already have. The `assumption` field says what each rests on, and the first is " +
                "the usual case." :
                "One candidate.",
            assessment:
                "Exact algebra, not a search: each candidate is derived by two modular inversions " +
                "and is correct if the inputs are. A wrong curve, or a hash that was not the one " +
                "actually signed, produces a plausible number that verifies against nothing -- so " +
                "confirm against the public key before acting on it.",
            next: "Verify with cyberchef_bake: " +
                "[{\"op\":\"ECDSA Sign\",\"args\":{...}}] using a recovered key, then " +
                "[{\"op\":\"ECDSA Verify\"}] against the known public key."
        };
    }
};
