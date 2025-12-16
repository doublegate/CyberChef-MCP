# Ares: Rust's 85x faster successor to Ciphey for automated cryptanalysis

**Ares represents a fundamental architectural reimagining of automated cipher detection**, delivering **8,445% performance improvements** over its Python predecessor through pure Rust implementation, A* search algorithms, and native multi-threading. The project, published as "ciphey" on crates.io (v0.12.0), achieves approximately **1,709 decodings per second** compared to Python Ciphey's ~20—enabling practical multi-level decryption chains that were previously computationally prohibitive.

The tool addresses a core cybersecurity challenge: automatically identifying and decoding encrypted or encoded text without prior knowledge of the cipher or key used. This capability proves invaluable for CTF competitions, security research, and forensic analysis. Ares currently supports **16+ decoders** (growing toward Ciphey's 51) with plans to merge back into the main Ciphey repository as the primary implementation.

---

## A* search powers intelligent cipher detection

Ares evolved from breadth-first search (v0.1-0.10) to an **A* search algorithm** (v0.11+) that dramatically improves solution finding through intelligent heuristics. The search operates through a sophisticated multi-stage pipeline:

**Fast decoder prioritization** bypasses heuristic calculation entirely for computationally cheap decoders like Base64, executing them first on every search node. For remaining decoders, the `cipher_identifier` crate calculates probability scores across **58 classical cipher types** using statistical analysis—lower scores indicate better matches.

The algorithm employs five key optimizations: result caching prevents recalculation of previously explored paths; search tree pruning manages memory consumption; dynamic decoder statistics prioritize historically successful decoders (Caesar over Beaufort); and popular pair tracking accelerates common sequences like `base64→base64`. The system maintains a database of decoder performance metrics that improve prioritization over time.

**Statistical analysis techniques** powering cipher identification include:
- **Index of Coincidence (IoC)**: English text ~0.067, random ~0.038
- **Mutual Index of Coincidence (MIC)**: Maximum periodic IoC for polyalphabetic detection
- **Digraphic Index of Coincidence (DIC)**: Letter pair frequency analysis
- **Shannon Entropy**: Information content measurement via H = -Σ(p_i × log₂(p_i))
- **Length Ratio (LR)** and **Standard Deviation Distribution (SDD)** for substitution cipher identification

---

## Multi-layered plaintext verification ensures accuracy

The checker system uses a **four-layer verification approach** to determine when decoded output represents valid plaintext:

**Layer 1: Quadgram/trigram analysis** calculates the probability that text belongs to a natural language using n-gram frequency tables. Different sensitivity thresholds apply per decoder—Caesar uses Low sensitivity since outputs inherently resemble English, while Base64 uses Medium sensitivity.

**Layer 2: LemmeKnow pattern matching** provides regex-based identification across **~500 patterns** including API keys, MAC addresses, IP addresses, cryptocurrency wallets, email addresses, and CTF flag formats (THM{}, HTB{}, CTF{}, FLAG{}). This Rust port of PyWhat runs **33x faster** for large files and 3x faster for single strings.

**Layer 3: Password database lookup** via the `is_password()` function cross-references decoded output against known credentials from data breach dumps.

**Layer 4: Optional BERT-based detection** through the `gibberish-or-not` crate delivers approximately **40% accuracy improvement** using a 500MB Hugging Face model, enabled via `--enable-enhanced-detection`. The base algorithm uses weighted composite scoring with length-adjusted thresholds ranging from 0.7 (≤20 characters) to 1.1 (>200 characters).

---

## Supported ciphers span classical and modern encoding

### Currently implemented decoders (16+)

| Category | Implementations |
|----------|----------------|
| **Base encodings** | Base64, Base32, Base58, Base65536, Base91, Z85, Hexadecimal |
| **Classical ciphers** | Caesar (25 rotations), Vigenère, Atbash, A1Z26 |
| **Text manipulation** | Reverse, Morse Code, Braille, URL encoding |
| **Esoteric** | Brainfuck, Citrix CTX1 |

The Binary decoder notably returns **25 variants** to cover different interpretation schemes. Ares's Vigenère implementation uses what developers describe as "perhaps the best algorithm"—fast, accurate, and handling non-letter characters better than alternatives.

### cipher_identifier statistical recognition (58 types)

The heuristic engine recognizes classical ciphers including: **Bifid** (standard and 6x6), **Playfair** variants (seriatedPlayfair, slidefair, foursquare, twosquare, trisquare), **Vigenère family** (Beaufort, Porta, Portax, Variant, Autokey, progressiveKey, runningKey), **transposition ciphers** (columnar, myszkowski, redefence, routeTramp, grille), and specialized systems like Gromark, Nicodemus, Phillips, and Quagmire I-IV.

---

## Library-first architecture enables deep integration

Ares follows a **library-first design pattern** where the CLI serves as a thin consumer of the core library API. This architectural decision enables straightforward integration into Discord bots, web services, and automated pipelines.

### Module organization

```
ciphey/
├── checkers/           # Plaintext verification functions
├── decoders/           # Decoder implementations
│   └── interface.rs    # Decoder trait definition
├── config/             # Global configuration API  
├── cli_pretty_printing/# Terminal output formatting
├── storage/           # Dictionary and statistics databases
└── lib.rs             # Library entry point
```

### Public API surface

```rust
// Core entry point
pub fn perform_cracking(input: &str) -> Option<DecoderResult>

// Primary result type
pub struct DecoderResult { /* decoded text, decoder name, status */ }

// Module exports
ciphey::checkers       // Plaintext verification
ciphey::decoders       // All decoder implementations
ciphey::config         // Configuration management
```

### Extensibility interface

Adding new decoders requires implementing the trait defined in `interface.rs`, registering the module in the filtration system's `mod.rs`, and exporting as public. The trait-based architecture provides clean extensibility without modifying core search logic.

---

## Rust implementation delivers 85x performance gains

### Concurrency through Rayon

Ares leverages **Rayon** for data parallelism—described by developers as "one of the fastest multi-threading libraries." This enables parallel decoder execution across search nodes, a capability impossible in Python due to the Global Interpreter Lock (GIL). The original Python Ciphey was entirely single-threaded.

### Key performance metrics

| Metric | Ciphey (Python) | Ares (Rust) | Improvement |
|--------|-----------------|-------------|-------------|
| Decodings/second | ~20 | ~1,709+ | **8,445%** |
| 103-decoding test | ~5 seconds | 0.06 seconds | 83x |
| Pattern matching | PyWhat | LemmeKnow | 33x |
| Multi-level decryption | Impractical | Native support | ∞ |

### Memory and optimization strategies

The codebase uses `crossbeam` for lock-free concurrent data structures, `lazy_static` and `once_cell` for compile-time and runtime static initialization, and `include_dir` for embedding dictionary data at compile time. Release builds employ **LTO (Link-Time Optimization)**, panic abort behavior, and binary stripping for optimal performance.

**Known technical debt**: The codebase acknowledges excessive `.clone()` usage where references and lifetimes could be better utilized. Additionally, some decoders (particularly Base64) don't fail properly on invalid input, returning partial data instead of errors—this causes exponential search space growth in edge cases.

---

## Architectural evolution from Python addresses fundamental limitations

### Python Ciphey problems solved by Rust rewrite

The original Python implementation suffered from several architectural issues that motivated the complete rewrite:

**Mixed-language complexity**: Ciphey's C++ core (CipheyCore) became unmaintainable as no team members had sufficient C++ expertise. The Rust version is **pure Rust** with no mixed-language dependencies.

**Testing and documentation**: Python Ciphey had very few tests and extensive "spaghetti code" with logic bugs that only surfaced through user reports. Ares enforces **~120 tests** including documentation tests that ensure docs stay synchronized with code.

**Parallelism limitations**: Python's GIL prevented real multi-core utilization. Ares achieves native multi-threading through Rayon.

**Library design**: Python Ciphey's library interface was "tacked on" with no tests and rarely used. Ares's library-first design makes the CLI a first-class consumer of a well-tested API.

### Capability trade-offs

Ares currently supports **16+ decoders** compared to Ciphey's **51+**. Missing capabilities include: Base2/8/10/62/69/85, repeating-key XOR, Affine cipher, Pig Latin, DNA codons, Baudot ITA2, and hash cracking (272 types disabled in Ciphey). Feature parity is tracked in GitHub Issue #61.

Ares **adds capabilities** not present in Python Ciphey: A* search with statistical heuristics, BERT-based enhanced detection, password database lookup, configurable sensitivity levels, custom themes, and database-driven performance statistics.

---

## Repository structure and build infrastructure

**Repository**: https://github.com/bee-san/Ares  
**Crates.io**: `ciphey` v0.12.0 (also `project_ares`, `ares_lib`)  
**License**: MIT  
**Statistics**: 817+ stars, 44+ forks, 734+ commits

### Directory layout

```
Ares/
├── .github/        # CI/CD workflows (cargo-nextest, rustfmt, clippy)
├── benches/        # Criterion benchmarking tests
├── docs/           # Documentation
├── src/            # Main source code
├── tests/          # Integration tests (~120 tests)
├── Cargo.toml      # Dependencies and build configuration
├── Dockerfile      # Container support
└── justfile        # Task runner configuration
```

### Key dependencies

| Category | Crates |
|----------|--------|
| **Encoding** | base64, base65536, base91, bs58, data-encoding, urlencoding, z85 |
| **Detection** | lemmeknow, cipher_identifier, gibberish-or-not |
| **Parallelism** | rayon, crossbeam |
| **CLI** | clap v4.5.31, colored, env_logger |
| **Utilities** | regex, lazy_static, once_cell, serde |
| **Testing** | criterion, cargo-nextest |

### CI/CD pipeline

GitHub Actions workflows include: automated testing via cargo-nextest with parallel execution, rustfmt formatting enforcement, clippy linting, Dependabot for dependency updates, and **cargo-dist** for automated cross-platform release builds (x86_64-unknown-linux-gnu, x86_64-apple-darwin, x86_64-pc-windows-msvc, i686 variants).

---

## Practical usage from CLI to library integration

### Installation

```bash
# Recommended: cargo install
cargo install ciphey

# From source
git clone https://github.com/bee-san/Ares && cd Ares
cargo build --release

# Docker
docker build .
```

### CLI usage

```bash
# Basic decoding
ciphey -t "SGVsbG8gV29ybGQ="

# Debug mode shows decode path
ciphey -t "IWRscm9XICxvbGxlSA==" -d
# Output: 🥳 Ares has decoded 103 times.
#         Plaintext: Hello, World!
#         Path: Base64 -> Reverse

# Enable BERT-based enhanced detection (500MB model download)
ciphey --enable-enhanced-detection
```

**Timer behavior**: CLI defaults to **5-second timeout**; Discord bot uses 10 seconds. This prevents infinite loops on unsolvable inputs in the infinite search plane.

### Library integration

```rust
// Cargo.toml
[dependencies]
ciphey = "0.12.0"

// Usage
use ciphey::perform_cracking;
let result = perform_cracking("encoded_text_here");
```

The library powers the official Discord bot (https://github.com/bee-san/discord-bot) using `$ciphey` commands, demonstrating production integration patterns.

---

## Conclusion

Ares represents a successful large-scale rewrite that addresses fundamental architectural limitations of its Python predecessor while delivering **85x performance improvements**. The A* search algorithm with statistical heuristics, native multi-threading via Rayon, and multi-layered plaintext verification create a significantly more capable system for automated cryptanalysis.

The **library-first architecture** distinguishes Ares from typical security tools, enabling integration into diverse contexts from Discord bots to web services. While decoder count currently trails Python Ciphey (16 vs 51), active development targets feature parity, and GitHub Issue #366 indicates plans to merge Ares back into the main Ciphey repository as the primary implementation—effectively completing the Python-to-Rust succession.

Key technical decisions—pure Rust with no C++ dependencies, enforced documentation with synchronized doctests, and trait-based decoder extensibility—position the project for sustainable long-term development. The statistical cipher identification engine supporting **58 classical cipher types** combined with BERT-based enhanced detection represents capabilities beyond the original Python implementation, making Ares not merely a port but an evolution of automated cryptanalysis tooling.