# Katana Integration Plan

## Overview

| Attribute | Value |
|-----------|-------|
| Project | Katana |
| Phase | Phase 2 (JavaScript Native) |
| Priority | Medium |
| Complexity | Medium |
| Estimated Effort | 3 days |
| Dependencies | None (pure JavaScript implementation) |

## Integration Scope

Katana is a CTF automation framework with 60+ analysis units across 15 categories. This integration focuses on porting the analytical patterns and detection logic, NOT the execution framework or active attack capabilities.

### In Scope

1. **Encoding Detection** - Automatic identification of encoding types
2. **Encoding Chain Resolver** - Multi-layer encoding detection and resolution
3. **Classical Cipher Detection** - Identify cipher types from ciphertext patterns
4. **File Type Analysis** - Magic byte detection and file type identification
5. **CTF Analysis Pipeline** - Coordinated analysis workflow

### Out of Scope

- Web attack units (SQL injection, NoSQL injection, web shells)
- Password cracking units
- Active network operations
- Binary execution (ltrace, apktool)
- External tool wrappers (steghide, binwalk, tesseract)

## Integration Philosophy

Katana's value lies in its systematic approach to CTF analysis. Rather than porting individual units, we extract the **pattern recognition logic** and **analysis strategies** to create intelligent detection tools.

## MCP Tools

### Tool 1: cyberchef_encoding_detect

**Purpose**: Automatic encoding type detection with confidence scoring

```javascript
{
    name: 'cyberchef_encoding_detect',
    description: 'Detect encoding type(s) present in input data',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'Input data to analyze'
            },
            detect_all: {
                type: 'boolean',
                default: false,
                description: 'Return all possible encodings vs. best match'
            },
            threshold: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                default: 0.7,
                description: 'Confidence threshold (0-1)'
            }
        },
        required: ['input']
    }
}
```

**Implementation**:

```javascript
// src/node/tools/katana/encoding-detect.mjs

export const ENCODING_PATTERNS = {
    base64: {
        pattern: /^[A-Za-z0-9+/]+=*$/,
        lengthCheck: (len) => len % 4 === 0 || len % 4 === 2 || len % 4 === 3,
        minLength: 4,
        charsetValid: (s) => /^[A-Za-z0-9+/=]+$/.test(s),
        priority: 25  // From Katana
    },
    base64url: {
        pattern: /^[A-Za-z0-9_-]+=*$/,
        lengthCheck: (len) => len % 4 === 0 || len % 4 === 2 || len % 4 === 3,
        minLength: 4,
        charsetValid: (s) => /^[A-Za-z0-9_-=]+$/.test(s),
        priority: 26
    },
    base32: {
        pattern: /^[A-Z2-7]+=*$/i,
        lengthCheck: (len) => len % 8 === 0,
        minLength: 8,
        charsetValid: (s) => /^[A-Z2-7=]+$/i.test(s),
        priority: 60
    },
    base58: {
        pattern: /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/,
        minLength: 10,
        charsetValid: (s) => !/[0OIl]/.test(s),  // No ambiguous chars
        priority: 60
    },
    hex: {
        pattern: /^[0-9A-Fa-f]+$/,
        lengthCheck: (len) => len % 2 === 0,
        minLength: 2,
        charsetValid: (s) => /^[0-9A-Fa-f]+$/.test(s),
        priority: 50
    },
    binary: {
        pattern: /^[01\s]+$/,
        lengthCheck: (len) => {
            const cleaned = len.toString().replace(/\s/g, '');
            return cleaned.length % 8 === 0;
        },
        minLength: 8,
        charsetValid: (s) => /^[01\s]+$/.test(s),
        priority: 50
    },
    decimal: {
        pattern: /^(\d{1,3}[\s,]+)+\d{1,3}$/,
        minLength: 3,
        charsetValid: (s) => {
            const nums = s.split(/[\s,]+/).map(n => parseInt(n, 10));
            return nums.every(n => n >= 0 && n <= 255);
        },
        priority: 50
    },
    urlencoded: {
        pattern: /%[0-9A-Fa-f]{2}/,
        minLength: 3,
        charsetValid: (s) => /%[0-9A-Fa-f]{2}/.test(s),
        priority: 50
    },
    base85: {
        pattern: /^[!-u]+$/,  // ASCII 33-117
        minLength: 5,
        charsetValid: (s) => /^[!-u]+$/.test(s),
        priority: 60
    }
};

export class EncodingDetector {
    /**
     * Detect encoding type with confidence score
     * @param {string} input - Data to analyze
     * @returns {Array<{encoding: string, confidence: number}>}
     */
    static detect(input) {
        const cleaned = input.trim();
        const results = [];

        for (const [encoding, spec] of Object.entries(ENCODING_PATTERNS)) {
            const confidence = this.calculateConfidence(cleaned, spec);
            if (confidence > 0) {
                results.push({ encoding, confidence, priority: spec.priority });
            }
        }

        // Sort by confidence, then by priority (lower = higher priority)
        return results.sort((a, b) => {
            if (b.confidence !== a.confidence) return b.confidence - a.confidence;
            return a.priority - b.priority;
        });
    }

    /**
     * Calculate confidence score for encoding match
     */
    static calculateConfidence(input, spec) {
        let score = 0;

        // Length check
        if (input.length < spec.minLength) return 0;

        // Pattern match
        if (spec.pattern && spec.pattern.test(input)) {
            score += 0.3;
        }

        // Charset validation
        if (spec.charsetValid && spec.charsetValid(input)) {
            score += 0.3;
        }

        // Length divisibility check
        if (spec.lengthCheck) {
            if (spec.lengthCheck(input.length)) {
                score += 0.2;
            }
        }

        // Attempt decode validation
        try {
            if (this.tryDecode(input, spec)) {
                score += 0.2;
            }
        } catch (e) {
            // Decode failed, don't add score
        }

        return Math.min(score, 1.0);
    }

    /**
     * Try to decode and validate result
     */
    static tryDecode(input, spec) {
        // Implementation would attempt actual decode
        // and check if result is valid (printable, etc.)
        return true;  // Simplified
    }

    /**
     * Get best encoding match
     */
    static getBestMatch(input) {
        const results = this.detect(input);
        return results.length > 0 ? results[0] : null;
    }
}
```

### Tool 2: cyberchef_encoding_chain

**Purpose**: Detect and resolve multi-layer encoding chains

```javascript
{
    name: 'cyberchef_encoding_chain',
    description: 'Detect and automatically decode multi-layer encoding chains',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'Input data with potential nested encodings'
            },
            max_depth: {
                type: 'integer',
                minimum: 1,
                maximum: 20,
                default: 10,
                description: 'Maximum decoding iterations'
            },
            stop_on_ascii: {
                type: 'boolean',
                default: true,
                description: 'Stop when output is readable ASCII'
            },
            return_chain: {
                type: 'boolean',
                default: true,
                description: 'Include encoding chain in output'
            }
        },
        required: ['input']
    }
}
```

**Implementation**:

```javascript
// src/node/tools/katana/encoding-chain.mjs
import { EncodingDetector } from './encoding-detect.mjs';

export class EncodingChainResolver {
    /**
     * Resolve multi-layer encoding
     * @param {string} input - Encoded input
     * @param {object} options - Resolution options
     * @returns {object} - Decoded result with chain
     */
    static resolve(input, options = {}) {
        const {
            maxDepth = 10,
            stopOnAscii = true,
            confidenceThreshold = 0.6
        } = options;

        const chain = [];
        let current = input;
        let depth = 0;

        while (depth < maxDepth) {
            // Detect encoding
            const detection = EncodingDetector.getBestMatch(current);

            if (!detection || detection.confidence < confidenceThreshold) {
                break;  // No confident detection
            }

            // Attempt decode
            const decoded = this.decode(current, detection.encoding);

            if (!decoded || decoded === current) {
                break;  // Decode failed or no change
            }

            chain.push({
                encoding: detection.encoding,
                confidence: detection.confidence,
                inputLength: current.length,
                outputLength: decoded.length
            });

            current = decoded;
            depth++;

            // Check stop condition
            if (stopOnAscii && this.isReadableAscii(current)) {
                break;
            }
        }

        return {
            output: current,
            chain: chain,
            depth: depth,
            isComplete: this.isReadableAscii(current)
        };
    }

    /**
     * Decode using specific encoding
     */
    static decode(input, encoding) {
        switch (encoding) {
            case 'base64':
            case 'base64url':
                return this.decodeBase64(input);
            case 'base32':
                return this.decodeBase32(input);
            case 'hex':
                return this.decodeHex(input);
            case 'binary':
                return this.decodeBinary(input);
            case 'decimal':
                return this.decodeDecimal(input);
            case 'urlencoded':
                return decodeURIComponent(input);
            default:
                return null;
        }
    }

    /**
     * Check if string is readable ASCII
     */
    static isReadableAscii(str) {
        // At least 80% printable ASCII
        let printable = 0;
        for (const char of str) {
            const code = char.charCodeAt(0);
            if (code >= 32 && code <= 126) printable++;
        }
        return printable / str.length >= 0.8;
    }

    static decodeBase64(input) {
        try {
            return Buffer.from(input, 'base64').toString('utf8');
        } catch (e) {
            return null;
        }
    }

    static decodeBase32(input) {
        // Base32 decode implementation
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        const cleaned = input.toUpperCase().replace(/=/g, '');
        let bits = '';

        for (const char of cleaned) {
            const idx = alphabet.indexOf(char);
            if (idx === -1) return null;
            bits += idx.toString(2).padStart(5, '0');
        }

        const bytes = [];
        for (let i = 0; i + 8 <= bits.length; i += 8) {
            bytes.push(parseInt(bits.substr(i, 8), 2));
        }

        return String.fromCharCode(...bytes);
    }

    static decodeHex(input) {
        const bytes = [];
        for (let i = 0; i < input.length; i += 2) {
            bytes.push(parseInt(input.substr(i, 2), 16));
        }
        return String.fromCharCode(...bytes);
    }

    static decodeBinary(input) {
        const cleaned = input.replace(/\s/g, '');
        const bytes = [];
        for (let i = 0; i < cleaned.length; i += 8) {
            bytes.push(parseInt(cleaned.substr(i, 8), 2));
        }
        return String.fromCharCode(...bytes);
    }

    static decodeDecimal(input) {
        const nums = input.split(/[\s,]+/).map(n => parseInt(n, 10));
        return String.fromCharCode(...nums);
    }
}
```

### Tool 3: cyberchef_cipher_detect

**Purpose**: Detect classical cipher types from ciphertext characteristics

```javascript
{
    name: 'cyberchef_cipher_detect',
    description: 'Detect classical cipher types based on ciphertext analysis',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'Ciphertext to analyze'
            },
            analyze_frequency: {
                type: 'boolean',
                default: true,
                description: 'Include frequency analysis'
            }
        },
        required: ['input']
    }
}
```

**Implementation**:

```javascript
// src/node/tools/katana/cipher-detect.mjs

export const CIPHER_SIGNATURES = {
    caesar: {
        traits: ['monoalphabetic', 'preserves_case', 'preserves_spaces'],
        indicatorOfCoincidence: { min: 0.055, max: 0.075 },
        description: 'Simple shift cipher (ROT)'
    },
    atbash: {
        traits: ['monoalphabetic', 'reversal'],
        indicatorOfCoincidence: { min: 0.055, max: 0.075 },
        description: 'Reverse alphabet substitution'
    },
    substitution: {
        traits: ['monoalphabetic', 'arbitrary_mapping'],
        indicatorOfCoincidence: { min: 0.055, max: 0.075 },
        description: 'General monoalphabetic substitution'
    },
    vigenere: {
        traits: ['polyalphabetic', 'keyword_based'],
        indicatorOfCoincidence: { min: 0.038, max: 0.055 },
        description: 'Polyalphabetic keyword cipher'
    },
    rail_fence: {
        traits: ['transposition', 'zigzag_pattern'],
        indicatorOfCoincidence: { min: 0.055, max: 0.075 },
        description: 'Rail fence transposition'
    },
    rot47: {
        traits: ['monoalphabetic', 'printable_ascii'],
        charsetCheck: (s) => /^[!-~]+$/.test(s),
        description: 'ROT47 (printable ASCII rotation)'
    },
    affine: {
        traits: ['monoalphabetic', 'mathematical'],
        indicatorOfCoincidence: { min: 0.055, max: 0.075 },
        description: 'Affine cipher (ax + b mod 26)'
    }
};

export class CipherDetector {
    /**
     * Analyze ciphertext and detect likely cipher type
     */
    static detect(input) {
        const analysis = {
            length: input.length,
            charsetType: this.determineCharset(input),
            ioc: this.indexOfCoincidence(input),
            frequencyDistribution: this.frequencyAnalysis(input),
            possibleCiphers: []
        };

        // Score each cipher type
        for (const [cipher, spec] of Object.entries(CIPHER_SIGNATURES)) {
            const score = this.scoreCipher(input, analysis, spec);
            if (score > 0.3) {
                analysis.possibleCiphers.push({
                    cipher,
                    confidence: score,
                    description: spec.description
                });
            }
        }

        // Sort by confidence
        analysis.possibleCiphers.sort((a, b) => b.confidence - a.confidence);

        return analysis;
    }

    /**
     * Calculate Index of Coincidence
     * IC for English is ~0.067, random is ~0.038
     */
    static indexOfCoincidence(text) {
        const cleaned = text.toLowerCase().replace(/[^a-z]/g, '');
        if (cleaned.length < 2) return 0;

        const freq = {};
        for (const char of cleaned) {
            freq[char] = (freq[char] || 0) + 1;
        }

        let sum = 0;
        for (const count of Object.values(freq)) {
            sum += count * (count - 1);
        }

        const n = cleaned.length;
        return sum / (n * (n - 1));
    }

    /**
     * Frequency analysis
     */
    static frequencyAnalysis(text) {
        const cleaned = text.toLowerCase().replace(/[^a-z]/g, '');
        const freq = {};

        for (const char of cleaned) {
            freq[char] = (freq[char] || 0) + 1;
        }

        // Convert to percentages
        const total = cleaned.length;
        const distribution = {};
        for (const [char, count] of Object.entries(freq)) {
            distribution[char] = (count / total * 100).toFixed(2);
        }

        return distribution;
    }

    /**
     * Determine character set type
     */
    static determineCharset(input) {
        if (/^[A-Za-z\s]+$/.test(input)) return 'alphabetic';
        if (/^[A-Za-z0-9\s]+$/.test(input)) return 'alphanumeric';
        if (/^[!-~]+$/.test(input)) return 'printable_ascii';
        if (/^[0-9\s]+$/.test(input)) return 'numeric';
        return 'mixed';
    }

    /**
     * Score cipher likelihood
     */
    static scoreCipher(input, analysis, spec) {
        let score = 0;

        // IoC range check
        if (spec.indicatorOfCoincidence) {
            const { min, max } = spec.indicatorOfCoincidence;
            if (analysis.ioc >= min && analysis.ioc <= max) {
                score += 0.4;
            }
        }

        // Charset check
        if (spec.charsetCheck && spec.charsetCheck(input)) {
            score += 0.3;
        }

        // Trait matching
        if (spec.traits) {
            if (spec.traits.includes('monoalphabetic') && analysis.ioc > 0.05) {
                score += 0.2;
            }
            if (spec.traits.includes('polyalphabetic') && analysis.ioc < 0.05) {
                score += 0.2;
            }
        }

        return Math.min(score, 1.0);
    }
}
```

### Tool 4: cyberchef_file_type_detect

**Purpose**: Detect file type from magic bytes and content analysis

```javascript
{
    name: 'cyberchef_file_type_detect',
    description: 'Detect file type from magic bytes and content patterns',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'File content as hex or base64'
            },
            input_format: {
                type: 'string',
                enum: ['hex', 'base64'],
                default: 'hex'
            },
            detailed: {
                type: 'boolean',
                default: false,
                description: 'Include detailed analysis'
            }
        },
        required: ['input']
    }
}
```

**Implementation**:

```javascript
// src/node/tools/katana/file-type.mjs

export const MAGIC_SIGNATURES = {
    // Archive formats
    zip: { magic: '504b0304', offset: 0, extension: '.zip', mime: 'application/zip' },
    gzip: { magic: '1f8b08', offset: 0, extension: '.gz', mime: 'application/gzip' },
    tar: { magic: '7573746172', offset: 257, extension: '.tar', mime: 'application/x-tar' },
    rar: { magic: '526172211a07', offset: 0, extension: '.rar', mime: 'application/x-rar' },
    '7z': { magic: '377abcaf271c', offset: 0, extension: '.7z', mime: 'application/x-7z-compressed' },

    // Image formats
    png: { magic: '89504e470d0a1a0a', offset: 0, extension: '.png', mime: 'image/png' },
    jpeg: { magic: 'ffd8ff', offset: 0, extension: '.jpg', mime: 'image/jpeg' },
    gif: { magic: '47494638', offset: 0, extension: '.gif', mime: 'image/gif' },
    bmp: { magic: '424d', offset: 0, extension: '.bmp', mime: 'image/bmp' },
    webp: { magic: '52494646', offset: 0, extra: { magic: '57454250', offset: 8 }, extension: '.webp', mime: 'image/webp' },

    // Document formats
    pdf: { magic: '25504446', offset: 0, extension: '.pdf', mime: 'application/pdf' },
    doc: { magic: 'd0cf11e0a1b11ae1', offset: 0, extension: '.doc', mime: 'application/msword' },

    // Executable formats
    elf: { magic: '7f454c46', offset: 0, extension: '', mime: 'application/x-elf' },
    pe: { magic: '4d5a', offset: 0, extension: '.exe', mime: 'application/x-msdownload' },
    macho: { magic: 'cffaedfe', offset: 0, extension: '', mime: 'application/x-mach-binary' },

    // Audio/Video
    mp3: { magic: '494433', offset: 0, extension: '.mp3', mime: 'audio/mpeg' },
    mp4: { magic: '66747970', offset: 4, extension: '.mp4', mime: 'video/mp4' },
    wav: { magic: '52494646', offset: 0, extra: { magic: '57415645', offset: 8 }, extension: '.wav', mime: 'audio/wav' },

    // Database
    sqlite: { magic: '53514c69746520666f726d6174203300', offset: 0, extension: '.db', mime: 'application/x-sqlite3' }
};

export class FileTypeDetector {
    /**
     * Detect file type from content
     * @param {Uint8Array} data - File content
     * @returns {object} Detection result
     */
    static detect(data) {
        const hexData = this.toHex(data).toLowerCase();
        const matches = [];

        for (const [type, spec] of Object.entries(MAGIC_SIGNATURES)) {
            if (this.matchSignature(hexData, spec)) {
                matches.push({
                    type,
                    extension: spec.extension,
                    mime: spec.mime,
                    confidence: spec.extra ? 1.0 : 0.9  // Higher confidence with extra validation
                });
            }
        }

        // Sort by confidence
        matches.sort((a, b) => b.confidence - a.confidence);

        return {
            detected: matches.length > 0 ? matches[0] : null,
            alternatives: matches.slice(1),
            analysis: this.analyzeContent(data)
        };
    }

    /**
     * Match signature against data
     */
    static matchSignature(hexData, spec) {
        // Check main magic
        const startPos = spec.offset * 2;
        if (!hexData.startsWith(spec.magic, startPos)) {
            return false;
        }

        // Check extra signature if present
        if (spec.extra) {
            const extraPos = spec.extra.offset * 2;
            if (!hexData.startsWith(spec.extra.magic, extraPos)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Analyze content characteristics
     */
    static analyzeContent(data) {
        return {
            size: data.length,
            entropy: this.calculateEntropy(data),
            nullBytes: this.countNullBytes(data),
            printableRatio: this.printableRatio(data),
            isLikelyText: this.isLikelyText(data),
            isLikelyCompressed: this.isLikelyCompressed(data)
        };
    }

    /**
     * Calculate Shannon entropy
     */
    static calculateEntropy(data) {
        if (data.length === 0) return 0;

        const freq = new Array(256).fill(0);
        for (const byte of data) {
            freq[byte]++;
        }

        let entropy = 0;
        for (const count of freq) {
            if (count > 0) {
                const p = count / data.length;
                entropy -= p * Math.log2(p);
            }
        }

        return entropy;
    }

    static countNullBytes(data) {
        return data.filter(b => b === 0).length;
    }

    static printableRatio(data) {
        const printable = data.filter(b => b >= 32 && b <= 126).length;
        return printable / data.length;
    }

    static isLikelyText(data) {
        return this.printableRatio(data) > 0.85;
    }

    static isLikelyCompressed(data) {
        return this.calculateEntropy(data) > 7.5;
    }

    static toHex(data) {
        return Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
    }
}
```

### Tool 5: cyberchef_ctf_analyze

**Purpose**: Coordinated CTF analysis pipeline

```javascript
{
    name: 'cyberchef_ctf_analyze',
    description: 'Run comprehensive CTF analysis on input data',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'Challenge data to analyze'
            },
            input_format: {
                type: 'string',
                enum: ['text', 'hex', 'base64', 'auto'],
                default: 'auto',
                description: 'Input format'
            },
            categories: {
                type: 'array',
                items: {
                    type: 'string',
                    enum: ['encoding', 'crypto', 'file', 'all']
                },
                default: ['all'],
                description: 'Analysis categories to run'
            },
            flag_format: {
                type: 'string',
                default: 'flag{.*?}|FLAG{.*?}|ctf{.*?}',
                description: 'Regex pattern for flag detection'
            }
        },
        required: ['input']
    }
}
```

**Implementation**:

```javascript
// src/node/tools/katana/ctf-analyze.mjs
import { EncodingDetector } from './encoding-detect.mjs';
import { EncodingChainResolver } from './encoding-chain.mjs';
import { CipherDetector } from './cipher-detect.mjs';
import { FileTypeDetector } from './file-type.mjs';

export class CTFAnalyzer {
    /**
     * Run comprehensive CTF analysis
     */
    static analyze(input, options = {}) {
        const {
            categories = ['all'],
            flagFormat = 'flag{.*?}|FLAG{.*?}|ctf{.*?}'
        } = options;

        const results = {
            input: {
                length: input.length,
                type: this.determineInputType(input)
            },
            analyses: {},
            findings: [],
            flags: []
        };

        // Run selected analyses
        const runAll = categories.includes('all');

        if (runAll || categories.includes('encoding')) {
            results.analyses.encoding = this.runEncodingAnalysis(input);
        }

        if (runAll || categories.includes('crypto')) {
            results.analyses.crypto = this.runCryptoAnalysis(input);
        }

        if (runAll || categories.includes('file')) {
            results.analyses.file = this.runFileAnalysis(input);
        }

        // Check for flags in all results
        results.flags = this.searchFlags(results, flagFormat);

        // Generate recommendations
        results.recommendations = this.generateRecommendations(results);

        return results;
    }

    /**
     * Determine input type
     */
    static determineInputType(input) {
        if (/^[0-9a-fA-F]+$/.test(input)) return 'hex';
        if (/^[A-Za-z0-9+/=]+$/.test(input)) return 'possibly_base64';
        if (/[\x00-\x1f]/.test(input)) return 'binary';
        return 'text';
    }

    /**
     * Run encoding analysis
     */
    static runEncodingAnalysis(input) {
        const detection = EncodingDetector.detect(input);
        const chain = EncodingChainResolver.resolve(input, { maxDepth: 5 });

        return {
            detectedEncodings: detection,
            chainResolution: chain,
            recommendedOperations: this.mapEncodingsToOperations(detection)
        };
    }

    /**
     * Run crypto analysis
     */
    static runCryptoAnalysis(input) {
        const cipherAnalysis = CipherDetector.detect(input);

        return {
            cipherAnalysis,
            frequencyDistribution: cipherAnalysis.frequencyDistribution,
            indexOfCoincidence: cipherAnalysis.ioc,
            possibleCiphers: cipherAnalysis.possibleCiphers,
            recommendedOperations: this.mapCiphersToOperations(cipherAnalysis.possibleCiphers)
        };
    }

    /**
     * Run file analysis
     */
    static runFileAnalysis(input) {
        let data;
        try {
            // Try hex decode
            data = new Uint8Array(input.match(/.{1,2}/g).map(b => parseInt(b, 16)));
        } catch (e) {
            // Try base64 decode
            try {
                data = new Uint8Array(Buffer.from(input, 'base64'));
            } catch (e2) {
                // Use as-is
                data = new TextEncoder().encode(input);
            }
        }

        return FileTypeDetector.detect(data);
    }

    /**
     * Search for flags in results
     */
    static searchFlags(results, pattern) {
        const flags = [];
        const regex = new RegExp(pattern, 'gi');

        // Search in chain resolution output
        if (results.analyses.encoding?.chainResolution?.output) {
            const matches = results.analyses.encoding.chainResolution.output.match(regex);
            if (matches) flags.push(...matches);
        }

        return [...new Set(flags)];  // Deduplicate
    }

    /**
     * Map encodings to CyberChef operations
     */
    static mapEncodingsToOperations(encodings) {
        const operationMap = {
            base64: 'cyberchef_from_base64',
            base32: 'cyberchef_from_base32',
            hex: 'cyberchef_from_hex',
            binary: 'cyberchef_from_binary',
            urlencoded: 'cyberchef_url_decode'
        };

        return encodings
            .filter(e => e.confidence > 0.5)
            .map(e => ({
                encoding: e.encoding,
                operation: operationMap[e.encoding],
                confidence: e.confidence
            }));
    }

    /**
     * Map ciphers to CyberChef operations
     */
    static mapCiphersToOperations(ciphers) {
        const operationMap = {
            caesar: 'cyberchef_rot13',
            atbash: 'cyberchef_atbash_cipher',
            vigenere: 'cyberchef_vigenere_decode',
            rot47: 'cyberchef_rot47',
            affine: 'cyberchef_affine_cipher_decode'
        };

        return ciphers.map(c => ({
            cipher: c.cipher,
            operation: operationMap[c.cipher],
            confidence: c.confidence
        }));
    }

    /**
     * Generate analysis recommendations
     */
    static generateRecommendations(results) {
        const recommendations = [];

        // Encoding recommendations
        if (results.analyses.encoding?.detectedEncodings?.length > 0) {
            const top = results.analyses.encoding.detectedEncodings[0];
            recommendations.push({
                type: 'encoding',
                action: `Try decoding as ${top.encoding}`,
                confidence: top.confidence,
                tool: `cyberchef_from_${top.encoding}`
            });
        }

        // Crypto recommendations
        if (results.analyses.crypto?.possibleCiphers?.length > 0) {
            const top = results.analyses.crypto.possibleCiphers[0];
            recommendations.push({
                type: 'crypto',
                action: `Input may be ${top.cipher} cipher`,
                confidence: top.confidence,
                description: top.description
            });
        }

        // File type recommendations
        if (results.analyses.file?.detected) {
            recommendations.push({
                type: 'file',
                action: `File appears to be ${results.analyses.file.detected.type}`,
                extension: results.analyses.file.detected.extension,
                mime: results.analyses.file.detected.mime
            });
        }

        return recommendations;
    }
}
```

## File Structure

```
src/node/tools/katana/
  index.mjs              # Main entry point, tool registration
  encoding-detect.mjs    # EncodingDetector class
  encoding-chain.mjs     # EncodingChainResolver class
  cipher-detect.mjs      # CipherDetector class
  file-type.mjs          # FileTypeDetector class
  ctf-analyze.mjs        # CTFAnalyzer class

tests/tools/katana/
  encoding-detect.test.mjs
  encoding-chain.test.mjs
  cipher-detect.test.mjs
  file-type.test.mjs
  ctf-analyze.test.mjs
```

## Test Cases

### Encoding Detection

```javascript
describe('EncodingDetector', () => {
    it('should detect Base64', () => {
        const result = EncodingDetector.detect('SGVsbG8gV29ybGQh');
        expect(result[0].encoding).toBe('base64');
        expect(result[0].confidence).toBeGreaterThan(0.7);
    });

    it('should detect hex', () => {
        const result = EncodingDetector.detect('48656c6c6f');
        expect(result[0].encoding).toBe('hex');
    });

    it('should prioritize Base64 over hex for ambiguous input', () => {
        // Input that could be both
        const result = EncodingDetector.detect('ABCDEF123456');
        expect(result[0].encoding).toBe('base64');
    });
});
```

### Encoding Chain

```javascript
describe('EncodingChainResolver', () => {
    it('should resolve nested Base64', () => {
        // "Hello" -> Base64 -> Base64
        const encoded = 'U0dWc2JHOD0=';  // Double Base64
        const result = EncodingChainResolver.resolve(encoded);

        expect(result.output).toBe('Hello');
        expect(result.chain.length).toBe(2);
    });

    it('should stop on readable ASCII', () => {
        const result = EncodingChainResolver.resolve('SGVsbG8=');
        expect(result.output).toBe('Hello');
        expect(result.isComplete).toBe(true);
    });
});
```

## Dependencies

None - pure JavaScript implementation using:
- Native Buffer and TextEncoder/TextDecoder
- Regular expressions for pattern matching
- No external npm packages

## Timeline

| Task | Duration | Dependencies |
|------|----------|--------------|
| Implement encoding detection | 0.5 days | None |
| Implement encoding chain | 0.5 days | Encoding detection |
| Implement cipher detection | 0.5 days | None |
| Implement file type detection | 0.5 days | None |
| Implement CTF analyzer | 0.5 days | All above |
| Write tests | 0.5 days | All implementations |

**Total: 3 days**

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| False positive detections | Medium | Low | Confidence thresholds |
| Infinite decode loops | Low | Medium | Max depth limits |
| Performance on large inputs | Low | Low | Input size limits |

## Success Criteria

1. All 5 MCP tools implemented and registered
2. Encoding detection accuracy > 85% on common encodings
3. No external dependencies
4. Compatible with Katana's priority-based approach
5. Useful for CTF automation workflows

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Phase:** 2 (JavaScript Native)
