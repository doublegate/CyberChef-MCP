# pwntools Integration Plan

## Overview

| Attribute | Value |
|-----------|-------|
| Project | pwntools |
| Phase | Phase 2 (JavaScript Native) |
| Priority | High |
| Complexity | Medium |
| Estimated Effort | 4 days |
| Dependencies | None (pure JavaScript implementation) |

## Integration Scope

pwntools provides comprehensive binary manipulation utilities. This integration focuses on data transformation operations that complement CyberChef's existing capabilities - NOT exploit development primitives like ROP chains or shellcraft.

### In Scope

1. **Data Packing/Unpacking** - Integer to bytes conversion (p32, p64, u32, u64)
2. **Cyclic Patterns** - De Bruijn sequence generation for offset discovery
3. **XOR Operations** - Enhanced XOR with repeating keys
4. **Hexdump Formatting** - Pretty hexdump with highlighting
5. **Bit Operations** - bits/unbits conversions
6. **Entropy Calculation** - Data entropy analysis

### Out of Scope

- Exploit development (ROP, shellcraft, format strings)
- Process interaction (tubes abstraction)
- ELF binary parsing (better suited for specialized tools)
- Network operations (remote, ssh)
- Debugger integration (GDB)

## MCP Tools

### Tool 1: cyberchef_binary_pack

**Purpose**: Pack integers into binary representations

```javascript
{
    name: 'cyberchef_binary_pack',
    description: 'Pack integers into binary representation (p8, p16, p32, p64)',
    inputSchema: {
        type: 'object',
        properties: {
            value: {
                oneOf: [
                    { type: 'integer' },
                    { type: 'string', description: 'Integer as string for large values' }
                ],
                description: 'Integer value to pack'
            },
            size: {
                type: 'integer',
                enum: [8, 16, 32, 64],
                default: 32,
                description: 'Bit width (8, 16, 32, or 64)'
            },
            endian: {
                type: 'string',
                enum: ['little', 'big'],
                default: 'little',
                description: 'Byte order'
            },
            signed: {
                type: 'boolean',
                default: false,
                description: 'Treat value as signed integer'
            },
            output_format: {
                type: 'string',
                enum: ['hex', 'bytes', 'array'],
                default: 'hex',
                description: 'Output format'
            }
        },
        required: ['value']
    }
}
```

**Implementation**:

```javascript
// src/node/tools/pwntools/pack.mjs
export class BinaryPacker {
    /**
     * Pack integer to binary representation
     * @param {number|bigint} value - Integer to pack
     * @param {number} bits - Bit width (8, 16, 32, 64)
     * @param {string} endian - 'little' or 'big'
     * @param {boolean} signed - Treat as signed
     * @returns {Uint8Array}
     */
    static pack(value, bits = 32, endian = 'little', signed = false) {
        const byteLength = bits / 8;
        const buffer = new ArrayBuffer(byteLength);
        const view = new DataView(buffer);

        // Handle BigInt for 64-bit
        if (bits === 64) {
            const bigValue = BigInt(value);
            if (endian === 'little') {
                view.setBigUint64(0, bigValue, true);
            } else {
                view.setBigUint64(0, bigValue, false);
            }
        } else {
            const intValue = Number(value);
            const littleEndian = endian === 'little';

            switch (bits) {
                case 8:
                    if (signed) {
                        view.setInt8(0, intValue);
                    } else {
                        view.setUint8(0, intValue);
                    }
                    break;
                case 16:
                    if (signed) {
                        view.setInt16(0, intValue, littleEndian);
                    } else {
                        view.setUint16(0, intValue, littleEndian);
                    }
                    break;
                case 32:
                    if (signed) {
                        view.setInt32(0, intValue, littleEndian);
                    } else {
                        view.setUint32(0, intValue, littleEndian);
                    }
                    break;
            }
        }

        return new Uint8Array(buffer);
    }

    /**
     * Convenience methods matching pwntools API
     */
    static p8(value) {
        return this.pack(value, 8, 'little', false);
    }

    static p16(value, endian = 'little') {
        return this.pack(value, 16, endian, false);
    }

    static p32(value, endian = 'little') {
        return this.pack(value, 32, endian, false);
    }

    static p64(value, endian = 'little') {
        return this.pack(value, 64, endian, false);
    }
}
```

### Tool 2: cyberchef_binary_unpack

**Purpose**: Unpack binary data to integers

```javascript
{
    name: 'cyberchef_binary_unpack',
    description: 'Unpack binary data to integer (u8, u16, u32, u64)',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'Binary data as hex string'
            },
            size: {
                type: 'integer',
                enum: [8, 16, 32, 64],
                default: 32,
                description: 'Bit width to unpack'
            },
            endian: {
                type: 'string',
                enum: ['little', 'big'],
                default: 'little',
                description: 'Byte order'
            },
            signed: {
                type: 'boolean',
                default: false,
                description: 'Interpret as signed integer'
            },
            output_format: {
                type: 'string',
                enum: ['decimal', 'hex', 'binary'],
                default: 'decimal',
                description: 'Output format'
            }
        },
        required: ['input']
    }
}
```

**Implementation**:

```javascript
// src/node/tools/pwntools/unpack.mjs
export class BinaryUnpacker {
    /**
     * Unpack binary to integer
     * @param {Uint8Array} data - Binary data
     * @param {number} bits - Bit width
     * @param {string} endian - Byte order
     * @param {boolean} signed - Signed interpretation
     * @returns {number|bigint}
     */
    static unpack(data, bits = 32, endian = 'little', signed = false) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const littleEndian = endian === 'little';

        switch (bits) {
            case 8:
                return signed ? view.getInt8(0) : view.getUint8(0);
            case 16:
                return signed ? view.getInt16(0, littleEndian) : view.getUint16(0, littleEndian);
            case 32:
                return signed ? view.getInt32(0, littleEndian) : view.getUint32(0, littleEndian);
            case 64:
                return signed ? view.getBigInt64(0, littleEndian) : view.getBigUint64(0, littleEndian);
            default:
                throw new Error(`Unsupported bit width: ${bits}`);
        }
    }

    /**
     * Convenience methods
     */
    static u8(data) {
        return this.unpack(data, 8);
    }

    static u16(data, endian = 'little') {
        return this.unpack(data, 16, endian);
    }

    static u32(data, endian = 'little') {
        return this.unpack(data, 32, endian);
    }

    static u64(data, endian = 'little') {
        return this.unpack(data, 64, endian);
    }
}
```

### Tool 3: cyberchef_cyclic_pattern

**Purpose**: Generate and analyze de Bruijn sequences for offset discovery

```javascript
{
    name: 'cyberchef_cyclic_pattern',
    description: 'Generate cyclic patterns (de Bruijn sequences) for buffer overflow offset discovery',
    inputSchema: {
        type: 'object',
        properties: {
            mode: {
                type: 'string',
                enum: ['generate', 'find'],
                default: 'generate',
                description: 'Generate pattern or find offset'
            },
            length: {
                type: 'integer',
                minimum: 1,
                maximum: 100000,
                default: 100,
                description: 'Pattern length to generate (generate mode)'
            },
            search: {
                type: 'string',
                description: 'Substring to find offset of (find mode)'
            },
            alphabet: {
                type: 'string',
                default: 'abcdefghijklmnopqrstuvwxyz',
                description: 'Characters to use in pattern'
            },
            n: {
                type: 'integer',
                default: 4,
                description: 'Subsequence length (k-ary de Bruijn)'
            }
        },
        required: ['mode']
    }
}
```

**Implementation**:

```javascript
// src/node/tools/pwntools/cyclic.mjs
export class CyclicPattern {
    /**
     * Generate de Bruijn sequence
     * Based on pwntools cyclic() implementation
     * @param {number} length - Desired pattern length
     * @param {string} alphabet - Characters to use
     * @param {number} n - Subsequence length
     * @returns {string}
     */
    static generate(length, alphabet = 'abcdefghijklmnopqrstuvwxyz', n = 4) {
        const k = alphabet.length;
        const sequence = [];
        const a = new Array(k * n).fill(0);

        // Generate de Bruijn sequence using FKM algorithm
        const db = (t, p) => {
            if (sequence.length >= length) return;

            if (t > n) {
                if (n % p === 0) {
                    for (let j = 1; j <= p && sequence.length < length; j++) {
                        sequence.push(alphabet[a[j]]);
                    }
                }
            } else {
                a[t] = a[t - p];
                db(t + 1, p);

                for (let j = a[t - p] + 1; j < k && sequence.length < length; j++) {
                    a[t] = j;
                    db(t + 1, t);
                }
            }
        };

        db(1, 1);
        return sequence.join('');
    }

    /**
     * Find offset of substring in cyclic pattern
     * @param {string} search - Substring to find
     * @param {string} alphabet - Characters used in pattern
     * @param {number} n - Subsequence length
     * @returns {number} Offset or -1 if not found
     */
    static find(search, alphabet = 'abcdefghijklmnopqrstuvwxyz', n = 4) {
        // For short searches, generate pattern and find
        // For efficiency, use mathematical properties of de Bruijn sequence
        const maxLength = Math.pow(alphabet.length, n);
        const pattern = this.generate(maxLength, alphabet, n);
        return pattern.indexOf(search);
    }

    /**
     * Find offset from packed integer value
     * Useful for buffer overflow analysis
     * @param {number} value - Integer value from crash
     * @param {string} endian - Byte order
     * @returns {number}
     */
    static findOffset(value, endian = 'little') {
        // Unpack to string
        const bytes = [];
        let v = value;
        for (let i = 0; i < 4; i++) {
            bytes.push(v & 0xff);
            v >>>= 8;
        }

        if (endian === 'big') {
            bytes.reverse();
        }

        const search = String.fromCharCode(...bytes);
        return this.find(search);
    }
}
```

### Tool 4: cyberchef_xor_enhanced

**Purpose**: Enhanced XOR with repeating keys and analysis

```javascript
{
    name: 'cyberchef_xor_enhanced',
    description: 'Enhanced XOR operations with repeating key support and analysis',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'Input data (hex or text)'
            },
            input_format: {
                type: 'string',
                enum: ['hex', 'text', 'base64'],
                default: 'hex',
                description: 'Input format'
            },
            key: {
                type: 'string',
                description: 'XOR key (hex, text, or integer)'
            },
            key_format: {
                type: 'string',
                enum: ['hex', 'text', 'integer'],
                default: 'hex',
                description: 'Key format'
            },
            mode: {
                type: 'string',
                enum: ['pad_key', 'pad_data', 'truncate'],
                default: 'pad_key',
                description: 'How to handle length mismatch'
            },
            output_format: {
                type: 'string',
                enum: ['hex', 'text', 'base64'],
                default: 'hex',
                description: 'Output format'
            }
        },
        required: ['input', 'key']
    }
}
```

**Implementation**:

```javascript
// src/node/tools/pwntools/xor.mjs
export class XOREnhanced {
    /**
     * XOR two byte arrays with flexible padding
     * @param {Uint8Array} data - Input data
     * @param {Uint8Array} key - XOR key
     * @param {string} mode - pad_key, pad_data, or truncate
     * @returns {Uint8Array}
     */
    static xor(data, key, mode = 'pad_key') {
        let dataLen = data.length;
        let keyLen = key.length;
        let resultLen;

        switch (mode) {
            case 'pad_key':
                resultLen = dataLen;
                break;
            case 'pad_data':
                resultLen = keyLen;
                break;
            case 'truncate':
                resultLen = Math.min(dataLen, keyLen);
                break;
            default:
                resultLen = Math.max(dataLen, keyLen);
        }

        const result = new Uint8Array(resultLen);

        for (let i = 0; i < resultLen; i++) {
            const dataByte = i < dataLen ? data[i] : 0;
            const keyByte = key[i % keyLen];
            result[i] = dataByte ^ keyByte;
        }

        return result;
    }

    /**
     * XOR with single byte key
     * @param {Uint8Array} data - Input data
     * @param {number} key - Single byte key (0-255)
     * @returns {Uint8Array}
     */
    static xorByte(data, key) {
        const result = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
            result[i] = data[i] ^ key;
        }
        return result;
    }

    /**
     * XOR with incrementing key (common obfuscation)
     * @param {Uint8Array} data - Input data
     * @param {number} start - Starting key value
     * @param {number} step - Increment per byte
     * @returns {Uint8Array}
     */
    static xorIncrement(data, start = 0, step = 1) {
        const result = new Uint8Array(data.length);
        let key = start;

        for (let i = 0; i < data.length; i++) {
            result[i] = data[i] ^ (key & 0xff);
            key += step;
        }

        return result;
    }
}
```

### Tool 5: cyberchef_hexdump_enhanced

**Purpose**: Enhanced hexdump with highlighting and multiple formats

```javascript
{
    name: 'cyberchef_hexdump_enhanced',
    description: 'Generate formatted hexdump with highlighting and analysis',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'Input data (hex or base64)'
            },
            input_format: {
                type: 'string',
                enum: ['hex', 'base64'],
                default: 'hex'
            },
            width: {
                type: 'integer',
                minimum: 1,
                maximum: 64,
                default: 16,
                description: 'Bytes per line'
            },
            offset: {
                type: 'integer',
                default: 0,
                description: 'Starting address offset'
            },
            highlight: {
                type: 'string',
                description: 'Hex pattern to highlight'
            },
            show_ascii: {
                type: 'boolean',
                default: true,
                description: 'Show ASCII representation'
            },
            group_size: {
                type: 'integer',
                enum: [1, 2, 4, 8],
                default: 1,
                description: 'Bytes per group'
            }
        },
        required: ['input']
    }
}
```

**Implementation**:

```javascript
// src/node/tools/pwntools/hexdump.mjs
export class EnhancedHexdump {
    /**
     * Generate formatted hexdump
     * @param {Uint8Array} data - Binary data
     * @param {object} options - Formatting options
     * @returns {string}
     */
    static format(data, options = {}) {
        const {
            width = 16,
            offset = 0,
            highlight = null,
            showAscii = true,
            groupSize = 1
        } = options;

        const lines = [];
        const highlightBytes = highlight ?
            this.parseHex(highlight) : null;

        for (let i = 0; i < data.length; i += width) {
            const lineBytes = data.slice(i, i + width);
            const addr = (offset + i).toString(16).padStart(8, '0');

            // Hex portion
            const hexParts = [];
            for (let j = 0; j < lineBytes.length; j += groupSize) {
                const group = [];
                for (let k = 0; k < groupSize && j + k < lineBytes.length; k++) {
                    const byteVal = lineBytes[j + k];
                    let hex = byteVal.toString(16).padStart(2, '0');

                    // Check for highlight
                    if (highlightBytes && this.matchesHighlight(data, i + j + k, highlightBytes)) {
                        hex = `[${hex}]`;
                    }
                    group.push(hex);
                }
                hexParts.push(group.join(''));
            }

            // Pad hex portion
            const hexStr = hexParts.join(' ');
            const expectedHexLen = Math.ceil(width / groupSize) * (groupSize * 2 + 1) - 1;
            const paddedHex = hexStr.padEnd(expectedHexLen);

            // ASCII portion
            let asciiStr = '';
            if (showAscii) {
                asciiStr = ' |';
                for (const byte of lineBytes) {
                    asciiStr += (byte >= 32 && byte <= 126) ?
                        String.fromCharCode(byte) : '.';
                }
                asciiStr += '|';
            }

            lines.push(`${addr}  ${paddedHex}${asciiStr}`);
        }

        return lines.join('\n');
    }

    /**
     * Parse hex string to bytes
     */
    static parseHex(hex) {
        const clean = hex.replace(/\s/g, '');
        const bytes = [];
        for (let i = 0; i < clean.length; i += 2) {
            bytes.push(parseInt(clean.substr(i, 2), 16));
        }
        return new Uint8Array(bytes);
    }

    /**
     * Check if position matches highlight pattern
     */
    static matchesHighlight(data, pos, pattern) {
        if (pos + pattern.length > data.length) return false;
        for (let i = 0; i < pattern.length; i++) {
            if (data[pos + i] !== pattern[i]) return false;
        }
        return true;
    }
}
```

### Tool 6: cyberchef_bit_operations

**Purpose**: Bit-level operations (bits/unbits from pwntools)

```javascript
{
    name: 'cyberchef_bit_operations',
    description: 'Convert between bytes and bit arrays',
    inputSchema: {
        type: 'object',
        properties: {
            input: {
                type: 'string',
                description: 'Input data'
            },
            mode: {
                type: 'string',
                enum: ['to_bits', 'from_bits'],
                default: 'to_bits',
                description: 'Conversion direction'
            },
            input_format: {
                type: 'string',
                enum: ['hex', 'text', 'binary_string'],
                default: 'hex',
                description: 'Input format'
            },
            bit_order: {
                type: 'string',
                enum: ['msb', 'lsb'],
                default: 'msb',
                description: 'Bit order (MSB or LSB first)'
            },
            output_format: {
                type: 'string',
                enum: ['array', 'string', 'hex'],
                default: 'array',
                description: 'Output format'
            }
        },
        required: ['input', 'mode']
    }
}
```

**Implementation**:

```javascript
// src/node/tools/pwntools/bits.mjs
export class BitOperations {
    /**
     * Convert bytes to bit array
     * @param {Uint8Array} data - Input bytes
     * @param {string} order - 'msb' or 'lsb'
     * @returns {number[]}
     */
    static toBits(data, order = 'msb') {
        const bits = [];

        for (const byte of data) {
            if (order === 'msb') {
                for (let i = 7; i >= 0; i--) {
                    bits.push((byte >> i) & 1);
                }
            } else {
                for (let i = 0; i < 8; i++) {
                    bits.push((byte >> i) & 1);
                }
            }
        }

        return bits;
    }

    /**
     * Convert bit array to bytes
     * @param {number[]} bits - Input bits
     * @param {string} order - 'msb' or 'lsb'
     * @returns {Uint8Array}
     */
    static fromBits(bits, order = 'msb') {
        // Pad to byte boundary
        while (bits.length % 8 !== 0) {
            bits.push(0);
        }

        const bytes = [];

        for (let i = 0; i < bits.length; i += 8) {
            let byte = 0;
            if (order === 'msb') {
                for (let j = 0; j < 8; j++) {
                    byte = (byte << 1) | bits[i + j];
                }
            } else {
                for (let j = 0; j < 8; j++) {
                    byte |= bits[i + j] << j;
                }
            }
            bytes.push(byte);
        }

        return new Uint8Array(bytes);
    }

    /**
     * Parse binary string to bit array
     * @param {string} str - String of 0s and 1s
     * @returns {number[]}
     */
    static parseBinaryString(str) {
        return str.replace(/\s/g, '').split('').map(c => parseInt(c, 10));
    }
}
```

## File Structure

```
src/node/tools/pwntools/
  index.mjs          # Main entry point, tool registration
  pack.mjs           # BinaryPacker class
  unpack.mjs         # BinaryUnpacker class
  cyclic.mjs         # CyclicPattern class
  xor.mjs            # XOREnhanced class
  hexdump.mjs        # EnhancedHexdump class
  bits.mjs           # BitOperations class

tests/tools/pwntools/
  pack.test.mjs      # Packing tests
  unpack.test.mjs    # Unpacking tests
  cyclic.test.mjs    # Cyclic pattern tests
  xor.test.mjs       # XOR operation tests
  hexdump.test.mjs   # Hexdump formatting tests
  bits.test.mjs      # Bit operation tests
```

## Test Cases

### Binary Pack/Unpack

```javascript
describe('BinaryPacker', () => {
    it('should pack 32-bit little-endian', () => {
        const packed = BinaryPacker.p32(0xdeadbeef);
        expect(toHex(packed)).toBe('efbeadde');
    });

    it('should pack 32-bit big-endian', () => {
        const packed = BinaryPacker.p32(0xdeadbeef, 'big');
        expect(toHex(packed)).toBe('deadbeef');
    });

    it('should pack 64-bit values', () => {
        const packed = BinaryPacker.p64(0x123456789abcdef0n);
        expect(toHex(packed)).toBe('f0debc9a78563412');
    });

    it('should handle signed values', () => {
        const packed = BinaryPacker.pack(-1, 32, 'little', true);
        expect(toHex(packed)).toBe('ffffffff');
    });
});

describe('BinaryUnpacker', () => {
    it('should unpack 32-bit little-endian', () => {
        const data = fromHex('efbeadde');
        expect(BinaryUnpacker.u32(data)).toBe(0xdeadbeef);
    });

    it('should unpack 64-bit values', () => {
        const data = fromHex('f0debc9a78563412');
        expect(BinaryUnpacker.u64(data)).toBe(0x123456789abcdef0n);
    });
});
```

### Cyclic Patterns

```javascript
describe('CyclicPattern', () => {
    it('should generate unique subsequences', () => {
        const pattern = CyclicPattern.generate(100);
        // Every 4-character substring should be unique
        const seen = new Set();
        for (let i = 0; i < pattern.length - 3; i++) {
            const sub = pattern.substring(i, i + 4);
            expect(seen.has(sub)).toBe(false);
            seen.add(sub);
        }
    });

    it('should find offset correctly', () => {
        const pattern = CyclicPattern.generate(200);
        const offset = CyclicPattern.find('faab');
        expect(pattern.substring(offset, offset + 4)).toBe('faab');
    });

    it('should find offset from packed integer', () => {
        // 'faab' as little-endian 32-bit
        const value = 0x62616166;
        const offset = CyclicPattern.findOffset(value);
        expect(offset).toBeGreaterThan(0);
    });
});
```

### XOR Operations

```javascript
describe('XOREnhanced', () => {
    it('should XOR with repeating key', () => {
        const data = fromHex('48656c6c6f');  // "Hello"
        const key = fromHex('4b4559');       // "KEY"
        const result = XOREnhanced.xor(data, key);
        // "Hello" XOR "KEYK" (repeated)
        expect(toHex(result)).toBe('032c310721');
    });

    it('should XOR with single byte', () => {
        const data = fromHex('deadbeef');
        const result = XOREnhanced.xorByte(data, 0xff);
        expect(toHex(result)).toBe('21524110');
    });

    it('should XOR with incrementing key', () => {
        const data = fromHex('00010203');
        const result = XOREnhanced.xorIncrement(data, 0x10, 1);
        expect(toHex(result)).toBe('10121416');
    });
});
```

## Integration with CyberChef

### Complementary Operations

| pwntools Tool | Complements CyberChef Operation |
|---------------|----------------------------------|
| binary_pack | To Hex, Swap endianness |
| binary_unpack | From Hex, various integer parsers |
| cyclic_pattern | None (unique capability) |
| xor_enhanced | XOR, XOR Brute Force |
| hexdump_enhanced | To Hexdump |
| bit_operations | To Binary, From Binary |

### Workflow Example: Buffer Overflow Analysis

```
1. Generate cyclic pattern:
   cyberchef_cyclic_pattern(mode='generate', length=500)

2. After crash, find offset:
   cyberchef_cyclic_pattern(mode='find', search='6161616c')

3. Create payload with packed address:
   cyberchef_binary_pack(value=0x08041234, size=32, endian='little')

4. Visualize payload:
   cyberchef_hexdump_enhanced(input=<payload>, highlight='3412')
```

## Dependencies

None - all implementations use native JavaScript features:
- `ArrayBuffer`, `DataView`, `Uint8Array` for binary operations
- `BigInt` for 64-bit integer support
- No external npm packages required

## Timeline

| Task | Duration | Dependencies |
|------|----------|--------------|
| Implement pack/unpack | 0.5 days | None |
| Implement cyclic patterns | 0.5 days | None |
| Implement XOR enhanced | 0.5 days | None |
| Implement hexdump | 0.5 days | None |
| Implement bit operations | 0.5 days | None |
| Write tests | 1 day | All implementations |
| Integration testing | 0.5 days | Tests |

**Total: 4 days**

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| BigInt browser compatibility | Low | Low | Target modern environments |
| Performance on large patterns | Medium | Low | Add length limits |
| Endianness edge cases | Low | Medium | Comprehensive test coverage |

## Success Criteria

1. All 6 MCP tools implemented and registered
2. 100% test coverage for core functions
3. Compatible with pwntools API semantics
4. No external dependencies
5. Performance acceptable for typical CTF use cases

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Phase:** 2 (JavaScript Native)
