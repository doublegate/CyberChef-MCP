# Sprint 4.1: John Hash Identification

## Sprint Overview

| Field | Value |
|-------|-------|
| Sprint | 4.1 |
| Phase | 4 - Advanced Integrations |
| Duration | 2 weeks |
| Start | Week 19 |
| End | Week 20 |

## Objectives

1. Port John the Ripper hash pattern database to JavaScript
2. Implement hash type identification from format signatures
3. Create hash format validation and analysis tools
4. Build comprehensive hash metadata reporting

## User Stories

### US-4.1.1: Hash Type Detection

**As a** security analyst
**I want** automatic hash type identification
**So that** I can determine the correct cracking approach

**Acceptance Criteria:**
- [ ] Identify 100+ hash formats by pattern
- [ ] Return confidence scores for ambiguous hashes
- [ ] Support multi-match scenarios
- [ ] Provide John format names for compatibility

### US-4.1.2: Hash Format Validation

**As a** penetration tester
**I want** to validate hash format integrity
**So that** I can ensure hashes are properly formatted

**Acceptance Criteria:**
- [ ] Validate structure matches expected format
- [ ] Check character set validity
- [ ] Verify length requirements
- [ ] Detect truncated or corrupted hashes

### US-4.1.3: Hash Metadata Analysis

**As a** forensic analyst
**I want** detailed hash metadata extraction
**So that** I can understand hash origins and properties

**Acceptance Criteria:**
- [ ] Extract salt if present
- [ ] Identify algorithm parameters (rounds, cost)
- [ ] Determine hash version/variant
- [ ] Provide cracking difficulty estimate

### US-4.1.4: Batch Hash Processing

**As a** CTF player
**I want** to process multiple hashes at once
**So that** I can efficiently analyze hash dumps

**Acceptance Criteria:**
- [ ] Process lists of hashes
- [ ] Group by detected type
- [ ] Deduplicate identical hashes
- [ ] Export categorized results

## Tasks

### Hash Pattern Database (Day 1-4)

| ID | Task | Estimate | Assignee |
|----|------|----------|----------|
| T-4.1.1 | Extract John hash patterns from source | 4h | - |
| T-4.1.2 | Create pattern registry data structure | 3h | - |
| T-4.1.3 | Implement 50 common hash patterns | 6h | - |
| T-4.1.4 | Implement 50 additional hash patterns | 6h | - |
| T-4.1.5 | Add pattern metadata (strength, notes) | 3h | - |

### Hash Identifier (Day 5-7)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-4.1.6 | Create HashIdentifier class | 4h | T-4.1.2 |
| T-4.1.7 | Implement confidence scoring | 3h | T-4.1.6 |
| T-4.1.8 | Add ambiguity resolution logic | 4h | T-4.1.7 |
| T-4.1.9 | Implement batch identification | 3h | T-4.1.6 |

### Hash Validation (Day 8-9)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-4.1.10 | Create HashValidator class | 3h | T-4.1.2 |
| T-4.1.11 | Implement format-specific validators | 5h | T-4.1.10 |
| T-4.1.12 | Add hash repair suggestions | 3h | T-4.1.10 |

### Integration (Day 10)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-4.1.13 | Register MCP tools | 3h | All |
| T-4.1.14 | Write comprehensive tests | 6h | T-4.1.13 |
| T-4.1.15 | Documentation | 2h | All |

## Deliverables

### Files to Create

```
src/node/tools/
├── hash-analysis/
│   ├── index.mjs           # Module exports
│   ├── patterns.mjs        # Hash pattern database
│   ├── identifier.mjs      # Hash identification logic
│   ├── validator.mjs       # Hash format validation
│   ├── analyzer.mjs        # Metadata extraction
│   └── register.mjs        # Tool registration
```

### Code Specifications

#### Hash Patterns Database (patterns.mjs)

```javascript
/**
 * Hash pattern database (derived from John the Ripper)
 *
 * Pattern format:
 * - regex: Pattern to match the hash
 * - type: Human-readable hash type name
 * - johnFormat: John the Ripper format name
 * - hashcat: Hashcat mode number (for reference)
 * - length: Expected hash length (if fixed)
 * - charset: Valid character set
 * - strength: Relative cracking difficulty (1-10)
 * - notes: Additional information
 */

export const HASH_PATTERNS = [
    // MD5 family
    {
        regex: /^[a-f0-9]{32}$/i,
        type: 'MD5',
        johnFormat: 'raw-md5',
        hashcat: 0,
        length: 32,
        charset: 'hex',
        strength: 1,
        notes: 'Fast to crack, no salt'
    },
    {
        regex: /^\$1\$[./A-Za-z0-9]{8}\$[./A-Za-z0-9]{22}$/,
        type: 'MD5 crypt',
        johnFormat: 'md5crypt',
        hashcat: 500,
        strength: 4,
        notes: 'Unix MD5 with salt and rounds'
    },
    {
        regex: /^\$apr1\$/,
        type: 'Apache MD5',
        johnFormat: 'md5crypt',
        hashcat: 1600,
        strength: 4,
        notes: 'Apache htpasswd MD5'
    },

    // SHA family
    {
        regex: /^[a-f0-9]{40}$/i,
        type: 'SHA-1',
        johnFormat: 'raw-sha1',
        hashcat: 100,
        length: 40,
        charset: 'hex',
        strength: 2,
        notes: 'Fast to crack, no salt'
    },
    {
        regex: /^[a-f0-9]{64}$/i,
        type: 'SHA-256',
        johnFormat: 'raw-sha256',
        hashcat: 1400,
        length: 64,
        charset: 'hex',
        strength: 2,
        notes: 'Fast to crack, no salt'
    },
    {
        regex: /^[a-f0-9]{128}$/i,
        type: 'SHA-512',
        johnFormat: 'raw-sha512',
        hashcat: 1700,
        length: 128,
        charset: 'hex',
        strength: 2,
        notes: 'Fast to crack, no salt'
    },
    {
        regex: /^\$5\$(?:rounds=\d+\$)?[./A-Za-z0-9]{1,16}\$[./A-Za-z0-9]{43}$/,
        type: 'SHA-256 crypt',
        johnFormat: 'sha256crypt',
        hashcat: 7400,
        strength: 6,
        notes: 'Unix SHA-256 with salt and configurable rounds'
    },
    {
        regex: /^\$6\$(?:rounds=\d+\$)?[./A-Za-z0-9]{1,16}\$[./A-Za-z0-9]{86}$/,
        type: 'SHA-512 crypt',
        johnFormat: 'sha512crypt',
        hashcat: 1800,
        strength: 7,
        notes: 'Unix SHA-512 with salt and configurable rounds'
    },

    // bcrypt
    {
        regex: /^\$2[ayb]\$\d{2}\$[./A-Za-z0-9]{53}$/,
        type: 'bcrypt',
        johnFormat: 'bcrypt',
        hashcat: 3200,
        strength: 9,
        notes: 'Slow hash, cost factor in hash'
    },
    {
        regex: /^\$2[ayb]\$\d{2}\$[./A-Za-z0-9]{22}/,
        type: 'bcrypt (truncated)',
        johnFormat: 'bcrypt',
        strength: 0,
        notes: 'Truncated bcrypt, may be invalid'
    },

    // Argon2
    {
        regex: /^\$argon2id?\$v=\d+\$m=\d+,t=\d+,p=\d+\$/,
        type: 'Argon2',
        johnFormat: 'argon2',
        hashcat: 13700,
        strength: 10,
        notes: 'Memory-hard, highly secure'
    },

    // scrypt
    {
        regex: /^\$scrypt\$/,
        type: 'scrypt',
        johnFormat: 'scrypt',
        hashcat: 8900,
        strength: 9,
        notes: 'Memory-hard, secure'
    },

    // PBKDF2
    {
        regex: /^\$pbkdf2-sha256\$/,
        type: 'PBKDF2-SHA256',
        johnFormat: 'pbkdf2-sha256',
        hashcat: 10900,
        strength: 7,
        notes: 'Iterations configurable'
    },

    // Windows
    {
        regex: /^[a-f0-9]{32}:[a-f0-9]{32}$/i,
        type: 'LM:NTLM',
        johnFormat: 'nt',
        hashcat: 1000,
        length: 65,
        strength: 3,
        notes: 'Windows hash pair (pwdump format)'
    },
    {
        regex: /^[a-f0-9]{32}$/i,
        type: 'NTLM (possible)',
        johnFormat: 'nt',
        hashcat: 1000,
        length: 32,
        strength: 2,
        notes: 'Could be MD5 or NTLM'
    },

    // MySQL
    {
        regex: /^\*[A-F0-9]{40}$/,
        type: 'MySQL 5.x',
        johnFormat: 'mysql-sha1',
        hashcat: 300,
        length: 41,
        strength: 2,
        notes: 'Double SHA-1'
    },
    {
        regex: /^[a-f0-9]{16}$/i,
        type: 'MySQL 3.x/4.x',
        johnFormat: 'mysql',
        hashcat: 200,
        length: 16,
        strength: 1,
        notes: 'Very weak, easily crackable'
    },

    // PostgreSQL
    {
        regex: /^md5[a-f0-9]{32}$/,
        type: 'PostgreSQL MD5',
        johnFormat: 'postgres',
        hashcat: 12,
        length: 35,
        strength: 2,
        notes: 'MD5(password + username)'
    },

    // Oracle
    {
        regex: /^[A-F0-9]{16}$/,
        type: 'Oracle 7-10g',
        johnFormat: 'oracle',
        hashcat: 3100,
        length: 16,
        strength: 3,
        notes: 'DES-based, weak'
    },
    {
        regex: /^S:[A-F0-9]{60}$/,
        type: 'Oracle 11g',
        johnFormat: 'oracle11',
        hashcat: 112,
        length: 62,
        strength: 4,
        notes: 'SHA-1 based'
    },

    // MSSQL
    {
        regex: /^0x0100[a-f0-9]{48}$/i,
        type: 'MSSQL 2000',
        johnFormat: 'mssql',
        hashcat: 131,
        strength: 3,
        notes: 'SHA-1 with case-preserving'
    },
    {
        regex: /^0x0200[a-f0-9]{136}$/i,
        type: 'MSSQL 2012+',
        johnFormat: 'mssql12',
        hashcat: 1731,
        strength: 4,
        notes: 'SHA-512 based'
    },

    // Web Applications
    {
        regex: /^[a-f0-9]{32}:[a-f0-9]+$/i,
        type: 'MD5 with salt',
        johnFormat: 'dynamic_0',
        strength: 3,
        notes: 'Salted MD5, common in web apps'
    },
    {
        regex: /^sha1\$[a-z0-9]+\$[a-f0-9]{40}$/i,
        type: 'Django SHA-1',
        johnFormat: 'django',
        hashcat: 800,
        strength: 3,
        notes: 'Django web framework SHA-1'
    },
    {
        regex: /^pbkdf2_sha256\$/,
        type: 'Django PBKDF2',
        johnFormat: 'django',
        hashcat: 10000,
        strength: 7,
        notes: 'Django web framework PBKDF2'
    },

    // Network/Protocol
    {
        regex: /^\$krb5pa\$23\$/,
        type: 'Kerberos 5 AS-REQ Pre-Auth',
        johnFormat: 'krb5pa-sha1',
        hashcat: 7500,
        strength: 5,
        notes: 'Active Directory Kerberos'
    },
    {
        regex: /^\$krb5tgs\$23\$/,
        type: 'Kerberos 5 TGS-REP',
        johnFormat: 'krb5tgs',
        hashcat: 13100,
        strength: 5,
        notes: 'Kerberoasting target'
    },
    {
        regex: /^\$NETLM\$/,
        type: 'NetLMv1',
        johnFormat: 'netntlm',
        hashcat: 5500,
        strength: 2,
        notes: 'Legacy Windows network auth'
    },
    {
        regex: /^\$NETNTLMv2\$/,
        type: 'NetNTLMv2',
        johnFormat: 'netntlmv2',
        hashcat: 5600,
        strength: 4,
        notes: 'Modern Windows network auth'
    },

    // Archive/File encryption
    {
        regex: /^\$pkzip2\$/,
        type: 'PKZIP',
        johnFormat: 'pkzip',
        hashcat: 17200,
        strength: 5,
        notes: 'Legacy ZIP encryption'
    },
    {
        regex: /^\$RAR3\$/,
        type: 'RAR3',
        johnFormat: 'rar',
        hashcat: 12500,
        strength: 6,
        notes: 'RAR 3.x encryption'
    },
    {
        regex: /^\$RAR5\$/,
        type: 'RAR5',
        johnFormat: 'rar5',
        hashcat: 13000,
        strength: 7,
        notes: 'RAR 5.x encryption (PBKDF2)'
    },
    {
        regex: /^\$7z\$/,
        type: '7-Zip',
        johnFormat: '7z',
        hashcat: 11600,
        strength: 7,
        notes: '7-Zip AES encryption'
    },
    {
        regex: /^\$pdf\$/,
        type: 'PDF',
        johnFormat: 'pdf',
        hashcat: 10400,
        strength: 5,
        notes: 'PDF document encryption'
    },
    {
        regex: /^\$office\$/,
        type: 'MS Office',
        johnFormat: 'office',
        hashcat: 9400,
        strength: 6,
        notes: 'Microsoft Office encryption'
    },

    // SSH/Keys
    {
        regex: /^\$sshng\$/,
        type: 'SSH Private Key',
        johnFormat: 'ssh',
        hashcat: 22911,
        strength: 7,
        notes: 'OpenSSH private key'
    },
    {
        regex: /^\$gpg\$/,
        type: 'GPG',
        johnFormat: 'gpg',
        hashcat: 17300,
        strength: 7,
        notes: 'GnuPG private key'
    },

    // Cryptocurrency
    {
        regex: /^\$bitcoin\$/,
        type: 'Bitcoin wallet',
        johnFormat: 'bitcoin',
        hashcat: 11300,
        strength: 8,
        notes: 'Bitcoin Core wallet'
    },
    {
        regex: /^\$ethereum\$/,
        type: 'Ethereum wallet',
        johnFormat: 'ethereum',
        hashcat: 15600,
        strength: 9,
        notes: 'Ethereum keystore'
    },

    // WPA/WiFi
    {
        regex: /^WPA\*\d+\*/,
        type: 'WPA-PBKDF2',
        johnFormat: 'wpapsk',
        hashcat: 22000,
        strength: 6,
        notes: 'WiFi WPA/WPA2 handshake'
    },

    // Miscellaneous
    {
        regex: /^{SSHA}/,
        type: 'LDAP SSHA',
        johnFormat: 'ssha',
        hashcat: 111,
        strength: 3,
        notes: 'LDAP salted SHA-1'
    },
    {
        regex: /^{SHA}/,
        type: 'LDAP SHA',
        johnFormat: 'sha1-gen',
        hashcat: 101,
        strength: 2,
        notes: 'LDAP unsalted SHA-1'
    },
    {
        regex: /^{CRYPT}/,
        type: 'LDAP CRYPT',
        johnFormat: 'crypt',
        strength: 4,
        notes: 'LDAP with system crypt()'
    }
];

/**
 * Pattern categories for grouping
 */
export const HASH_CATEGORIES = {
    'message_digest': ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'],
    'unix_crypt': ['MD5 crypt', 'SHA-256 crypt', 'SHA-512 crypt', 'bcrypt'],
    'password_kdf': ['bcrypt', 'Argon2', 'scrypt', 'PBKDF2-SHA256'],
    'database': ['MySQL 5.x', 'PostgreSQL MD5', 'Oracle 11g', 'MSSQL 2012+'],
    'windows': ['NTLM', 'LM:NTLM', 'NetNTLMv2', 'Kerberos 5 TGS-REP'],
    'web_app': ['Django SHA-1', 'Django PBKDF2', 'MD5 with salt'],
    'archive': ['PKZIP', 'RAR3', 'RAR5', '7-Zip'],
    'document': ['PDF', 'MS Office'],
    'network': ['WPA-PBKDF2', 'Kerberos 5 AS-REQ Pre-Auth'],
    'crypto': ['SSH Private Key', 'GPG', 'Bitcoin wallet', 'Ethereum wallet']
};

/**
 * Get patterns sorted by specificity (most specific first)
 */
export function getSortedPatterns() {
    return [...HASH_PATTERNS].sort((a, b) => {
        // Longer patterns are more specific
        const lenA = a.regex.source.length;
        const lenB = b.regex.source.length;
        return lenB - lenA;
    });
}
```

#### Hash Identifier (identifier.mjs)

```javascript
/**
 * Hash identification system (ported from John the Ripper)
 */

import { HASH_PATTERNS, getSortedPatterns, HASH_CATEGORIES } from './patterns.mjs';

/**
 * Identify hash type from input string
 */
export function identifyHash(hash, options = {}) {
    const {
        returnAll = false,      // Return all matches, not just best
        minConfidence = 0.5,    // Minimum confidence threshold
        preferStrong = false    // Prefer stronger algorithms when ambiguous
    } = options;

    if (!hash || typeof hash !== 'string') {
        return {
            success: false,
            error: 'Invalid hash input'
        };
    }

    const cleanHash = hash.trim();
    const matches = [];
    const patterns = getSortedPatterns();

    for (const pattern of patterns) {
        if (pattern.regex.test(cleanHash)) {
            const confidence = calculateConfidence(cleanHash, pattern);

            if (confidence >= minConfidence) {
                matches.push({
                    type: pattern.type,
                    johnFormat: pattern.johnFormat,
                    hashcat: pattern.hashcat,
                    confidence,
                    strength: pattern.strength,
                    notes: pattern.notes,
                    category: findCategory(pattern.type)
                });
            }
        }
    }

    if (matches.length === 0) {
        return {
            success: false,
            hash: cleanHash,
            message: 'No matching hash pattern found',
            suggestions: suggestFormat(cleanHash)
        };
    }

    // Sort by confidence, then by strength if requested
    matches.sort((a, b) => {
        if (preferStrong && Math.abs(a.confidence - b.confidence) < 0.1) {
            return b.strength - a.strength;
        }
        return b.confidence - a.confidence;
    });

    return {
        success: true,
        hash: cleanHash,
        bestMatch: matches[0],
        allMatches: returnAll ? matches : undefined,
        isAmbiguous: matches.length > 1 &&
                     matches[0].confidence - matches[1].confidence < 0.2
    };
}

/**
 * Calculate confidence score for a match
 */
function calculateConfidence(hash, pattern) {
    let confidence = 0.5; // Base confidence for regex match

    // Length match bonus
    if (pattern.length && hash.length === pattern.length) {
        confidence += 0.2;
    }

    // Character set validation
    if (pattern.charset) {
        if (pattern.charset === 'hex' && /^[a-f0-9]+$/i.test(hash)) {
            confidence += 0.15;
        }
    }

    // Format-specific markers (high confidence)
    if (pattern.type.includes('crypt') && hash.startsWith('$')) {
        confidence += 0.15;
    }
    if (pattern.type === 'bcrypt' && hash.startsWith('$2')) {
        confidence += 0.2;
    }
    if (pattern.type.includes('MySQL') && hash.startsWith('*')) {
        confidence += 0.2;
    }

    // Penalize ambiguous cases
    if (pattern.type.includes('possible')) {
        confidence -= 0.2;
    }

    return Math.min(1.0, Math.max(0, confidence));
}

/**
 * Find category for a hash type
 */
function findCategory(type) {
    for (const [category, types] of Object.entries(HASH_CATEGORIES)) {
        if (types.includes(type)) {
            return category;
        }
    }
    return 'unknown';
}

/**
 * Suggest possible formats for unknown hash
 */
function suggestFormat(hash) {
    const suggestions = [];
    const len = hash.length;

    // Length-based suggestions
    if (len === 32 && /^[a-f0-9]+$/i.test(hash)) {
        suggestions.push('Possibly MD5, MD4, or NTLM');
    } else if (len === 40 && /^[a-f0-9]+$/i.test(hash)) {
        suggestions.push('Possibly SHA-1');
    } else if (len === 64 && /^[a-f0-9]+$/i.test(hash)) {
        suggestions.push('Possibly SHA-256');
    } else if (hash.startsWith('$')) {
        suggestions.push('Appears to be a modular crypt format');
    }

    // Character analysis
    const hasSpecial = /[^a-f0-9]/i.test(hash);
    if (!hasSpecial) {
        suggestions.push('Pure hex hash - likely unsalted message digest');
    }

    return suggestions;
}

/**
 * Batch identify multiple hashes
 */
export function identifyHashes(hashes, options = {}) {
    const results = {
        identified: [],
        unknown: [],
        byType: new Map(),
        stats: {
            total: hashes.length,
            identified: 0,
            unknown: 0,
            ambiguous: 0
        }
    };

    const seen = new Set();

    for (const hash of hashes) {
        // Skip duplicates
        if (seen.has(hash)) continue;
        seen.add(hash);

        const result = identifyHash(hash, options);

        if (result.success) {
            results.identified.push(result);
            results.stats.identified++;

            if (result.isAmbiguous) {
                results.stats.ambiguous++;
            }

            // Group by type
            const type = result.bestMatch.type;
            if (!results.byType.has(type)) {
                results.byType.set(type, []);
            }
            results.byType.get(type).push(result);
        } else {
            results.unknown.push(result);
            results.stats.unknown++;
        }
    }

    return results;
}

/**
 * Get hash cracking strategy recommendation
 */
export function getCrackingStrategy(hashResult) {
    if (!hashResult.success) {
        return { strategy: 'unknown', recommendation: 'Cannot recommend strategy for unknown hash' };
    }

    const match = hashResult.bestMatch;
    const strategies = [];

    // Based on strength
    if (match.strength <= 2) {
        strategies.push({
            method: 'gpu_bruteforce',
            priority: 1,
            reason: 'Fast hash, GPU acceleration highly effective'
        });
        strategies.push({
            method: 'rainbow_tables',
            priority: 2,
            reason: 'Pre-computed tables available for common formats'
        });
    } else if (match.strength <= 5) {
        strategies.push({
            method: 'wordlist_rules',
            priority: 1,
            reason: 'Medium difficulty, dictionary with rules recommended'
        });
        strategies.push({
            method: 'mask_attack',
            priority: 2,
            reason: 'Pattern-based attack if format is known'
        });
    } else {
        strategies.push({
            method: 'wordlist_only',
            priority: 1,
            reason: 'Slow hash, focused wordlist attack recommended'
        });
        strategies.push({
            method: 'targeted_wordlist',
            priority: 2,
            reason: 'Custom wordlist based on target context'
        });
    }

    return {
        hash: hashResult.hash,
        type: match.type,
        strength: match.strength,
        johnFormat: match.johnFormat,
        hashcatMode: match.hashcat,
        strategies,
        estimatedDifficulty: getDifficultyLabel(match.strength)
    };
}

function getDifficultyLabel(strength) {
    if (strength <= 2) return 'Easy (minutes to hours)';
    if (strength <= 4) return 'Medium (hours to days)';
    if (strength <= 6) return 'Hard (days to weeks)';
    if (strength <= 8) return 'Very Hard (weeks to months)';
    return 'Extreme (months to years)';
}
```

#### Hash Analyzer (analyzer.mjs)

```javascript
/**
 * Detailed hash analysis and metadata extraction
 */

import { identifyHash } from './identifier.mjs';

/**
 * Extract hash metadata
 */
export function analyzeHash(hash, options = {}) {
    const identification = identifyHash(hash, { returnAll: true });

    if (!identification.success) {
        return {
            success: false,
            error: 'Could not identify hash type',
            ...identification
        };
    }

    const analysis = {
        success: true,
        hash: hash,
        identification: identification.bestMatch,
        metadata: extractMetadata(hash, identification.bestMatch),
        structure: analyzeStructure(hash),
        security: assessSecurity(identification.bestMatch)
    };

    return analysis;
}

/**
 * Extract format-specific metadata
 */
function extractMetadata(hash, match) {
    const metadata = {
        type: match.type,
        hashLength: hash.length,
        components: {}
    };

    // bcrypt parsing
    if (match.type === 'bcrypt') {
        const parts = hash.split('$');
        metadata.components = {
            algorithm: parts[1],
            cost: parseInt(parts[2], 10),
            saltAndHash: parts[3]
        };
        metadata.iterations = Math.pow(2, metadata.components.cost);
    }

    // SHA crypt parsing
    if (match.type.includes('crypt') && hash.startsWith('$')) {
        const parts = hash.split('$').filter(Boolean);
        metadata.components.identifier = parts[0];

        if (hash.includes('rounds=')) {
            const roundsMatch = hash.match(/rounds=(\d+)/);
            if (roundsMatch) {
                metadata.components.rounds = parseInt(roundsMatch[1], 10);
            }
        }

        // Salt extraction
        const saltIndex = hash.includes('rounds=') ? 2 : 1;
        if (parts[saltIndex]) {
            metadata.components.salt = parts[saltIndex];
        }
    }

    // Argon2 parsing
    if (match.type === 'Argon2') {
        const paramsMatch = hash.match(/m=(\d+),t=(\d+),p=(\d+)/);
        if (paramsMatch) {
            metadata.components = {
                memory: parseInt(paramsMatch[1], 10),
                iterations: parseInt(paramsMatch[2], 10),
                parallelism: parseInt(paramsMatch[3], 10)
            };
        }
    }

    // Salt detection for simple salted hashes
    if (hash.includes(':')) {
        const parts = hash.split(':');
        if (parts.length === 2) {
            metadata.components.hash = parts[0];
            metadata.components.salt = parts[1];
            metadata.hasSalt = true;
        }
    }

    return metadata;
}

/**
 * Analyze hash structure
 */
function analyzeStructure(hash) {
    const structure = {
        length: hash.length,
        charsetAnalysis: analyzeCharset(hash),
        format: detectFormat(hash),
        encoding: detectEncoding(hash)
    };

    return structure;
}

/**
 * Analyze character set used in hash
 */
function analyzeCharset(hash) {
    const analysis = {
        hasUpperHex: /[A-F]/.test(hash),
        hasLowerHex: /[a-f]/.test(hash),
        hasDigits: /[0-9]/.test(hash),
        hasSpecialChars: /[^a-fA-F0-9]/.test(hash),
        hasDollarSign: hash.includes('$'),
        hasColon: hash.includes(':'),
        hasSlash: /[\/]/.test(hash),
        hasDot: hash.includes('.'),
        isPureHex: /^[a-fA-F0-9]+$/.test(hash),
        isBase64Like: /^[A-Za-z0-9+\/=]+$/.test(hash)
    };

    // Determine likely charset
    if (analysis.isPureHex) {
        analysis.likelyCharset = 'hexadecimal';
    } else if (analysis.isBase64Like) {
        analysis.likelyCharset = 'base64-like';
    } else if (analysis.hasDollarSign) {
        analysis.likelyCharset = 'modular-crypt';
    } else {
        analysis.likelyCharset = 'mixed';
    }

    return analysis;
}

/**
 * Detect hash format style
 */
function detectFormat(hash) {
    if (hash.startsWith('$')) {
        return 'modular-crypt';
    }
    if (hash.startsWith('{')) {
        return 'ldap-scheme';
    }
    if (hash.startsWith('0x')) {
        return 'hex-prefixed';
    }
    if (hash.startsWith('*')) {
        return 'mysql-style';
    }
    if (hash.includes(':')) {
        return 'pwdump-style';
    }
    if (/^[a-f0-9]+$/i.test(hash)) {
        return 'raw-hex';
    }
    return 'unknown';
}

/**
 * Detect if hash might be encoded
 */
function detectEncoding(hash) {
    // Check for Base64 encoding
    if (/^[A-Za-z0-9+\/]+=*$/.test(hash) && hash.length % 4 === 0) {
        try {
            const decoded = atob(hash);
            // If decoded is valid hex, might be base64-encoded hash
            if (/^[a-f0-9]+$/i.test(decoded)) {
                return {
                    possiblyEncoded: true,
                    encoding: 'base64',
                    decodedLength: decoded.length
                };
            }
        } catch (e) {
            // Not valid Base64
        }
    }

    return { possiblyEncoded: false };
}

/**
 * Assess security properties of hash type
 */
function assessSecurity(match) {
    const assessment = {
        algorithm: match.type,
        strengthRating: match.strength,
        strengthLabel: getStrengthLabel(match.strength),
        recommendations: [],
        vulnerabilities: []
    };

    // Algorithm-specific assessments
    if (match.type === 'MD5' || match.type === 'MD5 crypt') {
        assessment.vulnerabilities.push('MD5 is cryptographically broken');
        assessment.recommendations.push('Migrate to bcrypt, Argon2, or SHA-512 crypt');
    }

    if (match.type === 'SHA-1') {
        assessment.vulnerabilities.push('SHA-1 has known collision attacks');
        assessment.recommendations.push('Use SHA-256 or stronger for new applications');
    }

    if (match.type === 'NTLM' || match.type === 'LM:NTLM') {
        assessment.vulnerabilities.push('NTLM is fast to crack');
        assessment.recommendations.push('Implement password policies, consider Azure AD Password Protection');
    }

    if (match.type.includes('unsalted') || (!match.type.includes('salt') && match.strength <= 2)) {
        assessment.vulnerabilities.push('No salt - vulnerable to rainbow table attacks');
        assessment.recommendations.push('Always use salted hashing');
    }

    if (match.strength >= 8) {
        assessment.recommendations.push('Strong algorithm - ensure passwords are also strong');
    }

    return assessment;
}

function getStrengthLabel(strength) {
    const labels = {
        1: 'Very Weak',
        2: 'Weak',
        3: 'Below Average',
        4: 'Average',
        5: 'Above Average',
        6: 'Good',
        7: 'Strong',
        8: 'Very Strong',
        9: 'Excellent',
        10: 'Maximum'
    };
    return labels[strength] || 'Unknown';
}
```

### MCP Tools Registered

| Tool Name | Description |
|-----------|-------------|
| `cyberchef_hash_identify` | Identify hash type from pattern |
| `cyberchef_hash_analyze` | Detailed hash analysis |
| `cyberchef_hash_validate` | Validate hash format |
| `cyberchef_hash_batch` | Batch hash identification |
| `cyberchef_hash_strategy` | Get cracking strategy recommendation |

## Definition of Done

- [ ] 100+ hash patterns implemented
- [ ] Identification accuracy > 95% for known formats
- [ ] Batch processing working
- [ ] Unit tests with > 85% coverage
- [ ] All MCP tools functional
- [ ] Documentation complete

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Ambiguous patterns | Medium | High | Confidence scoring, multi-match |
| Missing obscure formats | Low | Medium | Extensible pattern registry |
| False positives | Medium | Medium | Length/charset validation |

## Dependencies

### External

- None (pure JavaScript regex)

### Internal

- Sprint 1.1 (ToolRegistry)

## Notes

- Do NOT attempt to crack hashes - only identify
- Ethical use warnings in documentation
- No sensitive pattern details (salt positions, etc.)

---

**Sprint Version:** 1.0.0
**Created:** 2025-12-17
