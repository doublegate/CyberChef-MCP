# Testing Strategy for External Tool Integrations

## Overview

This document defines the testing strategy for tools ported from external security projects. The approach ensures correctness, performance, and compatibility while maintaining the high code quality standards of CyberChef-MCP.

## Testing Philosophy

### Core Principles

1. **Reference Validation** - Test against original tool outputs
2. **Edge Case Coverage** - Handle boundary conditions and malformed input
3. **Performance Benchmarking** - Ensure acceptable latency for MCP tools
4. **Regression Prevention** - Maintain test vectors from original projects
5. **Integration Testing** - Verify MCP protocol compliance

### Test Categories

| Category | Purpose | Coverage Target |
|----------|---------|-----------------|
| Unit Tests | Individual function correctness | 90%+ |
| Integration Tests | Tool registration and execution | 100% |
| Reference Tests | Match original tool outputs | Critical paths |
| Performance Tests | Latency and throughput | Key operations |
| Fuzz Tests | Malformed input handling | High-risk tools |

## Unit Testing

### Test Structure

```
tests/
├── tools/
│   ├── ciphey/
│   │   ├── cipher-detector.test.mjs
│   │   ├── encoding-analyzer.test.mjs
│   │   ├── language-checker.test.mjs
│   │   └── fixtures/
│   │       ├── encodings.json
│   │       └── ciphers.json
│   ├── rsactftool/
│   │   ├── fermat.test.mjs
│   │   ├── wiener.test.mjs
│   │   ├── pollard-rho.test.mjs
│   │   └── fixtures/
│   │       └── rsa-test-vectors.json
│   ├── xortool/
│   │   ├── xor-analysis.test.mjs
│   │   ├── key-length.test.mjs
│   │   └── fixtures/
│   │       └── xor-samples.bin
│   ├── pwntools/
│   │   ├── binary-packer.test.mjs
│   │   ├── cyclic-pattern.test.mjs
│   │   └── fixtures/
│   │       └── pack-vectors.json
│   └── common/
│       ├── bigint-math.test.mjs
│       └── encoding-utils.test.mjs
├── integration/
│   ├── tool-registration.test.mjs
│   ├── mcp-protocol.test.mjs
│   └── tool-execution.test.mjs
└── performance/
    ├── rsa-attacks.bench.mjs
    ├── encoding-detection.bench.mjs
    └── xor-analysis.bench.mjs
```

### Unit Test Example

```javascript
// tests/tools/rsactftool/fermat.test.mjs
import { describe, it, expect, beforeEach } from 'vitest';
import { fermatFactor, isqrt, gcd } from '../../../src/node/tools/rsactftool/math.mjs';

describe('Fermat Factorization', () => {
    describe('basic factorization', () => {
        const testCases = [
            { n: 15n, expected: [3n, 5n], description: '3 * 5' },
            { n: 143n, expected: [11n, 13n], description: '11 * 13' },
            { n: 323n, expected: [17n, 19n], description: '17 * 19 (close primes)' },
            { n: 9n, expected: [3n, 3n], description: 'perfect square' },
        ];

        for (const tc of testCases) {
            it(`should factor ${tc.description}`, () => {
                const result = fermatFactor(tc.n);

                expect(result).not.toBeNull();
                expect(result[0] * result[1]).toBe(tc.n);

                // Factors should be in sorted order
                expect(result[0]).toBeLessThanOrEqual(result[1]);
            });
        }
    });

    describe('edge cases', () => {
        it('should return null for prime numbers', () => {
            const result = fermatFactor(17n, 1000);
            expect(result).toBeNull();
        });

        it('should handle even numbers', () => {
            const result = fermatFactor(100n);
            expect(result).not.toBeNull();
            expect(result[0] * result[1]).toBe(100n);
        });

        it('should respect iteration limit', () => {
            // Large semiprime with distant factors
            const n = 1073741789n * 2n;  // Would need many iterations
            const result = fermatFactor(n, 10);  // Very low limit
            // May return null or partial result
        });
    });

    describe('performance', () => {
        it('should factor close primes quickly', () => {
            const p = 104729n;  // Prime
            const q = 104743n;  // Next prime
            const n = p * q;

            const start = performance.now();
            const result = fermatFactor(n);
            const elapsed = performance.now() - start;

            expect(result).not.toBeNull();
            expect(elapsed).toBeLessThan(100);  // Should be fast for close primes
        });
    });
});

describe('BigInt Math Utilities', () => {
    describe('isqrt', () => {
        const testCases = [
            { input: 0n, expected: 0n },
            { input: 1n, expected: 1n },
            { input: 4n, expected: 2n },
            { input: 15n, expected: 3n },
            { input: 16n, expected: 4n },
            { input: 17n, expected: 4n },
            { input: 10000000000n, expected: 100000n },
        ];

        for (const tc of testCases) {
            it(`isqrt(${tc.input}) should be ${tc.expected}`, () => {
                expect(isqrt(tc.input)).toBe(tc.expected);
            });
        }

        it('should throw for negative numbers', () => {
            expect(() => isqrt(-1n)).toThrow('Square root of negative number');
        });
    });

    describe('gcd', () => {
        const testCases = [
            { a: 12n, b: 8n, expected: 4n },
            { a: 100n, b: 35n, expected: 5n },
            { a: 17n, b: 13n, expected: 1n },
            { a: 0n, b: 5n, expected: 5n },
        ];

        for (const tc of testCases) {
            it(`gcd(${tc.a}, ${tc.b}) should be ${tc.expected}`, () => {
                expect(gcd(tc.a, tc.b)).toBe(tc.expected);
            });
        }
    });
});
```

### Encoding Detection Test Example

```javascript
// tests/tools/ciphey/encoding-analyzer.test.mjs
import { describe, it, expect } from 'vitest';
import {
    EncodingAnalyzer,
    detectEncoding,
    calculateEntropy,
    analyzeByteDistribution
} from '../../../src/node/tools/ciphey/encoding-analyzer.mjs';

describe('EncodingAnalyzer', () => {
    describe('detectEncoding', () => {
        const testCases = [
            {
                input: 'SGVsbG8gV29ybGQ=',
                expected: 'base64',
                description: 'standard Base64'
            },
            {
                input: '48656c6c6f20576f726c64',
                expected: 'hex',
                description: 'lowercase hex'
            },
            {
                input: '48454C4C4F20574F524C44',
                expected: 'hex',
                description: 'uppercase hex'
            },
            {
                input: '01001000 01100101 01101100 01101100 01101111',
                expected: 'binary',
                description: 'space-separated binary'
            },
            {
                input: 'JBSWY3DPEHPK3PXP',
                expected: 'base32',
                description: 'Base32 encoding'
            },
            {
                input: 'Hello World',
                expected: 'plaintext',
                description: 'plaintext (no encoding)'
            },
        ];

        for (const tc of testCases) {
            it(`should detect ${tc.description}`, () => {
                const result = detectEncoding(tc.input);
                expect(result.encoding).toBe(tc.expected);
                expect(result.confidence).toBeGreaterThan(0.5);
            });
        }
    });

    describe('multi-layer encoding', () => {
        it('should detect Base64-encoded hex', async () => {
            const analyzer = new EncodingAnalyzer();
            // "Hello" -> hex -> base64
            const input = 'NDg2NTZjNmM2Zg==';  // base64(hex(Hello))

            const results = await analyzer.analyzeChain(input);

            expect(results.layers).toHaveLength(2);
            expect(results.layers[0].encoding).toBe('base64');
            expect(results.layers[1].encoding).toBe('hex');
            expect(results.decoded).toBe('Hello');
        });
    });

    describe('entropy calculation', () => {
        it('should return low entropy for repetitive data', () => {
            const repetitive = 'AAAAAAAAAAAAAAAA';
            const entropy = calculateEntropy(repetitive);
            expect(entropy).toBeLessThan(1);
        });

        it('should return high entropy for random data', () => {
            const random = 'aB3$kL9@mN2#pQ5&';
            const entropy = calculateEntropy(random);
            expect(entropy).toBeGreaterThan(3);
        });

        it('should return ~4.7 for English text', () => {
            const english = 'The quick brown fox jumps over the lazy dog';
            const entropy = calculateEntropy(english);
            expect(entropy).toBeGreaterThan(4);
            expect(entropy).toBeLessThan(5);
        });
    });
});
```

## Integration Testing

### Tool Registration Tests

```javascript
// tests/integration/tool-registration.test.mjs
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ToolRegistry } from '../../src/node/tools/registry.mjs';
import { loadExternalTools } from '../../src/node/tools/loader.mjs';

describe('Tool Registration', () => {
    let registry;

    beforeAll(async () => {
        registry = new ToolRegistry();
        await loadExternalTools(registry, {
            baseDir: 'src/node/tools'
        });
    });

    describe('tool discovery', () => {
        it('should register all expected tools', () => {
            const tools = registry.listAll();

            // Verify core external tools are registered
            const expectedTools = [
                'cyberchef_cipher_detect',
                'cyberchef_encoding_detect',
                'cyberchef_rsa_attack',
                'cyberchef_xor_analyze',
                'cyberchef_binary_pack',
                'cyberchef_cyclic_pattern',
            ];

            for (const toolName of expectedTools) {
                expect(tools.some(t => t.name === toolName)).toBe(true);
            }
        });

        it('should categorize tools correctly', () => {
            const cryptoTools = registry.getByCategory('crypto');
            const encodingTools = registry.getByCategory('encoding');

            expect(cryptoTools.some(t => t.name === 'cyberchef_rsa_attack')).toBe(true);
            expect(encodingTools.some(t => t.name === 'cyberchef_encoding_detect')).toBe(true);
        });
    });

    describe('tool schema validation', () => {
        it('should have valid input schemas', () => {
            const tools = registry.listAll();

            for (const tool of tools) {
                expect(tool.inputSchema).toBeDefined();
                expect(tool.inputSchema.type).toBe('object');
                expect(tool.inputSchema.properties).toBeDefined();
            }
        });

        it('should define required properties', () => {
            const rsaTool = registry.get('cyberchef_rsa_attack');

            expect(rsaTool.inputSchema.required).toContain('n');
            expect(rsaTool.inputSchema.required).toContain('e');
        });
    });
});
```

### MCP Protocol Tests

```javascript
// tests/integration/mcp-protocol.test.mjs
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPServer } from '../../src/node/mcp-server.mjs';

describe('MCP Protocol Compliance', () => {
    let server;
    let transport;

    beforeAll(async () => {
        server = new MCPServer();
        transport = new MockTransport();
        await server.connect(transport);
    });

    afterAll(async () => {
        await server.close();
    });

    describe('tools/list', () => {
        it('should return all registered tools', async () => {
            const response = await transport.sendRequest({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {}
            });

            expect(response.result.tools).toBeDefined();
            expect(Array.isArray(response.result.tools)).toBe(true);
            expect(response.result.tools.length).toBeGreaterThan(300);
        });

        it('should include external tools', async () => {
            const response = await transport.sendRequest({
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {}
            });

            const toolNames = response.result.tools.map(t => t.name);
            expect(toolNames).toContain('cyberchef_rsa_attack');
            expect(toolNames).toContain('cyberchef_cipher_detect');
        });
    });

    describe('tools/call', () => {
        it('should execute external tools', async () => {
            const response = await transport.sendRequest({
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: {
                    name: 'cyberchef_encoding_detect',
                    arguments: {
                        input: 'SGVsbG8gV29ybGQ='
                    }
                }
            });

            expect(response.result.content).toBeDefined();
            expect(response.result.content[0].type).toBe('text');
            expect(response.result.content[0].text).toContain('base64');
        });

        it('should handle tool errors gracefully', async () => {
            const response = await transport.sendRequest({
                jsonrpc: '2.0',
                id: 4,
                method: 'tools/call',
                params: {
                    name: 'cyberchef_rsa_attack',
                    arguments: {
                        n: 'not-a-number',  // Invalid input
                        e: 65537
                    }
                }
            });

            expect(response.result.isError).toBe(true);
            expect(response.result.content[0].text).toContain('error');
        });
    });
});
```

## Reference Testing

### Original Tool Comparison

```javascript
// tests/reference/rsactftool-reference.test.mjs
import { describe, it, expect } from 'vitest';
import { fermatFactor, wienerAttack, pollardRho } from '../../src/node/tools/rsactftool/attacks.mjs';
import referenceVectors from './fixtures/rsactftool-vectors.json' with { type: 'json' };

/**
 * Reference test vectors generated from original RsaCtfTool:
 * python3 RsaCtfTool.py --test-vectors --output rsactftool-vectors.json
 */
describe('RsaCtfTool Reference Validation', () => {
    describe('Fermat factorization', () => {
        for (const vector of referenceVectors.fermat) {
            it(`should match reference for n=${vector.n.substring(0, 20)}...`, () => {
                const n = BigInt(vector.n);
                const result = fermatFactor(n, vector.maxIterations);

                if (vector.expected.success) {
                    expect(result).not.toBeNull();
                    expect(result[0].toString()).toBe(vector.expected.p);
                    expect(result[1].toString()).toBe(vector.expected.q);
                } else {
                    expect(result).toBeNull();
                }
            });
        }
    });

    describe('Wiener attack', () => {
        for (const vector of referenceVectors.wiener) {
            it(`should recover d for e=${vector.e}`, () => {
                const result = wienerAttack(BigInt(vector.n), BigInt(vector.e));

                if (vector.expected.vulnerable) {
                    expect(result).not.toBeNull();
                    expect(result.d.toString()).toBe(vector.expected.d);
                } else {
                    expect(result).toBeNull();
                }
            });
        }
    });
});
```

### Fixture Generation Script

```javascript
// scripts/generate-reference-vectors.mjs
/**
 * Generate test vectors from reference implementations.
 * Run against original tools to capture expected outputs.
 */

import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Generate RSA test vectors
function generateRsaVectors() {
    const vectors = {
        fermat: [],
        wiener: [],
        pollardRho: []
    };

    // Known vulnerable keys from CTF challenges
    const testKeys = [
        { n: '143', e: '7' },  // Simple case
        { n: '90581', e: '17993' },  // Wiener vulnerable
        // Add more test cases
    ];

    for (const key of testKeys) {
        // Run original tool and capture output
        // This would be done offline against actual RsaCtfTool
    }

    return vectors;
}

// Write vectors
const vectors = generateRsaVectors();
writeFileSync(
    'tests/reference/fixtures/rsactftool-vectors.json',
    JSON.stringify(vectors, null, 2)
);
```

## Performance Testing

### Benchmark Setup

```javascript
// tests/performance/rsa-attacks.bench.mjs
import { bench, describe } from 'vitest';
import { fermatFactor, wienerAttack, pollardRho } from '../../src/node/tools/rsactftool/attacks.mjs';

describe('RSA Attack Performance', () => {
    // Small key (easy to factor)
    const smallN = 143n;
    const smallE = 7n;

    // Medium key (1024-bit with close primes)
    const mediumN = BigInt('0x' + 'f'.repeat(256));  // Placeholder
    const mediumE = 65537n;

    bench('fermat - small key', () => {
        fermatFactor(smallN);
    });

    bench('wiener - small key', () => {
        wienerAttack(smallN, smallE);
    });

    bench('pollard-rho - small key', () => {
        pollardRho(smallN);
    });

    bench('fermat - medium key (close primes)', () => {
        // Should be fast for close primes
        fermatFactor(mediumN, 10000);
    }, { timeout: 5000 });
});

describe('Encoding Detection Performance', () => {
    const shortInput = 'SGVsbG8=';  // 8 chars
    const mediumInput = 'A'.repeat(1000);
    const longInput = 'A'.repeat(100000);

    bench('detect - short input', async () => {
        await detectEncoding(shortInput);
    });

    bench('detect - medium input', async () => {
        await detectEncoding(mediumInput);
    });

    bench('detect - long input', async () => {
        await detectEncoding(longInput);
    }, { timeout: 1000 });
});
```

### Performance Requirements

| Tool Category | Max Latency (p99) | Throughput |
|---------------|-------------------|------------|
| Encoding Detection | 50ms | 100 req/s |
| Simple Crypto | 100ms | 50 req/s |
| RSA Attacks | 5000ms | 1 req/s |
| XOR Analysis | 1000ms | 10 req/s |
| Binary Packing | 10ms | 500 req/s |

## Fuzz Testing

### Input Fuzzing

```javascript
// tests/fuzz/encoding-fuzz.test.mjs
import { describe, it, expect } from 'vitest';
import { detectEncoding } from '../../src/node/tools/ciphey/encoding-analyzer.mjs';
import fc from 'fast-check';

describe('Encoding Detection Fuzzing', () => {
    it('should not crash on arbitrary strings', () => {
        fc.assert(
            fc.property(fc.string(), (input) => {
                // Should not throw
                const result = detectEncoding(input);

                // Should always return valid structure
                expect(result).toHaveProperty('encoding');
                expect(result).toHaveProperty('confidence');
                expect(result.confidence).toBeGreaterThanOrEqual(0);
                expect(result.confidence).toBeLessThanOrEqual(1);
            }),
            { numRuns: 1000 }
        );
    });

    it('should not crash on arbitrary bytes', () => {
        fc.assert(
            fc.property(fc.uint8Array(), (input) => {
                const str = Buffer.from(input).toString('latin1');
                const result = detectEncoding(str);

                expect(result).toHaveProperty('encoding');
            }),
            { numRuns: 1000 }
        );
    });

    it('should handle edge cases', () => {
        const edgeCases = [
            '',
            ' ',
            '\x00',
            '\x00'.repeat(1000),
            '\xff'.repeat(1000),
            'A'.repeat(1000000),  // Very long
            '\n\r\t',
            'null',
            'undefined',
            '{}',
            '[]',
        ];

        for (const input of edgeCases) {
            expect(() => detectEncoding(input)).not.toThrow();
        }
    });
});
```

### Property-Based Testing

```javascript
// tests/fuzz/binary-packer-properties.test.mjs
import { describe, it, expect } from 'vitest';
import { pack, unpack } from '../../src/node/tools/pwntools/binary-packer.mjs';
import fc from 'fast-check';

describe('Binary Packer Properties', () => {
    describe('pack/unpack roundtrip', () => {
        it('should roundtrip 32-bit values', () => {
            fc.assert(
                fc.property(fc.nat(0xFFFFFFFF), (value) => {
                    const packed = pack(value, 32, 'little');
                    const unpacked = unpack(packed, 32, 'little');
                    return unpacked === value;
                }),
                { numRuns: 10000 }
            );
        });

        it('should roundtrip 64-bit values', () => {
            fc.assert(
                fc.property(fc.bigUint(BigInt('0xFFFFFFFFFFFFFFFF')), (value) => {
                    const packed = pack(value, 64, 'little');
                    const unpacked = unpack(packed, 64, 'little');
                    return unpacked === value;
                }),
                { numRuns: 10000 }
            );
        });
    });

    describe('endianness', () => {
        it('little and big endian should produce different results for multi-byte values', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 256, max: 0xFFFFFFFF }),
                    (value) => {
                        const little = pack(value, 32, 'little');
                        const big = pack(value, 32, 'big');

                        // Should be reversed
                        for (let i = 0; i < 4; i++) {
                            if (little[i] !== big[3 - i]) {
                                return true;  // Different as expected
                            }
                        }
                        return false;
                    }
                ),
                { numRuns: 1000 }
            );
        });
    });
});
```

## Continuous Integration

### Test Workflow

```yaml
# .github/workflows/external-tools-ci.yml
name: External Tools CI

on:
  push:
    paths:
      - 'src/node/tools/**'
      - 'tests/tools/**'
  pull_request:
    paths:
      - 'src/node/tools/**'
      - 'tests/tools/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - run: npm ci

      - name: Run unit tests
        run: npm run test:tools

      - name: Run integration tests
        run: npm run test:integration

      - name: Run reference tests
        run: npm run test:reference

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: coverage/lcov.info
          flags: external-tools

  benchmark:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - run: npm ci

      - name: Run benchmarks
        run: npm run bench:tools

      - name: Check performance regression
        run: |
          # Compare against baseline
          node scripts/check-perf-regression.mjs
```

### Coverage Requirements

| Module | Line Coverage | Branch Coverage | Function Coverage |
|--------|---------------|-----------------|-------------------|
| RSA Attacks | 90% | 85% | 95% |
| Encoding Detection | 90% | 85% | 95% |
| XOR Analysis | 85% | 80% | 90% |
| Binary Packing | 95% | 90% | 100% |
| Cipher Detection | 85% | 80% | 90% |

## Test Data Management

### Fixture Organization

```
tests/
└── fixtures/
    ├── encodings/
    │   ├── base64-samples.json
    │   ├── hex-samples.json
    │   └── multi-layer.json
    ├── ciphers/
    │   ├── caesar-samples.json
    │   ├── vigenere-samples.json
    │   └── xor-samples.bin
    ├── rsa/
    │   ├── vulnerable-keys.json
    │   ├── ctf-challenges.json
    │   └── reference-vectors.json
    └── binary/
        ├── elf-headers.bin
        ├── pe-headers.bin
        └── pack-vectors.json
```

### Fixture Generation

```javascript
// scripts/generate-test-fixtures.mjs
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Generate test fixtures for encoding detection
 */
function generateEncodingFixtures() {
    const fixtures = {
        base64: [
            { input: 'SGVsbG8=', decoded: 'Hello', variant: 'standard' },
            { input: 'SGVsbG8', decoded: 'Hello', variant: 'no-padding' },
            { input: 'SGVsbG8_', decoded: 'Hello', variant: 'url-safe' },
        ],
        hex: [
            { input: '48656c6c6f', decoded: 'Hello', variant: 'lowercase' },
            { input: '48454C4C4F', decoded: 'HELLO', variant: 'uppercase' },
            { input: '48 65 6c 6c 6f', decoded: 'Hello', variant: 'spaced' },
        ],
        // More encodings...
    };

    return fixtures;
}

/**
 * Generate RSA test vectors
 */
function generateRsaFixtures() {
    // Pre-computed vulnerable RSA keys
    const vulnerableKeys = [
        {
            description: 'Fermat - very close primes',
            n: '323',  // 17 * 19
            e: '5',
            p: '17',
            q: '19',
            d: '173',
            vulnerable_to: ['fermat']
        },
        {
            description: 'Wiener - small d',
            n: '90581',
            e: '17993',
            p: '379',
            q: '239',
            d: '5',
            vulnerable_to: ['wiener']
        },
        // More test cases...
    ];

    return { vulnerableKeys };
}

// Generate and write fixtures
const fixtureDir = 'tests/fixtures';
mkdirSync(join(fixtureDir, 'encodings'), { recursive: true });
mkdirSync(join(fixtureDir, 'rsa'), { recursive: true });

writeFileSync(
    join(fixtureDir, 'encodings', 'all-encodings.json'),
    JSON.stringify(generateEncodingFixtures(), null, 2)
);

writeFileSync(
    join(fixtureDir, 'rsa', 'vulnerable-keys.json'),
    JSON.stringify(generateRsaFixtures(), null, 2)
);
```

## Debugging Test Failures

### Common Issues

| Issue | Symptoms | Resolution |
|-------|----------|------------|
| BigInt comparison | `123n !== 123` | Use `BigInt()` conversion or `===` |
| Floating point | `0.1 + 0.2 !== 0.3` | Use `toBeCloseTo()` |
| Async timing | Flaky test results | Add proper `await`, increase timeout |
| Fixture loading | `undefined` errors | Check JSON import syntax |

### Debug Utilities

```javascript
// tests/utils/debug.mjs

/**
 * Pretty-print BigInt values
 */
export function formatBigInt(n) {
    const hex = n.toString(16);
    if (hex.length > 20) {
        return `0x${hex.substring(0, 10)}...${hex.substring(hex.length - 10)} (${hex.length * 4} bits)`;
    }
    return `0x${hex}`;
}

/**
 * Compare byte arrays with detailed diff
 */
export function compareBytes(expected, actual) {
    const diffs = [];
    const maxLen = Math.max(expected.length, actual.length);

    for (let i = 0; i < maxLen; i++) {
        const e = expected[i];
        const a = actual[i];

        if (e !== a) {
            diffs.push({
                offset: i,
                expected: e !== undefined ? `0x${e.toString(16).padStart(2, '0')}` : 'missing',
                actual: a !== undefined ? `0x${a.toString(16).padStart(2, '0')}` : 'missing'
            });
        }
    }

    return diffs;
}

/**
 * Generate test report
 */
export function generateTestReport(results) {
    return {
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        failures: results.filter(r => !r.passed).map(r => ({
            name: r.name,
            error: r.error?.message,
            stack: r.error?.stack
        }))
    };
}
```

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
