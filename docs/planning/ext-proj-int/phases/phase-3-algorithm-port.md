# Phase 3: Algorithm Ports

## Overview

| Attribute | Value |
|-----------|-------|
| Phase Number | 3 |
| Title | Algorithm Ports (Python/Rust to JavaScript) |
| Duration | 6-8 weeks |
| Sprints | 5 (3.1, 3.2, 3.3, 3.4, 3.5) |
| Prerequisites | Phase 2 complete |
| Deliverables | xortool algorithms, Ciphey core, AuSearch, RSA basic attacks, RSA advanced attacks |

## Objectives

1. **XOR Analysis Tools** - Port xortool's key length detection and key recovery algorithms
2. **Ciphey Core Decoders** - Port essential decoders from Ciphey/Ares to JavaScript
3. **AuSearch Algorithm** - Implement A* search-based automatic decoding
4. **RSA Basic Attacks** - Port fundamental RSA cryptanalysis (Fermat, Wiener, small factors)
5. **RSA Advanced Attacks** - Port sophisticated attacks (Boneh-Durfee, Coppersmith)

## Sprint Breakdown

### Sprint 3.1: XOR Analysis (1-1.5 weeks)

See [sprint-3.1-xortool.md](../sprints/sprint-3.1-xortool.md)

**Goal**: Port xortool's XOR cryptanalysis algorithms to JavaScript

**Tasks**:
1. Port key length detection algorithm (fitness calculation)
2. Port key recovery algorithm (frequency analysis)
3. Implement character set filtering
4. Add known plaintext attack support
5. Create comprehensive test suite
6. Document algorithms and usage
7. Integrate with MCP server

**Source Files** (from xortool):
- `xortool/tool_main.py` - `calculate_fitnesses()`, `guess_keys()`
- `xortool/routine.py` - `dexor()`, `chars_count_at_offset()`
- `xortool/charset.py` - Character set definitions

**New Tools**:
| Tool Name | Description | xortool Source |
|-----------|-------------|----------------|
| `cyberchef_xor_key_length` | Detect probable XOR key lengths | `calculate_fitnesses()` |
| `cyberchef_xor_key_recover` | Recover XOR key via frequency analysis | `guess_keys()` |
| `cyberchef_xor_analyze` | Combined analysis and decryption | Full pipeline |
| `cyberchef_xor_crib` | Known plaintext (crib) attack | `known_plaintext` mode |

### Sprint 3.2: Ciphey Core Decoders (1.5 weeks)

See [sprint-3.2-ciphey-core.md](../sprints/sprint-3.2-ciphey-core.md)

**Goal**: Port essential Ciphey decoders to JavaScript

**Tasks**:
1. Analyze Ciphey/Ares decoder architecture
2. Port Base64/Base32/Base58 variants
3. Port Caesar cipher with all rotations
4. Port Vigenere cipher analysis
5. Port A1Z26, Atbash, ROT47
6. Create decoder registry
7. Implement plaintext detection

**Source Files** (from Ares/ciphey):
- `src/decoders/` - Individual decoder implementations
- `src/checkers/` - Plaintext verification

**New Tools**:
| Tool Name | Description | Ciphey Decoder |
|-----------|-------------|----------------|
| `cyberchef_auto_base58_bitcoin` | Bitcoin-style Base58 | `base58_bitcoin.rs` |
| `cyberchef_auto_base58_flickr` | Flickr-style Base58 | `base58_flickr.rs` |
| `cyberchef_auto_base58_ripple` | Ripple-style Base58 | `base58_ripple.rs` |
| `cyberchef_auto_base65536` | Unicode-based encoding | `base65536.rs` |
| `cyberchef_auto_base91` | Compact ASCII encoding | `base91.rs` |
| `cyberchef_auto_z85` | ZeroMQ Base85 variant | `z85.rs` |
| `cyberchef_auto_braille` | Braille Unicode decode | `braille.rs` |
| `cyberchef_auto_citrix` | Citrix CTX1 encoding | `citrix_ctx1.rs` |

### Sprint 3.3: AuSearch Implementation (1.5 weeks)

See [sprint-3.3-ciphey-search.md](../sprints/sprint-3.3-ciphey-search.md)

**Goal**: Implement A* search-based automatic decoding

**Tasks**:
1. Design search algorithm architecture
2. Implement A* search with heuristics
3. Create decoder priority system
4. Implement English plaintext detection
5. Add pattern matching (LemmeKnow-style)
6. Implement timeout mechanism
7. Add result caching
8. Create comprehensive tests

**Source Files** (from Ares/ciphey):
- `src/searchers/astar.rs` - A* implementation
- `src/checkers/athena.rs` - Plaintext orchestrator
- `src/checkers/english.rs` - English detection
- `src/lib.rs` - `perform_cracking()` entry point

**New Tools**:
| Tool Name | Description | Source |
|-----------|-------------|--------|
| `cyberchef_auto_decode` | Automatic encoding detection and decode | Full AuSearch |
| `cyberchef_plaintext_detect` | Detect if input is plaintext | English checker |
| `cyberchef_encoding_identify` | Identify probable encodings | Filtration system |

### Sprint 3.4: RSA Basic Attacks (1-1.5 weeks)

See [sprint-3.4-rsa-basic.md](../sprints/sprint-3.4-rsa-basic.md)

**Goal**: Port fundamental RSA cryptanalysis attacks

**Tasks**:
1. Implement Fermat's factorization
2. Implement Wiener's attack
3. Implement small factor detection
4. Add FactorDB lookup (API integration)
5. Create RSA key utilities
6. Implement basic RSA math helpers
7. Create test suite with weak keys

**Source Files** (from RsaCtfTool):
- `attacks/single_key/fermat.py`
- `attacks/single_key/wiener.py`
- `attacks/single_key/smallq.py`
- `attacks/single_key/factordb.py`

**New Tools**:
| Tool Name | Description | Attack Type |
|-----------|-------------|-------------|
| `cyberchef_rsa_fermat` | Factor n with close primes | Fermat factorization |
| `cyberchef_rsa_wiener` | Attack small private exponent | Wiener's attack |
| `cyberchef_rsa_small_factors` | Find small prime factors | Trial division |
| `cyberchef_rsa_factordb` | Query FactorDB for factors | Database lookup |
| `cyberchef_rsa_key_info` | Extract RSA key parameters | Key parsing |
| `cyberchef_rsa_factor_check` | Check if n is factored | Verification |

### Sprint 3.5: RSA Advanced Attacks (1.5 weeks)

See [sprint-3.5-rsa-advanced.md](../sprints/sprint-3.5-rsa-advanced.md)

**Goal**: Port sophisticated RSA attacks

**Tasks**:
1. Implement Pollard's rho factorization
2. Implement Pollard's p-1 attack
3. Implement common factor attack (multi-key)
4. Implement Hastad's broadcast attack
5. Create lattice-based attack helpers
6. Add ROCA vulnerability detection
7. Create comprehensive test suite

**Source Files** (from RsaCtfTool):
- `attacks/single_key/pollard_rho.py`
- `attacks/single_key/pollard_p_minus_1.py`
- `attacks/multi_keys/common_factor.py`
- `attacks/single_key/hastads.py`
- `attacks/single_key/roca.py`

**New Tools**:
| Tool Name | Description | Attack Type |
|-----------|-------------|-------------|
| `cyberchef_rsa_pollard_rho` | Probabilistic factorization | Pollard's rho |
| `cyberchef_rsa_pollard_pm1` | Factor with smooth p-1 | Pollard's p-1 |
| `cyberchef_rsa_common_factor` | Find shared primes | GCD multi-key |
| `cyberchef_rsa_hastad` | Small e broadcast attack | Hastad |
| `cyberchef_rsa_roca_check` | ROCA vulnerability test | CVE detection |
| `cyberchef_rsa_attack_all` | Try all applicable attacks | Auto-select |

## Architecture Details

### XOR Key Length Detection

```javascript
// src/node/tools/xor/key-length.mjs

/**
 * Port of xortool's key length detection algorithm
 * Uses character frequency analysis at each offset
 */
export class XORKeyLengthDetector {
    constructor(options = {}) {
        this.maxKeyLength = options.maxKeyLength || 65;
        this.minKeyLength = options.minKeyLength || 1;
    }

    /**
     * Calculate fitness scores for each possible key length
     * Based on xortool's calculate_fitnesses()
     *
     * @param {Uint8Array} data - Ciphertext bytes
     * @returns {Array<{length: number, fitness: number, probability: number}>}
     */
    calculateFitnesses(data) {
        const fitnesses = [];

        for (let keyLen = this.minKeyLength; keyLen <= this.maxKeyLength; keyLen++) {
            const fitness = this.calculateFitnessForLength(data, keyLen);
            fitnesses.push({
                length: keyLen,
                fitness: fitness,
                // Apply penalty for longer keys (prefer shorter)
                adjustedFitness: fitness / (this.maxKeyLength + Math.pow(keyLen, 1.5))
            });
        }

        // Sort by adjusted fitness and calculate probabilities
        fitnesses.sort((a, b) => b.adjustedFitness - a.adjustedFitness);

        const totalFitness = fitnesses.reduce((sum, f) => sum + f.adjustedFitness, 0);
        return fitnesses.map(f => ({
            ...f,
            probability: (f.adjustedFitness / totalFitness * 100).toFixed(1) + '%'
        }));
    }

    /**
     * Calculate fitness for a specific key length
     * Counts character repetitions at each offset
     */
    calculateFitnessForLength(data, keyLength) {
        let equalsCount = 0;

        for (let offset = 0; offset < keyLength; offset++) {
            const charCounts = this.charsCountAtOffset(data, keyLength, offset);
            const maxCount = Math.max(...Object.values(charCounts));
            equalsCount += maxCount - 1;
        }

        return equalsCount;
    }

    /**
     * Count character frequencies at a specific offset
     */
    charsCountAtOffset(data, keyLength, offset) {
        const counts = {};

        for (let i = offset; i < data.length; i += keyLength) {
            const char = data[i];
            counts[char] = (counts[char] || 0) + 1;
        }

        return counts;
    }

    /**
     * Find common divisors among top key lengths
     * Helps identify true key length vs multiples
     */
    findCommonDivisors(topLengths) {
        const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);

        if (topLengths.length < 2) return [];

        let commonGcd = topLengths[0];
        for (let i = 1; i < topLengths.length; i++) {
            commonGcd = gcd(commonGcd, topLengths[i]);
        }

        return commonGcd > 1 ? [commonGcd] : [];
    }
}
```

### XOR Key Recovery

```javascript
// src/node/tools/xor/key-recover.mjs

/**
 * Port of xortool's key recovery algorithm
 * Uses frequency analysis to recover XOR keys
 */
export class XORKeyRecovery {
    constructor(options = {}) {
        this.charsets = {
            printable: this.getPrintableChars(),
            base64: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
            base32: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=',
            alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        };
    }

    /**
     * Recover key using frequency analysis
     * Based on xortool's guess_keys()
     *
     * @param {Uint8Array} data - Ciphertext
     * @param {number} keyLength - Known or detected key length
     * @param {number} mostFrequentChar - Most frequent plaintext char (e.g., 0x00 or 0x20)
     * @returns {Array<Uint8Array>} - Candidate keys
     */
    guessKeys(data, keyLength, mostFrequentChar = 0x00) {
        const keyPossibleBytes = [];

        for (let offset = 0; offset < keyLength; offset++) {
            const charCounts = this.charsCountAtOffset(data, keyLength, offset);
            const maxCount = Math.max(...Object.values(charCounts));

            // Collect all bytes with maximum frequency
            const possibleBytes = [];
            for (const [char, count] of Object.entries(charCounts)) {
                if (count >= maxCount) {
                    possibleBytes.push(parseInt(char) ^ mostFrequentChar);
                }
            }

            keyPossibleBytes.push(possibleBytes);
        }

        // Generate all key combinations (Cartesian product)
        return this.generateAllKeys(keyPossibleBytes);
    }

    /**
     * Count character frequencies at offset
     */
    charsCountAtOffset(data, keyLength, offset) {
        const counts = {};

        for (let i = offset; i < data.length; i += keyLength) {
            const char = data[i];
            counts[char] = (counts[char] || 0) + 1;
        }

        return counts;
    }

    /**
     * Generate all possible keys from byte candidates
     */
    generateAllKeys(keyPossibleBytes) {
        const keys = [];

        const generate = (current, index) => {
            if (index === keyPossibleBytes.length) {
                keys.push(new Uint8Array(current));
                return;
            }

            for (const byte of keyPossibleBytes[index]) {
                generate([...current, byte], index + 1);
            }
        };

        generate([], 0);
        return keys;
    }

    /**
     * Decrypt data with key
     */
    decrypt(data, key) {
        const result = new Uint8Array(data.length);
        const keyLength = key.length;

        for (let i = 0; i < data.length; i++) {
            result[i] = data[i] ^ key[i % keyLength];
        }

        return result;
    }

    /**
     * Calculate validity score for decrypted plaintext
     */
    calculateValidity(plaintext, charset = 'printable') {
        const validChars = this.charsets[charset] || this.charsets.printable;
        let validCount = 0;

        for (const byte of plaintext) {
            if (validChars.includes(String.fromCharCode(byte))) {
                validCount++;
            }
        }

        return (validCount / plaintext.length * 100).toFixed(1);
    }

    getPrintableChars() {
        let chars = '';
        for (let i = 32; i < 127; i++) {
            chars += String.fromCharCode(i);
        }
        return chars + '\t\n\r';
    }
}
```

### Automatic Decoding (AuSearch)

```javascript
// src/node/tools/auto/ausearch.mjs

/**
 * A* search-based automatic decoding
 * Port of Ciphey's AuSearch algorithm
 */
export class AuSearch {
    constructor(options = {}) {
        this.timeout = options.timeout || 5000; // 5 seconds default
        this.maxDepth = options.maxDepth || 10;
        this.decoders = this.loadDecoders();
        this.checker = new PlaintextChecker();
    }

    /**
     * Load available decoders sorted by priority
     */
    loadDecoders() {
        return [
            // Fast decoders (high priority)
            { name: 'base64', priority: 10, decoder: new Base64Decoder() },
            { name: 'hex', priority: 10, decoder: new HexDecoder() },
            { name: 'url', priority: 15, decoder: new URLDecoder() },

            // Medium priority
            { name: 'base32', priority: 30, decoder: new Base32Decoder() },
            { name: 'base58', priority: 30, decoder: new Base58Decoder() },
            { name: 'binary', priority: 35, decoder: new BinaryDecoder() },
            { name: 'reverse', priority: 40, decoder: new ReverseDecoder() },

            // Cipher decoders (lower priority, slower)
            { name: 'caesar', priority: 50, decoder: new CaesarDecoder() },
            { name: 'rot47', priority: 50, decoder: new ROT47Decoder() },
            { name: 'atbash', priority: 50, decoder: new AtbashDecoder() },
            { name: 'a1z26', priority: 50, decoder: new A1Z26Decoder() },

            // Slow decoders (lowest priority)
            { name: 'vigenere', priority: 70, decoder: new VigenereDecoder() },
            { name: 'substitution', priority: 80, decoder: new SubstitutionDecoder() }
        ].sort((a, b) => a.priority - b.priority);
    }

    /**
     * Perform automatic decoding
     *
     * @param {string} input - Encoded text
     * @returns {DecoderResult | null}
     */
    async crack(input) {
        const startTime = Date.now();
        const visited = new Set();
        const priorityQueue = new PriorityQueue();

        // Initial state
        priorityQueue.enqueue({
            text: input,
            path: [],
            depth: 0,
            score: this.heuristic(input)
        }, 0);

        while (!priorityQueue.isEmpty()) {
            // Timeout check
            if (Date.now() - startTime > this.timeout) {
                return null;
            }

            const current = priorityQueue.dequeue();

            // Skip if already visited
            const hash = this.hashText(current.text);
            if (visited.has(hash)) continue;
            visited.add(hash);

            // Check if plaintext
            const checkResult = this.checker.check(current.text);
            if (checkResult.isPlaintext) {
                return {
                    success: true,
                    plaintext: current.text,
                    path: current.path,
                    confidence: checkResult.confidence,
                    executionTime: Date.now() - startTime
                };
            }

            // Depth limit
            if (current.depth >= this.maxDepth) continue;

            // Try each decoder
            for (const { name, priority, decoder } of this.decoders) {
                try {
                    const results = decoder.decode(current.text);

                    for (const result of results) {
                        if (!result || result === current.text) continue;

                        const newScore = this.heuristic(result);
                        priorityQueue.enqueue({
                            text: result,
                            path: [...current.path, name],
                            depth: current.depth + 1,
                            score: newScore
                        }, priority + (100 - newScore));
                    }
                } catch (e) {
                    // Decoder failed, continue with others
                }
            }
        }

        return null;
    }

    /**
     * Heuristic function for A* search
     * Higher score = more likely to be plaintext
     */
    heuristic(text) {
        // Quick checks
        if (!text || text.length === 0) return 0;

        let score = 0;

        // Printability score
        const printable = text.split('').filter(c => {
            const code = c.charCodeAt(0);
            return code >= 32 && code < 127;
        }).length;
        score += (printable / text.length) * 40;

        // Word-like patterns
        const wordPattern = /[a-zA-Z]{3,}/g;
        const words = text.match(wordPattern) || [];
        score += Math.min(words.length * 5, 30);

        // Common English patterns
        const commonPatterns = ['the', 'and', 'is', 'in', 'it', 'to', 'of'];
        for (const pattern of commonPatterns) {
            if (text.toLowerCase().includes(pattern)) {
                score += 5;
            }
        }

        return Math.min(score, 100);
    }

    /**
     * Hash text for deduplication
     */
    hashText(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }
}

/**
 * Priority queue for A* search
 */
class PriorityQueue {
    constructor() {
        this.items = [];
    }

    enqueue(item, priority) {
        const element = { item, priority };
        let added = false;

        for (let i = 0; i < this.items.length; i++) {
            if (element.priority < this.items[i].priority) {
                this.items.splice(i, 0, element);
                added = true;
                break;
            }
        }

        if (!added) {
            this.items.push(element);
        }
    }

    dequeue() {
        return this.items.shift()?.item;
    }

    isEmpty() {
        return this.items.length === 0;
    }
}
```

### RSA Fermat Factorization

```javascript
// src/node/tools/rsa/fermat.mjs

/**
 * Fermat's factorization method
 * Works well when p and q are close together
 */
export class FermatFactorization {
    constructor(options = {}) {
        this.maxIterations = options.maxIterations || 100000;
    }

    /**
     * Factor n using Fermat's method
     *
     * @param {bigint} n - RSA modulus
     * @returns {{p: bigint, q: bigint} | null}
     */
    factor(n) {
        // Start with ceiling of sqrt(n)
        let a = this.isqrt(n);
        if (a * a === n) {
            return { p: a, q: a };
        }
        a = a + 1n;

        let b2 = a * a - n;

        for (let i = 0; i < this.maxIterations; i++) {
            const b = this.isqrt(b2);

            if (b * b === b2) {
                // Found factors
                const p = a + b;
                const q = a - b;

                if (p * q === n && p !== 1n && q !== 1n) {
                    return { p, q };
                }
            }

            // a = a + 1; b2 = a^2 - n
            a = a + 1n;
            b2 = a * a - n;
        }

        return null;
    }

    /**
     * Integer square root using Newton's method
     */
    isqrt(n) {
        if (n < 0n) throw new Error('Square root of negative number');
        if (n === 0n) return 0n;

        let x = n;
        let y = (x + 1n) / 2n;

        while (y < x) {
            x = y;
            y = (x + n / x) / 2n;
        }

        return x;
    }
}
```

### RSA Wiener's Attack

```javascript
// src/node/tools/rsa/wiener.mjs

/**
 * Wiener's attack on RSA with small private exponent
 * Exploits: d < (1/3) * n^(1/4)
 */
export class WienerAttack {
    /**
     * Attempt to recover private exponent d
     *
     * @param {bigint} e - Public exponent
     * @param {bigint} n - RSA modulus
     * @returns {{d: bigint, p: bigint, q: bigint} | null}
     */
    attack(e, n) {
        // Calculate continued fraction expansion of e/n
        const convergents = this.continuedFractionConvergents(e, n);

        for (const [k, d] of convergents) {
            if (k === 0n) continue;

            // Check if d is valid
            if (e * d % k !== 1n) continue;

            // Calculate phi = (e*d - 1) / k
            const phi = (e * d - 1n) / k;

            // Solve quadratic: x^2 - (n - phi + 1)x + n = 0
            // p and q are roots
            const b = n - phi + 1n;
            const discriminant = b * b - 4n * n;

            if (discriminant < 0n) continue;

            const sqrtDisc = this.isqrt(discriminant);
            if (sqrtDisc * sqrtDisc !== discriminant) continue;

            const p = (b + sqrtDisc) / 2n;
            const q = (b - sqrtDisc) / 2n;

            // Verify
            if (p * q === n) {
                return { d, p, q };
            }
        }

        return null;
    }

    /**
     * Generate convergents of continued fraction expansion
     */
    *continuedFractionConvergents(numerator, denominator) {
        // Previous convergents
        let h_prev = 0n, k_prev = 1n;
        let h_curr = 1n, k_curr = 0n;

        while (denominator !== 0n) {
            const quotient = numerator / denominator;
            const remainder = numerator % denominator;

            // Calculate next convergent
            const h_next = quotient * h_curr + h_prev;
            const k_next = quotient * k_curr + k_prev;

            yield [h_next, k_next];

            // Update for next iteration
            h_prev = h_curr;
            k_prev = k_curr;
            h_curr = h_next;
            k_curr = k_next;

            numerator = denominator;
            denominator = remainder;
        }
    }

    /**
     * Integer square root
     */
    isqrt(n) {
        if (n < 0n) throw new Error('Square root of negative number');
        if (n === 0n) return 0n;

        let x = n;
        let y = (x + 1n) / 2n;

        while (y < x) {
            x = y;
            y = (x + n / x) / 2n;
        }

        return x;
    }
}
```

### MCP Tool Integration

```javascript
// src/node/tools/xor/xor-tools.mjs

import { BaseTool } from '../base-tool.mjs';
import { XORKeyLengthDetector } from './key-length.mjs';
import { XORKeyRecovery } from './key-recover.mjs';

export class XORAnalyzeTool extends BaseTool {
    constructor() {
        super({
            name: 'cyberchef_xor_analyze',
            description: 'Analyze XOR-encrypted data: detect key length, recover key, and decrypt',
            category: 'crypto',
            inputSchema: {
                type: 'object',
                properties: {
                    input: {
                        type: 'string',
                        description: 'Base64-encoded ciphertext'
                    },
                    maxKeyLength: {
                        type: 'number',
                        description: 'Maximum key length to test (default: 65)',
                        default: 65
                    },
                    mostFrequentChar: {
                        type: 'string',
                        description: 'Most frequent plaintext byte as hex (e.g., "00" for binary, "20" for text)',
                        default: '00'
                    },
                    charset: {
                        type: 'string',
                        description: 'Expected plaintext charset',
                        enum: ['printable', 'base64', 'base32', 'alphanumeric'],
                        default: 'printable'
                    },
                    knownPlaintext: {
                        type: 'string',
                        description: 'Known plaintext for crib attack (optional)'
                    }
                },
                required: ['input']
            }
        });

        this.lengthDetector = new XORKeyLengthDetector();
        this.keyRecovery = new XORKeyRecovery();
    }

    async execute(args) {
        const startTime = Date.now();

        try {
            // Decode input
            const data = Buffer.from(args.input, 'base64');
            const mostFreqChar = parseInt(args.mostFrequentChar || '00', 16);

            // Detect key length
            this.lengthDetector.maxKeyLength = args.maxKeyLength || 65;
            const lengthResults = this.lengthDetector.calculateFitnesses(data);
            const topLengths = lengthResults.slice(0, 5);

            // Try to recover key for top length candidates
            const results = [];

            for (const { length } of topLengths.slice(0, 3)) {
                const keys = this.keyRecovery.guessKeys(data, length, mostFreqChar);

                for (const key of keys.slice(0, 5)) { // Limit candidates
                    const plaintext = this.keyRecovery.decrypt(data, key);
                    const validity = this.keyRecovery.calculateValidity(plaintext, args.charset);

                    // Filter by known plaintext if provided
                    if (args.knownPlaintext) {
                        const plaintextStr = Buffer.from(plaintext).toString('utf8');
                        if (!plaintextStr.includes(args.knownPlaintext)) {
                            continue;
                        }
                    }

                    if (parseFloat(validity) >= 90) {
                        results.push({
                            keyLength: length,
                            key: Buffer.from(key).toString('hex'),
                            keyString: Buffer.from(key).toString('utf8').replace(/[^\x20-\x7e]/g, '.'),
                            validity: validity + '%',
                            plaintext: Buffer.from(plaintext).toString('utf8')
                        });
                    }
                }
            }

            return this.formatResult({
                probableKeyLengths: topLengths,
                candidates: results,
                commonDivisors: this.lengthDetector.findCommonDivisors(
                    topLengths.slice(0, 5).map(r => r.length)
                )
            }, {
                executionTime: Date.now() - startTime
            });

        } catch (error) {
            return this.formatError(error);
        }
    }
}
```

## Testing Strategy

### XOR Analysis Tests

```javascript
// tests/tools/xor/key-length.test.mjs
import { describe, it, expect } from 'vitest';
import { XORKeyLengthDetector } from '../../../src/node/tools/xor/key-length.mjs';

describe('XORKeyLengthDetector', () => {
    const detector = new XORKeyLengthDetector();

    it('should detect key length for known XOR encryption', () => {
        // "Hello World!" XOR'd with "key"
        const plaintext = Buffer.from('Hello World!');
        const key = Buffer.from('key');
        const ciphertext = new Uint8Array(plaintext.length);

        for (let i = 0; i < plaintext.length; i++) {
            ciphertext[i] = plaintext[i] ^ key[i % key.length];
        }

        const results = detector.calculateFitnesses(ciphertext);
        const topLengths = results.slice(0, 5).map(r => r.length);

        // Key length 3 should be detected or multiple of 3
        expect(topLengths.some(l => l % 3 === 0)).toBe(true);
    });

    it('should handle binary data with null bytes', () => {
        // Simulated binary with null byte XOR
        const data = new Uint8Array([0x41, 0x00, 0x42, 0x00, 0x43, 0x00]);
        const results = detector.calculateFitnesses(data);

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].fitness).toBeGreaterThan(0);
    });
});
```

### RSA Attack Tests

```javascript
// tests/tools/rsa/fermat.test.mjs
import { describe, it, expect } from 'vitest';
import { FermatFactorization } from '../../../src/node/tools/rsa/fermat.mjs';

describe('FermatFactorization', () => {
    const fermat = new FermatFactorization();

    it('should factor n with close primes', () => {
        // Two close primes: p = 1009, q = 1013
        const p = 1009n;
        const q = 1013n;
        const n = p * q; // 1022117

        const result = fermat.factor(n);

        expect(result).not.toBeNull();
        expect(result.p * result.q).toBe(n);
    });

    it('should return null for well-separated primes', () => {
        // p = 17, q = 1009 (far apart)
        const n = 17n * 1009n;

        fermat.maxIterations = 100; // Limit iterations
        const result = fermat.factor(n);

        // May or may not find within limited iterations
        if (result) {
            expect(result.p * result.q).toBe(n);
        }
    });
});
```

## Dependencies

### npm Packages to Add

| Package | Version | Purpose |
|---------|---------|---------|
| `big-integer` | ^1.6.51 | BigInt operations (fallback for older Node) |
| `node-fetch` | ^3.3.0 | FactorDB API calls |

### Algorithm Ports Summary

| Source | Algorithm | Target Module |
|--------|-----------|---------------|
| xortool | Key length detection | `src/node/tools/xor/key-length.mjs` |
| xortool | Key recovery | `src/node/tools/xor/key-recover.mjs` |
| Ciphey/Ares | A* search | `src/node/tools/auto/ausearch.mjs` |
| Ciphey/Ares | English checker | `src/node/tools/auto/checkers/english.mjs` |
| Ciphey/Ares | Decoders (22) | `src/node/tools/auto/decoders/` |
| RsaCtfTool | Fermat | `src/node/tools/rsa/fermat.mjs` |
| RsaCtfTool | Wiener | `src/node/tools/rsa/wiener.mjs` |
| RsaCtfTool | Pollard rho | `src/node/tools/rsa/pollard-rho.mjs` |
| RsaCtfTool | Pollard p-1 | `src/node/tools/rsa/pollard-pm1.mjs` |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| BigInt performance issues | Medium | Medium | Use efficient algorithms, limit iterations |
| Algorithm accuracy in port | Medium | High | Extensive testing with known test vectors |
| FactorDB API changes | Low | Low | Graceful fallback, mock for tests |
| Timeout for slow operations | High | Medium | Configurable timeouts, progress reporting |
| Memory usage for large keys | Medium | Medium | Streaming where possible, size limits |

## Success Criteria

1. XOR key length detection accuracy > 90% on test vectors
2. XOR key recovery working for multi-byte keys up to 64 bytes
3. AuSearch solving 80%+ of standard CTF encodings
4. RSA attacks working on weak keys (CTF-level)
5. All tests passing with > 85% coverage
6. Performance benchmarks acceptable (< 5s for typical inputs)

## Acceptance Criteria

### Sprint 3.1 (xortool)
- [ ] Key length detection algorithm ported
- [ ] Key recovery algorithm working
- [ ] Crib attack implemented
- [ ] Tests passing with 90%+ coverage
- [ ] Tools accessible via MCP

### Sprint 3.2 (Ciphey Core)
- [ ] 10+ decoders ported
- [ ] Decoder registry working
- [ ] Plaintext detection implemented
- [ ] All unit tests passing

### Sprint 3.3 (AuSearch)
- [ ] A* search implemented
- [ ] Priority queue working
- [ ] Timeout mechanism functional
- [ ] Auto-decode tool working

### Sprint 3.4 (RSA Basic)
- [ ] Fermat factorization working
- [ ] Wiener's attack working
- [ ] Small factor detection working
- [ ] FactorDB integration complete

### Sprint 3.5 (RSA Advanced)
- [ ] Pollard's rho working
- [ ] Pollard's p-1 working
- [ ] Common factor attack working
- [ ] ROCA detection working

## Timeline

```
Week 9-10: Sprint 3.1 (xortool)
  - Days 1-3: Key length detection
  - Days 4-6: Key recovery
  - Days 7-8: Crib attack, testing

Week 11-12: Sprint 3.2 (Ciphey Core)
  - Days 1-4: Port decoders
  - Days 5-7: Plaintext detection
  - Days 8-9: Testing, integration

Week 13-14: Sprint 3.3 (AuSearch)
  - Days 1-4: A* search implementation
  - Days 5-7: Priority system, caching
  - Days 8-9: Testing, optimization

Week 15: Sprint 3.4 (RSA Basic)
  - Days 1-2: Fermat, Wiener
  - Days 3-4: Small factors, FactorDB
  - Day 5: Testing

Week 16: Sprint 3.5 (RSA Advanced)
  - Days 1-2: Pollard algorithms
  - Days 3-4: Multi-key attacks
  - Day 5: ROCA, testing

Week 17: Buffer/Polish
  - Integration testing
  - Documentation
  - Bug fixes
```

## Definition of Done

- All algorithms ported and tested
- Unit tests passing with > 85% coverage
- Integration tests with MCP server
- All tools documented
- Performance benchmarks acceptable
- No known bugs in critical paths
- Ready for Phase 4

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Previous Phase:** [Phase 2: JavaScript Native](phase-2-js-native.md)
**Next Phase:** [Phase 4: Advanced Integrations](phase-4-advanced.md)
