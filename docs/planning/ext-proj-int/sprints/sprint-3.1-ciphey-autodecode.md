# Sprint 3.1: Ciphey Auto-Decode

## Sprint Overview

| Field | Value |
|-------|-------|
| Sprint | 3.1 |
| Phase | 3 - Algorithm Ports |
| Duration | 2 weeks |
| Start | Week 11 |
| End | Week 12 |

## Objectives

1. Port Ciphey/Ares A* search algorithm
2. Implement encoding detectors/decoders
3. Create plaintext checkers
4. Build unified auto-decode tool

## User Stories

### US-3.1.1: Encoding Detection

**As a** analyst
**I want** automatic encoding detection
**So that** I don't need to guess the encoding type

**Acceptance Criteria:**
- [ ] Detect Base64 variants
- [ ] Detect hex encoding
- [ ] Detect binary representation
- [ ] Detect URL encoding
- [ ] Confidence scoring

### US-3.1.2: Multi-Layer Decoding

**As a** analyst
**I want** automatic decoding of nested encodings
**So that** I can unwrap obfuscated data

**Acceptance Criteria:**
- [ ] A* search through encoding space
- [ ] Track decoding path
- [ ] Handle encoding chains
- [ ] Timeout protection

### US-3.1.3: Plaintext Detection

**As a** analyst
**I want** automatic detection of successful decoding
**So that** the system knows when to stop

**Acceptance Criteria:**
- [ ] English language detection
- [ ] Common format detection (JSON, XML)
- [ ] Flag pattern detection
- [ ] Configurable patterns

### US-3.1.4: Cipher Detection

**As a** CTF player
**I want** detection of classical ciphers
**So that** I can identify cipher types

**Acceptance Criteria:**
- [ ] Index of Coincidence calculation
- [ ] Caesar cipher detection
- [ ] Substitution cipher hints
- [ ] Transposition patterns

## Tasks

### Encoding Detection (Day 1-4)

| ID | Task | Estimate | Assignee |
|----|------|----------|----------|
| T-3.1.1 | Define encoding patterns | 4h | - |
| T-3.1.2 | Implement pattern matchers | 6h | - |
| T-3.1.3 | Implement confidence scoring | 4h | - |
| T-3.1.4 | Create EncodingDetector class | 4h | - |

### Decoders (Day 5-7)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-3.1.5 | Implement Base64 decoder | 2h | - |
| T-3.1.6 | Implement Hex decoder | 2h | - |
| T-3.1.7 | Implement URL decoder | 2h | - |
| T-3.1.8 | Implement ROT13/Caesar | 3h | - |
| T-3.1.9 | Create decoder registry | 3h | T-3.1.5-8 |

### Checkers (Day 7-8)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-3.1.10 | Implement English checker | 4h | - |
| T-3.1.11 | Implement format checker | 3h | - |
| T-3.1.12 | Implement flag checker | 2h | - |
| T-3.1.13 | Create checker registry | 2h | T-3.1.10-12 |

### Search Algorithm (Day 9-10)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-3.1.14 | Implement priority queue | 3h | - |
| T-3.1.15 | Port A* search algorithm | 6h | T-3.1.9, T-3.1.13 |
| T-3.1.16 | Add timeout protection | 2h | T-3.1.15 |
| T-3.1.17 | Create AutoDecode tool | 4h | T-3.1.15 |
| T-3.1.18 | Write tests | 6h | All |

## Deliverables

### Files to Create

```
src/node/tools/
├── auto-decode/
│   ├── index.mjs           # Module exports
│   ├── detector.mjs        # Encoding detection
│   ├── decoders/
│   │   ├── index.mjs       # Decoder registry
│   │   ├── base.mjs        # Base decoder class
│   │   ├── base64.mjs      # Base64 decoder
│   │   ├── hex.mjs         # Hex decoder
│   │   ├── url.mjs         # URL decoder
│   │   └── rotation.mjs    # ROT13/Caesar
│   ├── checkers/
│   │   ├── index.mjs       # Checker registry
│   │   ├── base.mjs        # Base checker class
│   │   ├── english.mjs     # English language
│   │   ├── format.mjs      # JSON/XML/etc.
│   │   └── flag.mjs        # CTF flags
│   ├── search.mjs          # A* search algorithm
│   └── register.mjs        # Tool registration
```

### Code Specifications

#### Encoding Detector (detector.mjs)

```javascript
/**
 * Encoding pattern detection
 */

export const ENCODING_PATTERNS = {
    base64: {
        pattern: /^[A-Za-z0-9+/]+=*$/,
        lengthCheck: (len) => len % 4 === 0 || len % 4 === 2 || len % 4 === 3,
        minLength: 4,
        priority: 25
    },
    base64url: {
        pattern: /^[A-Za-z0-9_-]+=*$/,
        lengthCheck: (len) => len % 4 === 0 || len % 4 === 2 || len % 4 === 3,
        minLength: 4,
        priority: 24
    },
    base32: {
        pattern: /^[A-Z2-7]+=*$/i,
        lengthCheck: (len) => len % 8 === 0 || [2, 4, 5, 7].includes(len % 8),
        minLength: 8,
        priority: 20
    },
    hex: {
        pattern: /^[0-9A-Fa-f]+$/,
        lengthCheck: (len) => len % 2 === 0,
        minLength: 2,
        priority: 30
    },
    hexSpaced: {
        pattern: /^([0-9A-Fa-f]{2}\s)+[0-9A-Fa-f]{2}$/,
        minLength: 5,
        priority: 28
    },
    binary: {
        pattern: /^[01\s]+$/,
        lengthCheck: (len) => {
            const bits = len.replace(/\s/g, '').length;
            return bits % 8 === 0;
        },
        minLength: 8,
        priority: 15
    },
    urlEncoded: {
        pattern: /%[0-9A-Fa-f]{2}/,
        minLength: 3,
        priority: 35
    },
    decimal: {
        pattern: /^(\d{1,3}\s)+\d{1,3}$/,
        minLength: 3,
        priority: 10
    },
    octal: {
        pattern: /^([0-7]{3}\s?)+$/,
        minLength: 3,
        priority: 8
    }
};

export class EncodingDetector {
    constructor() {
        this.patterns = ENCODING_PATTERNS;
    }

    /**
     * Detect most likely encoding
     */
    detect(input) {
        const results = [];
        const cleanInput = input.trim();

        for (const [name, spec] of Object.entries(this.patterns)) {
            const match = this.testPattern(cleanInput, spec);
            if (match.matches) {
                results.push({
                    encoding: name,
                    confidence: match.confidence,
                    priority: spec.priority
                });
            }
        }

        // Sort by confidence * priority
        results.sort((a, b) =>
            (b.confidence * b.priority) - (a.confidence * a.priority)
        );

        return results;
    }

    /**
     * Detect all possible encodings
     */
    detectAll(input) {
        return this.detect(input);
    }

    testPattern(input, spec) {
        // Check minimum length
        if (input.length < spec.minLength) {
            return { matches: false };
        }

        // Check pattern
        if (!spec.pattern.test(input)) {
            return { matches: false };
        }

        // Check length constraints
        if (spec.lengthCheck && !spec.lengthCheck(input.length)) {
            return { matches: false, reason: 'length' };
        }

        // Calculate confidence
        const confidence = this.calculateConfidence(input, spec);

        return { matches: true, confidence };
    }

    calculateConfidence(input, spec) {
        let confidence = 0.5;

        // Length bonus
        if (input.length > 20) confidence += 0.1;
        if (input.length > 100) confidence += 0.1;

        // Padding bonus for base64
        if (spec === this.patterns.base64 && input.endsWith('=')) {
            confidence += 0.15;
        }

        // Entropy check
        const entropy = this.calculateEntropy(input);
        if (entropy > 4) confidence += 0.1;

        return Math.min(confidence, 1);
    }

    calculateEntropy(input) {
        const freq = new Map();
        for (const char of input) {
            freq.set(char, (freq.get(char) || 0) + 1);
        }

        let entropy = 0;
        for (const count of freq.values()) {
            const p = count / input.length;
            entropy -= p * Math.log2(p);
        }

        return entropy;
    }
}
```

#### A* Search Algorithm (search.mjs)

```javascript
/**
 * A* search algorithm for automatic decoding
 */

import { PriorityQueue } from './priority-queue.mjs';

export class AuSearch {
    constructor(decoders, checkers, options = {}) {
        this.decoders = decoders;
        this.checkers = checkers;
        this.timeout = options.timeout || 5000;
        this.maxDepth = options.maxDepth || 10;
        this.visited = new Set();
    }

    /**
     * Search for plaintext through decoding space
     */
    async search(input) {
        const startTime = performance.now();
        const queue = new PriorityQueue((a, b) => b.score - a.score);

        queue.enqueue({
            text: input,
            path: [],
            score: 0,
            depth: 0
        });

        this.visited.clear();
        this.visited.add(this.hash(input));

        while (!queue.isEmpty()) {
            // Check timeout
            if (performance.now() - startTime > this.timeout) {
                return {
                    success: false,
                    reason: 'timeout',
                    elapsed: performance.now() - startTime
                };
            }

            const node = queue.dequeue();

            // Check if plaintext
            const checkResult = await this.checkPlaintext(node.text);
            if (checkResult.isPlaintext) {
                return {
                    success: true,
                    result: node.text,
                    path: node.path,
                    checker: checkResult.checker,
                    confidence: checkResult.confidence,
                    elapsed: performance.now() - startTime
                };
            }

            // Don't go too deep
            if (node.depth >= this.maxDepth) continue;

            // Try all applicable decoders
            for (const decoder of this.decoders) {
                if (!decoder.canDecode(node.text)) continue;

                try {
                    const decoded = await decoder.decode(node.text);
                    if (!decoded || decoded === node.text) continue;

                    const hash = this.hash(decoded);
                    if (this.visited.has(hash)) continue;
                    this.visited.add(hash);

                    const score = this.calculateScore(decoded, decoder, node);

                    queue.enqueue({
                        text: decoded,
                        path: [...node.path, decoder.name],
                        score,
                        depth: node.depth + 1
                    });
                } catch (error) {
                    // Decoding failed, skip
                }
            }
        }

        return {
            success: false,
            reason: 'exhausted',
            elapsed: performance.now() - startTime
        };
    }

    async checkPlaintext(text) {
        for (const checker of this.checkers) {
            const result = await checker.check(text);
            if (result.isPlaintext) {
                return {
                    isPlaintext: true,
                    checker: checker.name,
                    confidence: result.confidence
                };
            }
        }
        return { isPlaintext: false };
    }

    calculateScore(text, decoder, parent) {
        let score = parent.score;

        // Decoder priority
        score += decoder.priority || 0;

        // Length reduction bonus
        if (text.length < parent.text.length) {
            score += (parent.text.length - text.length) * 0.1;
        }

        // Entropy change
        const entropy = this.calculateEntropy(text);
        const parentEntropy = this.calculateEntropy(parent.text);

        // Lower entropy often means closer to plaintext
        if (entropy < parentEntropy) {
            score += (parentEntropy - entropy) * 5;
        }

        return score;
    }

    calculateEntropy(text) {
        const freq = new Map();
        for (const char of text) {
            freq.set(char, (freq.get(char) || 0) + 1);
        }

        let entropy = 0;
        for (const count of freq.values()) {
            const p = count / text.length;
            entropy -= p * Math.log2(p);
        }

        return entropy;
    }

    hash(text) {
        // Simple hash for deduplication
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }
}
```

#### English Checker (checkers/english.mjs)

```javascript
/**
 * English language detection
 */

// Common English words for quick check
const COMMON_WORDS = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what'
]);

// Expected English letter frequencies
const ENGLISH_FREQ = {
    'e': 0.127, 't': 0.091, 'a': 0.082, 'o': 0.075, 'i': 0.070,
    'n': 0.067, 's': 0.063, 'h': 0.061, 'r': 0.060, 'd': 0.043,
    'l': 0.040, 'c': 0.028, 'u': 0.028, 'm': 0.024, 'w': 0.024,
    'f': 0.022, 'g': 0.020, 'y': 0.020, 'p': 0.019, 'b': 0.015
};

export class EnglishChecker {
    constructor(options = {}) {
        this.name = 'english';
        this.minLength = options.minLength || 10;
        this.threshold = options.threshold || 0.6;
    }

    async check(text) {
        if (text.length < this.minLength) {
            return { isPlaintext: false };
        }

        const scores = {
            printable: this.checkPrintable(text),
            wordMatch: this.checkWords(text),
            frequency: this.checkFrequency(text),
            spacing: this.checkSpacing(text)
        };

        const totalScore = (
            scores.printable * 0.3 +
            scores.wordMatch * 0.3 +
            scores.frequency * 0.25 +
            scores.spacing * 0.15
        );

        return {
            isPlaintext: totalScore >= this.threshold,
            confidence: totalScore,
            details: scores
        };
    }

    checkPrintable(text) {
        let printable = 0;
        for (const char of text) {
            const code = char.charCodeAt(0);
            if (code >= 32 && code < 127) printable++;
        }
        return printable / text.length;
    }

    checkWords(text) {
        const words = text.toLowerCase().match(/[a-z]+/g) || [];
        if (words.length === 0) return 0;

        let matches = 0;
        for (const word of words) {
            if (COMMON_WORDS.has(word)) matches++;
        }

        return Math.min(matches / words.length * 2, 1);
    }

    checkFrequency(text) {
        const letters = text.toLowerCase().replace(/[^a-z]/g, '');
        if (letters.length < 20) return 0.5;

        const freq = {};
        for (const char of letters) {
            freq[char] = (freq[char] || 0) + 1;
        }

        // Normalize
        for (const char in freq) {
            freq[char] /= letters.length;
        }

        // Chi-squared test against English
        let chiSquared = 0;
        for (const [char, expected] of Object.entries(ENGLISH_FREQ)) {
            const observed = freq[char] || 0;
            chiSquared += Math.pow(observed - expected, 2) / expected;
        }

        // Lower chi-squared = better match
        // Convert to 0-1 score (inverse)
        return Math.exp(-chiSquared / 10);
    }

    checkSpacing(text) {
        const words = text.split(/\s+/).filter(w => w.length > 0);
        if (words.length < 2) return 0.3;

        const avgWordLength = text.replace(/\s/g, '').length / words.length;

        // English average word length is ~4.5
        if (avgWordLength >= 3 && avgWordLength <= 8) {
            return 0.9;
        } else if (avgWordLength >= 2 && avgWordLength <= 12) {
            return 0.6;
        }

        return 0.2;
    }
}
```

### MCP Tools Registered

| Tool Name | Description |
|-----------|-------------|
| `cyberchef_auto_decode` | Automatically decode nested encodings |
| `cyberchef_encoding_detect` | Detect encoding type(s) |
| `cyberchef_cipher_detect` | Detect classical cipher type |
| `cyberchef_plaintext_check` | Check if text appears to be plaintext |

## Definition of Done

- [ ] EncodingDetector with 10+ patterns
- [ ] 5+ decoder implementations
- [ ] 3+ plaintext checkers
- [ ] A* search algorithm working
- [ ] Unit tests with > 85% coverage
- [ ] Reference tests against Ciphey outputs
- [ ] Performance: <5s for typical inputs

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| False positive detection | Medium | Medium | Tunable thresholds, confidence scores |
| Timeout on complex inputs | Medium | Medium | Configurable timeout, depth limit |
| Search explosion | High | Low | Visited set, priority bounds |

## Dependencies

### External

- None (pure JavaScript)

### Internal

- Sprint 1.1 (ToolRegistry)
- Sprint 1.2 (Testing Framework)

## Notes

- Core algorithm from Ciphey/Ares A* search
- Focus on common CTF/malware encodings first
- Language detection simplified (no AI model)

---

**Sprint Version:** 1.0.0
**Created:** 2025-12-17
