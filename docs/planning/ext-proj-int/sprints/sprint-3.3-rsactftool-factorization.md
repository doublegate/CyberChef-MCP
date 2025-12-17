# Sprint 3.3: RsaCtfTool Factorization

## Sprint Overview

| Field | Value |
|-------|-------|
| Sprint | 3.3 |
| Phase | 3 - Algorithm Ports |
| Duration | 2 weeks |
| Start | Week 15 |
| End | Week 16 |

## Objectives

1. Port RSA factorization algorithms from RsaCtfTool
2. Implement mathematical attack utilities
3. Create unified RSA analysis tool
4. Handle large number operations with BigInt

## User Stories

### US-3.3.1: Fermat Factorization

**As a** CTF player
**I want** Fermat's factorization method
**So that** I can factor RSA moduli with close primes

**Acceptance Criteria:**
- [ ] Factor when p and q are close
- [ ] Configurable iteration limit
- [ ] Return factors or null
- [ ] Performance: <1s for close primes

### US-3.3.2: Wiener's Attack

**As a** CTF player
**I want** Wiener's attack on small d
**So that** I can recover RSA private keys with small exponents

**Acceptance Criteria:**
- [ ] Continued fraction expansion
- [ ] Convergent testing
- [ ] Return d, p, q if vulnerable
- [ ] Handle edge cases

### US-3.3.3: Pollard's Rho

**As a** CTF player
**I want** Pollard's rho factorization
**So that** I can factor moduli with small factors

**Acceptance Criteria:**
- [ ] Floyd's cycle detection
- [ ] Multiple polynomial options
- [ ] Configurable iterations
- [ ] Return factor if found

### US-3.3.4: RSA Analysis Tool

**As a** analyst
**I want** comprehensive RSA vulnerability analysis
**So that** I can assess RSA key security

**Acceptance Criteria:**
- [ ] Try multiple attacks automatically
- [ ] Report vulnerabilities found
- [ ] Decrypt ciphertext if possible
- [ ] Export recovered key material

## Tasks

### BigInt Math Library (Day 1-2)

| ID | Task | Estimate | Assignee |
|----|------|----------|----------|
| T-3.3.1 | Implement gcd, modInverse | 2h | - |
| T-3.3.2 | Implement modPow | 2h | - |
| T-3.3.3 | Implement isqrt, iroot | 3h | - |
| T-3.3.4 | Implement isProbablePrime | 3h | - |

### Factorization Algorithms (Day 3-7)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-3.3.5 | Implement Fermat factorization | 4h | T-3.3.3 |
| T-3.3.6 | Implement Wiener's attack | 6h | T-3.3.1-2 |
| T-3.3.7 | Implement Pollard's rho | 4h | T-3.3.1 |
| T-3.3.8 | Implement small e attack | 3h | T-3.3.3 |
| T-3.3.9 | Implement common factor attack | 2h | T-3.3.1 |

### RSA Utilities (Day 8-9)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-3.3.10 | Implement key generation test | 3h | T-3.3.4 |
| T-3.3.11 | Implement RSA decrypt | 3h | T-3.3.2 |
| T-3.3.12 | Create RsaAnalyzer class | 4h | T-3.3.5-9 |

### Integration (Day 10)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-3.3.13 | Register MCP tools | 3h | All |
| T-3.3.14 | Write tests with RsaCtfTool vectors | 6h | T-3.3.13 |
| T-3.3.15 | Documentation | 2h | All |

## Deliverables

### Files to Create

```
src/node/tools/
├── rsa-attacks/
│   ├── index.mjs           # Module exports
│   ├── math.mjs            # BigInt math utilities
│   ├── factorization/
│   │   ├── fermat.mjs      # Fermat's method
│   │   ├── wiener.mjs      # Wiener's attack
│   │   ├── pollard-rho.mjs # Pollard's rho
│   │   ├── small-e.mjs     # Small exponent
│   │   └── common.mjs      # Common factor
│   ├── analyzer.mjs        # Combined analysis
│   └── register.mjs        # Tool registration
```

### Code Specifications

#### BigInt Math (math.mjs)

```javascript
/**
 * BigInt mathematical utilities for RSA cryptanalysis
 */

/**
 * Greatest Common Divisor
 */
export function gcd(a, b) {
    a = BigInt(a);
    b = BigInt(b);

    while (b !== 0n) {
        [a, b] = [b, a % b];
    }

    return a < 0n ? -a : a;
}

/**
 * Extended GCD - returns { gcd, x, y } where ax + by = gcd
 */
export function extendedGcd(a, b) {
    a = BigInt(a);
    b = BigInt(b);

    let [oldR, r] = [a, b];
    let [oldS, s] = [1n, 0n];
    let [oldT, t] = [0n, 1n];

    while (r !== 0n) {
        const q = oldR / r;
        [oldR, r] = [r, oldR - q * r];
        [oldS, s] = [s, oldS - q * s];
        [oldT, t] = [t, oldT - q * t];
    }

    return { gcd: oldR, x: oldS, y: oldT };
}

/**
 * Modular multiplicative inverse
 */
export function modInverse(a, m) {
    a = BigInt(a);
    m = BigInt(m);

    const { gcd: g, x } = extendedGcd(a, m);

    if (g !== 1n) {
        throw new Error('Modular inverse does not exist');
    }

    return ((x % m) + m) % m;
}

/**
 * Modular exponentiation (square-and-multiply)
 */
export function modPow(base, exp, mod) {
    base = BigInt(base);
    exp = BigInt(exp);
    mod = BigInt(mod);

    if (mod === 1n) return 0n;

    let result = 1n;
    base = ((base % mod) + mod) % mod;

    while (exp > 0n) {
        if (exp & 1n) {
            result = (result * base) % mod;
        }
        exp >>= 1n;
        base = (base * base) % mod;
    }

    return result;
}

/**
 * Integer square root (Newton's method)
 */
export function isqrt(n) {
    n = BigInt(n);

    if (n < 0n) throw new Error('Square root of negative number');
    if (n < 2n) return n;

    let x = n;
    let y = (x + 1n) >> 1n;

    while (y < x) {
        x = y;
        y = (x + n / x) >> 1n;
    }

    return x;
}

/**
 * Integer nth root
 */
export function iroot(n, k) {
    n = BigInt(n);
    k = BigInt(k);

    if (k === 1n) return n;
    if (k === 2n) return isqrt(n);

    let lo = 1n;
    let hi = n;

    while (lo < hi) {
        const mid = (lo + hi + 1n) >> 1n;
        if (mid ** k <= n) {
            lo = mid;
        } else {
            hi = mid - 1n;
        }
    }

    return lo;
}

/**
 * Miller-Rabin primality test
 */
export function isProbablePrime(n, rounds = 20) {
    n = BigInt(n);

    if (n < 2n) return false;
    if (n === 2n || n === 3n) return true;
    if (n % 2n === 0n) return false;

    // Write n-1 as 2^r * d
    let r = 0n;
    let d = n - 1n;
    while (d % 2n === 0n) {
        r++;
        d >>= 1n;
    }

    // Witnesses for deterministic test up to certain bounds
    const witnesses = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

    witnessLoop:
    for (let i = 0; i < Math.min(rounds, witnesses.length); i++) {
        const a = witnesses[i];
        if (a >= n) continue;

        let x = modPow(a, d, n);

        if (x === 1n || x === n - 1n) continue;

        for (let j = 0n; j < r - 1n; j++) {
            x = (x * x) % n;
            if (x === n - 1n) continue witnessLoop;
        }

        return false;
    }

    return true;
}
```

#### Fermat Factorization (factorization/fermat.mjs)

```javascript
/**
 * Fermat's factorization method
 * Works when p and q are close
 */

import { isqrt } from '../math.mjs';

export function fermatFactor(n, maxIterations = 1000000) {
    n = BigInt(n);

    // Check if n is even
    if (n % 2n === 0n) {
        return [2n, n / 2n];
    }

    // Start with a = ceil(sqrt(n))
    let a = isqrt(n);
    if (a * a === n) {
        return [a, a];  // Perfect square
    }
    a = a + 1n;

    for (let i = 0; i < maxIterations; i++) {
        const b2 = a * a - n;
        const b = isqrt(b2);

        if (b * b === b2) {
            const p = a - b;
            const q = a + b;

            if (p > 1n && q > 1n && p * q === n) {
                return p < q ? [p, q] : [q, p];
            }
        }

        a++;
    }

    return null;  // Failed to factor
}
```

#### Wiener's Attack (factorization/wiener.mjs)

```javascript
/**
 * Wiener's attack on RSA with small private exponent
 * Exploits continued fraction expansion of e/n
 */

import { isqrt, modPow, gcd } from '../math.mjs';

export function wienerAttack(n, e) {
    n = BigInt(n);
    e = BigInt(e);

    // Generate continued fraction convergents of e/n
    for (const [k, d] of convergents(e, n)) {
        if (k === 0n) continue;

        // Check if d is the private exponent
        // phi(n) = (ed - 1) / k
        if ((e * d - 1n) % k !== 0n) continue;

        const phi = (e * d - 1n) / k;

        // n = pq and phi = (p-1)(q-1) = n - p - q + 1
        // So p + q = n - phi + 1
        const s = n - phi + 1n;

        // p and q are roots of x^2 - sx + n = 0
        const discriminant = s * s - 4n * n;

        if (discriminant < 0n) continue;

        const sqrtDisc = isqrt(discriminant);
        if (sqrtDisc * sqrtDisc !== discriminant) continue;

        const p = (s + sqrtDisc) / 2n;
        const q = (s - sqrtDisc) / 2n;

        if (p * q === n) {
            return {
                d,
                p: p < q ? p : q,
                q: p < q ? q : p,
                phi
            };
        }
    }

    return null;  // Not vulnerable
}

/**
 * Generate continued fraction convergents
 */
function* convergents(num, den) {
    let [n0, n1] = [1n, 0n];
    let [d0, d1] = [0n, 1n];

    while (den !== 0n) {
        const q = num / den;
        [num, den] = [den, num - q * den];

        const n2 = q * n0 + n1;
        const d2 = q * d0 + d1;

        yield [n2, d2];

        [n1, n0] = [n0, n2];
        [d1, d0] = [d0, d2];
    }
}
```

#### Pollard's Rho (factorization/pollard-rho.mjs)

```javascript
/**
 * Pollard's rho factorization
 * Good for finding small factors
 */

import { gcd } from '../math.mjs';

export function pollardRho(n, maxIterations = 1000000, c = 1n) {
    n = BigInt(n);
    c = BigInt(c);

    if (n % 2n === 0n) return 2n;

    let x = 2n;
    let y = 2n;
    let d = 1n;

    const f = (x) => (x * x + c) % n;

    let iterations = 0;

    while (d === 1n && iterations < maxIterations) {
        x = f(x);
        y = f(f(y));

        const diff = x > y ? x - y : y - x;
        d = gcd(diff, n);

        iterations++;
    }

    if (d !== n && d !== 1n) {
        return d;
    }

    return null;  // Try different c
}

/**
 * Pollard's rho with Brent's improvement
 */
export function pollardRhoBrent(n, maxIterations = 1000000) {
    n = BigInt(n);

    if (n % 2n === 0n) return 2n;

    let y = 2n;
    let c = 1n;
    let m = 10n;
    let g = 1n;
    let r = 1n;
    let q = 1n;

    let iterations = 0;
    let x, ys;

    while (g === 1n && iterations < maxIterations) {
        x = y;

        for (let i = 0n; i < r; i++) {
            y = (y * y + c) % n;
        }

        let k = 0n;

        while (k < r && g === 1n) {
            ys = y;

            for (let i = 0n; i < (m < r - k ? m : r - k); i++) {
                y = (y * y + c) % n;
                const diff = x > y ? x - y : y - x;
                q = (q * diff) % n;
            }

            g = gcd(q, n);
            k += m;
        }

        r *= 2n;
        iterations++;
    }

    if (g === n) {
        do {
            ys = (ys * ys + c) % n;
            const diff = x > ys ? x - ys : ys - x;
            g = gcd(diff, n);
        } while (g === 1n);
    }

    return g !== n ? g : null;
}
```

#### RSA Analyzer (analyzer.mjs)

```javascript
/**
 * Combined RSA vulnerability analysis
 */

import { fermatFactor } from './factorization/fermat.mjs';
import { wienerAttack } from './factorization/wiener.mjs';
import { pollardRho, pollardRhoBrent } from './factorization/pollard-rho.mjs';
import { smallEAttack } from './factorization/small-e.mjs';
import { modInverse, modPow, gcd } from './math.mjs';

export class RsaAnalyzer {
    constructor(options = {}) {
        this.timeout = options.timeout || 30000;
    }

    /**
     * Analyze RSA parameters for vulnerabilities
     */
    async analyze(params) {
        const { n, e, c } = params;
        const nBig = BigInt(n);
        const eBig = BigInt(e);

        const results = {
            vulnerabilities: [],
            factors: null,
            privateKey: null,
            plaintext: null
        };

        const startTime = Date.now();

        // Try each attack
        const attacks = [
            { name: 'wiener', fn: () => wienerAttack(nBig, eBig) },
            { name: 'fermat', fn: () => fermatFactor(nBig, 100000) },
            { name: 'pollard_rho', fn: () => pollardRhoBrent(nBig, 100000) },
            { name: 'small_e', fn: () => c ? smallEAttack(nBig, eBig, BigInt(c)) : null },
        ];

        for (const attack of attacks) {
            if (Date.now() - startTime > this.timeout) {
                results.timeout = true;
                break;
            }

            try {
                const result = await Promise.race([
                    Promise.resolve(attack.fn()),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), 10000)
                    )
                ]);

                if (result) {
                    results.vulnerabilities.push({
                        attack: attack.name,
                        result
                    });

                    // Extract factors
                    if (result.p && result.q) {
                        results.factors = { p: result.p.toString(), q: result.q.toString() };
                    } else if (Array.isArray(result)) {
                        results.factors = { p: result[0].toString(), q: result[1].toString() };
                    } else if (typeof result === 'bigint') {
                        const p = result;
                        const q = nBig / p;
                        results.factors = { p: p.toString(), q: q.toString() };
                    }

                    // Calculate private key if we have factors
                    if (results.factors && !results.privateKey) {
                        const p = BigInt(results.factors.p);
                        const q = BigInt(results.factors.q);
                        const phi = (p - 1n) * (q - 1n);
                        const d = modInverse(eBig, phi);
                        results.privateKey = {
                            d: d.toString(),
                            phi: phi.toString()
                        };
                    }

                    // Decrypt if ciphertext provided
                    if (results.privateKey && c && !results.plaintext) {
                        const d = BigInt(results.privateKey.d);
                        const m = modPow(BigInt(c), d, nBig);
                        results.plaintext = {
                            decimal: m.toString(),
                            hex: m.toString(16),
                            ascii: this.bigintToAscii(m)
                        };
                    }

                    break;  // Stop on first success
                }
            } catch (error) {
                // Attack failed, continue
            }
        }

        results.elapsed = Date.now() - startTime;
        return results;
    }

    bigintToAscii(n) {
        const hex = n.toString(16);
        const padded = hex.length % 2 ? '0' + hex : hex;
        let ascii = '';

        for (let i = 0; i < padded.length; i += 2) {
            const byte = parseInt(padded.slice(i, i + 2), 16);
            if (byte >= 32 && byte < 127) {
                ascii += String.fromCharCode(byte);
            } else {
                ascii += '.';
            }
        }

        return ascii;
    }
}
```

### MCP Tools Registered

| Tool Name | Description |
|-----------|-------------|
| `cyberchef_rsa_fermat` | Fermat's factorization |
| `cyberchef_rsa_wiener` | Wiener's attack |
| `cyberchef_rsa_pollard_rho` | Pollard's rho factorization |
| `cyberchef_rsa_analyze` | Combined RSA analysis |
| `cyberchef_rsa_decrypt` | Decrypt with recovered key |

## Definition of Done

- [ ] All factorization algorithms working
- [ ] BigInt math library complete
- [ ] Reference tests against RsaCtfTool
- [ ] Unit tests with > 85% coverage
- [ ] Performance: Fermat <1s for close primes
- [ ] Documentation complete

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| BigInt performance | High | Medium | Optimization, iteration limits |
| Algorithm edge cases | Medium | Medium | Extensive test vectors |
| Timeout on hard keys | Low | High | Clear failure messaging |

## Dependencies

### External

- None (pure JavaScript BigInt)

### Internal

- Sprint 1.1 (ToolRegistry)

## Notes

- RsaCtfTool has 60+ attacks; focusing on most useful CTF attacks
- More advanced attacks (ECM, GNFS) not practical in JS
- Consider WebAssembly for future performance

---

**Sprint Version:** 1.0.0
**Created:** 2025-12-17
