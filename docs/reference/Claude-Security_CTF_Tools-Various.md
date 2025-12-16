# Security and CTF tools for data transformation and cryptanalysis

Modern security operations demand mastery of two complementary toolsets: data transformation utilities that decode, encode, and manipulate data at scale, and cryptanalysis tools that break weak cryptographic implementations. **CyberChef and Ciphey lead their respective categories**, but a comprehensive security toolkit requires understanding when to deploy each tool—and their alternatives. This report provides the technical depth needed to integrate these tools into red team operations, CTF competitions, and defensive analysis workflows.

## CyberChef remains the dominant data transformation platform

GCHQ's "Cyber Swiss Army Knife" has earned its reputation through sheer capability: **over 300 operations** spanning encoding, encryption, compression, hashing, networking, and forensics—all running entirely client-side in the browser. The project has accumulated **33,400+ GitHub stars** and remains under active development at version 10.19.4.

The recipe system differentiates CyberChef from simpler tools. Operations chain sequentially, with each output feeding the next input. Advanced flow control enables sophisticated analysis: the **Register** operation captures intermediate values for reuse (storing extracted encryption keys via `$R0`, `$R1`), while **Fork** processes delimited data in parallel. A malware analyst decoding AES-encrypted PowerShell can extract the Base64-encoded key, store it in a register, then use that register value in the subsequent AES decryption operation—all within a single shareable recipe.

| Operation Category | Count | Key Capabilities |
|-------------------|-------|------------------|
| Encryption/Encoding | ~50 | AES (all modes), DES, Blowfish, RC4, ChaCha20, RSA, classical ciphers |
| Hashing | ~40 | SHA family, MD5, bcrypt, scrypt, HMAC, Keccak |
| Data Format | ~58 | Base64 variants, hex, binary, JSON, XML |
| Compression | ~12 | Gzip, Zlib, Bzip2, LZMA |
| Networking | ~28 | IP parsing, URL encoding, DNS, HTTP requests |
| Historical | Unique | Enigma Machine, Bombe, Lorenz SZ simulations |

### CLI automation unlocks enterprise integration

The official **CyberChef-server** (Node.js) exposes a REST API for pipeline integration:

```bash
# Deploy via Docker
docker run -it --rm -p 3000:3000 gchq/cyberchef-server

# Execute recipe via API
curl -X POST -H "Content-Type:application/json" \
  -d '{"input":"SGVsbG8gV29ybGQ=","recipe":"from base64"}' \
  localhost:3000/bake
# Response: {"value":"Hello World","type":"string"}
```

The npm package `cyberchef` provides direct Node.js integration for scripting:

```javascript
const chef = require("cyberchef");
chef.bake("test", [{"op":"To Base64","args":["A-Za-z0-9+/="]}]);
```

### Offline and air-gapped deployment

CyberChef's client-side architecture enables complete offline operation. Download the standalone ZIP from the GitHub releases page—**no server-side processing occurs** except for three operations (Show on Map, DNS over HTTPS, HTTP Request). File handling supports inputs up to approximately 2GB depending on browser memory constraints.

## Ciphey automates the identification-decryption workflow

Where CyberChef requires analysts to know what transformations to apply, **Ciphey automates detection entirely**. It uses natural language processing to identify when decryption succeeds and intelligent search algorithms to prioritize likely cipher types—decrypting a **42-layer Base64 encoding in approximately 2 seconds** versus manual CyberChef configuration taking 6+ seconds.

The core architecture comprises two components. The **AuSearch module** approximates encryption methods using pattern analysis (not heavyweight neural networks—explicitly lightweight for speed). The **Brandon checker** validates decryption success against English, German, JSON, or CTF flag patterns using chi-squared frequency analysis and dictionary matching calibrated through 200 million tests.

### Supported cipher and encoding types (51 total)

Ciphey handles the encodings and classical ciphers commonly encountered in CTF challenges:

**Encodings**: Base2 through Base65536 (including Base58 Bitcoin/Flickr/Ripple variants), ASCII, Morse, DNA codons, URL encoding, UUencode, Braille, Standard Galactic Alphabet

**Classical ciphers**: Caesar (all rotations), Vigenère, Affine, Baconian, Atbash, Playfair, transposition variants

**Modern**: Single-byte XOR, repeating-key XOR, GZip decompression

**Notable limitation**: Ciphey **cannot break modern symmetric encryption** (AES, DES) or asymmetric encryption (RSA)—these require brute-forcing keyspaces larger than computationally feasible.

### Installation and CLI usage

```bash
# Installation options
pip install ciphey --upgrade
docker run -it --rm remnux/ciphey
brew install ciphey  # macOS

# Basic usage
ciphey -t "aGVsbG8gbXkgbmFtZSBpcyBiZWU="

# File input with quiet output for scripting
ciphey -f encrypted.txt -q

# Custom CTF flag regex
ciphey -t "encoded_challenge" -p "regex=FLAG{[A-Za-z0-9_]+}"

# Greppable output for pipelines
ciphey -t "encoded" -g | grep -o 'pattern'
```

### Project status and successor

The main Ciphey repository (20,300+ stars) reached stable release at v5.14.0 in June 2021 and is no longer under active development. A **Rust rewrite called "Ares"** is in progress, promising 700% speed improvements through native multithreading, A* search algorithms, and optional BERT-based plaintext detection. Install via `cargo install ciphey`.

## The "Katana" naming collision requires clarification

Three distinct security tools share the "Katana" name, causing significant confusion:

| Tool | Purpose | Status | Recommendation |
|------|---------|--------|----------------|
| **ProjectDiscovery Katana** | Web crawling/spidering | ✅ Active (v1.3.0, Dec 2025) | Production-ready |
| **JohnHammond's ctf-katana** | CTF automation | ⚠️ Low maintenance | Useful for CTF |
| **Katana Framework** | Penetration testing | ❌ Abandoned | Avoid |

### ProjectDiscovery Katana dominates web reconnaissance

The actively maintained Katana (15,000+ stars) from ProjectDiscovery is a **Go-based web crawler** designed for security reconnaissance. It features dual crawling modes (standard HTTP and headless browser with JavaScript rendering), integrates with the ProjectDiscovery ecosystem (Nuclei, Subfinder, httpx), and handles modern SPAs effectively.

```bash
# Installation
CGO_ENABLED=1 go install github.com/projectdiscovery/katana/cmd/katana@latest

# Basic crawling
katana -u https://target.com

# Headless mode for JavaScript-heavy sites
katana -u https://target.com -headless -system-chrome

# Pipeline integration
cat domains | httpx | katana -jc -f qurl | nuclei -t vulnerabilities/
```

### JohnHammond's ctf-katana automates CTF triage

The CTF-focused Katana (GitHub: JohnHammond/katana) automates "low-hanging fruit" checks across challenge categories: crypto, forensics, steganography, web, PCAP analysis, and more. It uses a boss-worker architecture where specialized "units" handle specific analysis tasks.

```bash
# Analyze with flag format regex
katana --force -f "FLAG{.*?}" target_file

# Exclude slow categories
katana --exclude stego target
```

The companion **ctf-katana repository** (2,900 stars) serves as a living knowledge base documenting tools, techniques, and commands for each CTF category—valuable reference material even without using the automation tool.

### Katana Framework should be avoided

The Python 2.7-based "Katana Framework" (PowerScript/KatanaFramework) has approximately 37 modules for basic penetration testing but has been effectively abandoned since 2017. Its documentation states "The current version is not completely stable." **Use Metasploit or modern alternatives instead**.

## Cryptanalysis tools target specific attack surfaces

### Hashcat delivers maximum GPU-accelerated cracking speed

Hashcat supports **over 350 hash types** with GPU acceleration achieving extraordinary speeds: **164 GH/s for MD5** and **288 GH/s for NTLM** on an RTX 4090. It remains the definitive choice for password recovery at scale.

```bash
# Installation
sudo apt install hashcat

# Dictionary attack with rules
hashcat -a 0 -m 0 hash.txt wordlist.txt -r rules/best64.rule

# Brute-force with mask
hashcat -a 3 -m 1000 hash.txt ?d?d?d?d?d?d

# Combination attack
hashcat -a 1 -m 0 hash.txt wordlist1.txt wordlist2.txt
```

**Attack modes**: Dictionary (-a 0), Combination (-a 1), Brute-force/Mask (-a 3), Hybrid (-a 6, -a 7), Association (-a 9), plus the powerful rule engine for candidate mutation.

### John the Ripper excels at CPU efficiency and file format extraction

John the Ripper's "Jumbo" version supports **400+ hash formats** with excellent CPU optimization (SIMD vectorization, OpenMP threading). Its key differentiator: the extensive **\*2john utility collection** that extracts hashes from protected files.

```bash
# Extract hashes from files
zip2john archive.zip > zip.hash
pdf2john document.pdf > pdf.hash
ssh2john id_rsa > ssh.hash

# Crack with auto-detection
john hashes.txt

# Wordlist with rules
john --wordlist=rockyou.txt --rules hashes.txt

# Show results
john --show hashes.txt
```

**When to choose each**: Hashcat for GPU-heavy workloads and maximum speed; John for CPU-only environments, complex file formats requiring \*2john extraction, or when auto-detection is valuable.

### RsaCtfTool automates 50+ RSA attacks

For CTF RSA challenges, **RsaCtfTool** (6,600+ stars) automates attacks against weak implementations: Wiener's attack (small private exponent), Fermat factorization (close primes), Pollard's p-1 (smooth numbers), FactorDB lookup, ROCA vulnerability detection, and many more.

```bash
# Clone and install
git clone https://github.com/RsaCtfTool/RsaCtfTool.git
pip install -r requirements.txt

# Attack public key and decrypt
RsaCtfTool --publickey key.pub --decryptfile ciphertext

# Try all attacks
RsaCtfTool --publickey key.pub --attack all

# Specific attack
RsaCtfTool --publickey key.pub --attack wiener
```

**Critical understanding**: RsaCtfTool **only succeeds against flawed RSA implementations**—weak primes, mathematical vulnerabilities, or keys appearing in FactorDB. It cannot break properly generated 2048+ bit RSA keys.

### xortool recovers XOR encryption keys

For repeating-key XOR analysis, **xortool** determines key length through statistical analysis and recovers keys using frequency analysis.

```bash
pip install xortool

# Analyze encrypted file
xortool encrypted_file

# Specify key length and most frequent character
xortool encrypted_file -l 10 -c 00  # Binary (null byte common)
xortool encrypted_file -l 10 -c 20  # Text (space common)

# Brute-force frequent character
xortool encrypted_file -b
```

## Data transformation alternatives serve specialized needs

### dCode.fr provides unmatched classical cipher coverage

The web-based **dCode.fr** offers **900+ tools** with particular strength in classical cryptography. Its AI-powered cipher identifier recognizes 200+ cipher types, and individual solvers can brute-force many classical ciphers automatically (Caesar, Vigenère, monoalphabetic substitution).

**Limitations**: No operation chaining, no API for automation, limited modern cryptography support, online-only.

**Best use case**: Quick cipher identification and classical cipher solving when the cipher type is unknown.

### CLI tools enable scripted automation

For pipeline integration, standard Unix utilities provide fast, scriptable encoding:

```bash
# Base64
echo -n "data" | base64          # Encode
base64 -d <<< "ZGF0YQ=="         # Decode

# Hex
echo -n "data" | xxd -p          # String to hex
echo "64617461" | xxd -r -p      # Hex to string

# OpenSSL encryption
openssl enc -aes-256-cbc -pbkdf2 -a -salt -in plain.txt -out encrypted.b64
openssl enc -aes-256-cbc -pbkdf2 -d -a -in encrypted.b64 -out decrypted.txt
```

**pwntools** provides CTF-optimized utilities:
```bash
pip install pwntools

checksec ./binary          # Binary security analysis
cyclic 200                 # Generate pattern for overflow offset
pwn hex "deadbeef"         # Hex encoding
pwn shellcraft amd64.linux.sh  # Shellcode generation
```

### Web alternatives fill specific gaps

| Tool | URL | Strength |
|------|-----|----------|
| **Cryptii** | cryptii.com | Modular "bricks" interface, bidirectional pipes |
| **Boxentriq** | boxentriq.com | Clean UI, CTF/escape room focus |
| **quipqiup** | quipqiup.com | Fast monoalphabetic substitution solving |
| **CyberFork** | Community fork | Adds Murmur hash, JQ support missing from mainline |

## Tool selection framework by use case

| Scenario | Primary Tool | Alternative |
|----------|-------------|-------------|
| Unknown encoding/cipher | Ciphey | dCode Cipher Identifier |
| Complex transformation pipeline | CyberChef | Python scripting |
| GPU hash cracking | Hashcat | - |
| Hash extraction from files | John + \*2john | - |
| Weak RSA analysis | RsaCtfTool | SageMath |
| XOR cipher recovery | xortool | CyberChef XOR Brute Force |
| Web reconnaissance | ProjectDiscovery Katana | - |
| CTF challenge triage | JohnHammond's Katana | - |
| Air-gapped analysis | CyberChef (ZIP) | CLI tools |
| Classical cipher solving | dCode | Boxentriq |

## Installation quick reference

```bash
# Core tools
sudo apt install hashcat john
pip install ciphey xortool pwntools name-that-hash

# RsaCtfTool
git clone https://github.com/RsaCtfTool/RsaCtfTool.git
cd RsaCtfTool && pip install -r requirements.txt

# ProjectDiscovery Katana
CGO_ENABLED=1 go install github.com/projectdiscovery/katana/cmd/katana@latest

# CyberChef server
docker run -it --rm -p 3000:3000 gchq/cyberchef-server
```

## Conclusion

The optimal security toolkit combines **CyberChef for complex, visual data transformation workflows** with **Ciphey for automated identification of unknown encodings**. For cryptanalysis, **Hashcat dominates GPU-accelerated hash cracking** while **John the Ripper's \*2john utilities are indispensable for extracting hashes from files**. RSA CTF challenges fall to **RsaCtfTool's automated attack suite**, and XOR encryption yields to **xortool's statistical analysis**.

The "Katana" ecosystem requires careful navigation: **ProjectDiscovery's Go-based web crawler is production-ready**, JohnHammond's CTF automation tool remains useful despite limited maintenance, and the legacy Katana Framework should be avoided entirely.

For enterprise integration, CyberChef-server's REST API and the Node.js package enable automated pipelines, while CLI tools (base64, xxd, openssl, pwntools) provide maximum scripting flexibility. The combination of visual tools for exploration and CLI tools for automation creates a comprehensive capability across CTF competitions, red team operations, and defensive analysis.