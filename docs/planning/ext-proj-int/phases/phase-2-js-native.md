# Phase 2: JavaScript Native Integrations

## Overview

| Attribute | Value |
|-----------|-------|
| Phase Number | 2 |
| Title | JavaScript Native Integrations |
| Duration | 3-4 weeks |
| Sprints | 3 (2.1, 2.2, 2.3) |
| Prerequisites | Phase 1 complete |
| Deliverables | cryptii integration, recipe presets, CyberChef-server patterns |

## Objectives

1. **cryptii Integration** - Port cryptii's modular encoding system as native tools
2. **Recipe Presets** - Convert cyberchef-recipes patterns to reusable presets
3. **Server Patterns** - Adopt beneficial patterns from CyberChef-server
4. **Encoding Library** - Comprehensive encoding detection and conversion

## Sprint Breakdown

### Sprint 2.1: cryptii Integration (1-1.5 weeks)

See [sprint-2.1-cryptii.md](../sprints/sprint-2.1-cryptii.md)

**Goal**: Integrate cryptii's encoding operations as MCP tools

**Tasks**:
1. Analyze cryptii source code structure
2. Identify portable encoding modules
3. Create cryptii adapter layer
4. Implement historical cipher tools
5. Add specialized encoding tools
6. Create comprehensive tests
7. Document all new tools

**New Tools**:
| Tool Name | Source | Description |
|-----------|--------|-------------|
| `cyberchef_encoding_morse` | cryptii | Morse code encode/decode |
| `cyberchef_encoding_braille` | cryptii | Braille pattern encoding |
| `cyberchef_encoding_baudot` | cryptii | Baudot/Murray code |
| `cyberchef_encoding_ascii85` | cryptii | ASCII85 (extended) |
| `cyberchef_cipher_enigma` | cryptii | Enigma machine simulation |
| `cyberchef_cipher_playfair` | cryptii | Playfair cipher |
| `cyberchef_cipher_polybius` | cryptii | Polybius square |
| `cyberchef_cipher_affine` | cryptii | Affine cipher |
| `cyberchef_cipher_bacon` | cryptii | Bacon's cipher |

### Sprint 2.2: Recipe Presets (1 week)

See [sprint-2.2-recipes.md](../sprints/sprint-2.2-recipes.md)

**Goal**: Convert popular cyberchef-recipes to callable presets

**Tasks**:
1. Parse cyberchef-recipes repository
2. Categorize recipes by use case
3. Create preset infrastructure
4. Implement malware analysis presets
5. Implement forensics presets
6. Implement encoding presets
7. Add recipe search functionality

**New Tools**:
| Tool Name | Recipe Source | Description |
|-----------|---------------|-------------|
| `cyberchef_recipe_powershell_deobfuscate` | Recipe 2, 30, 38 | PowerShell deobfuscation |
| `cyberchef_recipe_php_webshell` | Recipe 16, 26, 42 | PHP webshell analysis |
| `cyberchef_recipe_charcode_extract` | Recipe 3, 17 | CharCode extraction |
| `cyberchef_recipe_multilayer_decode` | Recipe 1, 5 | Multi-layer decoding |
| `cyberchef_recipe_cobalt_strike` | Recipe 28, 59 | Cobalt Strike analysis |
| `cyberchef_recipe_emotet` | Recipe 33, 62 | Emotet analysis |
| `cyberchef_recipe_timestamp_parse` | Recipe 6, 15, 45 | Timestamp conversions |
| `cyberchef_recipe_list` | - | List available presets |
| `cyberchef_recipe_search` | - | Search recipes by keyword |

### Sprint 2.3: Server Patterns (1 week)

See [sprint-2.3-server-patterns.md](../sprints/sprint-2.3-server-patterns.md)

**Goal**: Adopt useful patterns from CyberChef-server

**Tasks**:
1. Analyze CyberChef-server architecture
2. Identify beneficial patterns
3. Implement batch processing enhancements
4. Add recipe validation
5. Improve error handling
6. Optimize performance patterns
7. Document adopted patterns

**Enhancements**:
| Enhancement | Source | Description |
|-------------|--------|-------------|
| Batch recipe execution | CyberChef-server | Process multiple inputs with same recipe |
| Recipe validation | CyberChef-server | Validate recipe syntax before execution |
| Progress reporting | CyberChef-server | Report progress for long operations |
| Input streaming | CyberChef-server | Handle large inputs efficiently |

## Architecture Details

### cryptii Adapter

```javascript
// src/node/tools/encoding/cryptii-adapter.mjs

/**
 * cryptii is a modular system with:
 * - Bricks: Processing units (encoders, viewers)
 * - Pipes: Chains of bricks
 * - Settings: Configuration for bricks
 *
 * We adapt this to MCP tool pattern.
 */

export class CryptiiAdapter {
    constructor() {
        this.encoders = this.loadEncoders();
        this.ciphers = this.loadCiphers();
    }

    /**
     * Load available encoders from cryptii source
     */
    loadEncoders() {
        return {
            morse: new MorseEncoder(),
            braille: new BrailleEncoder(),
            baudot: new BaudotEncoder(),
            ascii85: new Ascii85Encoder(),
            // ... more encoders
        };
    }

    /**
     * Load available ciphers from cryptii source
     */
    loadCiphers() {
        return {
            enigma: new EnigmaCipher(),
            playfair: new PlayfairCipher(),
            polybius: new PolybiusCipher(),
            affine: new AffineCipher(),
            bacon: new BaconCipher(),
            // ... more ciphers
        };
    }

    /**
     * Encode using specified encoder
     */
    encode(input, encoderName, options = {}) {
        const encoder = this.encoders[encoderName];
        if (!encoder) {
            throw new Error(`Unknown encoder: ${encoderName}`);
        }
        return encoder.encode(input, options);
    }

    /**
     * Decode using specified encoder
     */
    decode(input, encoderName, options = {}) {
        const encoder = this.encoders[encoderName];
        if (!encoder) {
            throw new Error(`Unknown encoder: ${encoderName}`);
        }
        return encoder.decode(input, options);
    }

    /**
     * Encrypt using specified cipher
     */
    encrypt(input, cipherName, key, options = {}) {
        const cipher = this.ciphers[cipherName];
        if (!cipher) {
            throw new Error(`Unknown cipher: ${cipherName}`);
        }
        return cipher.encrypt(input, key, options);
    }

    /**
     * Decrypt using specified cipher
     */
    decrypt(input, cipherName, key, options = {}) {
        const cipher = this.ciphers[cipherName];
        if (!cipher) {
            throw new Error(`Unknown cipher: ${cipherName}`);
        }
        return cipher.decrypt(input, key, options);
    }
}
```

### Morse Encoder (Ported from cryptii)

```javascript
// src/node/tools/encoding/encoders/morse.mjs

const MORSE_TABLE = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.',
    'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---',
    'K': '-.-', 'L': '.-..', 'M': '--', 'N': '-.', 'O': '---',
    'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-',
    'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-', 'Y': '-.--',
    'Z': '--..', '0': '-----', '1': '.----', '2': '..---',
    '3': '...--', '4': '....-', '5': '.....', '6': '-....',
    '7': '--...', '8': '---..', '9': '----.', ' ': '/'
};

const REVERSE_MORSE = Object.fromEntries(
    Object.entries(MORSE_TABLE).map(([k, v]) => [v, k])
);

export class MorseEncoder {
    constructor() {
        this.name = 'morse';
        this.description = 'International Morse Code';
    }

    /**
     * Encode text to Morse code
     */
    encode(input, options = {}) {
        const separator = options.separator || ' ';
        const wordSeparator = options.wordSeparator || ' / ';

        return input
            .toUpperCase()
            .split(' ')
            .map(word =>
                word.split('')
                    .map(char => MORSE_TABLE[char] || char)
                    .join(separator)
            )
            .join(wordSeparator);
    }

    /**
     * Decode Morse code to text
     */
    decode(input, options = {}) {
        const separator = options.separator || ' ';
        const wordSeparator = options.wordSeparator || ' / ';

        return input
            .split(wordSeparator)
            .map(word =>
                word.split(separator)
                    .map(code => REVERSE_MORSE[code] || code)
                    .join('')
            )
            .join(' ');
    }
}
```

### Recipe Preset System

```javascript
// src/node/tools/recipes/preset-system.mjs

export class RecipePresetSystem {
    constructor() {
        this.presets = new Map();
        this.categories = new Map();
        this.loadPresets();
    }

    loadPresets() {
        // Load all preset categories
        this.loadMalwarePresets();
        this.loadForensicsPresets();
        this.loadEncodingPresets();
    }

    loadMalwarePresets() {
        this.register({
            name: 'powershell_deobfuscate',
            category: 'malware',
            description: 'Deobfuscate PowerShell scripts (CharCode, Base64, etc.)',
            recipe: [
                { op: 'Regular expression', args: ['User defined', '([0-9]{2,3}(,\\s|))+', true, true, false, false, false, false, 'List matches'] },
                { op: 'From Charcode', args: ['Comma', 10] },
                { op: 'Regular expression', args: ['User defined', '[a-zA-Z0-9+/=]{30,}', true, true, false, false, false, false, 'List matches'] },
                { op: 'From Base64', args: ['A-Za-z0-9+/=', true] },
                { op: 'Generic Code Beautify', args: [] }
            ],
            tags: ['powershell', 'malware', 'obfuscation', 'charcode', 'base64']
        });

        this.register({
            name: 'php_webshell',
            category: 'malware',
            description: 'Decode PHP webshells with gzinflate/base64 encoding',
            recipe: [
                { op: 'Regular expression', args: ['User defined', '[a-zA-Z0-9+/=]{30,}', true, true, false, false, false, false, 'List matches'] },
                { op: 'From Base64', args: ['A-Za-z0-9+/=', true] },
                { op: 'Raw Inflate', args: [0, 0, 'Adaptive', false, false] },
                { op: 'Generic Code Beautify', args: [] }
            ],
            tags: ['php', 'webshell', 'malware', 'gzinflate', 'base64']
        });

        this.register({
            name: 'cobalt_strike',
            category: 'malware',
            description: 'Analyze Cobalt Strike beacons',
            recipe: [
                { op: 'Subsection', args: ['(?<=\\x00\\x00\\x00\\x00)[\\x00-\\xff]+', true, true, false] },
                { op: 'Decode text', args: ['UTF-16LE (1200)'] },
                { op: 'Merge', args: [] }
            ],
            tags: ['cobalt strike', 'beacon', 'malware', 'c2']
        });
    }

    loadForensicsPresets() {
        this.register({
            name: 'google_timestamp',
            category: 'forensics',
            description: 'Convert Google ei timestamp to human readable',
            recipe: [
                { op: 'From Base64', args: ['A-Za-z0-9-_=', true] },
                { op: 'To Hex', args: ['None'] },
                { op: 'Take bytes', args: [0, 8, false] },
                { op: 'Swap endianness', args: ['Hex', 4, true] },
                { op: 'From Hex', args: ['Auto'] },
                { op: 'From UNIX Timestamp', args: ['Seconds (s)'] }
            ],
            tags: ['google', 'timestamp', 'forensics', 'ei']
        });

        this.register({
            name: 'mft_timestamp',
            category: 'forensics',
            description: 'Parse MFT $SI timestamps',
            recipe: [
                { op: 'Subsection', args: ['[a-f0-9]{16}', true, true, false] },
                { op: 'Swap endianness', args: ['Hex', 8, true] },
                { op: 'Windows Filetime to UNIX Timestamp', args: ['Seconds (s)', 'Hex'] },
                { op: 'Merge', args: [] }
            ],
            tags: ['mft', 'timestamp', 'forensics', 'windows']
        });
    }

    loadEncodingPresets() {
        this.register({
            name: 'multilayer_base64',
            category: 'encoding',
            description: 'Decode multiple layers of Base64 encoding',
            recipe: [
                { op: 'Label', args: ['decode'] },
                { op: 'Regular expression', args: ['User defined', '[a-zA-Z0-9+/=]{30,}', true, true, false, false, false, false, 'List matches'] },
                { op: 'From Base64', args: ['A-Za-z0-9+/=', true] },
                { op: 'Jump', args: ['decode', 10] }
            ],
            tags: ['base64', 'encoding', 'multilayer']
        });
    }

    /**
     * Register a preset
     */
    register(preset) {
        this.presets.set(preset.name, preset);

        if (!this.categories.has(preset.category)) {
            this.categories.set(preset.category, []);
        }
        this.categories.get(preset.category).push(preset.name);
    }

    /**
     * Get preset by name
     */
    get(name) {
        return this.presets.get(name);
    }

    /**
     * Search presets by keyword
     */
    search(query) {
        const results = [];
        const lowerQuery = query.toLowerCase();

        for (const preset of this.presets.values()) {
            if (preset.name.toLowerCase().includes(lowerQuery) ||
                preset.description.toLowerCase().includes(lowerQuery) ||
                preset.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) {
                results.push(preset);
            }
        }

        return results;
    }

    /**
     * List all presets
     */
    list(category = null) {
        if (category) {
            const names = this.categories.get(category) || [];
            return names.map(name => this.presets.get(name));
        }
        return [...this.presets.values()];
    }
}
```

### MCP Tool Wrappers

```javascript
// src/node/tools/recipes/recipe-tools.mjs

import { BaseTool } from '../base-tool.mjs';
import { RecipePresetSystem } from './preset-system.mjs';
import { bake } from '../../index.mjs';

const presetSystem = new RecipePresetSystem();

export class RecipePresetTool extends BaseTool {
    constructor(presetName) {
        const preset = presetSystem.get(presetName);

        super({
            name: `cyberchef_recipe_${presetName}`,
            description: preset.description,
            category: 'recipes',
            inputSchema: {
                type: 'object',
                properties: {
                    input: {
                        type: 'string',
                        description: 'Data to process'
                    }
                },
                required: ['input']
            }
        });

        this.preset = preset;
    }

    async execute(args) {
        const startTime = Date.now();

        try {
            const result = await bake(args.input, this.preset.recipe);

            return this.formatResult(result, {
                executionTime: Date.now() - startTime,
                preset: this.preset.name,
                category: this.preset.category
            });
        } catch (error) {
            return this.formatError(error);
        }
    }
}

export class RecipeListTool extends BaseTool {
    constructor() {
        super({
            name: 'cyberchef_recipe_list',
            description: 'List available recipe presets',
            category: 'recipes',
            inputSchema: {
                type: 'object',
                properties: {
                    category: {
                        type: 'string',
                        description: 'Filter by category (malware, forensics, encoding)',
                        enum: ['malware', 'forensics', 'encoding']
                    }
                }
            }
        });
    }

    async execute(args) {
        const presets = presetSystem.list(args.category);

        return this.formatResult({
            count: presets.length,
            presets: presets.map(p => ({
                name: p.name,
                description: p.description,
                category: p.category,
                tags: p.tags
            }))
        });
    }
}

export class RecipeSearchTool extends BaseTool {
    constructor() {
        super({
            name: 'cyberchef_recipe_search',
            description: 'Search recipe presets by keyword',
            category: 'recipes',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search term'
                    }
                },
                required: ['query']
            }
        });
    }

    async execute(args) {
        const results = presetSystem.search(args.query);

        return this.formatResult({
            count: results.length,
            results: results.map(p => ({
                name: p.name,
                description: p.description,
                category: p.category,
                tags: p.tags
            }))
        });
    }
}
```

## Testing Strategy

### cryptii Tests

```javascript
// tests/tools/encoding/morse.test.mjs
import { describe, it, expect } from 'vitest';
import { MorseEncoder } from '../../../src/node/tools/encoding/encoders/morse.mjs';

describe('MorseEncoder', () => {
    const encoder = new MorseEncoder();

    describe('encode()', () => {
        it('should encode "HELLO WORLD"', () => {
            const result = encoder.encode('HELLO WORLD');
            expect(result).toBe('.... . .-.. .-.. --- / .-- --- .-. .-.. -..');
        });

        it('should handle numbers', () => {
            const result = encoder.encode('123');
            expect(result).toBe('.---- ..--- ...--');
        });

        it('should preserve unknown characters', () => {
            const result = encoder.encode('A@B');
            expect(result).toBe('.- @ -...');
        });
    });

    describe('decode()', () => {
        it('should decode Morse to text', () => {
            const result = encoder.decode('.... . .-.. .-.. --- / .-- --- .-. .-.. -..');
            expect(result).toBe('HELLO WORLD');
        });

        it('should handle alternative separators', () => {
            const result = encoder.decode('....|.|.-..|.-..|---', { separator: '|' });
            expect(result).toBe('HELLO');
        });
    });
});
```

### Recipe Preset Tests

```javascript
// tests/tools/recipes/presets.test.mjs
import { describe, it, expect } from 'vitest';
import { RecipePresetSystem } from '../../../src/node/tools/recipes/preset-system.mjs';

describe('RecipePresetSystem', () => {
    const system = new RecipePresetSystem();

    describe('get()', () => {
        it('should return powershell_deobfuscate preset', () => {
            const preset = system.get('powershell_deobfuscate');
            expect(preset).toBeDefined();
            expect(preset.category).toBe('malware');
            expect(preset.recipe.length).toBeGreaterThan(0);
        });
    });

    describe('search()', () => {
        it('should find presets by keyword', () => {
            const results = system.search('base64');
            expect(results.length).toBeGreaterThan(0);
            expect(results.some(p => p.tags.includes('base64'))).toBe(true);
        });
    });

    describe('list()', () => {
        it('should list all presets', () => {
            const all = system.list();
            expect(all.length).toBeGreaterThan(5);
        });

        it('should filter by category', () => {
            const malware = system.list('malware');
            expect(malware.every(p => p.category === 'malware')).toBe(true);
        });
    });
});
```

## Dependencies

### npm Packages to Add

| Package | Version | Purpose |
|---------|---------|---------|
| None | - | cryptii code is ported directly |

### cryptii Components to Port

| Component | Source File | Priority |
|-----------|-------------|----------|
| Morse | `src/Encoder/MorseCode.js` | High |
| Braille | `src/Encoder/Braille.js` | High |
| Baudot | `src/Encoder/Baudot.js` | Medium |
| ASCII85 | `src/Encoder/Ascii85.js` | Medium |
| Enigma | `src/Encoder/Enigma.js` | High |
| Playfair | `src/Encoder/Playfair.js` | Medium |
| Polybius | `src/Encoder/Polybius.js` | Medium |
| Affine | `src/Encoder/Affine.js` | Medium |
| Bacon | `src/Encoder/Bacon.js` | Low |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| cryptii license issues | Low | High | Verify MIT compatibility |
| Recipe compatibility | Medium | Medium | Test all converted recipes |
| Performance degradation | Low | Medium | Benchmark preset execution |
| Missing edge cases | Medium | Low | Comprehensive test coverage |

## Success Criteria

1. 10+ new encoding tools from cryptii
2. 15+ recipe presets implemented
3. Recipe search working accurately
4. All tests passing (> 90% coverage)
5. Documentation complete

## Acceptance Criteria

### Sprint 2.1 (cryptii)
- [ ] Morse encoder/decoder working
- [ ] 5+ additional encoders ported
- [ ] 3+ cipher implementations ported
- [ ] All unit tests passing
- [ ] Tools accessible via MCP

### Sprint 2.2 (Recipes)
- [ ] 15+ recipe presets defined
- [ ] Recipe list tool working
- [ ] Recipe search tool working
- [ ] All preset tests passing
- [ ] Documentation complete

### Sprint 2.3 (Server Patterns)
- [ ] Batch processing enhanced
- [ ] Recipe validation implemented
- [ ] Error handling improved
- [ ] Performance optimizations applied
- [ ] Patterns documented

## Timeline

```
Week 5: Sprint 2.1 (cryptii)
  - Days 1-2: Port Morse, Braille encoders
  - Days 3-4: Port Enigma cipher
  - Day 5: Testing and integration

Week 6: Sprint 2.2 (Recipes)
  - Days 1-2: Malware presets
  - Days 3-4: Forensics presets
  - Day 5: Search functionality

Week 7: Sprint 2.3 (Server Patterns)
  - Days 1-2: Batch processing
  - Days 3-4: Validation and errors
  - Day 5: Performance optimization

Week 8: Buffer/Polish
  - Integration testing
  - Documentation
  - Bug fixes
```

## Definition of Done

- All code reviewed and merged
- Unit tests passing with > 90% coverage
- Integration tests passing
- All new tools documented
- No known bugs
- Performance benchmarks acceptable
- Ready for Phase 3

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Previous Phase:** [Phase 1: Foundation](phase-1-foundation.md)
**Next Phase:** [Phase 3: Algorithm Ports](phase-3-algorithm-port.md)
