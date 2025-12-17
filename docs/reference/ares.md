# Ares (ciphey) Reference Documentation

## Project Overview

**Project Name:** ciphey (repository folder: Ares)

**Description:** Next-generation automated decoding and cipher-breaking tool, successor to the original [Ciphey](https://github.com/ciphey/ciphey) project. Built from the ground up in Rust for performance, extensibility, and reliability.

**Purpose:** Automatically detect and decode various types of encoded or encrypted text without requiring the user to know the encoding scheme. Handles multiple layers of encoding and provides intelligent search algorithms to efficiently navigate the decoding space.

**Author/Maintainer:** Bee (@bee-san on GitHub)

**License:** MIT License

**Repository:** [https://github.com/bee-san/ciphey](https://github.com/bee-san/ciphey)

**Current Version:** 0.12.0

**Language:** Rust (Edition 2021)

### Key Features

- **700% Performance Improvement** - For every decode operation the original Ciphey could perform, ciphey can do approximately 7
- **Library-First Architecture** - Clean API separation enables integration into other tools (Discord bots, web services, etc.)
- **Advanced Search Algorithms** - A* search with heuristics and BFS for systematic exploration
- **Multi-Threading Support** - Native parallel processing via [Rayon](https://github.com/rayon-rs/rayon)
- **Timeout Mechanism** - Prevents infinite processing (5s CLI default, 10s bot default)
- **Enhanced Plaintext Detection** - Optional BERT-based AI model for 40% accuracy improvement
- **Multi-Level Decoding** - Handles encoding chains (e.g., Base64 → Hex → ROT13)
- **Configurable Sensitivity** - Adjustable plaintext detection thresholds for different cipher types
- **Comprehensive Testing** - 120+ tests including unit, integration, and documentation tests

## Technical Details

### Architecture

ciphey uses a modular, extensible architecture built around several core components:

#### 1. Core Library (`src/lib.rs`)

Entry point providing the main API:

```rust
pub fn perform_cracking(text: &str, config: Config) -> Option<DecoderResult>
```

Returns:
- `Some(DecoderResult)` - Contains decoded plaintext and decoder path used
- `None` - Decoding failed or timed out

#### 2. Decoders (`src/decoders/`)

Individual decoder implementations following the `Decoder` trait:

```rust
fn crack(&self, text: &str) -> Vec<String>
```

**Current Decoders (22 total):**

| Decoder | Description |
|---------|-------------|
| A1Z26 | Number-to-letter cipher (A=1, B=2, etc.) |
| Atbash | Hebrew reversal cipher |
| Base32 | Base32 encoding |
| Base58 (Bitcoin) | Bitcoin-style Base58 |
| Base58 (Flickr) | Flickr-style Base58 |
| Base58 (Monero) | Monero cryptocurrency Base58 |
| Base58 (Ripple) | Ripple cryptocurrency Base58 |
| Base64 | Standard Base64 encoding |
| Base65536 | Unicode-based encoding |
| Base91 | Compact ASCII encoding |
| Binary | Binary to ASCII |
| Braille | Braille Unicode patterns |
| Caesar | Caesar cipher (all 26 rotations) |
| Citrix CTX1 | Citrix password encoding |
| Hexadecimal | Hex to ASCII |
| Rail Fence | Transposition cipher |
| Reverse | Simple text reversal |
| ROT47 | ASCII rotation cipher |
| Substitution | Generic substitution ciphers |
| URL Encoding | URL percent-encoding |
| Vigenere | Polyalphabetic cipher |
| Z85 | ZeroMQ's Base85 variant |

#### 3. Checkers (`src/checkers/`)

Plaintext identification system implementing the `Check` trait:

```rust
fn check(&self, text: &str) -> CheckResult
```

**Checker Components:**

- **Athena Checker** - Main orchestrator running checkers in sequence
- **LemmeKnow Checker** - Pattern matching for known formats (IPs, URLs, API keys, etc.)
- **English Checker** - Validates English text using gibberish detection (n-gram analysis)
- **Regex Checker** - User-provided custom patterns
- **Human Checker** - Optional manual verification (interactive mode)
- **Password Checker** - Identifies known passwords from data dumps

#### 4. Search Algorithms (`src/searchers/`)

**A* Search (`astar.rs`):**
- Heuristic-based prioritization using `cipher_identifier` for statistical analysis
- Fast decoders (Base64, Hex) executed first on each node
- Probability-based decoder selection
- Result caching to avoid recalculation
- Search tree pruning for memory management
- Dynamic prioritization based on decoder success rates
- Popular decoder pair tracking (e.g., Base64→Base64)

**BFS (`bfs.rs`):**
- Systematic breadth-first exploration
- Exhaustive search when A* heuristics are unreliable

#### 5. Filtration System (`src/filtration_system/`)

Intelligent decoder selection based on:
- Input text characteristics
- Performance considerations
- User configuration preferences

#### 6. Configuration (`src/config/`)

Global singleton managing:
- Timeout duration
- Human checker toggle
- Verbosity level
- Custom regex patterns
- Enhanced detection (BERT model) settings

#### 7. CLI Interface (`src/cli/`, `src/cli_input_parser/`)

User-facing command-line interface built on [clap](https://crates.io/crates/clap) with features:
- First-run setup wizard
- Theme customization (accessibility support)
- Result formatting and presentation
- Invisible character detection for steganography

### Security Capabilities

1. **Cryptanalysis**
   - Classical cipher breaking (Caesar, Vigenere, Atbash, etc.)
   - Modern encoding detection (Base64, Hex, URL, etc.)
   - Multi-layer encoding unwrapping

2. **Pattern Recognition**
   - API key detection (500+ regex patterns via LemmeKnow)
   - Credential identification
   - MAC addresses, IP addresses, URLs, email addresses
   - Password matching against known data dumps

3. **Steganography Detection**
   - Invisible Unicode character detection (>30% threshold)
   - Hidden data extraction from seemingly normal text

4. **Forensics Support**
   - Automated encoding chain reconstruction
   - Path tracking (decoder sequence logging)
   - Statistical analysis of ciphertext

### Dependencies and Requirements

**Core Dependencies:**
- `rayon` - Parallel processing
- `cipher_identifier` - Statistical cipher identification
- `lemmeknow` - Pattern matching (Rust version of PyWhat, 33x faster)
- `gibberish-or-not` - English plaintext detection with optional BERT model
- `crossbeam` - Concurrent data structures

**Encoding Libraries:**
- `base64`, `base65536`, `base91`, `bs58` (Base58), `z85`, `data-encoding`, `urlencoding`

**Utility:**
- `clap` - CLI argument parsing
- `rusqlite` - Statistics database
- `serde`/`serde_json` - Configuration serialization
- `regex`, `lazy-regex` - Pattern matching
- `colored`, `ansi_term` - Terminal output formatting

**Platform Support:**
- Linux (x86_64)
- macOS (x86_64, aarch64/Apple Silicon)
- Windows (x86_64)

**System Requirements:**
- Rust 2021 edition compiler
- Optional: 500MB for BERT model (enhanced detection)
- Optional: Hugging Face account (enhanced detection model download)

## Integration Guidance for CyberChef-MCP

### Complementary Functionality

**ciphey's Automated Approach vs. CyberChef's Manual Operations:**

| Aspect | ciphey | CyberChef-MCP |
|--------|--------|---------------|
| **Workflow** | Automatic detection and decoding | Manual operation selection and chaining |
| **Use Case** | Unknown encoding schemes | Known transformations |
| **Speed** | Optimized for rapid decoding | Comprehensive operation library |
| **Intelligence** | AI-enhanced plaintext detection | User-driven analysis |

### Potential Integration Points

1. **Pre-Processing Stage**
   - Use ciphey as first-pass decoder before CyberChef operations
   - Automatically unwrap unknown encoding layers
   - Identify optimal CyberChef operation sequence based on ciphey's decoder path

2. **Fallback Mechanism**
   - When CyberChef recipe fails, invoke ciphey for automatic detection
   - Complement CyberChef's 300+ operations with intelligent automation

3. **Hybrid Workflow**
   ```
   Input → ciphey (auto-decode) → CyberChef (specialized operations) → Output
   ```

4. **Pattern Recognition Enhancement**
   - Leverage ciphey's LemmeKnow library for format identification
   - Use detected patterns to suggest CyberChef operations

### Data Format Compatibility

Both tools work with text-based encodings, enabling seamless data exchange:

**Shared Formats:**
- Base64, Base32, Base58 variants, Base91
- Hexadecimal, Binary
- URL encoding
- Caesar cipher, ROT13/47, Atbash
- Vigenere cipher

**CyberChef-Exclusive Operations:**
- AES/DES/RSA encryption
- GZIP/Bzip2/Zlib compression
- Image format operations
- Network protocol parsing
- Blockchain analysis

**ciphey-Exclusive Features:**
- Automatic cipher identification
- Multi-layered unwrapping without user input
- BERT-based plaintext verification
- Decoder success rate learning

### Security Research Workflows

#### Malware Analysis Pipeline

```
1. ciphey: Extract obfuscated strings from malware
   → Automatically decode Base64/Hex/XOR layers

2. CyberChef-MCP: Specialized analysis
   → Parse extracted URLs, IPs, domain names
   → Decrypt configuration blocks
   → Analyze network traffic patterns
```

#### CTF (Capture The Flag) Integration

```
1. CyberChef: Initial reconnaissance
   → File format identification
   → Header extraction

2. ciphey: Automated solver
   → Brute-force common encoding chains
   → Flag pattern detection via regex

3. CyberChef: Final processing
   → Custom transformations
   → Format conversion
```

#### Forensics Workflow

```
1. ciphey: Rapid triage
   → Scan for encoded artifacts
   → Extract credentials/keys

2. CyberChef-MCP: Deep analysis
   → Timeline reconstruction
   → Entropy analysis
   → Hash computation
```

## Use Cases

### 1. Security Research

**Automated Vulnerability Discovery:**
- Decode obfuscated payloads in exploit code
- Extract hardcoded credentials from binaries
- Identify encoding schemes in network traffic

**Example:**
```bash
# Extract and decode JavaScript obfuscation
ciphey "ZXZhbChhdG9iKCdKR1Z1WkQ..." --timeout 10
```

### 2. Red Team Operations

**Command & Control (C2) Analysis:**
- Decode C2 communication protocols
- Unwrap multi-stage malware droppers
- Extract API keys from configuration files

**Steganography Detection:**
- Identify hidden data in text (invisible Unicode)
- Detect encoding chains in seemingly innocent content

**Example:**
```bash
# Analyze suspicious configuration
ciphey "$(cat malware_config.txt)" --verbose
```

### 3. Malware Analysis

**Static Analysis Enhancement:**
- Automatically decode strings table from binaries
- Extract IOCs (Indicators of Compromise) from packed samples
- Identify encryption keys via pattern matching

**Dynamic Analysis Support:**
- Decode runtime-generated strings
- Analyze network callbacks
- Decrypt dropped files

**Multi-Layer Unwrapping:**
```
Malware Sample → ciphey
  Layer 1: Base64 → Layer 2: Hex → Layer 3: XOR
    → Plaintext C2 domain: "malicious-server.com"
```

### 4. Penetration Testing

**Password Recovery:**
- Crack weak encoding of credentials (ROT13, Base64)
- Identify password patterns in configuration files
- Match against known password dumps

**Web Application Security:**
- Decode JWT tokens, session cookies
- Analyze encoded API requests
- Extract hidden parameters from URLs

**Example Workflow:**
```bash
# Decode captured session token
ciphey "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Test for multi-encoded API keys
ciphey --regex "sk-[A-Za-z0-9]{32}" input.txt
```

### 5. Digital Forensics

**Evidence Extraction:**
- Decode timestamped logs
- Extract URLs from browser artifacts
- Recover deleted/encoded messages

**Timeline Reconstruction:**
- Automatic decoding of chronological data
- Correlation of encoded event logs

### 6. CTF Competitions

**Rapid Flag Extraction:**
- Brute-force common CTF encoding chains
- Automatic flag format detection (`flag{...}`, `CTF{...}`)
- Multi-round encoding challenges

**Example:**
```bash
# CTF flag detection with regex
ciphey "U2FsdGVkX1..." --regex "flag\{[^}]+\}"
```

### 7. Threat Intelligence

**IOC Extraction:**
- Decode threat reports with encoded indicators
- Extract malware family signatures
- Identify obfuscated infrastructure

**OSINT Enhancement:**
- Decode paste site dumps
- Extract credentials from leaks
- Analyze underground forum communications

## Advanced Features

### Enhanced Plaintext Detection (BERT Model)

Optional 500MB AI model providing:
- 40% accuracy improvement over n-gram analysis
- Reduced false positives/negatives
- Better handling of technical jargon and specialized text

**Enable:**
```bash
ciphey --enable-enhanced-detection
# Requires Hugging Face account for model download
```

### Custom Themes

Accessibility and visual customization:
```bash
ciphey --theme <theme-name>
```

Supports user-defined color schemes for terminal output.

### Statistics Database

Tracks decoder performance over time via SQLite:
- Success/failure rates per decoder
- Popular decoder pairs
- Average processing times
- Dynamic priority adjustment

### A* Search Optimizations

- **Cipher Identifier Integration** - Statistical probability scoring for decoder selection
- **Popular Pairs Tracking** - Prioritizes known successful chains (e.g., Base64→Base64)
- **Dynamic Prioritization** - Learns from historical success (Caesar > Beaufort)
- **Memory-Aware Pruning** - Limits search tree depth to prevent OOM

## Integration with CyberChef-MCP Development

### Architectural Lessons

1. **Library-First Design**
   - ciphey separates core functionality from CLI (similar to CyberChef's Node API)
   - Enables multiple frontends (CLI, Discord bot, web service)
   - CyberChef-MCP follows this pattern with MCP server wrapping Node API

2. **Timeout Handling**
   - ciphey uses separate thread for timeout enforcement
   - CyberChef-MCP could adopt similar pattern for long-running operations

3. **Result Caching**
   - ciphey caches intermediate results in A* search
   - Potential optimization for CyberChef-MCP's recipe execution

4. **Parallel Processing**
   - ciphey uses Rayon for CPU-bound operations
   - CyberChef-MCP could parallelize independent operations in complex recipes

### Potential MCP Server Extension

**Hypothetical `ciphey_auto_decode` Tool:**

```javascript
// MCP tool definition
{
  name: "ciphey_auto_decode",
  description: "Automatically detect and decode unknown encodings",
  inputSchema: {
    type: "object",
    properties: {
      input: { type: "string" },
      timeout: { type: "number", default: 5 },
      regex: { type: "string", optional: true }
    }
  }
}
```

**Use Case:**
- User provides unknown encoded text
- MCP server calls ciphey library
- Returns decoded result with decoder path
- Suggests equivalent CyberChef recipe for reproducibility

### Complementary Tool Recommendation

For CyberChef-MCP users dealing with unknown encodings:

1. **Manual Workflow** (current): User guesses encoding → tries operations → iterates
2. **Automated Workflow** (with ciphey): Run ciphey → get decoder path → convert to CyberChef recipe

**Example Bridge:**
```python
# Pseudo-code integration
ciphey_result = ciphey.crack("encoded_text")
# Result: ["base64_decoder", "hex_decoder", "rot13_decoder"]

cyberchef_recipe = convert_to_recipe(ciphey_result.decoder_path)
# Recipe: ["From Base64", "From Hex", "ROT13"]
```

## References and Resources

### Official Documentation

- **GitHub Repository:** [https://github.com/bee-san/ciphey](https://github.com/bee-san/ciphey)
- **Blog Post:** [Introducing ciphey](https://skerritt.blog/introducing-ciphey/)
- **Notion Docs:** [Ciphey2 Documentation](https://broadleaf-angora-7db.notion.site/Ciphey2-32d5eea5d38b40c5b95a9442b4425710)
- **Discord Community:** [http://discord.skerritt.blog](http://discord.skerritt.blog)

### Installation

**Cargo (Rust Package Manager):**
```bash
cargo install ciphey
```

**Docker:**
```bash
git clone https://github.com/bee-san/ciphey
cd ciphey
docker build .
```

**From Source:**
```bash
git clone https://github.com/bee-san/ciphey
cd ciphey
cargo build --release
./target/release/ciphey
```

### Testing

```bash
# Run test suite
cargo test

# Run with nextest (faster)
cargo nextest run

# Benchmarks
cargo bench
```

### Related Projects

- **Original Ciphey:** [https://github.com/ciphey/ciphey](https://github.com/ciphey/ciphey) (Python version)
- **LemmeKnow:** [https://github.com/swanandx/lemmeknow](https://github.com/swanandx/lemmeknow) (Pattern identification)
- **PyWhat:** [https://github.com/bee-san/pyWhat](https://github.com/bee-san/pyWhat) (Python predecessor to LemmeKnow)
- **cipher_identifier:** Rust crate for statistical cipher identification

## Comparison: ciphey vs CyberChef-MCP

| Feature | ciphey | CyberChef-MCP |
|---------|--------|---------------|
| **Operations** | 22 decoders | 300+ operations |
| **Automation** | Full (A* search) | Manual (user-defined recipes) |
| **Language** | Rust | Node.js (wrapping JavaScript core) |
| **Primary Use** | Unknown encoding detection | Known transformation pipelines |
| **Speed** | Optimized for rapid decoding | Comprehensive operation library |
| **Intelligence** | AI-enhanced (BERT) | User-driven |
| **Multi-Layer** | Automatic unwrapping | Manual recipe chains |
| **Platform** | CLI, Discord bot | MCP server (AI assistants, IDEs) |
| **Best For** | CTF, malware triage, rapid decoding | Forensics, data transformation, complex pipelines |

**Verdict:** Complementary tools serving different workflows. ciphey excels at automatic detection, while CyberChef-MCP provides comprehensive manual control over 300+ operations.

## License and Attribution

**License:** MIT License

**Copyright:** (c) 2021 Bee (@bee-san on GitHub)

**Permission:** Free to use, modify, distribute, and sublicense with proper attribution.

**Full License Text:** [MIT License](https://github.com/bee-san/ciphey/blob/main/LICENSE)

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**CyberChef-MCP Version:** 1.7.0
**ciphey Version:** 0.12.0
