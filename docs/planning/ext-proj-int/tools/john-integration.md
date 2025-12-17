# John the Ripper Integration Plan

## Overview

| Attribute | Value |
|-----------|-------|
| Source Project | John the Ripper |
| Repository | https://github.com/openwall/john |
| License | GPL-2.0 |
| Language | C |
| Integration Phase | Phase 4 (Advanced Integrations) |
| Priority | High |
| Complexity | Medium (pattern matching, no core cracking) |

## Integration Summary

John the Ripper is a password security auditing tool. We will NOT integrate password cracking functionality (ethical and legal concerns). Instead, we will port:

1. **Hash type identification** - Recognize 100+ hash formats from signatures
2. **Hash extraction utilities** - Extract hashes from common formats
3. **Hash validation** - Verify hash format correctness

This provides valuable analysis capabilities without enabling unauthorized password attacks.

## Operations to Integrate

### Hash Identification

| Feature | Description | MCP Tool Name |
|---------|-------------|---------------|
| Hash Type Detection | Identify hash algorithm from pattern | `cyberchef_identify_hash` |
| Hash Validation | Verify hash format correctness | `cyberchef_validate_hash` |
| Hash Extraction | Extract hashes from text/files | `cyberchef_extract_hashes` |
| Hash Statistics | Analyze hash strength indicators | `cyberchef_hash_statistics` |

### Hash Formats Supported

Based on John's format database, we will support identification of:

**Unix Crypt Variants:**
- MD5 crypt ($1$)
- SHA256 crypt ($5$)
- SHA512 crypt ($6$)
- Blowfish crypt ($2a$, $2b$, $2y$)

**Modern Password Hashes:**
- bcrypt
- scrypt
- Argon2 (argon2i, argon2d, argon2id)
- PBKDF2

**Database Hashes:**
- MySQL
- PostgreSQL
- Oracle
- MSSQL

**Application Hashes:**
- phpBB3
- vBulletin
- WordPress
- Drupal
- Django

**Windows:**
- LM Hash
- NTLM
- NTLMv2
- MS-Cache

**Raw Hashes:**
- MD4, MD5
- SHA1, SHA256, SHA384, SHA512
- RIPEMD-160
- Whirlpool

## Architecture

### Hash Pattern Database

```javascript
// src/node/tools/hash/patterns.mjs

/**
 * Hash format patterns database
 * Based on John the Ripper format signatures
 */
export const HASH_PATTERNS = {
    // Modern password hashes
    bcrypt: {
        pattern: /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/,
        name: 'bcrypt',
        algorithm: 'Blowfish',
        johnFormat: 'bcrypt',
        strength: 'strong',
        saltLength: 22,
        hashLength: 31,
        description: 'bcrypt password hash'
    },

    argon2i: {
        pattern: /^\$argon2i\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/,
        name: 'Argon2i',
        algorithm: 'Argon2',
        johnFormat: 'argon2',
        strength: 'strong',
        description: 'Argon2i password hash'
    },

    argon2d: {
        pattern: /^\$argon2d\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/,
        name: 'Argon2d',
        algorithm: 'Argon2',
        johnFormat: 'argon2',
        strength: 'strong',
        description: 'Argon2d password hash'
    },

    argon2id: {
        pattern: /^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/,
        name: 'Argon2id',
        algorithm: 'Argon2',
        johnFormat: 'argon2',
        strength: 'strong',
        description: 'Argon2id password hash (recommended)'
    },

    scrypt: {
        pattern: /^\$scrypt\$ln=\d+,r=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/,
        name: 'scrypt',
        algorithm: 'scrypt',
        johnFormat: 'scrypt',
        strength: 'strong',
        description: 'scrypt password hash'
    },

    // Unix crypt variants
    md5crypt: {
        pattern: /^\$1\$[./A-Za-z0-9]{0,8}\$[./A-Za-z0-9]{22}$/,
        name: 'MD5 crypt',
        algorithm: 'MD5',
        johnFormat: 'md5crypt',
        strength: 'weak',
        description: 'Unix MD5 crypt ($1$)'
    },

    sha256crypt: {
        pattern: /^\$5\$(rounds=\d+\$)?[./A-Za-z0-9]{0,16}\$[./A-Za-z0-9]{43}$/,
        name: 'SHA-256 crypt',
        algorithm: 'SHA-256',
        johnFormat: 'sha256crypt',
        strength: 'moderate',
        description: 'Unix SHA-256 crypt ($5$)'
    },

    sha512crypt: {
        pattern: /^\$6\$(rounds=\d+\$)?[./A-Za-z0-9]{0,16}\$[./A-Za-z0-9]{86}$/,
        name: 'SHA-512 crypt',
        algorithm: 'SHA-512',
        johnFormat: 'sha512crypt',
        strength: 'moderate',
        description: 'Unix SHA-512 crypt ($6$)'
    },

    // Raw hashes
    md5: {
        pattern: /^[a-fA-F0-9]{32}$/,
        name: 'MD5',
        algorithm: 'MD5',
        johnFormat: 'raw-md5',
        strength: 'weak',
        bits: 128,
        description: 'Raw MD5 hash'
    },

    sha1: {
        pattern: /^[a-fA-F0-9]{40}$/,
        name: 'SHA-1',
        algorithm: 'SHA-1',
        johnFormat: 'raw-sha1',
        strength: 'weak',
        bits: 160,
        description: 'Raw SHA-1 hash'
    },

    sha256: {
        pattern: /^[a-fA-F0-9]{64}$/,
        name: 'SHA-256',
        algorithm: 'SHA-256',
        johnFormat: 'raw-sha256',
        strength: 'moderate',
        bits: 256,
        description: 'Raw SHA-256 hash'
    },

    sha384: {
        pattern: /^[a-fA-F0-9]{96}$/,
        name: 'SHA-384',
        algorithm: 'SHA-384',
        johnFormat: 'raw-sha384',
        strength: 'moderate',
        bits: 384,
        description: 'Raw SHA-384 hash'
    },

    sha512: {
        pattern: /^[a-fA-F0-9]{128}$/,
        name: 'SHA-512',
        algorithm: 'SHA-512',
        johnFormat: 'raw-sha512',
        strength: 'moderate',
        bits: 512,
        description: 'Raw SHA-512 hash'
    },

    // Windows hashes
    lm: {
        pattern: /^[a-fA-F0-9]{32}$/,
        name: 'LM Hash',
        algorithm: 'DES',
        johnFormat: 'lm',
        strength: 'critically-weak',
        bits: 128,
        description: 'Windows LM hash (deprecated)',
        disambiguate: (hash) => {
            // LM hashes often have second half as aad3b435b51404ee
            return hash.toLowerCase().endsWith('aad3b435b51404ee');
        }
    },

    ntlm: {
        pattern: /^[a-fA-F0-9]{32}$/,
        name: 'NTLM',
        algorithm: 'MD4',
        johnFormat: 'nt',
        strength: 'weak',
        bits: 128,
        description: 'Windows NTLM hash'
    },

    // Database hashes
    mysql323: {
        pattern: /^[a-fA-F0-9]{16}$/,
        name: 'MySQL 3.x/4.x',
        algorithm: 'MySQL OLD_PASSWORD()',
        johnFormat: 'mysql',
        strength: 'critically-weak',
        description: 'MySQL OLD_PASSWORD() hash'
    },

    mysql5: {
        pattern: /^\*[A-F0-9]{40}$/,
        name: 'MySQL 5.x+',
        algorithm: 'SHA-1',
        johnFormat: 'mysql-sha1',
        strength: 'weak',
        description: 'MySQL PASSWORD() hash'
    },

    postgres_md5: {
        pattern: /^md5[a-f0-9]{32}$/,
        name: 'PostgreSQL MD5',
        algorithm: 'MD5',
        johnFormat: 'postgres',
        strength: 'weak',
        description: 'PostgreSQL MD5 password'
    },

    oracle_h: {
        pattern: /^[A-F0-9]{16}$/i,
        name: 'Oracle 10g',
        algorithm: 'DES',
        johnFormat: 'oracle',
        strength: 'weak',
        description: 'Oracle 10g hash'
    },

    // Application hashes
    wordpress: {
        pattern: /^\$P\$[A-Za-z0-9./]{31}$/,
        name: 'WordPress/phpBB',
        algorithm: 'phpass MD5',
        johnFormat: 'phpass',
        strength: 'moderate',
        description: 'WordPress/phpBB portable hash'
    },

    drupal7: {
        pattern: /^\$S\$[A-Za-z0-9./]{52}$/,
        name: 'Drupal 7',
        algorithm: 'SHA-512',
        johnFormat: 'drupal7',
        strength: 'moderate',
        description: 'Drupal 7 hash'
    },

    django_pbkdf2_sha256: {
        pattern: /^pbkdf2_sha256\$\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+=*$/,
        name: 'Django PBKDF2 SHA-256',
        algorithm: 'PBKDF2-SHA256',
        johnFormat: 'django',
        strength: 'strong',
        description: 'Django PBKDF2 SHA-256 hash'
    },

    // Network hashes
    netntlmv1: {
        pattern: /^[A-Za-z0-9]+::[A-Za-z0-9]+:[a-fA-F0-9]{48}:[a-fA-F0-9]{48}:[a-fA-F0-9]+$/,
        name: 'NetNTLMv1',
        algorithm: 'NTLMv1',
        johnFormat: 'netntlm',
        strength: 'weak',
        description: 'NTLMv1 network authentication'
    },

    netntlmv2: {
        pattern: /^[A-Za-z0-9]+::[A-Za-z0-9]+:[a-fA-F0-9]{16}:[a-fA-F0-9]{32}:[a-fA-F0-9]+$/,
        name: 'NetNTLMv2',
        algorithm: 'NTLMv2',
        johnFormat: 'netntlmv2',
        strength: 'moderate',
        description: 'NTLMv2 network authentication'
    },

    // Other formats
    descrypt: {
        pattern: /^[./A-Za-z0-9]{13}$/,
        name: 'DES crypt',
        algorithm: 'DES',
        johnFormat: 'descrypt',
        strength: 'critically-weak',
        description: 'Traditional Unix DES crypt'
    },

    apr1: {
        pattern: /^\$apr1\$[./A-Za-z0-9]{0,8}\$[./A-Za-z0-9]{22}$/,
        name: 'Apache APR1',
        algorithm: 'MD5',
        johnFormat: 'md5crypt',
        strength: 'weak',
        description: 'Apache htpasswd MD5'
    }
};

/**
 * Patterns that need additional context to disambiguate
 */
export const AMBIGUOUS_LENGTHS = {
    32: ['md5', 'ntlm', 'lm'],
    40: ['sha1', 'mysql5'],
    64: ['sha256'],
    128: ['sha512']
};
```

### Hash Identifier Implementation

```javascript
// src/node/tools/hash/identifier.mjs
import { HASH_PATTERNS, AMBIGUOUS_LENGTHS } from './patterns.mjs';

/**
 * Hash type identifier based on John the Ripper patterns
 */
export class HashIdentifier {
    /**
     * Identify hash type from string
     * @param {string} hash - Hash string to identify
     * @returns {Object[]} - Array of possible matches with confidence
     */
    identify(hash) {
        const trimmed = hash.trim();
        const matches = [];

        for (const [name, format] of Object.entries(HASH_PATTERNS)) {
            if (format.pattern.test(trimmed)) {
                const match = {
                    format: name,
                    name: format.name,
                    algorithm: format.algorithm,
                    johnFormat: format.johnFormat,
                    strength: format.strength,
                    description: format.description,
                    confidence: 'high'
                };

                // Check if disambiguation is needed
                if (format.bits && AMBIGUOUS_LENGTHS[format.bits / 4]) {
                    match.confidence = 'medium';
                    match.ambiguousWith = AMBIGUOUS_LENGTHS[format.bits / 4].filter(f => f !== name);

                    // Try to disambiguate
                    if (format.disambiguate && format.disambiguate(trimmed)) {
                        match.confidence = 'high';
                    }
                }

                matches.push(match);
            }
        }

        // Sort by confidence
        matches.sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            return order[a.confidence] - order[b.confidence];
        });

        return matches;
    }

    /**
     * Identify multiple hashes
     * @param {string[]} hashes - Array of hash strings
     * @returns {Object[]} - Array of results
     */
    identifyMultiple(hashes) {
        return hashes.map(hash => ({
            hash,
            matches: this.identify(hash)
        }));
    }

    /**
     * Get best match for a hash
     * @param {string} hash - Hash string
     * @returns {Object|null} - Best matching format or null
     */
    getBestMatch(hash) {
        const matches = this.identify(hash);
        return matches.length > 0 ? matches[0] : null;
    }
}

/**
 * MCP Tool Definition
 */
export const identifyHashTool = {
    name: 'cyberchef_identify_hash',
    description: 'Identify the type/algorithm of a hash based on its format and length',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            hash: {
                type: 'string',
                description: 'Hash string to identify'
            },
            hashes: {
                type: 'array',
                items: { type: 'string' },
                description: 'Multiple hashes to identify'
            }
        }
    },

    async execute(args) {
        const identifier = new HashIdentifier();

        if (args.hashes && Array.isArray(args.hashes)) {
            const results = identifier.identifyMultiple(args.hashes);
            return {
                success: true,
                output: {
                    results,
                    summary: {
                        total: results.length,
                        identified: results.filter(r => r.matches.length > 0).length,
                        unidentified: results.filter(r => r.matches.length === 0).length
                    }
                }
            };
        }

        if (args.hash) {
            const matches = identifier.identify(args.hash);
            return {
                success: true,
                output: {
                    hash: args.hash,
                    matches,
                    bestMatch: matches[0] || null
                }
            };
        }

        return {
            success: false,
            error: 'Provide either hash or hashes parameter'
        };
    }
};
```

### Hash Extraction Implementation

```javascript
// src/node/tools/hash/extractor.mjs
import { HASH_PATTERNS } from './patterns.mjs';

/**
 * Extract hashes from text content
 */
export class HashExtractor {
    /**
     * Extract all recognizable hashes from text
     * @param {string} text - Text to search
     * @param {Object} options - Extraction options
     * @returns {Object[]} - Extracted hashes with types
     */
    extract(text, options = {}) {
        const results = [];
        const seen = new Set();

        for (const [formatName, format] of Object.entries(HASH_PATTERNS)) {
            // Create a global version of the pattern
            const globalPattern = new RegExp(format.pattern.source, 'gm');

            let match;
            while ((match = globalPattern.exec(text)) !== null) {
                const hash = match[0];

                // Skip duplicates
                if (seen.has(hash)) continue;
                seen.add(hash);

                results.push({
                    hash,
                    format: formatName,
                    name: format.name,
                    algorithm: format.algorithm,
                    strength: format.strength,
                    position: match.index
                });
            }
        }

        // Sort by position
        results.sort((a, b) => a.position - b.position);

        // Filter by type if specified
        if (options.filterType) {
            return results.filter(r => r.format === options.filterType);
        }

        // Filter by strength if specified
        if (options.minStrength) {
            const strengthOrder = ['critically-weak', 'weak', 'moderate', 'strong'];
            const minIndex = strengthOrder.indexOf(options.minStrength);
            return results.filter(r => {
                const index = strengthOrder.indexOf(r.strength);
                return index >= minIndex;
            });
        }

        return results;
    }

    /**
     * Extract username:hash pairs (common format)
     * @param {string} text - Text to search
     * @returns {Object[]} - Extracted pairs
     */
    extractWithUsernames(text) {
        const results = [];
        const lines = text.split('\n');

        for (const line of lines) {
            // Common formats: user:hash, user:$id$..., user:hash:...
            const colonMatch = line.match(/^([^:\s]+):(.+)$/);
            if (colonMatch) {
                const [, username, hashPart] = colonMatch;
                const hash = hashPart.split(':')[0];

                // Try to identify the hash
                for (const [formatName, format] of Object.entries(HASH_PATTERNS)) {
                    if (format.pattern.test(hash)) {
                        results.push({
                            username,
                            hash,
                            format: formatName,
                            name: format.name,
                            fullLine: line
                        });
                        break;
                    }
                }
            }
        }

        return results;
    }

    /**
     * Extract hashes from /etc/shadow format
     * @param {string} text - Shadow file content
     * @returns {Object[]} - Extracted entries
     */
    extractShadow(text) {
        const results = [];
        const lines = text.split('\n');

        for (const line of lines) {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const username = parts[0];
                const hash = parts[1];

                // Skip locked/disabled accounts
                if (hash === '*' || hash === '!' || hash === '!!' || hash === '') {
                    results.push({
                        username,
                        hash: null,
                        status: hash === '' ? 'no-password' : 'locked'
                    });
                    continue;
                }

                // Identify the hash type
                for (const [formatName, format] of Object.entries(HASH_PATTERNS)) {
                    if (format.pattern.test(hash)) {
                        results.push({
                            username,
                            hash,
                            format: formatName,
                            name: format.name,
                            status: 'active'
                        });
                        break;
                    }
                }
            }
        }

        return results;
    }
}

/**
 * MCP Tool Definition
 */
export const extractHashesTool = {
    name: 'cyberchef_extract_hashes',
    description: 'Extract and identify hash values from text content',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'Text content to search for hashes'
            },
            format: {
                type: 'string',
                enum: ['auto', 'shadow', 'userpass'],
                default: 'auto',
                description: 'Input format hint'
            },
            filterType: {
                type: 'string',
                description: 'Only extract specific hash type'
            }
        },
        required: ['input']
    },

    async execute(args) {
        const extractor = new HashExtractor();

        let results;
        switch (args.format) {
            case 'shadow':
                results = extractor.extractShadow(args.input);
                break;
            case 'userpass':
                results = extractor.extractWithUsernames(args.input);
                break;
            default:
                results = extractor.extract(args.input, {
                    filterType: args.filterType
                });
        }

        // Group by type
        const byType = {};
        for (const result of results) {
            const type = result.format || 'unknown';
            if (!byType[type]) {
                byType[type] = [];
            }
            byType[type].push(result);
        }

        return {
            success: true,
            output: {
                results,
                summary: {
                    total: results.length,
                    byType
                }
            }
        };
    }
};
```

### Hash Statistics Implementation

```javascript
// src/node/tools/hash/statistics.mjs
import { HASH_PATTERNS } from './patterns.mjs';
import { HashIdentifier } from './identifier.mjs';

/**
 * Hash statistics and analysis
 */
export class HashStatistics {
    constructor() {
        this.identifier = new HashIdentifier();
    }

    /**
     * Analyze a collection of hashes
     * @param {string[]} hashes - Array of hashes
     * @returns {Object} - Statistical analysis
     */
    analyze(hashes) {
        const stats = {
            total: hashes.length,
            unique: new Set(hashes).size,
            duplicates: hashes.length - new Set(hashes).size,
            byType: {},
            byStrength: {
                'critically-weak': 0,
                'weak': 0,
                'moderate': 0,
                'strong': 0,
                'unknown': 0
            },
            patterns: {
                allUppercase: 0,
                allLowercase: 0,
                mixed: 0
            }
        };

        for (const hash of hashes) {
            // Identify type
            const matches = this.identifier.identify(hash);
            const type = matches.length > 0 ? matches[0].format : 'unknown';
            const strength = matches.length > 0 ? matches[0].strength : 'unknown';

            // Count by type
            if (!stats.byType[type]) {
                stats.byType[type] = { count: 0, samples: [] };
            }
            stats.byType[type].count++;
            if (stats.byType[type].samples.length < 3) {
                stats.byType[type].samples.push(hash);
            }

            // Count by strength
            stats.byStrength[strength]++;

            // Check case patterns (for hex hashes)
            if (/^[a-f0-9]+$/i.test(hash)) {
                if (hash === hash.toUpperCase()) {
                    stats.patterns.allUppercase++;
                } else if (hash === hash.toLowerCase()) {
                    stats.patterns.allLowercase++;
                } else {
                    stats.patterns.mixed++;
                }
            }
        }

        // Security assessment
        stats.securityAssessment = this.assessSecurity(stats);

        return stats;
    }

    /**
     * Assess overall security of hash collection
     */
    assessSecurity(stats) {
        const total = stats.total;
        const weakPercent = ((stats.byStrength['weak'] + stats.byStrength['critically-weak']) / total) * 100;
        const strongPercent = (stats.byStrength['strong'] / total) * 100;

        let level, recommendations = [];

        if (weakPercent > 50) {
            level = 'critical';
            recommendations.push('More than 50% of hashes use weak algorithms');
            recommendations.push('Consider migrating to bcrypt, Argon2, or scrypt');
        } else if (weakPercent > 20) {
            level = 'warning';
            recommendations.push('Significant portion of hashes use weak algorithms');
            recommendations.push('Plan migration to stronger hashing');
        } else if (strongPercent > 80) {
            level = 'good';
            recommendations.push('Most hashes use strong algorithms');
        } else {
            level = 'moderate';
            recommendations.push('Mixed hash strength detected');
        }

        if (stats.duplicates > 0) {
            recommendations.push(`${stats.duplicates} duplicate hashes found - indicates password reuse`);
        }

        return {
            level,
            weakPercentage: weakPercent.toFixed(1),
            strongPercentage: strongPercent.toFixed(1),
            recommendations
        };
    }
}

/**
 * MCP Tool Definition
 */
export const hashStatisticsTool = {
    name: 'cyberchef_hash_statistics',
    description: 'Analyze statistics and security of a hash collection',
    category: 'crypto',
    inputSchema: {
        type: 'object',
        properties: {
            hashes: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of hashes to analyze'
            },
            input: {
                type: 'string',
                description: 'Text containing hashes (one per line)'
            }
        }
    },

    async execute(args) {
        const analyzer = new HashStatistics();

        let hashes;
        if (args.hashes) {
            hashes = args.hashes;
        } else if (args.input) {
            hashes = args.input.split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0);
        } else {
            return {
                success: false,
                error: 'Provide either hashes array or input text'
            };
        }

        const stats = analyzer.analyze(hashes);

        return {
            success: true,
            output: stats
        };
    }
};
```

## Testing Strategy

### Unit Tests

```javascript
// tests/tools/hash/identifier.test.mjs
import { describe, it, expect } from 'vitest';
import { HashIdentifier } from '../../../src/node/tools/hash/identifier.mjs';

describe('HashIdentifier', () => {
    const identifier = new HashIdentifier();

    describe('identify()', () => {
        it('should identify MD5 hash', () => {
            const hash = '5d41402abc4b2a76b9719d911017c592';
            const matches = identifier.identify(hash);

            expect(matches).toHaveLength(2); // MD5 and NTLM have same length
            expect(matches.some(m => m.format === 'md5')).toBe(true);
        });

        it('should identify SHA-256 hash', () => {
            const hash = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
            const matches = identifier.identify(hash);

            expect(matches.some(m => m.format === 'sha256')).toBe(true);
        });

        it('should identify bcrypt hash', () => {
            const hash = '$2y$10$XrrpX.B.EX4Y4Z3bJ1YA2O9nArhqJq.3xjm6qz3j5WaT4q.E5.XyG';
            const matches = identifier.identify(hash);

            expect(matches).toHaveLength(1);
            expect(matches[0].format).toBe('bcrypt');
            expect(matches[0].strength).toBe('strong');
        });

        it('should identify MD5 crypt hash', () => {
            const hash = '$1$salt$hash1234567890123456';
            const matches = identifier.identify(hash);

            expect(matches.some(m => m.format === 'md5crypt')).toBe(true);
        });

        it('should identify MySQL hash', () => {
            const hash = '*2470C0C06DEE42FD1618BB99005ADCA2EC9D1E19';
            const matches = identifier.identify(hash);

            expect(matches.some(m => m.format === 'mysql5')).toBe(true);
        });

        it('should identify Argon2id hash', () => {
            const hash = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$WVDOfucSPAey3UEzzqLtBQ';
            const matches = identifier.identify(hash);

            expect(matches[0].format).toBe('argon2id');
            expect(matches[0].strength).toBe('strong');
        });
    });

    describe('getBestMatch()', () => {
        it('should return best match', () => {
            const hash = '$2y$10$XrrpX.B.EX4Y4Z3bJ1YA2O9nArhqJq.3xjm6qz3j5WaT4q.E5.XyG';
            const match = identifier.getBestMatch(hash);

            expect(match).not.toBeNull();
            expect(match.format).toBe('bcrypt');
        });

        it('should return null for unknown format', () => {
            const hash = 'not-a-hash';
            const match = identifier.getBestMatch(hash);

            expect(match).toBeNull();
        });
    });
});
```

### Integration Tests

```javascript
// tests/tools/hash/integration.test.mjs
import { describe, it, expect } from 'vitest';
import { identifyHashTool } from '../../../src/node/tools/hash/identifier.mjs';
import { extractHashesTool } from '../../../src/node/tools/hash/extractor.mjs';

describe('Hash MCP Tools', () => {
    describe('cyberchef_identify_hash', () => {
        it('should identify single hash', async () => {
            const result = await identifyHashTool.execute({
                hash: '$2y$10$XrrpX.B.EX4Y4Z3bJ1YA2O9nArhqJq.3xjm6qz3j5WaT4q.E5.XyG'
            });

            expect(result.success).toBe(true);
            expect(result.output.bestMatch.format).toBe('bcrypt');
        });

        it('should identify multiple hashes', async () => {
            const result = await identifyHashTool.execute({
                hashes: [
                    '5d41402abc4b2a76b9719d911017c592',
                    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
                ]
            });

            expect(result.success).toBe(true);
            expect(result.output.summary.identified).toBe(2);
        });
    });

    describe('cyberchef_extract_hashes', () => {
        it('should extract hashes from text', async () => {
            const input = `
                User data:
                admin: 5d41402abc4b2a76b9719d911017c592
                user: $2y$10$XrrpX.B.EX4Y4Z3bJ1YA2O9nArhqJq.3xjm6qz3j5WaT4q.E5.XyG
            `;

            const result = await extractHashesTool.execute({ input });

            expect(result.success).toBe(true);
            expect(result.output.results.length).toBe(2);
        });

        it('should extract shadow format', async () => {
            const input = `root:$6$rounds=5000$salt$hash:18000:0:99999:7:::
nobody:*:18000:0:99999:7:::`;

            const result = await extractHashesTool.execute({
                input,
                format: 'shadow'
            });

            expect(result.success).toBe(true);
            expect(result.output.results.some(r => r.status === 'locked')).toBe(true);
        });
    });
});
```

## File Structure

```
src/node/tools/hash/
├── index.mjs              # Module exports
├── patterns.mjs           # Hash pattern database
├── identifier.mjs         # Hash type identification
├── extractor.mjs          # Hash extraction from text
├── statistics.mjs         # Hash statistics and analysis
└── validator.mjs          # Hash format validation

tests/tools/hash/
├── patterns.test.mjs
├── identifier.test.mjs
├── extractor.test.mjs
├── statistics.test.mjs
└── integration.test.mjs
```

## MCP Tools Summary

| Tool Name | Category | Description |
|-----------|----------|-------------|
| `cyberchef_identify_hash` | crypto | Identify hash type from format |
| `cyberchef_extract_hashes` | crypto | Extract hashes from text |
| `cyberchef_hash_statistics` | crypto | Analyze hash collection security |
| `cyberchef_validate_hash` | crypto | Verify hash format correctness |

## Dependencies

No additional npm packages required - pure JavaScript implementation using pattern matching.

## Timeline

| Task | Estimated Time |
|------|----------------|
| Hash patterns database | 1 day |
| Hash identifier | 0.5 days |
| Hash extractor | 0.5 days |
| Hash statistics | 0.5 days |
| Testing | 1 day |
| **Total** | **3.5 days** |

## Ethical Considerations

This integration explicitly excludes:
- Password cracking functionality
- Dictionary attack tools
- Rainbow table lookups
- Brute force capabilities

The tools are designed for:
- Hash identification (forensics, analysis)
- Security auditing (identifying weak algorithms)
- Data extraction (parsing logs, databases)
- Educational purposes (understanding hash types)

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Related Phases:** Phase 4 (Advanced Integrations)
