# Sprint 2.3: pwntools Binary Utilities

## Sprint Overview

| Field | Value |
|-------|-------|
| Sprint | 2.3 |
| Phase | 2 - JavaScript Native |
| Duration | 2 weeks |
| Start | Week 9 |
| End | Week 10 |

## Objectives

1. Port pwntools binary packing/unpacking utilities
2. Implement cyclic pattern generation (de Bruijn)
3. Create enhanced hexdump functionality
4. Add bit manipulation tools

## User Stories

### US-2.3.1: Binary Packing

**As a** exploit developer
**I want** to pack/unpack integers to binary
**So that** I can construct binary payloads

**Acceptance Criteria:**
- [ ] Pack integers (8/16/32/64-bit)
- [ ] Unpack integers from bytes
- [ ] Support little/big endian
- [ ] Handle signed/unsigned

### US-2.3.2: Cyclic Patterns

**As a** exploit developer
**I want** to generate cyclic patterns
**So that** I can identify buffer overflow offsets

**Acceptance Criteria:**
- [ ] Generate de Bruijn sequences
- [ ] Find subsequence position
- [ ] Configurable alphabet
- [ ] Pattern length options

### US-2.3.3: Enhanced Hexdump

**As a** analyst
**I want** configurable hexdump output
**So that** I can analyze binary data effectively

**Acceptance Criteria:**
- [ ] Configurable width (8/16/32 bytes)
- [ ] Address display options
- [ ] ASCII column toggle
- [ ] Highlight patterns

### US-2.3.4: Bit Operations

**As a** developer
**I want** bitwise operation tools
**So that** I can manipulate individual bits

**Acceptance Criteria:**
- [ ] Bit rotation (ROL/ROR)
- [ ] Bit reversal
- [ ] Bit counting
- [ ] Bitwise NOT/AND/OR/XOR

## Tasks

### Binary Packing (Day 1-3)

| ID | Task | Estimate | Assignee |
|----|------|----------|----------|
| T-2.3.1 | Analyze pwntools packing source | 2h | - |
| T-2.3.2 | Implement p8/p16/p32/p64 | 4h | - |
| T-2.3.3 | Implement u8/u16/u32/u64 | 4h | - |
| T-2.3.4 | Add signed number support | 2h | - |
| T-2.3.5 | Create BinaryPacker tool | 4h | - |

### Cyclic Patterns (Day 4-6)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-2.3.6 | Implement de Bruijn generator | 4h | - |
| T-2.3.7 | Implement pattern finder | 3h | T-2.3.6 |
| T-2.3.8 | Create CyclicPattern tool | 3h | T-2.3.7 |
| T-2.3.9 | Write reference tests | 2h | T-2.3.8 |

### Hexdump & Bits (Day 7-9)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-2.3.10 | Implement enhanced hexdump | 4h | - |
| T-2.3.11 | Implement bit operations | 4h | - |
| T-2.3.12 | Create EnhancedHexdump tool | 3h | T-2.3.10 |
| T-2.3.13 | Create BitOperations tool | 3h | T-2.3.11 |

### Integration (Day 10)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-2.3.14 | Register all tools | 2h | All |
| T-2.3.15 | Write integration tests | 4h | T-2.3.14 |
| T-2.3.16 | Documentation | 2h | All |

## Deliverables

### Files to Create

```
src/node/tools/
├── pwntools/
│   ├── index.mjs           # Module exports
│   ├── packing.mjs         # Binary packing utilities
│   ├── cyclic.mjs          # De Bruijn patterns
│   ├── hexdump.mjs         # Enhanced hexdump
│   ├── bits.mjs            # Bit operations
│   └── register.mjs        # Tool registration
```

### Code Specifications

#### Binary Packing (packing.mjs)

```javascript
/**
 * Binary packing utilities (pwntools-style)
 */

/**
 * Pack an integer to bytes
 */
export function pack(value, bits = 32, endian = 'little', signed = false) {
    const byteLength = bits / 8;
    const buffer = new ArrayBuffer(byteLength);
    const view = new DataView(buffer);

    // Handle BigInt for 64-bit
    if (bits === 64) {
        const bigValue = signed ? BigInt.asIntN(64, BigInt(value)) : BigInt(value);
        if (signed) {
            view.setBigInt64(0, bigValue, endian === 'little');
        } else {
            view.setBigUint64(0, bigValue, endian === 'little');
        }
    } else {
        const numValue = Number(value);

        switch (bits) {
            case 8:
                if (signed) {
                    view.setInt8(0, numValue);
                } else {
                    view.setUint8(0, numValue);
                }
                break;
            case 16:
                if (signed) {
                    view.setInt16(0, numValue, endian === 'little');
                } else {
                    view.setUint16(0, numValue, endian === 'little');
                }
                break;
            case 32:
                if (signed) {
                    view.setInt32(0, numValue, endian === 'little');
                } else {
                    view.setUint32(0, numValue >>> 0, endian === 'little');
                }
                break;
        }
    }

    return new Uint8Array(buffer);
}

/**
 * Unpack bytes to an integer
 */
export function unpack(bytes, bits = 32, endian = 'little', signed = false) {
    if (typeof bytes === 'string') {
        bytes = Uint8Array.from(bytes, c => c.charCodeAt(0));
    }

    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const view = new DataView(buffer);

    if (bits === 64) {
        if (signed) {
            return view.getBigInt64(0, endian === 'little');
        } else {
            return view.getBigUint64(0, endian === 'little');
        }
    }

    switch (bits) {
        case 8:
            return signed ? view.getInt8(0) : view.getUint8(0);
        case 16:
            return signed ? view.getInt16(0, endian === 'little') : view.getUint16(0, endian === 'little');
        case 32:
            return signed ? view.getInt32(0, endian === 'little') : view.getUint32(0, endian === 'little');
    }
}

// Convenience functions (pwntools-style names)
export const p8 = (v, signed = false) => pack(v, 8, 'little', signed);
export const p16 = (v, endian = 'little', signed = false) => pack(v, 16, endian, signed);
export const p32 = (v, endian = 'little', signed = false) => pack(v, 32, endian, signed);
export const p64 = (v, endian = 'little', signed = false) => pack(v, 64, endian, signed);

export const u8 = (b, signed = false) => unpack(b, 8, 'little', signed);
export const u16 = (b, endian = 'little', signed = false) => unpack(b, 16, endian, signed);
export const u32 = (b, endian = 'little', signed = false) => unpack(b, 32, endian, signed);
export const u64 = (b, endian = 'little', signed = false) => unpack(b, 64, endian, signed);
```

#### Cyclic Pattern (cyclic.mjs)

```javascript
/**
 * De Bruijn sequence generation (cyclic patterns)
 */

/**
 * Generate de Bruijn sequence using FKM algorithm
 */
export function deBruijn(k, n, alphabet = null) {
    if (alphabet === null) {
        alphabet = 'abcdefghijklmnopqrstuvwxyz'.slice(0, k);
    }
    if (typeof alphabet === 'string') {
        alphabet = alphabet.split('');
    }

    k = alphabet.length;
    const a = new Array(k * n).fill(0);
    const sequence = [];

    function db(t, p) {
        if (t > n) {
            if (n % p === 0) {
                for (let j = 1; j <= p; j++) {
                    sequence.push(alphabet[a[j]]);
                }
            }
        } else {
            a[t] = a[t - p];
            db(t + 1, p);

            for (let j = a[t - p] + 1; j < k; j++) {
                a[t] = j;
                db(t + 1, t);
            }
        }
    }

    db(1, 1);
    return sequence.join('');
}

/**
 * Generate a cyclic pattern of specified length
 */
export function cyclic(length, n = 4, alphabet = 'abcdefghijklmnopqrstuvwxyz') {
    const pattern = deBruijn(alphabet.length, n, alphabet);

    // Repeat pattern if needed
    let result = pattern;
    while (result.length < length) {
        result += pattern;
    }

    return result.slice(0, length);
}

/**
 * Find a subsequence in the cyclic pattern
 */
export function cyclicFind(subsequence, n = 4, alphabet = 'abcdefghijklmnopqrstuvwxyz') {
    // Convert to string if needed
    if (typeof subsequence === 'number') {
        subsequence = p32(subsequence, 'little');
    }
    if (subsequence instanceof Uint8Array) {
        subsequence = String.fromCharCode(...subsequence);
    }

    // Generate pattern
    const pattern = deBruijn(alphabet.length, n, alphabet);

    // Find position
    const index = pattern.indexOf(subsequence);
    if (index === -1) {
        // Try in repeated pattern
        const extended = pattern + pattern.slice(0, n - 1);
        const extIndex = extended.indexOf(subsequence);
        return extIndex;
    }

    return index;
}

/**
 * Convert offset to pattern value at that position
 */
export function cyclicOffset(offset, n = 4, alphabet = 'abcdefghijklmnopqrstuvwxyz') {
    const pattern = cyclic(offset + n, n, alphabet);
    return pattern.slice(offset, offset + n);
}
```

#### Enhanced Hexdump (hexdump.mjs)

```javascript
/**
 * Enhanced hexdump with configurable formatting
 */

/**
 * Generate hexdump output
 */
export function hexdump(data, options = {}) {
    const {
        width = 16,
        offset = 0,
        showOffset = true,
        showAscii = true,
        uppercase = false,
        groupSize = 1,
        offsetWidth = 8
    } = options;

    if (typeof data === 'string') {
        data = Uint8Array.from(data, c => c.charCodeAt(0));
    }

    const lines = [];
    const format = uppercase ? 'X' : 'x';

    for (let i = 0; i < data.length; i += width) {
        const parts = [];

        // Offset
        if (showOffset) {
            parts.push(
                (offset + i).toString(16).padStart(offsetWidth, '0')
            );
        }

        // Hex bytes
        const hexParts = [];
        for (let j = 0; j < width; j++) {
            if (i + j < data.length) {
                const byte = data[i + j];
                let hex = byte.toString(16).padStart(2, '0');
                if (uppercase) hex = hex.toUpperCase();
                hexParts.push(hex);
            } else {
                hexParts.push('  ');
            }
        }

        // Group bytes
        const grouped = [];
        for (let j = 0; j < hexParts.length; j += groupSize) {
            grouped.push(hexParts.slice(j, j + groupSize).join(''));
        }
        parts.push(grouped.join(' '));

        // ASCII
        if (showAscii) {
            let ascii = '';
            for (let j = 0; j < width && i + j < data.length; j++) {
                const byte = data[i + j];
                ascii += (byte >= 0x20 && byte < 0x7f)
                    ? String.fromCharCode(byte)
                    : '.';
            }
            parts.push('|' + ascii.padEnd(width, ' ') + '|');
        }

        lines.push(parts.join('  '));
    }

    return lines.join('\n');
}

/**
 * Parse hexdump back to bytes
 */
export function unhexdump(dump, options = {}) {
    const { hasOffset = true, hasAscii = true } = options;

    const bytes = [];
    const lines = dump.split('\n');

    for (const line of lines) {
        if (!line.trim()) continue;

        let hexPart = line;

        // Remove offset
        if (hasOffset) {
            const match = hexPart.match(/^[0-9a-fA-F]+\s+(.+)/);
            if (match) {
                hexPart = match[1];
            }
        }

        // Remove ASCII
        if (hasAscii) {
            const asciiIndex = hexPart.indexOf('|');
            if (asciiIndex !== -1) {
                hexPart = hexPart.slice(0, asciiIndex);
            }
        }

        // Parse hex bytes
        const hexBytes = hexPart.trim().split(/\s+/);
        for (const hb of hexBytes) {
            // Handle grouped bytes
            for (let i = 0; i < hb.length; i += 2) {
                const byte = parseInt(hb.slice(i, i + 2), 16);
                if (!isNaN(byte)) {
                    bytes.push(byte);
                }
            }
        }
    }

    return new Uint8Array(bytes);
}
```

#### Bit Operations (bits.mjs)

```javascript
/**
 * Bitwise operation utilities
 */

/**
 * Rotate left (ROL)
 */
export function rol(value, shift, bits = 32) {
    if (bits === 64) {
        const bigValue = BigInt(value);
        const bigShift = BigInt(shift % 64);
        const mask = (1n << 64n) - 1n;
        return ((bigValue << bigShift) | (bigValue >> (64n - bigShift))) & mask;
    }

    const numValue = value >>> 0;
    const mask = (1 << bits) - 1;
    shift = shift % bits;
    return ((numValue << shift) | (numValue >>> (bits - shift))) & mask;
}

/**
 * Rotate right (ROR)
 */
export function ror(value, shift, bits = 32) {
    return rol(value, bits - (shift % bits), bits);
}

/**
 * Reverse bits
 */
export function reverseBits(value, bits = 32) {
    let result = 0;

    for (let i = 0; i < bits; i++) {
        result = (result << 1) | (value & 1);
        value >>>= 1;
    }

    return result >>> 0;
}

/**
 * Count set bits (popcount)
 */
export function popcount(value) {
    if (typeof value === 'bigint') {
        let count = 0n;
        while (value) {
            count += value & 1n;
            value >>= 1n;
        }
        return Number(count);
    }

    // Brian Kernighan's algorithm
    let count = 0;
    while (value) {
        value &= (value - 1);
        count++;
    }
    return count;
}

/**
 * Find highest set bit
 */
export function highestBit(value) {
    if (value === 0) return -1;

    let bit = 0;
    while (value > 1) {
        value >>>= 1;
        bit++;
    }
    return bit;
}

/**
 * Find lowest set bit
 */
export function lowestBit(value) {
    if (value === 0) return -1;

    let bit = 0;
    while ((value & 1) === 0) {
        value >>>= 1;
        bit++;
    }
    return bit;
}

/**
 * Swap bytes in value
 */
export function bswap(value, bits = 32) {
    if (bits === 16) {
        return ((value & 0xff) << 8) | ((value >>> 8) & 0xff);
    }
    if (bits === 32) {
        return (
            ((value & 0xff) << 24) |
            ((value & 0xff00) << 8) |
            ((value >>> 8) & 0xff00) |
            ((value >>> 24) & 0xff)
        ) >>> 0;
    }
    if (bits === 64) {
        const bigValue = BigInt(value);
        return (
            ((bigValue & 0xffn) << 56n) |
            ((bigValue & 0xff00n) << 40n) |
            ((bigValue & 0xff0000n) << 24n) |
            ((bigValue & 0xff000000n) << 8n) |
            ((bigValue >> 8n) & 0xff000000n) |
            ((bigValue >> 24n) & 0xff0000n) |
            ((bigValue >> 40n) & 0xff00n) |
            ((bigValue >> 56n) & 0xffn)
        );
    }
    return value;
}
```

### MCP Tools Registered

| Tool Name | Description |
|-----------|-------------|
| `cyberchef_binary_pack` | Pack integers to binary (p8/p16/p32/p64) |
| `cyberchef_binary_unpack` | Unpack binary to integers (u8/u16/u32/u64) |
| `cyberchef_cyclic_pattern` | Generate cyclic patterns (de Bruijn) |
| `cyberchef_cyclic_find` | Find offset in cyclic pattern |
| `cyberchef_hexdump` | Enhanced hexdump with options |
| `cyberchef_bit_operations` | Bit manipulation (ROL/ROR/etc.) |

## Definition of Done

- [ ] All packing functions implemented
- [ ] Cyclic pattern generation working
- [ ] Reference tests against pwntools outputs
- [ ] Unit tests with > 85% coverage
- [ ] MCP tools registered and functional
- [ ] Documentation complete

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| BigInt edge cases | Medium | Medium | Extensive 64-bit testing |
| Endianness confusion | Medium | Low | Clear documentation, examples |
| Pattern offset calculation | Low | Low | Reference test vectors |

## Dependencies

### External

- None (pure JavaScript)

### Internal

- Sprint 1.1 (ToolRegistry)

## Notes

- pwntools is Python-based, but packing is pure algorithm
- Cyclic patterns are essential for exploit development
- These tools complement CyberChef's existing hex tools

---

**Sprint Version:** 1.0.0
**Created:** 2025-12-17
