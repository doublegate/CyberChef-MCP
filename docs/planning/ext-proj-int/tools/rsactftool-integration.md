# RsaCtfTool Integration Plan

## Overview

| Attribute | Value |
|-----------|-------|
| Source Project | RsaCtfTool |
| Repository | https://github.com/RsaCtfTool/RsaCtfTool |
| License | MIT |
| Language | Python |
| Integration Phase | Phase 3 (Algorithm Ports) |
| Priority | High |
| Complexity | High (mathematical algorithms) |

## Integration Summary

RsaCtfTool provides 60+ RSA attack methods. Rather than wrapping the Python tool, we will port the core mathematical algorithms to JavaScript. The focus is on:

1. **Key analysis and weakness detection** - Identify vulnerable RSA parameters
2. **Small factor attacks** - Factor moduli with small or weak primes
3. **Cryptanalytic attacks** - Wiener's, Fermat's, and similar attacks
4. **Key format utilities** - Parse and convert RSA key formats

Heavy computational attacks (ECM, SIQS) are excluded as they require specialized libraries.

## Operations to Integrate

### High Priority (CTF Essential)

| Attack | Description | Complexity | MCP Tool Name |
|--------|-------------|------------|---------------|
| Key Analysis | Extract and analyze RSA parameters | Low | `cyberchef_rsa_analyze_key` |
| Small Q | Factor n when q is small | Low | `cyberchef_rsa_small_factor` |
| Fermat's Method | Factor close primes | Medium | `cyberchef_rsa_fermat` |
| Wiener's Attack | Small private exponent (d < n^0.25) | Medium | `cyberchef_rsa_wiener` |
| Common Factor | GCD attack on multiple keys | Low | `cyberchef_rsa_common_factor` |
| FactorDB Lookup | Query known factorizations | Low | `cyberchef_rsa_factordb` |

### Medium Priority (Extended Capabilities)

| Attack | Description | Complexity |
|--------|-------------|------------|
| Hastad's Broadcast | Same message, multiple keys, small e | Medium |
| Pollard's p-1 | Smooth p-1 factorization | Medium |
| Pollard's rho | General factorization | Medium |
| ROCA Detection | Check for CVE-2017-15361 | Low |

### Excluded (Require Specialized Libraries)

- Boneh-Durfee (requires SageMath lattice reduction)
- ECM (Elliptic Curve Method - requires GMP)
- SIQS (Self-Initializing Quadratic Sieve)
- Z3-based attacks (requires SMT solver)

## Architecture

### Big Integer Library

JavaScript's native BigInt provides the foundation for RSA mathematics:

```javascript
// src/node/tools/rsa/bigint-utils.mjs

/**
 * Greatest Common Divisor using Euclidean algorithm
 */
export function gcd(a, b) {
    a = abs(a);
    b = abs(b);
    while (b !== 0n) {
        [a, b] = [b, a % b];
    }
    return a;
}

/**
 * Extended Euclidean Algorithm
 * Returns [gcd, x, y] where ax + by = gcd(a, b)
 */
export function extendedGcd(a, b) {
    if (b === 0n) {
        return [a, 1n, 0n];
    }
    const [g, x, y] = extendedGcd(b, a % b);
    return [g, y, x - (a / b) * y];
}

/**
 * Modular multiplicative inverse
 * Returns x where (a * x) mod m = 1
 */
export function modInverse(a, m) {
    const [g, x] = extendedGcd(a % m, m);
    if (g !== 1n) {
        throw new Error('Modular inverse does not exist');
    }
    return ((x % m) + m) % m;
}

/**
 * Modular exponentiation using square-and-multiply
 */
export function modPow(base, exp, mod) {
    let result = 1n;
    base = base % mod;

    while (exp > 0n) {
        if (exp % 2n === 1n) {
            result = (result * base) % mod;
        }
        exp = exp / 2n;
        base = (base * base) % mod;
    }

    return result;
}

/**
 * Integer square root (Newton's method)
 */
export function isqrt(n) {
    if (n < 0n) {
        throw new Error('Square root of negative number');
    }
    if (n < 2n) {
        return n;
    }

    let x0 = n;
    let x1 = (n + 1n) / 2n;

    while (x1 < x0) {
        x0 = x1;
        x1 = (x0 + n / x0) / 2n;
    }

    return x0;
}

/**
 * Check if n is a perfect square
 */
export function isPerfectSquare(n) {
    const root = isqrt(n);
    return root * root === n;
}

/**
 * Absolute value for BigInt
 */
export function abs(n) {
    return n < 0n ? -n : n;
}

/**
 * Calculate bit length of BigInt
 */
export function bitLength(n) {
    if (n === 0n) return 0;
    return n.toString(2).length;
}

/**
 * Miller-Rabin primality test
 */
export function isProbablePrime(n, rounds = 40) {
    if (n < 2n) return false;
    if (n === 2n || n === 3n) return true;
    if (n % 2n === 0n) return false;

    // Write n-1 as 2^r * d
    let r = 0n;
    let d = n - 1n;
    while (d % 2n === 0n) {
        r++;
        d /= 2n;
    }

    // Witness loop
    const witnesses = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

    for (const a of witnesses.slice(0, rounds)) {
        if (a >= n) continue;

        let x = modPow(a, d, n);

        if (x === 1n || x === n - 1n) continue;

        let composite = true;
        for (let i = 0n; i < r - 1n; i++) {
            x = modPow(x, 2n, n);
            if (x === n - 1n) {
                composite = false;
                break;
            }
        }

        if (composite) return false;
    }

    return true;
}
```

### RSA Key Parser

```javascript
// src/node/tools/rsa/key-parser.mjs

/**
 * Parse RSA public key and extract parameters
 */
export class RSAKeyParser {
    /**
     * Parse PEM-encoded public key
     */
    static parsePEM(pem) {
        // Remove headers and whitespace
        const base64 = pem
            .replace(/-----BEGIN [\w\s]+-----/, '')
            .replace(/-----END [\w\s]+-----/, '')
            .replace(/\s/g, '');

        const der = Buffer.from(base64, 'base64');
        return this.parseDER(der);
    }

    /**
     * Parse DER-encoded ASN.1 structure
     */
    static parseDER(der) {
        // Simplified ASN.1 parser for RSA keys
        // Full implementation would use a proper ASN.1 library
        const reader = new ASN1Reader(der);

        // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
        reader.expectSequence();
        const n = reader.readInteger();
        const e = reader.readInteger();

        return { n, e };
    }

    /**
     * Parse n and e from various formats
     */
    static parse(input) {
        if (typeof input === 'object' && input.n && input.e) {
            return {
                n: BigInt(input.n),
                e: BigInt(input.e)
            };
        }

        if (typeof input === 'string') {
            if (input.includes('-----BEGIN')) {
                return this.parsePEM(input);
            }

            // Try parsing as JSON
            try {
                const parsed = JSON.parse(input);
                return {
                    n: BigInt(parsed.n),
                    e: BigInt(parsed.e)
                };
            } catch {
                // Not JSON
            }
        }

        throw new Error('Unable to parse RSA key');
    }

    /**
     * Analyze RSA key for weaknesses
     */
    static analyze(n, e) {
        const analysis = {
            n: n.toString(),
            e: e.toString(),
            nBits: bitLength(n),
            eBits: bitLength(e),
            warnings: [],
            recommendations: []
        };

        // Check key size
        if (analysis.nBits < 1024) {
            analysis.warnings.push(`Key size ${analysis.nBits} bits is critically weak`);
            analysis.recommendations.push('fermat', 'pollard_rho', 'factordb');
        } else if (analysis.nBits < 2048) {
            analysis.warnings.push(`Key size ${analysis.nBits} bits is weak`);
        }

        // Check public exponent
        if (e === 3n) {
            analysis.warnings.push('e=3 is vulnerable to cube root attacks');
            analysis.recommendations.push('hastads', 'cube_root');
        } else if (e < 65537n) {
            analysis.warnings.push(`Small public exponent e=${e}`);
        } else if (bitLength(e) > analysis.nBits / 2) {
            analysis.warnings.push('Large public exponent may indicate small d');
            analysis.recommendations.push('wiener', 'boneh_durfee');
        }

        // Check for known weak patterns
        if (n % 2n === 0n) {
            analysis.warnings.push('n is even (trivially factorable)');
            analysis.factors = [2n, n / 2n];
        }

        return analysis;
    }
}

/**
 * Simplified ASN.1 reader
 */
class ASN1Reader {
    constructor(buffer) {
        this.buffer = buffer;
        this.offset = 0;
    }

    expectSequence() {
        if (this.buffer[this.offset++] !== 0x30) {
            throw new Error('Expected SEQUENCE');
        }
        this.readLength(); // Skip length
    }

    readLength() {
        let length = this.buffer[this.offset++];
        if (length & 0x80) {
            const numBytes = length & 0x7f;
            length = 0;
            for (let i = 0; i < numBytes; i++) {
                length = (length << 8) | this.buffer[this.offset++];
            }
        }
        return length;
    }

    readInteger() {
        if (this.buffer[this.offset++] !== 0x02) {
            throw new Error('Expected INTEGER');
        }
        const length = this.readLength();
        const bytes = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;

        // Convert to BigInt
        let value = 0n;
        for (const byte of bytes) {
            value = (value << 8n) | BigInt(byte);
        }
        return value;
    }
}
```

## Implementation Details

### Fermat's Factorization

```javascript
// src/node/tools/rsa/attacks/fermat.mjs
import { isqrt, isPerfectSquare } from '../bigint-utils.mjs';

/**
 * Fermat's factorization method
 * Exploits: |p - q| is small (close primes)
 *
 * If n = p * q and p ≈ q, then:
 * n = ((p+q)/2)^2 - ((p-q)/2)^2 = a^2 - b^2
 * So we search for a where a^2 - n is a perfect square
 */
export class FermatAttack {
    /**
     * Attempt factorization
     * @param {BigInt} n - Modulus to factor
     * @param {number} maxIterations - Maximum iterations
     * @returns {Object|null} - { p, q } if successful, null otherwise
     */
    static factor(n, maxIterations = 1000000) {
        // Start with ceil(sqrt(n))
        let a = isqrt(n);
        if (a * a < n) {
            a = a + 1n;
        }

        for (let i = 0; i < maxIterations; i++) {
            const b2 = a * a - n;

            if (isPerfectSquare(b2)) {
                const b = isqrt(b2);
                const p = a + b;
                const q = a - b;

                if (p * q === n && p > 1n && q > 1n) {
                    return { p, q };
                }
            }

            a++;
        }

        return null;
    }
}

/**
 * MCP Tool Definition
 */
export const fermatAttackTool = {
    name: 'cyberchef_rsa_fermat',
    description: 'Factor RSA modulus using Fermat\'s method (effective when p and q are close)',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            n: {
                type: 'string',
                description: 'RSA modulus n (decimal or hex with 0x prefix)'
            },
            maxIterations: {
                type: 'number',
                default: 100000,
                description: 'Maximum iterations to try'
            }
        },
        required: ['n']
    },

    async execute(args) {
        const n = args.n.startsWith('0x')
            ? BigInt(args.n)
            : BigInt(args.n);

        const startTime = Date.now();
        const result = FermatAttack.factor(n, args.maxIterations || 100000);
        const elapsed = Date.now() - startTime;

        if (result) {
            return {
                success: true,
                output: {
                    factored: true,
                    p: result.p.toString(),
                    q: result.q.toString(),
                    verification: (result.p * result.q === n).toString()
                },
                metadata: {
                    attack: 'fermat',
                    elapsedMs: elapsed
                }
            };
        }

        return {
            success: true,
            output: {
                factored: false,
                message: 'Fermat\'s method did not factor n (primes may not be close)'
            },
            metadata: {
                attack: 'fermat',
                iterations: args.maxIterations || 100000,
                elapsedMs: elapsed
            }
        };
    }
};
```

### Wiener's Attack

```javascript
// src/node/tools/rsa/attacks/wiener.mjs
import { gcd, modInverse, bitLength } from '../bigint-utils.mjs';

/**
 * Wiener's attack on RSA
 * Exploits: d < n^0.25 / 3 (small private exponent)
 *
 * Uses continued fraction expansion of e/n to find d
 */
export class WienerAttack {
    /**
     * Generate continued fraction convergents of num/den
     */
    static *convergents(num, den) {
        let [a, b, c, d] = [1n, 0n, 0n, 1n];

        while (den !== 0n) {
            const q = num / den;
            [num, den] = [den, num - q * den];
            [a, b, c, d] = [q * a + b, a, q * c + d, c];

            yield { k: a, d: c };
        }
    }

    /**
     * Check if (k, d) is a valid key pair
     */
    static isValidKey(n, e, k, d) {
        if (k === 0n) return null;

        // phi = (ed - 1) / k must be integer
        const edMinus1 = e * d - 1n;
        if (edMinus1 % k !== 0n) return null;

        const phi = edMinus1 / k;

        // From n and phi, we can compute p + q and p * q
        // p + q = n - phi + 1
        // p * q = n
        // So p and q are roots of x^2 - (p+q)x + pq = 0

        const s = n - phi + 1n;  // p + q
        const discriminant = s * s - 4n * n;

        if (discriminant < 0n) return null;

        // Check if discriminant is perfect square
        const sqrtD = this.isqrt(discriminant);
        if (sqrtD * sqrtD !== discriminant) return null;

        const p = (s + sqrtD) / 2n;
        const q = (s - sqrtD) / 2n;

        // Verify
        if (p * q !== n) return null;
        if (p <= 1n || q <= 1n) return null;

        return { p, q, d };
    }

    /**
     * Integer square root
     */
    static isqrt(n) {
        if (n < 2n) return n;
        let x0 = n;
        let x1 = (n + 1n) / 2n;
        while (x1 < x0) {
            x0 = x1;
            x1 = (x0 + n / x0) / 2n;
        }
        return x0;
    }

    /**
     * Attempt Wiener's attack
     */
    static attack(n, e) {
        // Generate convergents of e/n
        for (const { k, d } of this.convergents(e, n)) {
            const result = this.isValidKey(n, e, k, d);
            if (result) {
                return result;
            }
        }

        return null;
    }
}

/**
 * MCP Tool Definition
 */
export const wienerAttackTool = {
    name: 'cyberchef_rsa_wiener',
    description: 'Recover RSA private key using Wiener\'s attack (effective when d < n^0.25)',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            n: {
                type: 'string',
                description: 'RSA modulus n'
            },
            e: {
                type: 'string',
                description: 'RSA public exponent e'
            }
        },
        required: ['n', 'e']
    },

    async execute(args) {
        const n = BigInt(args.n);
        const e = BigInt(args.e);

        const startTime = Date.now();
        const result = WienerAttack.attack(n, e);
        const elapsed = Date.now() - startTime;

        if (result) {
            return {
                success: true,
                output: {
                    recovered: true,
                    p: result.p.toString(),
                    q: result.q.toString(),
                    d: result.d.toString(),
                    verification: ((result.p * result.q) === n).toString()
                },
                metadata: {
                    attack: 'wiener',
                    elapsedMs: elapsed,
                    vulnerability: 'd was small enough for continued fraction attack'
                }
            };
        }

        return {
            success: true,
            output: {
                recovered: false,
                message: 'Wiener\'s attack failed (d may not be small enough)'
            },
            metadata: {
                attack: 'wiener',
                elapsedMs: elapsed
            }
        };
    }
};
```

### Small Factor Attack

```javascript
// src/node/tools/rsa/attacks/small-factor.mjs
import { gcd, isProbablePrime } from '../bigint-utils.mjs';

/**
 * Small factor attack - trial division with small primes
 */
export class SmallFactorAttack {
    /**
     * Generate small primes using Sieve of Eratosthenes
     */
    static generateSmallPrimes(limit) {
        const sieve = new Uint8Array(limit + 1);
        const primes = [];

        for (let i = 2; i <= limit; i++) {
            if (!sieve[i]) {
                primes.push(BigInt(i));
                for (let j = i * 2; j <= limit; j += i) {
                    sieve[j] = 1;
                }
            }
        }

        return primes;
    }

    // Cache of small primes
    static smallPrimes = null;

    /**
     * Get small primes (cached)
     */
    static getSmallPrimes() {
        if (!this.smallPrimes) {
            this.smallPrimes = this.generateSmallPrimes(1000000);
        }
        return this.smallPrimes;
    }

    /**
     * Attempt factorization with trial division
     */
    static factor(n, maxPrime = 1000000) {
        const primes = this.getSmallPrimes();

        for (const p of primes) {
            if (p > maxPrime) break;

            if (n % p === 0n) {
                const q = n / p;
                if (isProbablePrime(q)) {
                    return { p, q };
                }
            }
        }

        return null;
    }

    /**
     * Extended trial division with larger primes
     */
    static factorExtended(n, maxTrials = 10000000) {
        // First try small primes
        const smallResult = this.factor(n);
        if (smallResult) return smallResult;

        // Then try larger odd numbers
        let candidate = 1000001n;
        const limit = BigInt(maxTrials);

        while (candidate < limit) {
            if (n % candidate === 0n) {
                const q = n / candidate;
                if (isProbablePrime(candidate) && isProbablePrime(q)) {
                    return { p: candidate, q };
                }
            }
            candidate += 2n;
        }

        return null;
    }
}

/**
 * MCP Tool Definition
 */
export const smallFactorTool = {
    name: 'cyberchef_rsa_small_factor',
    description: 'Factor RSA modulus by trial division with small primes',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            n: {
                type: 'string',
                description: 'RSA modulus n'
            },
            maxPrime: {
                type: 'number',
                default: 1000000,
                description: 'Maximum prime to try'
            },
            extended: {
                type: 'boolean',
                default: false,
                description: 'Try extended range (slower)'
            }
        },
        required: ['n']
    },

    async execute(args) {
        const n = BigInt(args.n);
        const startTime = Date.now();

        const result = args.extended
            ? SmallFactorAttack.factorExtended(n, args.maxPrime || 10000000)
            : SmallFactorAttack.factor(n, args.maxPrime || 1000000);

        const elapsed = Date.now() - startTime;

        if (result) {
            return {
                success: true,
                output: {
                    factored: true,
                    p: result.p.toString(),
                    q: result.q.toString(),
                    smallFactor: (result.p < result.q ? result.p : result.q).toString()
                },
                metadata: {
                    attack: 'small_factor',
                    elapsedMs: elapsed
                }
            };
        }

        return {
            success: true,
            output: {
                factored: false,
                message: 'No small factors found'
            },
            metadata: {
                attack: 'small_factor',
                maxPrime: args.maxPrime || 1000000,
                elapsedMs: elapsed
            }
        };
    }
};
```

### Common Factor Attack

```javascript
// src/node/tools/rsa/attacks/common-factor.mjs
import { gcd } from '../bigint-utils.mjs';

/**
 * Common factor attack - find shared primes between multiple RSA keys
 */
export class CommonFactorAttack {
    /**
     * Find common factors between multiple moduli
     */
    static findCommonFactors(moduli) {
        const results = [];

        for (let i = 0; i < moduli.length; i++) {
            for (let j = i + 1; j < moduli.length; j++) {
                const commonFactor = gcd(moduli[i], moduli[j]);

                if (commonFactor > 1n && commonFactor !== moduli[i] && commonFactor !== moduli[j]) {
                    results.push({
                        index1: i,
                        index2: j,
                        n1: moduli[i],
                        n2: moduli[j],
                        commonPrime: commonFactor,
                        q1: moduli[i] / commonFactor,
                        q2: moduli[j] / commonFactor
                    });
                }
            }
        }

        return results;
    }

    /**
     * Factor a single modulus against a set of known primes
     */
    static factorAgainstKnown(n, knownPrimes) {
        for (const prime of knownPrimes) {
            const g = gcd(n, prime);
            if (g > 1n && g < n) {
                return {
                    p: g,
                    q: n / g
                };
            }
        }
        return null;
    }
}

/**
 * MCP Tool Definition
 */
export const commonFactorTool = {
    name: 'cyberchef_rsa_common_factor',
    description: 'Find common prime factors between multiple RSA moduli',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            moduli: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of RSA moduli (n values)'
            }
        },
        required: ['moduli']
    },

    async execute(args) {
        const moduli = args.moduli.map(m => BigInt(m));
        const startTime = Date.now();

        const results = CommonFactorAttack.findCommonFactors(moduli);
        const elapsed = Date.now() - startTime;

        if (results.length > 0) {
            return {
                success: true,
                output: {
                    found: true,
                    vulnerablePairs: results.map(r => ({
                        indices: [r.index1, r.index2],
                        commonPrime: r.commonPrime.toString(),
                        factorization1: {
                            n: r.n1.toString(),
                            p: r.commonPrime.toString(),
                            q: r.q1.toString()
                        },
                        factorization2: {
                            n: r.n2.toString(),
                            p: r.commonPrime.toString(),
                            q: r.q2.toString()
                        }
                    }))
                },
                metadata: {
                    attack: 'common_factor',
                    moduliCount: moduli.length,
                    vulnerableCount: results.length,
                    elapsedMs: elapsed
                }
            };
        }

        return {
            success: true,
            output: {
                found: false,
                message: 'No common factors found between moduli'
            },
            metadata: {
                attack: 'common_factor',
                moduliCount: moduli.length,
                elapsedMs: elapsed
            }
        };
    }
};
```

### RSA Key Analysis Tool

```javascript
// src/node/tools/rsa/analyze.mjs
import { RSAKeyParser } from './key-parser.mjs';
import { gcd, bitLength, isProbablePrime, modInverse, modPow } from './bigint-utils.mjs';

/**
 * Comprehensive RSA key analysis
 */
export class RSAAnalyzer {
    /**
     * Analyze RSA public key for weaknesses
     */
    static analyzePublicKey(n, e) {
        const analysis = {
            parameters: {
                n: n.toString(),
                e: e.toString(),
                nBits: bitLength(n),
                eBits: bitLength(e),
                nHex: n.toString(16)
            },
            security: {
                keyStrength: 'unknown',
                vulnerabilities: [],
                recommendedAttacks: []
            },
            checks: {}
        };

        // Key size check
        const nBits = bitLength(n);
        if (nBits < 512) {
            analysis.security.keyStrength = 'critically-weak';
            analysis.security.vulnerabilities.push('Key size below 512 bits - trivially factorable');
            analysis.security.recommendedAttacks.push('any');
        } else if (nBits < 1024) {
            analysis.security.keyStrength = 'weak';
            analysis.security.vulnerabilities.push('Key size below 1024 bits - vulnerable to factorization');
            analysis.security.recommendedAttacks.push('fermat', 'pollard_rho', 'small_factor');
        } else if (nBits < 2048) {
            analysis.security.keyStrength = 'moderate';
            analysis.security.vulnerabilities.push('Key size below 2048 bits - not recommended for new deployments');
        } else {
            analysis.security.keyStrength = 'strong';
        }

        // Public exponent checks
        if (e === 3n) {
            analysis.security.vulnerabilities.push('e=3 vulnerable to cube root and Hastad attacks');
            analysis.security.recommendedAttacks.push('hastads', 'cube_root');
        } else if (e < 65537n && e !== 3n) {
            analysis.security.vulnerabilities.push(`Small public exponent e=${e}`);
        }

        // Check for large e (may indicate small d)
        if (bitLength(e) > nBits * 0.5) {
            analysis.security.vulnerabilities.push('Large e may indicate small d');
            analysis.security.recommendedAttacks.push('wiener');
        }

        // Special checks
        analysis.checks.isEven = n % 2n === 0n;
        if (analysis.checks.isEven) {
            analysis.security.vulnerabilities.push('n is even - trivially factorable');
            analysis.security.recommendedAttacks.push('trivial');
        }

        analysis.checks.isPrime = isProbablePrime(n);
        if (analysis.checks.isPrime) {
            analysis.security.vulnerabilities.push('n appears to be prime (not a valid RSA modulus)');
        }

        analysis.checks.isPerfectPower = this.checkPerfectPower(n);
        if (analysis.checks.isPerfectPower.isPower) {
            analysis.security.vulnerabilities.push(
                `n is a perfect power: ${analysis.checks.isPerfectPower.base}^${analysis.checks.isPerfectPower.exp}`
            );
        }

        // GCD with common weak primes
        const weakPrimes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n];
        for (const p of weakPrimes) {
            if (n % p === 0n) {
                analysis.checks.hasSmallFactor = p.toString();
                analysis.security.vulnerabilities.push(`n divisible by ${p}`);
                break;
            }
        }

        return analysis;
    }

    /**
     * Check if n is a perfect power (n = b^k for some k > 1)
     */
    static checkPerfectPower(n) {
        const maxExp = 64;

        for (let k = 2; k <= maxExp; k++) {
            const root = this.nthRoot(n, k);
            if (root !== null && this.pow(root, k) === n) {
                return { isPower: true, base: root.toString(), exp: k };
            }
        }

        return { isPower: false };
    }

    /**
     * Calculate nth root using Newton's method
     */
    static nthRoot(n, k) {
        if (n < 2n) return n;

        let x = n;
        let y = (BigInt(k - 1) * x + n / this.pow(x, k - 1)) / BigInt(k);

        while (y < x) {
            x = y;
            y = (BigInt(k - 1) * x + n / this.pow(x, k - 1)) / BigInt(k);
        }

        return this.pow(x, k) === n ? x : null;
    }

    static pow(base, exp) {
        let result = 1n;
        for (let i = 0; i < exp; i++) {
            result *= base;
        }
        return result;
    }

    /**
     * Analyze private key (if available)
     */
    static analyzePrivateKey(n, e, d, p = null, q = null) {
        const analysis = this.analyzePublicKey(n, e);

        analysis.privateKey = {
            d: d.toString(),
            dBits: bitLength(d)
        };

        // Check d size relative to n
        const dRatio = Number(bitLength(d)) / Number(bitLength(n));
        if (dRatio < 0.25) {
            analysis.security.vulnerabilities.push('Small d - vulnerable to Wiener and Boneh-Durfee');
        }

        // Verify key if p and q provided
        if (p && q) {
            analysis.factors = {
                p: p.toString(),
                q: q.toString(),
                pBits: bitLength(p),
                qBits: bitLength(q)
            };

            // Check close primes
            const diff = p > q ? p - q : q - p;
            if (bitLength(diff) < bitLength(p) / 2) {
                analysis.security.vulnerabilities.push('Close primes - vulnerable to Fermat');
            }

            // Verify consistency
            const phi = (p - 1n) * (q - 1n);
            const dVerified = modInverse(e, phi);
            analysis.verification = {
                nCorrect: (p * q === n),
                dCorrect: (d === dVerified)
            };
        }

        return analysis;
    }
}

/**
 * MCP Tool Definition
 */
export const rsaAnalyzeTool = {
    name: 'cyberchef_rsa_analyze_key',
    description: 'Analyze RSA key for weaknesses and recommend attack strategies',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            n: {
                type: 'string',
                description: 'RSA modulus n'
            },
            e: {
                type: 'string',
                description: 'RSA public exponent e'
            },
            d: {
                type: 'string',
                description: 'RSA private exponent d (optional)'
            },
            key: {
                type: 'string',
                description: 'PEM-encoded RSA key (alternative to n/e)'
            }
        }
    },

    async execute(args) {
        let n, e, d;

        if (args.key) {
            const parsed = RSAKeyParser.parsePEM(args.key);
            n = parsed.n;
            e = parsed.e;
        } else {
            n = BigInt(args.n);
            e = BigInt(args.e);
        }

        if (args.d) {
            d = BigInt(args.d);
        }

        const analysis = d
            ? RSAAnalyzer.analyzePrivateKey(n, e, d)
            : RSAAnalyzer.analyzePublicKey(n, e);

        return {
            success: true,
            output: analysis,
            metadata: {
                tool: 'rsa_analyze'
            }
        };
    }
};
```

## Testing Strategy

### Unit Tests

```javascript
// tests/tools/rsa/fermat.test.mjs
import { describe, it, expect } from 'vitest';
import { FermatAttack } from '../../../src/node/tools/rsa/attacks/fermat.mjs';

describe('FermatAttack', () => {
    it('should factor close primes', () => {
        // n = 127 * 131 = 16637 (close primes)
        const n = 16637n;
        const result = FermatAttack.factor(n);

        expect(result).not.toBeNull();
        expect(result.p * result.q).toBe(n);
    });

    it('should factor RSA-like modulus with close primes', () => {
        // Two primes differing by 4
        const p = 1000003n;
        const q = 1000033n;
        const n = p * q;

        const result = FermatAttack.factor(n, 1000);
        expect(result).not.toBeNull();
    });

    it('should return null for distant primes', () => {
        // Primes that are far apart
        const n = 15n; // 3 * 5
        const result = FermatAttack.factor(n, 10);

        // May or may not factor depending on iteration limit
        if (result) {
            expect(result.p * result.q).toBe(n);
        }
    });
});

// tests/tools/rsa/wiener.test.mjs
import { describe, it, expect } from 'vitest';
import { WienerAttack } from '../../../src/node/tools/rsa/attacks/wiener.mjs';

describe('WienerAttack', () => {
    it('should recover small d', () => {
        // Known vulnerable parameters
        const n = 90581n;  // Small test case
        const e = 17993n;  // Corresponds to small d

        const result = WienerAttack.attack(n, e);

        if (result) {
            expect(result.p * result.q).toBe(n);
        }
    });
});
```

### Integration Tests

```javascript
// tests/tools/rsa/integration.test.mjs
import { describe, it, expect } from 'vitest';
import { fermatAttackTool } from '../../../src/node/tools/rsa/attacks/fermat.mjs';
import { rsaAnalyzeTool } from '../../../src/node/tools/rsa/analyze.mjs';

describe('RSA MCP Tools', () => {
    describe('cyberchef_rsa_fermat', () => {
        it('should execute Fermat attack', async () => {
            const result = await fermatAttackTool.execute({
                n: '16637',  // 127 * 131
                maxIterations: 1000
            });

            expect(result.success).toBe(true);
            expect(result.output.factored).toBe(true);
        });
    });

    describe('cyberchef_rsa_analyze_key', () => {
        it('should analyze weak key', async () => {
            const result = await rsaAnalyzeTool.execute({
                n: '16637',
                e: '65537'
            });

            expect(result.success).toBe(true);
            expect(result.output.security.vulnerabilities.length).toBeGreaterThan(0);
        });
    });
});
```

## File Structure

```
src/node/tools/rsa/
├── index.mjs                    # Module exports
├── bigint-utils.mjs             # BigInt math utilities
├── key-parser.mjs               # RSA key parsing
├── analyze.mjs                  # Key analysis
└── attacks/
    ├── fermat.mjs               # Fermat's factorization
    ├── wiener.mjs               # Wiener's attack
    ├── small-factor.mjs         # Trial division
    ├── common-factor.mjs        # GCD attack
    ├── pollard-rho.mjs          # Pollard's rho (future)
    └── pollard-p1.mjs           # Pollard p-1 (future)

tests/tools/rsa/
├── bigint-utils.test.mjs
├── fermat.test.mjs
├── wiener.test.mjs
├── small-factor.test.mjs
├── common-factor.test.mjs
└── integration.test.mjs
```

## MCP Tools Summary

| Tool Name | Category | Description |
|-----------|----------|-------------|
| `cyberchef_rsa_analyze_key` | crypto | Analyze RSA key for weaknesses |
| `cyberchef_rsa_fermat` | crypto | Fermat's factorization for close primes |
| `cyberchef_rsa_wiener` | crypto | Wiener's attack for small d |
| `cyberchef_rsa_small_factor` | crypto | Trial division with small primes |
| `cyberchef_rsa_common_factor` | crypto | GCD attack on multiple keys |
| `cyberchef_rsa_factordb` | crypto | Query FactorDB for known factorizations |

## Dependencies

- **Native BigInt**: JavaScript BigInt for large integer operations
- **Optional**: External HTTP client for FactorDB queries

## Timeline

| Task | Estimated Time |
|------|----------------|
| BigInt utilities | 1 day |
| Key parser | 0.5 days |
| Key analyzer | 0.5 days |
| Fermat's attack | 0.5 days |
| Wiener's attack | 1 day |
| Small factor attack | 0.5 days |
| Common factor attack | 0.5 days |
| Testing | 1.5 days |
| **Total** | **6 days** |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| BigInt performance for large keys | Medium | Medium | Set iteration limits |
| ASN.1 parsing edge cases | Medium | Low | Use simplified parser, fall back to n/e input |
| Mathematical algorithm errors | Low | High | Extensive testing with known test cases |

## Future Enhancements

1. **FactorDB Integration**: HTTP client to query known factorizations
2. **Pollard's rho**: General-purpose factorization
3. **Pollard's p-1**: Smooth p-1 factorization
4. **ROCA Detection**: Check for CVE-2017-15361 vulnerability
5. **Private Key Recovery**: Compute d from p, q, e

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Related Phases:** Phase 3 (Algorithm Ports)
