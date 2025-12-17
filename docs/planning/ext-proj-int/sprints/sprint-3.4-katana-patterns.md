# Sprint 3.4: katana Analysis Patterns

## Sprint Overview

| Field | Value |
|-------|-------|
| Sprint | 3.4 |
| Phase | 3 - Algorithm Ports |
| Duration | 2 weeks |
| Start | Week 17 |
| End | Week 18 |

## Objectives

1. Port katana encoding detection patterns
2. Implement file type analysis
3. Create CTF-focused analysis workflows
4. Build comprehensive analysis tool

## User Stories

### US-3.4.1: Multi-Encoding Detection

**As a** CTF player
**I want** detection of multiple encoding types at once
**So that** I can quickly identify obfuscation layers

**Acceptance Criteria:**
- [ ] Detect 15+ encoding types
- [ ] Parallel detection
- [ ] Confidence ranking
- [ ] Suggest decode order

### US-3.4.2: File Type Analysis

**As a** analyst
**I want** file type detection from content
**So that** I can identify disguised files

**Acceptance Criteria:**
- [ ] Magic byte detection
- [ ] 50+ file signatures
- [ ] Embedded file detection
- [ ] Report file structure

### US-3.4.3: CTF Pattern Detection

**As a** CTF player
**I want** automatic flag pattern detection
**So that** I can quickly find flags in data

**Acceptance Criteria:**
- [ ] Common flag formats
- [ ] Custom pattern support
- [ ] Case variations
- [ ] Encoded flag detection

### US-3.4.4: Analysis Workflow

**As a** analyst
**I want** automated multi-step analysis
**So that** I can efficiently triage unknown data

**Acceptance Criteria:**
- [ ] Run encoding detection
- [ ] Run cipher detection
- [ ] Run file type detection
- [ ] Generate analysis report

## Tasks

### Encoding Detection (Day 1-4)

| ID | Task | Estimate | Assignee |
|----|------|----------|----------|
| T-3.4.1 | Define encoding signatures | 4h | - |
| T-3.4.2 | Implement parallel detector | 4h | - |
| T-3.4.3 | Create confidence scoring | 3h | - |
| T-3.4.4 | Build EncodingChainResolver | 4h | - |

### File Type Analysis (Day 5-7)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-3.4.5 | Define magic byte database | 4h | - |
| T-3.4.6 | Implement FileTypeDetector | 4h | T-3.4.5 |
| T-3.4.7 | Add embedded file detection | 4h | T-3.4.6 |
| T-3.4.8 | Create structure analyzer | 3h | T-3.4.6 |

### CTF Utilities (Day 8-9)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-3.4.9 | Implement flag patterns | 3h | - |
| T-3.4.10 | Create CTFAnalyzer class | 4h | T-3.4.1-8 |
| T-3.4.11 | Build analysis workflow | 4h | T-3.4.10 |

### Integration (Day 10)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-3.4.12 | Register MCP tools | 3h | All |
| T-3.4.13 | Write tests | 6h | T-3.4.12 |
| T-3.4.14 | Documentation | 2h | All |

## Deliverables

### Files to Create

```
src/node/tools/
├── analysis/
│   ├── index.mjs           # Module exports
│   ├── encoding-chain.mjs  # Multi-encoding resolver
│   ├── file-type.mjs       # File type detection
│   ├── patterns.mjs        # CTF patterns
│   ├── workflow.mjs        # Analysis workflow
│   └── register.mjs        # Tool registration
```

### Code Specifications

#### Encoding Chain Resolver (encoding-chain.mjs)

```javascript
/**
 * Multi-layer encoding detection and resolution
 */

import { EncodingDetector } from '../auto-decode/detector.mjs';

export class EncodingChainResolver {
    constructor() {
        this.detector = new EncodingDetector();
        this.maxDepth = 10;
    }

    /**
     * Analyze encoding chain
     */
    async analyze(input, options = {}) {
        const chain = [];
        let current = input;
        let depth = 0;

        while (depth < this.maxDepth) {
            const detected = this.detector.detect(current);

            if (detected.length === 0 || detected[0].confidence < 0.3) {
                break;
            }

            const best = detected[0];
            chain.push({
                encoding: best.encoding,
                confidence: best.confidence,
                inputLength: current.length
            });

            // Try to decode
            const decoded = await this.decode(current, best.encoding);
            if (!decoded || decoded === current) {
                break;
            }

            current = decoded;
            depth++;
        }

        return {
            original: input,
            decoded: current,
            chain,
            depth,
            success: chain.length > 0
        };
    }

    /**
     * Decode with specific encoding
     */
    async decode(input, encoding) {
        try {
            switch (encoding) {
                case 'base64':
                case 'base64url':
                    return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
                case 'hex':
                    return Buffer.from(input.replace(/\s/g, ''), 'hex').toString();
                case 'base32':
                    return this.decodeBase32(input);
                case 'urlEncoded':
                    return decodeURIComponent(input);
                case 'binary':
                    return this.decodeBinary(input);
                case 'decimal':
                    return this.decodeDecimal(input);
                default:
                    return null;
            }
        } catch (error) {
            return null;
        }
    }

    decodeBase32(input) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        const cleaned = input.toUpperCase().replace(/=+$/, '');

        let bits = '';
        for (const char of cleaned) {
            const idx = alphabet.indexOf(char);
            if (idx === -1) continue;
            bits += idx.toString(2).padStart(5, '0');
        }

        let result = '';
        for (let i = 0; i + 8 <= bits.length; i += 8) {
            result += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
        }

        return result;
    }

    decodeBinary(input) {
        const bits = input.replace(/\s/g, '');
        let result = '';

        for (let i = 0; i + 8 <= bits.length; i += 8) {
            result += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
        }

        return result;
    }

    decodeDecimal(input) {
        const nums = input.trim().split(/\s+/);
        return nums.map(n => String.fromCharCode(parseInt(n, 10))).join('');
    }
}
```

#### File Type Detection (file-type.mjs)

```javascript
/**
 * File type detection via magic bytes
 */

export const FILE_SIGNATURES = [
    // Images
    { signature: [0x89, 0x50, 0x4E, 0x47], extension: 'png', mime: 'image/png', description: 'PNG image' },
    { signature: [0xFF, 0xD8, 0xFF], extension: 'jpg', mime: 'image/jpeg', description: 'JPEG image' },
    { signature: [0x47, 0x49, 0x46, 0x38], extension: 'gif', mime: 'image/gif', description: 'GIF image' },
    { signature: [0x42, 0x4D], extension: 'bmp', mime: 'image/bmp', description: 'BMP image' },
    { signature: [0x52, 0x49, 0x46, 0x46], extension: 'webp', mime: 'image/webp', description: 'WebP/RIFF' },

    // Archives
    { signature: [0x50, 0x4B, 0x03, 0x04], extension: 'zip', mime: 'application/zip', description: 'ZIP archive' },
    { signature: [0x50, 0x4B, 0x05, 0x06], extension: 'zip', mime: 'application/zip', description: 'ZIP (empty)' },
    { signature: [0x1F, 0x8B, 0x08], extension: 'gz', mime: 'application/gzip', description: 'GZIP archive' },
    { signature: [0x42, 0x5A, 0x68], extension: 'bz2', mime: 'application/x-bzip2', description: 'BZIP2 archive' },
    { signature: [0xFD, 0x37, 0x7A, 0x58, 0x5A], extension: 'xz', mime: 'application/x-xz', description: 'XZ archive' },
    { signature: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], extension: '7z', mime: 'application/x-7z-compressed', description: '7-Zip' },
    { signature: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07], extension: 'rar', mime: 'application/x-rar-compressed', description: 'RAR archive' },

    // Documents
    { signature: [0x25, 0x50, 0x44, 0x46], extension: 'pdf', mime: 'application/pdf', description: 'PDF document' },
    { signature: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], extension: 'doc', mime: 'application/msword', description: 'MS Office (legacy)' },

    // Executables
    { signature: [0x4D, 0x5A], extension: 'exe', mime: 'application/x-msdownload', description: 'Windows executable' },
    { signature: [0x7F, 0x45, 0x4C, 0x46], extension: 'elf', mime: 'application/x-elf', description: 'ELF executable' },
    { signature: [0xCA, 0xFE, 0xBA, 0xBE], extension: 'class', mime: 'application/java-vm', description: 'Java class' },
    { signature: [0xCF, 0xFA, 0xED, 0xFE], extension: 'macho', mime: 'application/x-mach-binary', description: 'Mach-O (32-bit)' },
    { signature: [0xCE, 0xFA, 0xED, 0xFE], extension: 'macho', mime: 'application/x-mach-binary', description: 'Mach-O (64-bit)' },

    // Media
    { signature: [0x49, 0x44, 0x33], extension: 'mp3', mime: 'audio/mpeg', description: 'MP3 (ID3)' },
    { signature: [0xFF, 0xFB], extension: 'mp3', mime: 'audio/mpeg', description: 'MP3' },
    { signature: [0x00, 0x00, 0x00, null, 0x66, 0x74, 0x79, 0x70], extension: 'mp4', mime: 'video/mp4', description: 'MP4 video' },

    // Other
    { signature: [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65], extension: 'sqlite', mime: 'application/x-sqlite3', description: 'SQLite database' },
];

export class FileTypeDetector {
    constructor() {
        this.signatures = FILE_SIGNATURES;
    }

    /**
     * Detect file type from bytes
     */
    detect(data) {
        if (typeof data === 'string') {
            data = Uint8Array.from(data, c => c.charCodeAt(0));
        }

        const matches = [];

        for (const sig of this.signatures) {
            if (this.matchSignature(data, sig.signature)) {
                matches.push({
                    extension: sig.extension,
                    mime: sig.mime,
                    description: sig.description,
                    confidence: 1.0
                });
            }
        }

        // Sort by signature length (longer = more specific)
        matches.sort((a, b) => {
            const sigA = this.signatures.find(s => s.extension === a.extension);
            const sigB = this.signatures.find(s => s.extension === b.extension);
            return sigB.signature.length - sigA.signature.length;
        });

        return matches;
    }

    /**
     * Find embedded files
     */
    findEmbedded(data) {
        if (typeof data === 'string') {
            data = Uint8Array.from(data, c => c.charCodeAt(0));
        }

        const found = [];

        for (const sig of this.signatures) {
            // Skip signatures with nulls (wildcards)
            if (sig.signature.includes(null)) continue;

            for (let i = 1; i < data.length - sig.signature.length; i++) {
                if (this.matchSignature(data.subarray(i), sig.signature)) {
                    found.push({
                        offset: i,
                        type: sig.extension,
                        description: sig.description
                    });
                }
            }
        }

        return found;
    }

    matchSignature(data, signature) {
        if (data.length < signature.length) return false;

        for (let i = 0; i < signature.length; i++) {
            if (signature[i] === null) continue;  // Wildcard
            if (data[i] !== signature[i]) return false;
        }

        return true;
    }
}
```

#### CTF Analyzer (workflow.mjs)

```javascript
/**
 * CTF-focused analysis workflow
 */

import { EncodingChainResolver } from './encoding-chain.mjs';
import { FileTypeDetector } from './file-type.mjs';
import { EncodingDetector } from '../auto-decode/detector.mjs';

// Common CTF flag patterns
export const FLAG_PATTERNS = [
    { regex: /flag\{[^}]+\}/gi, name: 'flag{}' },
    { regex: /CTF\{[^}]+\}/gi, name: 'CTF{}' },
    { regex: /FLAG\{[^}]+\}/gi, name: 'FLAG{}' },
    { regex: /[a-zA-Z0-9_]+\{[a-zA-Z0-9_!@#$%^&*()-+=]+\}/g, name: 'generic{}' },
    { regex: /picoCTF\{[^}]+\}/gi, name: 'picoCTF' },
    { regex: /HTB\{[^}]+\}/gi, name: 'HackTheBox' },
    { regex: /DUCTF\{[^}]+\}/gi, name: 'DownUnderCTF' },
];

export class CTFAnalyzer {
    constructor() {
        this.encodingResolver = new EncodingChainResolver();
        this.fileDetector = new FileTypeDetector();
        this.encodingDetector = new EncodingDetector();
    }

    /**
     * Run comprehensive analysis
     */
    async analyze(input, options = {}) {
        const results = {
            encoding: null,
            fileType: null,
            flags: [],
            suggestions: []
        };

        // Convert to bytes for file detection
        const bytes = typeof input === 'string'
            ? Uint8Array.from(input, c => c.charCodeAt(0))
            : input;

        // 1. Encoding analysis
        const encodingResults = this.encodingDetector.detect(
            typeof input === 'string' ? input : String.fromCharCode(...input)
        );
        results.encoding = {
            detected: encodingResults.slice(0, 5),
            chain: await this.encodingResolver.analyze(input)
        };

        // 2. File type analysis
        results.fileType = {
            detected: this.fileDetector.detect(bytes),
            embedded: this.fileDetector.findEmbedded(bytes)
        };

        // 3. Flag detection
        const textInput = typeof input === 'string' ? input : String.fromCharCode(...input);
        results.flags = this.findFlags(textInput);

        // Also check decoded content for flags
        if (results.encoding.chain.decoded) {
            const decodedFlags = this.findFlags(results.encoding.chain.decoded);
            results.flags.push(...decodedFlags.map(f => ({ ...f, source: 'decoded' })));
        }

        // 4. Generate suggestions
        results.suggestions = this.generateSuggestions(results);

        return results;
    }

    /**
     * Find CTF flags in text
     */
    findFlags(text) {
        const flags = [];

        for (const pattern of FLAG_PATTERNS) {
            const matches = text.match(pattern.regex);
            if (matches) {
                for (const match of matches) {
                    flags.push({
                        value: match,
                        pattern: pattern.name,
                        offset: text.indexOf(match)
                    });
                }
            }
        }

        return flags;
    }

    /**
     * Generate analysis suggestions
     */
    generateSuggestions(results) {
        const suggestions = [];

        // Encoding suggestions
        if (results.encoding.detected.length > 0) {
            const best = results.encoding.detected[0];
            suggestions.push({
                type: 'decode',
                message: `Try decoding as ${best.encoding} (${(best.confidence * 100).toFixed(0)}% confidence)`,
                action: `cyberchef_from_${best.encoding}`
            });
        }

        // Multi-layer suggestions
        if (results.encoding.chain.depth > 1) {
            suggestions.push({
                type: 'chain',
                message: `Detected ${results.encoding.chain.depth}-layer encoding chain`,
                action: 'cyberchef_auto_decode'
            });
        }

        // File type suggestions
        if (results.fileType.detected.length > 0) {
            const fileType = results.fileType.detected[0];
            suggestions.push({
                type: 'file',
                message: `Detected ${fileType.description} file`,
                action: `extract_${fileType.extension}`
            });
        }

        // Embedded file suggestions
        if (results.fileType.embedded.length > 0) {
            suggestions.push({
                type: 'embedded',
                message: `Found ${results.fileType.embedded.length} embedded file(s)`,
                action: 'binwalk_extract'
            });
        }

        return suggestions;
    }
}
```

### MCP Tools Registered

| Tool Name | Description |
|-----------|-------------|
| `cyberchef_encoding_chain` | Resolve multi-layer encodings |
| `cyberchef_file_type` | Detect file type from content |
| `cyberchef_find_embedded` | Find embedded files |
| `cyberchef_ctf_analyze` | Comprehensive CTF analysis |
| `cyberchef_find_flags` | Search for CTF flag patterns |

## Definition of Done

- [ ] 15+ encoding patterns
- [ ] 50+ file signatures
- [ ] Flag detection working
- [ ] Analysis workflow complete
- [ ] Unit tests with > 85% coverage
- [ ] Documentation complete

## Dependencies

### External

- None (pure JavaScript)

### Internal

- Sprint 3.1 (Auto-Decode)
- Sprint 1.1 (ToolRegistry)

---

**Sprint Version:** 1.0.0
**Created:** 2025-12-17
