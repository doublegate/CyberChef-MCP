# xortool Integration Plan

## Overview

| Attribute | Value |
|-----------|-------|
| Project | xortool |
| Integration Phase | 3 (Sprint 3.1) |
| Priority | High |
| Complexity | Medium |
| New Tools | 4-5 |

## Source Project Analysis

### Project Information
- **Repository**: https://github.com/hellman/xortool
- **Language**: Python 3
- **License**: MIT
- **Purpose**: XOR cipher analysis and key recovery

### Key Algorithms

1. **Key Length Detection** - Uses character frequency analysis at regular intervals
2. **Key Recovery** - Statistical analysis to determine most likely key bytes
3. **Decryption** - XOR decryption with recovered key

## Components to Port

### 1. Key Length Detection

The core algorithm analyzes character frequencies at positions `i, i+keyLen, i+2*keyLen, ...` for each potential key length.

**Original Algorithm (Python)**:
```python
def calculate_fitnesses(data, max_key_length):
    """Calculate fitness scores for each potential key length"""
    fitnesses = []
    for key_length in range(1, max_key_length + 1):
        fitness = 0
        for offset in range(key_length):
            # Count characters at this offset for this key length
            chars = chars_count_at_offset(data, key_length, offset)
            # More repetition = higher fitness
            fitness += sum(count * count for count in chars.values())

        # Normalize by key length to penalize longer keys
        fitness /= key_length
        fitnesses.append((key_length, fitness))

    return sorted(fitnesses, key=lambda x: -x[1])
```

### 2. Key Recovery

For each byte position in the key, find the most likely value based on expected character frequency.

**Original Algorithm (Python)**:
```python
def guess_key(data, key_length, most_frequent_char=0x00):
    """Guess key bytes assuming most frequent plaintext character"""
    key = []
    for offset in range(key_length):
        chars = chars_count_at_offset(data, key_length, offset)
        # Most frequent ciphertext byte
        most_common = max(chars, key=chars.get)
        # Key byte = most_common XOR expected_most_frequent
        key_byte = most_common ^ most_frequent_char
        key.append(key_byte)
    return bytes(key)
```

### 3. Multiple Key Candidates

The tool generates multiple candidate keys when byte frequencies are ambiguous.

## New MCP Tools

### Primary Tools

```javascript
// cyberchef_xor_key_length
{
    name: 'cyberchef_xor_key_length',
    description: 'Detect probable XOR key length using frequency analysis',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            input: { type: 'string', description: 'XOR-encrypted data (hex or raw)' },
            maxKeyLength: { type: 'number', default: 65, description: 'Maximum key length to check' },
            format: { type: 'string', enum: ['hex', 'raw', 'base64'], default: 'hex' }
        },
        required: ['input']
    }
}

// cyberchef_xor_key_recover
{
    name: 'cyberchef_xor_key_recover',
    description: 'Recover XOR key given key length and expected plaintext characteristics',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            input: { type: 'string', description: 'XOR-encrypted data' },
            keyLength: { type: 'number', description: 'Known or detected key length' },
            mostFrequent: { type: 'number', default: 32, description: 'Expected most frequent byte (32=space, 0=null)' },
            format: { type: 'string', enum: ['hex', 'raw', 'base64'], default: 'hex' }
        },
        required: ['input', 'keyLength']
    }
}

// cyberchef_xor_analyze
{
    name: 'cyberchef_xor_analyze',
    description: 'Complete XOR analysis: detect key length, recover key, and decrypt',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            input: { type: 'string', description: 'XOR-encrypted data' },
            maxKeyLength: { type: 'number', default: 65 },
            mostFrequent: { type: 'number', default: 32 },
            format: { type: 'string', enum: ['hex', 'raw', 'base64'], default: 'hex' },
            candidates: { type: 'number', default: 3, description: 'Number of key candidates to return' }
        },
        required: ['input']
    }
}

// cyberchef_xor_decrypt
{
    name: 'cyberchef_xor_decrypt',
    description: 'Decrypt XOR-encrypted data with known key',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            input: { type: 'string', description: 'XOR-encrypted data' },
            key: { type: 'string', description: 'XOR key (hex or ASCII)' },
            inputFormat: { type: 'string', enum: ['hex', 'raw', 'base64'], default: 'hex' },
            keyFormat: { type: 'string', enum: ['hex', 'ascii'], default: 'ascii' }
        },
        required: ['input', 'key']
    }
}
```

## Implementation Architecture

### Core Class: XORKeyLengthDetector

```javascript
// src/node/tools/crypto/xor-analysis.mjs

/**
 * XOR key length detection using frequency analysis
 * Ported from xortool
 */

export class XORKeyLengthDetector {
    constructor(options = {}) {
        this.maxKeyLength = options.maxKeyLength || 65;
    }

    /**
     * Detect probable key lengths
     * @param {Uint8Array} data - Encrypted data
     * @returns {Array<{keyLength: number, fitness: number}>}
     */
    detectKeyLength(data) {
        const fitnesses = this.calculateFitnesses(data);
        return this.rankKeyLengths(fitnesses);
    }

    /**
     * Calculate fitness scores for all key lengths
     */
    calculateFitnesses(data) {
        const fitnesses = [];
        const maxLen = Math.min(this.maxKeyLength, Math.floor(data.length / 2));

        for (let keyLength = 1; keyLength <= maxLen; keyLength++) {
            let fitness = 0;

            for (let offset = 0; offset < keyLength; offset++) {
                const charCounts = this.charsCountAtOffset(data, keyLength, offset);
                // Sum of squares of frequencies (Index of Coincidence principle)
                for (const count of charCounts.values()) {
                    fitness += count * count;
                }
            }

            // Normalize: penalize longer key lengths
            // Using xortool's formula: fitness / (maxKeyLength + keyLength^1.5)
            const normalizedFitness = fitness / (this.maxKeyLength + Math.pow(keyLength, 1.5));
            fitnesses.push({ keyLength, fitness: normalizedFitness, rawFitness: fitness });
        }

        return fitnesses;
    }

    /**
     * Count character occurrences at specific offset for given key length
     */
    charsCountAtOffset(data, keyLength, offset) {
        const counts = new Map();

        for (let i = offset; i < data.length; i += keyLength) {
            const byte = data[i];
            counts.set(byte, (counts.get(byte) || 0) + 1);
        }

        return counts;
    }

    /**
     * Rank key lengths by fitness
     */
    rankKeyLengths(fitnesses) {
        return fitnesses
            .sort((a, b) => b.fitness - a.fitness)
            .slice(0, 10)
            .map(f => ({
                keyLength: f.keyLength,
                fitness: Math.round(f.fitness * 1000) / 1000,
                confidence: this.fitnessToConfidence(f.fitness, fitnesses[0].fitness)
            }));
    }

    /**
     * Convert fitness to confidence percentage
     */
    fitnessToConfidence(fitness, maxFitness) {
        if (maxFitness === 0) return 0;
        return Math.round((fitness / maxFitness) * 100);
    }
}
```

### Core Class: XORKeyRecovery

```javascript
// src/node/tools/crypto/xor-key-recovery.mjs

/**
 * XOR key recovery using frequency analysis
 * Ported from xortool
 */

export class XORKeyRecovery {
    constructor(options = {}) {
        this.mostFrequentChar = options.mostFrequentChar ?? 0x20; // Space by default
    }

    /**
     * Recover XOR key given key length
     * @param {Uint8Array} data - Encrypted data
     * @param {number} keyLength - Known key length
     * @returns {Array<{key: Uint8Array, confidence: number}>}
     */
    recoverKey(data, keyLength) {
        const keyBytes = [];
        const alternatives = [];

        for (let offset = 0; offset < keyLength; offset++) {
            const result = this.guessKeyByteAtOffset(data, keyLength, offset);
            keyBytes.push(result.bestByte);
            alternatives.push(result.alternatives);
        }

        // Generate primary key
        const primaryKey = new Uint8Array(keyBytes);

        // Generate alternative keys using Cartesian product of alternatives
        const candidateKeys = this.generateCandidateKeys(alternatives, 5);

        return candidateKeys.map((keyArray, index) => ({
            key: new Uint8Array(keyArray),
            confidence: this.calculateKeyConfidence(keyArray, data, keyLength),
            isPrimary: index === 0
        }));
    }

    /**
     * Guess the key byte at a specific offset
     */
    guessKeyByteAtOffset(data, keyLength, offset) {
        const counts = new Map();

        // Count byte frequencies at this offset
        for (let i = offset; i < data.length; i += keyLength) {
            const byte = data[i];
            counts.set(byte, (counts.get(byte) || 0) + 1);
        }

        // Sort by frequency
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

        // Calculate key bytes for top candidates
        const alternatives = sorted.slice(0, 3).map(([byte, count]) => ({
            keyByte: byte ^ this.mostFrequentChar,
            frequency: count,
            ciphertextByte: byte
        }));

        return {
            bestByte: alternatives[0]?.keyByte ?? 0,
            alternatives: alternatives.map(a => a.keyByte)
        };
    }

    /**
     * Generate candidate keys from alternatives
     */
    generateCandidateKeys(alternatives, maxKeys) {
        // Start with primary key (all best bytes)
        const keys = [alternatives.map(a => a[0])];

        // Add variations by swapping one byte at a time
        for (let pos = 0; pos < alternatives.length && keys.length < maxKeys; pos++) {
            for (let alt = 1; alt < alternatives[pos].length && keys.length < maxKeys; alt++) {
                const newKey = alternatives.map(a => a[0]);
                newKey[pos] = alternatives[pos][alt];
                keys.push(newKey);
            }
        }

        return keys;
    }

    /**
     * Calculate confidence score for a key
     */
    calculateKeyConfidence(keyArray, data, keyLength) {
        // Decrypt sample and analyze printability
        const decrypted = this.decrypt(data, keyArray);
        const printable = decrypted.filter(b => b >= 0x20 && b <= 0x7e).length;
        return Math.round((printable / decrypted.length) * 100);
    }

    /**
     * Decrypt data with key
     */
    decrypt(data, key) {
        const result = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
            result[i] = data[i] ^ key[i % key.length];
        }
        return result;
    }
}
```

### Complete XOR Analyzer

```javascript
// src/node/tools/crypto/xor-analyzer.mjs

import { XORKeyLengthDetector } from './xor-key-length.mjs';
import { XORKeyRecovery } from './xor-key-recovery.mjs';

/**
 * Complete XOR analysis combining detection and recovery
 */

export class XORAnalyzer {
    constructor(options = {}) {
        this.lengthDetector = new XORKeyLengthDetector(options);
        this.keyRecovery = new XORKeyRecovery(options);
    }

    /**
     * Full XOR analysis
     * @param {Uint8Array} data - Encrypted data
     * @param {object} options - Analysis options
     * @returns {object} Analysis results
     */
    analyze(data, options = {}) {
        const candidates = options.candidates || 3;

        // Detect key lengths
        const keyLengths = this.lengthDetector.detectKeyLength(data);

        if (keyLengths.length === 0) {
            return { success: false, reason: 'Could not detect key length' };
        }

        // Try top key lengths
        const results = [];

        for (const kl of keyLengths.slice(0, candidates)) {
            const keys = this.keyRecovery.recoverKey(data, kl.keyLength);

            for (const keyResult of keys.slice(0, 2)) {
                const decrypted = this.keyRecovery.decrypt(data, keyResult.key);

                results.push({
                    keyLength: kl.keyLength,
                    keyLengthConfidence: kl.confidence,
                    key: this.formatKey(keyResult.key),
                    keyHex: this.toHex(keyResult.key),
                    decryptedSample: this.toReadable(decrypted.slice(0, 200)),
                    printableRatio: this.calculatePrintableRatio(decrypted),
                    confidence: keyResult.confidence
                });
            }
        }

        // Sort by overall confidence
        results.sort((a, b) => {
            const scoreA = a.keyLengthConfidence * 0.4 + a.printableRatio * 0.6;
            const scoreB = b.keyLengthConfidence * 0.4 + b.printableRatio * 0.6;
            return scoreB - scoreA;
        });

        return {
            success: true,
            bestResult: results[0],
            alternatives: results.slice(1, candidates),
            keyLengthAnalysis: keyLengths.slice(0, 5)
        };
    }

    /**
     * Format key as readable string
     */
    formatKey(key) {
        const chars = [];
        for (const byte of key) {
            if (byte >= 0x20 && byte <= 0x7e) {
                chars.push(String.fromCharCode(byte));
            } else {
                chars.push(`\\x${byte.toString(16).padStart(2, '0')}`);
            }
        }
        return chars.join('');
    }

    /**
     * Convert to hex string
     */
    toHex(data) {
        return Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Convert to readable string
     */
    toReadable(data) {
        return Array.from(data).map(b => {
            if (b >= 0x20 && b <= 0x7e) return String.fromCharCode(b);
            if (b === 0x0a) return '\n';
            if (b === 0x0d) return '';
            return '.';
        }).join('');
    }

    /**
     * Calculate ratio of printable characters
     */
    calculatePrintableRatio(data) {
        const printable = data.filter(b => b >= 0x20 && b <= 0x7e || b === 0x0a || b === 0x0d).length;
        return Math.round((printable / data.length) * 100);
    }
}
```

### MCP Tool Implementation

```javascript
// src/node/tools/crypto/xor-tools.mjs

import { BaseTool } from '../base-tool.mjs';
import { XORAnalyzer } from './xor-analyzer.mjs';

export class XORAnalyzeTool extends BaseTool {
    constructor() {
        super({
            name: 'cyberchef_xor_analyze',
            description: 'Complete XOR cipher analysis: detect key length, recover key, and decrypt',
            category: 'crypto',
            inputSchema: {
                type: 'object',
                properties: {
                    input: { type: 'string', description: 'XOR-encrypted data' },
                    maxKeyLength: { type: 'number', default: 65 },
                    mostFrequent: { type: 'number', default: 32 },
                    format: { type: 'string', enum: ['hex', 'raw', 'base64'], default: 'hex' },
                    candidates: { type: 'number', default: 3 }
                },
                required: ['input']
            }
        });

        this.analyzer = new XORAnalyzer();
    }

    async execute(args) {
        const startTime = Date.now();

        try {
            // Parse input based on format
            const data = this.parseInput(args.input, args.format || 'hex');

            // Run analysis
            const result = this.analyzer.analyze(data, {
                maxKeyLength: args.maxKeyLength,
                mostFrequentChar: args.mostFrequent,
                candidates: args.candidates
            });

            return this.formatResult(result, {
                executionTime: Date.now() - startTime,
                inputLength: data.length
            });
        } catch (error) {
            return this.formatError(error);
        }
    }

    parseInput(input, format) {
        switch (format) {
            case 'hex':
                const hex = input.replace(/\s/g, '');
                const bytes = new Uint8Array(hex.length / 2);
                for (let i = 0; i < bytes.length; i++) {
                    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
                }
                return bytes;
            case 'base64':
                const binary = atob(input);
                return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
            case 'raw':
            default:
                return new TextEncoder().encode(input);
        }
    }
}
```

## Testing Strategy

### Unit Tests

```javascript
// tests/tools/crypto/xor-analysis.test.mjs
import { describe, it, expect } from 'vitest';
import { XORKeyLengthDetector } from '../../../src/node/tools/crypto/xor-analysis.mjs';
import { XORKeyRecovery } from '../../../src/node/tools/crypto/xor-key-recovery.mjs';
import { XORAnalyzer } from '../../../src/node/tools/crypto/xor-analyzer.mjs';

describe('XORKeyLengthDetector', () => {
    const detector = new XORKeyLengthDetector();

    it('should detect single-byte key', () => {
        // "Hello World" XORed with 0x42
        const plaintext = new TextEncoder().encode('Hello World');
        const encrypted = plaintext.map(b => b ^ 0x42);
        const result = detector.detectKeyLength(new Uint8Array(encrypted));
        expect(result[0].keyLength).toBe(1);
    });

    it('should detect multi-byte key length', () => {
        const plaintext = new TextEncoder().encode('The quick brown fox jumps over the lazy dog'.repeat(5));
        const key = new TextEncoder().encode('SECRET');
        const encrypted = plaintext.map((b, i) => b ^ key[i % key.length]);
        const result = detector.detectKeyLength(new Uint8Array(encrypted));
        expect(result[0].keyLength).toBe(6);
    });
});

describe('XORKeyRecovery', () => {
    const recovery = new XORKeyRecovery({ mostFrequentChar: 0x20 });

    it('should recover single-byte key', () => {
        const plaintext = new TextEncoder().encode('The quick brown fox jumps over the lazy dog');
        const key = 0x42;
        const encrypted = new Uint8Array(plaintext.map(b => b ^ key));
        const result = recovery.recoverKey(encrypted, 1);
        expect(result[0].key[0]).toBe(key);
    });

    it('should recover multi-byte key', () => {
        const plaintext = 'The quick brown fox jumps over the lazy dog'.repeat(5);
        const key = 'KEY';
        const encrypted = new Uint8Array([...plaintext].map((c, i) =>
            c.charCodeAt(0) ^ key.charCodeAt(i % key.length)
        ));
        const result = recovery.recoverKey(encrypted, 3);
        const recoveredKey = String.fromCharCode(...result[0].key);
        expect(recoveredKey).toBe('KEY');
    });
});

describe('XORAnalyzer', () => {
    const analyzer = new XORAnalyzer();

    it('should fully analyze XOR-encrypted text', () => {
        const plaintext = 'The quick brown fox jumps over the lazy dog '.repeat(10);
        const key = 'CYBERCHEF';
        const encrypted = new Uint8Array([...plaintext].map((c, i) =>
            c.charCodeAt(0) ^ key.charCodeAt(i % key.length)
        ));

        const result = analyzer.analyze(encrypted);
        expect(result.success).toBe(true);
        expect(result.bestResult.keyLength).toBe(9);
        expect(result.bestResult.key).toBe('CYBERCHEF');
    });
});
```

## Integration Tests

```javascript
// tests/tools/crypto/xor-integration.test.mjs
import { describe, it, expect } from 'vitest';
import { callTool } from '../../helpers/mcp-client.mjs';

describe('XOR Tools MCP Integration', () => {
    it('should analyze XOR via MCP', async () => {
        // "Hello World" XORed with "KEY", hex encoded
        const encrypted = '030e090909004c0e070905';
        const result = await callTool('cyberchef_xor_analyze', {
            input: encrypted,
            format: 'hex'
        });
        expect(result.success).toBe(true);
        expect(result.output.bestResult.keyLength).toBe(3);
    });

    it('should detect key length via MCP', async () => {
        const result = await callTool('cyberchef_xor_key_length', {
            input: '030e090909004c0e070905',
            format: 'hex'
        });
        expect(result.success).toBe(true);
        expect(result.output.length).toBeGreaterThan(0);
    });
});
```

## Performance Considerations

### Time Complexity
- Key length detection: O(maxKeyLength * dataLength)
- Key recovery: O(keyLength * dataLength)
- Overall: O(maxKeyLength * dataLength)

### Memory Usage
- Frequency maps: O(256 * keyLength) per key length
- Candidate keys: O(keyLength * candidates)

### Optimization Strategies
1. Early termination when high confidence achieved
2. Limit max key length based on data size
3. Cache frequency calculations

## Dependencies

No additional npm packages required.

## Success Metrics

1. Correctly detect key length for 95%+ of repeating-key XOR ciphers
2. Recover correct key for 90%+ of English plaintext cases
3. Analysis complete in < 1 second for typical inputs (< 10KB)
4. Memory usage < 50MB for large inputs

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Phase:** 3 (Sprint 3.1)
