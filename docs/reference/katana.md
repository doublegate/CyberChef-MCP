# Katana - CTF Automation Framework

## Overview

**Katana** is an automatic Capture the Flag (CTF) challenge solver that automates "running through the checklist" or hitting the "low-hanging fruit" in CTF competitions. It is designed to help security researchers and CTF players perform common analysis tasks they might otherwise forget to do.

### Project Information

| Property | Value |
|----------|-------|
| **Project Name** | Katana |
| **Description** | Automatic CTF challenge solver and analysis framework |
| **Authors** | John Hammond, Caleb Stewart |
| **License** | GPL-3.0 |
| **Language** | Python 3 (3.7+) |
| **Repository** | [https://github.com/JohnHammond/katana](https://github.com/JohnHammond/katana) |
| **Documentation** | [https://ctf-katana.readthedocs.io](https://ctf-katana.readthedocs.io) |
| **Status** | Maintained (not heavily maintained as of 2019) |

### Key Features

- **Automatic Analysis**: Automatically runs common CTF checks across multiple categories
- **Multi-Category Support**: 15 distinct analysis categories with 60+ specialized units
- **Boss-Worker Architecture**: Efficient parallel processing of multiple analysis strategies
- **Artifact Management**: Automatically generates and tracks discovered files and data
- **Flag Detection**: Regex-based flag pattern matching across all findings
- **Extensible Framework**: Easy to add custom units for new analysis types

## Architecture

### Design Pattern

Katana employs a "boss-worker" topology:

```
                    ┌──────────────┐
                    │  Boss Thread │
                    │  (Manager)   │
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │ Worker  │       │ Worker  │  ...  │ Worker  │
   │ (Unit)  │       │ (Unit)  │       │ (Unit)  │
   └─────────┘       └─────────┘       └─────────┘
```

- **Boss (Manager)**: Coordinates unit execution, manages results, tracks artifacts
- **Workers (Units)**: Individual analysis modules that evaluate targets
- **Priority System**: Units run in priority order (0 = highest, 100 = lowest)
- **Recursion**: Units can spawn new targets, creating a recursive analysis tree

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| Manager | `manager.py` | Orchestrates unit execution, result aggregation |
| Monitor | `monitor.py` | Real-time progress monitoring and logging |
| Target | `target.py` | Represents data to analyze (file, URL, string) |
| Unit | `unit.py` | Base class for all analysis units |
| Utilities | `util.py` | Common helper functions (magic detection, printability) |

## Analysis Categories

Katana includes 15 specialized categories covering common CTF challenge types:

### 1. APK (Android Package Analysis)

| Unit | Description | Tools |
|------|-------------|-------|
| `apktool` | Decompiles Android APK files | apktool |

**Use Cases**:
- Extracting resources from Android apps
- Finding hardcoded credentials in APKs
- Analyzing AndroidManifest.xml

### 2. Crack (Password/Hash Cracking)

| Unit | Description | Tools |
|------|-------------|-------|
| `md5` | MD5 hash lookup via online services | hashkiller, md5online |

**Use Cases**:
- Identifying weak password hashes
- Quick hash reversal for common passwords

### 3. Crypto (Classical Ciphers and Encodings)

| Unit | Description | Priority |
|------|-------------|----------|
| `affine` | Affine cipher decryption | 50 |
| `atbash` | Atbash cipher (reverse alphabet) | 50 |
| `caesar` | Caesar cipher with all rotations | 50 |
| `caesar255` | 8-bit Caesar cipher (0-255) | 50 |
| `dna` | DNA sequence encoding | 50 |
| `phonetic` | NATO phonetic alphabet | 50 |
| `polybius` | Polybius square cipher | 50 |
| `quipqiup` | Automated substitution cipher solver | 30 |
| `railfence` | Rail fence cipher (various heights) | 50 |
| `reverse` | String reversal | 50 |
| `rot47` | ROT47 cipher (ASCII printable) | 50 |
| `rsa` | RSA factorization attacks (small primes) | 50 |
| `t9` | T9 predictive text decoding | 50 |
| `vigenere` | Vigenere cipher with common keys | 50 |
| `xor` | XOR brute force (single-byte keys) | 50 |

**Use Cases**:
- Decoding classical ciphers in CTF challenges
- Automated cryptanalysis across multiple cipher types
- Quick brute-force of simple encryption schemes

### 4. Esoteric (Esoteric Programming Languages)

| Unit | Description | Interpreter |
|------|-------------|-------------|
| `brainfuck` | Brainfuck code execution | Custom Python |
| `cow` | COW language interpreter | Custom Python |
| `jsfuck` | JSFuck (JavaScript subset) execution | Node.js |
| `malbolge` | Malbolge interpreter | External |
| `ook` | Ook! language (Brainfuck variant) | Custom Python |
| `piet` | Piet visual programming language | npiet |
| `pikalang` | Pikalang interpreter | Custom Python |

**Use Cases**:
- Executing esoteric language code found in CTF challenges
- Decoding obfuscated messages in unusual formats

### 5. Forensics (File Analysis and Carving)

| Unit | Description | Tools |
|------|-------------|-------|
| `binwalk` | Firmware analysis and file extraction | binwalk |
| `foremost` | File carving from raw data | foremost |

**Use Cases**:
- Extracting hidden files from images
- Analyzing firmware dumps
- Recovering deleted or embedded files

### 6. GZIP (Compression)

| Unit | Description | Tools |
|------|-------------|-------|
| `gunzip` | Decompression of gzip files | Python gzip module |

**Use Cases**:
- Decompressing gzip-encoded data
- Recursive decompression of nested archives

### 7. OCR (Optical Character Recognition)

| Unit | Description | Tools |
|------|-------------|-------|
| `tesseract` | Extract text from images | Tesseract OCR |

**Use Cases**:
- Reading text from screenshot challenges
- Extracting hidden messages from images

### 8. PCAP (Network Packet Analysis)

| Unit | Description | Tools |
|------|-------------|-------|
| `pcap` | Extract files and data from packet captures | tcpflow, Scapy |

**Use Cases**:
- Analyzing network traffic dumps
- Extracting files transferred over HTTP
- Finding credentials in cleartext protocols

### 9. PDF (PDF Analysis)

| Unit | Description | Tools |
|------|-------------|-------|
| `extract` | Extract text and metadata from PDFs | pdftotext, PyPDF2 |

**Use Cases**:
- Extracting hidden text from PDFs
- Analyzing PDF metadata
- Finding embedded scripts or files

### 10. Raw (Encoding/Decoding)

| Unit | Description | Priority |
|------|-------------|----------|
| `base32` | Base32 decoding | 60 |
| `base64` | Base64 decoding | 25 (high priority) |
| `base85` | Base85/Ascii85 decoding | 60 |
| `base58` | Base58 decoding (Bitcoin/IPFS) | 60 |
| `binary` | Binary string to ASCII | 50 |
| `decimal` | Decimal ASCII codes to text | 50 |
| `hexlify` | Hexadecimal to binary | 50 |
| `urldecode` | URL percent-encoding | 50 |

**Use Cases**:
- Automatic detection and decoding of common encodings
- Recursive decoding of multiple encoding layers
- Processing encoded payloads

### 11. Rev (Reverse Engineering)

| Unit | Description | Tools |
|------|-------------|-------|
| `ltrace` | Library call tracing of binaries | ltrace |

**Use Cases**:
- Analyzing binary behavior without full reversing
- Finding hardcoded strings in compiled programs

### 12. Stego (Steganography)

| Unit | Description | Tools |
|------|-------------|-------|
| `audio_spectrogram` | Visual spectrogram analysis of audio | matplotlib, pydub |
| `dtmf_decode` | Decode DTMF tones from audio | multimon-ng |
| `jsteg` | JPEG steganography detection | jsteg |
| `snow` | Whitespace steganography in text | stegsnow |
| `steghide` | Extract hidden data from images/audio | steghide |
| `stegsnow` | ICE steganography for text files | stegsnow |
| `stegsolve` | Image analysis for LSB/layer stego | stegsolve |
| `whitespace` | Whitespace programming language | Custom Python |
| `zsteg` | PNG/BMP steganography detection | zsteg |

**Use Cases**:
- Detecting hidden messages in images
- Audio steganography analysis
- LSB (Least Significant Bit) extraction
- Whitespace-based encoding

### 13. TAR (Archive Extraction)

| Unit | Description | Tools |
|------|-------------|-------|
| `extract` | TAR archive extraction | Python tarfile |

**Use Cases**:
- Extracting tar/tar.gz archives
- Recursive archive analysis

### 14. Web (Web Application Analysis)

| Unit | Description | Attack Type |
|------|-------------|-------------|
| `basic_img_shell` | Upload PHP webshells via image upload | Active Attack |
| `basic_nosqli` | NoSQL injection testing | Active Attack |
| `basic_sqli` | SQL injection testing | Active Attack |
| `cookies` | Cookie analysis and manipulation | Passive |
| `form_submit` | Automatic form submission | Active Attack |
| `git` | Git repository disclosure (.git/) | Passive |
| `logon_cookies` | Login and session management | Active Attack |
| `robots` | robots.txt analysis | Passive |
| `spider` | Web crawling and link discovery | Active |

**WARNING**: Web units perform potentially malicious actions. Only use against authorized targets.

**Use Cases**:
- Automated web vulnerability scanning
- Directory and file discovery
- Form-based authentication bypass
- Session hijacking and cookie manipulation

### 15. ZIP (ZIP Archive Analysis)

| Unit | Description | Tools |
|------|-------------|-------|
| `unzip` | ZIP archive extraction | Python zipfile |

**Use Cases**:
- Extracting ZIP files
- Password-protected ZIP analysis
- Nested archive extraction

## Installation

### System Requirements

**Ubuntu/Debian**:
```bash
sudo apt update
sudo apt-get install -y python-tk tk-dev libffi-dev libssl-dev pandoc \
    libgmp3-dev libzbar-dev tesseract-ocr xsel libpoppler-cpp-dev libmpc-dev \
    libdbus-glib-1-dev ruby libenchant-2-dev apktool nodejs groff binwalk \
    foremost tcpflow poppler-utils exiftool steghide stegsnow bison ffmpeg \
    libgd-dev less
```

### Python Setup

**Standard Installation**:
```bash
# Create virtual environment
python3.7 -m venv env
source env/bin/activate

# Install Katana
python setup.py install
```

**Clean Slate (if installation fails)**:
```bash
# Remove existing environment
rm -rf env

# Recreate and reinstall
python3.7 -m venv env
source env/bin/activate
python setup.py install
```

**Alternative (older Ubuntu)**:
```bash
pip3.7 install virtualenv
virtualenv env
source env/bin/activate
python setup.py install
```

### Docker Installation

For easier dependency management, use Docker:

```bash
cd docker/
docker build -t katana .
docker run -it --rm -v $(pwd)/results:/app/results katana --help
```

See `docker/README.md` for detailed Docker usage.

## Usage

### Basic Usage

```bash
# Analyze a string
katana "RkxBR3t0aGlzX2lzX2FfYmFzZTY0X2ZsYWd9"

# Analyze a file
katana challenge.txt

# Analyze a URL
katana http://ctf.example.com/challenge

# Specify custom flag format
katana -f "FLAG{.*?}" challenge_data

# Force overwrite results directory
katana --force -f "CTF{.*?}" data.bin
```

### Advanced Options

```bash
# Limit to specific unit groups
katana --groups raw,crypto encoded_message.txt

# Exclude specific groups
katana --exclude-groups web suspicious_file.bin

# Set custom output directory
katana --output ./my_results challenge.dat

# Verbose output
katana -v challenge.txt

# Very verbose (debug mode)
katana -vv challenge.txt
```

### Results Management

Katana creates a `results/` directory containing:

- **Decoded data**: Text files with decoded content
- **Artifacts**: Extracted files, images, binaries
- **Logs**: Analysis progress and findings
- **Flags**: Matched flag patterns

**Important**: Katana will not run if `results/` already exists. Use `--force` to automatically remove it.

## Common Workflows

### 1. General CTF Challenge Analysis

```bash
# Run all units against a challenge file
katana --force -f "FLAG{.*?}" mystery_challenge.bin
```

Katana will:
1. Identify file type (magic detection)
2. Run applicable units based on priority
3. Recursively analyze discovered data
4. Extract and save artifacts
5. Report any flags found

### 2. Encoded Message Decryption

```bash
# Focus on encoding/crypto units
katana --groups raw,crypto -f "flag{.*?}" encoded.txt
```

Units will attempt:
- Base64, Base32, Base58, Base85 decoding
- Hexadecimal and binary conversion
- Caesar cipher (all rotations)
- ROT47, Atbash, reverse
- XOR brute force
- Substitution cipher solving (quipqiup)

### 3. Steganography Analysis

```bash
# Image steganography
katana --groups stego,forensics -f "CTF{.*?}" suspicious_image.png
```

Analysis includes:
- LSB extraction (zsteg, stegsolve)
- steghide password brute force
- binwalk file carving
- Metadata extraction

### 4. Web Challenge Reconnaissance

```bash
# Web application analysis (use responsibly!)
katana --groups web -f "flag{.*?}" http://ctf-web.example.com/
```

**WARNING**: This will perform active attacks. Ensure authorization.

Actions performed:
- Spider all pages
- Parse robots.txt
- Check for .git disclosure
- Test for SQLi/NoSQLi
- Attempt form manipulation
- Session cookie analysis

### 5. Network Forensics

```bash
# PCAP analysis
katana --groups pcap,forensics capture.pcap
```

Extracts:
- HTTP streams
- Transferred files
- FTP credentials
- DNS queries
- Raw TCP/UDP data

## Integration with CyberChef-MCP

Katana and CyberChef-MCP are complementary tools that can work together in CTF and security analysis workflows.

### Workflow Integration

```
┌──────────┐         ┌─────────────┐         ┌──────────────┐
│  Katana  │ ──────> │   Results   │ ──────> │ CyberChef    │
│          │         │  artifacts/ │         │     MCP      │
│  Analyze │         │   decoded/  │         │  Transform   │
└──────────┘         └─────────────┘         └──────────────┘
```

### Use Case 1: Processing Katana Output

**Scenario**: Katana extracts multiple Base64-encoded strings but doesn't fully decode them.

```bash
# Run Katana
katana --force challenge.txt

# Output: results/decoded_1.txt contains partially decoded data
# "SGVsbG8gV29ybGQ%21 encrypted: AES..."
```

**CyberChef-MCP Processing**:
```bash
# Using MCP client (Claude Desktop, etc.)
cyberchef_from_base64(input: "SGVsbG8gV29ybGQ=")
# Output: "Hello World"

cyberchef_url_decode(input: "SGVsbG8gV29ybGQ%21")
# Output: "SGVsbG8gV29ybGQ!"
```

### Use Case 2: Chaining Multiple Operations

**Scenario**: Katana finds hexadecimal data that needs multi-stage decoding.

**Katana Output**:
```
results/artifact_crypto_1.bin
4142434445464748494a4b4c
```

**CyberChef-MCP Recipe**:
```bash
# Create a bake recipe
cyberchef_bake(
  input: "4142434445464748494a4b4c",
  recipe: [
    { op: "From Hex", args: ["None"] },
    { op: "To Base64", args: ["A-Za-z0-9+/="] }
  ]
)
# Output: "QUJDREVGR0hJSks="
```

### Use Case 3: Format Conversion

**Scenario**: Convert Katana binary artifacts to analyzable formats.

```bash
# Katana extracts binary data
results/forensics/extracted_1.bin

# CyberChef-MCP to analyze
cyberchef_to_hexdump(input: <binary_data>)
cyberchef_entropy(input: <binary_data>)  # Detect compression/encryption
cyberchef_strings(input: <binary_data>)  # Extract printable strings
```

### Use Case 4: Cryptographic Operations

**Scenario**: Katana identifies encrypted data but lacks decryption keys.

**Katana Finding**:
```
results/crypto_analysis.txt
Possible AES encrypted data detected
Key hints in image metadata: "secretkey123"
```

**CyberChef-MCP Decryption**:
```bash
cyberchef_aes_decrypt(
  input: <encrypted_data>,
  arguments: {
    key: "secretkey123",
    mode: "CBC",
    iv: "0000000000000000"
  }
)
```

### Use Case 5: Data Extraction from Katana Web Spider

**Scenario**: Katana spiders a website and finds encoded parameters.

**Katana Output**:
```
results/web_spider.txt
http://example.com/data?payload=eyJmbGFnIjogImhpZGRlbiJ9
```

**CyberChef-MCP Extraction**:
```bash
# Extract URL parameter
cyberchef_url_decode(input: "eyJmbGFnIjogImhpZGRlbiJ9")

# Decode Base64 JSON
cyberchef_from_base64(input: "eyJmbGFnIjogImhpZGRlbiJ9")
# Output: {"flag": "hidden"}

# Extract JSON field
cyberchef_jq(input: '{"flag": "hidden"}', arguments: {filter: ".flag"})
# Output: "hidden"
```

### Recommended MCP Tools for Katana Results

| Katana Category | Recommended CyberChef-MCP Tools |
|-----------------|----------------------------------|
| **Raw Encodings** | `from_base64`, `from_base32`, `from_hex`, `url_decode` |
| **Crypto** | `aes_decrypt`, `xor`, `rot13`, `vigenere_decode` |
| **Forensics** | `strings`, `entropy`, `to_hexdump`, `extract_files` |
| **Web** | `url_decode`, `parse_uri`, `jq` (JSON), `xpath` (XML) |
| **Stego** | `extract_lsb`, `zlib_inflate`, `gunzip` |
| **Binary** | `disassemble_x86`, `to_hexdump`, `parse_tcp` |

### Automation Pipeline Example

**Python Script**: Katana + CyberChef-MCP Integration
```python
import subprocess
import json

# Run Katana
subprocess.run(["katana", "--force", "-f", "FLAG{.*?}", "challenge.bin"])

# Read Katana results
with open("results/decoded_1.txt") as f:
    katana_output = f.read()

# Process with CyberChef-MCP via Python MCP client
from mcp import Client

client = Client("cyberchef-mcp")
result = client.call_tool("cyberchef_from_base64", {"input": katana_output})
print(f"Final decoded: {result}")
```

## Security Considerations

### Malicious Behavior Warning

Katana **automatically runs potentially malicious actions**:
- SQL injection attempts
- NoSQL injection payloads
- Web shell uploads
- Form manipulation
- Local file inclusion tests
- Remote code execution attempts

**CRITICAL**: Only use Katana against systems you are authorized to test.

### Legal Disclaimer

The authors do not claim responsibility for:
- Unauthorized use against systems without permission
- Damage caused to target systems
- Legal consequences of misuse

### Safe Usage Guidelines

1. **Authorization**: Obtain explicit written permission before testing
2. **Scope Limits**: Define and respect testing boundaries
3. **Logging**: Maintain audit logs of all testing activities
4. **Responsible Disclosure**: Report findings appropriately
5. **CTF Only**: Primarily designed for CTF competitions and authorized pentests

### Isolation Recommendations

When analyzing potentially malicious files:
- Use Docker containers for isolation
- Employ network segmentation
- Monitor system calls (strace, ltrace)
- Use virtual machines with snapshots
- Disable network access if analyzing malware samples

## Known Issues

### Common Errors and Solutions

| Error | Solution |
|-------|----------|
| `ModuleNotFoundError: No module named 'colorama'` | `pip install colorama` |
| `TypeError: __init__() got unexpected keyword argument 'choices_method'` | `pip uninstall cmd2 && pip install cmd2==1.0.1` |
| `results directory already exists` | Use `--force` flag or manually remove `results/` |
| Dependencies missing | Run full Ubuntu dependency installation commands |
| Python version incompatibility | Ensure Python 3.7+ is used |

### Platform Limitations

- **Windows**: Limited support; use Docker or WSL2
- **macOS**: Some forensics tools may require manual compilation
- **Architecture**: Primarily tested on x86_64 Linux

## Contributing

Katana welcomes contributions! See [CONTRIBUTING.md](https://github.com/JohnHammond/katana/blob/master/CONTRIBUTING.md) for guidelines.

### Adding New Units

1. Create a new unit file in `katana/units/<category>/`
2. Inherit from `Unit` or `RegexUnit` base class
3. Implement `evaluate()` method
4. Set `GROUPS`, `PRIORITY`, and other class attributes
5. Add comprehensive docstrings (Google style)
6. Create unit tests in `tests/<category>/`
7. Submit pull request

**Example Unit Template**:
```python
from katana.unit import Unit as BaseUnit
from katana.unit import NotApplicable

class Unit(BaseUnit):
    GROUPS = ["category", "tag1", "tag2"]
    PRIORITY = 50  # 0=highest, 100=lowest

    def __init__(self, *args, **kwargs):
        super(Unit, self).__init__(*args, **kwargs)
        # Pre-flight checks
        if not self.target.is_printable:
            raise NotApplicable("requires printable data")

    def evaluate(self, case):
        # Analysis logic
        result = self.analyze(self.target.raw)
        if result:
            self.manager.register_data(self, result)
```

### Testing Requirements

- Use `KatanaTest` class from `tests/`
- Generate test data dynamically (avoid external files)
- Test both positive and negative cases
- Ensure units gracefully fail with `NotApplicable`

## Credits and Acknowledgments

### Original Authors
- **John Hammond** - Lead Developer
- **Caleb Stewart** - Co-Developer

### Community Contributors

Special thanks to Discord community members who contributed units:

| Unit | Contributors |
|------|--------------|
| `crypto.dna` | voidUpdate, Zwedgy |
| `crypto.t9` | Zwedgy, r4j |
| `esoteric.ook` | Liikt |
| `esoteric.cow` | Drnkn |
| `stego.audio_spectrogram` | Zwedgy |
| `stego.dtmf_decoder` | Zwedgy |
| `stego.whitespace` | l14ck3r0x01 |
| `hash.md5` | John Kazantzis |
| `esoteric.jsfuck` | Zwedgy |
| `crypto.playfair` | voidUpdate |
| `crypto.nato_phonetic` | voidUpdate |

## Additional Resources

### Documentation
- **Official Docs**: [https://ctf-katana.readthedocs.io](https://ctf-katana.readthedocs.io)
- **GitHub Repository**: [https://github.com/JohnHammond/katana](https://github.com/JohnHammond/katana)
- **Original CTF Guide**: [https://github.com/JohnHammond/ctf-katana](https://github.com/JohnHammond/ctf-katana)

### Related Tools
- **CyberChef**: Recipe-based data transformation (this project)
- **Ciphey**: AI-powered automated decoder
- **binwalk**: Firmware analysis and extraction
- **stegsolve**: Image steganography analysis
- **zsteg**: PNG/BMP steganography detection

### Learning Resources
- CTF Writeups using Katana
- CTF challenge archives (CTFTime)
- Steganography tutorials
- Classical cryptography guides

## Appendix: Complete Unit Reference

### Priority Hierarchy

| Priority Range | Unit Types | Examples |
|----------------|------------|----------|
| 0-20 | Critical/Fast | Web spider (20) |
| 21-40 | High Priority | Base64 (25), Quipqiup (30) |
| 41-60 | Normal | Most crypto/stego units (50) |
| 61-80 | Low Priority | Base32 (60), Base85 (60) |
| 81-100 | Very Low | Experimental/slow units |

### File Type Detection

Katana uses `python-magic` (libmagic) to identify file types and selectively apply units:

- **Images**: OCR, steganography units
- **Archives**: Extraction units (zip, tar, gzip)
- **Binaries**: Reverse engineering units
- **Text**: Encoding and crypto units
- **PCAP**: Network forensics units
- **PDFs**: PDF extraction units

### Recursion and Target Spawning

When a unit discovers new data:
1. Manager registers the finding
2. Creates a new `Target` object
3. Queues target for analysis
4. Runs applicable units on new target
5. Process repeats until no new data

**Recursion Limits**:
- Web spider: Protected recursion (avoids infinite loops)
- General units: Depth limit to prevent exponential growth
- Time limits configurable via CLI

---

**Document Version**: 1.0
**Last Updated**: 2025-12-17
**Maintained By**: CyberChef-MCP Documentation Team
