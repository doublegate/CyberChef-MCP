/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Recover an RSA private key from a modulus that was generated badly.
 *
 * CyberChef can encrypt, decrypt, sign, verify and generate RSA keys, and has no way to attack one.
 * That is the gap this fills: given a public key, decide whether it is weak, and if it is, produce
 * the factors and the private exponent.
 *
 * Every attack here works only against a SPECIFIC generation flaw. None of them threatens a
 * correctly generated key, and none is a general factoring method -- a 2048-bit modulus from a
 * sound generator will defeat all four, quickly and by design. What they detect is:
 *
 *   - **Fermat** -- p and q chosen too close together, which happens when a generator picks one
 *     prime and then searches upward for the next.
 *   - **Common factor** -- two moduli sharing a prime, which happens when devices generate keys
 *     from a low-entropy pool at first boot. A single gcd breaks both keys.
 *   - **Wiener** -- a private exponent chosen small to make decryption fast.
 *   - **Small e, unpadded** -- e=3 with a message short enough that m^e never wraps the modulus,
 *     so the ciphertext is just a cube.
 *
 * Reported as *findings about key quality* rather than only as a crack, because the useful answer
 * for a defender is "this key is weak, and here is why".
 *
 * Attack selection derives from the public documentation of RsaCtfTool (MIT); the implementations
 * are written here. See THIRD-PARTY-NOTICES.md.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";

/**
 * The largest operand this tool will accept, in characters.
 *
 * Cost here is driven by the SIZE of the numbers, not by the iteration count, and the difference
 * is four orders of magnitude. Measured:
 *
 *   fermat, 1,000,000 iterations, 65-bit modulus            582 ms
 *   fermat,       100 iterations, 262,144-bit modulus    72,125 ms
 *
 * So bounding `fermat_iterations` alone bounds nothing. A 262,144-bit "modulus" is not a key --
 * nobody has generated one -- and it blocked for 72 seconds, well past the 30-second timeout every
 * operation tool is held to.
 *
 * 5,000 characters admits a 16,384-bit key as hex (4,096 chars) or decimal (4,933 digits), far
 * beyond anything in use; RSA-4096 is already unusual. Above that the input is not a key, so
 * refusing it costs no real capability.
 */
const MAX_OPERAND_CHARS = 5000;

/** Bit length above which an operand is not a key, whatever it claims to be. */
const MAX_MODULUS_BITS = 16384;

/**
 * Largest public exponent for which the small-e attack is attempted.
 *
 * `integerRoot` computes `hi ** k`, so a large `k` is not slow -- it is fatal:
 *
 *     RangeError: Maximum BigInt size exceeded
 *         at integerRoot (rsa-attack.mjs:131)
 *
 * A 400-digit exponent reaches that, and the caller gets an internal V8 error instead of an answer.
 * `e` cannot be bounded globally, because a LARGE e is the signature Wiener's attack looks for --
 * a small private exponent implies a large public one -- so the guard belongs on this attack alone.
 *
 * 1024 is far past the point of usefulness in any case. Unpadded small-e is meaningful for e = 3,
 * occasionally 5 or 17; it needs m^e < n, and above a few dozen no message short enough exists.
 */
const MAX_SMALL_E = 1024n;

/**
 * Floor integer square root, by Newton's method on BigInt.
 *
 * @param {bigint} n - A non-negative integer.
 * @returns {bigint} The floor of its square root.
 */
function isqrt(n) {
    /* v8 ignore next -- an invariant, not a path: every caller passes a value already known
       non-negative (a modulus, a ciphertext, or a discriminant tested >= 0 first). Kept so the
       helper stays safe if it is ever reused, and left unexercised rather than tested through a
       private export that would exist only to move a number. */
    if (n < 0n) throw new RangeError("isqrt of a negative number");
    if (n < 2n) return n;
    // Start from 2^(bits/2 + 1) rather than from n. Newton converges quadratically only once it is
    // near the root; starting at n it merely HALVES each step until it gets there, so the cost is
    // O(bits) big-integer divisions -- about 8,000 of them for a 16,384-bit modulus, and isqrt is
    // called once per Fermat iteration through isPerfectSquare. The shifted guess is already within
    // a factor of two, so only the quadratic phase remains.
    //
    // Bit length via the HEX string: a quarter the allocation of `toString(2)`, in a function the
    // Fermat loop calls on every iteration. It over-estimates by up to 3 bits, which is harmless --
    // Newton needs a starting point at or above the root, and a slightly high one costs at most one
    // extra step. Verified not to under-estimate; that direction would break the convergence.
    let x = 1n << (BigInt(n.toString(16).length * 4) / 2n + 1n);
    let y = (x + n / x) / 2n;
    while (y < x) {
        x = y;
        y = (x + n / x) / 2n;
    }
    return x;
}

/** @returns {boolean} Whether n is a perfect square. */
const isPerfectSquare = (n) => {
    /* v8 ignore next -- same invariant as isqrt: callers test the discriminant's sign first. */
    if (n < 0n) return false;
    // A perfect square is congruent to 0, 1, 4 or 9 mod 16 -- verified exhaustively, and it rejects
    // 75% of candidates with one mask. Worth the line because the Fermat loop calls this on every
    // iteration and the alternative is a full isqrt: a string allocation and a Newton descent over
    // a number that may be 16,384 bits wide.
    const low = Number(n & 15n);
    if (low !== 0 && low !== 1 && low !== 4 && low !== 9) return false;
    const r = isqrt(n);
    return r * r === n;
};

/** @returns {bigint} The greatest common divisor. */
const gcd = (a, b) => {
    while (b) [a, b] = [b, a % b];
    /* v8 ignore next -- both arguments are moduli, so the result is never negative here. */
    return a < 0n ? -a : a;
};

/**
 * Modular inverse by the extended Euclidean algorithm.
 *
 * @param {bigint} a - The value.
 * @param {bigint} mod - The modulus.
 * @returns {bigint|null} The inverse, or null if a and mod are not coprime.
 */
function modInverse(a, mod) {
    let [oldR, r] = [((a % mod) + mod) % mod, mod];
    let [oldS, s] = [1n, 0n];
    while (r) {
        const q = oldR / r;
        [oldR, r] = [r, oldR - q * r];
        [oldS, s] = [s, oldS - q * s];
    }
    if (oldR !== 1n) return null;
    return ((oldS % mod) + mod) % mod;
}

/** @returns {bigint} base^exp mod m, by square-and-multiply. */
function modPow(base, exp, m) {
    let result = 1n;
    let b = ((base % m) + m) % m;
    let e = exp;
    while (e > 0n) {
        if (e & 1n) result = (result * b) % m;
        b = (b * b) % m;
        e >>= 1n;
    }
    return result;
}

/** @returns {bigint} The floor of the k-th root of n, by binary search. */
function integerRoot(n, k) {
    if (n < 2n) return n;
    let lo = 1n;
    let hi = 2n;
    while (hi ** k <= n) hi *= 2n;
    while (lo < hi) {
        const mid = (lo + hi + 1n) / 2n;
        if (mid ** k <= n) lo = mid;
        else hi = mid - 1n;
    }
    return lo;
}

/**
 * Fermat factorisation: fast when p and q are close, useless otherwise.
 *
 * @param {bigint} n - The modulus.
 * @param {number} maxIterations - Bound on the search.
 * @returns {{p: bigint, q: bigint}|null} The factors, or null.
 */
async function fermat(n, maxIterations, deadline) {
    if (n % 2n === 0n) return { p: 2n, q: n / 2n };
    let a = isqrt(n);
    if (a * a < n) a += 1n;
    for (let i = 0; i < maxIterations; i++) {
        // Yield to the event loop periodically. Without this the loop is one uninterruptible
        // synchronous block, and the call timeout wrapped around it cannot fire -- `Promise.race`
        // never gets a turn, so the "timeout" would resolve only after the work it was meant to
        // bound had already finished. A bound that cannot be enforced is not a bound.
        if ((i & 0xff) === 0xff) {
            // Yielding alone is not enough, and measuring showed why. `Promise.race` does not
            // CANCEL the loser: a timed-out call returns to the client while this loop keeps
            // running to completion. At 16,384 bits -- which the size guard permits -- the default
            // 100,000 iterations extrapolate to roughly 37 minutes, so a client could time out
            // repeatedly and accumulate runaway loops behind its own error responses.
            //
            // The deadline is checked here, in the loop, so the work actually stops.
            if (Date.now() > deadline) return { exhausted: false, iterations: i };
            await new Promise(resolve => setImmediate(resolve));
        }
        const b2 = a * a - n;
        if (isPerfectSquare(b2)) {
            const b = isqrt(b2);
            const p = a - b;
            const q = a + b;
            if (p > 1n && p * q === n) return { p, q };
        }
        a += 1n;
    }
    return null;
}

/** How long the Fermat search may run before it gives up, in milliseconds. */
const FERMAT_BUDGET_MS = 10000;

/**
 * Wiener's attack: recovers a private exponent that was chosen small.
 *
 * Walks the convergents of the continued fraction of e/n. Each convergent k/d is a candidate; the
 * right one makes (e*d - 1)/k a plausible phi, whose implied p + q gives a quadratic with a
 * perfect-square discriminant.
 *
 * @param {bigint} e - The public exponent.
 * @param {bigint} n - The modulus.
 * @returns {{d: bigint, p: bigint, q: bigint}|null} The private exponent and factors, or null.
 */
function wiener(e, n) {
    const terms = [];
    let a = e;
    let b = n;
    while (b) {
        terms.push(a / b);
        [a, b] = [b, a % b];
    }
    let [num0, den0, num1, den1] = [0n, 1n, 1n, 0n];
    for (const term of terms) {
        const num = term * num1 + num0;
        const den = term * den1 + den0;
        [num0, den0, num1, den1] = [num1, den1, num, den];
        const k = num;
        const d = den;
        if (k === 0n || d === 0n) continue;
        if ((e * d - 1n) % k !== 0n) continue;
        const phi = (e * d - 1n) / k;
        const sum = n - phi + 1n;                      // p + q
        const disc = sum * sum - 4n * n;
        if (disc >= 0n && isPerfectSquare(disc)) {
            const root = isqrt(disc);
            if ((sum + root) % 2n === 0n) return { d, p: (sum - root) / 2n, q: (sum + root) / 2n };
        }
    }
    return null;
}

/**
 * Parse an integer written as decimal, 0x-prefixed hex, or bare hex.
 *
 * Bare hex is accepted because a modulus is far more often pasted as hex than as decimal, but only
 * when it cannot be read as decimal -- otherwise "123456" would be ambiguous, and guessing wrong
 * changes the answer silently.
 *
 * @param {string} value - The text.
 * @param {string} label - Field name, for the error message.
 * @returns {bigint} The value.
 */
function parseInteger(value, label) {
    const cleaned = String(value).trim().replace(/[\s_:]/g, "");
    try {
        if (/^0x/i.test(cleaned)) return BigInt(cleaned);
        if (/^\d+$/.test(cleaned)) return BigInt(cleaned);
        if (/^[0-9a-f]+$/i.test(cleaned)) return BigInt("0x" + cleaned);
    } catch { /* fall through to the error below */ }
    throw createInputError(
        `${label} is not an integer. Give it as decimal, 0x-prefixed hex, or bare hex.`,
        { field: label, received: String(value).slice(0, 60) });
}

/** @returns {string} A bigint rendered as text if it looks like ASCII, else as hex. */
function asMessage(m) {
    let hex = m.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    const bytes = hex.match(/../g)?.map(h => parseInt(h, 16)) ?? [];
    const printable = bytes.length > 0 && bytes.every(b => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127));
    return printable ? String.fromCharCode(...bytes) : `0x${hex}`;
}

export default {
    name: "rsa_attack",
    title: "RSA key attack",
    category: "Analysis",
    description:
        "Test an RSA public key for the generation flaws that make it breakable, and recover the " +
        "private key when one applies: Fermat (primes too close), shared factors between two " +
        "moduli, Wiener (private exponent too small) and unpadded small-e. None of these threatens " +
        "a correctly generated key — a sound 2048-bit modulus defeats all four — so a negative " +
        "result is evidence the key is not weak in these specific ways. Decrypts a supplied " +
        "ciphertext when the key is recovered.",
    annotations: {
        title: "RSA key attack",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        // MAX_OPERAND_CHARS bounds every operand. Cost here is driven by the SIZE of the numbers,
        // not by the iteration count -- see the note on the constant.
        modulus: z.string().min(1).max(MAX_OPERAND_CHARS)
            .describe("The modulus n, as decimal or hex."),
        "public_exponent": z.string().max(MAX_OPERAND_CHARS).default("65537")
            .describe("The public exponent e."),
        ciphertext: z.string().max(MAX_OPERAND_CHARS).optional()
            .describe("Optional. Decrypted if the private key is recovered."),
        "other_modulus": z.string().max(MAX_OPERAND_CHARS).optional()
            .describe("A second modulus, to test for a shared prime factor. Breaks both keys if one exists."),
        attacks: z.array(z.enum(["fermat", "common_factor", "wiener", "small_e"])).optional()
            .describe("Which attacks to try. All of them by default."),
        "fermat_iterations": z.number().int().min(1).max(10000000).default(100000)
            .describe("Bound on the Fermat search. Higher finds primes that are further apart, and takes longer.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} What was found, and what was ruled out.
     */
    async run(args) {
        const n = parseInteger(args.modulus, "modulus");
        const e = parseInteger(args.public_exponent, "public_exponent");
        if (n < 4n) throw createInputError("The modulus must be at least 4.", { modulus: n.toString() });
        if (e < 2n) throw createInputError("The public exponent must be at least 2.", { e: e.toString() });
        // The character bound is a proxy; this is the real limit. A decimal string well under
        // MAX_OPERAND_CHARS can still describe a number too large to work with, and every attack
        // below is superlinear in the operand's bit length.
        const bits = n.toString(2).length;
        if (bits > MAX_MODULUS_BITS) {
            throw createInputError(
                `The modulus is ${bits} bits. Nothing above ${MAX_MODULUS_BITS} is an RSA key, and ` +
                "the attacks here are superlinear in its size, so it is refused rather than run.",
                { bits, maximum: MAX_MODULUS_BITS });
        }

        const requested = args.attacks?.length ?
            new Set(args.attacks) :
            new Set(["fermat", "common_factor", "wiener", "small_e"]);
        const attempted = [];
        let factors = null;
        let via = null;

        // Cheapest first, and cheapest by a wide margin: one gcd against a second modulus.
        if (requested.has("common_factor") && args.other_modulus) {
            const other = parseInteger(args.other_modulus, "other_modulus");
            const common = gcd(n, other);
            attempted.push("common_factor");
            if (common > 1n && common < n) {
                factors = { p: common, q: n / common };
                via = "common_factor";
            }
        } else if (requested.has("common_factor")) {
            attempted.push("common_factor (skipped: no other_modulus given)");
        }

        if (!factors && requested.has("wiener")) {
            attempted.push("wiener");
            const found = wiener(e, n);
            if (found && found.p * found.q === n) {
                factors = { p: found.p, q: found.q };
                via = "wiener";
            }
        }

        if (!factors && requested.has("fermat")) {
            attempted.push(`fermat (up to ${args.fermat_iterations} iterations)`);
            const found = await fermat(n, args.fermat_iterations, Date.now() + FERMAT_BUDGET_MS);
            if (found && found.p) {
                factors = found;
                via = "fermat";
            } else if (found) {
                // Cut short by the time budget rather than exhausted. Saying "fermat found
                // nothing" here would be a claim the search never made.
                attempted[attempted.length - 1] =
                    `fermat (stopped at the ${FERMAT_BUDGET_MS / 1000}s limit after ` +
                    `${found.iterations} of ${args.fermat_iterations} iterations — the modulus is ` +
                    "large enough that each iteration is expensive)";
            }
        }

        // Needs no factorisation at all: if m^e never exceeded n, the ciphertext is a plain power.
        let smallE = null;
        if (requested.has("small_e") && args.ciphertext && e <= MAX_SMALL_E) {
            attempted.push("small_e");
            const c = parseInteger(args.ciphertext, "ciphertext");
            const root = integerRoot(c, e);
            if (root ** e === c) smallE = { message: asMessage(root), "message_int": root.toString() };
        } else if (requested.has("small_e") && args.ciphertext) {
            // Skipped rather than attempted, and said so rather than silently omitted: "the
            // small-e attack found nothing" and "the small-e attack was never run" are different
            // answers, and only one of them is true here.
            attempted.push(
                `small_e (skipped: e is larger than ${MAX_SMALL_E}, so m^e always wraps the modulus)`);
        }

        if (!factors) {
            return {
                factored: false,
                attempted,
                ...(smallE ? { "small_e_recovery": smallE } : {}),
                assessment: smallE ?
                    "The modulus resisted factoring, but the ciphertext was recovered without it: " +
                    "the message was short enough that m^e never wrapped the modulus. That is a " +
                    "padding failure rather than a key failure." :
                    "None of these attacks applies. That is NOT proof the key is strong — it rules " +
                    "out four specific generation flaws, and says nothing about the rest.",
                next: args.other_modulus ?
                    "Try a larger fermat_iterations if you suspect the primes are close." :
                    "If you hold other keys from the same source, pass one as other_modulus: devices " +
                    "seeded from a weak entropy pool often share a prime."
            };
        }

        const { p, q } = factors;
        // n = p^2 is a real case here, not a hypothetical: Fermat returns p === q for it in its
        // first iteration, because a = isqrt(n) gives b^2 = 0. phi(p^2) is p(p-1), NOT (p-1)^2,
        // and the difference is not academic -- with the wrong totient the tool reported a
        // private exponent that decrypted 424242 as 368518651580054785. A silently wrong answer
        // from a tool whose entire output is an answer.
        const phi = p === q ? p * (p - 1n) : (p - 1n) * (q - 1n);
        const d = modInverse(e, phi);
        const result = {
            factored: true,
            via,
            attempted,
            p: p.toString(),
            q: q.toString(),
            "private_exponent": d === null ? null : d.toString(),
            ...(d === null ? {
                warning: "e and phi(n) are not coprime, so no private exponent exists for this e. " +
                    "The factors are still correct."
            } : {}),
            assessment: {
                fermat: "The primes are close together — the generator almost certainly picked one " +
                    "prime and searched upward for the next.",
                "common_factor": "This modulus shares a prime with the other one. BOTH keys are " +
                    "broken, and every other key from the same source should be treated as suspect.",
                wiener: "The private exponent is small enough to recover from the public key alone."
            }[via] ?? "Factored."
        };

        if (args.ciphertext && d !== null) {
            const c = parseInteger(args.ciphertext, "ciphertext");
            if (c >= n) {
                Object.assign(result, {
                    "decryption_error":
                        "The ciphertext is not smaller than the modulus, so it is not a valid RSA " +
                        "ciphertext for this key. Check that the two belong together."
                });
            } else {
                const m = modPow(c, d, n);
                Object.assign(result, {
                    plaintext: asMessage(m),
                    "plaintext_int": m.toString(),
                    "padding_note":
                        "Raw RSA output. Real ciphertexts carry padding (PKCS#1 v1.5 or OAEP), so " +
                        "expect a header before the message."
                });
            }
        }
        if (smallE) Object.assign(result, { "small_e_recovery": smallE });
        return result;
    }
};
