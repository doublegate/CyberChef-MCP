# Dependency Management for External Tool Integrations

## Overview

This document defines the dependency management strategy for external tool integrations into CyberChef-MCP. The primary goal is to minimize external dependencies while maximizing functionality through native JavaScript implementations.

## Core Philosophy

### Dependency Hierarchy

1. **Native JavaScript** - Prefer built-in features (BigInt, TypedArrays, crypto.subtle)
2. **Existing CyberChef Dependencies** - Reuse what's already in the project
3. **Zero-Dependency Ports** - Extract algorithm logic without dependencies
4. **Minimal New Dependencies** - Only add when native implementation is impractical

### Decision Criteria

| Factor | Weight | Considerations |
|--------|--------|----------------|
| Security | Critical | No known vulnerabilities, maintained, trusted source |
| Size | High | Bundle size impact, tree-shaking support |
| Maintenance | High | Active development, responsive maintainers |
| License | Critical | MIT, Apache 2.0, BSD preferred |
| Necessity | High | Cannot reasonably implement in native JS |

## Existing CyberChef Dependencies

### Available for Reuse

These packages are already in CyberChef and can be leveraged:

| Package | Version | Purpose | Use Cases |
|---------|---------|---------|-----------|
| `crypto-api` | ^0.8.5 | Cryptographic primitives | Hash functions, HMAC |
| `crypto-js` | ^4.2.0 | Crypto operations | AES, DES, encryption |
| `jsbn` | ^1.1.0 | BigInteger | RSA math (alternative to BigInt) |
| `jsrsasign` | ^11.0.0 | PKI/Crypto | RSA operations, certificates |
| `bcryptjs` | ^2.4.3 | Password hashing | Bcrypt operations |
| `avsc` | ^5.4.7 | Avro serialization | Binary data formats |
| `jsonpath-plus` | ^7.2.0 | JSON traversal | Data extraction |
| `xpath` | 0.0.34 | XML traversal | Data extraction |
| `terser` | ^5.27.0 | JS minification | Code analysis |
| `js-beautify` | ^1.15.1 | Code formatting | Output formatting |

### Native JavaScript Alternatives

Prefer these native features over external packages:

| Instead Of | Use Native | Notes |
|------------|------------|-------|
| `big-integer` | `BigInt` | Built-in arbitrary precision |
| `buffer` (npm) | `Buffer` | Node.js built-in |
| `typed-arrays` | `Uint8Array`, `DataView` | Built-in binary handling |
| `crypto` (npm) | `crypto.subtle` | Web Crypto API |
| `base64-js` | `Buffer.from/toString` | Built-in encoding |
| `hex-encode` | Manual conversion | Simple implementation |

## New Dependencies Analysis

### Approved Dependencies

These have been evaluated and approved for use:

#### fast-check (Testing Only)

**Package:** `fast-check`
**Purpose:** Property-based testing / fuzzing
**Category:** devDependency
**License:** MIT

```json
{
  "devDependencies": {
    "fast-check": "^3.15.0"
  }
}
```

**Justification:**
- Industry standard for property-based testing
- Zero runtime impact (dev only)
- Excellent for testing algorithm correctness
- No alternative with comparable functionality

### Rejected Dependencies

| Package | Reason for Rejection | Alternative |
|---------|---------------------|-------------|
| `python-shell` | External process dependency | Native JS port |
| `node-forge` | Overlaps with existing crypto | Use `jsrsasign` |
| `bignumber.js` | Overlaps with native BigInt | Use `BigInt` |
| `lodash` | Too large, mostly unnecessary | Native methods |
| `moment` | Large size | Native `Date` |
| `request` | Deprecated | Native `fetch` |

### Evaluation Pending

| Package | Purpose | Status |
|---------|---------|--------|
| None currently | - | - |

## Native Implementation Patterns

### BigInt Math Library

Rather than importing a BigInt library, implement core functions:

```javascript
// src/node/tools/common/bigint-math.mjs

/**
 * Native BigInt mathematical utilities
 * Replaces: gmpy2, big-integer, bignumber.js
 */

/**
 * Greatest Common Divisor (Euclidean algorithm)
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
 * Extended GCD - returns [gcd, x, y] where ax + by = gcd
 */
export function extendedGcd(a, b) {
    a = BigInt(a);
    b = BigInt(b);

    let [oldR, r] = [a, b];
    let [oldS, s] = [1n, 0n];
    let [oldT, t] = [0n, 1n];

    while (r !== 0n) {
        const quotient = oldR / r;
        [oldR, r] = [r, oldR - quotient * r];
        [oldS, s] = [s, oldS - quotient * s];
        [oldT, t] = [t, oldT - quotient * t];
    }

    return [oldR, oldS, oldT];
}

/**
 * Modular multiplicative inverse
 */
export function modInverse(a, m) {
    a = BigInt(a);
    m = BigInt(m);

    const [g, x] = extendedGcd(a, m);
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
 * Check if n is a perfect power
 */
export function isPerfectPower(n) {
    n = BigInt(n);
    if (n < 2n) return null;

    const maxK = BigInt(Math.floor(Math.log2(Number(n))));

    for (let k = 2n; k <= maxK; k++) {
        const root = iroot(n, k);
        if (root ** k === n) {
            return { root, power: k };
        }
    }

    return null;
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
        d /= 2n;
    }

    // Witness loop
    const witnesses = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

    for (let i = 0; i < Math.min(rounds, witnesses.length); i++) {
        const a = witnesses[i];
        if (a >= n) continue;

        let x = modPow(a, d, n);

        if (x === 1n || x === n - 1n) continue;

        let composite = true;
        for (let j = 0n; j < r - 1n; j++) {
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
```

### Binary Data Utilities

```javascript
// src/node/tools/common/binary-utils.mjs

/**
 * Native binary data utilities
 * Replaces: buffer-equal, safe-buffer
 */

/**
 * XOR two byte arrays
 */
export function xorBytes(a, b) {
    const length = Math.max(a.length, b.length);
    const result = new Uint8Array(length);

    for (let i = 0; i < length; i++) {
        const aVal = a[i % a.length] || 0;
        const bVal = b[i % b.length] || 0;
        result[i] = aVal ^ bVal;
    }

    return result;
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex) {
    hex = hex.replace(/\s/g, '');
    if (hex.length % 2 !== 0) {
        hex = '0' + hex;
    }

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }

    return bytes;
}

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes, separator = '') {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(separator);
}

/**
 * Pack integer to bytes (little-endian by default)
 */
export function packInt(value, byteLength, littleEndian = true) {
    const buffer = new ArrayBuffer(byteLength);
    const view = new DataView(buffer);

    if (byteLength === 1) {
        view.setUint8(0, Number(value) & 0xFF);
    } else if (byteLength === 2) {
        view.setUint16(0, Number(value) & 0xFFFF, littleEndian);
    } else if (byteLength === 4) {
        view.setUint32(0, Number(value) >>> 0, littleEndian);
    } else if (byteLength === 8) {
        view.setBigUint64(0, BigInt(value), littleEndian);
    }

    return new Uint8Array(buffer);
}

/**
 * Unpack bytes to integer
 */
export function unpackInt(bytes, littleEndian = true) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (bytes.length === 1) {
        return view.getUint8(0);
    } else if (bytes.length === 2) {
        return view.getUint16(0, littleEndian);
    } else if (bytes.length === 4) {
        return view.getUint32(0, littleEndian);
    } else if (bytes.length === 8) {
        return view.getBigUint64(0, littleEndian);
    }

    throw new Error(`Unsupported byte length: ${bytes.length}`);
}

/**
 * Calculate Shannon entropy
 */
export function calculateEntropy(data) {
    if (typeof data === 'string') {
        data = new TextEncoder().encode(data);
    }

    if (data.length === 0) return 0;

    const freq = new Map();
    for (const byte of data) {
        freq.set(byte, (freq.get(byte) || 0) + 1);
    }

    let entropy = 0;
    const len = data.length;

    for (const count of freq.values()) {
        const p = count / len;
        entropy -= p * Math.log2(p);
    }

    return entropy;
}

/**
 * Hamming distance between two byte arrays
 */
export function hammingDistance(a, b) {
    if (a.length !== b.length) {
        throw new Error('Arrays must have equal length');
    }

    let distance = 0;
    for (let i = 0; i < a.length; i++) {
        let xor = a[i] ^ b[i];
        while (xor) {
            distance += xor & 1;
            xor >>= 1;
        }
    }

    return distance;
}
```

### Encoding Utilities

```javascript
// src/node/tools/common/encoding-utils.mjs

/**
 * Native encoding utilities
 * Replaces: base64-js, js-base64
 */

/**
 * Base64 decode with multiple variant support
 */
export function base64Decode(input, variant = 'standard') {
    // Handle URL-safe variant
    if (variant === 'url') {
        input = input.replace(/-/g, '+').replace(/_/g, '/');
    }

    // Add padding if missing
    while (input.length % 4 !== 0) {
        input += '=';
    }

    return Buffer.from(input, 'base64');
}

/**
 * Base64 encode with variant support
 */
export function base64Encode(data, variant = 'standard', padding = true) {
    if (typeof data === 'string') {
        data = Buffer.from(data);
    }

    let result = data.toString('base64');

    if (!padding) {
        result = result.replace(/=+$/, '');
    }

    if (variant === 'url') {
        result = result.replace(/\+/g, '-').replace(/\//g, '_');
    }

    return result;
}

/**
 * Base32 decode
 */
export function base32Decode(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    input = input.toUpperCase().replace(/=+$/, '');

    const bits = [];
    for (const char of input) {
        const idx = alphabet.indexOf(char);
        if (idx === -1) continue;
        bits.push(...idx.toString(2).padStart(5, '0').split('').map(Number));
    }

    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    }

    return new Uint8Array(bytes);
}

/**
 * Base32 encode
 */
export function base32Encode(data) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    if (typeof data === 'string') {
        data = new TextEncoder().encode(data);
    }

    const bits = Array.from(data)
        .map(b => b.toString(2).padStart(8, '0'))
        .join('');

    let result = '';
    for (let i = 0; i < bits.length; i += 5) {
        const chunk = bits.slice(i, i + 5).padEnd(5, '0');
        result += alphabet[parseInt(chunk, 2)];
    }

    // Add padding
    while (result.length % 8 !== 0) {
        result += '=';
    }

    return result;
}

/**
 * ROT13 / ROT47 / general rotation cipher
 */
export function rotateString(input, shift, alphabet = null) {
    if (alphabet === null) {
        // Default to ROT13 on letters
        return input.replace(/[a-zA-Z]/g, (char) => {
            const base = char <= 'Z' ? 65 : 97;
            return String.fromCharCode(((char.charCodeAt(0) - base + shift) % 26) + base);
        });
    }

    return input.split('').map(char => {
        const idx = alphabet.indexOf(char);
        if (idx === -1) return char;
        return alphabet[(idx + shift) % alphabet.length];
    }).join('');
}
```

## Dependency Audit Process

### Adding New Dependencies

1. **Justify Need** - Document why native implementation is impractical
2. **Security Audit** - Check npm audit, Snyk, GitHub advisories
3. **License Review** - Ensure compatible license
4. **Size Analysis** - Bundle size impact
5. **Maintenance Check** - Last update, open issues, responsiveness
6. **Alternatives Review** - Compare similar packages
7. **Team Review** - Approval from maintainers

### Audit Checklist

```markdown
## Dependency Evaluation: [package-name]

### Basic Info
- Package:
- Version:
- License:
- Weekly Downloads:
- Last Update:

### Security
- [ ] No open CVEs
- [ ] No npm audit warnings
- [ ] Trusted maintainers
- [ ] Code review completed

### Necessity
- [ ] Native implementation considered
- [ ] Existing dependencies checked
- [ ] Functionality cannot be reasonably implemented

### Size Impact
- Unpacked size:
- Tree-shakeable: Yes/No
- Dependencies:

### Maintenance
- [ ] Active development (updates in last 6 months)
- [ ] Responsive to issues
- [ ] Good test coverage

### Decision
- [ ] APPROVED
- [ ] REJECTED (reason: )
- [ ] PENDING (requires: )

### Reviewer:
### Date:
```

### Regular Audits

Run these checks periodically:

```bash
# Security audit
npm audit

# Outdated packages
npm outdated

# License check (using license-checker)
npx license-checker --summary

# Bundle analysis
npx vite-bundle-visualizer

# Unused dependencies
npx depcheck
```

## Module Structure

### Common Utilities Organization

```
src/node/tools/
├── common/
│   ├── bigint-math.mjs      # BigInt utilities
│   ├── binary-utils.mjs     # Binary data handling
│   ├── encoding-utils.mjs   # Encoding/decoding
│   ├── string-utils.mjs     # String manipulation
│   ├── crypto-utils.mjs     # Crypto wrappers
│   └── index.mjs            # Re-exports
├── ciphey/
│   └── ... (imports from common/)
├── rsactftool/
│   └── ... (imports from common/)
└── ...
```

### Import Patterns

```javascript
// Prefer named imports from common utilities
import { gcd, modPow, isqrt } from '../common/bigint-math.mjs';
import { xorBytes, calculateEntropy } from '../common/binary-utils.mjs';

// Use existing CyberChef dependencies when available
import CryptoJS from 'crypto-js';
import { BigInteger } from 'jsbn';

// Never import entire lodash
// BAD: import _ from 'lodash';
// GOOD: implement needed function or use native
```

## Version Management

### Lockfile Policy

- Always commit `package-lock.json`
- Use exact versions for critical dependencies
- Review lockfile changes in PRs

### Update Strategy

| Category | Update Frequency | Testing Required |
|----------|------------------|------------------|
| Security patches | Immediate | Smoke tests |
| Bug fixes | Weekly | Unit tests |
| Minor versions | Monthly | Full test suite |
| Major versions | Quarterly | Full suite + manual |

### Automated Updates

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      dev-dependencies:
        patterns:
          - "vitest*"
          - "eslint*"
          - "@types/*"
    ignore:
      # Ignore major version updates for critical deps
      - dependency-name: "jsrsasign"
        update-types: ["version-update:semver-major"]
```

## Tree-Shaking Optimization

### Module Design for Tree-Shaking

```javascript
// GOOD: Named exports allow tree-shaking
export function gcd(a, b) { /* ... */ }
export function modPow(base, exp, mod) { /* ... */ }

// BAD: Default export of object prevents tree-shaking
export default {
    gcd,
    modPow
};
```

### ESM-Only Policy

All new tool modules must be ESM:

```javascript
// GOOD: ESM
import { something } from './module.mjs';
export function myFunction() { /* ... */ }

// BAD: CommonJS (do not use)
const { something } = require('./module');
module.exports = { myFunction };
```

## Bundling Considerations

### Side Effects Declaration

```json
{
  "sideEffects": [
    "src/node/tools/*/register.mjs"
  ]
}
```

### External Dependencies

For the MCP server bundle, these remain external:

```javascript
// vite.config.mjs
export default {
    build: {
        rollupOptions: {
            external: [
                '@modelcontextprotocol/sdk',
                'crypto',
                'fs',
                'path',
                'url'
            ]
        }
    }
};
```

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
