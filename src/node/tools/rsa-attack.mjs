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
export const MAX_OPERAND_CHARS = 5000;

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
    let x = 1n << (BigInt(n.toString(16).length * 2) + 1n);
    let y = (x + n / x) / 2n;
    while (y < x) {
        x = y;
        y = (x + n / x) / 2n;
    }
    return x;
}

/**
 * Which residues mod 64 a perfect square can have. Derived rather than transcribed: `i*i % 64`
 * over a full period is the definition, and it cannot drift from it.
 */
const SQUARE_SIEVES = [64, 63, 65, 11].map(m => {
    const table = new Uint8Array(m);
    for (let i = 0; i < m; i++) table[(i * i) % m] = 1;
    return { m, big: BigInt(m), table };
});

/**
 * @returns {boolean} Whether n is a perfect square.
 *
 * FOUR sieves, not one. `isqrt` is the whole cost of a Fermat iteration -- measured at 650 us on a
 * 2048-bit operand -- so everything here exists to avoid reaching it.
 *
 * mod 64 alone leaves 18.7% of candidates, and each survivor pays that 650 us. Adding 63, 65 and
 * 11 -- pairwise coprime to 64 and to each other, so their rejections compound -- leaves **0.84%**,
 * measured over 200,000 consecutive non-squares. That is a 22x cut in isqrt calls for four cheap
 * modulo operations, and it turns the loop from ~1,500 iterations/second into ~840,000.
 *
 * Every table is computed exhaustively at load rather than written out, because a hand-listed one
 * is how this becomes a silent correctness bug: a review of the mod-64 line once suggested
 * [0,1,4,9,16,17,25,36,33,49], which omits 41 and 57 and would therefore reject genuine perfect
 * squares -- Fermat would quietly fail to factor a subset of moduli. A sieve that rejects a real
 * square is undetectable from the outside; it just looks like the attack not applying.
 */
const isPerfectSquare = (n) => {
    /* v8 ignore next -- same invariant as isqrt: callers test the discriminant's sign first. */
    if (n < 0n) return false;
    for (const { big, table } of SQUARE_SIEVES) {
        if (!table[Number(n % big)]) return false;
    }
    const r = isqrt(n);
    return r * r === n;
};

/** @returns {bigint} The greatest common divisor. */
export const gcd = (a, b) => {
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
export function modInverse(a, mod) {
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
export function modPow(base, exp, m) {
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
export function integerRoot(n, k) {
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
 * Miller-Rabin, with random bases.
 *
 * Needed only to decide whether a recovered factor is prime, which is a different question from
 * the one every attack here answers: the attacks self-certify with `p * q === n`, and that says
 * nothing about whether q is a prime or a product of two more.
 *
 * Random bases rather than a fixed list, and 24 rounds rather than the 2 to 4 FIPS 186-5 permits
 * for a candidate you generated yourself. FIPS is explicit that a number HANDED to you is a
 * different regime -- App. C.1 gives `p_{k,t} <= 4^-t` there -- and an adversary can construct a
 * composite that passes any fixed base set (Albrecht et al., eprint 2018/749). Every input to this
 * tool is attacker-supplied by definition.
 *
 * @param {bigint} n - The candidate.
 * @returns {boolean} Whether n is probably prime.
 */
function isProbablePrime(n) {
    if (n < 2n) return false;
    for (const small of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
        if (n === small) return true;
        if (n % small === 0n) return false;
    }
    let d = n - 1n;
    let r = 0n;
    while ((d & 1n) === 0n) {
        d >>= 1n;
        r++;
    }
    const bits = n.toString(2).length;
    for (let round = 0; round < 24; round++) {
        // A base in [2, n-2], drawn from the same width as n so it is not biased toward small
        // values -- a small fixed base is exactly what a constructed pseudoprime defeats.
        let a = 0n;
        for (let i = 0; i < bits; i += 32) a = (a << 32n) | BigInt(Math.floor(Math.random() * 4294967296));
        a = 2n + (a % (n - 3n));
        let x = modPow(a, d, n);
        if (x === 1n || x === n - 1n) continue;
        let composite = true;
        for (let i = 1n; i < r; i++) {
            x = (x * x) % n;
            if (x === n - 1n) {
                composite = false;
                break;
            }
        }
        if (composite) return false;
    }
    return true;
}

/**
 * Fermat factorisation: fast when p and q are close, useless otherwise.
 *
 * @param {bigint} n - The modulus.
 * @param {number} maxIterations - Bound on the search.
 * @returns {{p: bigint, q: bigint}|null} The factors, or null.
 */
async function fermat(n, maxIterations, deadline) {
    // n === 2 (mod 4) is not a difference of two squares and RsaCtfTool rejects it up front. Not
    // repeated here: n === 2 (mod 4) means n is even, so the line above has already returned. A
    // guard that cannot fire reads like a case being handled and is one more thing to keep true.
    if (n % 2n === 0n) return { p: 2n, q: n / 2n };
    let a = isqrt(n);
    if (a * a < n) a += 1n;
    // Incremental, not recomputed. b2 for a+1 is b2 + (2a+1), so the loop carries the difference
    // instead of squaring a fresh `a` every iteration -- one addition in place of a multiplication
    // over a number that may be 16,384 bits. `a` itself is no longer tracked inside the loop; it
    // is recovered from `c` at the end, since c = 2a + 1 throughout.
    let b2 = a * a - n;
    let c = 2n * a + 1n;
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
        if (isPerfectSquare(b2)) {
            const b = isqrt(b2);
            const mid = (c - 1n) / 2n;
            const p = mid - b;
            const q = mid + b;
            if (p > 1n && p * q === n) return { p, q };
        }
        b2 += c;
        c += 2n;
    }
    return null;
}

/** How long the Fermat search may run before it gives up, in milliseconds. */
const FERMAT_BUDGET_MS = 10000;

/** The same, for the convergent walk. Measured worst case is ~1.5s, so this is a wide backstop. */
const WIENER_BUDGET_MS = 5000;

/** Budgets for the two search-based factorisations added in v3.3.0. */
const RHO_BUDGET_MS = 10000;
const PM1_BUDGET_MS = 10000;

/**
 * Primes below 100,000, sieved once at load.
 *
 * Used by trial division and as the exponent ladder for Pollard's p-1. 9,592 primes; the sieve
 * costs under a millisecond and the array is ~40 KB, which is cheaper than recomputing it inside
 * either attack.
 *
 * @type {number[]}
 */
const SMALL_PRIMES = (() => {
    const limit = 100000;
    const composite = new Uint8Array(limit + 1);
    const out = [];
    for (let i = 2; i <= limit; i++) {
        if (composite[i]) continue;
        out.push(i);
        for (let j = i * i; j <= limit; j += i) composite[j] = 1;
    }
    return out;
})();

/**
 * Trial division by small primes, in BLOCKS.
 *
 * The obvious loop is `n % p` for each prime, which is 9,592 full-width modulo operations on a
 * number that may be 16,384 bits. Multiplying the primes into blocks about as wide as the modulus
 * and taking ONE gcd per block replaces most of that with a single gcd over operands of similar
 * size, which is where BigInt is fast.
 *
 * A hit tells you the block contains a factor, not which one, so the block is then re-walked
 * prime by prime -- paid once, only when there is something to find.
 *
 * @param {bigint} n - The modulus.
 * @returns {{p: bigint, q: bigint}|null} The factors, or null if no small prime divides n.
 */
function smallFactors(n) {
    const width = BigInt(n.toString(16).length * 4);
    let block = 1n;
    let members = [];
    const flush = () => {
        if (!members.length) return null;
        const g = gcd(block, n);
        block = 1n;
        const walked = members;
        members = [];
        if (g === 1n) return null;
        for (const prime of walked) {
            const big = BigInt(prime);
            // `n / big > 1n` matters: when n IS one of these small primes, `n % big === 0n` holds
            // and the "factorisation" is n x 1. The handler then computed phi = (p-1)(q-1) with
            // q = 1, so phi = 0, and `modInverse(e, 0n)` threw `RangeError: Division by zero` --
            // a crash from `modulus: "97"`, which the schema accepts because it is at least 4.
            if (n % big === 0n && n / big > 1n) return { p: big, q: n / big };
        }
        /* v8 ignore next -- unreachable: a non-trivial gcd with the block means one of the block's
           primes divides n, and the walk above finds it. Kept so a future change to how blocks are
           built cannot turn a silent wrong answer into the failure mode. */
        return null;
    };
    for (const prime of SMALL_PRIMES) {
        block *= BigInt(prime);
        members.push(prime);
        if (BigInt(block.toString(16).length * 4) < width) continue;
        const found = flush();
        if (found) return found;
    }
    return flush();
}

/**
 * Pollard's rho, Brent's variant, with batched gcds.
 *
 * Finds a factor in expected O(n^(1/4)) time, which in BigInt reaches factors of roughly 60-70
 * bits -- so it covers keys whose smaller prime is far too short, a class Fermat (primes too
 * CLOSE) and p-1 (primes too SMOOTH) both miss.
 *
 * The batching is what makes it usable. A gcd per step would dominate; instead the differences are
 * multiplied together mod n over a run of 128 and one gcd is taken. When that gcd comes back as n
 * itself the batch swallowed every factor at once, so the run is replayed step by step -- paid
 * only in the rare case that needs it.
 *
 * @param {bigint} n - The modulus.
 * @param {number} deadline - Absolute time in ms after which to give up.
 * @returns {Promise<{p: bigint, q: bigint}|null>} The factors, or null.
 */
async function pollardRho(n, deadline) {
    if (n % 2n === 0n) return { p: 2n, q: n / 2n };
    const batch = 128n;
    // RsaCtfTool sets this batch size to a random value, which defeats the batching entirely --
    // `min(m, r - k)` then always resolves to `r - k`. The constant is the point.
    for (let attempt = 0n; attempt < 8n; attempt++) {
        const c = 1n + attempt;
        let y = 2n + attempt;
        let r = 1n;
        let q = 1n;
        let g = 1n;
        let x = y;
        let ys = y;
        const f = (v) => (v * v + c) % n;
        while (g === 1n) {
            x = y;
            for (let i = 0n; i < r; i++) y = f(y);
            let k = 0n;
            while (k < r && g === 1n) {
                ys = y;
                const span = batch < r - k ? batch : r - k;
                for (let i = 0n; i < span; i++) {
                    y = f(y);
                    const diff = x > y ? x - y : y - x;
                    q = (q * diff) % n;
                }
                g = gcd(q, n);
                k += span;
                if (Date.now() > deadline) return null;
                await new Promise(resolve => setImmediate(resolve));
            }
            r *= 2n;
        }
        if (g === n) {
            // The batch multiplied every factor in at once. Replay it one step at a time; the
            // first non-trivial gcd is the answer.
            g = 1n;
            let step = ys;
            let sinceYield = 0;
            while (g === 1n) {
                step = f(step);
                const diff = x > step ? x - step : step - x;
                g = gcd(diff, n);
                if (Date.now() > deadline) return null;
                // Yields, like the batch loop above and the Fermat loop. Without one this spun
                // synchronously for whatever remained of the 10-second budget, and the reason
                // matters more than the duration: an uninterruptible block prevents the
                // surrounding timeout from firing at all, so the bound stops being a bound.
                if (++sinceYield >= 4096) {
                    sinceYield = 0;
                    await new Promise(resolve => setImmediate(resolve));
                }
            }
        }
        if (g > 1n && g < n) return { p: g, q: n / g };
        // g === n again: this polynomial found nothing usable. A different c is a different
        // sequence, which is the whole reason the constant is a parameter.
    }
    return null;
}

/**
 * Pollard's p-1: factors n when p-1 is composed only of small primes.
 *
 * The flaw it detects is a prime chosen without checking that p-1 has a large factor. Stage 1
 * raises a base through every prime power below the bound; if p-1 divides that product then
 * a^(p-1) === 1 (mod p) by Fermat, so gcd(a - 1, n) exposes p.
 *
 * Two details that decide whether it works at all:
 *
 *   - gcd every ~100 primes rather than every prime. RsaCtfTool takes one per exponentiation,
 *     which costs more than the exponentiation.
 *   - stage 1 runs ONCE per base, at the bound the caller asked for. A bound-escalation variant
 *     exists -- on gcd === 1, raise the bound and continue from the CURRENT base rather than
 *     restarting, since restarting repeats every exponentiation already done -- and this does not
 *     implement it: `bound` is a fixed argument, and a base that fails moves to the next one with
 *     `a` reset. Stated plainly, because the comment previously described the behaviour it was
 *     recommending rather than the behaviour below it.
 *
 * @param {bigint} n - The modulus.
 * @param {number} bound - Stage-1 smoothness bound.
 * @param {number} deadline - Absolute time in ms after which to give up.
 * @returns {Promise<{p: bigint, q: bigint}|null>} The factors, or null.
 */
async function pollardPMinus1(n, bound, deadline) {
    if (n % 2n === 0n) return { p: 2n, q: n / 2n };
    for (const base of [2n, 3n, 5n, 7n]) {
        let a = base;
        let sinceGcd = 0;
        const logBound = Math.log(bound);
        for (const prime of SMALL_PRIMES) {
            if (prime > bound) break;
            const power = BigInt(prime) ** BigInt(Math.max(1, Math.floor(logBound / Math.log(prime))));
            a = modPow(a, power, n);
            if (++sinceGcd < 100) continue;
            sinceGcd = 0;
            if (Date.now() > deadline) return null;
            await new Promise(resolve => setImmediate(resolve));
            const g = gcd(a - 1n, n);
            if (g === n) break;
            if (g > 1n) return { p: g, q: n / g };
        }
        const g = gcd(a - 1n, n);
        if (g > 1n && g < n) return { p: g, q: n / g };
        // g === n means this base swallowed every factor; a different base is a different
        // subgroup. g === 1 means p-1 is not smooth enough for this bound, and another base
        // will not change that -- but the loop is four bases, so the cost of being wrong is small.
    }
    return null;
}

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
async function wiener(e, n, deadline) {
    const terms = [];
    let a = e;
    let b = n;
    while (b) {
        terms.push(a / b);
        [a, b] = [b, a % b];
    }
    let [num0, den0, num1, den1] = [0n, 1n, 1n, 0n];
    let step = 0;
    for (const term of terms) {
        // Same treatment as the Fermat loop, and for the same reason. This was measured at 2 ms
        // and dismissed -- with e = 65537, where e/n is tiny and the continued fraction terminates
        // almost at once. That is not the case Wiener exists for. Against a Fibonacci pair, which
        // is the worst case for Euclidean chain length, the same modulus size costs 1,522 ms of
        // uninterruptible synchronous work.
        if ((step++ & 0x3f) === 0x3f) {
            if (Date.now() > deadline) return null;
            await new Promise(resolve => setImmediate(resolve));
        }
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
 * Strip the separators an integer may be written with, before parsing or measuring it.
 *
 * Exported because a CALLER that measures the input's width must measure the same string
 * `parseInteger` reads. `ecdsa_recover` derives a hash's bit width from its length, and computing
 * that from the raw text while parsing the cleaned text over-reports the width of any hash written
 * with separators -- which truncates a digest that needed no truncation and silently recovers the
 * wrong key. One rule, used by both, so they cannot disagree.
 *
 * @param {string} value - The text.
 * @returns {string} The text with whitespace, underscores and colons removed.
 */
export function cleanIntegerText(value) {
    return String(value).trim().replace(/[\s_:]/g, "");
}

/**
 * Parse an integer from decimal, 0x-prefixed hex, or bare hex.
 *
 * @param {string} value - The text.
 * @param {string} label - Field name, for the error message.
 * @returns {bigint} The value.
 */
export function parseInteger(value, label) {
    const cleaned = cleanIntegerText(value);
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
export function asMessage(m) {
    let hex = m.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    const bytes = hex.match(/../g)?.map(h => parseInt(h, 16)) ?? [];
    const printable = bytes.length > 0 && bytes.every(b => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127));
    // Buffer rather than String.fromCharCode(...bytes): the spread passes one argument per byte,
    // which throws "Maximum call stack size exceeded" past tens of thousands. The operand bounds
    // keep this well short of that today, so this is removing a constraint rather than fixing a
    // bug -- but the constraint is invisible at the call site, which is how it would be tripped.
    return printable ? Buffer.from(bytes).toString("latin1") : `0x${hex}`;
}

export default {
    name: "rsa_attack",
    title: "RSA key attack",
    category: "Analysis",
    description:
        "Test an RSA public key for the generation flaws that make it breakable, and recover the " +
        "private key when one applies: trial division, Fermat (primes too close), shared factors " +
        "between two moduli, Wiener (private exponent too small), Pollard's rho (one prime too " +
        "short), Pollard's p-1 (a prime whose predecessor is smooth) and unpadded small-e. None " +
        "threatens a correctly generated key — a sound 2048-bit modulus defeats all of them — so " +
        "a negative result is evidence the key is not weak in these specific ways, and not that " +
        "it is strong. Decrypts a supplied ciphertext when the key is recovered.",
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
        // `.max()` is not decoration: without it a caller can send a million-element array of
        // enum values, and every one is parsed before the handler ever runs. The bound is the
        // number of attacks there are, since asking for one twice is not asking for more.
        attacks: z.array(z.enum([
            "fermat", "common_factor", "wiener", "small_e",
            "small_factors", "pollard_rho", "pollard_pm1"
        ])).max(7).optional()
            .describe(
                "Which attacks to try. All of them by default, which costs up to 35 seconds of " +
                "wall clock on a key none of them breaks — the four time-budgeted searches run " +
                "sequentially, and a soundly generated modulus is exactly the case that reaches " +
                "all four. Name the ones you want if your client has a shorter per-call timeout. " +
                "`small_factors` is trial division and costs nothing; `pollard_rho` finds a short " +
                "prime; `pollard_pm1` finds a prime whose predecessor is smooth."),
        "pm1_bound": z.number().int().min(100).max(100000).default(50000)
            .describe(
                "Smoothness bound for pollard_pm1. Higher finds primes whose p-1 has a larger " +
                "factor, and takes proportionally longer."),
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
            new Set([
                "small_factors", "common_factor", "wiener", "fermat",
                "pollard_rho", "pollard_pm1", "small_e"
            ]);
        const attempted = [];
        let factors = null;
        let via = null;

        // Cheapest of all: does a prime under 100,000 divide it? A few gcds over blocks of
        // primes, and it costs nothing to try before anything that searches.
        if (requested.has("small_factors")) {
            attempted.push("small_factors");
            const found = smallFactors(n);
            if (found) {
                factors = found;
                via = "small_factors";
            }
        }

        // Cheapest first, and cheapest by a wide margin: one gcd against a second modulus.
        if (!factors && requested.has("common_factor") && args.other_modulus) {
            const other = parseInteger(args.other_modulus, "other_modulus");
            const common = gcd(n, other);
            attempted.push("common_factor");
            if (common > 1n && common < n) {
                factors = { p: common, q: n / common };
                via = "common_factor";
            }
        } else if (!factors && requested.has("common_factor")) {
            attempted.push("common_factor (skipped: no other_modulus given)");
        }

        if (!factors && requested.has("wiener")) {
            attempted.push("wiener");
            const found = await wiener(e, n, Date.now() + WIENER_BUDGET_MS);
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

        // Both searches, and the order is deliberate: p-1 is cheap when it applies and useless
        // when it does not, while rho pays regardless. Neither threatens a well-generated key --
        // rho reaches ~70-bit factors and p-1 needs a prime whose predecessor is smooth.
        if (!factors && requested.has("pollard_pm1")) {
            attempted.push(`pollard_pm1 (bound ${args.pm1_bound})`);
            const found = await pollardPMinus1(n, args.pm1_bound, Date.now() + PM1_BUDGET_MS);
            if (found) {
                factors = found;
                via = "pollard_pm1";
            }
        }

        if (!factors && requested.has("pollard_rho")) {
            attempted.push("pollard_rho");
            const found = await pollardRho(n, Date.now() + RHO_BUDGET_MS);
            if (found) {
                factors = found;
                via = "pollard_rho";
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
                    "out specific generation flaws (primes too close, too short, shared, with a " +
                    "smooth predecessor, or a private exponent too small) and says nothing about " +
                    "the rest.",
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
        // Both factors must be PRIME before phi means anything. `small_factors` returns the first
        // small prime and the cofactor, and the cofactor need not be prime: n = 105 gives p = 3 and
        // q = 35, phi computes as 2 x 34 = 68 against the true totient of 48, and `modInverse`
        // succeeds -- so the tool returned a real-looking private exponent that decrypts nothing,
        // and a `plaintext` field derived from it. A silently wrong answer from a tool whose entire
        // output is an answer, which is the same defect the p === q note below records.
        const primes = isProbablePrime(p) && isProbablePrime(q);
        const phi = p === q ? p * (p - 1n) : (p - 1n) * (q - 1n);
        const d = primes ? modInverse(e, phi) : null;
        const result = {
            factored: true,
            via,
            attempted,
            p: p.toString(),
            q: q.toString(),
            "private_exponent": d === null ? null : d.toString(),
            ...(d !== null ? {} : primes ? {
                warning: "e and phi(n) are not coprime, so no private exponent exists for this e. " +
                    "The factors are still correct."
            } : {
                warning: `This is a PARTIAL factorisation: ${isProbablePrime(p) ? "q" : "p"} is ` +
                    "composite, so n has more than two prime factors and phi(n) is not " +
                    "(p-1)(q-1). No private exponent is derived, because one computed from the " +
                    "wrong totient decrypts nothing while looking entirely healthy. Factor the " +
                    "composite side and try again.",
                "fully_factored": false
            }),
            assessment: {
                fermat: "The primes are close together — the generator almost certainly picked one " +
                    "prime and searched upward for the next.",
                "common_factor": "This modulus shares a prime with the other one. BOTH keys are " +
                    "broken, and every other key from the same source should be treated as suspect.",
                wiener: "The private exponent is small enough to recover from the public key alone.",
                "small_factors": "A prime below 100,000 divides this modulus. It is not an RSA key " +
                    "in any meaningful sense — one of the two 'primes' is tiny.",
                "pollard_rho": "One prime is short enough to find by random walk — on the order of " +
                    "70 bits against the 1024 a 2048-bit key needs. The key generator did not use " +
                    "primes of the size it claims.",
                "pollard_pm1": "One prime p has a smooth p-1: it is a product of small factors " +
                    "only. Prime generation checked primality and not this, which is the flaw " +
                    "safe-prime generation exists to avoid."
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
