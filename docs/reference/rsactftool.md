# RsaCtfTool: The comprehensive RSA attack toolkit for CTF challenges and cryptanalysis

**RsaCtfTool automates RSA cryptanalysis through 60+ attack methods, targeting weak public keys, factorization vulnerabilities, and mathematical weaknesses in RSA implementations.** Built as a Python-based extensible framework, the tool combines classical factorization algorithms (Fermat, Pollard's rho, ECM), lattice-based attacks (Wiener, Boneh-Durfee), and modern techniques (Coppersmith, ROCA vulnerability). Originally created by Ganapati in 2020 and now maintained by Dario Clavijo, RsaCtfTool serves as essential infrastructure for CTF competitors tackling RSA challenges. The tool integrates with external factorization databases (FactorDB, Rapid7) and advanced mathematical systems (SageMath, Z3 theorem prover) to maximize attack surface coverage.

The tool addresses a critical gap in CTF tooling: automated RSA weakness exploitation without requiring deep cryptographic expertise upfront. While manual factorization requires selecting appropriate algorithms based on key properties, RsaCtfTool systematically attempts all applicable attacks, recovering private keys from weak public keys in seconds to hours depending on the vulnerability. The project focuses exclusively on **textbook RSA with semiprime composite modulus** (n = p × q), not supporting multiprime variants due to upstream pycrypto library limitations.

---

## Architecture: Python extensibility with modular attack framework

### Component structure enables dynamic attack loading

RsaCtfTool's architecture centers on **dynamic attack module loading** from two primary directories:

**Single-key attacks** (`/src/RsaCtfTool/attacks/single_key/`) contain **57 attack modules** targeting individual public keys. Each module implements an `attack(attack_rsa_obj, publickey, cipher=[])` function returning a tuple of `(private_key, decrypted_data)`. These attacks range from pure factorization methods (requiring only n) to cryptanalytic techniques leveraging known ciphertexts, partial key material, or mathematical relationships.

**Multi-key attacks** (`/src/RsaCtfTool/attacks/multi_keys/`) provide **5 attack modules** exploiting relationships across multiple RSA keys. Common factor attacks identify shared primes between different moduli, while related-message attacks (Hastad's broadcast attack) leverage identical plaintexts encrypted with different keys.

The **abstract_attack.py** base class defines the attack interface, while the main CLI parser (`RsaCtfTool.py`) orchestrates attack execution, handles I/O, and manages key/cipher data structures through the `lib.keys_wrapper` module.

### Dependency stack balances portability with mathematical power

**Core dependencies** (requirements.txt):
- **gmpy2 2.2.1**: Multi-precision arithmetic for large integer operations
- **pycryptodome 3.10.4**: RSA key handling, encryption/decryption primitives
- **z3-solver**: SAT/SMT solver for constraint-based attacks
- **factordb-pycli**: Integration with FactorDB.com database
- **cryptography 39.0.1**: Modern cryptographic primitives and key parsing
- **requests 2.25.1** + **urllib3 1.26.5**: HTTP clients for external service queries

**Optional dependencies** (optional-requirements.txt):
- **SageMath**: Advanced attacks requiring symbolic mathematics (Boneh-Durfee, lattice reduction, polynomial factorization). Installation varies by platform: `dnf install sagemath` (Fedora/RHEL) or from source.
- **NECA**: Specialized ROCA vulnerability exploitation for 512-bit keys

Python 3.9+ required. Docker support provided via Dockerfile and Dockerfile_full (includes SageMath).

---

## Attack taxonomy: 60+ methods across six categories

### Category 1: Non-factorization cryptanalytic attacks

These attacks recover private keys or decrypt ciphertexts **without factoring n**, exploiting mathematical relationships or parameter weaknesses:

| Attack | Vulnerability Targeted | Requirements |
|--------|------------------------|--------------|
| **Wiener's attack** | Small private exponent (d < n^0.25) | Public key (n, e) |
| **Boneh-Durfee** | Small d (d < n^0.292) - more powerful than Wiener | SageMath, public key |
| **Hastad's broadcast attack** | Small public exponent (e=3) with same plaintext encrypted to e different moduli | Multiple ciphertexts, public keys |
| **Same n, huge e** | Extremely large public exponent with shared modulus | Multiple keys with shared n |
| **Small CRT exponent** | Small d_p or d_q in CRT optimization | Partial private key information |
| **Common factor (ciphertext, n)** | gcd(ciphertext, n) ≠ 1 | Ciphertext, public key |
| **Partial q** | Partial bits of prime q known | Masked/partial private key |
| **Partial d** | Partial bits of private exponent d known | Masked/partial private key |
| **Lattice reduction** | Various parameter relationships exploitable via LLL | Public key, sometimes ciphertext |

### Category 2: Pure factorization methods

These attacks factor the modulus n into primes p and q using only the public key:

**Classical algorithms:**
- **Fermat's method**: Close primes (|p - q| small)
- **Pollard's rho**: General-purpose probabilistic factorization
- **Pollard's p-1**: Smooth p-1 (all prime factors of p-1 are small)
- **Williams p+1**: Smooth p+1 (complement to Pollard's p-1)
- **Euler method**: Special cases of Euler's factorization
- **Dixon's algorithm**: Random square method predecessor to quadratic sieve
- **Lehmer/Lehman**: Fermat method optimizations
- **Hart's algorithm**: Efficient variant of Fermat
- **Kraitchik**: Improved Fermat approach

**Modern algorithms:**
- **Elliptic Curve Method (ECM)**: Finds factors < 30-50 digits with tunable effort (`--ecmdigits`)
- **Quadratic Sieve (QS/SIQS)**: Industrial-strength factorization for ~100-digit numbers
- **Shanks's SQUFOF**: Efficient for 50-60 digit numbers
- **Classical Shor**: Classical portion of Shor's quantum algorithm

**Specialized number forms:**
- **Mersenne primes**: n = 2^p - 1
- **Fermat numbers**: n = 2^(2^k) + 1
- **Primorial gcd**: n shares factors with primorial numbers
- **Factorial gcd**: n shares factors with factorials
- **Fibonacci/Lucas gcd**: n shares factors with Fibonacci or Lucas numbers
- **Binary polynomial**: n expressible as polynomial over GF(2)
- **XYXZ form**: P prime > X^Y and Q prime > X^Z
- **2PN special form**: sqrt(2PN) close to (Pp + 2q)/2
- **High and Low Bits Equal**: Primes share common high/low bits

### Category 3: Database and precomputed lookup attacks

- **FactorDB**: Query factordb.com for known factorizations
- **Rapid7 SSL dataset**: Check primes against Rapid7's internet-wide SSL scan database
- **Past CTF primes**: Database of primes from previous CTF challenges
- **Novelty primes**: Known special-form primes
- **System primes gcd**: Common factors with system-generated primes
- **Gimmicky primes**: Primes with patterns or mathematical curiosities

### Category 4: Vulnerability-specific exploits

- **ROCA (Return of Coppersmith's Attack)**: CVE-2017-15361 affecting Infineon TPM/smartcards (2012-2017)
- **NECA variant**: Enhanced ROCA exploitation for 512-bit keys
- **nonRSA**: Detects keys in form b^x where b is prime

### Category 5: Multi-key attacks

- **Common factors**: gcd(n1, n2) reveals shared prime
- **Common modulus**: Same n with different e values enables decryption
- **Hastad's attack**: Same message encrypted to multiple recipients with e=3

### Category 6: Advanced mathematical attacks

- **Z3 solver**: Constraint-based attacks using SMT solver
- **Londahl**: Finding close prime factorizations
- **Qicheng**: Polynomial-time algorithm for special forms
- **Carmichael**: Carmichael number properties
- **Pisano period**: Fibonacci sequence periodicity
- **Brent**: Pollard's rho optimization
- **Compositorial gcd**: Compositorial number relationships
- **Wolfram Alpha**: External query for symbolic factorization

---

## Integration with CyberChef MCP Server

### Complementary capabilities for CTF workflows

RsaCtfTool and CyberChef MCP Server serve **complementary roles** in RSA challenge solving:

**RsaCtfTool strengths:**
- Automated attack selection and execution
- Private key recovery from weak public keys
- 60+ specialized factorization and cryptanalytic techniques
- Integration with mathematical frameworks (SageMath, Z3)

**CyberChef strengths:**
- Key format conversions (PEM, DER, SSH, PKCS#1/8)
- Encoding/decoding (Base64, hex, binary for keys and ciphertexts)
- Quick RSA encryption/decryption with known keys
- Chaining operations in recipes for multi-step workflows

### Recommended workflow for CTF RSA challenges

**Phase 1: Key acquisition and conversion**
```
1. Obtain public key (often in non-standard format)
2. Use CyberChef `cyberchef_parse_ssh_host_key` or `cyberchef_rsa_*` tools to parse
3. Extract n and e values (or convert to PEM format)
```

**Phase 2: Attack execution**
```bash
# If you have a PEM public key file
RsaCtfTool --publickey key.pub --private --attack all

# If you have n and e values
RsaCtfTool -n 12345...789 -e 65537 --private

# Decrypt a ciphertext file
RsaCtfTool --publickey key.pub --decryptfile cipher.bin
```

**Phase 3: Result processing**
```
1. RsaCtfTool outputs private key in PEM format
2. If ciphertext was base64/hex encoded, use CyberChef to decode first
3. If decrypted plaintext is encoded, use CyberChef to decode (common: base64, hex, ROT13)
4. Chain CyberChef operations for multi-layer encoding
```

### CyberChef operations for RSA workflows

**Key operations:**
- `cyberchef_from_base64` / `cyberchef_to_base64`: Encode/decode keys and ciphertexts
- `cyberchef_from_hex` / `cyberchef_to_hex`: Handle hexadecimal-encoded data
- `cyberchef_parse_ssh_host_key`: Extract RSA parameters from SSH keys
- `cyberchef_generate_rsa_key_pair`: Create test keys for experimentation
- `cyberchef_rsa_encrypt` / `cyberchef_rsa_decrypt`: Encrypt/decrypt with known keys
- `cyberchef_rsa_sign` / `cyberchef_rsa_verify`: Handle RSA signatures

**Example combined workflow:**
```
Challenge: SSH public key + base64-encoded ciphertext
1. CyberChef: Parse SSH key → extract n, e
2. RsaCtfTool: Attack weak key → recover private key
3. CyberChef: From Base64 → decode ciphertext
4. RsaCtfTool: Decrypt with private key → get plaintext
5. CyberChef: Additional decoding if needed (hex, base64, etc.)
```

### Key format conversion patterns

**SSH to PEM:**
```bash
# RsaCtfTool can convert directly
RsaCtfTool --convert_idrsa_pub --publickey ~/.ssh/id_rsa.pub
```

**Custom n, e to PEM:**
```bash
# RsaCtfTool creates public key file
RsaCtfTool --createpub -n [modulus] -e [exponent]
```

**Extract parameters from any key:**
```bash
# Dump n, e, d, p, q, and optionally CRT parameters
RsaCtfTool --dumpkey --key key.pem [--ext]
```

---

## Use cases and practical applications

### CTF challenge solving (primary use case)

**Crypto challenges in CTFs** frequently feature intentionally weakened RSA implementations:
- Small prime factors (q < 100,000)
- Close primes enabling Fermat factorization
- Small private exponent (d) vulnerable to Wiener/Boneh-Durfee
- Small public exponent (e=3) with broadcast scenarios
- Past CTF primes reused across competitions
- ROCA-vulnerable keys from specific key generation libraries

**Challenge example workflow:**
```bash
# Given: public key and ciphertext
RsaCtfTool --publickey challenge.pub --decryptfile flag.enc

# Multiple keys suspected to share factors
RsaCtfTool --publickey "*.pub" --private

# Known attack type
RsaCtfTool --publickey key.pub --attack fermat --private
```

### Educational cryptography learning

**Understanding RSA vulnerabilities** through hands-on exploitation:
- Study attack implementations in `/src/RsaCtfTool/attacks/`
- Observe factorization algorithm performance on different key sizes
- Compare classical vs modern factorization techniques
- Learn parameter relationships (p, q, n, e, d, phi)

**Recommended learning path:**
```bash
# 1. Start with weak keys from examples/
RsaCtfTool --publickey examples/smallq.pub --attack smallq --verbose

# 2. Progress to Fermat's method
RsaCtfTool --publickey examples/close_primes.pub --attack fermat --verbose

# 3. Explore advanced attacks
RsaCtfTool --publickey examples/boneh_durfee.pub --attack boneh_durfee --verbose
```

### Security auditing and key analysis

**Validate RSA key quality** in production systems:
```bash
# Check if key is conspicuous (weak parameters)
RsaCtfTool --key production.key --isconspicuous

# Check for ROCA vulnerability (CVE-2017-15361)
RsaCtfTool --isroca --publickey "*.pub"

# Attempt factorization to verify key strength
RsaCtfTool --publickey server.pub --timeout 300 --attack all
```

**Note:** For production security testing, use stronger factorization tools (yafu, cado-nfs, msieve) for keys ≥ 2048 bits.

### Cryptanalysis research

**Testing novel attack techniques:**
- Implement new attack in `/attacks/single_key/new_attack.py`
- Follow abstract_attack.py interface
- Benchmark against existing methods
- Contribute via pull request

**Example attack structure:**
```python
def attack(attack_rsa_obj, publickey, cipher=[]):
    """
    attack_rsa_obj: Reference to RSAAttack instance
    publickey: PublicKey instance with n, e attributes
    cipher: List of ciphertext bytes to decrypt

    Returns: (private_key, decrypted_data) tuple
    """
    # Attack logic here
    return (None, None)  # or (PrivateKey object, decrypted bytes)
```

---

## Installation and deployment

### Virtual environment installation (recommended)

**Debian/Ubuntu systems:**
```bash
apt install python3-virtualenv python3-venv
virtualenv venv
source venv/bin/activate
pip install git+https://github.com/RsaCtfTool/RsaCtfTool
```

**Running in venv:**
```bash
source venv/bin/activate
RsaCtfTool --publickey key.pub --private
```

### Docker deployment

**Standard container:**
```bash
# Build image
docker build -t rsactftool/rsactftool .

# Run with volume mount for file access
docker run -it --rm -v $PWD:/data rsactftool/rsactftool --publickey /data/key.pub --private
```

**Full container (includes SageMath):**
```bash
docker build -f Dockerfile_full -t rsactftool/rsactftool-full .
docker run -it --rm -v $PWD:/data rsactftool/rsactftool-full --publickey /data/key.pub --attack boneh_durfee
```

### SageMath integration

**Required for advanced attacks** (Boneh-Durfee, lattice reduction, polynomial factorization):

**Fedora/RHEL/CentOS:**
```bash
sudo dnf install sagemath
pip3 install -r optional-requirements.txt
```

**Debian/Ubuntu:**
```bash
sudo apt install sagemath
pip3 install -r optional-requirements.txt
```

**MacOS:**
```bash
# Install GMP for gmpy2
brew install gmp
CFLAGS=-I/opt/homebrew/include LDFLAGS=-L/opt/homebrew/lib pip3 install -r requirements.txt

# Install SageMath (from source or conda)
conda install -c conda-forge sage
```

### NECA installation (optional)

**For ROCA vulnerability exploitation up to 512 bits:**
Follow instructions at: https://www.mersenneforum.org/showthread.php?t=23087

---

## Usage reference and examples

### Command-line interface

```bash
RsaCtfTool [-h] [--publickey PUBLICKEY] [--output OUTPUT] [--timeout TIMEOUT]
           [--createpub] [--dumpkey] [--ext] [--decryptfile DECRYPTFILE]
           [--decrypt DECRYPT] [--verbosity {CRITICAL,ERROR,WARNING,DEBUG,INFO}]
           [--private] [--tests] [--ecmdigits ECMDIGITS]
           [-n N] [-p P] [-q Q] [-e E] [--key KEY] [--password PASSWORD]
           [--attack ATTACK [ATTACK ...]]
           [--sendtofdb] [--isconspicuous] [--isroca]
           [--convert_idrsa_pub] [--check_publickey]
```

### Mode 1: Attack RSA key and decrypt

**Basic decryption:**
```bash
RsaCtfTool --publickey ./key.pub --decryptfile ./ciphertext.bin
```

**Extract private key:**
```bash
RsaCtfTool --publickey ./key.pub --private
```

**Multiple keys with wildcard (common factor attack):**
```bash
RsaCtfTool --publickey "challenges/*.pub" --private
```

**Specific attack method:**
```bash
RsaCtfTool --publickey key.pub --attack fermat --private
```

**Multiple specific attacks:**
```bash
RsaCtfTool --publickey key.pub --attack wiener boneh_durfee fermat --private
```

**All attacks with timeout:**
```bash
RsaCtfTool --publickey key.pub --attack all --timeout 600 --private
```

**Submit factors to FactorDB:**
```bash
RsaCtfTool --publickey "*.pub" --private --sendtofdb
```

### Mode 2: Create public key from n and e

```bash
RsaCtfTool --createpub -n 782837482376192871287312987398172312837182 -e 65537
```

### Mode 3: Dump key parameters

**Basic dump:**
```bash
RsaCtfTool --dumpkey --key ./key.pem
```

**Extended dump (includes CRT parameters):**
```bash
RsaCtfTool --dumpkey --ext --key ./private_key.pem
```

### Advanced usage examples

**ECM with known factor size:**
```bash
RsaCtfTool --publickey key.pub --ecmdigits 25 --verbose --private
```

**Partial q attack (partial bits known):**
```bash
RsaCtfTool --attack partial_q --key examples/masked.pem
```

**Partial d attack (partial exponent known):**
```bash
RsaCtfTool --attack partial_d --key examples/partial_d.pem
```

**Convert SSH public key to PEM:**
```bash
RsaCtfTool --convert_idrsa_pub --publickey ~/.ssh/id_rsa.pub
```

**Check for ROCA vulnerability:**
```bash
RsaCtfTool --isroca --publickey "servers/*.pub"
```

**Check key conspicuousness:**
```bash
RsaCtfTool --key production.key --isconspicuous
```

### Verbosity control

```bash
# Silent (errors only)
RsaCtfTool --publickey key.pub --verbosity CRITICAL

# Debug output
RsaCtfTool --publickey key.pub --verbosity DEBUG --attack all
```

---

## Technical limitations and considerations

### Supported RSA variants

**Supported:**
- Textbook RSA with semiprime modulus (n = p × q)
- Standard key formats: PEM, DER, SSH, PKCS#1, PKCS#8

**NOT supported:**
- Multiprime RSA (n = p × q × r)
- Prime power RSA (n = p^k)
- Non-standard padding schemes (OAEP variants may cause issues)

This limitation stems from the upstream **pycrypto library** which only handles two-prime RSA. RsaCtfTool may **find factors** for multiprime keys but **cannot export valid private keys**.

### Performance expectations

**Factorization time varies dramatically by key strength:**

| Key Weakness | Example Attack | Expected Time |
|--------------|----------------|---------------|
| Tiny factors (q < 100k) | smallq | < 1 second |
| Close primes (\|p-q\| < 10^20) | fermat | 1-60 seconds |
| Small d (d < n^0.292) | boneh_durfee | 5-300 seconds (SageMath required) |
| Medium factors (30-40 digits) | ECM | 1-30 minutes |
| Large factors (50+ digits) | SIQS | Hours to days |
| Strong keys (2048-bit proper) | any | Infeasible |

**Timeout recommendations:**
```bash
# CTF challenges (typically weak): 5-10 minutes
RsaCtfTool --publickey key.pub --timeout 600 --attack all

# Security audit (verify strength): 30 minutes
RsaCtfTool --publickey prod.pub --timeout 1800 --attack factordb fermat wiener
```

### Attack selection strategy

**Automatic (--attack all):**
Attempts all 60+ attacks sequentially. Stops on first success. Best for CTFs when attack type is unknown.

**Manual selection:**
Specify attacks based on key properties:
- Small e (3, 5, 17): `--attack hastads cube_root`
- Large e: `--attack wiener boneh_durfee`
- Close primes suspected: `--attack fermat`
- Multiple keys: `--attack common_factors`
- ROCA timeframe keys: `--attack roca neca`

**Hybrid approach:**
```bash
# Try fast attacks first
RsaCtfTool --publickey key.pub --attack factordb smallq fermat wiener --timeout 60

# If failed, try computational attacks
RsaCtfTool --publickey key.pub --attack ecm siqs boneh_durfee --timeout 600
```

---

## Project governance and contribution

### Maintainers and community

**Primary maintainers:**
- **Ganapati** (original creator, 2020)
- **Dario Clavijo** (current maintainer, 2025)

**License:** MIT License (Copyright 2020 Ganapati, 2025 Dario Clavijo)
**Repository:** https://github.com/RsaCtfTool/RsaCtfTool
**GitHub Stars:** 5,900+ (as of December 2025)

### Contributing new attacks

**Contribution guidelines** (see CONTRIBUTING.md and CODE_OF_CONDUCT.md):

1. Read RSA fundamentals (number theory, modular arithmetic, integer factorization)
2. Study existing attack implementations in `/attacks/` directory
3. Implement attack following abstract_attack.py interface
4. Add test cases to `test.sh`
5. Document attack in comments (vulnerability, complexity, requirements)
6. Submit pull request with clear description

**Example contribution structure:**
```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Attack Name: Description
Vulnerability: What weakness this exploits
Requirements: Dependencies, conditions for success
Complexity: Big O notation if known
Reference: Papers, CVEs, or URLs
"""

def attack(attack_rsa_obj, publickey, cipher=[]):
    # Implementation
    return (private_key, decrypted_data)
```

### Community expectations

Per CODE_OF_CONDUCT.md:
- Good manners paramount
- Minimum acceptable PR quality standards (see CONTRIBUTING.md)
- Contributions not honoring code of conduct will be ignored, user blocked

---

## Comparison with related tools

### RsaCtfTool vs manual factorization tools

**msieve, yafu, cado-nfs:**
- **Strengths:** Industrial-grade factorization, handles 100-200 digit composites, optimized implementations
- **Weaknesses:** Require manual configuration, no automated attack selection, factorization-only (no crypto-specific attacks)
- **Use case:** Large RSA key factorization research, post-quantum security analysis

**RsaCtfTool:**
- **Strengths:** Automated attack selection, cryptanalytic techniques beyond factorization, CTF-optimized, all-in-one tool
- **Weaknesses:** Slower factorization for large keys, Python performance overhead
- **Use case:** CTF challenges, educational learning, quick vulnerability testing

### RsaCtfTool vs CyberChef

See Integration section above. **Complementary tools** rather than competitors:
- RsaCtfTool: Attack and private key recovery
- CyberChef: Format conversion, encoding, and known-key operations

### RsaCtfTool vs Sage/Magma

**SageMath/Magma:**
- **Strengths:** Full mathematical environments, custom algorithm implementation, research-grade
- **Weaknesses:** Steep learning curve, manual scripting required, no automated attack orchestration
- **Use case:** Novel attack development, academic research

**RsaCtfTool:**
- **Strengths:** Pre-built attacks, automated execution, no math expertise required upfront
- **Weaknesses:** Limited to implemented attacks, less flexible for custom scenarios
- **Use case:** Practical exploitation, CTF time pressure

**Best practice:** Use RsaCtfTool for quick wins, fall back to SageMath for custom attacks when needed.

---

## Security and ethical considerations

### Intended use

**Educational purposes:**
- Learning RSA cryptanalysis
- Understanding integer factorization
- Academic research
- Capture The Flag competitions (authorized)

**NOT intended for:**
- Unauthorized system access
- Breaking production RSA keys without permission
- Cryptographic attacks on real-world systems

### Legal compliance

Users are responsible for:
- Obtaining authorization before testing keys
- Compliance with local laws and regulations
- Respecting applicable security disclosure policies
- Using tool within bounds of CTF rules

### Ethical disclosure

If RsaCtfTool reveals vulnerabilities in production systems:
1. Do NOT exploit further
2. Document findings responsibly
3. Follow coordinated vulnerability disclosure (CVD)
4. Report to system owners/security teams
5. Allow reasonable time for patching before public disclosure

---

## Appendix: Quick reference

### Attack cheat sheet

| Symptom | Recommended Attacks |
|---------|---------------------|
| e = 3 or 5 | hastads, cube_root |
| e very large | wiener, boneh_durfee |
| Multiple keys | common_factors, common_modulus |
| Infineon TPM 2012-2017 | roca, neca |
| Close p and q | fermat, londahl |
| Small factors suspected | smallq, factordb, ecm |
| Challenge has timeout | factordb wiener fermat (fast attacks) |
| No clues | --attack all |

### Essential commands

```bash
# Quick attack
RsaCtfTool --publickey key.pub --private

# Decrypt file
RsaCtfTool --publickey key.pub --decryptfile cipher.bin

# Create key from n,e
RsaCtfTool --createpub -n [value] -e [value]

# Dump parameters
RsaCtfTool --dumpkey --key key.pem

# Check vulnerability
RsaCtfTool --isroca --publickey key.pub
RsaCtfTool --isconspicuous --key private.key
```

### File locations

| Path | Contents |
|------|----------|
| `/src/RsaCtfTool/attacks/single_key/` | 57 single-key attack modules |
| `/src/RsaCtfTool/attacks/multi_keys/` | 5 multi-key attack modules |
| `/examples/` | Sample keys for testing |
| `test.sh` | Comprehensive test suite |
| `requirements.txt` | Core dependencies |
| `optional-requirements.txt` | SageMath integration |

### Resources

- **GitHub:** https://github.com/RsaCtfTool/RsaCtfTool
- **Issue tracker:** https://github.com/RsaCtfTool/RsaCtfTool/issues
- **FactorDB:** http://factordb.com/
- **ROCA test:** https://github.com/crocs-muni/roca
- **Factorization theory:** https://en.wikipedia.org/wiki/Integer_factorization

### Integration with CyberChef-MCP

**Recommended workflow:**
1. CyberChef: Parse/convert keys → Extract n, e
2. RsaCtfTool: Attack weak key → Recover private key
3. CyberChef: Decode ciphertext (Base64/hex)
4. RsaCtfTool: Decrypt with private key
5. CyberChef: Post-process plaintext (encodings/layers)

**Key CyberChef tools:** `cyberchef_from_base64`, `cyberchef_from_hex`, `cyberchef_parse_ssh_host_key`, `cyberchef_rsa_encrypt`, `cyberchef_rsa_decrypt`

---

**Version:** Documentation for RsaCtfTool v2025 (MIT License)
**Author:** Ganapati (2020), Dario Clavijo (2025)
**Last Updated:** December 2025
