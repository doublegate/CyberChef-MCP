# Ciphey Reference Documentation

## Overview

**Ciphey** is an automated decryption/decoding tool that uses artificial intelligence and natural language processing to automatically identify and decrypt unknown ciphertext without requiring users to specify the encryption type.

### Project Information

| Property | Value |
|----------|-------|
| **Project Name** | Ciphey |
| **Current Version** | 5.14.1 |
| **Language** | Python 3.7+ with C++ core (CipheyCore) |
| **License** | MIT |
| **Repository** | https://github.com/Ciphey/Ciphey |
| **GitHub Stars** | 20,300+ |
| **Status** | Maintenance mode (transitioning to Rust-based Ares successor) |
| **Primary Author** | Brandon Skerritt (@bee-san) |
| **Organization** | University of Liverpool Cyber Security Society |

### Key Features

1. **Automatic Cipher Detection** - AI-powered identification of 50+ encryption/encoding types
2. **Natural Language Processing** - Intelligent plaintext validation using multiple checkers
3. **Speed** - Most decryptions complete in under 3 seconds
4. **C++ Performance Core** - CipheyCore provides blazingly fast cryptanalysis operations
5. **Multi-Language Support** - English and German language detection (with regional variants)
6. **Extensible Plugin System** - Module-based architecture for custom decoders/crackers
7. **Multiple Interfaces** - CLI, Python API, and Docker deployment options

### Use Cases

#### CTF (Capture The Flag) Competitions
- Automatic decryption of challenge ciphertext
- Multi-layer encoding detection (e.g., Base64 -> ROT13 -> Vigenère)
- CTF flag pattern recognition (HTB{}, THM{}, CTF{}, FLAG{})
- Quick validation of decryption approaches

#### Forensics Investigations
- Rapid analysis of encoded artifacts
- Hash identification and lookup (272 hash types)
- Large file processing (tested up to 6GB)
- Unknown encoding identification

#### Security Research
- Malware analysis (deobfuscation of encoded payloads)
- Bug bounty research (analyzing encoded strings)
- Automated reconnaissance of encrypted communications
- Classical cipher weakness identification

#### Educational Purposes
- Learning classical cryptography concepts
- Understanding cipher detection algorithms
- Demonstrating cryptanalysis techniques
- Teaching secure vs. insecure encryption

---

## Technical Architecture

### System Components

Ciphey's architecture consists of multiple interacting components:

```
┌─────────────────────────────────────────────────────┐
│                   Ciphey CLI                         │
│              (click-based interface)                 │
└───────────────────┬─────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────┐
│              Configuration Layer                     │
│         (iface._config.Config object)                │
└───────────────────┬─────────────────────────────────┘
                    │
        ┌───────────┼──────────┬──────────┐
        │           │          │          │
┌───────▼────┐ ┌───▼──────┐ ┌─▼────────┐ ┌──▼────────┐
│ Searchers  │ │ Decoders │ │ Crackers │ │ Checkers  │
│ (AuSearch) │ │ (33+)    │ │ (11)     │ │ (7)       │
└────┬───────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘
     │              │            │              │
     └──────────────┴────────────┴──────────────┘
                    │
┌───────────────────▼─────────────────────────────────┐
│              CipheyCore (C++)                        │
│    (SWIG bindings for Python integration)            │
└─────────────────────────────────────────────────────┘
```

### Core Modules

#### 1. Searchers
Implement AI algorithms to determine decryption paths:

- **AuSearch (Augmented Search)** - Default tree-based search algorithm
  - Uses heuristics based on likelihood and computational cost
  - Prioritizes common CTF encodings (Base64, hex) over rare ones
  - Employs Shannon entropy to guide search direction
  - Multi-threaded parallel execution

- **A\* Search** - Planned implementation (in development)
- **Perfection** - Exhaustive search (slower but comprehensive)
- **Imperfection** - Optimized variant

**Location**: `ciphey/basemods/Searchers/`

#### 2. Decoders
Handle transformations requiring no key (1-to-1 mappings):

**Base Encodings** (14 variants):
- Binary, Octal, Decimal, Hexadecimal
- Base32, Base58 (Bitcoin/Flickr/Ripple), Base62, Base64 (standard + URL)
- Base69, Base85, Base91, Base65536

**Text Encodings** (11 variants):
- Morse Code, Atbash, A1Z26 (alphabet position)
- Leetspeak, Reversed text, URL encoding
- UUencode, Braille

**Specialized** (8 variants):
- DNA codons, Galactic Alphabet (Minecraft)
- Baudot ITA2, SMS Multi-tap, DTMF, Tap Code
- Brainfuck (esoteric language), GZip compression

**Location**: `ciphey/basemods/Decoders/`

**Interface**:
```python
class Decoder:
    def decode(ctext: T) -> Optional[U]
    def priority() -> float  # 0.0-1.0 likelihood in CTFs
    def getTarget() -> str   # Identifier
```

#### 3. Crackers
Tackle key-based ciphers requiring brute force or analysis:

- **Caesar/ROT Variants** - ROT1-25, ROT47, ROT94
- **Vigenère** - Polyalphabetic substitution with keyword
- **Affine** - Mathematical cipher (ax + b mod 26)
- **XOR** - Single-byte and multi-byte repeating-key XOR
- **Baconian** - Steganographic binary cipher
- **ASCII Shift** - Extended ASCII rotation
- **Soundex** - Phonetic encoding
- **Hash** - Lookup-based (currently disabled)

**Location**: `ciphey/basemods/Crackers/`

**Interface**:
```python
class Cracker:
    def attemptCrack(ctext: T) -> List[CrackResult]
    def getInfo(ctext: T) -> CrackInfo  # Success likelihood + runtime
    def getTarget() -> str
```

#### 4. Checkers
Validate whether decryption output is actual plaintext:

- **Brandon** - English language detector (primary)
  - Three-tier word list: stop words, top 1000, full dictionary
  - Threshold: ~35% match rate
  - Handles slang, usernames, unconventional text

- **Quadgrams** - Statistical analysis of 4-letter sequences
- **Regex** - Pattern matching (CTF flags, custom patterns)
- **Format** - JSON validation using `json.loads()`
- **PyWhat** - 100+ specialized patterns (IPs, emails, crypto addresses)
- **G-test** - Goodness-of-fit statistical test
- **Human** - Interactive confirmation for uncertain results
- **Entropy** - Shannon entropy validation

**Location**: `ciphey/basemods/Checkers/`

**Interface**:
```python
class Checker:
    def check(ctext: T) -> Optional[str]  # Returns check_res or None
    def getExpectedRuntime(text: T) -> float
```

### AuSearch Algorithm Deep Dive

The AuSearch (Augmented Search) algorithm is Ciphey's core innovation:

```python
# Simplified pseudocode
def ausearch(ciphertext):
    # 1. Initialize work queue with priority ordering
    work_queue = PriorityWorkQueue()

    # 2. Create root node
    root = Node(ciphertext)

    # 3. Check if input is already plaintext
    if checker(ciphertext):
        return ciphertext

    # 4. Expand root with decoders and crackers
    recursive_expand(root)

    # 5. Process work queue
    while not work_queue.empty():
        chunk = work_queue.get_work_chunk()
        chunk.sort(key=lambda edge: edge.score)

        for edge in reversed(chunk):  # Highest score first
            result = edge.route(edge.source.result)
            if result:
                for candidate in result:
                    node = create_node(candidate)
                    if checker(candidate):
                        return trace_path(node)
                    recursive_expand(node)

    return None  # Failed to decrypt
```

**Key Features**:
1. **Priority-based exploration** - Common encodings checked first
2. **Shannon entropy guidance** - Lower entropy = closer to plaintext
3. **Deduplication** - Cache tracks seen ciphertexts to prevent cycles
4. **Depth limiting** - Configurable max depth (default: unlimited)
5. **Parallel checking** - Multiple checkers run simultaneously

**Configuration Parameters**:
```yaml
searcher: ausearch
params:
  ausearch:
    enable_nested: false        # Nested ciphers (slow, may not terminate)
    invert_priority: false      # Check complex encodings first
    max_cipher_depth: 0         # 0 = unlimited
    max_depth: 0                # 0 = unlimited
    priority_cap: 2             # Max depth for ordering
    p_threshold: 0.01           # Skip crackers below this likelihood
```

### Registry System

Ciphey uses a decorator-based registry pattern for module discovery:

```python
from ciphey.iface import registry

@registry.register
class MyDecoder(Decoder[str]):
    # Implementation
    pass

# Modules auto-register at import time
# Retrieved via: registry[Decoder[str]]
```

**Benefits**:
- Automatic module discovery
- Type-safe retrieval
- Easy plugin development
- No manual registration needed

---

## AI/ML Components

### Cipher Detection Intelligence

Ciphey employs multiple AI/ML techniques:

#### 1. Neural Network Classification
- **Training Data**: Harry Potter corpus and other English texts
- **Output**: Probability distribution across cipher types
- **Example**: "81% SHA1, 15% Base64, 1% Caesar"
- **Usage**: Prioritizes high-probability decryption attempts

#### 2. Statistical Analysis
- **Frequency Analysis** - Letter/bigram/trigram frequencies
- **Chi-squared Test** - Compares against expected English distribution
- **Index of Coincidence** - Measures text randomness
- **Quadgram Scoring** - Common 4-letter sequence detection

#### 3. Pattern Recognition (PyWhat Integration)
- 100+ compiled regex patterns
- IP addresses, email formats
- Cryptocurrency addresses
- API keys, tokens
- Custom extensible patterns

#### 4. Shannon Entropy Calculation
```python
import math

def shannon_entropy(data):
    if not data:
        return 0
    entropy = 0
    for x in set(data):
        p_x = data.count(x) / len(data)
        entropy += - p_x * math.log2(p_x)
    return entropy

# Typical values:
# English text: 3.5-4.5 bits/char
# Encrypted data: 5.0-5.5 bits/char
# Random data: ~5.2 bits/char
```

### Language Detection

The Brandon language checker implements sophisticated NLP:

```python
# Three-tier validation
STOP_WORDS = ["the", "is", "and", "to", "a", "in", ...]  # ~150 words
TOP_1000 = [...]  # Most common English words
FULL_DICT = [...]  # Complete dictionary

def check_plaintext(text):
    words = tokenize(text)
    stop_match = count_matches(words, STOP_WORDS)
    top_match = count_matches(words, TOP_1000)
    dict_match = count_matches(words, FULL_DICT)

    # Pass if stop words OR top 1k match
    if (stop_match / len(words) > 0.35) or (top_match / len(words) > 0.35):
        # Verify with full dictionary
        if dict_match / len(words) > 0.35:
            return True
    return False
```

**Development Process**:
- ~200 million test cases
- One month of optimization
- Tested against large English corpora
- Tuned for CTF-specific text patterns

---

## Supported Ciphers and Encodings

### Complete Cipher Support Matrix

#### Classical Substitution Ciphers

| Cipher | Type | Keyspace | Detection Method | Speed |
|--------|------|----------|------------------|-------|
| Caesar | Monoalphabetic | 25 keys | Frequency analysis | < 1ms |
| ROT13 | Caesar variant | 1 key | Direct check | < 1ms |
| ROT47 | ASCII rotation | 94 keys | Frequency + ASCII | < 1ms |
| Atbash | Reverse alphabet | 1 key | Pattern recognition | < 1ms |
| Affine | Mathematical | 312 keys | Statistical analysis | ~10ms |
| Baconian | Binary steganography | None | Pattern matching | ~5ms |

#### Polyalphabetic Ciphers

| Cipher | Complexity | Attack Method | Average Runtime |
|--------|-----------|---------------|-----------------|
| Vigenère | Variable key length | Kasiski + dict attack | 100-500ms |
| Soundex | Phonetic encoding | Reverse lookup | ~10ms |

#### Modern Encoding Schemes

**Base Encodings**:
```
Base2    → Binary (01010101...)
Base8    → Octal (157 167...)
Base10   → Decimal (72 101 108...)
Base16   → Hexadecimal (48656C6C6F)
Base32   → RFC 4648 (JBSWY3DPEBLW64TMMQ======)
Base58   → Bitcoin/Flickr/Ripple variants
Base62   → Alphanumeric [0-9A-Za-z]
Base64   → Standard + URL-safe variants
Base69   → Nice meme encoding
Base85   → ASCII85 / Z85 variants
Base91   → High-density encoding
Base65536 → Unicode-based (最敬的)
```

**Text Transformations**:
```
Morse Code   → ... --- ...
A1Z26        → 8-5-12-12-15 (H-E-L-L-O)
Leetspeak    → h3ll0 w0rld
Reversed     → dlrow olleh
URL Encoding → %48%65%6C%6C%6F
UUencode     → begin 644 file.txt
Braille      → ⠓⠑⠇⠇⠕
```

**Specialized Formats**:
```
DNA Codons           → ATCGATCG...
Galactic Alphabet    → ᔑ⍑𝙹 ᒲᒷ ||𝙹⚍∷ リᒷ∷↸ ᓵ∷ᒷ↸
Baudot ITA2          → Telegraph encoding
SMS Multi-tap        → 44-33-555-555-666 (HELLO)
DTMF                 → Touch-tone phone encoding
Tap Code             → Prisoner communication cipher
Brainfunk            → +++++++++[>+++++++++<-]>...
GZip                 → Compression detection/decompression
```

#### XOR Variants

| Variant | Key Space | Detection | Performance |
|---------|-----------|-----------|-------------|
| Single-byte XOR | 256 keys | Frequency + entropy | < 5ms |
| Multi-byte XOR | Variable | xortool integration | 50-200ms |
| Repeating-key XOR | Dictionary-based | Key length + Hamming | 100-500ms |

### Hash Support (Currently Disabled)

**Primary Hash Types**:
- MD5 (128-bit)
- SHA-1 (160-bit)
- SHA-256 (256-bit)
- SHA-384 (384-bit)
- SHA-512 (512-bit)

**Additional Types**: 267 hash variants supported via external lookup services

**Status**: Disabled due to external API reliability issues

**Functionality**: Lookup-based (not actual cracking)

---

## Installation and Usage

### Installation Methods

#### 1. pip (Primary Method)

```bash
# Install latest version
python3 -m pip install ciphey --upgrade

# Verify installation
ciphey --version
```

**Requirements**:
- Python 3.7-3.8 (Windows)
- Python 3.7-3.9 (Linux/macOS)
- 64-bit Python only (Windows defaults to 32-bit!)
- Python 3.10+ not supported

#### 2. Docker (Recommended for Isolation)

```bash
# Interactive mode
docker run -it --rm remnux/ciphey

# Direct decryption
docker run -it --rm remnux/ciphey "SGVsbG8gV29ybGQ="

# File input
docker run -i --rm remnux/ciphey < encrypted.txt
```

#### 3. Homebrew (macOS/Linux)

```bash
brew install ciphey
```

#### 4. MacPorts (macOS)

```bash
sudo port install ciphey
```

### CLI Usage

#### Basic Invocation

```bash
# Three input methods:
ciphey -t "encrypted text"           # Direct text
ciphey -f encrypted.txt              # File input
echo "encrypted" | ciphey            # Pipe input
ciphey -- "encrypted text"           # Unqualified argument
```

#### Advanced Options

```bash
# Quiet mode (remove progress bars)
ciphey -t "text" -q

# Greppable output (only answer)
ciphey -t "text" -g

# Verbose debug output
ciphey -t "text" -vvv

# Custom checker
ciphey -t "flag{...}" -C regex -p "regex.regex=flag{.*}"

# Custom wordlist
ciphey -t "text" -w /path/to/wordlist.txt

# Load external module
ciphey -t "text" -m /path/to/module.py

# Binary mode
ciphey -f binary_file.bin -b
```

#### Configuration File

Location: `~/.config/ciphey/config.yml` (Linux/macOS) or `%APPDATA%\ciphey\config.yml` (Windows)

```yaml
# Find config path
$ ciphey -A

# Example config.yml
verbosity: 0
searcher: ausearch
checker: brandon
params:
  ausearch:
    enable_nested: false
    max_depth: 10
  brandon:
    wordlist: /path/to/custom/wordlist.txt
```

### Python API Usage

#### Basic API

```python
from ciphey.ciphey import decrypt
from ciphey.iface import Config

# Simple decryption
config = Config().library_default().complete_config()
result = decrypt(config, "SGVsbG8gV29ybGQ=")
print(result)  # "Hello World"
```

#### Advanced API with Custom Configuration

```python
from ciphey.iface import Config
from ciphey.ciphey import decrypt

# Custom configuration
config = Config()
config.verbosity = -1  # Quiet mode
config.searcher = "ausearch"
config.checker = "regex"
config.params = {
    "regex": {
        "regex": "HTB{.*}"  # Match HTB flags
    },
    "ausearch": {
        "max_depth": 5
    }
}
config.complete_config()

# Decrypt with timeout handling
import signal

def timeout_handler(signum, frame):
    raise TimeoutError("Decryption timeout")

signal.signal(signal.SIGALRM, timeout_handler)
signal.alarm(10)  # 10-second timeout

try:
    result = decrypt(config, ciphertext)
    signal.alarm(0)  # Cancel alarm
    print(f"Decrypted: {result}")
except TimeoutError:
    print("Decryption timed out")
```

#### Integration Example

```python
import ciphey
from ciphey.iface import Config

class CipherAnalyzer:
    def __init__(self):
        self.config = Config().library_default()
        self.config.verbosity = -1
        self.config.complete_config()

    def analyze(self, data):
        """Analyze potentially encoded data."""
        try:
            result = ciphey.decrypt(self.config, data)
            if result and result != "Failed to crack":
                return {
                    "success": True,
                    "plaintext": result,
                    "encoding": "auto-detected"
                }
        except Exception as e:
            pass

        return {
            "success": False,
            "error": "Could not decrypt"
        }

# Usage
analyzer = CipherAnalyzer()
result = analyzer.analyze("aGVsbG8gd29ybGQ=")
```

---

## Integration Guidance for CyberChef-MCP

### Complementary Strengths

| Feature | CyberChef-MCP | Ciphey | Integration Benefit |
|---------|---------------|--------|---------------------|
| **Approach** | Explicit operations | Auto-detection | Ciphey provides intelligence layer |
| **Coverage** | 300+ operations | 50+ auto-detected | Broader combined capability |
| **Performance** | Deterministic recipes | AI search | Best-of-both scenarios |
| **Use Case** | Known transformations | Unknown encodings | Complete workflow coverage |

### Potential Integration Patterns

#### 1. Smart Auto-Decode Operation

Add a `cyberchef_smart_decode` tool that wraps Ciphey using secure subprocess execution:

```javascript
// MCP server enhancement
import { execFileNoThrow } from '../utils/execFileNoThrow.js';

async function smart_decode(input, maxDepth = 5, timeout = 10) {
  const args = ['-t', input, '-g', '-q'];

  if (maxDepth) {
    args.push('-p', `ausearch.max_depth=${maxDepth}`);
  }

  try {
    const result = await execFileNoThrow('ciphey', args, {
      timeout: timeout * 1000,
      maxBuffer: 1024 * 1024 // 1MB
    });

    if (result.status === 0) {
      return {
        success: true,
        result: result.stdout.trim(),
        method: 'auto-detected'
      };
    } else {
      return {
        success: false,
        result: input,
        error: result.stderr || 'Could not auto-decode'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Tool definition
{
  name: "cyberchef_smart_decode",
  description: "Automatically detect and decode unknown encoding using AI",
  inputSchema: {
    type: "object",
    properties: {
      input: {
        type: "string",
        description: "Encoded/encrypted text to auto-decode"
      },
      max_depth: {
        type: "number",
        description: "Maximum decoding depth (default: 5)",
        default: 5
      },
      timeout: {
        type: "number",
        description: "Timeout in seconds (default: 10)",
        default: 10
      }
    },
    required: ["input"]
  }
}
```

#### 2. Hybrid Workflow: Ciphey → CyberChef

**Scenario**: Use Ciphey for auto-detection, then refine with CyberChef operations

```python
def hybrid_decode(ciphertext):
    # Step 1: Try Ciphey auto-detection
    ciphey_result = attempt_ciphey(ciphertext)

    if ciphey_result.success:
        return ciphey_result

    # Step 2: Fall back to CyberChef explicit operations
    # Try common CTF patterns
    recipes = [
        ["From_Base64"],
        ["From_Hex"],
        ["ROT13"],
        ["From_Base64", "ROT13"],
        ["From_Hex", "From_Base64"]
    ]

    for recipe in recipes:
        result = cyberchef_bake(ciphertext, recipe)
        if is_plaintext(result):
            return result

    return "Failed to decode"
```

#### 3. Encoding Detection Service

Expose Ciphey's detection without decryption:

```javascript
{
  name: "cyberchef_detect_encoding",
  description: "Identify the likely encoding type without decrypting",
  inputSchema: {
    type: "object",
    properties: {
      input: { type: "string" },
      top_n: {
        type: "number",
        description: "Return top N most likely encodings",
        default: 3
      }
    }
  }
}

// Returns:
{
  "encodings": [
    { "type": "base64", "confidence": 0.95 },
    { "type": "hex", "confidence": 0.03 },
    { "type": "rot13", "confidence": 0.02 }
  ]
}
```

#### 4. CTF Challenge Solver

Create a meta-tool combining both systems:

```python
def solve_ctf_challenge(input_data, flag_pattern=None):
    """
    Comprehensive CTF challenge solver.

    1. Try Ciphey auto-detection
    2. If that fails, try CyberChef common recipes
    3. Extract flags matching pattern
    """

    # Phase 1: Ciphey auto-solve
    ciphey_config = Config()
    if flag_pattern:
        ciphey_config.checker = "regex"
        ciphey_config.params = {
            "regex": {"regex": flag_pattern}
        }
    ciphey_config.complete_config()

    result = ciphey.decrypt(ciphey_config, input_data)
    if result != "Failed to crack":
        return extract_flags(result, flag_pattern)

    # Phase 2: CyberChef systematic approach
    for recipe in CTF_RECIPES:
        cyberchef_result = bake(input_data, recipe)
        flags = extract_flags(cyberchef_result, flag_pattern)
        if flags:
            return flags

    return None

# MCP tool wrapper
{
  name: "cyberchef_solve_ctf",
  description: "Solve CTF challenge using hybrid Ciphey + CyberChef approach",
  inputSchema: {
    properties: {
      input: { type: "string" },
      flag_pattern: {
        type: "string",
        description: "Regex pattern for flag (e.g., 'HTB{.*}')",
        default: null
      }
    }
  }
}
```

### API Integration Approaches

#### Option 1: Docker Container Bridge

Run Ciphey in Docker alongside MCP server:

```dockerfile
# Dockerfile.hybrid
FROM node:22-alpine AS mcp
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY src/ ./src/

FROM python:3.9-alpine AS ciphey
RUN pip install ciphey

FROM node:22-alpine
COPY --from=mcp /app /app
COPY --from=ciphey /usr/local/lib/python3.9/site-packages /python
ENV PYTHONPATH=/python
RUN apk add --no-cache python3 py3-pip
RUN pip install ciphey
WORKDIR /app
CMD ["node", "src/node/mcp-server.mjs"]
```

#### Option 2: Python Bridge Module

Create a Node-Python bridge using secure subprocess execution:

```javascript
// lib/ciphey-bridge.mjs
import { execFileNoThrow } from '../utils/execFileNoThrow.js';

export class CipheyBridge {
  async decrypt(ciphertext, options = {}) {
    const args = ['-t', ciphertext, '-g', '-q'];

    if (options.checker) {
      args.push('-C', options.checker);
    }
    if (options.maxDepth) {
      args.push('-p', `ausearch.max_depth=${options.maxDepth}`);
    }

    return this._execute('ciphey', args, options.timeout || 10000);
  }

  async _execute(command, args, timeout) {
    try {
      const result = await execFileNoThrow(command, args, {
        timeout,
        maxBuffer: 1024 * 1024
      });

      if (result.status === 0) {
        return result.stdout.trim();
      } else {
        throw new Error(result.stderr || 'Execution failed');
      }
    } catch (error) {
      throw new Error(`Ciphey execution error: ${error.message}`);
    }
  }
}
```

#### Option 3: REST API Wrapper

Deploy Ciphey as a microservice:

```python
# ciphey-api.py
from flask import Flask, request, jsonify
import ciphey
from ciphey.iface import Config
import signal

app = Flask(__name__)

@app.route('/decrypt', methods=['POST'])
def decrypt():
    data = request.json
    ciphertext = data.get('ciphertext')
    timeout = data.get('timeout', 10)

    def timeout_handler(signum, frame):
        raise TimeoutError()

    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(timeout)

    try:
        config = Config().library_default()
        config.verbosity = -1
        config.complete_config()

        result = ciphey.decrypt(config, ciphertext)
        signal.alarm(0)

        return jsonify({
            'success': True,
            'plaintext': result,
            'encoding': 'auto-detected'
        })
    except TimeoutError:
        return jsonify({
            'success': False,
            'error': 'Timeout'
        }), 408
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(port=5001)
```

Then call from MCP server:

```javascript
// In mcp-server.mjs
async function callCipheyAPI(ciphertext, timeout = 10) {
  const response = await fetch('http://localhost:5001/decrypt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ciphertext, timeout })
  });
  return await response.json();
}
```

### Recommended Integration Architecture

```
┌────────────────────────────────────────────────┐
│          MCP Client (Claude/IDE)               │
└────────────────┬───────────────────────────────┘
                 │ MCP Protocol (stdio)
┌────────────────▼───────────────────────────────┐
│         CyberChef MCP Server                   │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ cyberchef_<operation> tools (300+)       │  │
│  ├──────────────────────────────────────────┤  │
│  │ cyberchef_bake (recipe execution)        │  │
│  ├──────────────────────────────────────────┤  │
│  │ cyberchef_smart_decode (NEW)             │  │
│  │   ├─ Try Ciphey auto-detection           │  │
│  │   └─ Fallback to CyberChef recipes       │  │
│  ├──────────────────────────────────────────┤  │
│  │ cyberchef_detect_encoding (NEW)          │  │
│  │   └─ Return encoding probabilities       │  │
│  └──────────────────────────────────────────┘  │
│                 │                               │
│                 ├─────────┬─────────────┐       │
│                 │         │             │       │
│          ┌──────▼─────┐  │      ┌──────▼────┐  │
│          │ CyberChef  │  │      │  Ciphey   │  │
│          │ Node API   │  │      │  Bridge   │  │
│          └────────────┘  │      └───────────┘  │
│                           │             │       │
└───────────────────────────┼─────────────┼───────┘
                            │             │
                     ┌──────▼─────┐  ┌────▼─────┐
                     │ CyberChef  │  │ Ciphey   │
                     │ Core Ops   │  │ Python   │
                     └────────────┘  └──────────┘
```

**Benefits**:
1. Seamless user experience (single MCP interface)
2. Best-of-both: explicit operations + auto-detection
3. Graceful degradation (Ciphey timeout → CyberChef fallback)
4. Enhanced CTF/forensics capabilities

---

## Performance Characteristics

### Benchmarks

#### Decryption Speed (on modern hardware)

| Scenario | Input Size | Time | Method |
|----------|-----------|------|--------|
| Single Base64 | 1 KB | < 0.1s | Direct decode |
| 42-layer Base64 | 1 KB | 2s | Recursive AuSearch |
| Caesar cipher | 1 KB | < 0.1s | Frequency analysis |
| Vigenère (5-char key) | 1 KB | 0.3s | Kasiski + dict attack |
| Large file | 6 GB | 5m 54s | Streaming decode |

#### Comparison: Ciphey vs CyberChef

| Test | Ciphey | CyberChef |
|------|--------|-----------|
| 42x Base64 | 2s (auto) | 6s (manual recipe) |
| Unknown encoding | 1-3s | N/A (requires manual) |
| Known Base64 | 0.1s | 0.1s |
| Large files | 5:54 (6GB) | Crashes |

### Resource Usage

```
CPU: 1-4 cores (multi-threaded AuSearch)
Memory: 50-200 MB (depending on wordlist size)
Disk: 20 MB (base install) + 50 MB (cipheydists)
Network: None (fully offline operation)
```

### Optimization Tips

1. **Limit search depth** for faster results:
   ```bash
   ciphey -t "text" -p "ausearch.max_depth=3"
   ```

2. **Use specific checkers** to reduce overhead:
   ```bash
   ciphey -t "flag{...}" -C regex -p "regex.regex=flag{.*}"
   ```

3. **Disable nested ciphers** unless necessary:
   ```bash
   ciphey -t "text" -p "ausearch.enable_nested=false"
   ```

4. **Custom wordlist** for domain-specific text:
   ```bash
   ciphey -t "text" -w /path/to/domain_wordlist.txt
   ```

---

## Limitations and Security Scope

### What Ciphey CAN Decrypt

- **Classical ciphers**: Caesar, Vigenère, Affine, transposition
- **Simple encodings**: Base64, hex, binary, Morse code
- **Weak XOR**: Single-byte, short repeating keys
- **Obfuscation**: Leetspeak, reversed text, ROT variants
- **CTF challenges**: Multi-layer encoding combinations

### What Ciphey CANNOT Decrypt

#### Modern Cryptography (Mathematically Infeasible)
- **AES** (128/256-bit) - Would require more energy than exists in the solar system
- **RSA** - Public-key cryptography with proper key sizes
- **Elliptic Curve** - ECDSA, ECDH, Ed25519
- **TLS/HTTPS** - Secure network protocols
- **PGP/GPG** - Email encryption
- **Signal/WhatsApp** - End-to-end encrypted messaging
- **Modern hashes** - SHA-256 (without rainbow tables)

#### Properly Implemented Systems
Any cryptographic system using:
- Sufficient key length (128+ bits)
- Modern algorithms (post-2000)
- Proper random number generation
- Authenticated encryption (GCM, ChaCha20-Poly1305)

### Known Failure Cases

#### 1. Plaintext Detection Issues

```python
# FAILS - Underscores create single "word"
ciphey -t "hello_my_name_is_emily"
# Brandon checker sees "hello_my_name_is_emily" as unknown word

# FAILS - Non-English text
ciphey -t "Bonjour le monde"
# No French language support

# FAILS - Small samples
ciphey -t "hi"
# Too short for statistical analysis

# FAILS - Ambiguous output
ciphey -t "aGVsbG8="  # "hello" in Base64
# Could also be valid as Caesar shift
```

#### 2. Encoding Ambiguity

Some ciphertexts have multiple valid plaintexts:

```
Input: "URYYB"
- ROT13 → "HELLO" ✓
- Atbash → "FIQQB" ✗
- Caesar+10 → "EBYYY" ✗

Ciphey picks first valid result (ROT13)
May miss alternative interpretations
```

#### 3. Infinite Loops

Without timeout, Ciphey can hang indefinitely:

```python
# Problematic inputs:
- Novel encoding schemes not in database
- Deeply nested ciphers (enable_nested=true)
- Ambiguous multi-step transformations
- Large keyspaces without early termination

# Solution: Always use timeout wrapper
```

#### 4. False Positives

Ciphey's 35% threshold allows false positives:

```
Input: "VGhlIHF1aWNrIGJyb3duIGZveCBqdW1wcyBvdmVyIHRoZSBsYXp5IGRvZw=="
Decodes to: "The quick brown fox jumps over the lazy dog"

But also try:
Input: random_bytes
Sometimes produces "valid" English by chance
```

### Security Implications

#### For Defenders
If Ciphey successfully decrypts your data:
- Your encoding scheme is **weak and obsolete**
- Replace with modern cryptography (AES-256-GCM, ChaCha20-Poly1305)
- Use proper key management (KMS, HSM, secrets management)

#### For Attackers
Ciphey indicates:
- Target uses classical/weak ciphers
- CTF-style challenges ahead
- Further analysis needed for modern crypto

#### The "Cryptanalysis Thermometer"
```
Ciphey Success = Weak Encoding (Historical Interest Only)
Ciphey Failure ≠ Strong Encryption (Could be unknown encoding)

For Real Security:
├─ Use vetted cryptographic libraries (NaCl, libsodium)
├─ Follow NIST/OWASP guidelines
├─ Regular security audits
└─ Threat modeling
```

---

## Development and Extensibility

### Creating Custom Modules

#### Custom Decoder Example

```python
# my_decoder.py
from ciphey.iface import Decoder, ParamSpec, registry
from typing import Optional, Dict

@registry.register
class MyCustomDecoder(Decoder[str]):
    """Decode custom Base32 variant."""

    def decode(self, ctext: str) -> Optional[str]:
        """Attempt to decode custom encoding."""
        try:
            # Your decoding logic
            import base64
            decoded = base64.b32decode(ctext.upper())
            return decoded.decode('utf-8')
        except Exception:
            return None

    @staticmethod
    def priority() -> float:
        """Return 0.0-1.0 likelihood in CTFs."""
        return 0.5  # Medium priority

    @staticmethod
    def getParams() -> Optional[Dict[str, ParamSpec]]:
        """Define configurable parameters."""
        return {
            "padding": ParamSpec(
                desc="Padding character",
                req=False,
                default="="
            )
        }

    def __init__(self, config):
        super().__init__(config)
        self.padding = self._params()["padding"]
```

#### Custom Cracker Example

```python
# my_cracker.py
from ciphey.iface import Cracker, CrackInfo, CrackResult, registry
from typing import List

@registry.register
class MyCustomCracker(Cracker[str]):
    """Crack custom substitution cipher."""

    def getInfo(self, ctext: str) -> CrackInfo:
        """Estimate success likelihood and runtime."""
        # Analyze ciphertext characteristics
        likelihood = self._estimate_likelihood(ctext)

        return CrackInfo(
            success_likelihood=likelihood,
            success_runtime=0.01,  # 10ms average
            failure_runtime=0.001  # 1ms on failure
        )

    def attemptCrack(self, ctext: str) -> List[CrackResult]:
        """Attempt to crack the cipher."""
        results = []

        # Try different keys/approaches
        for key in self._generate_keys():
            plaintext = self._decrypt(ctext, key)
            results.append(CrackResult(
                value=plaintext,
                key_info=key
            ))

        return results

    @staticmethod
    def getTarget() -> str:
        """Return identifier."""
        return "my_custom_cipher"

    def _estimate_likelihood(self, ctext):
        # Statistical analysis
        return 0.5

    def _generate_keys(self):
        # Key generation logic
        return range(26)

    def _decrypt(self, ctext, key):
        # Decryption logic
        return ctext
```

#### Loading Custom Modules

```bash
# Command line
ciphey -t "encrypted" -m /path/to/my_decoder.py -m /path/to/my_cracker.py

# Python API
from ciphey.iface import Config
import importlib.util

config = Config()
config.modules = ['/path/to/my_decoder.py']
config.complete_config()
```

### Plugin System Architecture

```python
# Plugin discovery mechanism
class Registry:
    _registry: Dict[type, List[type]] = {}

    @classmethod
    def register(cls, module_class):
        """Decorator for auto-registration."""
        base_class = module_class.__bases__[0]
        cls._registry.setdefault(base_class, []).append(module_class)
        return module_class

    @classmethod
    def __getitem__(cls, key):
        """Retrieve modules by type."""
        return cls._registry.get(key, [])

# Usage in AuSearch
decoders = registry[Decoder[str]]
crackers = registry[Cracker[str]]
```

---

## Successor: Ares (Rust-based)

### Transition from Python to Rust

| Aspect | Ciphey (Python) | Ares (Rust) |
|--------|-----------------|-------------|
| **Version** | 5.14.1 (June 2021) | 0.11.0 (March 2025) |
| **Status** | Maintenance mode | Active development |
| **Speed** | Baseline | 700% faster |
| **Algorithm** | AuSearch | A\* search |
| **Timeout** | Manual wrapper needed | Built-in 5s default |
| **Detection** | Statistical + NLP | Optional BERT ML (~40% better) |
| **Decoders** | 33 | 16 (targeting 50+) |
| **Dependencies** | Python + C++ | Pure Rust |

### Why Rust?

1. **Memory Safety** - No segfaults, buffer overflows
2. **Performance** - Zero-cost abstractions, LLVM optimization
3. **Concurrency** - Safe parallelism via Rayon
4. **Deployment** - Single static binary
5. **Ecosystem** - Modern dependency management (Cargo)

### Installation (Ares)

```bash
# Via Cargo
cargo install ciphey

# Via Docker
docker pull ciphey/ciphey:latest

# Verify
ciphey --version
```

### API Differences

```rust
// Ares Rust API
use ciphey::{Ciphey, Config};

fn main() {
    let config = Config::default()
        .timeout(5)
        .max_depth(10);

    let ciphey = Ciphey::new(config);

    match ciphey.decrypt("SGVsbG8gV29ybGQ=") {
        Ok(result) => println!("Decrypted: {}", result),
        Err(e) => eprintln!("Failed: {}", e),
    }
}
```

### Migration Path

For users:
1. Test workloads with both Ciphey and Ares
2. Identify any Ciphey-specific features needed
3. Transition to Ares for new projects
4. Keep Ciphey available for legacy workflows

For integrators:
1. Abstract Ciphey interface (bridge pattern)
2. Support both backends during transition
3. Feature-flag Ares when decoder coverage matches
4. Monitor performance improvements

---

## Comparison with Other Tools

### dCode.fr

| Feature | Ciphey | dCode.fr |
|---------|--------|----------|
| **Approach** | CLI automation | Web-based manual |
| **Ciphers** | 50+ | 200+ |
| **Auto-decrypt** | Yes (full) | Partial (identifies) |
| **Offline** | Yes | No |
| **API** | Python | None |
| **Speed** | Fast | Slow (server-side) |

**Use dCode.fr when**: Need obscure historical ciphers, prefer web UI, reference material needed

### Katana

**Katana** is a Python-based CTF automation framework (https://github.com/JohnHammond/katana)

| Feature | Ciphey | Katana |
|---------|--------|--------|
| **Focus** | Cryptography | Multi-purpose CTF |
| **Automation** | Cipher-specific | General reconnaissance |
| **Modules** | 50+ crypto | 100+ multi-domain |
| **Stealth** | N/A | Stealthy scanning |
| **Web** | No | Yes (XSS, SQLi, etc.) |

**Use Katana when**: Full CTF challenge automation needed, web vulnerabilities, forensics

### Hashcat / John the Ripper

| Feature | Ciphey | Hashcat | John the Ripper |
|---------|--------|---------|-----------------|
| **Purpose** | Cipher detection | Hash cracking | Password recovery |
| **GPU** | No | Yes (OpenCL/CUDA) | Limited |
| **Hash Types** | Lookup (272) | Cracking (400+) | 200+ |
| **Wordlists** | English dict | Custom | Custom |
| **Attack Modes** | Auto | Brute/Mask/Rule | Incremental/Wordlist |

**Key Difference**: Ciphey **identifies** encodings/hashes. Hashcat/John **crack** password hashes via compute.

### CyberChef Magic

| Feature | Ciphey | CyberChef Magic |
|---------|--------|-----------------|
| **Depth** | Multi-layer | Single-layer |
| **Encryption** | Yes | No |
| **Hashes** | Yes | No |
| **Reliability** | Stable | Crashes on complex |
| **Setup** | None | Manual recipe |

**Magic Limitation**: Fails on nested/complex encodings, requires manual recipe fallback

---

## Best Practices

### When to Use Ciphey

1. **CTF Challenges**: Unknown encoding in capture-the-flag
2. **Quick Analysis**: Need rapid cipher identification
3. **Multi-layer Encodings**: Nested Base64/ROT13/etc combinations
4. **Forensics**: Encoded artifacts in malware/logs
5. **Learning**: Understanding classical cryptography

### When NOT to Use Ciphey

1. **Modern Crypto**: AES, RSA, ECC (mathematically infeasible)
2. **Known Encodings**: Use direct tools (faster than auto-detection)
3. **Non-English**: No support for other languages
4. **Production Systems**: Not intended for security auditing
5. **Brute-force Needs**: Use Hashcat/John for password cracking

### Security Considerations

#### For Blue Team
- Ciphey success = Immediate remediation needed
- Replace classical ciphers with modern crypto
- Audit systems for weak encoding schemes
- Use as validation tool (should fail on proper encryption)

#### For Red Team
- Quick reconnaissance of encoded strings
- CTF challenge solving
- Malware analysis assistance
- Educational demonstrations

#### Responsible Use
```
DO:
✓ Analyze your own systems
✓ CTF competitions
✓ Educational purposes
✓ Bug bounty (in scope)

DON'T:
✗ Unauthorized decryption
✗ Privacy violations
✗ Bypass access controls
✗ Illegal activities
```

### Performance Optimization

```bash
# Fast mode (3-second max)
ciphey -t "text" -p "ausearch.max_depth=2"

# CTF flag mode (regex checker)
ciphey -t "encoded" -C regex -p "regex.regex=HTB{.*}"

# Large file (streaming)
ciphey -f large_file.txt -q

# Timeout wrapper (Python)
import signal
signal.alarm(10)  # 10-second timeout
```

---

## Conclusion

Ciphey represents a significant advancement in automated cryptanalysis for classical ciphers and encodings. Its AI-powered AuSearch algorithm, natural language processing, and C++ performance core enable rapid decryption of CTF challenges and forensic artifacts in seconds.

### Key Takeaways

1. **Scope**: Classical ciphers and encodings only (not modern crypto)
2. **Speed**: 3-second average for most challenges
3. **Automation**: Zero configuration needed for basic use
4. **Extensibility**: Plugin system for custom decoders/crackers
5. **Limitations**: English-only, no modern cryptography, requires timeout wrapper
6. **Future**: Rust-based Ares successor offers 700% speedup

### Integration Opportunities with CyberChef-MCP

Combining Ciphey's auto-detection with CyberChef's 300+ operations creates a powerful hybrid system:

- **Smart Decode Tool**: Auto-detection with CyberChef fallback
- **Encoding Detection**: Probability-based identification
- **CTF Solver**: Hybrid approach for complex challenges
- **Educational Value**: Demonstrate both explicit and implicit approaches

### References

- **GitHub**: https://github.com/Ciphey/Ciphey
- **Documentation**: https://github.com/Ciphey/Ciphey/wiki
- **Discord**: https://discord.gg/zYTM3rZM4T
- **PyPI**: https://pypi.org/project/ciphey/
- **Docker**: https://hub.docker.com/r/remnux/ciphey
- **Ares (Rust)**: https://github.com/Ciphey/Ares

---

*Document Version: 1.0*
*Last Updated: 2025-12-17*
*Ciphey Version Covered: 5.14.1*
*Status: Reference documentation for CyberChef-MCP integration planning*
