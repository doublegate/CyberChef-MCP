# Sprint 2.1: cryptii Integration

## Sprint Overview

| Field | Value |
|-------|-------|
| Sprint | 2.1 |
| Phase | 2 - JavaScript Native |
| Duration | 2 weeks |
| Start | Week 5 |
| End | Week 6 |

## Objectives

1. Integrate cryptii encoding/decoding capabilities
2. Port specialized encoding algorithms (Morse, Braille, Enigma)
3. Create chain encoding detection
4. Register cryptii-based tools with MCP server

## User Stories

### US-2.1.1: Specialized Encodings

**As a** security analyst
**I want** access to specialized encodings beyond standard formats
**So that** I can handle unusual encoding schemes

**Acceptance Criteria:**
- [ ] Morse code encode/decode
- [ ] Braille translation
- [ ] Polybius square cipher
- [ ] Baudot code handling
- [ ] Unicode obfuscation detection

### US-2.1.2: Historical Ciphers

**As a** CTF player
**I want** historical cipher implementations
**So that** I can solve classical cryptography challenges

**Acceptance Criteria:**
- [ ] Enigma machine simulation
- [ ] Playfair cipher
- [ ] ADFGVX cipher
- [ ] Bifid cipher
- [ ] Four-square cipher

### US-2.1.3: Encoding Chain Detection

**As a** analyst
**I want** automatic detection of encoding chains
**So that** I can identify multi-layer obfuscation

**Acceptance Criteria:**
- [ ] Detect common encoding patterns
- [ ] Suggest decoding order
- [ ] Handle nested encodings
- [ ] Report confidence levels

## Tasks

### Analysis (Day 1-2)

| ID | Task | Estimate | Assignee |
|----|------|----------|----------|
| T-2.1.1 | Analyze cryptii source structure | 4h | - |
| T-2.1.2 | Identify portable algorithms | 2h | - |
| T-2.1.3 | Map to MCP tool structure | 2h | - |
| T-2.1.4 | Document dependencies | 2h | - |

### Implementation - Encodings (Day 3-6)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-2.1.5 | Port Morse code encoder/decoder | 4h | T-2.1.1 |
| T-2.1.6 | Port Braille translator | 3h | T-2.1.1 |
| T-2.1.7 | Port Polybius square | 3h | T-2.1.1 |
| T-2.1.8 | Port Baudot code | 3h | T-2.1.1 |
| T-2.1.9 | Port Unicode obfuscation detection | 4h | T-2.1.1 |

### Implementation - Ciphers (Day 7-8)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-2.1.10 | Port Enigma simulation | 8h | T-2.1.1 |
| T-2.1.11 | Port Playfair cipher | 4h | T-2.1.1 |
| T-2.1.12 | Port ADFGVX cipher | 4h | T-2.1.1 |

### Integration (Day 9-10)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-2.1.13 | Register tools with registry | 4h | T-2.1.5-12 |
| T-2.1.14 | Write unit tests | 6h | T-2.1.13 |
| T-2.1.15 | Integration testing | 4h | T-2.1.14 |
| T-2.1.16 | Documentation | 2h | All |

## Deliverables

### Files to Create

```
src/node/tools/
├── encoding/
│   ├── index.mjs           # Module exports
│   ├── morse.mjs           # Morse code
│   ├── braille.mjs         # Braille translation
│   ├── polybius.mjs        # Polybius square
│   ├── baudot.mjs          # Baudot/ITA2 code
│   ├── unicode-stealth.mjs # Unicode obfuscation
│   ├── enigma.mjs          # Enigma cipher
│   ├── playfair.mjs        # Playfair cipher
│   └── adfgvx.mjs          # ADFGVX cipher
└── encoding/register.mjs   # Tool registration
```

### Code Specifications

#### Morse Code (morse.mjs)

```javascript
import { BaseTool } from '../base-tool.mjs';

const MORSE_CODE = {
    'A': '.-',    'B': '-...',  'C': '-.-.',  'D': '-..',
    'E': '.',     'F': '..-.',  'G': '--.',   'H': '....',
    'I': '..',    'J': '.---',  'K': '-.-',   'L': '.-..',
    'M': '--',    'N': '-.',    'O': '---',   'P': '.--.',
    'Q': '--.-',  'R': '.-.',   'S': '...',   'T': '-',
    'U': '..-',   'V': '...-',  'W': '.--',   'X': '-..-',
    'Y': '-.--',  'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--',
    '4': '....-', '5': '.....', '6': '-....', '7': '--...',
    '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.',
    '-': '-....-', '(': '-.--.', ')': '-.--.-', ' ': '/'
};

const MORSE_REVERSE = Object.fromEntries(
    Object.entries(MORSE_CODE).map(([k, v]) => [v, k])
);

export class MorseEncoder extends BaseTool {
    constructor() {
        super({
            name: 'cyberchef_encoding_morse_encode',
            description: 'Encode text to Morse code',
            category: 'encoding',
            inputSchema: {
                type: 'object',
                properties: {
                    input: {
                        type: 'string',
                        description: 'Text to encode'
                    },
                    separator: {
                        type: 'string',
                        default: ' ',
                        description: 'Separator between characters'
                    },
                    wordSeparator: {
                        type: 'string',
                        default: ' / ',
                        description: 'Separator between words'
                    }
                },
                required: ['input']
            }
        });
    }

    async execute(args) {
        const { input, separator = ' ', wordSeparator = ' / ' } = args;
        const startTime = performance.now();

        try {
            const result = input
                .toUpperCase()
                .split(' ')
                .map(word =>
                    word.split('')
                        .map(char => MORSE_CODE[char] || char)
                        .join(separator)
                )
                .join(wordSeparator);

            return this.successResult(result, {
                executionTime: performance.now() - startTime,
                algorithm: 'morse_encode'
            });
        } catch (error) {
            return this.errorResult(error);
        }
    }
}

export class MorseDecoder extends BaseTool {
    constructor() {
        super({
            name: 'cyberchef_encoding_morse_decode',
            description: 'Decode Morse code to text',
            category: 'encoding',
            inputSchema: {
                type: 'object',
                properties: {
                    input: {
                        type: 'string',
                        description: 'Morse code to decode'
                    },
                    separator: {
                        type: 'string',
                        default: ' ',
                        description: 'Separator between characters'
                    },
                    wordSeparator: {
                        type: 'string',
                        default: '/',
                        description: 'Separator between words'
                    }
                },
                required: ['input']
            }
        });
    }

    async execute(args) {
        const { input, separator = ' ', wordSeparator = '/' } = args;
        const startTime = performance.now();

        try {
            const result = input
                .trim()
                .split(wordSeparator)
                .map(word =>
                    word.trim()
                        .split(separator)
                        .map(code => MORSE_REVERSE[code.trim()] || '?')
                        .join('')
                )
                .join(' ');

            return this.successResult(result, {
                executionTime: performance.now() - startTime,
                algorithm: 'morse_decode'
            });
        } catch (error) {
            return this.errorResult(error);
        }
    }
}
```

#### Enigma Cipher (enigma.mjs)

```javascript
import { BaseTool } from '../base-tool.mjs';

// Enigma M3 rotor wirings (historical)
const ROTORS = {
    I:   { wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', notch: 'Q' },
    II:  { wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', notch: 'E' },
    III: { wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', notch: 'V' },
    IV:  { wiring: 'ESOVPZJAYQUIRHXLNFTGKDCMWB', notch: 'J' },
    V:   { wiring: 'VZBRGITYUPSDNHLXAWMJQOFECK', notch: 'Z' }
};

const REFLECTORS = {
    B: 'YRUHQSLDPXNGOKMIEBFZCWVJAT',
    C: 'FVPJIAOYEDRZXWGCTKUQSBNMHL'
};

class Rotor {
    constructor(type, ringSetting = 0, position = 0) {
        this.wiring = ROTORS[type].wiring;
        this.notch = ROTORS[type].notch;
        this.ringSetting = ringSetting;
        this.position = position;
    }

    forward(char) {
        const index = (char.charCodeAt(0) - 65 + this.position - this.ringSetting + 26) % 26;
        const encoded = this.wiring.charCodeAt(index) - 65;
        return String.fromCharCode(((encoded - this.position + this.ringSetting + 26) % 26) + 65);
    }

    backward(char) {
        const index = (char.charCodeAt(0) - 65 + this.position - this.ringSetting + 26) % 26;
        const encoded = this.wiring.indexOf(String.fromCharCode(index + 65));
        return String.fromCharCode(((encoded - this.position + this.ringSetting + 26) % 26) + 65);
    }

    step() {
        this.position = (this.position + 1) % 26;
    }

    atNotch() {
        return String.fromCharCode(this.position + 65) === this.notch;
    }
}

export class EnigmaCipher extends BaseTool {
    constructor() {
        super({
            name: 'cyberchef_cipher_enigma',
            description: 'Enigma M3 machine simulation (encrypt/decrypt)',
            category: 'cipher',
            inputSchema: {
                type: 'object',
                properties: {
                    input: {
                        type: 'string',
                        description: 'Text to encrypt/decrypt'
                    },
                    rotors: {
                        type: 'array',
                        items: { type: 'string', enum: ['I', 'II', 'III', 'IV', 'V'] },
                        default: ['I', 'II', 'III'],
                        description: 'Rotor selection (left to right)'
                    },
                    positions: {
                        type: 'string',
                        default: 'AAA',
                        description: 'Initial rotor positions'
                    },
                    ringSettings: {
                        type: 'string',
                        default: 'AAA',
                        description: 'Ring settings'
                    },
                    reflector: {
                        type: 'string',
                        enum: ['B', 'C'],
                        default: 'B',
                        description: 'Reflector type'
                    },
                    plugboard: {
                        type: 'string',
                        default: '',
                        description: 'Plugboard pairs (e.g., "AB CD EF")'
                    }
                },
                required: ['input']
            }
        });
    }

    async execute(args) {
        const {
            input,
            rotors: rotorTypes = ['I', 'II', 'III'],
            positions = 'AAA',
            ringSettings = 'AAA',
            reflector = 'B',
            plugboard = ''
        } = args;

        const startTime = performance.now();

        try {
            // Parse plugboard
            const plugMap = this.parsePlugboard(plugboard);

            // Initialize rotors
            const rotorInstances = rotorTypes.map((type, i) =>
                new Rotor(
                    type,
                    ringSettings.charCodeAt(i) - 65,
                    positions.charCodeAt(i) - 65
                )
            );

            // Encrypt
            const result = input
                .toUpperCase()
                .replace(/[^A-Z]/g, '')
                .split('')
                .map(char => this.encryptChar(char, rotorInstances, reflector, plugMap))
                .join('');

            return this.successResult(result, {
                executionTime: performance.now() - startTime,
                algorithm: 'enigma_m3',
                settings: { rotors: rotorTypes, positions, ringSettings, reflector }
            });
        } catch (error) {
            return this.errorResult(error);
        }
    }

    parsePlugboard(plugboard) {
        const map = {};
        const pairs = plugboard.toUpperCase().split(/\s+/).filter(p => p.length === 2);

        for (const pair of pairs) {
            map[pair[0]] = pair[1];
            map[pair[1]] = pair[0];
        }

        return map;
    }

    encryptChar(char, rotors, reflector, plugMap) {
        // Step rotors
        if (rotors[1].atNotch()) {
            rotors[0].step();
            rotors[1].step();
        } else if (rotors[2].atNotch()) {
            rotors[1].step();
        }
        rotors[2].step();

        // Plugboard input
        let c = plugMap[char] || char;

        // Forward through rotors
        for (let i = rotors.length - 1; i >= 0; i--) {
            c = rotors[i].forward(c);
        }

        // Reflector
        c = REFLECTORS[reflector][c.charCodeAt(0) - 65];

        // Backward through rotors
        for (let i = 0; i < rotors.length; i++) {
            c = rotors[i].backward(c);
        }

        // Plugboard output
        return plugMap[c] || c;
    }
}
```

### MCP Tools Registered

| Tool Name | Description |
|-----------|-------------|
| `cyberchef_encoding_morse_encode` | Encode text to Morse code |
| `cyberchef_encoding_morse_decode` | Decode Morse code to text |
| `cyberchef_encoding_braille_encode` | Encode text to Braille Unicode |
| `cyberchef_encoding_braille_decode` | Decode Braille Unicode to text |
| `cyberchef_encoding_polybius` | Polybius square encode/decode |
| `cyberchef_encoding_baudot` | Baudot/ITA2 code handling |
| `cyberchef_encoding_unicode_stealth` | Detect/decode Unicode obfuscation |
| `cyberchef_cipher_enigma` | Enigma M3 simulation |
| `cyberchef_cipher_playfair` | Playfair cipher |
| `cyberchef_cipher_adfgvx` | ADFGVX cipher |

## Definition of Done

- [ ] All specified tools implemented
- [ ] Unit tests with > 85% coverage
- [ ] Integration tests passing
- [ ] Reference validation against cryptii
- [ ] Documentation complete
- [ ] Performance benchmarks recorded

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| cryptii architecture complexity | Medium | Medium | Focus on algorithmic core only |
| Enigma edge cases | Medium | Low | Extensive test vectors |
| Unicode handling | Low | Medium | Use standard TextEncoder/Decoder |

## Dependencies

### External

- None (pure JavaScript implementation)

### Internal

- Sprint 1.1 (ToolRegistry)
- Sprint 1.2 (Testing Framework)

## Notes

- Enigma implementation is educational/CTF-focused, not production crypto
- Unicode obfuscation detection is useful for malware analysis
- Some encodings have CyberChef equivalents; these add options/configurations

---

**Sprint Version:** 1.0.0
**Created:** 2025-12-17
