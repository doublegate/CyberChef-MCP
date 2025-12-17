# Sprint 3.2: xortool XOR Analysis

## Sprint Overview

| Field | Value |
|-------|-------|
| Sprint | 3.2 |
| Phase | 3 - Algorithm Ports |
| Duration | 2 weeks |
| Start | Week 13 |
| End | Week 14 |

## Objectives

1. Port xortool key length detection algorithm
2. Implement key character guessing
3. Create XOR decryption with partial keys
4. Build comprehensive XOR analysis tool

## User Stories

### US-3.2.1: Key Length Detection

**As a** analyst
**I want** automatic XOR key length detection
**So that** I can determine the key size of XOR-encrypted data

**Acceptance Criteria:**
- [ ] Coincidence index calculation
- [ ] Multiple key length candidates
- [ ] Confidence scoring
- [ ] Hamming distance method

### US-3.2.2: Key Character Guessing

**As a** analyst
**I want** to guess probable key characters
**So that** I can recover the XOR key

**Acceptance Criteria:**
- [ ] Frequency analysis per key position
- [ ] Multiple character candidates
- [ ] Known plaintext support
- [ ] Most frequent byte targeting

### US-3.2.3: XOR Decryption

**As a** analyst
**I want** to decrypt XOR with partial/full keys
**So that** I can recover encrypted data

**Acceptance Criteria:**
- [ ] Full key decryption
- [ ] Partial key with wildcards
- [ ] Key as hex/string/int
- [ ] Output format options

### US-3.2.4: Multi-Byte XOR Analysis

**As a** malware analyst
**I want** comprehensive XOR analysis
**So that** I can handle various XOR obfuscation schemes

**Acceptance Criteria:**
- [ ] Single-byte XOR brute force
- [ ] Rolling XOR detection
- [ ] Incremental XOR patterns
- [ ] Combined analysis report

## Tasks

### Key Length Detection (Day 1-4)

| ID | Task | Estimate | Assignee |
|----|------|----------|----------|
| T-3.2.1 | Analyze xortool key_length algorithm | 2h | - |
| T-3.2.2 | Implement coincidence counter | 4h | - |
| T-3.2.3 | Implement Hamming distance method | 4h | - |
| T-3.2.4 | Create KeyLengthDetector class | 4h | - |
| T-3.2.5 | Add probability ranking | 2h | - |

### Key Guessing (Day 5-7)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-3.2.6 | Implement frequency analyzer | 4h | - |
| T-3.2.7 | Port character guessing logic | 6h | - |
| T-3.2.8 | Add known plaintext attack | 3h | - |
| T-3.2.9 | Create KeyGuesser class | 3h | T-3.2.6-8 |

### XOR Operations (Day 8-9)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-3.2.10 | Implement XOR decrypt function | 3h | - |
| T-3.2.11 | Add partial key support | 3h | T-3.2.10 |
| T-3.2.12 | Add rolling/incremental XOR | 4h | T-3.2.10 |
| T-3.2.13 | Create XorDecryptor class | 2h | T-3.2.10-12 |

### Integration (Day 10)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-3.2.14 | Register MCP tools | 3h | All |
| T-3.2.15 | Write tests with xortool vectors | 6h | T-3.2.14 |
| T-3.2.16 | Documentation | 2h | All |

## Deliverables

### Files to Create

```
src/node/tools/
├── xor-analysis/
│   ├── index.mjs           # Module exports
│   ├── key-length.mjs      # Key length detection
│   ├── key-guess.mjs       # Key character guessing
│   ├── decrypt.mjs         # XOR decryption
│   ├── patterns.mjs        # XOR pattern detection
│   └── register.mjs        # Tool registration
```

### Code Specifications

#### Key Length Detection (key-length.mjs)

```javascript
/**
 * XOR key length detection algorithms (ported from xortool)
 */

/**
 * Detect probable key lengths using coincidence index
 */
export function detectKeyLength(data, maxKeyLen = 65) {
    if (typeof data === 'string') {
        data = Uint8Array.from(data, c => c.charCodeAt(0));
    }

    const scores = [];

    for (let keyLen = 1; keyLen <= Math.min(maxKeyLen, data.length / 2); keyLen++) {
        const score = calculateCoincidence(data, keyLen);
        scores.push({ keyLength: keyLen, score });
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Find peaks
    const peaks = findPeaks(scores);

    return {
        bestGuess: peaks[0]?.keyLength || 1,
        candidates: peaks.slice(0, 5),
        allScores: scores
    };
}

/**
 * Calculate coincidence index for a given key length
 */
function calculateCoincidence(data, keyLen) {
    let coincidences = 0;
    let comparisons = 0;

    for (let i = 0; i < data.length - keyLen; i++) {
        if (data[i] === data[i + keyLen]) {
            coincidences++;
        }
        comparisons++;
    }

    return comparisons > 0 ? coincidences / comparisons : 0;
}

/**
 * Alternative: Hamming distance method
 */
export function detectKeyLengthHamming(data, maxKeyLen = 40) {
    if (typeof data === 'string') {
        data = Uint8Array.from(data, c => c.charCodeAt(0));
    }

    const scores = [];

    for (let keyLen = 2; keyLen <= Math.min(maxKeyLen, data.length / 4); keyLen++) {
        const blocks = [];
        for (let i = 0; i < 4 && (i + 1) * keyLen <= data.length; i++) {
            blocks.push(data.slice(i * keyLen, (i + 1) * keyLen));
        }

        if (blocks.length < 2) continue;

        // Calculate average normalized Hamming distance
        let totalDistance = 0;
        let pairs = 0;

        for (let i = 0; i < blocks.length - 1; i++) {
            for (let j = i + 1; j < blocks.length; j++) {
                totalDistance += hammingDistance(blocks[i], blocks[j]) / keyLen;
                pairs++;
            }
        }

        const avgDistance = totalDistance / pairs;
        scores.push({ keyLength: keyLen, score: 1 / avgDistance });
    }

    scores.sort((a, b) => b.score - a.score);

    return {
        bestGuess: scores[0]?.keyLength || 1,
        candidates: scores.slice(0, 5)
    };
}

/**
 * Calculate Hamming distance between two byte arrays
 */
function hammingDistance(a, b) {
    let distance = 0;
    const len = Math.min(a.length, b.length);

    for (let i = 0; i < len; i++) {
        let xor = a[i] ^ b[i];
        while (xor) {
            distance += xor & 1;
            xor >>= 1;
        }
    }

    return distance;
}

/**
 * Find local maxima (peaks) in scores
 */
function findPeaks(scores) {
    const peaks = [];
    const threshold = scores[0].score * 0.5;

    for (let i = 0; i < scores.length; i++) {
        const score = scores[i];
        if (score.score < threshold) continue;

        // Check if it's a factor of a higher-ranked result
        const isMultiple = peaks.some(p =>
            score.keyLength % p.keyLength === 0 ||
            p.keyLength % score.keyLength === 0
        );

        if (!isMultiple || peaks.length < 3) {
            peaks.push(score);
        }
    }

    return peaks;
}
```

#### Key Guessing (key-guess.mjs)

```javascript
/**
 * XOR key character guessing (ported from xortool)
 */

// Byte frequency for printable ASCII
const PRINTABLE_FREQ = new Map([
    [0x20, 0.167], // space
    [0x65, 0.102], // e
    [0x74, 0.075], // t
    [0x61, 0.065], // a
    [0x6f, 0.060], // o
    [0x6e, 0.057], // n
    [0x69, 0.055], // i
    [0x73, 0.053], // s
    [0x72, 0.050], // r
    [0x68, 0.049], // h
]);

/**
 * Guess XOR key bytes
 */
export function guessKey(data, keyLength, options = {}) {
    if (typeof data === 'string') {
        data = Uint8Array.from(data, c => c.charCodeAt(0));
    }

    const {
        targetByte = 0x20,  // Space (common in text)
        topN = 3,
        knownPlaintext = null
    } = options;

    // Split into columns
    const columns = [];
    for (let i = 0; i < keyLength; i++) {
        columns.push([]);
    }

    for (let i = 0; i < data.length; i++) {
        columns[i % keyLength].push(data[i]);
    }

    // Guess each key byte
    const keyGuesses = [];

    for (let pos = 0; pos < keyLength; pos++) {
        const column = columns[pos];

        if (knownPlaintext && knownPlaintext[pos] !== null) {
            // Known plaintext attack
            keyGuesses.push([{
                byte: column[0] ^ knownPlaintext[pos],
                confidence: 1.0,
                method: 'known_plaintext'
            }]);
        } else {
            // Frequency analysis
            const candidates = guessKeyByteFrequency(column, targetByte, topN);
            keyGuesses.push(candidates);
        }
    }

    // Build best key
    const bestKey = new Uint8Array(keyLength);
    for (let i = 0; i < keyLength; i++) {
        bestKey[i] = keyGuesses[i][0].byte;
    }

    return {
        bestKey,
        keyGuesses,
        asHex: Array.from(bestKey).map(b => b.toString(16).padStart(2, '0')).join(''),
        asString: String.fromCharCode(...bestKey)
    };
}

/**
 * Guess a single key byte using frequency analysis
 */
function guessKeyByteFrequency(column, targetByte, topN) {
    // Count byte frequencies in column
    const freq = new Map();
    for (const byte of column) {
        freq.set(byte, (freq.get(byte) || 0) + 1);
    }

    // Most frequent bytes XORed with target
    const candidates = [];
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);

    for (let i = 0; i < Math.min(topN, sorted.length); i++) {
        const [mostFreq, count] = sorted[i];
        const keyByte = mostFreq ^ targetByte;

        candidates.push({
            byte: keyByte,
            confidence: count / column.length,
            mostFreqByte: mostFreq,
            method: 'frequency'
        });
    }

    return candidates;
}

/**
 * Brute force single-byte XOR
 */
export function bruteForceSingleByte(data, options = {}) {
    if (typeof data === 'string') {
        data = Uint8Array.from(data, c => c.charCodeAt(0));
    }

    const { scoreFunction = scorePrintable } = options;
    const results = [];

    for (let key = 0; key < 256; key++) {
        const decrypted = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
            decrypted[i] = data[i] ^ key;
        }

        const score = scoreFunction(decrypted);
        results.push({
            key,
            keyHex: key.toString(16).padStart(2, '0'),
            score,
            preview: String.fromCharCode(...decrypted.slice(0, 50))
        });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 10);
}

/**
 * Score based on printable ASCII ratio
 */
function scorePrintable(data) {
    let printable = 0;
    for (const byte of data) {
        if (byte >= 0x20 && byte < 0x7f) printable++;
    }
    return printable / data.length;
}
```

#### XOR Decryption (decrypt.mjs)

```javascript
/**
 * XOR decryption operations
 */

/**
 * Decrypt with repeating XOR key
 */
export function xorDecrypt(data, key) {
    if (typeof data === 'string') {
        data = Uint8Array.from(data, c => c.charCodeAt(0));
    }
    if (typeof key === 'string') {
        key = Uint8Array.from(key, c => c.charCodeAt(0));
    }
    if (typeof key === 'number') {
        key = new Uint8Array([key]);
    }

    const result = new Uint8Array(data.length);

    for (let i = 0; i < data.length; i++) {
        result[i] = data[i] ^ key[i % key.length];
    }

    return result;
}

/**
 * Decrypt with partial key (wildcards for unknown bytes)
 */
export function xorDecryptPartial(data, partialKey, wildcard = null) {
    if (typeof data === 'string') {
        data = Uint8Array.from(data, c => c.charCodeAt(0));
    }

    const result = new Uint8Array(data.length);
    const unknowns = [];

    for (let i = 0; i < data.length; i++) {
        const keyByte = partialKey[i % partialKey.length];

        if (keyByte === wildcard || keyByte === undefined) {
            result[i] = data[i];  // Leave encrypted
            unknowns.push(i % partialKey.length);
        } else {
            result[i] = data[i] ^ keyByte;
        }
    }

    return {
        result,
        unknownPositions: [...new Set(unknowns)]
    };
}

/**
 * Rolling XOR (each byte XORed with previous output)
 */
export function rollingXorDecrypt(data, initialValue = 0) {
    if (typeof data === 'string') {
        data = Uint8Array.from(data, c => c.charCodeAt(0));
    }

    const result = new Uint8Array(data.length);
    let prev = initialValue;

    for (let i = 0; i < data.length; i++) {
        result[i] = data[i] ^ prev;
        prev = data[i];  // Use ciphertext byte
    }

    return result;
}

/**
 * Incremental XOR (key increments each byte)
 */
export function incrementalXorDecrypt(data, startKey, increment = 1) {
    if (typeof data === 'string') {
        data = Uint8Array.from(data, c => c.charCodeAt(0));
    }

    const result = new Uint8Array(data.length);
    let key = startKey;

    for (let i = 0; i < data.length; i++) {
        result[i] = data[i] ^ (key & 0xff);
        key += increment;
    }

    return result;
}
```

### MCP Tools Registered

| Tool Name | Description |
|-----------|-------------|
| `cyberchef_xor_key_length` | Detect XOR key length |
| `cyberchef_xor_key_guess` | Guess XOR key bytes |
| `cyberchef_xor_decrypt` | Decrypt with XOR key |
| `cyberchef_xor_bruteforce` | Brute force single-byte XOR |
| `cyberchef_xor_analyze` | Comprehensive XOR analysis |

## Definition of Done

- [ ] Key length detection working
- [ ] Key guessing with frequency analysis
- [ ] Reference tests against xortool outputs
- [ ] Unit tests with > 85% coverage
- [ ] All MCP tools functional
- [ ] Documentation complete

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Inaccurate key length | High | Medium | Multiple methods, human review |
| Wrong key character | Medium | Medium | Return top N candidates |
| Large data performance | Medium | Low | Chunked processing |

## Dependencies

### External

- None (pure JavaScript)

### Internal

- Sprint 1.1 (ToolRegistry)

## Notes

- xortool is Python but algorithms are pure logic
- Focus on text/ASCII targets initially
- Binary analysis is more complex (no clear "correct")

---

**Sprint Version:** 1.0.0
**Created:** 2025-12-17
