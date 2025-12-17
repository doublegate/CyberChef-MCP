# Ciphey/Ares Integration Plan

## Overview

| Attribute | Value |
|-----------|-------|
| Project | Ciphey (Python) / Ares (Rust) |
| Integration Phase | 3 (Sprints 3.2, 3.3) |
| Priority | High |
| Complexity | High |
| New Tools | 8-12 |

## Source Project Analysis

### Ciphey (Python - Original)
- **Repository**: https://github.com/Ciphey/Ciphey
- **Language**: Python 3.7+
- **Key Feature**: AI-powered automatic decryption using AuSearch algorithm
- **Components**: Decoders, Checkers, Search algorithms

### Ares (Rust - Successor)
- **Repository**: https://github.com/ciphey/ares
- **Language**: Rust
- **Performance**: 700% faster than Python Ciphey
- **Key Feature**: A* search with heuristics, parallel processing

## Components to Port

### 1. Decoders (22 in Ares)

| Decoder | Priority | Complexity | Notes |
|---------|----------|------------|-------|
| Base64 | Skip | - | Already in CyberChef |
| Base32 | Skip | - | Already in CyberChef |
| Base58 | Skip | - | Already in CyberChef |
| Base85 | Skip | - | Already in CyberChef |
| Hexadecimal | Skip | - | Already in CyberChef |
| Binary | Skip | - | Already in CyberChef |
| Caesar | High | Low | Implement auto-rotation |
| ROT47 | Skip | - | Already in CyberChef |
| Vigenere | High | Medium | Key guessing logic |
| Atbash | Skip | - | Already in CyberChef |
| Morse | Skip | - | Already in CyberChef |
| URL Decode | Skip | - | Already in CyberChef |
| Reverse | Skip | - | Already in CyberChef |
| Unicode | Medium | Low | Zero-width detection |
| Railfence | Medium | Low | Auto-rail detection |
| Soundex | Low | Medium | Phonetic encoding |
| Citrix CTX1 | Low | Low | Specific format |

### 2. Checkers (Plaintext Detection)

| Checker | Priority | Complexity | Notes |
|---------|----------|------------|-------|
| English (n-gram) | High | Medium | Statistical language detection |
| LemmeKnow | Medium | Medium | Pattern matching (regex) |
| Regex Filter | High | Low | User-defined patterns |
| JSON | Medium | Low | Valid JSON detection |
| Human | Skip | - | Interactive, not for MCP |

### 3. Search Algorithms

| Algorithm | Priority | Notes |
|-----------|----------|-------|
| A* (AuSearch) | High | Primary search algorithm |
| BFS | Medium | Fallback algorithm |

## New MCP Tools

### Primary Tools

```javascript
// cyberchef_auto_decode
{
    name: 'cyberchef_auto_decode',
    description: 'Automatically detect and decode multiple encoding layers using A* search',
    category: 'auto',
    inputSchema: {
        type: 'object',
        properties: {
            input: { type: 'string', description: 'Encoded data to decode' },
            maxDepth: { type: 'number', default: 10, description: 'Maximum decode iterations' },
            timeout: { type: 'number', default: 5000, description: 'Timeout in ms' }
        },
        required: ['input']
    }
}

// cyberchef_auto_detect
{
    name: 'cyberchef_auto_detect',
    description: 'Detect encoding type without decoding',
    category: 'auto',
    inputSchema: {
        type: 'object',
        properties: {
            input: { type: 'string', description: 'Data to analyze' }
        },
        required: ['input']
    }
}

// cyberchef_plaintext_check
{
    name: 'cyberchef_plaintext_check',
    description: 'Check if text appears to be valid plaintext (English)',
    category: 'auto',
    inputSchema: {
        type: 'object',
        properties: {
            input: { type: 'string', description: 'Text to check' },
            language: { type: 'string', default: 'english', description: 'Target language' }
        },
        required: ['input']
    }
}
```

### Decoder Tools

```javascript
// cyberchef_caesar_auto
{
    name: 'cyberchef_caesar_auto',
    description: 'Automatically find correct Caesar cipher rotation',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            input: { type: 'string', description: 'Caesar-encrypted text' }
        },
        required: ['input']
    }
}

// cyberchef_vigenere_auto
{
    name: 'cyberchef_vigenere_auto',
    description: 'Attempt to break Vigenere cipher using common key patterns',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            input: { type: 'string', description: 'Vigenere-encrypted text' },
            maxKeyLength: { type: 'number', default: 20, description: 'Maximum key length to try' }
        },
        required: ['input']
    }
}
```

## Implementation Architecture

### Core Classes

```javascript
// src/node/tools/auto/ausearch.mjs

/**
 * A* Search implementation for automatic decoding
 * Ported from Ciphey/Ares AuSearch algorithm
 */

import { PriorityQueue } from '../utils/priority-queue.mjs';
import { PlaintextChecker } from './plaintext-checker.mjs';
import { DecoderRegistry } from './decoder-registry.mjs';

export class AuSearch {
    constructor(options = {}) {
        this.maxDepth = options.maxDepth || 10;
        this.timeout = options.timeout || 5000;
        this.checker = new PlaintextChecker();
        this.decoders = new DecoderRegistry();
    }

    /**
     * Attempt to automatically decode input
     * @param {string} input - Encoded data
     * @returns {Promise<DecodePath>} Decode path if successful
     */
    async crack(input) {
        const startTime = Date.now();
        const queue = new PriorityQueue();
        const visited = new Set();

        // Initial state
        queue.push({
            data: input,
            path: [],
            score: this.heuristic(input)
        }, 0);

        while (!queue.isEmpty()) {
            // Timeout check
            if (Date.now() - startTime > this.timeout) {
                return {
                    success: false,
                    reason: 'timeout',
                    partialPath: queue.peek()?.path || []
                };
            }

            const current = queue.pop();

            // Skip if visited
            const hash = this.hash(current.data);
            if (visited.has(hash)) continue;
            visited.add(hash);

            // Check if plaintext
            const checkResult = this.checker.check(current.data);
            if (checkResult.isPlaintext) {
                return {
                    success: true,
                    plaintext: current.data,
                    path: current.path,
                    confidence: checkResult.confidence
                };
            }

            // Depth limit
            if (current.path.length >= this.maxDepth) continue;

            // Try all decoders
            for (const decoder of this.decoders.getAll()) {
                if (!decoder.couldDecode(current.data)) continue;

                try {
                    const decoded = decoder.decode(current.data);
                    if (decoded && decoded !== current.data) {
                        const score = this.heuristic(decoded);
                        queue.push({
                            data: decoded,
                            path: [...current.path, decoder.name],
                            score: score
                        }, decoder.priority + (this.maxDepth - current.path.length));
                    }
                } catch (e) {
                    // Decoder failed, continue to next
                }
            }
        }

        return {
            success: false,
            reason: 'exhausted',
            attempts: visited.size
        };
    }

    /**
     * Calculate heuristic score for data
     * Higher score = more likely to be plaintext
     */
    heuristic(data) {
        let score = 0;

        // Printability score
        const printable = data.replace(/[^\x20-\x7e]/g, '').length;
        score += (printable / data.length) * 40;

        // Word-like patterns
        if (/[a-zA-Z]{3,}/.test(data)) score += 20;

        // Common English patterns
        if (/\b(the|and|is|in|to|of)\b/i.test(data)) score += 30;

        // Flag patterns (CTF)
        if (/flag\{|ctf\{|key\{/i.test(data)) score += 50;

        return score;
    }

    /**
     * Hash data for visited tracking
     */
    hash(data) {
        // Simple hash for deduplication
        let h = 0;
        for (let i = 0; i < data.length; i++) {
            h = ((h << 5) - h) + data.charCodeAt(i);
            h |= 0;
        }
        return h.toString(16);
    }
}
```

### Plaintext Checker

```javascript
// src/node/tools/auto/plaintext-checker.mjs

/**
 * Plaintext detection using n-gram analysis
 * Ported from Ciphey's English checker
 */

// English letter frequencies
const ENGLISH_FREQ = {
    'E': 12.70, 'T': 9.06, 'A': 8.17, 'O': 7.51, 'I': 6.97,
    'N': 6.75, 'S': 6.33, 'H': 6.09, 'R': 5.99, 'D': 4.25,
    'L': 4.03, 'C': 2.78, 'U': 2.76, 'M': 2.41, 'W': 2.36,
    'F': 2.23, 'G': 2.02, 'Y': 1.97, 'P': 1.93, 'B': 1.29,
    'V': 0.98, 'K': 0.77, 'J': 0.15, 'X': 0.15, 'Q': 0.10,
    'Z': 0.07
};

// Common English bigrams
const COMMON_BIGRAMS = [
    'TH', 'HE', 'IN', 'ER', 'AN', 'RE', 'ON', 'AT', 'EN', 'ND',
    'TI', 'ES', 'OR', 'TE', 'OF', 'ED', 'IS', 'IT', 'AL', 'AR'
];

// Common English trigrams
const COMMON_TRIGRAMS = [
    'THE', 'AND', 'ING', 'ENT', 'ION', 'HER', 'FOR', 'THA', 'NTH', 'INT'
];

export class PlaintextChecker {
    constructor(options = {}) {
        this.minConfidence = options.minConfidence || 0.6;
    }

    /**
     * Check if text appears to be valid plaintext
     * @param {string} text - Text to check
     * @returns {object} Check result with confidence
     */
    check(text) {
        if (!text || text.length < 5) {
            return { isPlaintext: false, confidence: 0, reason: 'too_short' };
        }

        const scores = {
            printability: this.printabilityScore(text),
            frequency: this.frequencyScore(text),
            bigram: this.bigramScore(text),
            trigram: this.trigramScore(text),
            wordPattern: this.wordPatternScore(text)
        };

        // Weighted average
        const weights = {
            printability: 0.15,
            frequency: 0.25,
            bigram: 0.20,
            trigram: 0.15,
            wordPattern: 0.25
        };

        let totalScore = 0;
        for (const [key, score] of Object.entries(scores)) {
            totalScore += score * weights[key];
        }

        const confidence = Math.min(totalScore / 100, 1);

        return {
            isPlaintext: confidence >= this.minConfidence,
            confidence: confidence,
            scores: scores
        };
    }

    /**
     * Score based on printable ASCII ratio
     */
    printabilityScore(text) {
        const printable = text.replace(/[^\x20-\x7e]/g, '').length;
        return (printable / text.length) * 100;
    }

    /**
     * Score based on letter frequency similarity to English
     */
    frequencyScore(text) {
        const letters = text.toUpperCase().replace(/[^A-Z]/g, '');
        if (letters.length < 20) return 0;

        const freq = {};
        for (const letter of letters) {
            freq[letter] = (freq[letter] || 0) + 1;
        }

        // Calculate chi-squared distance
        let chiSquared = 0;
        for (const [letter, expected] of Object.entries(ENGLISH_FREQ)) {
            const observed = ((freq[letter] || 0) / letters.length) * 100;
            chiSquared += Math.pow(observed - expected, 2) / expected;
        }

        // Convert to score (lower chi-squared = better match)
        return Math.max(0, 100 - chiSquared);
    }

    /**
     * Score based on common bigrams
     */
    bigramScore(text) {
        const upper = text.toUpperCase();
        let matches = 0;

        for (const bigram of COMMON_BIGRAMS) {
            if (upper.includes(bigram)) matches++;
        }

        return (matches / COMMON_BIGRAMS.length) * 100;
    }

    /**
     * Score based on common trigrams
     */
    trigramScore(text) {
        const upper = text.toUpperCase();
        let matches = 0;

        for (const trigram of COMMON_TRIGRAMS) {
            if (upper.includes(trigram)) matches++;
        }

        return (matches / COMMON_TRIGRAMS.length) * 100;
    }

    /**
     * Score based on word-like patterns
     */
    wordPatternScore(text) {
        // Check for word boundaries
        const words = text.match(/\b[a-zA-Z]+\b/g) || [];
        if (words.length === 0) return 0;

        // Average word length (English average is ~4.5)
        const avgLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
        const lengthScore = avgLength >= 3 && avgLength <= 8 ? 50 : 20;

        // Check for common short words
        const commonWords = ['the', 'and', 'is', 'in', 'to', 'of', 'a', 'an', 'it', 'for'];
        const lowerText = text.toLowerCase();
        let commonMatches = 0;
        for (const word of commonWords) {
            if (lowerText.includes(` ${word} `) || lowerText.startsWith(`${word} `)) {
                commonMatches++;
            }
        }

        return lengthScore + (commonMatches * 5);
    }
}
```

### Decoder Registry

```javascript
// src/node/tools/auto/decoder-registry.mjs

/**
 * Registry of available decoders for auto-decode
 */

import { CaesarDecoder } from './decoders/caesar.mjs';
import { VigenereDecoder } from './decoders/vigenere.mjs';
import { Base64Decoder } from './decoders/base64.mjs';
import { HexDecoder } from './decoders/hex.mjs';
import { BinaryDecoder } from './decoders/binary.mjs';
import { RailFenceDecoder } from './decoders/railfence.mjs';

export class DecoderRegistry {
    constructor() {
        this.decoders = new Map();
        this.registerBuiltins();
    }

    registerBuiltins() {
        // Priority: lower = try first
        this.register(new Base64Decoder({ priority: 10 }));
        this.register(new HexDecoder({ priority: 15 }));
        this.register(new BinaryDecoder({ priority: 20 }));
        this.register(new CaesarDecoder({ priority: 50 }));
        this.register(new RailFenceDecoder({ priority: 60 }));
        this.register(new VigenereDecoder({ priority: 70 }));
    }

    register(decoder) {
        this.decoders.set(decoder.name, decoder);
    }

    get(name) {
        return this.decoders.get(name);
    }

    getAll() {
        return [...this.decoders.values()].sort((a, b) => a.priority - b.priority);
    }
}
```

## Testing Strategy

### Unit Tests

```javascript
// tests/tools/auto/ausearch.test.mjs
import { describe, it, expect } from 'vitest';
import { AuSearch } from '../../../src/node/tools/auto/ausearch.mjs';

describe('AuSearch', () => {
    const search = new AuSearch({ timeout: 10000 });

    it('should decode simple Base64', async () => {
        const result = await search.crack('SGVsbG8gV29ybGQh');
        expect(result.success).toBe(true);
        expect(result.plaintext).toBe('Hello World!');
        expect(result.path).toContain('base64');
    });

    it('should decode multi-layer encoding', async () => {
        // Base64(Hex(text))
        const input = 'NDg2NTZjNmM2ZjIwNTc2ZjcyNmM2NDIx';
        const result = await search.crack(input);
        expect(result.success).toBe(true);
        expect(result.plaintext).toBe('Hello World!');
    });

    it('should decode Caesar cipher', async () => {
        const result = await search.crack('Khoor Zruog'); // ROT3
        expect(result.success).toBe(true);
        expect(result.plaintext.toLowerCase()).toContain('hello');
    });

    it('should timeout on impossible input', async () => {
        const search = new AuSearch({ timeout: 100 });
        const result = await search.crack('$#@!%^&*()_+');
        expect(result.success).toBe(false);
    });
});
```

### Integration Tests

```javascript
// tests/tools/auto/integration.test.mjs
import { describe, it, expect } from 'vitest';
import { callTool } from '../../helpers/mcp-client.mjs';

describe('Auto-decode MCP Integration', () => {
    it('should expose cyberchef_auto_decode tool', async () => {
        const result = await callTool('cyberchef_auto_decode', {
            input: 'SGVsbG8gV29ybGQh'
        });
        expect(result.success).toBe(true);
        expect(result.output.plaintext).toBe('Hello World!');
    });

    it('should expose cyberchef_plaintext_check tool', async () => {
        const result = await callTool('cyberchef_plaintext_check', {
            input: 'The quick brown fox jumps over the lazy dog'
        });
        expect(result.success).toBe(true);
        expect(result.output.isPlaintext).toBe(true);
    });
});
```

## Performance Considerations

### Timeout Enforcement
- Default timeout: 5 seconds (CLI), 3 seconds (MCP)
- Configurable per-call
- Early termination on high-confidence matches

### Caching
- Cache decoded results to avoid re-computation
- LRU cache with 1000 entry limit
- Cache key: hash of input + decoder name

### Parallel Processing
- Consider Web Workers for decoder execution
- Limit concurrent decoders to prevent resource exhaustion

## Migration from Ciphey/Ares

### What We Keep
1. A* search algorithm structure
2. Decoder priority system
3. Plaintext checker n-gram analysis
4. Result path tracking

### What We Modify
1. Rust parallelism -> JavaScript async
2. BERT checker -> n-gram only (no ML dependency)
3. Interactive prompts -> MCP tool responses
4. Statistics database -> in-memory cache

### What We Skip
1. BERT AI model (too heavy)
2. Interactive CLI
3. Statistics persistence
4. Discord bot integration

## Dependencies

No additional npm packages required. All implementations are pure JavaScript.

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| False positives in plaintext detection | High | Medium | Multiple checker algorithms, confidence scores |
| Timeout on complex encodings | Medium | Low | Configurable timeout, partial results |
| Performance degradation | Medium | Medium | Caching, early termination |
| Memory usage with deep paths | Low | High | Depth limits, visited set cleanup |

## Success Metrics

1. Decode 90%+ of common CTF encodings
2. < 5 second decode time for 95% of inputs
3. False positive rate < 5%
4. Memory usage < 100MB for typical operations

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Phase:** 3 (Sprints 3.2, 3.3)
