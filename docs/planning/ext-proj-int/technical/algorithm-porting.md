# Algorithm Porting Technical Guide

## Overview

This guide documents best practices for porting algorithms from external security tools (Python, Rust, C) to native JavaScript for CyberChef-MCP integration. The goal is to extract core algorithmic logic without external dependencies.

## Porting Philosophy

### Core Principles

1. **Extract Logic, Not Infrastructure** - Port the algorithm, not the CLI/framework
2. **Native JavaScript** - Use built-in features (BigInt, TypedArrays, Buffer)
3. **No External Dependencies** - Avoid npm packages where possible
4. **Maintain Correctness** - Validate against original implementation
5. **Document Differences** - Note any behavioral variations

### Decision Matrix

| Source Feature | Port Strategy |
|----------------|---------------|
| Algorithm/Math | Direct port to JavaScript |
| File I/O | Adapt to Buffer/TypedArray input |
| CLI parsing | Replace with function parameters |
| System calls | Remove or mock |
| External binaries | Not ported |
| Network calls | Evaluate case-by-case |

## Language-Specific Porting

### Python to JavaScript

#### Data Types

| Python | JavaScript | Notes |
|--------|------------|-------|
| `int` (arbitrary) | `BigInt` | Use `BigInt()` for large numbers |
| `bytes` | `Uint8Array` | Direct mapping |
| `str` | `String` | UTF-8 handling differs |
| `list` | `Array` | Similar behavior |
| `dict` | `Object` or `Map` | `Map` for non-string keys |
| `set` | `Set` | Direct mapping |
| `tuple` | `Array` | No tuple type |

#### Common Patterns

```python
# Python: Integer division
result = a // b

# JavaScript equivalent
const result = a / b | 0;  // For small numbers
const result = BigInt(a) / BigInt(b);  // For BigInt
```

```python
# Python: Range iteration
for i in range(10):
    print(i)

# JavaScript equivalent
for (let i = 0; i < 10; i++) {
    console.log(i);
}
```

```python
# Python: List comprehension
squares = [x**2 for x in range(10)]

# JavaScript equivalent
const squares = Array.from({length: 10}, (_, x) => x ** 2);
// Or
const squares = [...Array(10)].map((_, x) => x ** 2);
```

```python
# Python: Bytes manipulation
data = b'\x00\x01\x02\x03'
byte_val = data[0]
data_hex = data.hex()

# JavaScript equivalent
const data = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
const byteVal = data[0];
const dataHex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
```

```python
# Python: Bitwise XOR on bytes
result = bytes(a ^ b for a, b in zip(data1, data2))

# JavaScript equivalent
const result = new Uint8Array(data1.length);
for (let i = 0; i < data1.length; i++) {
    result[i] = data1[i] ^ data2[i];
}
```

#### Mathematical Operations

```python
# Python: Large number operations
from math import gcd, isqrt
import gmpy2

# JavaScript equivalent using BigInt
function gcd(a, b) {
    a = BigInt(a);
    b = BigInt(b);
    while (b !== 0n) {
        [a, b] = [b, a % b];
    }
    return a;
}

function isqrt(n) {
    n = BigInt(n);
    if (n < 0n) throw new Error('Square root of negative number');
    if (n < 2n) return n;

    let x = n;
    let y = (x + 1n) / 2n;
    while (y < x) {
        x = y;
        y = (x + n / x) / 2n;
    }
    return x;
}

function modPow(base, exp, mod) {
    base = BigInt(base);
    exp = BigInt(exp);
    mod = BigInt(mod);

    if (mod === 1n) return 0n;
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

function modInverse(a, m) {
    a = BigInt(a);
    m = BigInt(m);

    const m0 = m;
    let x0 = 0n, x1 = 1n;

    while (a > 1n) {
        const q = a / m;
        let t = m;
        m = a % m;
        a = t;
        t = x0;
        x0 = x1 - q * x0;
        x1 = t;
    }

    if (x1 < 0n) x1 += m0;
    return x1;
}
```

### Rust to JavaScript

#### Data Types

| Rust | JavaScript | Notes |
|------|------------|-------|
| `i32`/`u32` | `number` | Safe for 32-bit |
| `i64`/`u64` | `BigInt` | For 64-bit |
| `Vec<u8>` | `Uint8Array` | Direct mapping |
| `String` | `String` | UTF-8 compatible |
| `Option<T>` | `T | null` | Use null/undefined |
| `Result<T, E>` | `try/catch` | Exception handling |
| `HashMap` | `Map` | Similar API |

#### Common Patterns

```rust
// Rust: Pattern matching
match value {
    Some(x) => process(x),
    None => default_value,
}

// JavaScript equivalent
const result = value !== null ? process(value) : defaultValue;
```

```rust
// Rust: Iterator chains
let result: Vec<u8> = data
    .iter()
    .map(|x| x ^ key)
    .collect();

// JavaScript equivalent
const result = new Uint8Array(
    Array.from(data).map(x => x ^ key)
);
```

```rust
// Rust: Error handling
fn process(data: &[u8]) -> Result<String, Error> {
    if data.is_empty() {
        return Err(Error::new("Empty input"));
    }
    Ok(String::from_utf8(data.to_vec())?)
}

// JavaScript equivalent
function process(data) {
    if (data.length === 0) {
        throw new Error('Empty input');
    }
    return new TextDecoder().decode(data);
}
```

### C to JavaScript

#### Data Types

| C | JavaScript | Notes |
|---|------------|-------|
| `int`/`long` | `number` or `BigInt` | Size-dependent |
| `unsigned char*` | `Uint8Array` | For byte arrays |
| `char*` | `String` | For strings |
| `struct` | `Object` or `class` | Object literals |
| `union` | `DataView` | For binary parsing |
| pointer arithmetic | index arithmetic | Array indices |

#### Memory and Pointers

```c
// C: Pointer arithmetic
void process(unsigned char *data, size_t len) {
    for (size_t i = 0; i < len; i++) {
        data[i] ^= key;
    }
}

// JavaScript equivalent
function process(data, key) {
    for (let i = 0; i < data.length; i++) {
        data[i] ^= key;
    }
    return data;
}
```

```c
// C: Struct packing
struct header {
    uint32_t magic;
    uint16_t version;
    uint16_t flags;
};

// JavaScript using DataView
function parseHeader(buffer) {
    const view = new DataView(buffer);
    return {
        magic: view.getUint32(0, true),    // little-endian
        version: view.getUint16(4, true),
        flags: view.getUint16(6, true)
    };
}
```

## Algorithm Categories

### Cryptographic Algorithms

#### RSA Mathematics

```javascript
// Port of RSA factorization (from RsaCtfTool)

/**
 * Fermat's factorization
 * Works when p and q are close
 */
export function fermatFactor(n, maxIterations = 1000000) {
    n = BigInt(n);
    let a = isqrt(n);
    if (a * a === n) {
        return [a, a];  // Perfect square
    }
    a = a + 1n;

    for (let i = 0; i < maxIterations; i++) {
        const b2 = a * a - n;
        const b = isqrt(b2);

        if (b * b === b2) {
            return [a - b, a + b];
        }
        a++;
    }

    return null;  // Failed to factor
}

/**
 * Pollard's rho factorization
 */
export function pollardRho(n, maxIterations = 1000000) {
    n = BigInt(n);
    if (n % 2n === 0n) return 2n;

    let x = 2n;
    let y = 2n;
    let d = 1n;

    const f = (x) => (x * x + 1n) % n;

    let iterations = 0;
    while (d === 1n && iterations < maxIterations) {
        x = f(x);
        y = f(f(y));
        d = gcd(abs(x - y), n);
        iterations++;
    }

    return d !== n ? d : null;
}

/**
 * Wiener's attack on small private exponent
 */
export function wienerAttack(n, e) {
    n = BigInt(n);
    e = BigInt(e);

    // Generate continued fraction convergents
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

    for (const [k, d] of convergents(e, n)) {
        if (k === 0n) continue;

        const phi = (e * d - 1n) / k;
        const b = n - phi + 1n;
        const discriminant = b * b - 4n * n;

        if (discriminant >= 0n) {
            const sqrtDisc = isqrt(discriminant);
            if (sqrtDisc * sqrtDisc === discriminant) {
                const p = (b + sqrtDisc) / 2n;
                const q = (b - sqrtDisc) / 2n;

                if (p * q === n) {
                    return { p, q, d };
                }
            }
        }
    }

    return null;
}
```

### Encoding/Decoding Algorithms

#### De Bruijn Sequence (from pwntools)

```javascript
/**
 * Generate de Bruijn sequence using FKM algorithm
 * Ported from pwntools cyclic()
 */
export function deBruijn(k, n) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'.slice(0, k);
    const sequence = [];
    const a = new Array(k * n).fill(0);

    function db(t, p) {
        if (t > n) {
            if (n % p === 0) {
                for (let j = 1; j <= p; j++) {
                    sequence.push(alphabet[a[j]]);
                }
            }
        } else {
            a[t] = a[t - p];
            db(t + 1, p);

            for (let j = a[t - p] + 1; j < k; j++) {
                a[t] = j;
                db(t + 1, t);
            }
        }
    }

    db(1, 1);
    return sequence.join('');
}

/**
 * Find substring position in de Bruijn sequence
 */
export function deBruijnFind(subsequence, k = 26, n = 4) {
    const pattern = deBruijn(k, n);
    return pattern.indexOf(subsequence);
}
```

### Pattern Detection Algorithms

#### Index of Coincidence (from cipher analysis)

```javascript
/**
 * Calculate Index of Coincidence
 * Used for cipher type detection
 */
export function indexOfCoincidence(text) {
    const cleaned = text.toLowerCase().replace(/[^a-z]/g, '');
    const n = cleaned.length;

    if (n < 2) return 0;

    const freq = new Array(26).fill(0);
    for (const char of cleaned) {
        freq[char.charCodeAt(0) - 97]++;
    }

    let sum = 0;
    for (const f of freq) {
        sum += f * (f - 1);
    }

    return sum / (n * (n - 1));
}

/**
 * Estimate Vigenere key length using Kasiski examination
 */
export function kasiskiExamination(text, minLen = 3) {
    const cleaned = text.toLowerCase().replace(/[^a-z]/g, '');
    const distances = [];

    // Find repeated sequences
    for (let len = minLen; len <= 6; len++) {
        const seen = new Map();

        for (let i = 0; i <= cleaned.length - len; i++) {
            const seq = cleaned.slice(i, i + len);
            if (seen.has(seq)) {
                distances.push(i - seen.get(seq));
            }
            seen.set(seq, i);
        }
    }

    // Find GCD of distances
    if (distances.length === 0) return null;

    let result = distances[0];
    for (const d of distances.slice(1)) {
        result = gcd(result, d);
    }

    return result;
}
```

## Testing Ported Algorithms

### Validation Strategy

1. **Reference Test Cases** - Use test vectors from original project
2. **Edge Cases** - Test boundary conditions
3. **Cross-Validation** - Compare output with original implementation
4. **Performance** - Benchmark against original (when applicable)

### Test Example

```javascript
// tests/algorithms/rsa.test.mjs
import { describe, it, expect } from 'vitest';
import { fermatFactor, wienerAttack } from '../../src/node/tools/rsactftool/attacks.mjs';

describe('Fermat Factorization', () => {
    // Test vectors from RsaCtfTool test suite
    const testCases = [
        {
            n: 143n,  // 11 * 13
            expected: [11n, 13n]
        },
        {
            n: 15n,   // 3 * 5
            expected: [3n, 5n]
        },
        {
            // Close primes (ideal for Fermat)
            n: 323n,  // 17 * 19
            expected: [17n, 19n]
        }
    ];

    for (const tc of testCases) {
        it(`should factor ${tc.n}`, () => {
            const result = fermatFactor(tc.n);
            expect(result).toBeDefined();
            expect(result[0] * result[1]).toBe(tc.n);
        });
    }
});

describe('Wiener Attack', () => {
    it('should recover small d', () => {
        // Generated test case with known small d
        const n = 90581n;
        const e = 17993n;
        const expectedD = 5n;

        const result = wienerAttack(n, e);
        expect(result).toBeDefined();
        expect(result.d).toBe(expectedD);
    });
});
```

## Performance Considerations

### BigInt Performance

```javascript
// Prefer BigInt literals for constants
const TWO = 2n;  // Better than BigInt(2)

// Avoid mixing BigInt and Number
// BAD: BigInt(a) + 1  (1 is Number)
// GOOD: a + 1n

// Use bitwise operations where possible
// BAD: n % 2n === 0n (expensive division)
// GOOD: (n & 1n) === 0n (bitwise AND)
```

### TypedArray Efficiency

```javascript
// Pre-allocate arrays when size is known
const result = new Uint8Array(input.length);  // Faster than push

// Use subarray() not slice() for views (no copy)
const chunk = data.subarray(start, end);

// Use DataView for multi-byte operations
const view = new DataView(buffer);
const value = view.getUint32(offset, littleEndian);
```

### Iteration Optimization

```javascript
// For loops faster than forEach for TypedArrays
for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key;
}

// Avoid creating intermediate arrays
// BAD: data.map(x => x ^ key) for Uint8Array
// GOOD: for loop with pre-allocated result
```

## Common Pitfalls

### Number Precision

```javascript
// JavaScript Number loses precision beyond 2^53
const large = 9007199254740992;  // Loses precision
const safe = 9007199254740992n;  // Use BigInt

// Check before conversion
if (value > Number.MAX_SAFE_INTEGER) {
    // Use BigInt
}
```

### Signed vs Unsigned

```javascript
// JavaScript bitwise ops are signed 32-bit
const result = 0xFFFFFFFF | 0;  // Returns -1, not 4294967295

// Use >>> 0 for unsigned
const unsigned = (value | 0) >>> 0;

// Or use BigInt
const bigUnsigned = BigInt(0xFFFFFFFF);
```

### String Encoding

```javascript
// Python bytes != JavaScript string
// Always use proper encoding/decoding

// UTF-8 text
const text = new TextDecoder('utf-8').decode(bytes);
const bytes = new TextEncoder().encode(text);

// Binary data (Latin-1)
const binary = String.fromCharCode(...bytes);
const bytes = Uint8Array.from(str, c => c.charCodeAt(0));
```

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
