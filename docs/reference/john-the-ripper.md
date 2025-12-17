# John the Ripper - Technical Reference

## Overview

**Project Name:** John the Ripper (Jumbo Community Edition)

**Description:** Fast password security auditing and recovery tool designed to detect weak passwords through various cracking methodologies. The "jumbo" version is the community-enhanced edition with extensive hash format support and advanced features.

**Authors:**
- Solar Designer (Alexander Peslyak) - Core developer
- Openwall Project - Primary maintainers
- Community contributors - Jumbo enhancements

**License:** GNU GPL v2+ with special exceptions for OpenSSL and unRAR linking

**Repository:** https://github.com/openwall/john

**Website:** https://www.openwall.com/john/

**Mailing List:** https://www.openwall.com/lists/john-users/

**Current Version:** 1.9.0-Jumbo-1+ (bleeding-jumbo branch)

## Key Features

### Core Capabilities
- **366+ Hash Format Support** - Extensive coverage of password hash types across platforms and applications
- **115+ Conversion Utilities** - *2john tools for extracting hashes from various file formats
- **Multiple Cracking Modes** - Single crack, wordlist, incremental, markov, mask, regex, and hybrid modes
- **Rule Engine** - Powerful word mangling system with customizable transformation rules
- **GPU Acceleration** - OpenCL and CUDA support for massive performance gains
- **Cross-Platform** - Unix/Linux, macOS, Windows, DOS, BeOS, OpenVMS
- **Session Management** - Pause, resume, and recover cracking sessions
- **Distributed Computing** - Built-in support for cracking across multiple systems

### Advanced Features
- **Incremental Mode** - Tries all possible character combinations with optimized trigraph analysis
- **External Mode** - Custom cracking modes using built-in C-subset compiler
- **Markov Chains** - Statistical password generation based on character probability
- **Mask Attack** - Template-based candidate generation (e.g., ?u?l?l?l?d?d?d?d)
- **Hybrid Modes** - Stack multiple modes (wordlist + rules + mask)
- **Dynamic Formats** - Runtime-defined hash format support
- **OpenMP Parallelization** - Multi-core CPU optimization

## Technical Architecture

### Core Design

John the Ripper is implemented in **C** with assembly optimizations for performance-critical sections. The architecture follows a modular design:

```
┌─────────────────────────────────────────────┐
│         Command Line Interface              │
│         (john, unshadow, *2john)            │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         Core Engine (src/john.c)            │
│  - Session management                       │
│  - Mode orchestration                       │
│  - Status reporting                         │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────┴──────────┬──────────────┐
        │                     │              │
┌───────▼────────┐  ┌─────────▼─────┐  ┌────▼────────┐
│ Format Plugins │  │ Cracking Modes│  │ Rule Engine │
│ (366+ formats) │  │ - Single      │  │ - Wordlist  │
│ - Unix crypt   │  │ - Wordlist    │  │   rules     │
│ - Windows      │  │ - Incremental │  │ - External  │
│ - Web apps     │  │ - Markov      │  │   filters   │
│ - Archives     │  │ - Mask        │  │             │
│ - Filesystems  │  │ - Regex       │  │             │
└────────────────┘  └───────────────┘  └─────────────┘
```

### Hash Format Support

John the Ripper supports **366+ hash formats** through modular format plugins. Key categories:

#### Unix/Linux Systems
- Traditional DES crypt
- BSDI extended DES
- FreeBSD MD5 (also Cisco IOS)
- OpenBSD Blowfish (bcrypt)
- SHA-256-crypt, SHA-512-crypt
- AIX {smd5}, {ssha256}, {ssha512}
- Solaris MD5, SunMD5

#### Windows
- LM hashes (legacy DES-based)
- NTLM (MD4-based)
- Windows Hello PIN
- Domain Cached Credentials (DCC, DCC2)
- Kerberos 5 TGT/TGS

#### Web Applications
- Raw MD5, SHA-1, SHA-256, SHA-512
- PBKDF2-HMAC-SHA1/SHA256/SHA512
- bcrypt, scrypt, Argon2
- Django, Drupal, Joomla, phpBB formats
- MediaWiki, WordPress

#### Databases
- MySQL, PostgreSQL
- Microsoft SQL Server
- Oracle 11g/12c
- MongoDB, Sybase

#### Network Protocols
- WPA/WPA2-PSK (Wi-Fi)
- Kerberos AFS
- IKE PSK (IPsec)
- CRAM-MD5, DIGEST-MD5
- SIP, HTTP Digest Auth
- NTLMv1/v2 (network auth)

#### Encrypted Files & Archives
- ZIP (PKZIP, WinZip AES)
- RAR3, RAR5
- 7-Zip
- PDF (various encryption types)
- Microsoft Office (97-2019, 365)
- OpenDocument formats
- Apple DMG, encrypted sparse bundles
- BitLocker, FileVault2, LUKS
- VeraCrypt, TrueCrypt
- AxCrypt, BestCrypt

#### Cryptocurrency Wallets
- Bitcoin Core
- Ethereum
- Litecoin, Dogecoin
- MultiBit, Electrum
- blockchain.com wallet

#### SSH & Certificates
- SSH private keys (RSA, DSA, ECDSA, Ed25519)
- PGP/GPG private keys
- PKCS#12 (.p12, .pfx)
- X.509 certificates

#### Application-Specific
- 1Password (Agile Keychain, OPVault)
- LastPass
- KeePass (1.x, 2.x, KDBX3/4)
- EncFS, LUKS
- Android backup encryption
- iTunes backup encryption
- Signal encrypted backups

### Cracking Modes

#### 1. Single Crack Mode
**Strategy:** Leverage user metadata (username, GECOS field, home directory) as password candidates

**Features:**
- Automatic mangling of account-specific information
- Fast execution (same-salt optimization)
- Seeds option for common organizational terms
- GPU-compatible (with limitations)

**Usage:**
```bash
john --single mypasswd
john --single --single-seed=CompanyName,Product mypasswd
```

**When to Use:** Always run first - catches weak passwords based on personal info

#### 2. Wordlist Mode
**Strategy:** Dictionary attack with optional rule-based transformations

**Features:**
- External wordlist support
- Powerful rule engine (see RULES documentation)
- Efficient duplicate handling
- Supports stdin input

**Usage:**
```bash
john --wordlist=rockyou.txt mypasswd
john --wordlist=custom.txt --rules=Jumbo mypasswd
```

**When to Use:** Primary attack mode after single crack

#### 3. Incremental Mode
**Strategy:** Brute-force all character combinations with statistical optimization

**Features:**
- Trigraph frequency analysis
- Character position optimization
- Configurable charsets (ASCII, Alnum, Alpha, Digits, etc.)
- Length-aware probability ordering

**Predefined Charsets:**
- `ASCII` - All 95 printable ASCII (lengths 1-13)
- `Alnum` - Alphanumeric (a-z, A-Z, 0-9)
- `Alpha` - Letters only (a-z, A-Z)
- `LowerNum` - Lowercase + digits
- `Digits` - Numbers only (lengths 1-20)

**Usage:**
```bash
john --incremental=Alnum mypasswd
john --incremental=ASCII mypasswd
```

**When to Use:** Last resort or targeted short-password attacks

#### 4. Markov Mode
**Strategy:** Generate candidates based on character probability chains

**Features:**
- Statistical modeling of real passwords
- Adjustable Markov levels
- More efficient than pure brute-force

**Usage:**
```bash
john --markov mypasswd
john --markov=200 mypasswd  # Markov level 200
```

**When to Use:** More targeted than incremental, less reliant on wordlists

#### 5. Mask Mode
**Strategy:** Template-based generation with character class placeholders

**Character Classes:**
- `?l` - lowercase (a-z)
- `?u` - uppercase (A-Z)
- `?d` - digits (0-9)
- `?s` - special characters (!@#$%...)
- `?a` - all printable ASCII
- `?w` - wordlist placeholder (hybrid mode)

**Usage:**
```bash
john --mask='?u?l?l?l?l?d?d' mypasswd          # Aaaaa12
john --mask='?w?d?d' --wordlist=names.txt      # Hybrid
```

**When to Use:** Known password patterns (e.g., Capital + 4 letters + 2 digits)

**GPU Acceleration:** Full GPU support with massive speedups

#### 6. Regex Mode
**Strategy:** Generate candidates matching regular expressions

**Features:**
- Full regex syntax support
- Hybrid stacking with other modes
- More powerful than mask mode

**Usage:**
```bash
john --regex='[A-Z][a-z]{4,8}[0-9]{2,4}' mypasswd
john --regex='\0\d\d' --wordlist=base.txt      # Hybrid
```

**When to Use:** Complex pattern requirements beyond mask capabilities

#### 7. Hybrid/Stacked Modes
**Strategy:** Combine multiple modes in a pipeline

**Stacking Order:**
```
Base Mode → Rules (optional) → Regex (optional) → Mask (optional) → External Filter (optional)
```

**Examples:**
```bash
# Wordlist + Rules + Mask
john --wordlist=names.txt --rules --mask='?w?d?d?d'

# Stdin + Regex + Mask
cat base.txt | john --stdin --regex='\0[!@#]' --mask='?w?s?d?d'
```

**When to Use:** Complex transformations requiring multiple amplifiers

### GPU Acceleration

#### OpenCL Support
- **Vendors:** NVIDIA (CUDA), AMD (ROCm/OpenCL), Intel
- **Platforms:** Linux, macOS, Windows
- **Temperature Monitoring:** Built-in GPU thermal management (default 95°C limit)
- **CPU Fallback:** Intel/AMD OpenCL CPU runtimes available

#### Performance Considerations
- **Startup Overhead:** GPU formats have longer initialization
- **Fast Formats:** CPU may outperform GPU on very fast hashes (e.g., raw MD5)
- **Slow Formats:** Massive speedups on algorithms like bcrypt, PBKDF2
- **Memory Requirements:** Single mode on GPU may need significant VRAM

#### Compilation
```bash
./configure                    # Auto-detect OpenCL
./configure --disable-opencl   # Force CPU-only build
make -sj4
```

### Hash Extraction Utilities

John includes **115+ *2john converters** to extract password hashes from various file formats:

#### Common Utilities
- `zip2john` - ZIP archives
- `rar2john` - RAR archives
- `pdf2john` - PDF files
- `office2john.py` - Microsoft Office documents
- `ssh2john.py` - SSH private keys
- `keepass2john` - KeePass databases
- `bitcoin2john.py` - Bitcoin wallets
- `ansible2john.py` - Ansible vault files
- `gpg2john` - PGP/GPG private keys
- `dmg2john.py` - macOS disk images

#### Usage Pattern
```bash
# Extract hash from file
zip2john encrypted.zip > hash.txt

# Crack the hash
john hash.txt
```

## Integration with CyberChef-MCP

### Complementary Operations

CyberChef and John the Ripper form a powerful security analysis pipeline:

#### CyberChef → John Workflow

**1. Hash Identification**
```
CyberChef Operations:
├─ cyberchef_analyse_hash - Identify hash type
├─ cyberchef_entropy - Assess password randomness
└─ cyberchef_from_hex/from_base64 - Decode encoded hashes
```

**2. Hash Extraction from Data**
```
CyberChef Operations:
├─ cyberchef_extract_hashes - Pull hashes from text
├─ cyberchef_regular_expression - Custom hash extraction
└─ cyberchef_find_replace - Clean hash formats
```

**3. Hash Generation for Validation**
```
CyberChef Operations:
├─ cyberchef_md5/sha1/sha256 - Generate test hashes
├─ cyberchef_bcrypt/scrypt - Create slow hashes
└─ cyberchef_pbkdf2 - Generate PBKDF2 hashes
```

#### John → CyberChef Workflow

**1. Password Analysis**
```
After cracking with John:
├─ cyberchef_entropy - Measure password strength
├─ cyberchef_frequencies - Character distribution
└─ cyberchef_generate_qr_code - Share securely
```

**2. Wordlist Processing**
```
CyberChef Operations for Wordlist Creation:
├─ cyberchef_to_lower_case/to_upper_case - Case transforms
├─ cyberchef_reverse - Reverse strings
├─ cyberchef_substitute - Character substitutions (l33t speak)
├─ cyberchef_add_line_numbers - Track origins
└─ cyberchef_sort/unique - Deduplicate wordlists
```

**3. Hash Format Conversion**
```
CyberChef Operations:
├─ cyberchef_to_hex/from_hex - Format conversion
├─ cyberchef_to_base64/from_base64 - Encoding
└─ cyberchef_split/merge - Combine hash components
```

### Practical Integration Examples

#### Example 1: Extract and Identify Hashes from Log File

**Step 1 - CyberChef (Extract):**
```javascript
// Use cyberchef_extract_hashes or cyberchef_regular_expression
Input: access.log
Operation: Extract hashes
Output: List of potential password hashes
```

**Step 2 - CyberChef (Identify):**
```javascript
// Use cyberchef_analyse_hash
Input: $2a$10$abcd1234...
Output: "Blowfish (bcrypt)"
```

**Step 3 - John (Crack):**
```bash
# Save hashes to file, run John
john --format=bcrypt --wordlist=rockyou.txt hashes.txt
```

#### Example 2: Create Custom Wordlist with CyberChef Transformations

**CyberChef Recipe for Wordlist Enhancement:**
```javascript
// Base wordlist: company terms, product names
Operations:
1. Fork (split into parallel operations)
2. To Lower Case
3. To Upper Case
4. To Title Case
5. Substitute (a→@, e→3, i→1, o→0, s→$)
6. Add Line Numbers (for tracking)
7. Merge (recombine)
8. Sort
9. Unique (deduplicate)
10. Filter (length > 6)

Output: Enhanced wordlist for John
```

**Feed to John:**
```bash
john --wordlist=cyberchef_wordlist.txt --rules=Jumbo hashes.txt
```

#### Example 3: Hash Format Preparation

**Scenario:** Extract NTLM hashes from memory dump

**CyberChef Operations:**
```javascript
1. From Hex Dump (if needed)
2. Regular Expression: [a-f0-9]{32} (extract NTLM hashes)
3. Find/Replace: Add "user:" prefix
4. Split: '\n' delimiter
5. Merge: Create john-compatible format
   Format: username:hash or just hash per line
```

**John Crack:**
```bash
john --format=NT ntlm_hashes.txt
```

#### Example 4: Analyze Cracked Passwords

**After John cracks passwords:**
```bash
john --show cracked.txt > passwords.txt
```

**CyberChef Analysis:**
```javascript
1. Entropy (measure complexity)
2. Frequency Distribution (character usage)
3. Unique (find patterns)
4. Length (stats on password lengths)
5. Generate Chart (visualize distribution)
```

### MCP Integration Strategy

#### Workflow Automation

**Hash Identification Tool:**
```json
{
  "name": "cyberchef_analyse_hash",
  "input": "hash_string",
  "output": {
    "type": "MD5|SHA1|bcrypt|NTLM|...",
    "john_format": "--format=raw-md5",
    "confidence": "high|medium|low"
  }
}
```

**Recommended John Command Generator:**
Based on CyberChef hash analysis, MCP could suggest:
```bash
# For identified bcrypt hash
john --format=bcrypt --wordlist=rockyou.txt hash.txt

# For NTLM with known pattern
john --format=NT --mask='?u?l?l?l?l?d?d' hash.txt
```

#### Data Flow

```
User Input (Suspicious Hash)
    ↓
CyberChef-MCP: cyberchef_analyse_hash
    ↓
Identified: SHA-256
    ↓
Recommendation: Use John with --format=raw-sha256
    ↓
User: Runs John the Ripper
    ↓
Cracked Password
    ↓
CyberChef-MCP: cyberchef_entropy (validate strength)
```

### Hash Format Reference Table

| Hash Type | CyberChef Detection | John Format Flag | Common Source |
|-----------|-------------------|------------------|---------------|
| MD5 | 32 hex chars | `--format=raw-md5` | Legacy web apps |
| SHA-1 | 40 hex chars | `--format=raw-sha1` | Git, legacy systems |
| SHA-256 | 64 hex chars | `--format=raw-sha256` | Modern web apps |
| bcrypt | `$2a$`/`$2b$` prefix | `--format=bcrypt` | Modern Unix/web |
| NTLM | 32 hex chars (context) | `--format=NT` | Windows networks |
| LM | 32 hex chars (context) | `--format=LM` | Legacy Windows |
| SHA-512-crypt | `$6$` prefix | `--format=sha512crypt` | Modern Linux |
| PBKDF2-SHA256 | `sha256:` prefix | `--format=PBKDF2-HMAC-SHA256` | Various apps |
| Argon2 | `$argon2` prefix | `--format=argon2` | Modern systems |
| WPA/WPA2 | EAPOL structure | `--format=wpapsk` | Wi-Fi captures |
| ZIP | From zip2john | `--format=zip` | Encrypted archives |
| PDF | From pdf2john | `--format=pdf` | Protected PDFs |

## Use Cases

### 1. Password Auditing

**Scenario:** Assess organizational password strength

**Workflow:**
1. Export user hashes from authentication system
2. Run John in audit mode (no actual cracking)
3. Apply organizational policy rules
4. Generate compliance report

**Commands:**
```bash
# Quick policy check
john --incremental=Digits --max-length=6 hashes.txt
john --show hashes.txt | grep -c "^[0-9]"  # Count numeric-only

# Wordlist compliance test
john --wordlist=common_passwords.txt --rules=Single hashes.txt
```

**Deliverables:**
- Percentage of weak passwords
- Common patterns identified
- Policy violation list

### 2. Penetration Testing

**Scenario:** Authorized security assessment

**Workflow:**
1. Obtain password hashes (via exploitation, dump, social engineering)
2. Use John with targeted attacks based on reconnaissance
3. Pivot with cracked credentials
4. Document findings

**Attack Progression:**
```bash
# Phase 1: Quick wins
john --single hashes.txt
john --wordlist=org_terms.txt --rules hashes.txt

# Phase 2: Contextual
john --mask='?u?l?l?l?l20[12][0-9]' hashes.txt  # Aaaaa2019

# Phase 3: Deep crack (limited time)
timeout 4h john --incremental=Alnum hashes.txt
```

**Integration Points:**
- Use CyberChef to extract hashes from memory dumps
- Format conversion with CyberChef (hex, base64)
- Credential validation via hash generation

### 3. Forensic Investigations

**Scenario:** Recover encrypted evidence

**Common Targets:**
- Encrypted archives (ZIP, RAR, 7z)
- Protected documents (PDF, Office)
- Encrypted containers (TrueCrypt, VeraCrypt, BitLocker)
- Cryptocurrency wallets
- Encrypted backups (iTunes, Android)

**Workflow:**
```bash
# Extract hash from evidence
zip2john evidence.zip > evidence_hash.txt

# Crack with contextual wordlist
john --wordlist=suspect_terms.txt --rules evidence_hash.txt

# Brute-force with known pattern
john --mask='?u?l?l?l?l?d?d?d?d' evidence_hash.txt
```

**CyberChef Integration:**
- Build suspect-specific wordlists from communications
- Extract dates, names, locations from documents
- Generate variations with l33t speak substitutions

### 4. Hash Recovery

**Scenario:** Legitimate password recovery

**Use Cases:**
- Lost database credentials
- Legacy system access
- Orphaned encrypted files
- Archive recovery

**Strategy:**
```bash
# Known partial information
john --mask='KnownPrefix?d?d?d?d' hash.txt

# Time-bounded attempt
timeout 24h john --incremental hash.txt

# Resume after interruption
john --restore
```

### 5. Security Research

**Scenario:** Password strength analysis, algorithm testing

**Research Applications:**
- Benchmark hash algorithm resistance
- Study real-world password patterns
- Evaluate new cracking techniques
- Test custom hash implementations

**Experimental Modes:**
```bash
# Test custom external mode
john --external=CustomMode hashes.txt

# Dynamic format testing
john --format=dynamic='md5(md5($p).$s)' hashes.txt

# Markov parameter optimization
john --markov=100 --markov:MaxLen=12 hashes.txt
```

## Command Reference

### Essential Commands

```bash
# Basic cracking (automatic mode selection)
john hashes.txt

# Specific mode
john --single hashes.txt
john --wordlist=rockyou.txt --rules hashes.txt
john --incremental=Alnum hashes.txt
john --mask='?u?l?l?l?d?d?d?d' hashes.txt

# Show cracked passwords
john --show hashes.txt

# Resume interrupted session
john --restore

# Status check (press any key during cracking, or)
john --status

# List supported formats
john --list=formats

# Format-specific cracking
john --format=bcrypt hashes.txt
john --format=NT ntlm_hashes.txt

# Time-limited cracking
timeout 1h john --incremental hashes.txt

# Multi-file cracking
john passwd1 passwd2 passwd3

# GPU acceleration (if compiled with OpenCL)
john --format=sha512crypt-opencl --devices=0,1 hashes.txt
```

### Advanced Options

```bash
# Session naming
john --session=my_session hashes.txt
john --restore=my_session

# Configuration override
john --config=custom.conf hashes.txt

# Incremental mode customization
john --incremental=ASCII --max-length=8 hashes.txt
john --incremental --min-length=8 --max-length=10 hashes.txt

# Wordlist stdin
cat wordlist.txt | john --stdin --rules hashes.txt

# Fork (parallel processing)
john --fork=4 hashes.txt

# Disable log file
john --no-log hashes.txt

# Verbosity
john --verbosity=5 hashes.txt
```

### Hash Extraction

```bash
# Unix shadow passwords
unshadow /etc/passwd /etc/shadow > mypasswd

# ZIP archive
zip2john encrypted.zip > zip_hash.txt

# PDF document
pdf2john protected.pdf > pdf_hash.txt

# SSH private key
ssh2john id_rsa > ssh_hash.txt

# KeePass database
keepass2john Database.kdbx > keepass_hash.txt

# Office document
office2john.py document.docx > office_hash.txt

# Bitcoin wallet
bitcoin2john.py wallet.dat > btc_hash.txt
```

### Status and Reporting

```bash
# Show cracked with format
john --show --format=NT hashes.txt

# Filter by user
john --show --users=root,admin hashes.txt

# Filter by UID
john --show --users=0 hashes.txt

# Filter by shell
john --show --shells=bash hashes.txt

# Count cracked
john --show hashes.txt | wc -l

# Pot file management
john --show --pot=custom.pot hashes.txt
```

## Performance Optimization

### Wordlist Preparation

**Optimal Sorting:**
```bash
# Lowercase and deduplicate
tr A-Z a-z < source.txt | sort -u > optimized.txt

# Remove short passwords
awk 'length($0) >= 8' wordlist.txt > min8.txt

# Frequency-based sorting (most common first)
sort wordlist.txt | uniq -c | sort -rn | awk '{print $2}' > sorted.txt
```

### Configuration Tuning

**john.conf Key Settings:**
```ini
# Increase candidate buffer for GPU
CandidateBufferSize = 0x20000000  # 512MB

# Adjust GPU workload
LWS = 64
GWS = 2048

# Temperature limits
AbortTemperature = 95
ResumeTemperature = 85

# Wordlist rules
Wordlist = $JOHN/wordlists/rockyou.txt
```

### Platform-Specific

**Linux:**
```bash
# Use all CPU cores (OpenMP)
export OMP_NUM_THREADS=8
./john-omp hashes.txt

# CPU affinity
taskset -c 0-7 john hashes.txt
```

**GPU:**
```bash
# Select specific devices
john --devices=0,1 --format=sha256crypt-opencl hashes.txt

# List available devices
john --list=opencl-devices
```

## Security Considerations

### Legal and Ethical Use

**Authorized Use Only:**
- Password auditing on owned systems
- Penetration testing with explicit permission
- Forensic recovery of own data
- Security research in controlled environments

**Prohibited Use:**
- Unauthorized access to systems
- Cracking passwords without permission
- Criminal activity

### Operational Security

**When Using John:**
1. Secure the cracking environment
2. Protect john.pot file (contains cracked passwords)
3. Use encrypted storage for hash files
4. Secure delete temporary files
5. Monitor resource usage (temperature, power)
6. Log and audit cracking sessions

**Data Handling:**
```bash
# Secure delete after completion
shred -vfz -n 10 hashes.txt
shred -vfz -n 10 john.pot

# Encrypted storage
gpg -c hashes.txt
gpg -d hashes.txt.gpg | john --stdin
```

## Resources

### Official Documentation
- Main site: https://www.openwall.com/john/
- GitHub: https://github.com/openwall/john
- Wiki: https://openwall.info/wiki/john
- Mailing list: https://www.openwall.com/lists/john-users/

### Community Resources
- Wordlists: https://www.openwall.com/wordlists/
- Hash examples: https://openwall.info/wiki/john/sample-hashes
- Format documentation: See `doc/` directory in repository

### Related Tools
- Hashcat - Alternative GPU-focused password cracker
- Hydra - Network protocol brute-forcer
- CyberChef - Data transformation and analysis
- Johnny - GUI frontend for John

## Conclusion

John the Ripper remains the gold standard for password security auditing and recovery. Its comprehensive hash support (366+ formats), flexible cracking modes, and GPU acceleration make it indispensable for security professionals.

When integrated with CyberChef-MCP, it forms a complete security analysis pipeline:
- **CyberChef** handles hash identification, extraction, and format conversion
- **John** performs the actual password cracking
- **CyberChef** analyzes results and generates reports

This synergy enables efficient security auditing, penetration testing, forensic investigation, and password strength assessment workflows.

**Key Takeaway:** Always use John the Ripper responsibly and only on systems where you have explicit authorization. Its power comes with the responsibility of ethical use.

---

**Document Version:** 1.0
**Last Updated:** 2025-12-17
**Based On:** John the Ripper 1.9.0-Jumbo-1+ (bleeding-jumbo)
**Reference Project:** `/home/parobek/Code/CyberChef/ref-proj/john`
