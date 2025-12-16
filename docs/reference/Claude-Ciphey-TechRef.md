# Ciphey: The AI-powered automated decryption tool for CTF and security analysis

**Ciphey automatically identifies and decrypts unknown ciphertext without requiring users to specify the encryption type.** Built with an AI search algorithm called AuSearch and natural language processing for plaintext detection, the tool handles 51+ encoding and cipher types—solving most challenges in under three seconds. Originally created in 2008 and revived in 2019 by the University of Liverpool's Cyber Security Society, Ciphey has amassed **20,300+ GitHub stars** and become essential tooling for CTF competitors. However, users should understand a critical limitation: Ciphey targets classical ciphers and encodings, not modern cryptographic systems like AES or RSA.

The tool fills a unique niche in security tooling. While CyberChef requires manual recipe building and dCode.fr provides identification without full automation, Ciphey offers complete end-to-end decryption from unknown ciphertext to plaintext. The project is now transitioning to a Rust-based successor called **Ares**, which delivers 700% faster performance and active maintenance as of March 2025.

---

## Architecture combines Python extensibility with C++ performance

Ciphey's architecture spans multiple repositories working in concert. The main **Ciphey/Ciphey** repository contains the Python application logic, CLI interface, and module registration system. Performance-critical cryptanalysis operations run in **CipheyCore**, a C++ library (95.4% C++) that uses SWIG for Python bindings. Supporting repositories include **CipheyDists** (language distributions, wordlists, character sets) and **CipheyDocs** (documentation).

The codebase requires **Python 3.7-3.9** (64-bit only) and uses Poetry for dependency management. Key runtime dependencies include `cipheycore` for cryptanalysis, `cipheydists` for language data, `pywhat` for pattern recognition with 100+ regex patterns, `click` for CLI, `rich` for terminal formatting, and `loguru` for logging.

### Component breakdown reveals modular design

The architecture follows a **registry pattern** where modules self-register using decorators. Four primary component types exist:

**Decoders** handle transformations requiring no key (Base64, Morse code, hex). Each decoder implements a `decode()` method, a `priority()` score indicating CTF appearance likelihood (0-1), and a `getTarget()` identifier. These run entirely in Python and execute quickly due to their 1-to-1 mapping nature.

**Crackers** tackle key-based ciphers requiring brute force (Caesar, Vigenère, XOR). The `attemptCrack()` method returns possible results, while `getInfo()` provides success likelihood and runtime estimates. Crackers typically call into C++ implementations in CipheyCore for performance.

**Checkers** validate whether decryption output constitutes actual plaintext. Seven checkers operate in parallel, including the "Brandon" English language detector, JSON validation, regex patterns for CTF flags, and statistical tests.

**Searchers** implement the AI algorithms that determine which decryption paths to explore. The current default is AuSearch, with a planned A* implementation called "Imperfection."

---

## AuSearch algorithm powers intelligent cipher detection

Ciphey's detection approach centers on **AuSearch (Augmented Search)**, a tree-based algorithm where edges represent ciphertext and nodes represent decryption methods. Unlike random exploration, AuSearch uses hand-crafted heuristics to prioritize nodes based on two factors: **likelihood of appearance** (Base64 appears frequently in CTFs; Vigenère rarely) and **computational cost** (fast checks run first).

A **deep neural network trained on Harry Potter text** predicts probability distributions across encryption types. When presented with unknown input, the model might output "81% likely SHA1, 1% likely Caesar"—ordering decryption attempts accordingly. The multi-threaded execution runs decryption modules in parallel, terminating immediately when valid plaintext emerges.

**Shannon entropy** guides the search direction without knowing the final answer. Encrypted text typically has high entropy (~5.2), decreasing as successful decryption steps proceed. A Base64 → ROT13 → Vigenère chain might show entropy dropping from 5.23 to 3.88 after the first Base64 decode, confirming the algorithm is on the right track.

### The checker system validates plaintext with seven methods

The **Brandon language checker** serves as the primary validator, using a three-list threshold approach: stop words (high-frequency words like "the," "is," "and"), top 1000 English words, and a full dictionary. Text passes through a two-prong filter—if it matches stop words OR top-1k, it proceeds to dictionary verification. The threshold sits at approximately **35%** to accommodate slang, usernames, and unconventional plaintext. Development involved ~200 million tests over one month against large English corpora.

Additional checkers include **JSON validation** (using `json.loads()`), **regex matching** for CTF flag formats (HTB{}, THM{}, FLAG{}, CTF{}—case insensitive and user-configurable), **PyWhat integration** with ~100 specialized patterns for IP addresses, emails, and cryptocurrency addresses, **QuadGrams** checking common 4-letter sequences, **G-test of Goodness-of-fit** for statistical validation, and a **Human Checker** for interactive confirmation on uncertain results.

---

## Comprehensive cipher and encoding support spans 51+ methods

### Classical ciphers and substitutions

| Cipher Type | Technical Details |
|-------------|-------------------|
| Caesar/ROT13 | Shift cipher with ROT1-25 support; uses `cipheycore.caesar_detect()` |
| ROT47/ROT94 | Extended ASCII rotation up to ROT127 |
| Vigenère | Polyalphabetic substitution using keyword; brute-force with dictionary |
| Affine | Mathematical substitution (ax + b mod 26) |
| Baconian | Both variants supported |
| Transposition | Columnar transposition cipher |
| XOR (repeating-key) | Single-byte and multi-byte XOR patterns |

### Encoding schemes total 33+ variants

Base encodings include Base2/Binary, Base8/Octal, Base10/Decimal, Base16/Hex, Base32, Base58 (Bitcoin, Flickr, Ripple variants), Base62, Base64, Base64 URL, Base69, Base85, ASCII85, Z85, Base91, and Base65536. Text encodings cover ASCII, reversed text, Morse code, Atbash, Leetspeak, and A1Z26. Specialized formats include DNA codons, Standard Galactic Alphabet (Minecraft), Baudot ITA2, URL encoding, SMS Multi-tap, DTMF, Prisoner's Tap Code, UUencode, and Braille (Grade 1). The esoteric language **Brainfuck** and **GZip** compression are also supported.

### Hash support includes 272 types but is currently disabled

Primary hash types (MD5, SHA-1, SHA-256, SHA-384, SHA-512) plus 267 additional types were supported via external lookup services. **This functionality is currently disabled** due to external service reliability issues—Ciphey performs hash lookups against databases rather than actual cracking.

---

## Installation offers multiple pathways

### Pip installation serves as the primary method

```bash
python3 -m pip install ciphey --upgrade
```

Requirements include **Python 3.7-3.8** on Windows (3.9+ unsupported) or **Python 3.7-3.9** on Linux/macOS. Only **64-bit Python** works—Windows defaults to 32-bit, requiring explicit selection during installation. Python 3.10+ is not supported on any platform.

### Docker provides containerized deployment

```bash
# Interactive session
docker run -it --rm remnux/ciphey

# Direct decryption
docker run -it --rm remnux/ciphey "encoded_string_here"
```

The REMnux-maintained image handles all dependencies automatically.

### CLI reference covers essential options

| Option | Purpose |
|--------|---------|
| `-t, --text TEXT` | Direct ciphertext input |
| `-f, --file FILENAME` | Read from file |
| `-q, --quiet` | Remove progress bars for scripting |
| `-g, --greppable` | Output only the answer |
| `-v, --verbose` | Debug output |
| `-C, --checker TEXT` | Specify checker (regex, brandon) |
| `-p, --param TEXT` | Pass checker parameters |
| `-m, --module PATH` | Load external module |

Three input methods work: direct text (`ciphey -t "string"`), file input (`ciphey -f file.txt`), and piping (`echo "string" | ciphey`).

### Programmatic API enables integration

```python
from ciphey import decrypt
from ciphey.iface import Config

result = decrypt(
    Config().library_default().complete_config(),
    "SGVsbG8gbXkgbmFtZSBpcyBiZWU="
)
print(result)  # "hello my name is bee"
```

**Warning**: The decrypt function can run indefinitely on unsupported inputs. Implement custom timeout handling—no built-in timeout exists in the Python version.

---

## CyberChef comparison reveals complementary strengths

| Aspect | Ciphey | CyberChef |
|--------|--------|-----------|
| **Approach** | Fully automated black-box | Manual recipe building |
| **Interface** | Command-line | Web-based GUI |
| **Auto-detection** | AI-powered cipher identification | Limited "Magic" feature |
| **Hash support** | Yes (272 types, currently disabled) | No |
| **Large files** | 6GB in 5:54 | Crashes on complex inputs |
| **42-layer Base64** | 2 seconds | 6 seconds (manual setup) |

**Use Ciphey when**: The cipher type is unknown, handling CTF challenges, processing large files, or needing hash identification. **Use CyberChef when**: Operations are known, visual feedback helps learning, or specific transformations Ciphey doesn't support are needed.

### Distinction from password cracking tools

Ciphey differs fundamentally from **Hashcat** and **John the Ripper**. Those tools provide GPU-accelerated brute-force hash cracking with 400+ algorithm support and multiple attack modes (dictionary, mask, rule-based). Ciphey performs hash **identification and lookup**—not cracking. For serious password recovery, Hashcat/John remain the appropriate tools.

Other automated detection tools like **dCode.fr** (web-based, 200+ ciphers, identifies but doesn't always decrypt) and **Boxentriq** (ML-based identification without decryption) complement rather than compete with Ciphey's full automation approach.

---

## Security scope explicitly excludes modern cryptography

### What Ciphey cannot break

**Modern encryption remains mathematically infeasible.** The official documentation states regarding AES-128: "This would take more energy than there is in the solar system." Ciphey cannot attack:

- AES (128/256-bit) or any block cipher with proper keys
- RSA or elliptic curve cryptography  
- TLS, HTTPS, VPNs, or encrypted messaging
- Any properly implemented modern cryptographic system

### Plaintext detection limitations

The checker system only recognizes:
- English language text (German partially supported)
- JSON format
- CTF flag patterns (THM{}, HTB{}, CTF{}, FLAG{})

Strings like "hello_my_name_is_emily" fail because underscores make the checker see one unrecognized word. Non-English languages, arbitrary data formats, and binary success conditions aren't detected.

### Known failure cases

Ambiguity creates false positives when wrong decryption paths produce valid-looking output—"Base64 decoding might perfectly be Caesar cipher." The language checker struggles with small text samples, leetspeak requires preprocessing, and the tool can hang indefinitely on unsupported encodings.

**Manual analysis outperforms Ciphey** for novel encoding schemes, non-English plaintext, cipher combinations outside its workflow, and any scenario requiring actual cryptographic key recovery.

---

## Development has shifted to Rust-based successor

### Current Python Ciphey status

| Metric | Value |
|--------|-------|
| GitHub stars | 20,300+ |
| Last release | v5.14.0 (June 6, 2021) |
| Contributors | 42 |
| Status | **Maintenance mode** |
| CipheyCore | **Archived March 2025** |

The Python version remains functional but receives no new features.

### Ares represents the future

The development team states: **"We fully intend to replace Ciphey with ciphey [Ares]."** Key improvements include **700% speed increase** through Rust implementation, **A\* search algorithm** with intelligent heuristics, **native multi-threading** via Rayon, **built-in 5-second timeout** solving the infinite-run problem, and **optional BERT-based detection** claiming ~40% accuracy improvement.

Ares reached v0.11.0 in **March 2025** with 817 stars and active maintenance. Current decoder count is 16 (targeting 50+). Installation via `cargo install ciphey` or Docker.

---

## Conclusion: A specialized tool for classical cryptography

Ciphey excels at its designed purpose—automated decryption of CTF challenges and classical ciphers without cryptographic expertise. The **AuSearch algorithm**, **seven-checker validation system**, and **C++ performance core** combine to solve most encodings in seconds. For CTF competitors, bug bounty researchers analyzing encoded strings, malware analysts examining obfuscated payloads, and students learning classical cryptography, Ciphey remains highly valuable.

The transition to Ares signals continued commitment to the tool's mission with modern implementation. Users should adopt Ares for active development and performance benefits while understanding that the underlying capability—breaking weak historical ciphers and encodings—remains unchanged. **Modern encryption stays secure; Ciphey's success against a target indicates weakness in the encoding scheme, not a breakthrough in cryptanalysis.**
