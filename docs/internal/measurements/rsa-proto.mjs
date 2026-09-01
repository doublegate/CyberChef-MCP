// Integer square root, floor. Newton on BigInt.
function isqrt(n) {
    if (n < 0n) throw new Error("isqrt of negative");
    if (n < 2n) return n;
    let x = n, y = (x + 1n) / 2n;
    while (y < x) { x = y; y = (x + n / x) / 2n; }
    return x;
}
const isSquare = (n) => { const r = isqrt(n); return r * r === n; };
const gcd = (a, b) => { while (b) { [a, b] = [b, a % b]; } return a; };

/** Fermat: works when p and q are close. Returns [p, q] or null. */
function fermat(n, maxIterations) {
    if (n % 2n === 0n) return [2n, n / 2n];
    let a = isqrt(n);
    if (a * a < n) a += 1n;
    for (let i = 0; i < maxIterations; i++) {
        const b2 = a * a - n;
        if (b2 >= 0n && isSquare(b2)) {
            const b = isqrt(b2);
            const p = a - b, q = a + b;
            if (p > 1n && p * q === n) return [p, q];
        }
        a += 1n;
    }
    return null;
}

/** Integer k-th root, floor. */
function iroot(n, k) {
    if (n < 2n) return n;
    let lo = 1n, hi = 1n;
    while (hi ** BigInt(k) <= n) hi *= 2n;
    while (lo < hi) {
        const mid = (lo + hi + 1n) / 2n;
        if (mid ** BigInt(k) <= n) lo = mid; else hi = mid - 1n;
    }
    return lo;
}

/** Wiener: small private exponent, via convergents of e/n. */
function wiener(e, n) {
    // Continued fraction expansion of e/n.
    const cf = [];
    let a = e, b = n;
    while (b) { cf.push(a / b); [a, b] = [b, a % b]; }
    let num0 = 0n, den0 = 1n, num1 = 1n, den1 = 0n;
    for (const q of cf) {
        const num = q * num1 + num0, den = q * den1 + den0;
        [num0, den0, num1, den1] = [num1, den1, num, den];
        const k = num, d = den;
        if (k === 0n || d === 0n) continue;
        if ((e * d - 1n) % k !== 0n) continue;
        const phi = (e * d - 1n) / k;
        // n - phi + 1 = p + q; solve the quadratic.
        const s = n - phi + 1n;
        const disc = s * s - 4n * n;
        if (disc >= 0n && isSquare(disc)) {
            const r = isqrt(disc);
            if ((s + r) % 2n === 0n) return { d, p: (s - r) / 2n, q: (s + r) / 2n };
        }
    }
    return null;
}

// ---- known-answer tests --------------------------------------------------------------------
const p = 1000000007n, q = 1000000009n;               // adjacent-ish primes -> Fermat
const n = p * q;
const f = fermat(n, 100000);
console.log("MARK fermat:", f && f[0] * f[1] === n && ((f[0] === p && f[1] === q) || (f[0] === q && f[1] === p)) ? "OK" : "FAIL " + f);

const n2 = 1000000007n * 1000000021n;                  // shares p with n
console.log("MARK common factor:", gcd(n, n2) === 1000000007n ? "OK" : "FAIL " + gcd(n, n2));

const m = 42n;                                          // small e, no padding: c = m^3 < n
const c = m ** 3n;
console.log("MARK small-e cube root:", iroot(c, 3) === m ? "OK" : "FAIL " + iroot(c, 3));

// Wiener: construct a key with a deliberately small d.
const wp = 1000003n, wq = 1000033n, wn = wp * wq, wphi = (wp - 1n) * (wq - 1n);
let wd = 3n;
const modinv = (a, mod) => { let [old_r, r] = [a, mod], [old_s, s] = [1n, 0n];
    while (r) { const qq = old_r / r; [old_r, r] = [r, old_r - qq * r]; [old_s, s] = [s, old_s - qq * s]; }
    return ((old_s % mod) + mod) % mod; };
while (gcd(wd, wphi) !== 1n) wd += 2n;
const we = modinv(wd, wphi);
const w = wiener(we, wn);
console.log("MARK wiener:", w && w.d === wd ? "OK (d=" + w.d + ")" : "FAIL " + JSON.stringify(w, (k,v)=>typeof v==='bigint'?v.toString():v));
