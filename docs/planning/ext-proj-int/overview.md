# External Project Integration Overview

## Executive Summary

This document outlines the comprehensive strategy for integrating reference security tools into CyberChef-MCP as native MCP tools. The integration focuses on extracting algorithms and functionality directly from source code to create a unified security analysis toolkit accessible via the Model Context Protocol.

### Goals

1. **Expand Capabilities** - Add 80-120 new MCP tools from 8 reference projects
2. **Unified Interface** - Single MCP API for diverse security operations
3. **Native Integration** - Pure JavaScript implementations, no external binaries
4. **AI-Assisted Security** - Enable AI assistants to perform advanced cryptanalysis
5. **CTF Automation** - Streamline Capture The Flag competition workflows

### Non-Goals

1. Docker container orchestration
2. External binary execution via subprocess
3. Python/Rust runtime dependencies
4. Network-dependent tool execution
5. GUI or visual interface components

## Current Architecture

### CyberChef-MCP v1.7.x Structure

```
MCP Client (AI/IDE) <──> CyberChef MCP Server <──> CyberChef Node API <──> CyberChef Core
                         (src/node/mcp-server.mjs)  (src/node/index.mjs)    (src/core/)
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| MCP Server | `src/node/mcp-server.mjs` | Protocol handling, tool registration, dispatch |
| Node API | `src/node/index.mjs` | Bridge to CyberChef core (generated) |
| Operations | `src/core/operations/*.mjs` | Individual operation implementations |
| Config | `src/core/config/OperationConfig.json` | Operation metadata (generated) |

### Current Tool Generation

Tools are dynamically generated from `OperationConfig.json`:

```javascript
// Current pattern in mcp-server.mjs
for (const opName of Object.keys(OperationConfig)) {
    const toolName = `cyberchef_${sanitizeName(opName)}`;
    // Generate tool with standard input/output schema
}
```

## Target Architecture

### Extended Tool Categories

```
MCP Client <──> CyberChef MCP Server <──> Tool Handlers
                                              │
                ┌────────────────────────────┼────────────────────────────┐
                │                            │                            │
        ┌───────▼───────┐          ┌────────▼────────┐         ┌────────▼────────┐
        │ CyberChef Ops │          │ External Tools  │         │ Composite Tools │
        │   (300+)      │          │   (80-120)      │         │   (20-30)       │
        └───────────────┘          └─────────────────┘         └─────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
             ┌──────▼──────┐      ┌──────▼──────┐       ┌──────▼──────┐
             │  Encoding   │      │  Crypto     │       │  Analysis   │
             │  Detection  │      │  Analysis   │       │  Tools      │
             └─────────────┘      └─────────────┘       └─────────────┘
```

### New Modules Structure

```
src/
├── node/
│   ├── mcp-server.mjs           # Existing MCP server (extended)
│   ├── index.mjs                # Existing Node API
│   └── tools/                   # NEW: External tool integrations
│       ├── index.mjs            # Tool registry
│       ├── auto-decode/         # Ciphey-based auto-decode
│       │   ├── index.mjs
│       │   ├── decoders/
│       │   ├── checkers/
│       │   └── search/
│       ├── xor-analysis/        # xortool algorithms
│       │   ├── index.mjs
│       │   ├── key-length.mjs
│       │   └── key-guess.mjs
│       ├── rsa-attacks/         # RsaCtfTool algorithms
│       │   ├── index.mjs
│       │   ├── factorization/
│       │   └── cryptanalysis/
│       ├── hash-analysis/       # John-based identification
│       │   ├── index.mjs
│       │   └── patterns/
│       ├── encoding/            # cryptii-based encoding
│       │   ├── index.mjs
│       │   └── pipes/
│       └── recipes/             # Recipe presets
│           ├── index.mjs
│           └── presets/
```

## Integration Strategy

### Phase 1: Foundation (Weeks 1-4)

**Objective**: Establish infrastructure for new tool integrations

#### 1.1 Tool Registration System

Extend MCP server to support multiple tool sources:

```javascript
// src/node/tools/registry.mjs
export class ToolRegistry {
    constructor() {
        this.tools = new Map();
        this.categories = new Map();
    }

    register(tool) {
        this.tools.set(tool.name, tool);
        this.addToCategory(tool);
    }

    getAll() {
        return [...this.tools.values()];
    }
}
```

#### 1.2 Standard Tool Interface

Define consistent interface for all new tools:

```javascript
// Tool interface definition
interface MCPTool {
    name: string;                    // cyberchef_<category>_<operation>
    description: string;             // Human-readable description
    category: string;                // Tool category
    inputSchema: JSONSchema;         // MCP input schema
    execute(args: object): Promise<ToolResult>;
}

interface ToolResult {
    success: boolean;
    output: any;
    metadata?: {
        executionTime: number;
        algorithm: string;
        confidence?: number;
    };
}
```

#### 1.3 Testing Framework

Extend existing test infrastructure:

```javascript
// tests/tools/base-tool.test.mjs
describe('External Tool Integration', () => {
    describe('Tool Registry', () => {
        it('should register new tools', () => {});
        it('should expose tools via MCP', () => {});
        it('should validate input schemas', () => {});
    });
});
```

### Phase 2: JavaScript Native (Weeks 5-8)

**Objective**: Integrate JavaScript-based reference projects

#### 2.1 cryptii Integration

cryptii is already JavaScript - minimal porting required:

```javascript
// src/node/tools/encoding/cryptii-adapter.mjs
import { Pipe, Brick, Encoder, Decoder } from 'cryptii';

export class CryptiiAdapter {
    constructor() {
        this.pipes = this.loadPipes();
    }

    encode(text, encoding, options) {
        const pipe = new Pipe();
        pipe.add(new Encoder(encoding, options));
        return pipe.encode(text);
    }
}
```

#### 2.2 Recipe Presets

Convert cyberchef-recipes patterns:

```javascript
// src/node/tools/recipes/presets/malware.mjs
export const POWERSHELL_DEOBFUSCATION = {
    name: 'PowerShell Deobfuscation',
    description: 'Decode obfuscated PowerShell (CharCode + Base64)',
    recipe: [
        { op: 'Regular expression', args: [...] },
        { op: 'From Charcode', args: [...] },
        { op: 'From Base64', args: [...] }
    ]
};
```

### Phase 3: Algorithm Ports (Weeks 9-16)

**Objective**: Port Python/Rust algorithms to JavaScript

#### 3.1 Porting Methodology

1. **Analysis**: Study source algorithm in original language
2. **Documentation**: Document algorithm steps and edge cases
3. **Implementation**: Translate to JavaScript preserving logic
4. **Testing**: Verify output matches original implementation
5. **Optimization**: Profile and optimize for JavaScript

#### 3.2 Ciphey AuSearch Algorithm

The AuSearch algorithm from Ciphey uses A* search with heuristics:

```javascript
// src/node/tools/auto-decode/search/ausearch.mjs
export class AuSearch {
    constructor(decoders, checkers) {
        this.decoders = decoders;
        this.checkers = checkers;
        this.visited = new Set();
    }

    search(input, timeout = 5000) {
        const startTime = Date.now();
        const queue = new PriorityQueue();
        queue.enqueue({ text: input, path: [], score: 0 });

        while (!queue.isEmpty() && Date.now() - startTime < timeout) {
            const node = queue.dequeue();

            // Check if plaintext
            const checkResult = this.checkPlaintext(node.text);
            if (checkResult.isPlaintext) {
                return { success: true, result: node.text, path: node.path };
            }

            // Try all decoders
            for (const decoder of this.decoders) {
                const decoded = decoder.decode(node.text);
                if (decoded && !this.visited.has(decoded)) {
                    this.visited.add(decoded);
                    const score = this.calculateScore(decoded, decoder);
                    queue.enqueue({
                        text: decoded,
                        path: [...node.path, decoder.name],
                        score
                    });
                }
            }
        }

        return { success: false, result: null, path: [] };
    }
}
```

#### 3.3 xortool Key Analysis

Port xortool's XOR key length detection:

```javascript
// src/node/tools/xor-analysis/key-length.mjs
export function detectKeyLength(data, maxKeyLen = 65) {
    const counts = new Map();

    for (let keyLen = 1; keyLen <= maxKeyLen; keyLen++) {
        let equal = 0;
        for (let i = 0; i < data.length - keyLen; i++) {
            if (data[i] === data[i + keyLen]) {
                equal++;
            }
        }
        counts.set(keyLen, equal);
    }

    // Find peaks in coincidence index
    return findKeyLengthPeaks(counts);
}
```

#### 3.4 RSA Attack Algorithms

Port RsaCtfTool factorization methods:

```javascript
// src/node/tools/rsa-attacks/factorization/fermat.mjs
import { BigInteger } from 'jsbn';

export function fermatFactor(n, maxIterations = 100000) {
    const nBig = new BigInteger(n.toString());
    let a = nBig.sqrt().add(BigInteger.ONE);
    let b2 = a.multiply(a).subtract(nBig);

    for (let i = 0; i < maxIterations; i++) {
        if (isSquare(b2)) {
            const b = b2.sqrt();
            const p = a.add(b);
            const q = a.subtract(b);
            return { p: p.toString(), q: q.toString() };
        }
        a = a.add(BigInteger.ONE);
        b2 = a.multiply(a).subtract(nBig);
    }

    return null;
}
```

### Phase 4: Advanced Integrations (Weeks 17-22)

**Objective**: Complex multi-algorithm integrations

#### 4.1 Hash Identification

Port John's hash pattern matching:

```javascript
// src/node/tools/hash-analysis/identify.mjs
export const HASH_PATTERNS = [
    { regex: /^[a-f0-9]{32}$/i, type: 'MD5', johnFormat: 'raw-md5' },
    { regex: /^[a-f0-9]{40}$/i, type: 'SHA-1', johnFormat: 'raw-sha1' },
    { regex: /^\$2[ayb]\$/, type: 'bcrypt', johnFormat: 'bcrypt' },
    { regex: /^\$6\$/, type: 'SHA-512 crypt', johnFormat: 'sha512crypt' },
    // ... 100+ more patterns
];

export function identifyHash(hash) {
    const matches = [];
    for (const pattern of HASH_PATTERNS) {
        if (pattern.regex.test(hash)) {
            matches.push({
                type: pattern.type,
                confidence: calculateConfidence(hash, pattern),
                johnFormat: pattern.johnFormat
            });
        }
    }
    return matches.sort((a, b) => b.confidence - a.confidence);
}
```

#### 4.2 Composite Workflows

Create multi-tool workflows:

```javascript
// src/node/tools/workflows/ctf-crypto.mjs
export async function ctfCryptoWorkflow(input) {
    const results = [];

    // Step 1: Identify encoding
    const encoding = await detectEncoding(input);
    results.push({ step: 'encoding_detection', result: encoding });

    // Step 2: Decode if encoded
    let decoded = input;
    if (encoding.detected) {
        decoded = await decodeWithType(input, encoding.type);
        results.push({ step: 'decoding', result: decoded });
    }

    // Step 3: Check for hash
    const hashType = identifyHash(decoded);
    if (hashType.length > 0) {
        results.push({ step: 'hash_identification', result: hashType });
    }

    // Step 4: Try auto-decode
    const autoResult = await auSearch(decoded);
    if (autoResult.success) {
        results.push({ step: 'auto_decode', result: autoResult });
    }

    return results;
}
```

## Tool Naming Convention

### Pattern

```
cyberchef_<category>_<operation>
```

### Categories

| Category | Description | Example Tools |
|----------|-------------|---------------|
| `auto` | Automatic detection/decoding | `auto_decode`, `auto_identify` |
| `xor` | XOR cipher operations | `xor_analyze`, `xor_decrypt` |
| `rsa` | RSA cryptanalysis | `rsa_factor`, `rsa_wiener`, `rsa_fermat` |
| `hash` | Hash operations | `hash_identify`, `hash_crack_attempt` |
| `encoding` | Encoding detection/conversion | `encoding_detect`, `encoding_convert` |
| `recipe` | Recipe presets | `recipe_powershell`, `recipe_webshell` |
| `ctf` | CTF utilities | `ctf_workflow`, `ctf_flag_detect` |

### Naming Examples

```javascript
// From Ciphey
cyberchef_auto_decode          // Main auto-decode functionality
cyberchef_auto_identify        // Identify encoding type only

// From xortool
cyberchef_xor_analyze          // Full XOR analysis
cyberchef_xor_key_length       // Detect probable key length
cyberchef_xor_key_guess        // Guess XOR key
cyberchef_xor_decrypt          // Decrypt with known key

// From RsaCtfTool
cyberchef_rsa_factor           // Factor RSA modulus
cyberchef_rsa_wiener_attack    // Wiener's attack
cyberchef_rsa_fermat_attack    // Fermat's factorization
cyberchef_rsa_common_factor    // Common factor attack
cyberchef_rsa_small_e          // Small exponent attack

// From John
cyberchef_hash_identify        // Identify hash type
cyberchef_hash_validate        // Validate hash format
cyberchef_hash_analyze         // Detailed hash analysis

// From cryptii
cyberchef_encoding_morse       // Morse code encode/decode
cyberchef_encoding_braille     // Braille encode/decode
cyberchef_encoding_enigma      // Enigma cipher

// From recipes
cyberchef_recipe_powershell    // PowerShell deobfuscation preset
cyberchef_recipe_webshell      // PHP webshell analysis preset
cyberchef_recipe_malware       // Generic malware analysis preset
```

## Input/Output Standardization

### Standard Input Schema

```json
{
    "type": "object",
    "properties": {
        "input": {
            "type": "string",
            "description": "Input data (text or base64-encoded binary)"
        },
        "options": {
            "type": "object",
            "description": "Tool-specific options"
        }
    },
    "required": ["input"]
}
```

### Standard Output Format

```json
{
    "success": true,
    "output": "decoded_result",
    "metadata": {
        "algorithm": "AES-CBC",
        "confidence": 0.95,
        "executionTime": 125,
        "path": ["base64", "aes_decrypt"],
        "warnings": []
    }
}
```

### Error Handling

```json
{
    "success": false,
    "error": {
        "code": "DECODE_FAILED",
        "message": "Unable to decode input",
        "details": {
            "attempted": ["base64", "hex", "rot13"],
            "reason": "No valid decoding found"
        }
    }
}
```

## Performance Considerations

### Timeout Management

All tools must support configurable timeouts:

```javascript
export async function execute(args, options = {}) {
    const timeout = options.timeout || 5000;

    return Promise.race([
        actualExecution(args),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
        )
    ]);
}
```

### Memory Limits

Implement memory-aware processing for large inputs:

```javascript
const MAX_INPUT_SIZE = 10 * 1024 * 1024; // 10MB

export function validateInput(input) {
    if (Buffer.byteLength(input) > MAX_INPUT_SIZE) {
        throw new Error(`Input exceeds maximum size of ${MAX_INPUT_SIZE} bytes`);
    }
}
```

### Caching

Cache expensive computations:

```javascript
// LRU cache for RSA factorization results
const factorizationCache = new LRUCache({
    max: 1000,
    ttl: 1000 * 60 * 60 // 1 hour
});
```

## Security Considerations

### Input Validation

All tools must validate and sanitize inputs:

```javascript
export function sanitizeInput(input) {
    // Remove null bytes
    input = input.replace(/\0/g, '');

    // Limit length
    if (input.length > MAX_LENGTH) {
        throw new Error('Input too long');
    }

    return input;
}
```

### Output Safety

Prevent sensitive data leakage:

```javascript
export function sanitizeOutput(output) {
    // Truncate large outputs
    if (output.length > MAX_OUTPUT_LENGTH) {
        return {
            truncated: true,
            output: output.slice(0, MAX_OUTPUT_LENGTH),
            totalLength: output.length
        };
    }
    return output;
}
```

### Rate Limiting

Apply rate limits for expensive operations:

```javascript
const rateLimiter = new RateLimiter({
    rsa_factor: { requests: 10, window: 60000 },
    auto_decode: { requests: 100, window: 60000 }
});
```

## Dependencies

### New npm Packages Required

| Package | Purpose | License |
|---------|---------|---------|
| `jsbn` | Big integer arithmetic for RSA | MIT |
| `crypto-js` | Cryptographic primitives | MIT |
| `buffer` | Buffer polyfill | MIT |
| `base-x` | Base encoding (58, 62, etc.) | MIT |
| `lru-cache` | Caching | ISC |

### Optional Dependencies

| Package | Purpose | When Needed |
|---------|---------|-------------|
| `libsodium-wrappers` | Modern crypto | Advanced crypto ops |
| `node-forge` | PKI operations | RSA key parsing |

## Metrics and Monitoring

### Success Metrics

- Tool execution success rate > 95%
- Average execution time < 1000ms
- Test coverage > 80% for new tools
- Zero runtime errors in production

### Telemetry (Optional)

```javascript
export function trackExecution(toolName, result, duration) {
    telemetry.record({
        tool: toolName,
        success: result.success,
        duration,
        inputSize: result.inputSize,
        timestamp: Date.now()
    });
}
```

## Rollout Strategy

### Incremental Release

1. **Alpha** (Phase 1-2): Internal testing, basic tools
2. **Beta** (Phase 3): Algorithm ports, community testing
3. **RC** (Phase 4): Full integration, performance testing
4. **GA** (Post Phase 4): Production release

### Feature Flags

```javascript
const FEATURE_FLAGS = {
    AUTO_DECODE: true,
    RSA_ATTACKS: false,  // Enable in Phase 3
    HASH_CRACK: false,   // Enable in Phase 4
};
```

## Related Documentation

- [Tool Registration Guide](technical/tool-registration.md)
- [Algorithm Porting Guide](technical/algorithm-porting.md)
- [Testing Strategy](technical/testing-strategy.md)
- [Dependencies](technical/dependencies.md)

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Status:** Planning
