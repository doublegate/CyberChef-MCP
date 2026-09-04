/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * RSA attacks that need MORE THAN ONE key, or more than one ciphertext under one key.
 *
 * `rsa_attack` asks whether a single modulus was generated badly. This asks a different question:
 * whether a SET of keys, or a set of messages, leaks something no individual member does. That is
 * a structural gap rather than a missing algorithm -- CyberChef's `Fork` applies one recipe to each
 * branch and cannot compute a statistic ACROSS branches, so nothing in the operation catalogue can
 * express "these two moduli share a prime" over a corpus, let alone over five hundred.
 *
 *   - **batch_gcd** -- every pair of moduli tested for a shared prime in near-linear time rather
 *     than the quadratic pairwise scan `rsa_attack`'s `other_modulus` performs. This is the attack
 *     that found 64,081 vulnerable TLS hosts in Heninger et al.'s 11.2M-modulus survey; the naive
 *     pairwise version of the same run was estimated at 30 CPU-years against their 5.5 hours.
 *   - **common_modulus** -- the same message encrypted twice under one modulus with two coprime
 *     exponents. Recovers the message without factoring anything.
 *   - **hastad** -- one message broadcast to k >= e recipients with the same small e and no
 *     randomised padding. CRT reassembles m^e over the integers, and an exact e-th root finishes it.
 *   - **franklin_reiter** -- two ciphertexts under one key whose plaintexts differ by a KNOWN linear
 *     relation. A polynomial gcd in Z_N[x], no lattice.
 *
 * None of these is a factoring method either. Every one of them is a protocol or padding failure,
 * which is why three of the four recover a message while leaving the key intact.
 *
 * Attack selection derives from the public documentation of RsaCtfTool (MIT) and from
 * Boneh's "Twenty Years of Attacks on the RSA Cryptosystem"; the implementations are written here.
 * See THIRD-PARTY-NOTICES.md.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";
import { MAX_OPERAND_CHARS, gcd, modInverse, modPow, integerRoot, parseInteger, asMessage } from "./rsa-attack.mjs";

/**
 * V8 refuses a BigInt above 2^30 - 64 bits, and a batch GCD's product tree root is the product of
 * every modulus -- so `n * bits` is the quantity that hits the ceiling, not any single operand.
 *
 *     RangeError: Maximum BigInt size exceeded
 *
 * At 2048 bits that is 524,287 moduli, far more than this tool would be given. The cap exists so
 * the failure, if it ever arrives, is a sentence rather than a V8 internal error.
 */
const MAX_PRODUCT_BITS = 1073741760;

/**
 * Above this many keys, batch GCD beats the pairwise scan; below it, the pairwise scan wins.
 *
 * The naive ratio suggests a crossover near n = 5 -- measured at 2048 bits with the same GCD on
 * both sides, batch is 0.97x at n=4, 2.7x at n=8, 88x at n=512. But that measurement uses a naive
 * Euclid, and a faster GCD speeds the PAIRWISE side far more than the batch side, because pairwise
 * pays n^2/2 gcds against batch's n. So the real crossover sits in the low tens, and 16 is chosen
 * inside that band. The consequence of getting it wrong is a few milliseconds either way.
 */
const BATCH_GCD_MIN_KEYS = 16;

/** Largest number of keys accepted, bounding the product tree's memory as well as its time. */
const MAX_KEYS = 512;

/** Largest exponent for which an integer e-th root is attempted. See `MAX_SMALL_E` in rsa-attack. */
const MAX_BROADCAST_E = 64n;

/** Largest exponent for which the Franklin-Reiter polynomial gcd is attempted. */
const MAX_FR_E = 11n;

/**
 * Product tree over a list of moduli. Level 0 is the moduli; each level pairs adjacent nodes; the
 * root is the product of all of them.
 *
 * An odd trailing element is carried up UNCHANGED rather than padded. Padding with 1 wastes a
 * multiply and a node; padding with 0 silently zeroes the whole product, which would make every
 * subsequent gcd return the modulus itself and read as "every key is broken".
 *
 * @param {bigint[]} moduli - The moduli, at least one.
 * @returns {bigint[][]} Levels from the leaves up, the last of which holds only the root.
 */
function productTree(moduli) {
    const levels = [moduli];
    let cur = moduli;
    while (cur.length > 1) {
        const next = [];
        for (let i = 0; i + 1 < cur.length; i += 2) next.push(cur[i] * cur[i + 1]);
        if (cur.length % 2) next.push(cur[cur.length - 1]);
        levels.push(next);
        cur = next;
    }
    return levels;
}

/**
 * Batch GCD: find, for every modulus, its gcd with the product of all the others.
 *
 * The identity is `gcd(N_i, (P mod N_i^2) / N_i) === gcd(N_i, prod_{j != i} N_j)`, and the SQUARE is
 * the mechanism rather than an optimisation. Reducing mod N_i alone returns nothing at all: N_i
 * divides P by construction, so `P mod N_i` is always zero and the tree degenerates to a column of
 * zeros. Forming `P / N_i` explicitly instead costs the same order as the naive pairwise scan, since
 * the n quotients carry n^2 * b bits of distinct output between them.
 *
 * The descent reduces mod the square at EVERY level, not only at the leaves: N_i divides every
 * ancestor of leaf i, so N_i^2 divides every ancestor's square, and the reduction telescopes.
 *
 * @param {bigint[]} moduli - Distinct moduli.
 * @returns {{gcds: bigint[], degenerate: number[]}} Per-index gcd, and the indices where the
 *   quotient was zero -- see below for why that is the thing to test.
 */
function batchGcd(moduli) {
    const levels = productTree(moduli);
    // Descend holding two adjacent levels at a time. Heninger et al. measured the remainder tree at
    // roughly ten times the product tree, so this loop is the cost of the whole attack; the product
    // tree above is about 9% of it and is not worth optimising.
    let remainders = [levels[levels.length - 1][0]];
    for (let l = levels.length - 2; l >= 0; l--) {
        const cur = levels[l];
        const next = new Array(cur.length);
        for (let i = 0; i < cur.length; i++) next[i] = remainders[i >> 1] % (cur[i] * cur[i]);
        remainders = next;
    }

    const gcds = [];
    const degenerate = [];
    for (let i = 0; i < moduli.length; i++) {
        // Exact division, guaranteed by the identity above -- N_i divides P mod N_i^2.
        const quotient = remainders[i] / moduli[i];
        // Test the QUOTIENT against zero, not the gcd against the modulus. It is a comparison
        // against a small value rather than a full-width BigInt, and it names the cause rather than
        // the symptom: the quotient is zero exactly when N_i divides the product of the others
        // entirely, which happens when a modulus is duplicated or when BOTH of its primes appear in
        // two other moduli. Heninger et al. hit the same case and fell back to the quadratic scan.
        if (quotient === 0n) {
            degenerate.push(i);
            gcds.push(moduli[i]);
        } else {
            gcds.push(gcd(moduli[i], quotient));
        }
    }
    return { gcds, degenerate };
}

/**
 * The quadratic scan, used below the crossover and as the fallback for degenerate indices.
 *
 * @param {bigint[]} moduli - The moduli.
 * @param {number[]} [only] - Restrict to these indices; all of them if omitted.
 * @returns {bigint[]} Per-index gcd with the product of the others, 1n where none was found.
 */
function pairwiseGcd(moduli, only) {
    const indices = only ?? moduli.map((_, i) => i);
    const out = new Array(moduli.length).fill(1n);
    for (const i of indices) {
        for (let j = 0; j < moduli.length; j++) {
            if (i === j) continue;
            const g = gcd(moduli[i], moduli[j]);
            if (g > 1n && g < moduli[i]) {
                out[i] = g;
                break;
            }
        }
    }
    return out;
}

/**
 * Extended Euclidean algorithm over BigInt.
 *
 * @param {bigint} a - First value.
 * @param {bigint} b - Second value.
 * @returns {{g: bigint, x: bigint, y: bigint}} With `a*x + b*y === g === gcd(a, b)`.
 */
function egcd(a, b) {
    let [oldR, r] = [a, b];
    let [oldS, s] = [1n, 0n];
    let [oldT, t] = [0n, 1n];
    while (r) {
        const q = oldR / r;
        [oldR, r] = [r, oldR - q * r];
        [oldS, s] = [s, oldS - q * s];
        [oldT, t] = [t, oldT - q * t];
    }
    return { g: oldR, x: oldS, y: oldT };
}

/**
 * `base^exp mod m` where exp may be NEGATIVE.
 *
 * A negative exponent is handled by inverting the base and exponentiating by the magnitude. It is
 * NOT reduced modulo phi(n) -- phi(n) is precisely what an attacker does not know here, and reducing
 * by a guess produces a wrong answer that looks like a right one.
 *
 * @param {bigint} base - The base.
 * @param {bigint} exp - The exponent, of either sign.
 * @param {bigint} m - The modulus.
 * @returns {bigint|{factor: bigint}} The power, or a factor of m if the base is not invertible.
 */
function modPowSigned(base, exp, m) {
    if (exp >= 0n) return modPow(base, exp, m);
    const g = gcd(((base % m) + m) % m, m);
    // A failed inversion is a WIN, not an error: it fails exactly when gcd(base, m) > 1, and that
    // gcd factors the modulus. Swallowing this branch throws away the better of the two results.
    if (g > 1n && g < m) return { factor: g };
    const inv = modInverse(base, m);
    if (inv === null) return { factor: m };
    return modPow(inv, -exp, m);
}

/**
 * Chinese remainder reconstruction over pairwise-coprime moduli.
 *
 * @param {bigint[]} residues - The residues.
 * @param {bigint[]} moduli - The moduli, pairwise coprime and distinct.
 * @returns {bigint} The unique value below their product.
 */
function crt(residues, moduli) {
    const product = moduli.reduce((a, b) => a * b, 1n);
    let sum = 0n;
    for (let i = 0; i < moduli.length; i++) {
        const partial = product / moduli[i];
        const inverse = modInverse(partial, moduli[i]);
        /* v8 ignore next 5 -- defence in depth. Every caller checks pairwise coprimality first,
           and that check is what this guards; it exists so a future caller that forgets produces a
           sentence rather than "TypeError: Cannot mix BigInt and other types", which is what the
           multiplication below does when modInverse returns null. */
        if (inverse === null) {
            throw createInputError(
                "The moduli are not pairwise coprime, so no CRT reconstruction exists.",
                { modulus: moduli[i].toString().slice(0, 60) });
        }
        sum += residues[i] * partial * inverse;
    }
    return ((sum % product) + product) % product;
}

/** @returns {bigint[]} A polynomial with its leading zero coefficients removed. */
const polyTrim = (a) => {
    let end = a.length;
    while (end > 0 && a[end - 1] === 0n) end--;
    return a.slice(0, end);
};

/**
 * Polynomial remainder in Z_N[x], coefficients low-order first.
 *
 * @param {bigint[]} a - The dividend.
 * @param {bigint[]} b - The divisor, non-zero.
 * @param {bigint} n - The modulus.
 * @returns {bigint[]|{factor: bigint}} The remainder, or a factor of n if the divisor's leading
 *   coefficient turned out not to be invertible.
 */
function polyMod(a, b, n) {
    const divisor = polyTrim(b);
    const lead = divisor[divisor.length - 1];
    // Z_N[x] is not a Euclidean domain, and this is the single place that matters: making the
    // divisor monic needs the leading coefficient's inverse. When it has none, gcd(lead, n) > 1 --
    // which factors N outright, a strictly better outcome than the message this was computing.
    const g = gcd(lead, n);
    if (g > 1n && g < n) return { factor: g };
    const inv = modInverse(lead, n);
    if (inv === null) return { factor: n };

    const out = a.map(c => ((c % n) + n) % n);
    for (let i = out.length - divisor.length; i >= 0; i--) {
        const factor = (out[i + divisor.length - 1] * inv) % n;
        if (factor === 0n) continue;
        for (let j = 0; j < divisor.length; j++) {
            const k = i + j;
            out[k] = ((out[k] - factor * divisor[j]) % n + n) % n;
        }
    }
    return polyTrim(out);
}

/**
 * Polynomial gcd in Z_N[x].
 *
 * @param {bigint[]} a - First polynomial.
 * @param {bigint[]} b - Second polynomial.
 * @param {bigint} n - The modulus.
 * @returns {bigint[]|{factor: bigint}} Their gcd, or a factor of n discovered on the way.
 */
function polyGcd(a, b, n) {
    let [x, y] = [polyTrim(a), polyTrim(b)];
    while (y.length > 0) {
        const r = polyMod(x, y, n);
        if (!Array.isArray(r)) return r;
        [x, y] = [y, r];
    }
    return x;
}

/**
 * `(a*x + b)^e mod (n, x^e - c)` is not needed: e is small, so expand `(a*x + b)^e` directly.
 *
 * @param {bigint} a - Coefficient of x.
 * @param {bigint} b - Constant term.
 * @param {bigint} e - The exponent, small.
 * @param {bigint} n - The modulus.
 * @returns {bigint[]} The expansion, coefficients low-order first.
 */
function linearPower(a, b, e, n) {
    let poly = [1n];
    const step = [((b % n) + n) % n, ((a % n) + n) % n];
    for (let i = 0n; i < e; i++) {
        const next = new Array(poly.length + 1).fill(0n);
        for (let j = 0; j < poly.length; j++) {
            for (let k = 0; k < step.length; k++) {
                next[j + k] = (next[j + k] + poly[j] * step[k]) % n;
            }
        }
        poly = next;
    }
    return polyTrim(poly);
}

/**
 * @param {Object[]} keys - The validated key objects.
 * @returns {{n: bigint, e: bigint, c: bigint|null, index: number}[]} Parsed, in input order.
 */
function parseKeys(keys) {
    return keys.map((k, index) => {
        const n = parseInteger(k.modulus, `keys[${index}].modulus`);
        if (n < 4n) {
            throw createInputError(`keys[${index}].modulus must be at least 4.`, { index, modulus: n.toString() });
        }
        return {
            index,
            n,
            e: parseInteger(k.public_exponent ?? "65537", `keys[${index}].public_exponent`),
            c: k.ciphertext ? parseInteger(k.ciphertext, `keys[${index}].ciphertext`) : null
        };
    });
}

export default {
    name: "rsa_multi_key",
    title: "RSA multi-key attack",
    category: "Analysis",
    description:
        "Attack a SET of RSA keys, or several ciphertexts under one key, for leaks no single key " +
        "shows: shared primes across a corpus in near-linear time (batch GCD), one message sent " +
        "twice under one modulus with two exponents (common modulus), one message broadcast under " +
        "a small exponent (Håstad), and two ciphertexts related by a known linear relation " +
        "(Franklin–Reiter). Three of the four recover the message without factoring anything. Use " +
        "`rsa_attack` for a single key.",
    annotations: {
        title: "RSA multi-key attack",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        keys: z.array(z.object({
            modulus: z.string().min(1).max(MAX_OPERAND_CHARS).describe("The modulus n."),
            "public_exponent": z.string().max(MAX_OPERAND_CHARS).optional()
                .describe("The public exponent e. Defaults to 65537."),
            ciphertext: z.string().max(MAX_OPERAND_CHARS).optional()
                .describe("A ciphertext under this key.")
        })).min(2).max(MAX_KEYS)
            .describe(
                "The keys to attack together. Two suffice for common_modulus and " +
                "franklin_reiter; Håstad needs at least e; batch_gcd wants as many as you have."),
        attacks: z.array(z.enum(["batch_gcd", "common_modulus", "hastad", "franklin_reiter"])).max(4).optional()
            .describe("Which attacks to try. All of the applicable ones by default."),
        "relation_a": z.string().max(64).default("1")
            .describe(
                "For franklin_reiter: the multiplier in m1 = a*m2 + b. The relation must be KNOWN."),
        "relation_b": z.string().max(MAX_OPERAND_CHARS).default("1")
            .describe("For franklin_reiter: the offset in m1 = a*m2 + b.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} What each applicable attack found, and why the rest did not apply.
     */
    async run(args) {
        const keys = parseKeys(args.keys);
        const requested = args.attacks?.length ?
            new Set(args.attacks) :
            new Set(["batch_gcd", "common_modulus", "hastad", "franklin_reiter"]);
        const attempted = [];
        const findings = [];

        // --- batch GCD ------------------------------------------------------------------------
        if (requested.has("batch_gcd")) {
            // Deduplicate FIRST, and keep the map back to the input indices. Two identical moduli
            // make every gcd degenerate, so this is a precondition of the algorithm rather than a
            // tidiness measure -- and a repeated modulus is itself a finding worth reporting.
            const seen = new Map();
            for (const k of keys) {
                const key = k.n.toString();
                if (!seen.has(key)) seen.set(key, []);
                seen.get(key).push(k.index);
            }
            const duplicates = [...seen.values()].filter(v => v.length > 1);
            const unique = [...seen.entries()].map(([value, indices]) => ({ n: BigInt(value), indices }));

            const productBits = unique.reduce((sum, u) => sum + u.n.toString(2).length, 0);
            if (productBits > MAX_PRODUCT_BITS) {
                attempted.push(
                    `batch_gcd (skipped: the moduli total ${productBits} bits, and their product ` +
                    `would exceed the ${MAX_PRODUCT_BITS}-bit limit V8 places on a BigInt)`);
            } else {
                const moduli = unique.map(u => u.n);
                let gcds;
                let degenerate = [];
                if (moduli.length >= BATCH_GCD_MIN_KEYS) {
                    attempted.push(`batch_gcd (product tree over ${moduli.length} distinct moduli)`);
                    ({ gcds, degenerate } = batchGcd(moduli));
                } else {
                    // Below the crossover the quadratic scan is simply faster, and it has no
                    // degenerate case. Saying which one ran matters: their failure modes differ.
                    attempted.push(`batch_gcd (pairwise scan: ${moduli.length} moduli is below the ${BATCH_GCD_MIN_KEYS}-key crossover)`);
                    gcds = pairwiseGcd(moduli);
                }
                if (degenerate.length) {
                    const fallback = pairwiseGcd(moduli, degenerate);
                    for (const i of degenerate) gcds[i] = fallback[i];
                }

                for (let i = 0; i < moduli.length; i++) {
                    const g = gcds[i];
                    if (g > 1n && g < moduli[i]) {
                        findings.push({
                            attack: "batch_gcd",
                            "key_indices": unique[i].indices,
                            p: g.toString(),
                            q: (moduli[i] / g).toString(),
                            note: "This modulus shares a prime with another in the set. BOTH keys are broken."
                        });
                    }
                }
                for (const indices of duplicates) {
                    findings.push({
                        attack: "batch_gcd",
                        "key_indices": indices,
                        note: "These keys have the SAME modulus. Whoever holds either private key can read the other's traffic."
                    });
                }
            }
        }

        // --- common modulus -------------------------------------------------------------------
        if (requested.has("common_modulus")) {
            let ran = false;
            for (let i = 0; i < keys.length && !ran; i++) {
                for (let j = i + 1; j < keys.length && !ran; j++) {
                    const [a, b] = [keys[i], keys[j]];
                    if (a.n !== b.n || a.e === b.e || a.c === null || b.c === null) continue;
                    const { g, x, y } = egcd(a.e, b.e);
                    if (g !== 1n) continue;
                    ran = true;
                    attempted.push(`common_modulus (keys ${a.index} and ${b.index})`);
                    const left = modPowSigned(a.c, x, a.n);
                    const right = modPowSigned(b.c, y, a.n);
                    if (typeof left === "object" || typeof right === "object") {
                        const factor = (typeof left === "object" ? left : right).factor;
                        findings.push({
                            attack: "common_modulus",
                            "key_indices": [a.index, b.index],
                            p: factor.toString(),
                            q: (a.n / factor).toString(),
                            note: "A ciphertext shared a factor with the modulus, so the inversion the " +
                                "attack needed factored the key instead. Strictly the better outcome."
                        });
                    } else {
                        const m = (left * right) % a.n;
                        findings.push({
                            attack: "common_modulus",
                            "key_indices": [a.index, b.index],
                            plaintext: asMessage(m),
                            "plaintext_int": m.toString(),
                            note: "The same message was encrypted twice under one modulus with two coprime " +
                                "exponents. The key is untouched; the message is not."
                        });
                    }
                }
            }
            if (!ran) {
                attempted.push(
                    "common_modulus (skipped: needs two keys with the SAME modulus, DIFFERENT " +
                    "coprime exponents, and a ciphertext each)");
            }
        }

        // --- Hastad broadcast -----------------------------------------------------------------
        if (requested.has("hastad")) {
            const byExponent = new Map();
            for (const k of keys) {
                if (k.c === null || k.e > MAX_BROADCAST_E) continue;
                const key = k.e.toString();
                if (!byExponent.has(key)) byExponent.set(key, []);
                // Deduplicate moduli here too: a repeated modulus puts a repeated factor into the
                // CRT product, and the reconstruction is then simply wrong rather than absent.
                if (!byExponent.get(key).some(o => o.n === k.n)) byExponent.get(key).push(k);
            }
            let ran = false;
            for (const [exponent, group] of byExponent) {
                const e = BigInt(exponent);
                if (BigInt(group.length) < e) continue;
                const chosen = group.slice(0, Number(e));
                // Coprimality is also the detection step. A shared factor here is not an obstacle
                // to work around -- it factors two keys, which beats recovering one message, and
                // Boneh's own treatment assumes it away for exactly that reason.
                let shared = null;
                for (let i = 0; i < chosen.length && !shared; i++) {
                    for (let j = i + 1; j < chosen.length && !shared; j++) {
                        const g = gcd(chosen[i].n, chosen[j].n);
                        // `g > 1n`, not `g > 1n && g < n_i`. The narrower test missed the case
                        // where one modulus DIVIDES another -- 15 and 45, say -- because then
                        // g === n_i. The moduli are distinct after deduplication, so nothing else
                        // rejected them, and `crt` was reached with moduli that are not pairwise
                        // coprime: `modInverse` returns null for a non-invertible partial product
                        // and the multiplication threw `TypeError: Cannot mix BigInt and other
                        // types`. A crash, from an input the schema accepts.
                        if (g > 1n) shared = { g, i, j };
                    }
                }
                ran = true;
                attempted.push(`hastad (e=${exponent}, ${chosen.length} moduli)`);
                if (shared) {
                    const divides = shared.g === chosen[shared.i].n || shared.g === chosen[shared.j].n;
                    findings.push({
                        attack: "hastad",
                        "key_indices": [chosen[shared.i].index, chosen[shared.j].index],
                        // A shared factor that equals one of the moduli is not a factorisation of
                        // it -- one simply divides the other, which is not an RSA modulus pair at
                        // all. Reporting p and q there would be reporting n and 1.
                        ...(divides ? {} : {
                            p: shared.g.toString(),
                            q: (chosen[shared.i].n / shared.g).toString()
                        }),
                        note: divides ?
                            "One of these moduli divides another, so they are not pairwise coprime " +
                            "and the CRT reconstruction Håstad needs does not exist. At least one " +
                            "of them is not an RSA modulus." :
                            "Two of the broadcast moduli share a prime. Håstad was abandoned: " +
                            "factoring two keys is a better result than recovering one message."
                    });
                    continue;
                }
                const combined = crt(chosen.map(k => k.c), chosen.map(k => k.n));
                const root = integerRoot(combined, e);
                if (root ** e === combined) {
                    findings.push({
                        attack: "hastad",
                        "key_indices": chosen.map(k => k.index),
                        plaintext: asMessage(root),
                        "plaintext_int": root.toString(),
                        note: `One message was sent to ${chosen.length} recipients under e=${exponent} with no ` +
                            "randomised padding, so m^e was recoverable over the integers."
                    });
                } else {
                    findings.push({
                        attack: "hastad",
                        "key_indices": chosen.map(k => k.index),
                        note: "The CRT reconstruction is not an exact e-th power, so this is not an unpadded " +
                            "broadcast of one identical message. Randomised padding defeats the attack, and " +
                            "so does any difference between the messages."
                    });
                }
            }
            if (!ran) {
                attempted.push(
                    `hastad (skipped: needs at least e keys sharing one small exponent (e <= ${MAX_BROADCAST_E}), each with a ciphertext)`);
            }
        }

        // --- Franklin-Reiter ------------------------------------------------------------------
        if (requested.has("franklin_reiter")) {
            const a = parseInteger(args.relation_a, "relation_a");
            const b = parseInteger(args.relation_b, "relation_b");
            let ran = false;
            for (let i = 0; i < keys.length && !ran; i++) {
                for (let j = i + 1; j < keys.length && !ran; j++) {
                    const [x, y] = [keys[i], keys[j]];
                    if (x.n !== y.n || x.e !== y.e || x.c === null || y.c === null) continue;
                    if (x.e > MAX_FR_E) continue;
                    ran = true;
                    attempted.push(`franklin_reiter (keys ${x.index} and ${y.index}, m1 = ${a}*m2 + ${b})`);
                    // g1(z) = (a*z + b)^e - c1 and g2(z) = z^e - c2 share the root m2.
                    const g1 = linearPower(a, b, x.e, x.n);
                    g1[0] = ((g1[0] - x.c) % x.n + x.n) % x.n;
                    const g2 = new Array(Number(y.e) + 1).fill(0n);
                    g2[0] = ((-y.c % y.n) + y.n) % y.n;
                    g2[g2.length - 1] = 1n;
                    const g = polyGcd(polyTrim(g1), polyTrim(g2), x.n);
                    if (!Array.isArray(g)) {
                        findings.push({
                            attack: "franklin_reiter",
                            "key_indices": [x.index, y.index],
                            p: g.factor.toString(),
                            q: (x.n / g.factor).toString(),
                            note: "A leading coefficient was not invertible mod n during the polynomial gcd, " +
                                "which factors n. Z_N[x] is not Euclidean and that is the only way it shows."
                        });
                    } else if (g.length === 2) {
                        const inv = modInverse(g[1], x.n);
                        const m2 = inv === null ? null : ((-g[0] * inv) % x.n + x.n) % x.n;
                        findings.push({
                            attack: "franklin_reiter",
                            "key_indices": [x.index, y.index],
                            ...(m2 === null ? {} : { plaintext: asMessage(m2), "plaintext_int": m2.toString() }),
                            note: "The two plaintexts were related by the given linear relation, so their " +
                                "polynomial gcd is linear and its root is the second message."
                        });
                    } else {
                        findings.push({
                            attack: "franklin_reiter",
                            "key_indices": [x.index, y.index],
                            note: `The polynomial gcd has degree ${Math.max(g.length - 1, 0)} rather than 1, so the ` +
                                "plaintexts are not related by relation_a and relation_b. The relation must be " +
                                "known; the attack does not search for it."
                        });
                    }
                }
            }
            if (!ran) {
                attempted.push(
                    `franklin_reiter (skipped: needs two ciphertexts under ONE modulus with the same small exponent (e <= ${MAX_FR_E}))`);
            }
        }

        const broke = findings.filter(f => f.p || f.plaintext);
        return {
            "keys_examined": keys.length,
            attempted,
            findings,
            assessment: broke.length ?
                `${broke.length} of these keys or messages is recoverable. Every attack here is a ` +
                "protocol or padding failure rather than a factoring result, so a key that survives " +
                "is not thereby strong." :
                "Nothing applied. These attacks need a specific relationship BETWEEN the inputs — a " +
                "shared prime, a shared modulus, a shared message — and none was present. That says " +
                "nothing about any individual key; run `rsa_attack` on each for that.",
            next: broke.length ?
                "Pass a recovered p and q back through `rsa_attack` on the individual modulus to get " +
                "the private exponent and decrypt further ciphertexts." :
                "batch_gcd is the one worth scaling: it is near-linear, so adding every other key you " +
                "hold from the same source costs little and is how weak-entropy key generation is found."
        };
    }
};
