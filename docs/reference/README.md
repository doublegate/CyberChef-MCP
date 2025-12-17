# Reference Projects Index

Comprehensive documentation for security tools and projects that complement or integrate with CyberChef-MCP.

**Total Projects:** 11 | **Documentation Size:** ~289KB

---

## Quick Navigation

| Category | Projects |
|----------|----------|
| **Core CyberChef** | [CyberChef Upstream](#cyberchef-upstream), [CyberChef Server](#cyberchef-server), [CyberChef Recipes](#cyberchef-recipes) |
| **Encoding/Decoding** | [cryptii](#cryptii), [Ciphey](#ciphey), [xortool](#xortool) |
| **Password & Hash** | [John the Ripper](#john-the-ripper) |
| **RSA & Cryptanalysis** | [RsaCtfTool](#rsactftool) |
| **CTF & Exploitation** | [pwntools](#pwntools), [Ares](#ares) |
| **Web Reconnaissance** | [katana](#katana) |

---

## Project Summaries

### CyberChef Upstream

**Documentation:** [cyberchef-upstream.md](cyberchef-upstream.md)

**Description:** The original GCHQ CyberChef - a web-based data transformation and analysis tool with 300+ operations for encoding, encryption, compression, and forensics.

**Use Cases:**
- Data format conversion (Base64, hex, binary, etc.)
- Encryption/decryption operations (AES, DES, Blowfish, etc.)
- Hash generation and analysis (MD5, SHA family, etc.)
- Network data parsing (IP, URL, email extraction)
- Forensic analysis (file signatures, timestamps, metadata)

**CyberChef-MCP Relevance:** Direct upstream - all operations from this codebase are exposed as MCP tools.

---

### CyberChef Server

**Documentation:** [cyberchef-server.md](cyberchef-server.md)

**Description:** REST API wrapper around CyberChef's Node.js API, enabling headless/programmatic access to CyberChef operations via HTTP endpoints.

**Use Cases:**
- Batch processing of data transformations
- Integration into CI/CD pipelines
- Backend services requiring encoding/decryption
- Automated forensic workflows
- API-first security tooling

**CyberChef-MCP Relevance:** Alternative integration pattern - demonstrates REST API approach vs MCP's native tool model.

---

### CyberChef Recipes

**Documentation:** [cyberchef-recipes.md](cyberchef-recipes.md)

**Description:** Community-curated collection of real-world CyberChef recipes for malware analysis, forensics, CTF challenges, and data extraction.

**Use Cases:**
- Malware deobfuscation (PowerShell, JavaScript, VBA)
- Network traffic analysis (DNS, HTTP, PCAP data)
- Log parsing and normalization
- CTF challenge solving patterns
- Forensic artifact extraction

**CyberChef-MCP Relevance:** Recipe patterns can be translated to `cyberchef_bake` tool calls for complex multi-step transformations.

---

### cryptii

**Documentation:** [cryptii.md](cryptii.md)

**Description:** Modern web-based modular encoding/decoding tool with a Brick-based composition system for transparent format conversion.

**Use Cases:**
- Historical cipher encoding (Caesar, Vigenere, Enigma)
- Character encoding transformations (ASCII, Unicode, EBCDIC)
- Number system conversions (binary, octal, decimal, hex)
- Text transformations (case, spelling alphabets)
- Educational cryptography demonstrations

**CyberChef-MCP Relevance:** Complementary encoding coverage - cryptii excels at historical ciphers where CyberChef may have gaps.

---

### Ciphey

**Documentation:** [ciphey.md](ciphey.md)

**Description:** AI-powered automatic decryption tool using natural language processing and the AuSearch algorithm to identify and decode unknown ciphertext.

**Use Cases:**
- Unknown cipher identification and decryption
- CTF challenge automation
- Multi-layer encoding detection
- Forensic evidence decoding
- Rapid triage of encrypted data

**CyberChef-MCP Relevance:** Automated decryption pipeline - use Ciphey for identification, then CyberChef-MCP for controlled transformations.

---

### xortool

**Documentation:** [xortool.md](xortool.md)

**Description:** Specialized XOR cipher analysis tool for key length detection, key recovery, and decryption of XOR-encrypted data.

**Use Cases:**
- XOR key length analysis (chi-squared, Hamming distance)
- Single-byte XOR key brute-forcing
- Multi-byte XOR key recovery
- Malware payload decryption
- CTF XOR challenge solving

**CyberChef-MCP Relevance:** Direct complement to CyberChef's XOR operation - xortool analyzes, CyberChef-MCP decrypts with recovered keys.

---

### John the Ripper

**Documentation:** [john-the-ripper.md](john-the-ripper.md)

**Description:** Industry-standard password security auditing tool supporting 400+ hash formats with dictionary, brute-force, and rule-based attacks.

**Use Cases:**
- Password hash cracking (MD5, SHA, bcrypt, etc.)
- Hash format identification
- Password policy auditing
- Penetration testing credential recovery
- Forensic password analysis

**CyberChef-MCP Relevance:** Hash pipeline - CyberChef-MCP generates/identifies hashes, John cracks them, results feed back for further analysis.

---

### RsaCtfTool

**Documentation:** [rsactftool.md](rsactftool.md)

**Description:** Comprehensive RSA attack toolkit implementing 40+ cryptanalytic attacks for weak RSA key recovery and ciphertext decryption.

**Use Cases:**
- Weak RSA key factorization
- Small public exponent attacks
- Common modulus attacks
- Partial key recovery
- CTF RSA challenge automation

**CyberChef-MCP Relevance:** RSA analysis pipeline - extract RSA parameters with CyberChef-MCP, attack with RsaCtfTool, decrypt with recovered keys.

---

### pwntools

**Documentation:** [pwntools.md](pwntools.md)

**Description:** Python CTF framework and exploit development library providing process interaction, shellcode generation, ROP chain building, and format string utilities.

**Use Cases:**
- CTF challenge automation
- Binary exploitation development
- Shellcode generation and encoding
- Remote service interaction
- Format string attack construction

**CyberChef-MCP Relevance:** Exploit encoding pipeline - pwntools generates payloads, CyberChef-MCP encodes/transforms for delivery.

---

### Ares

**Documentation:** [ares.md](ares.md)

**Description:** Python-based command and control (C2) framework for authorized security testing with agent management, task execution, and payload generation.

**Use Cases:**
- Authorized penetration testing
- Red team operations
- Security awareness training
- Incident response simulation
- Defense testing and validation

**CyberChef-MCP Relevance:** Payload transformation - encode/obfuscate C2 payloads using CyberChef-MCP operations for evasion testing.

---

### katana

**Documentation:** [katana.md](katana.md)

**Description:** ProjectDiscovery's next-generation web crawling and spidering framework with JavaScript rendering support and customizable extraction.

**Use Cases:**
- Web application reconnaissance
- JavaScript-rendered content extraction
- Form and endpoint discovery
- Security assessment crawling
- Bug bounty target mapping

**CyberChef-MCP Relevance:** Data extraction pipeline - katana discovers URLs/endpoints, CyberChef-MCP processes extracted data.

---

## Integration Patterns

### Pattern 1: Analysis Pipeline
```
Input Data -> CyberChef-MCP (decode) -> Specialized Tool (analyze) -> CyberChef-MCP (transform) -> Output
```
**Example:** Base64 decode with CyberChef-MCP, XOR analysis with xortool, decrypt with recovered key via CyberChef-MCP.

### Pattern 2: Identification First
```
Unknown Data -> Ciphey/Analysis Tool (identify) -> CyberChef-MCP (targeted operation)
```
**Example:** Ciphey identifies unknown encoding, CyberChef-MCP applies specific decode operation.

### Pattern 3: Generation Pipeline
```
Specialized Tool (generate) -> CyberChef-MCP (encode/transform) -> Delivery
```
**Example:** pwntools generates shellcode, CyberChef-MCP applies XOR encoding for delivery.

### Pattern 4: Batch Processing
```
CyberChef Server/MCP -> Multiple Operations -> Aggregated Results
```
**Example:** Process multiple hash formats, encoding schemes, or file samples in parallel.

---

## Category Details

### Core CyberChef Ecosystem

| Project | Primary Function | Integration Method |
|---------|-----------------|-------------------|
| CyberChef Upstream | Operation library | Direct (source code) |
| CyberChef Server | REST API access | HTTP/Docker bridge |
| CyberChef Recipes | Recipe patterns | `cyberchef_bake` translation |

### Encoding & Cryptanalysis

| Project | Specialization | Complementary Operations |
|---------|---------------|-------------------------|
| cryptii | Historical ciphers | Caesar, Vigenere, Enigma variants |
| Ciphey | Auto-detection | Unknown cipher identification |
| xortool | XOR analysis | Key recovery for XOR operations |
| RsaCtfTool | RSA attacks | RSA parameter extraction/decryption |

### Security Testing

| Project | Domain | CyberChef-MCP Role |
|---------|--------|-------------------|
| John the Ripper | Password hashes | Hash generation/format conversion |
| pwntools | Exploit development | Payload encoding/transformation |
| Ares | C2 framework | Payload obfuscation |
| katana | Web reconnaissance | Data extraction/parsing |

---

## Getting Started

1. **Browse by category** to find tools relevant to your use case
2. **Read individual documentation** for technical details and integration guidance
3. **Follow integration patterns** for combining tools effectively
4. **Reference the CyberChef-MCP operations** that complement each tool

---

## Contributing

To add new reference documentation:

1. Create a new `.md` file in this directory following the existing format
2. Include sections: Overview, Technical Architecture, Integration with CyberChef-MCP, Use Cases
3. Update this README.md index with the new project entry
4. Submit a pull request with the new documentation

---

## Related Documentation

- [CyberChef-MCP Commands Guide](../guides/commands.md)
- [Architecture Overview](../architecture/architecture.md)
- [User Guide](../guides/user_guide.md)

---

**Last Updated:** December 2025
