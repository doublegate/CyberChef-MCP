# Phase 4: Advanced Integrations

## Overview

| Attribute | Value |
|-----------|-------|
| Phase Number | 4 |
| Title | Advanced Integrations |
| Duration | 4-6 weeks |
| Sprints | 4 (4.1, 4.2, 4.3, 4.4) |
| Prerequisites | Phase 3 complete |
| Deliverables | Hash identification, pwntools utilities, CTF patterns, integration polish |

## Objectives

1. **Hash Identification** - Port John the Ripper hash detection patterns to JavaScript
2. **pwntools Utilities** - Adapt encoding/decoding and binary utilities
3. **CTF Automation** - Implement Katana-inspired analysis patterns
4. **Integration Polish** - Finalize all integrations, comprehensive testing, documentation

## Sprint Breakdown

### Sprint 4.1: Hash Identification (1-1.5 weeks)

See [sprint-4.1-hash-id.md](../sprints/sprint-4.1-hash-id.md)

**Goal**: Implement comprehensive hash type identification system

**Tasks**:
1. Analyze John the Ripper hash format signatures
2. Build hash pattern database (366+ formats)
3. Implement hash type detection algorithm
4. Create hash strength analyzer
5. Add recommended cracking approach suggestions
6. Build comprehensive test suite
7. Document hash format coverage

**New Tools**:
| Tool Name | Source | Description |
|-----------|--------|-------------|
| `cyberchef_hash_identify` | John | Identify hash type from hash string |
| `cyberchef_hash_analyze` | John | Analyze hash strength and characteristics |
| `cyberchef_hash_extract` | John | Extract hashes from text/files |
| `cyberchef_hash_validate` | John | Validate hash format correctness |
| `cyberchef_hash_info` | John | Get detailed info about hash type |

### Sprint 4.2: pwntools Utilities (1 week)

See [sprint-4.2-pwntools.md](../sprints/sprint-4.2-pwntools.md)

**Goal**: Port essential pwntools encoding and binary utilities

**Tasks**:
1. Port packing/unpacking utilities (p32, p64, u32, u64)
2. Implement cyclic pattern generation
3. Add XOR operations with multiple modes
4. Create hexdump formatting utilities
5. Port bit manipulation functions
6. Add entropy and checksum utilities
7. Test cross-platform compatibility

**New Tools**:
| Tool Name | Source | Description |
|-----------|--------|-------------|
| `cyberchef_pack_int` | pwntools | Pack integers to bytes (32/64-bit) |
| `cyberchef_unpack_int` | pwntools | Unpack bytes to integers |
| `cyberchef_cyclic_pattern` | pwntools | Generate de Bruijn sequences |
| `cyberchef_cyclic_find` | pwntools | Find offset in cyclic pattern |
| `cyberchef_xor_multi` | pwntools | Multi-mode XOR operations |
| `cyberchef_hexdump_format` | pwntools | Advanced hexdump formatting |
| `cyberchef_bits_convert` | pwntools | Bit array conversions |
| `cyberchef_fit_data` | pwntools | Fit data to specific length |

### Sprint 4.3: CTF Automation Patterns (1-1.5 weeks)

See [sprint-4.3-katana.md](../sprints/sprint-4.3-katana.md)

**Goal**: Implement CTF challenge analysis patterns from Katana

**Tasks**:
1. Build encoding detection pipeline
2. Implement classical cipher analysis
3. Create steganography detection hints
4. Add forensics pattern recognition
5. Build esoteric language detection
6. Create analysis orchestration system
7. Test across CTF challenge samples

**New Tools**:
| Tool Name | Source | Description |
|-----------|--------|-------------|
| `cyberchef_ctf_analyze` | Katana | Automated CTF data analysis |
| `cyberchef_encoding_detect` | Katana | Multi-encoding detection |
| `cyberchef_cipher_detect` | Katana | Classical cipher detection |
| `cyberchef_stego_hints` | Katana | Steganography technique hints |
| `cyberchef_esoteric_detect` | Katana | Esoteric language detection |
| `cyberchef_forensics_hints` | Katana | Forensics analysis suggestions |
| `cyberchef_analyze_pipeline` | Katana | Run analysis pipeline |

### Sprint 4.4: Integration Polish (1 week)

See [sprint-4.4-polish.md](../sprints/sprint-4.4-polish.md)

**Goal**: Final integration, comprehensive testing, documentation

**Tasks**:
1. Cross-tool integration testing
2. Performance optimization sweep
3. Error handling standardization
4. Documentation completion
5. Example workflow creation
6. Release preparation
7. Migration guide writing

**Deliverables**:
| Deliverable | Description |
|-------------|-------------|
| Integration tests | End-to-end tool chain tests |
| Performance report | Benchmarks for all new tools |
| User guide | Complete usage documentation |
| API reference | Full tool API documentation |
| Example recipes | Common workflow examples |
| Migration guide | Upgrade from v1.x instructions |

## Architecture Details

### Hash Identification System

```javascript
// src/node/tools/hash/hash-identifier.mjs

/**
 * Hash identification system ported from John the Ripper
 * Supports 366+ hash format patterns
 */

// Hash format signatures based on John's format detection
const HASH_PATTERNS = {
    // Unix/Linux
    md5crypt: {
        pattern: /^\$1\$[a-zA-Z0-9./]{0,8}\$[a-zA-Z0-9./]{22}$/,
        name: 'MD5 Crypt',
        description: 'Unix MD5 crypt format',
        johnFormat: '--format=md5crypt',
        example: '$1$salt$q2Z1Uxz5T9MKTL5c5Iqj20'
    },
    sha256crypt: {
        pattern: /^\$5\$(rounds=\d+\$)?[a-zA-Z0-9./]{0,16}\$[a-zA-Z0-9./]{43}$/,
        name: 'SHA-256 Crypt',
        description: 'Unix SHA-256 crypt format',
        johnFormat: '--format=sha256crypt',
        example: '$5$rounds=5000$salt$hash'
    },
    sha512crypt: {
        pattern: /^\$6\$(rounds=\d+\$)?[a-zA-Z0-9./]{0,16}\$[a-zA-Z0-9./]{86}$/,
        name: 'SHA-512 Crypt',
        description: 'Unix SHA-512 crypt format',
        johnFormat: '--format=sha512crypt',
        example: '$6$rounds=5000$salt$hash'
    },
    bcrypt: {
        pattern: /^\$2[aby]?\$\d{2}\$[a-zA-Z0-9./]{53}$/,
        name: 'bcrypt',
        description: 'Blowfish-based password hash',
        johnFormat: '--format=bcrypt',
        example: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
    },

    // Windows
    ntlm: {
        pattern: /^[a-fA-F0-9]{32}$/,
        name: 'NTLM (possible)',
        description: 'Windows NTLM hash (also matches raw MD5)',
        johnFormat: '--format=NT',
        example: 'a9fdfa038c4b75ebc76dc855dd74f0da',
        ambiguous: ['rawMd5']
    },
    lm: {
        pattern: /^[a-fA-F0-9]{32}$/,
        name: 'LM Hash',
        description: 'Legacy Windows LAN Manager hash',
        johnFormat: '--format=LM',
        example: 'aad3b435b51404eeaad3b435b51404ee',
        contextHint: 'Usually appears with NTLM, always uppercase letters'
    },

    // Raw hashes
    rawMd5: {
        pattern: /^[a-fA-F0-9]{32}$/,
        name: 'MD5',
        description: 'Raw MD5 hash (32 hex characters)',
        johnFormat: '--format=raw-md5',
        example: '5d41402abc4b2a76b9719d911017c592'
    },
    rawSha1: {
        pattern: /^[a-fA-F0-9]{40}$/,
        name: 'SHA-1',
        description: 'Raw SHA-1 hash (40 hex characters)',
        johnFormat: '--format=raw-sha1',
        example: 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d'
    },
    rawSha256: {
        pattern: /^[a-fA-F0-9]{64}$/,
        name: 'SHA-256',
        description: 'Raw SHA-256 hash (64 hex characters)',
        johnFormat: '--format=raw-sha256',
        example: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    },
    rawSha512: {
        pattern: /^[a-fA-F0-9]{128}$/,
        name: 'SHA-512',
        description: 'Raw SHA-512 hash (128 hex characters)',
        johnFormat: '--format=raw-sha512',
        example: 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce'
    },

    // Web applications
    djangoSha1: {
        pattern: /^sha1\$[a-zA-Z0-9]+\$[a-fA-F0-9]{40}$/,
        name: 'Django SHA-1',
        description: 'Django web framework SHA-1 password hash',
        johnFormat: '--format=django',
        example: 'sha1$salt$hash'
    },
    djangoPbkdf2Sha256: {
        pattern: /^pbkdf2_sha256\$\d+\$[a-zA-Z0-9+/]+\$[a-zA-Z0-9+/]+=*$/,
        name: 'Django PBKDF2 SHA-256',
        description: 'Django PBKDF2 with SHA-256',
        johnFormat: '--format=django',
        example: 'pbkdf2_sha256$iterations$salt$hash'
    },
    wordpress: {
        pattern: /^\$P\$[a-zA-Z0-9./]{31}$/,
        name: 'WordPress',
        description: 'WordPress portable hash',
        johnFormat: '--format=phpass',
        example: '$P$BhwlRnBhpC3cXonmKp/XKO4u1YPb8F1'
    },
    drupal7: {
        pattern: /^\$S\$[a-zA-Z0-9./]{52}$/,
        name: 'Drupal 7',
        description: 'Drupal 7 password hash',
        johnFormat: '--format=drupal7',
        example: '$S$DxBVpevB0Y9GxP.cVpnPdkr0E0bCL6bc2ejXhxeHRNpFwTFkXtJY'
    },

    // Database
    mysqlOld: {
        pattern: /^[a-fA-F0-9]{16}$/,
        name: 'MySQL (old)',
        description: 'MySQL old password hash (pre-4.1)',
        johnFormat: '--format=mysql',
        example: '606717496665bcba'
    },
    mysqlSha1: {
        pattern: /^\*[A-F0-9]{40}$/,
        name: 'MySQL SHA-1',
        description: 'MySQL SHA-1 password hash (4.1+)',
        johnFormat: '--format=mysql-sha1',
        example: '*2470C0C06DEE42FD1618BB99005ADCA2EC9D1E19'
    },
    oracle11g: {
        pattern: /^S:[A-F0-9]{60}$/,
        name: 'Oracle 11g',
        description: 'Oracle 11g password hash',
        johnFormat: '--format=oracle11',
        example: 'S:8F2D65FB5547B71C8DA3760F10960428CD307B1C6271691FC55C1F56554A'
    },

    // Archives
    zipPkzip: {
        pattern: /^\$pkzip2?\$/,
        name: 'PKZIP',
        description: 'PKZIP encrypted archive',
        johnFormat: '--format=pkzip',
        example: '$pkzip2$...'
    },
    rar3: {
        pattern: /^\$RAR3\$/,
        name: 'RAR3',
        description: 'RAR3 encrypted archive',
        johnFormat: '--format=rar',
        example: '$RAR3$*...'
    },
    sevenZip: {
        pattern: /^\$7z\$/,
        name: '7-Zip',
        description: '7-Zip encrypted archive',
        johnFormat: '--format=7z',
        example: '$7z$...'
    },

    // SSH
    sshRsa: {
        pattern: /^\$sshng\$[012]\$\d+\$/,
        name: 'SSH Private Key',
        description: 'SSH RSA/DSA/ECDSA/Ed25519 private key',
        johnFormat: '--format=ssh',
        example: '$sshng$0$16$...'
    },

    // Cryptocurrency
    bitcoin: {
        pattern: /^\$bitcoin\$/,
        name: 'Bitcoin Wallet',
        description: 'Bitcoin Core wallet encryption',
        johnFormat: '--format=bitcoin',
        example: '$bitcoin$...'
    },
    ethereum: {
        pattern: /^\$ethereum\$/,
        name: 'Ethereum Wallet',
        description: 'Ethereum wallet encryption',
        johnFormat: '--format=ethereum',
        example: '$ethereum$...'
    },

    // Password managers
    keepass: {
        pattern: /^\$keepass\$/,
        name: 'KeePass',
        description: 'KeePass database encryption',
        johnFormat: '--format=keepass',
        example: '$keepass$*...'
    },
    lastpass: {
        pattern: /^\$lastpass\$/,
        name: 'LastPass',
        description: 'LastPass vault encryption',
        johnFormat: '--format=lastpass',
        example: '$lastpass$...'
    },

    // Argon2 (modern)
    argon2: {
        pattern: /^\$argon2(i|d|id)\$/,
        name: 'Argon2',
        description: 'Argon2 password hash (modern)',
        johnFormat: '--format=argon2',
        example: '$argon2id$v=19$m=65536,t=3,p=4$...'
    }
};

export class HashIdentifier {
    constructor() {
        this.patterns = HASH_PATTERNS;
    }

    /**
     * Identify hash type from hash string
     * @param {string} hash - Hash string to identify
     * @returns {object} Identification results
     */
    identify(hash) {
        const trimmedHash = hash.trim();
        const matches = [];

        for (const [key, format] of Object.entries(this.patterns)) {
            if (format.pattern.test(trimmedHash)) {
                matches.push({
                    id: key,
                    name: format.name,
                    description: format.description,
                    johnFormat: format.johnFormat,
                    confidence: this.calculateConfidence(trimmedHash, format),
                    ambiguous: format.ambiguous || []
                });
            }
        }

        // Sort by confidence
        matches.sort((a, b) => b.confidence - a.confidence);

        return {
            hash: trimmedHash,
            hashLength: trimmedHash.length,
            matches: matches,
            bestMatch: matches[0] || null,
            isAmbiguous: matches.length > 1
        };
    }

    /**
     * Calculate confidence score for a match
     */
    calculateConfidence(hash, format) {
        let confidence = 70; // Base confidence for pattern match

        // Exact prefix/suffix matches increase confidence
        if (format.example) {
            const examplePrefix = format.example.split('$')[0];
            if (hash.startsWith(examplePrefix)) {
                confidence += 15;
            }
        }

        // Length match increases confidence
        if (format.expectedLength && hash.length === format.expectedLength) {
            confidence += 10;
        }

        // Unique patterns have higher confidence
        if (!format.ambiguous || format.ambiguous.length === 0) {
            confidence += 10;
        }

        return Math.min(confidence, 100);
    }

    /**
     * Analyze hash strength and characteristics
     */
    analyze(hash) {
        const identification = this.identify(hash);
        const analysis = {
            ...identification,
            characteristics: {
                length: hash.length,
                charset: this.detectCharset(hash),
                hasSalt: this.hasSalt(hash),
                isIterated: this.isIterated(hash),
                entropyBits: this.estimateEntropy(hash)
            },
            strength: this.assessStrength(identification.bestMatch)
        };

        return analysis;
    }

    /**
     * Detect character set used in hash
     */
    detectCharset(hash) {
        const charsets = [];
        if (/[a-z]/.test(hash)) charsets.push('lowercase');
        if (/[A-Z]/.test(hash)) charsets.push('uppercase');
        if (/[0-9]/.test(hash)) charsets.push('digits');
        if (/[^a-zA-Z0-9]/.test(hash)) charsets.push('special');
        return charsets;
    }

    /**
     * Check if hash contains salt
     */
    hasSalt(hash) {
        return /\$[a-zA-Z0-9./]+\$/.test(hash);
    }

    /**
     * Check if hash uses iteration count
     */
    isIterated(hash) {
        return /rounds=\d+|iterations=\d+|t=\d+/i.test(hash);
    }

    /**
     * Estimate hash entropy
     */
    estimateEntropy(hash) {
        // Approximate entropy based on hash length and charset
        const charset = this.detectCharset(hash);
        let charsetSize = 0;
        if (charset.includes('lowercase')) charsetSize += 26;
        if (charset.includes('uppercase')) charsetSize += 26;
        if (charset.includes('digits')) charsetSize += 10;
        if (charset.includes('special')) charsetSize += 32;

        return Math.round(Math.log2(charsetSize) * hash.length);
    }

    /**
     * Assess hash strength
     */
    assessStrength(match) {
        if (!match) return { level: 'unknown', score: 0, notes: [] };

        const notes = [];
        let score = 50;

        // Modern algorithms get higher scores
        const modernAlgorithms = ['bcrypt', 'argon2', 'sha512crypt', 'djangoPbkdf2Sha256'];
        const weakAlgorithms = ['rawMd5', 'rawSha1', 'lm', 'mysqlOld'];

        if (modernAlgorithms.includes(match.id)) {
            score += 40;
            notes.push('Uses modern, secure algorithm');
        } else if (weakAlgorithms.includes(match.id)) {
            score -= 30;
            notes.push('Uses weak or deprecated algorithm');
        }

        // Salt increases score
        if (match.id.includes('crypt') || match.id.includes('bcrypt')) {
            score += 10;
            notes.push('Hash includes salt');
        }

        // Determine level
        let level;
        if (score >= 80) level = 'strong';
        else if (score >= 60) level = 'moderate';
        else if (score >= 40) level = 'weak';
        else level = 'very-weak';

        return { level, score, notes };
    }

    /**
     * Extract hashes from text
     */
    extractFromText(text) {
        const hashes = [];
        const lines = text.split(/[\n\r]+/);

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length > 0) {
                const identification = this.identify(trimmed);
                if (identification.matches.length > 0) {
                    hashes.push({
                        original: trimmed,
                        ...identification
                    });
                }
            }
        }

        return hashes;
    }

    /**
     * Get information about a specific hash format
     */
    getFormatInfo(formatId) {
        return this.patterns[formatId] || null;
    }

    /**
     * List all supported formats
     */
    listFormats() {
        return Object.entries(this.patterns).map(([id, format]) => ({
            id,
            name: format.name,
            description: format.description
        }));
    }
}
```

### pwntools Utilities

```javascript
// src/node/tools/binary/pwntools-utils.mjs

/**
 * pwntools-inspired binary manipulation utilities
 * Ported for JavaScript MCP tool integration
 */

export class PwntoolsUtils {
    constructor(options = {}) {
        this.endian = options.endian || 'little';
        this.bits = options.bits || 64;
    }

    /**
     * Pack integer to bytes
     * @param {number|bigint} value - Integer to pack
     * @param {number} bits - Bit width (32 or 64)
     * @param {string} endian - Byte order ('little' or 'big')
     * @returns {Uint8Array} Packed bytes
     */
    pack(value, bits = this.bits, endian = this.endian) {
        const byteLength = bits / 8;
        const buffer = new ArrayBuffer(byteLength);
        const view = new DataView(buffer);

        const bigValue = BigInt(value);

        if (bits === 32) {
            if (endian === 'little') {
                view.setUint32(0, Number(bigValue & 0xFFFFFFFFn), true);
            } else {
                view.setUint32(0, Number(bigValue & 0xFFFFFFFFn), false);
            }
        } else if (bits === 64) {
            if (endian === 'little') {
                view.setBigUint64(0, bigValue, true);
            } else {
                view.setBigUint64(0, bigValue, false);
            }
        } else {
            throw new Error(`Unsupported bit width: ${bits}`);
        }

        return new Uint8Array(buffer);
    }

    /**
     * Convenience methods for packing
     */
    p32(value, endian = this.endian) {
        return this.pack(value, 32, endian);
    }

    p64(value, endian = this.endian) {
        return this.pack(value, 64, endian);
    }

    /**
     * Unpack bytes to integer
     * @param {Uint8Array|Buffer} data - Bytes to unpack
     * @param {number} bits - Bit width (32 or 64)
     * @param {string} endian - Byte order
     * @returns {bigint} Unpacked integer
     */
    unpack(data, bits = this.bits, endian = this.endian) {
        const buffer = data.buffer || new Uint8Array(data).buffer;
        const view = new DataView(buffer, data.byteOffset || 0);

        if (bits === 32) {
            return BigInt(view.getUint32(0, endian === 'little'));
        } else if (bits === 64) {
            return view.getBigUint64(0, endian === 'little');
        } else {
            throw new Error(`Unsupported bit width: ${bits}`);
        }
    }

    /**
     * Convenience methods for unpacking
     */
    u32(data, endian = this.endian) {
        return this.unpack(data, 32, endian);
    }

    u64(data, endian = this.endian) {
        return this.unpack(data, 64, endian);
    }

    /**
     * Generate de Bruijn sequence (cyclic pattern)
     * Used to find exact offsets in buffer overflows
     * @param {number} length - Pattern length
     * @param {string} alphabet - Character alphabet
     * @returns {string} Cyclic pattern
     */
    cyclic(length, alphabet = 'abcdefghijklmnopqrstuvwxyz') {
        const k = alphabet.length;
        const n = 4; // Subsequence length

        // de Bruijn sequence generator
        const sequence = [];
        const a = new Array(k * n).fill(0);

        function db(t, p) {
            if (sequence.length >= length) return;

            if (t > n) {
                if (n % p === 0) {
                    for (let j = 1; j <= p; j++) {
                        if (sequence.length >= length) return;
                        sequence.push(alphabet[a[j]]);
                    }
                }
            } else {
                a[t] = a[t - p];
                db(t + 1, p);
                for (let j = a[t - p] + 1; j < k; j++) {
                    if (sequence.length >= length) return;
                    a[t] = j;
                    db(t + 1, t);
                }
            }
        }

        db(1, 1);
        return sequence.slice(0, length).join('');
    }

    /**
     * Find offset of subsequence in cyclic pattern
     * @param {string|Uint8Array} subsequence - Subsequence to find
     * @param {string} alphabet - Same alphabet used for generation
     * @returns {number} Offset or -1 if not found
     */
    cyclicFind(subsequence, alphabet = 'abcdefghijklmnopqrstuvwxyz') {
        // Convert to string if needed
        const needle = typeof subsequence === 'string'
            ? subsequence
            : String.fromCharCode(...subsequence);

        // Generate enough pattern to search
        const pattern = this.cyclic(10000, alphabet);
        return pattern.indexOf(needle);
    }

    /**
     * XOR operations with multiple modes
     */
    xor(data, key, options = {}) {
        const dataBytes = typeof data === 'string'
            ? new TextEncoder().encode(data)
            : new Uint8Array(data);

        let keyBytes;
        if (typeof key === 'number') {
            keyBytes = new Uint8Array([key & 0xFF]);
        } else if (typeof key === 'string') {
            keyBytes = new TextEncoder().encode(key);
        } else {
            keyBytes = new Uint8Array(key);
        }

        const result = new Uint8Array(dataBytes.length);

        for (let i = 0; i < dataBytes.length; i++) {
            result[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
        }

        return result;
    }

    /**
     * Format data as hexdump
     */
    hexdump(data, options = {}) {
        const bytes = typeof data === 'string'
            ? new TextEncoder().encode(data)
            : new Uint8Array(data);

        const width = options.width || 16;
        const offset = options.offset || 0;
        const lines = [];

        for (let i = 0; i < bytes.length; i += width) {
            const address = (offset + i).toString(16).padStart(8, '0');
            const slice = bytes.slice(i, i + width);

            // Hex part
            const hexParts = [];
            for (let j = 0; j < width; j++) {
                if (j < slice.length) {
                    hexParts.push(slice[j].toString(16).padStart(2, '0'));
                } else {
                    hexParts.push('  ');
                }
                if (j === 7) hexParts.push(' '); // Middle separator
            }

            // ASCII part
            let ascii = '';
            for (let j = 0; j < slice.length; j++) {
                const byte = slice[j];
                ascii += (byte >= 0x20 && byte <= 0x7e) ? String.fromCharCode(byte) : '.';
            }

            lines.push(`${address}  ${hexParts.join(' ')}  |${ascii}|`);
        }

        return lines.join('\n');
    }

    /**
     * Convert to/from bits array
     */
    toBits(data) {
        const bytes = typeof data === 'string'
            ? new TextEncoder().encode(data)
            : new Uint8Array(data);

        const bits = [];
        for (const byte of bytes) {
            for (let i = 7; i >= 0; i--) {
                bits.push((byte >> i) & 1);
            }
        }
        return bits;
    }

    fromBits(bits) {
        const bytes = [];
        for (let i = 0; i < bits.length; i += 8) {
            let byte = 0;
            for (let j = 0; j < 8 && i + j < bits.length; j++) {
                byte = (byte << 1) | bits[i + j];
            }
            bytes.push(byte);
        }
        return new Uint8Array(bytes);
    }

    /**
     * Fit data to specific length with padding
     */
    fit(data, length, options = {}) {
        const filler = options.filler || 0x90; // NOP sled default
        const bytes = typeof data === 'string'
            ? new TextEncoder().encode(data)
            : new Uint8Array(data);

        const result = new Uint8Array(length).fill(
            typeof filler === 'number' ? filler : filler.charCodeAt(0)
        );

        // Copy data to result
        const copyLength = Math.min(bytes.length, length);
        result.set(bytes.slice(0, copyLength), 0);

        return result;
    }

    /**
     * Calculate entropy of data
     */
    entropy(data) {
        const bytes = typeof data === 'string'
            ? new TextEncoder().encode(data)
            : new Uint8Array(data);

        const freq = new Array(256).fill(0);
        for (const byte of bytes) {
            freq[byte]++;
        }

        let entropy = 0;
        const len = bytes.length;

        for (const count of freq) {
            if (count > 0) {
                const p = count / len;
                entropy -= p * Math.log2(p);
            }
        }

        return entropy;
    }

    /**
     * CRC32 checksum
     */
    crc32(data) {
        const bytes = typeof data === 'string'
            ? new TextEncoder().encode(data)
            : new Uint8Array(data);

        let crc = 0xFFFFFFFF;
        const table = this.getCRC32Table();

        for (const byte of bytes) {
            crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xFF];
        }

        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    getCRC32Table() {
        if (this._crc32Table) return this._crc32Table;

        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let crc = i;
            for (let j = 0; j < 8; j++) {
                crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
            }
            table[i] = crc >>> 0;
        }

        this._crc32Table = table;
        return table;
    }
}
```

### CTF Analysis Pipeline

```javascript
// src/node/tools/ctf/ctf-analyzer.mjs

/**
 * CTF challenge analysis system inspired by Katana
 * Provides automated detection and analysis hints
 */

export class CTFAnalyzer {
    constructor() {
        this.encodingDetectors = this.initEncodingDetectors();
        this.cipherDetectors = this.initCipherDetectors();
        this.stegoHints = this.initStegoHints();
        this.esotericDetectors = this.initEsotericDetectors();
    }

    /**
     * Initialize encoding detection patterns
     */
    initEncodingDetectors() {
        return [
            {
                name: 'base64',
                priority: 25,
                pattern: /^[A-Za-z0-9+/]+=*$/,
                minLength: 4,
                validate: (data) => data.length % 4 === 0 || data.endsWith('='),
                decode: (data) => Buffer.from(data, 'base64').toString('utf8')
            },
            {
                name: 'base32',
                priority: 60,
                pattern: /^[A-Z2-7]+=*$/,
                minLength: 8,
                validate: (data) => data.length % 8 === 0 || data.endsWith('=')
            },
            {
                name: 'hex',
                priority: 40,
                pattern: /^[0-9a-fA-F]+$/,
                minLength: 2,
                validate: (data) => data.length % 2 === 0
            },
            {
                name: 'binary',
                priority: 50,
                pattern: /^[01\s]+$/,
                minLength: 8,
                validate: (data) => data.replace(/\s/g, '').length % 8 === 0
            },
            {
                name: 'decimal_ascii',
                priority: 55,
                pattern: /^[\d\s,]+$/,
                minLength: 3,
                validate: (data) => {
                    const nums = data.split(/[\s,]+/).filter(n => n);
                    return nums.every(n => parseInt(n) >= 0 && parseInt(n) <= 255);
                }
            },
            {
                name: 'url_encoded',
                priority: 45,
                pattern: /%[0-9a-fA-F]{2}/,
                minLength: 3
            },
            {
                name: 'base58',
                priority: 65,
                pattern: /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/,
                minLength: 20
            },
            {
                name: 'base85',
                priority: 60,
                pattern: /^[!-u]+$/,
                minLength: 5
            }
        ];
    }

    /**
     * Initialize cipher detection patterns
     */
    initCipherDetectors() {
        return [
            {
                name: 'caesar',
                priority: 50,
                detect: (data) => {
                    // All alphabetic with possible spaces/punctuation
                    return /^[A-Za-z\s.,!?'"-]+$/.test(data) && data.length > 10;
                },
                hint: 'Try all 25 rotations'
            },
            {
                name: 'vigenere',
                priority: 60,
                detect: (data) => {
                    // Similar to Caesar but with key patterns
                    return /^[A-Za-z]+$/.test(data) && data.length > 20;
                },
                hint: 'Try common keys: FLAG, CTF, KEY, SECRET, PASSWORD'
            },
            {
                name: 'substitution',
                priority: 70,
                detect: (data) => {
                    // Alphabetic with word-like patterns but unusual letter frequencies
                    const isAlpha = /^[A-Za-z\s]+$/.test(data);
                    const hasWords = /\s/.test(data);
                    return isAlpha && hasWords && data.length > 50;
                },
                hint: 'Use frequency analysis or quipqiup.com'
            },
            {
                name: 'rot13',
                priority: 30,
                detect: (data) => {
                    return /^[A-Za-z\s]+$/.test(data);
                },
                hint: 'ROT13 is its own inverse'
            },
            {
                name: 'rot47',
                priority: 45,
                detect: (data) => {
                    return /^[\x21-\x7e]+$/.test(data);
                },
                hint: 'ROT47 rotates printable ASCII characters'
            },
            {
                name: 'atbash',
                priority: 55,
                detect: (data) => {
                    return /^[A-Za-z\s]+$/.test(data);
                },
                hint: 'Atbash reverses the alphabet (A=Z, B=Y, etc.)'
            },
            {
                name: 'rail_fence',
                priority: 65,
                detect: (data) => {
                    // Looks scrambled but maintains character set
                    return data.length > 20 && !/\s/.test(data);
                },
                hint: 'Try different rail counts (2-10)'
            },
            {
                name: 'morse',
                priority: 20,
                detect: (data) => {
                    return /^[.\-\/\s]+$/.test(data) ||
                           /^(\.|-|\/|\s)+$/.test(data);
                },
                hint: 'Morse code: dots, dashes, spaces'
            },
            {
                name: 'xor',
                priority: 50,
                detect: (data) => {
                    // Non-printable or high entropy
                    const bytes = new TextEncoder().encode(data);
                    const nonPrintable = bytes.filter(b => b < 32 || b > 126).length;
                    return nonPrintable > bytes.length * 0.2;
                },
                hint: 'Try single-byte XOR brute force, or look for key patterns'
            }
        ];
    }

    /**
     * Initialize steganography hints
     */
    initStegoHints() {
        return {
            image: [
                { tool: 'strings', hint: 'Check for hidden strings in binary' },
                { tool: 'exiftool', hint: 'Check image metadata (EXIF)' },
                { tool: 'steghide', hint: 'Extract with password (try common passwords)' },
                { tool: 'zsteg', hint: 'Check LSB in PNG/BMP (try: zsteg -a)' },
                { tool: 'stegsolve', hint: 'Visual analysis of image planes' },
                { tool: 'binwalk', hint: 'Check for embedded files' },
                { tool: 'outguess', hint: 'JPEG steganography extraction' },
                { tool: 'imagemagick', hint: 'Compare with original or analyze colors' }
            ],
            audio: [
                { tool: 'audacity', hint: 'Check spectrogram for hidden images' },
                { tool: 'sonic-visualiser', hint: 'Advanced spectrogram analysis' },
                { tool: 'deepsound', hint: 'Audio steganography extraction' },
                { tool: 'strings', hint: 'Check for hidden strings' },
                { tool: 'dtmf', hint: 'Check for DTMF tones (phone keypad)' },
                { tool: 'morse', hint: 'Listen for morse code patterns' }
            ],
            text: [
                { tool: 'stegsnow', hint: 'Whitespace steganography' },
                { tool: 'unicode', hint: 'Check for homoglyphs or zero-width characters' },
                { tool: 'spammimic', hint: 'Check if spam-encoded message' },
                { tool: 'acrostic', hint: 'Check first/last letters of lines' }
            ],
            pdf: [
                { tool: 'pdftotext', hint: 'Extract all text' },
                { tool: 'pdfimages', hint: 'Extract embedded images' },
                { tool: 'pdf-parser', hint: 'Analyze PDF structure' },
                { tool: 'javascript', hint: 'Check for embedded JavaScript' }
            ]
        };
    }

    /**
     * Initialize esoteric language detection
     */
    initEsotericDetectors() {
        return [
            {
                name: 'brainfuck',
                pattern: /^[\[\]<>+\-.,]+$/,
                hint: 'Brainfuck - Use online interpreter'
            },
            {
                name: 'ook',
                pattern: /^(Ook[.!?]\s*)+$/i,
                hint: 'Ook! - Brainfuck variant with Ook. Ook! Ook?'
            },
            {
                name: 'cow',
                pattern: /^(moo|MOO|MoO|moO|mOo|mOO|Moo|MOo)+$/i,
                hint: 'COW language - Brainfuck variant'
            },
            {
                name: 'jsfuck',
                pattern: /^[[\]()!+]+$/,
                hint: 'JSFuck - JavaScript subset, run in console'
            },
            {
                name: 'whitespace',
                pattern: /^[\s\t\n]+$/,
                hint: 'Whitespace language - Only spaces, tabs, newlines'
            },
            {
                name: 'malbolge',
                pattern: /^[!-~]+$/, // Broader check needed
                hint: 'Malbolge - Extremely difficult esoteric language',
                additionalCheck: (data) => data.length > 20 && /[!-~]/.test(data)
            },
            {
                name: 'piet',
                hint: 'Piet - Visual programming language using colors',
                fileTypes: ['png', 'gif', 'bmp']
            },
            {
                name: 'rockstar',
                pattern: /\b(say|listen|shout|whisper|scream)\b/i,
                hint: 'Rockstar - Programs look like song lyrics'
            }
        ];
    }

    /**
     * Analyze data and provide hints
     * @param {string|Buffer} input - Data to analyze
     * @returns {object} Analysis results
     */
    analyze(input) {
        const data = typeof input === 'string' ? input : input.toString('utf8');
        const trimmed = data.trim();

        const results = {
            input: {
                length: data.length,
                trimmedLength: trimmed.length,
                isPrintable: this.isPrintable(trimmed),
                entropy: this.calculateEntropy(data)
            },
            encodings: this.detectEncodings(trimmed),
            ciphers: this.detectCiphers(trimmed),
            esoteric: this.detectEsoteric(trimmed),
            suggestions: []
        };

        // Generate suggestions based on findings
        results.suggestions = this.generateSuggestions(results);

        return results;
    }

    /**
     * Detect possible encodings
     */
    detectEncodings(data) {
        const matches = [];

        for (const detector of this.encodingDetectors) {
            if (data.length < detector.minLength) continue;

            if (detector.pattern.test(data)) {
                const valid = !detector.validate || detector.validate(data);
                if (valid) {
                    matches.push({
                        name: detector.name,
                        priority: detector.priority,
                        confidence: this.calculateEncodingConfidence(data, detector)
                    });
                }
            }
        }

        return matches.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Detect possible ciphers
     */
    detectCiphers(data) {
        const matches = [];

        for (const detector of this.cipherDetectors) {
            if (detector.detect(data)) {
                matches.push({
                    name: detector.name,
                    priority: detector.priority,
                    hint: detector.hint
                });
            }
        }

        return matches.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Detect esoteric languages
     */
    detectEsoteric(data) {
        const matches = [];

        for (const detector of this.esotericDetectors) {
            if (detector.pattern && detector.pattern.test(data)) {
                const valid = !detector.additionalCheck || detector.additionalCheck(data);
                if (valid) {
                    matches.push({
                        name: detector.name,
                        hint: detector.hint
                    });
                }
            }
        }

        return matches;
    }

    /**
     * Generate steganography hints based on file type
     */
    getStegoHints(fileType) {
        const type = fileType.toLowerCase();

        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff'].includes(type)) {
            return this.stegoHints.image;
        } else if (['mp3', 'wav', 'flac', 'ogg'].includes(type)) {
            return this.stegoHints.audio;
        } else if (['txt', 'text'].includes(type)) {
            return this.stegoHints.text;
        } else if (type === 'pdf') {
            return this.stegoHints.pdf;
        }

        return [];
    }

    /**
     * Calculate encoding confidence
     */
    calculateEncodingConfidence(data, detector) {
        let confidence = 60;

        // Longer data that matches = higher confidence
        if (data.length > 100) confidence += 10;
        if (data.length > 500) confidence += 10;

        // Validation passing = higher confidence
        if (detector.validate && detector.validate(data)) {
            confidence += 15;
        }

        return Math.min(confidence, 100);
    }

    /**
     * Check if data is printable ASCII
     */
    isPrintable(data) {
        return /^[\x20-\x7e\n\r\t]+$/.test(data);
    }

    /**
     * Calculate Shannon entropy
     */
    calculateEntropy(data) {
        const freq = {};
        for (const char of data) {
            freq[char] = (freq[char] || 0) + 1;
        }

        let entropy = 0;
        const len = data.length;

        for (const count of Object.values(freq)) {
            const p = count / len;
            entropy -= p * Math.log2(p);
        }

        return entropy;
    }

    /**
     * Generate suggestions based on analysis
     */
    generateSuggestions(results) {
        const suggestions = [];

        // High entropy might be encrypted/compressed
        if (results.input.entropy > 6) {
            suggestions.push({
                type: 'info',
                message: 'High entropy detected - data may be encrypted or compressed'
            });
        }

        // Top encoding suggestions
        if (results.encodings.length > 0) {
            const top = results.encodings[0];
            suggestions.push({
                type: 'encoding',
                message: `Most likely encoding: ${top.name}`,
                tool: `cyberchef_from_${top.name}`
            });
        }

        // Cipher suggestions
        if (results.ciphers.length > 0) {
            for (const cipher of results.ciphers.slice(0, 3)) {
                suggestions.push({
                    type: 'cipher',
                    message: `Possible ${cipher.name} cipher`,
                    hint: cipher.hint
                });
            }
        }

        // Esoteric language suggestions
        if (results.esoteric.length > 0) {
            for (const lang of results.esoteric) {
                suggestions.push({
                    type: 'esoteric',
                    message: `Detected ${lang.name} programming language`,
                    hint: lang.hint
                });
            }
        }

        return suggestions;
    }
}
```

### MCP Tool Implementations

```javascript
// src/node/tools/hash/hash-tools.mjs

import { BaseTool } from '../base-tool.mjs';
import { HashIdentifier } from './hash-identifier.mjs';

const hashIdentifier = new HashIdentifier();

export class HashIdentifyTool extends BaseTool {
    constructor() {
        super({
            name: 'cyberchef_hash_identify',
            description: 'Identify hash type from a hash string. Supports 60+ hash formats including MD5, SHA, bcrypt, NTLM, and more.',
            category: 'hash',
            inputSchema: {
                type: 'object',
                properties: {
                    input: {
                        type: 'string',
                        description: 'Hash string to identify'
                    }
                },
                required: ['input']
            }
        });
    }

    async execute(args) {
        const startTime = Date.now();

        try {
            const result = hashIdentifier.identify(args.input);

            return this.formatResult({
                hash: result.hash,
                identified: result.bestMatch ? {
                    type: result.bestMatch.name,
                    description: result.bestMatch.description,
                    johnFormat: result.bestMatch.johnFormat,
                    confidence: result.bestMatch.confidence
                } : null,
                alternatives: result.matches.slice(1, 4).map(m => ({
                    type: m.name,
                    confidence: m.confidence
                })),
                isAmbiguous: result.isAmbiguous
            }, {
                executionTime: Date.now() - startTime
            });
        } catch (error) {
            return this.formatError(error);
        }
    }
}

export class HashAnalyzeTool extends BaseTool {
    constructor() {
        super({
            name: 'cyberchef_hash_analyze',
            description: 'Analyze hash strength and characteristics',
            category: 'hash',
            inputSchema: {
                type: 'object',
                properties: {
                    input: {
                        type: 'string',
                        description: 'Hash string to analyze'
                    }
                },
                required: ['input']
            }
        });
    }

    async execute(args) {
        const startTime = Date.now();

        try {
            const result = hashIdentifier.analyze(args.input);

            return this.formatResult({
                hash: result.hash,
                type: result.bestMatch?.name || 'Unknown',
                characteristics: result.characteristics,
                strength: result.strength
            }, {
                executionTime: Date.now() - startTime
            });
        } catch (error) {
            return this.formatError(error);
        }
    }
}

export class HashExtractTool extends BaseTool {
    constructor() {
        super({
            name: 'cyberchef_hash_extract',
            description: 'Extract and identify hashes from text',
            category: 'hash',
            inputSchema: {
                type: 'object',
                properties: {
                    input: {
                        type: 'string',
                        description: 'Text containing hashes'
                    }
                },
                required: ['input']
            }
        });
    }

    async execute(args) {
        const startTime = Date.now();

        try {
            const hashes = hashIdentifier.extractFromText(args.input);

            return this.formatResult({
                count: hashes.length,
                hashes: hashes.map(h => ({
                    hash: h.hash,
                    type: h.bestMatch?.name || 'Unknown',
                    confidence: h.bestMatch?.confidence || 0
                }))
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

### Hash Identification Tests

```javascript
// tests/tools/hash/hash-identifier.test.mjs
import { describe, it, expect } from 'vitest';
import { HashIdentifier } from '../../../src/node/tools/hash/hash-identifier.mjs';

describe('HashIdentifier', () => {
    const identifier = new HashIdentifier();

    describe('identify()', () => {
        it('should identify MD5 hash', () => {
            const result = identifier.identify('5d41402abc4b2a76b9719d911017c592');
            expect(result.matches.some(m => m.name === 'MD5')).toBe(true);
        });

        it('should identify SHA-1 hash', () => {
            const result = identifier.identify('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
            expect(result.bestMatch.name).toBe('SHA-1');
        });

        it('should identify bcrypt hash', () => {
            const hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
            const result = identifier.identify(hash);
            expect(result.bestMatch.name).toBe('bcrypt');
        });

        it('should identify SHA-512 crypt', () => {
            const hash = '$6$rounds=5000$saltsalt$hash86chars....';
            const result = identifier.identify(hash);
            expect(result.bestMatch.name).toContain('SHA-512');
        });

        it('should flag ambiguous 32-char hashes', () => {
            const result = identifier.identify('a9fdfa038c4b75ebc76dc855dd74f0da');
            expect(result.isAmbiguous).toBe(true);
            expect(result.matches.length).toBeGreaterThan(1);
        });
    });

    describe('analyze()', () => {
        it('should assess bcrypt as strong', () => {
            const hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
            const result = identifier.analyze(hash);
            expect(result.strength.level).toBe('strong');
        });

        it('should assess raw MD5 as weak', () => {
            const hash = '5d41402abc4b2a76b9719d911017c592';
            const result = identifier.analyze(hash);
            expect(['weak', 'very-weak', 'moderate']).toContain(result.strength.level);
        });
    });

    describe('extractFromText()', () => {
        it('should extract multiple hashes', () => {
            const text = `
                User1: 5d41402abc4b2a76b9719d911017c592
                User2: aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d
            `;
            const result = identifier.extractFromText(text);
            expect(result.length).toBe(2);
        });
    });
});
```

### pwntools Utility Tests

```javascript
// tests/tools/binary/pwntools-utils.test.mjs
import { describe, it, expect } from 'vitest';
import { PwntoolsUtils } from '../../../src/node/tools/binary/pwntools-utils.mjs';

describe('PwntoolsUtils', () => {
    const pwn = new PwntoolsUtils();

    describe('pack/unpack', () => {
        it('should pack 32-bit little endian', () => {
            const packed = pwn.p32(0xdeadbeef);
            expect(packed).toEqual(new Uint8Array([0xef, 0xbe, 0xad, 0xde]));
        });

        it('should pack 64-bit little endian', () => {
            const packed = pwn.p64(0xdeadbeefcafebabeN);
            expect(packed.length).toBe(8);
        });

        it('should unpack 32-bit', () => {
            const data = new Uint8Array([0xef, 0xbe, 0xad, 0xde]);
            const value = pwn.u32(data);
            expect(value).toBe(0xdeadbeefn);
        });

        it('should handle big endian', () => {
            const packed = pwn.p32(0xdeadbeef, 'big');
            expect(packed).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
        });
    });

    describe('cyclic', () => {
        it('should generate cyclic pattern', () => {
            const pattern = pwn.cyclic(100);
            expect(pattern.length).toBe(100);
        });

        it('should find offset in pattern', () => {
            const pattern = pwn.cyclic(1000);
            const offset = pwn.cyclicFind('faab');
            expect(offset).toBeGreaterThan(-1);
            expect(pattern.substring(offset, offset + 4)).toBe('faab');
        });
    });

    describe('xor', () => {
        it('should XOR with single byte key', () => {
            const result = pwn.xor('hello', 0x20);
            expect(result[0]).toBe('h'.charCodeAt(0) ^ 0x20);
        });

        it('should XOR with string key', () => {
            const result = pwn.xor('hello', 'key');
            expect(result[0]).toBe('h'.charCodeAt(0) ^ 'k'.charCodeAt(0));
        });
    });

    describe('hexdump', () => {
        it('should format hexdump correctly', () => {
            const dump = pwn.hexdump('Hello World!');
            expect(dump).toContain('48 65 6c 6c');
            expect(dump).toContain('|Hello World!|');
        });
    });

    describe('entropy', () => {
        it('should calculate low entropy for repeated data', () => {
            const entropy = pwn.entropy('aaaaaaaaaa');
            expect(entropy).toBeLessThan(1);
        });

        it('should calculate high entropy for random data', () => {
            const random = Array(256).fill(0).map((_, i) => String.fromCharCode(i)).join('');
            const entropy = pwn.entropy(random);
            expect(entropy).toBeGreaterThan(7);
        });
    });
});
```

### CTF Analyzer Tests

```javascript
// tests/tools/ctf/ctf-analyzer.test.mjs
import { describe, it, expect } from 'vitest';
import { CTFAnalyzer } from '../../../src/node/tools/ctf/ctf-analyzer.mjs';

describe('CTFAnalyzer', () => {
    const analyzer = new CTFAnalyzer();

    describe('detectEncodings()', () => {
        it('should detect base64', () => {
            const result = analyzer.analyze('SGVsbG8gV29ybGQh');
            expect(result.encodings.some(e => e.name === 'base64')).toBe(true);
        });

        it('should detect hex encoding', () => {
            const result = analyzer.analyze('48656c6c6f');
            expect(result.encodings.some(e => e.name === 'hex')).toBe(true);
        });

        it('should detect binary encoding', () => {
            const result = analyzer.analyze('01001000 01100101 01101100 01101100 01101111');
            expect(result.encodings.some(e => e.name === 'binary')).toBe(true);
        });
    });

    describe('detectCiphers()', () => {
        it('should detect possible Caesar cipher', () => {
            const result = analyzer.analyze('Wklv lv d vhfuhw phvvdjh');
            expect(result.ciphers.some(c => c.name === 'caesar')).toBe(true);
        });

        it('should detect morse code', () => {
            const result = analyzer.analyze('.... . .-.. .-.. --- / .-- --- .-. .-.. -..');
            expect(result.ciphers.some(c => c.name === 'morse')).toBe(true);
        });
    });

    describe('detectEsoteric()', () => {
        it('should detect brainfuck', () => {
            const result = analyzer.analyze('++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]');
            expect(result.esoteric.some(e => e.name === 'brainfuck')).toBe(true);
        });

        it('should detect JSFuck', () => {
            const result = analyzer.analyze('[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]]');
            expect(result.esoteric.some(e => e.name === 'jsfuck')).toBe(true);
        });
    });

    describe('getStegoHints()', () => {
        it('should return image stego hints', () => {
            const hints = analyzer.getStegoHints('png');
            expect(hints.length).toBeGreaterThan(0);
            expect(hints.some(h => h.tool === 'zsteg')).toBe(true);
        });

        it('should return audio stego hints', () => {
            const hints = analyzer.getStegoHints('wav');
            expect(hints.some(h => h.tool === 'audacity')).toBe(true);
        });
    });
});
```

## Dependencies

### npm Packages to Add

| Package | Version | Purpose |
|---------|---------|---------|
| None | - | All implementations are pure JavaScript |

### External Tool Recommendations

For full CTF workflows, users should have these tools installed (not required for MCP tools):
- **John the Ripper** - Password hash cracking
- **steghide** - Image steganography
- **binwalk** - Firmware analysis
- **zsteg** - PNG/BMP steganography
- **tesseract** - OCR

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Hash pattern collisions | Medium | Low | Multiple match reporting |
| Performance with large inputs | Medium | Medium | Input size limits, streaming |
| Incomplete hash coverage | Low | Medium | Prioritize common formats first |
| CTF pattern false positives | High | Low | Present as hints, not certainties |

## Success Criteria

1. 60+ hash formats identifiable
2. All pwntools core utilities ported
3. CTF analysis providing useful hints
4. All tests passing (> 90% coverage)
5. Documentation complete
6. Integration with existing tools seamless

## Acceptance Criteria

### Sprint 4.1 (Hash Identification)
- [ ] 60+ hash formats detected
- [ ] Hash strength analysis working
- [ ] Hash extraction from text working
- [ ] John format recommendations accurate
- [ ] All unit tests passing

### Sprint 4.2 (pwntools)
- [ ] Pack/unpack working (32/64-bit, both endians)
- [ ] Cyclic pattern generation working
- [ ] XOR operations complete
- [ ] Hexdump formatting correct
- [ ] Entropy calculation accurate

### Sprint 4.3 (CTF Analysis)
- [ ] Encoding detection working
- [ ] Cipher hints accurate
- [ ] Esoteric language detection working
- [ ] Steganography hints complete
- [ ] Analysis pipeline integrated

### Sprint 4.4 (Polish)
- [ ] All cross-tool tests passing
- [ ] Performance benchmarks acceptable
- [ ] Documentation complete
- [ ] Example workflows documented
- [ ] Ready for v2.0.0 release

## Timeline

```
Week 13: Sprint 4.1 (Hash ID)
  - Days 1-2: Hash pattern database
  - Days 3-4: Identification algorithm
  - Day 5: Testing and integration

Week 14: Sprint 4.2 (pwntools)
  - Days 1-2: Pack/unpack, cyclic
  - Days 3-4: XOR, hexdump, bits
  - Day 5: Entropy, checksums

Week 15: Sprint 4.3 (CTF Analysis)
  - Days 1-2: Encoding detection
  - Days 3-4: Cipher and esoteric detection
  - Day 5: Stego hints, pipeline

Week 16-17: Sprint 4.4 (Polish)
  - Week 16: Integration testing, optimization
  - Week 17: Documentation, release prep
```

## Definition of Done

- All code reviewed and merged
- Unit tests passing with > 90% coverage
- Integration tests passing
- All new tools documented
- No known bugs
- Performance benchmarks established
- v2.0.0 release notes drafted
- Migration guide complete

## Tool Summary

### New Tools Added in Phase 4

| Category | Tool | Description |
|----------|------|-------------|
| Hash | `cyberchef_hash_identify` | Identify hash type |
| Hash | `cyberchef_hash_analyze` | Analyze hash strength |
| Hash | `cyberchef_hash_extract` | Extract hashes from text |
| Hash | `cyberchef_hash_validate` | Validate hash format |
| Hash | `cyberchef_hash_info` | Get hash format info |
| Binary | `cyberchef_pack_int` | Pack integers to bytes |
| Binary | `cyberchef_unpack_int` | Unpack bytes to integers |
| Binary | `cyberchef_cyclic_pattern` | Generate de Bruijn sequences |
| Binary | `cyberchef_cyclic_find` | Find offset in pattern |
| Binary | `cyberchef_xor_multi` | Multi-mode XOR |
| Binary | `cyberchef_hexdump_format` | Advanced hexdump |
| Binary | `cyberchef_bits_convert` | Bit array conversions |
| Binary | `cyberchef_fit_data` | Fit data to length |
| CTF | `cyberchef_ctf_analyze` | Automated analysis |
| CTF | `cyberchef_encoding_detect` | Multi-encoding detection |
| CTF | `cyberchef_cipher_detect` | Classical cipher detection |
| CTF | `cyberchef_stego_hints` | Steganography hints |
| CTF | `cyberchef_esoteric_detect` | Esoteric language detection |
| CTF | `cyberchef_forensics_hints` | Forensics suggestions |
| CTF | `cyberchef_analyze_pipeline` | Run analysis pipeline |

**Total New Tools:** 20

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Previous Phase:** [Phase 3: Algorithm Ports](phase-3-algorithm-port.md)
**Next:** Release v2.0.0
