# cryptii Integration Plan

## Overview

| Attribute | Value |
|-----------|-------|
| Source Project | cryptii |
| Repository | https://github.com/cryptii/cryptii |
| License | MIT |
| Language | JavaScript (ES6 Modules) |
| Integration Phase | Phase 2 (JavaScript Native) |
| Priority | High |
| Complexity | Low (native JavaScript) |

## Integration Summary

cryptii provides modular encoding and encryption operations with a brick-based architecture. Since it is native JavaScript (ES6), integration is straightforward - we can directly port or adapt the encoder implementations. The primary value comes from operations unique to cryptii that CyberChef lacks.

## Operations to Integrate

### High Priority (Unique to cryptii)

| Operation | Source File | Description | MCP Tool Name |
|-----------|-------------|-------------|---------------|
| Tap Code | `TapCode.js` | Polybius-based prison cipher | `cyberchef_tap_code` |
| ADFGX Cipher | `ADFGXCipher.js` | WWI German cipher | `cyberchef_adfgx_cipher` |
| Spelling Alphabet | `SpellingAlphabet.js` | NATO phonetic conversion | `cyberchef_spelling_alphabet` |
| Baudot Code | `BaudotCode.js` | 5-bit teleprinter code | `cyberchef_baudot_code` |
| Numeral System | `NumeralSystem.js` | Roman numeral conversion | `cyberchef_numeral_system` |

### Medium Priority (Enhanced Implementations)

| Operation | Source File | Enhancement Over CyberChef |
|-----------|-------------|---------------------------|
| Enigma | `Enigma.js` | 13 machine models |
| Polybius Square | `PolybiusSquare.js` | Configurable grid |
| Bifid/Trifid | `BifidCipher.js`, `TrifidCipher.js` | Full configuration |

## Architecture

### Source Code Analysis

cryptii uses a clean class hierarchy:

```
Brick (abstract base)
├── Encoder (processing operations)
│   ├── CharacterBlockEncoder (block-based processing)
│   │   ├── A1Z26Encoder
│   │   └── TapCodeEncoder
│   ├── CaesarCipherEncoder
│   ├── EnigmaEncoder
│   └── ...
└── Viewer (display operations)
    ├── TextViewer
    └── BytesViewer
```

### Key Patterns to Extract

#### 1. Chain Data Container

cryptii's Chain class handles automatic text/binary conversion:

```javascript
// Simplified from cryptii/src/Chain.js
export class Chain {
    constructor(content, encoding = 'utf8') {
        if (typeof content === 'string') {
            this._text = content;
            this._bytes = null;
        } else if (content instanceof Uint8Array) {
            this._bytes = content;
            this._text = null;
        }
        this._encoding = encoding;
    }

    getText() {
        if (this._text === null && this._bytes !== null) {
            this._text = new TextDecoder(this._encoding).decode(this._bytes);
        }
        return this._text;
    }

    getBytes() {
        if (this._bytes === null && this._text !== null) {
            this._bytes = new TextEncoder().encode(this._text);
        }
        return this._bytes;
    }

    getCodePoints() {
        return [...this.getText()].map(char => char.codePointAt(0));
    }
}
```

#### 2. Encoder Interface

```javascript
// src/node/tools/cryptii/base-encoder.mjs
export class CryptiiEncoder {
    constructor(config = {}) {
        this.settings = { ...this.defaultSettings(), ...config };
    }

    defaultSettings() {
        return {};
    }

    encode(input) {
        throw new Error('encode() must be implemented');
    }

    decode(input) {
        throw new Error('decode() must be implemented');
    }

    validateSettings() {
        return true;
    }
}
```

## Implementation Details

### Tap Code Encoder

```javascript
// src/node/tools/cryptii/tap-code.mjs
import { CryptiiEncoder } from './base-encoder.mjs';

/**
 * Tap Code - Polybius square-based prison communication cipher
 * Uses 5x5 grid (combining I/J or C/K)
 */
export class TapCodeEncoder extends CryptiiEncoder {
    defaultSettings() {
        return {
            alphabet: 'abcdefghiklmnopqrstuvwxyz', // 25 letters (no J)
            tapMark: '.',           // Mark for each tap
            groupMark: ' ',         // Separator between row/column
            letterMark: '  ',       // Separator between letters
            includeK: false         // Use K instead of C
        };
    }

    /**
     * Build position map for alphabet
     */
    buildPositionMap() {
        const map = new Map();
        const alphabet = this.settings.alphabet.toLowerCase();

        for (let i = 0; i < alphabet.length; i++) {
            const row = Math.floor(i / 5) + 1;
            const col = (i % 5) + 1;
            map.set(alphabet[i], { row, col });
        }

        // Handle J -> I mapping
        if (!this.settings.includeK) {
            map.set('j', map.get('i'));
        } else {
            map.set('c', map.get('k'));
        }

        return map;
    }

    /**
     * Build reverse map for decoding
     */
    buildReverseMap() {
        const map = new Map();
        const alphabet = this.settings.alphabet.toLowerCase();

        for (let i = 0; i < alphabet.length; i++) {
            const row = Math.floor(i / 5) + 1;
            const col = (i % 5) + 1;
            map.set(`${row},${col}`, alphabet[i]);
        }

        return map;
    }

    encode(input) {
        const posMap = this.buildPositionMap();
        const { tapMark, groupMark, letterMark } = this.settings;
        const result = [];

        for (const char of input.toLowerCase()) {
            const pos = posMap.get(char);
            if (pos) {
                const rowTaps = tapMark.repeat(pos.row);
                const colTaps = tapMark.repeat(pos.col);
                result.push(`${rowTaps}${groupMark}${colTaps}`);
            } else if (char === ' ') {
                result.push('/');
            }
            // Non-alphabet characters are skipped
        }

        return result.join(letterMark);
    }

    decode(input) {
        const reverseMap = this.buildReverseMap();
        const { tapMark, groupMark, letterMark } = this.settings;

        // Split by letter separator
        const letters = input.split(letterMark);
        let result = '';

        for (const letter of letters) {
            if (letter === '/' || letter.trim() === '') {
                result += ' ';
                continue;
            }

            // Split row and column
            const parts = letter.split(groupMark);
            if (parts.length === 2) {
                const row = parts[0].split(tapMark).length - 1;
                const col = parts[1].split(tapMark).length - 1;
                const char = reverseMap.get(`${row},${col}`);
                if (char) {
                    result += char;
                }
            }
        }

        return result;
    }
}

/**
 * MCP Tool Definition
 */
export const tapCodeTool = {
    name: 'cyberchef_tap_code',
    description: 'Encode/decode using Tap Code (prison cipher based on Polybius square)',
    category: 'cipher',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'Text to encode or tap code to decode'
            },
            operation: {
                type: 'string',
                enum: ['encode', 'decode'],
                default: 'encode',
                description: 'Operation to perform'
            },
            tapMark: {
                type: 'string',
                default: '.',
                description: 'Character representing each tap'
            },
            groupMark: {
                type: 'string',
                default: ' ',
                description: 'Separator between row and column taps'
            },
            letterMark: {
                type: 'string',
                default: '  ',
                description: 'Separator between letters'
            }
        },
        required: ['input']
    },

    async execute(args) {
        const encoder = new TapCodeEncoder({
            tapMark: args.tapMark || '.',
            groupMark: args.groupMark || ' ',
            letterMark: args.letterMark || '  '
        });

        const operation = args.operation || 'encode';
        const output = operation === 'encode'
            ? encoder.encode(args.input)
            : encoder.decode(args.input);

        return {
            success: true,
            output,
            metadata: {
                operation,
                inputLength: args.input.length,
                outputLength: output.length
            }
        };
    }
};
```

### ADFGX Cipher Encoder

```javascript
// src/node/tools/cryptii/adfgx-cipher.mjs
import { CryptiiEncoder } from './base-encoder.mjs';

/**
 * ADFGX Cipher - WWI German fractionating transposition cipher
 * Combines Polybius square substitution with columnar transposition
 */
export class ADFGXCipherEncoder extends CryptiiEncoder {
    defaultSettings() {
        return {
            alphabet: 'abcdefghiklmnopqrstuvwxyz', // 25 letters (5x5)
            keyword: 'SECRET',
            letters: 'ADFGX'  // Substitution letters (chosen for Morse distinction)
        };
    }

    /**
     * Build substitution table
     */
    buildSubstitutionTable() {
        const table = new Map();
        const alphabet = this.settings.alphabet.toLowerCase();
        const letters = this.settings.letters;

        for (let i = 0; i < alphabet.length; i++) {
            const row = Math.floor(i / 5);
            const col = i % 5;
            table.set(alphabet[i], letters[row] + letters[col]);
        }

        // Handle J -> I mapping
        table.set('j', table.get('i'));

        return table;
    }

    /**
     * Build reverse substitution table
     */
    buildReverseTable() {
        const table = new Map();
        const alphabet = this.settings.alphabet.toLowerCase();
        const letters = this.settings.letters;

        for (let i = 0; i < alphabet.length; i++) {
            const row = Math.floor(i / 5);
            const col = i % 5;
            table.set(letters[row] + letters[col], alphabet[i]);
        }

        return table;
    }

    /**
     * Generate column order from keyword
     */
    getColumnOrder(keyword) {
        const chars = [...keyword.toUpperCase()];
        const sorted = [...chars].sort();
        const order = chars.map(c => sorted.indexOf(c));

        // Handle duplicate letters in keyword
        const used = new Set();
        return chars.map(c => {
            let idx = sorted.indexOf(c);
            while (used.has(idx)) {
                idx = sorted.indexOf(c, idx + 1);
            }
            used.add(idx);
            return idx;
        });
    }

    encode(input) {
        const subTable = this.buildSubstitutionTable();
        const keyword = this.settings.keyword;

        // Step 1: Polybius substitution
        let substituted = '';
        for (const char of input.toLowerCase()) {
            if (subTable.has(char)) {
                substituted += subTable.get(char);
            }
        }

        // Step 2: Columnar transposition
        const numCols = keyword.length;
        const numRows = Math.ceil(substituted.length / numCols);

        // Pad with X if needed
        while (substituted.length < numRows * numCols) {
            substituted += this.settings.letters[0];
        }

        // Fill grid row by row
        const grid = [];
        for (let i = 0; i < numRows; i++) {
            grid.push(substituted.slice(i * numCols, (i + 1) * numCols));
        }

        // Read columns in keyword order
        const columnOrder = this.getColumnOrder(keyword);
        let result = '';

        for (let i = 0; i < numCols; i++) {
            const colIdx = columnOrder.indexOf(i);
            for (let row = 0; row < numRows; row++) {
                result += grid[row][colIdx];
            }
        }

        return result;
    }

    decode(input) {
        const reverseTable = this.buildReverseTable();
        const keyword = this.settings.keyword;
        const numCols = keyword.length;
        const numRows = Math.ceil(input.length / numCols);

        // Step 1: Reverse columnar transposition
        const columnOrder = this.getColumnOrder(keyword);
        const colLengths = new Array(numCols).fill(numRows);

        // Distribute characters to columns
        const columns = [];
        let pos = 0;
        for (let i = 0; i < numCols; i++) {
            const colIdx = columnOrder.indexOf(i);
            columns[colIdx] = input.slice(pos, pos + colLengths[i]);
            pos += colLengths[i];
        }

        // Read row by row
        let substituted = '';
        for (let row = 0; row < numRows; row++) {
            for (let col = 0; col < numCols; col++) {
                if (columns[col][row]) {
                    substituted += columns[col][row];
                }
            }
        }

        // Step 2: Reverse Polybius substitution
        let result = '';
        for (let i = 0; i < substituted.length; i += 2) {
            const pair = substituted.slice(i, i + 2);
            if (reverseTable.has(pair)) {
                result += reverseTable.get(pair);
            }
        }

        return result;
    }
}

/**
 * MCP Tool Definition
 */
export const adfgxCipherTool = {
    name: 'cyberchef_adfgx_cipher',
    description: 'Encode/decode using ADFGX cipher (WWI German fractionating cipher)',
    category: 'cipher',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'Text to encode or ciphertext to decode'
            },
            operation: {
                type: 'string',
                enum: ['encode', 'decode'],
                default: 'encode'
            },
            keyword: {
                type: 'string',
                default: 'SECRET',
                description: 'Transposition keyword'
            },
            alphabet: {
                type: 'string',
                default: 'abcdefghiklmnopqrstuvwxyz',
                description: 'Polybius square alphabet (25 letters)'
            }
        },
        required: ['input']
    },

    async execute(args) {
        const encoder = new ADFGXCipherEncoder({
            keyword: args.keyword || 'SECRET',
            alphabet: args.alphabet || 'abcdefghiklmnopqrstuvwxyz'
        });

        const operation = args.operation || 'encode';
        const output = operation === 'encode'
            ? encoder.encode(args.input)
            : encoder.decode(args.input);

        return {
            success: true,
            output,
            metadata: {
                operation,
                keyword: args.keyword || 'SECRET'
            }
        };
    }
};
```

### Spelling Alphabet Encoder

```javascript
// src/node/tools/cryptii/spelling-alphabet.mjs
import { CryptiiEncoder } from './base-encoder.mjs';

/**
 * NATO and other spelling alphabets
 */
const ALPHABETS = {
    nato: {
        name: 'NATO Phonetic Alphabet',
        letters: {
            'a': 'Alfa', 'b': 'Bravo', 'c': 'Charlie', 'd': 'Delta',
            'e': 'Echo', 'f': 'Foxtrot', 'g': 'Golf', 'h': 'Hotel',
            'i': 'India', 'j': 'Juliet', 'k': 'Kilo', 'l': 'Lima',
            'm': 'Mike', 'n': 'November', 'o': 'Oscar', 'p': 'Papa',
            'q': 'Quebec', 'r': 'Romeo', 's': 'Sierra', 't': 'Tango',
            'u': 'Uniform', 'v': 'Victor', 'w': 'Whiskey', 'x': 'X-ray',
            'y': 'Yankee', 'z': 'Zulu',
            '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three',
            '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven',
            '8': 'Eight', '9': 'Niner'
        }
    },
    german: {
        name: 'German DIN 5009',
        letters: {
            'a': 'Anton', 'b': 'Berta', 'c': 'Cäsar', 'd': 'Dora',
            'e': 'Emil', 'f': 'Friedrich', 'g': 'Gustav', 'h': 'Heinrich',
            'i': 'Ida', 'j': 'Julius', 'k': 'Kaufmann', 'l': 'Ludwig',
            'm': 'Martha', 'n': 'Nordpol', 'o': 'Otto', 'p': 'Paula',
            'q': 'Quelle', 'r': 'Richard', 's': 'Samuel', 't': 'Theodor',
            'u': 'Ulrich', 'v': 'Viktor', 'w': 'Wilhelm', 'x': 'Xanthippe',
            'y': 'Ypsilon', 'z': 'Zacharias'
        }
    },
    lapd: {
        name: 'LAPD Radio Alphabet',
        letters: {
            'a': 'Adam', 'b': 'Boy', 'c': 'Charles', 'd': 'David',
            'e': 'Edward', 'f': 'Frank', 'g': 'George', 'h': 'Henry',
            'i': 'Ida', 'j': 'John', 'k': 'King', 'l': 'Lincoln',
            'm': 'Mary', 'n': 'Nora', 'o': 'Ocean', 'p': 'Paul',
            'q': 'Queen', 'r': 'Robert', 's': 'Sam', 't': 'Tom',
            'u': 'Union', 'v': 'Victor', 'w': 'William', 'x': 'X-ray',
            'y': 'Young', 'z': 'Zebra'
        }
    }
};

export class SpellingAlphabetEncoder extends CryptiiEncoder {
    defaultSettings() {
        return {
            alphabet: 'nato',
            separator: ' ',
            wordSeparator: ' / '
        };
    }

    encode(input) {
        const alphabetDef = ALPHABETS[this.settings.alphabet] || ALPHABETS.nato;
        const letters = alphabetDef.letters;
        const { separator, wordSeparator } = this.settings;

        const words = input.toLowerCase().split(/\s+/);
        const encodedWords = words.map(word => {
            const encodedLetters = [];
            for (const char of word) {
                if (letters[char]) {
                    encodedLetters.push(letters[char]);
                } else {
                    encodedLetters.push(char); // Keep unknown characters
                }
            }
            return encodedLetters.join(separator);
        });

        return encodedWords.join(wordSeparator);
    }

    decode(input) {
        const alphabetDef = ALPHABETS[this.settings.alphabet] || ALPHABETS.nato;
        const reverseMap = new Map();

        for (const [char, word] of Object.entries(alphabetDef.letters)) {
            reverseMap.set(word.toLowerCase(), char);
        }

        const { separator, wordSeparator } = this.settings;
        const words = input.split(wordSeparator);

        const decodedWords = words.map(word => {
            const phonetics = word.split(separator);
            return phonetics.map(p => reverseMap.get(p.toLowerCase()) || p).join('');
        });

        return decodedWords.join(' ');
    }
}

/**
 * MCP Tool Definition
 */
export const spellingAlphabetTool = {
    name: 'cyberchef_spelling_alphabet',
    description: 'Convert text to/from phonetic spelling alphabets (NATO, German, LAPD)',
    category: 'encoding',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'Text or phonetic words'
            },
            operation: {
                type: 'string',
                enum: ['encode', 'decode'],
                default: 'encode'
            },
            alphabet: {
                type: 'string',
                enum: ['nato', 'german', 'lapd'],
                default: 'nato',
                description: 'Spelling alphabet variant'
            },
            separator: {
                type: 'string',
                default: ' ',
                description: 'Separator between phonetic words'
            }
        },
        required: ['input']
    },

    async execute(args) {
        const encoder = new SpellingAlphabetEncoder({
            alphabet: args.alphabet || 'nato',
            separator: args.separator || ' '
        });

        const operation = args.operation || 'encode';
        const output = operation === 'encode'
            ? encoder.encode(args.input)
            : encoder.decode(args.input);

        return {
            success: true,
            output,
            metadata: {
                operation,
                alphabet: args.alphabet || 'nato'
            }
        };
    }
};
```

### Baudot Code Encoder

```javascript
// src/node/tools/cryptii/baudot-code.mjs
import { CryptiiEncoder } from './base-encoder.mjs';

/**
 * Baudot Code / ITA2 - 5-bit teleprinter code
 */
const ITA2_LETTERS = {
    0b00000: null,   // NULL
    0b00100: ' ',    // SPACE
    0b00001: 'E',
    0b10011: 'A',
    0b11001: 'S',
    0b01010: 'I',
    0b10100: 'U',
    0b00011: 'D',
    0b01101: 'R',
    0b10010: 'J',
    0b01011: 'N',
    0b01100: 'F',
    0b01110: 'C',
    0b10110: 'K',
    0b10001: 'T',
    0b11100: 'Z',
    0b10101: 'L',
    0b11010: 'W',
    0b01001: 'H',
    0b10000: 'Y',
    0b00101: 'P',
    0b00110: 'Q',
    0b11000: 'O',
    0b11110: 'B',
    0b01111: 'G',
    0b11101: 'M',
    0b00010: 'X',
    0b11011: 'V',
    0b11111: null,   // LTRS shift
    0b00111: null    // FIGS shift
};

const ITA2_FIGURES = {
    0b00000: null,
    0b00100: ' ',
    0b00001: '3',
    0b10011: '-',
    0b11001: "'",
    0b01010: '8',
    0b10100: '7',
    0b00011: '?',
    0b01101: '4',
    0b10010: '🔔',   // BELL
    0b01011: ',',
    0b01100: '!',
    0b01110: ':',
    0b10110: '(',
    0b10001: '5',
    0b11100: '+',
    0b10101: ')',
    0b11010: '2',
    0b01001: '£',
    0b10000: '6',
    0b00101: '0',
    0b00110: '1',
    0b11000: '9',
    0b11110: '?',
    0b01111: '&',
    0b11101: '.',
    0b00010: '/',
    0b11011: ';'
};

export class BaudotCodeEncoder extends CryptiiEncoder {
    defaultSettings() {
        return {
            variant: 'ita2',       // ita1, ita2, mtk2
            format: 'binary',     // binary, decimal, tape
            bitOrder: 'lsb'       // lsb or msb
        };
    }

    /**
     * Build encoding maps
     */
    buildMaps() {
        const charToCode = new Map();
        const codeToChar = { letters: new Map(), figures: new Map() };

        for (const [code, char] of Object.entries(ITA2_LETTERS)) {
            if (char) {
                charToCode.set(char.toLowerCase(), { code: parseInt(code), shift: 'letters' });
                codeToChar.letters.set(parseInt(code), char);
            }
        }

        for (const [code, char] of Object.entries(ITA2_FIGURES)) {
            if (char && !charToCode.has(char)) {
                charToCode.set(char, { code: parseInt(code), shift: 'figures' });
            }
            codeToChar.figures.set(parseInt(code), char);
        }

        return { charToCode, codeToChar };
    }

    encode(input) {
        const { charToCode } = this.buildMaps();
        const LTRS = 0b11111;
        const FIGS = 0b00111;

        const codes = [];
        let currentShift = 'letters';

        for (const char of input.toLowerCase()) {
            const mapping = charToCode.get(char);
            if (mapping) {
                // Insert shift if needed
                if (mapping.shift !== currentShift) {
                    codes.push(mapping.shift === 'letters' ? LTRS : FIGS);
                    currentShift = mapping.shift;
                }
                codes.push(mapping.code);
            }
        }

        // Format output
        if (this.settings.format === 'binary') {
            return codes.map(c => c.toString(2).padStart(5, '0')).join(' ');
        } else if (this.settings.format === 'decimal') {
            return codes.join(' ');
        } else {
            // Tape format (visual representation)
            return codes.map(c => {
                const bits = c.toString(2).padStart(5, '0');
                return bits.split('').map(b => b === '1' ? 'o' : '.').join('');
            }).join('\n');
        }
    }

    decode(input) {
        const { codeToChar } = this.buildMaps();
        const LTRS = 0b11111;
        const FIGS = 0b00111;

        let codes;
        if (this.settings.format === 'binary') {
            codes = input.split(/\s+/).map(b => parseInt(b, 2));
        } else if (this.settings.format === 'decimal') {
            codes = input.split(/\s+/).map(d => parseInt(d, 10));
        } else {
            // Tape format
            codes = input.split('\n').map(line => {
                const bits = line.split('').map(c => c === 'o' ? '1' : '0').join('');
                return parseInt(bits, 2);
            });
        }

        let result = '';
        let currentShift = 'letters';

        for (const code of codes) {
            if (code === LTRS) {
                currentShift = 'letters';
            } else if (code === FIGS) {
                currentShift = 'figures';
            } else {
                const charMap = currentShift === 'letters'
                    ? codeToChar.letters
                    : codeToChar.figures;
                const char = charMap.get(code);
                if (char) {
                    result += char;
                }
            }
        }

        return result;
    }
}

/**
 * MCP Tool Definition
 */
export const baudotCodeTool = {
    name: 'cyberchef_baudot_code',
    description: 'Encode/decode Baudot code (ITA2 teleprinter code)',
    category: 'encoding',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'Text or Baudot codes'
            },
            operation: {
                type: 'string',
                enum: ['encode', 'decode'],
                default: 'encode'
            },
            format: {
                type: 'string',
                enum: ['binary', 'decimal', 'tape'],
                default: 'binary',
                description: 'Output format'
            }
        },
        required: ['input']
    },

    async execute(args) {
        const encoder = new BaudotCodeEncoder({
            format: args.format || 'binary'
        });

        const operation = args.operation || 'encode';
        const output = operation === 'encode'
            ? encoder.encode(args.input)
            : encoder.decode(args.input);

        return {
            success: true,
            output,
            metadata: {
                operation,
                format: args.format || 'binary'
            }
        };
    }
};
```

## Testing Strategy

### Unit Tests

```javascript
// tests/tools/cryptii/tap-code.test.mjs
import { describe, it, expect } from 'vitest';
import { TapCodeEncoder } from '../../../src/node/tools/cryptii/tap-code.mjs';

describe('TapCodeEncoder', () => {
    describe('encode', () => {
        it('should encode simple text', () => {
            const encoder = new TapCodeEncoder();
            const result = encoder.encode('hello');
            expect(result).toContain('.');
        });

        it('should handle J as I', () => {
            const encoder = new TapCodeEncoder();
            const resultJ = encoder.encode('j');
            const resultI = encoder.encode('i');
            expect(resultJ).toBe(resultI);
        });
    });

    describe('decode', () => {
        it('should decode tap code', () => {
            const encoder = new TapCodeEncoder();
            const encoded = encoder.encode('test');
            const decoded = encoder.decode(encoded);
            expect(decoded).toBe('test');
        });
    });

    describe('roundtrip', () => {
        it('should roundtrip correctly', () => {
            const encoder = new TapCodeEncoder();
            const original = 'the quick brown fox';
            const encoded = encoder.encode(original);
            const decoded = encoder.decode(encoded);
            expect(decoded.replace('j', 'i')).toBe(original);
        });
    });
});
```

### Integration Tests

```javascript
// tests/tools/cryptii/integration.test.mjs
import { describe, it, expect } from 'vitest';
import { tapCodeTool } from '../../../src/node/tools/cryptii/tap-code.mjs';
import { adfgxCipherTool } from '../../../src/node/tools/cryptii/adfgx-cipher.mjs';

describe('cryptii MCP Tools', () => {
    describe('cyberchef_tap_code', () => {
        it('should execute encode operation', async () => {
            const result = await tapCodeTool.execute({
                input: 'sos',
                operation: 'encode'
            });
            expect(result.success).toBe(true);
            expect(result.output).toBeTruthy();
        });

        it('should execute decode operation', async () => {
            const encoded = '.... ...  ... ....  .... ...'; // SOS
            const result = await tapCodeTool.execute({
                input: encoded,
                operation: 'decode',
                tapMark: '.',
                groupMark: ' ',
                letterMark: '  '
            });
            expect(result.success).toBe(true);
        });
    });

    describe('cyberchef_adfgx_cipher', () => {
        it('should encode with keyword', async () => {
            const result = await adfgxCipherTool.execute({
                input: 'attack',
                operation: 'encode',
                keyword: 'CARGO'
            });
            expect(result.success).toBe(true);
            expect(result.output).toMatch(/^[ADFGX]+$/);
        });

        it('should roundtrip', async () => {
            const encoded = await adfgxCipherTool.execute({
                input: 'secret message',
                operation: 'encode',
                keyword: 'KEY'
            });

            const decoded = await adfgxCipherTool.execute({
                input: encoded.output,
                operation: 'decode',
                keyword: 'KEY'
            });

            expect(decoded.output.replace(/x+$/, '')).toContain('secretmessage');
        });
    });
});
```

## File Structure

```
src/node/tools/cryptii/
├── index.mjs              # Module exports
├── base-encoder.mjs       # Base encoder class
├── tap-code.mjs           # Tap code implementation
├── adfgx-cipher.mjs       # ADFGX cipher implementation
├── spelling-alphabet.mjs  # NATO/German phonetic alphabets
├── baudot-code.mjs        # Baudot/ITA2 teleprinter code
└── numeral-system.mjs     # Roman numerals and other systems

tests/tools/cryptii/
├── tap-code.test.mjs
├── adfgx-cipher.test.mjs
├── spelling-alphabet.test.mjs
├── baudot-code.test.mjs
└── integration.test.mjs
```

## MCP Tools Summary

| Tool Name | Category | Description |
|-----------|----------|-------------|
| `cyberchef_tap_code` | cipher | Prison communication cipher |
| `cyberchef_adfgx_cipher` | cipher | WWI German fractionating cipher |
| `cyberchef_spelling_alphabet` | encoding | NATO phonetic alphabet |
| `cyberchef_baudot_code` | encoding | Teleprinter code |
| `cyberchef_numeral_system` | transform | Roman numerals |

## Dependencies

No additional npm packages required - pure JavaScript implementation.

## Timeline

| Task | Estimated Time |
|------|----------------|
| Base encoder class | 0.5 days |
| Tap code implementation | 0.5 days |
| ADFGX cipher implementation | 1 day |
| Spelling alphabet | 0.5 days |
| Baudot code | 0.5 days |
| Testing and validation | 1 day |
| **Total** | **4 days** |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Edge cases in cipher algorithms | Medium | Low | Comprehensive test coverage |
| Unicode handling | Low | Medium | Use TextEncoder/TextDecoder |
| Compatibility with CyberChef patterns | Low | Low | Follow existing tool patterns |

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Related Phases:** Phase 2 (JavaScript Native)
