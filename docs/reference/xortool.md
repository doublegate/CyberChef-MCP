# xortool - Multi-byte XOR Cipher Analysis Tool

## Overview

### Project Information

| Attribute | Details |
|-----------|---------|
| **Project Name** | xortool |
| **Version** | 1.1.0 |
| **Description** | A specialized Python tool for analyzing multi-byte XOR cipher implementations |
| **Author** | Aleksei Udovenko (hellman) |
| **Email** | aleksei@affine.group |
| **License** | MIT License |
| **Repository** | https://github.com/hellman/xortool |
| **Language** | Python 3 (Python 2 support deprecated, available on `py2` branch) |
| **Status** | Production/Stable |

### Key Features

xortool provides two primary cryptanalysis capabilities:

1. **Key Length Detection** - Automatically determines the most probable XOR key length based on statistical analysis of equal character counts
2. **Key Recovery** - Recovers XOR keys using frequency analysis and optional known plaintext attacks

Additional capabilities:
- Brute force character frequency analysis
- Character set filtering (printable, base32, base64, custom)
- Known plaintext (crib) attacks
- Hex-encoded input support
- Validity threshold configuration
- Companion XOR utility (`xortool-xor`) for encryption/decryption operations

## Installation

### Via pip (Recommended)

```bash
pip3 install xortool
```

### From Source (Development)

Requires [poetry](https://python-poetry.org/):

```bash
git clone https://github.com/hellman/xortool.git
cd xortool
poetry build
pip install dist/xortool*.whl
```

## Architecture

### Project Structure

```
xortool/
├── xortool/
│   ├── __init__.py           # Version metadata
│   ├── tool_main.py          # Main analysis entry point
│   ├── tool_xor.py           # XOR encryption/decryption utility
│   ├── args.py               # Command-line argument parsing
│   ├── routine.py            # Core XOR and file operations
│   ├── charset.py            # Character set definitions
│   ├── colors.py             # Terminal color output
│   └── libcolors.py          # Color utility library
├── test/                     # Test data and scripts
│   ├── data/                 # XOR-encrypted test files
│   └── test.sh               # Test suite
├── pyproject.toml            # Poetry/pip package configuration
└── README.md                 # Documentation
```

### Core Components

#### 1. Key Length Analysis (`tool_main.py::calculate_fitnesses`)

**Algorithm:**
- Iterates through key lengths from 1 to `max_key_length` (default: 65)
- For each length, calculates "fitness" based on character repetition patterns
- Uses statistical approach: counts equal bytes at each offset position
- Applies penalty function: `fitness / (max_key_length + key_length^1.5)` to prefer shorter keys
- Identifies local maxima in fitness curve as probable key lengths
- Analyzes common divisors to suggest key length patterns (e.g., "Key-length can be 5*n")

**Function Flow:**
```python
def count_equals(text, key_length):
    # For each byte offset in the key
    for offset in range(key_length):
        # Count character frequency at that offset
        chars_count = chars_count_at_offset(text, key_length, offset)
        # Sum the maximum counts (most frequent character per offset)
        equals_count += max(chars_count.values()) - 1
    return equals_count
```

**Rationale:** If a repeating key is used, bytes at positions `i`, `i+keylen`, `i+2*keylen`... are all XORed with the same key byte. This creates patterns when the plaintext has repeated characters.

#### 2. Key Recovery (`tool_main.py::guess_keys`)

**Algorithm:**
- Assumes a most frequent character in the plaintext (e.g., 0x00 for binaries, 0x20/space for text)
- For each offset position in the key:
  - Identifies the most frequent ciphertext byte at that offset
  - Calculates potential key byte: `ciphertext_byte XOR assumed_plaintext_byte`
- Generates all combinations when multiple bytes have equal frequency (Cartesian product)

**Function Flow:**
```python
def guess_keys(text, most_char):
    key_possible_bytes = [[] for _ in range(key_length)]
    for offset in range(key_length):
        chars_count = chars_count_at_offset(text, key_length, offset)
        max_count = max(chars_count.values())
        # Collect all bytes with maximum frequency
        for char in chars_count:
            if chars_count[char] >= max_count:
                key_possible_bytes[offset].append(char ^ most_char)
    return all_keys(key_possible_bytes)  # Generate all combinations
```

#### 3. Character Set Filtering (`charset.py`)

Predefined charsets for filtering valid plaintexts:

| Charset | Characters | Use Case |
|---------|-----------|----------|
| **printable** | All printable ASCII | General text |
| **base64** | `A-Za-z0-9/+=` | Base64-encoded data |
| **base32** | `A-Z234567=` | Base32-encoded data |
| **Custom** | `a` (lowercase), `A` (uppercase), `1` (digits), `!` (special), `*` (printable) | Fine-grained control |

Validity percentage calculation filters noise and identifies correct decryptions.

#### 4. XOR Operations (`routine.py`)

Core XOR implementation:

```python
def dexor(text, key):
    """XOR decrypt with repeating key"""
    mod = len(key)
    return bytes(key[index % mod] ^ char for index, char in enumerate(text))
```

Simple, efficient implementation using byte-wise XOR with key cycling.

#### 5. Output Generation (`tool_main.py::produce_plaintexts`)

Creates structured output directory (`xortool_out/`):
- `<index>.out` - Decrypted plaintext for each candidate key
- `filename-key.csv` - Maps filenames to key representations
- `filename-char_used-perc_valid.csv` - Maps filenames to assumed character and validity percentage

Supports filtering (`-f`) to only save outputs above validity threshold (default: 95%).

### Companion Tool: xortool-xor

Utility for XOR encryption/decryption:

```bash
xortool-xor -s "key_string" -h 414243 -f /path/to/file
```

**Input modes:**
- `-s` - String with `\xAF` escape sequences
- `-r` - Raw string (no escapes)
- `-h` - Hex-encoded string
- `-f` - File input (supports stdin with `-`)

**Options:**
- `--cycle` (default) - Repeating key (standard XOR cipher)
- `--no-cycle` - Pad shorter strings with null bytes
- `-n` / `--no-newline` - Suppress trailing newline

## Technical Details

### Statistical Foundation

The key length detection relies on the **Index of Coincidence (IC)** principle:
- Random data has uniform character distribution
- Text encrypted with repeating key preserves character frequency patterns at key-interval positions
- Measuring character repetition at different offsets reveals the key period

### Frequency Analysis

Key recovery assumes:
1. **Known plaintext character distribution** - Most common character in plaintext (space for English text, null byte for binaries)
2. **Frequency preservation** - XOR preserves frequency relationships: if 'e' is most common in plaintext, `'e' XOR key[i]` is most common in ciphertext at position `i mod keylen`

### Brute Force Modes

| Mode | Characters Tested | Use Case |
|------|-------------------|----------|
| `-c CHAR` | Single specified character | Known plaintext distribution |
| `-b` | All 256 bytes (0x00-0xFF) | Unknown distribution |
| `-o` | Printable ASCII only | Text-based ciphertexts |

### Known Plaintext Attack

The `-p` / `--known-plaintext` option enables crib dragging:
- Filters candidate keys by checking if decrypted output contains the known string
- Significantly reduces false positives in CTF challenges (e.g., `-p "flag{"`)
- Can be combined with `-r` threshold to adjust sensitivity

## Usage Examples

### Example 1: Binary File Analysis

```bash
# Encrypt /bin/ls with key "secret_key"
xortool-xor -f /bin/ls -s "secret_key" > binary_xored

# Analyze without knowing key length (auto-detect)
xortool binary_xored
# Output:
# The most probable key lengths:
#    2:   5.0%
#    5:   8.7%
#   10:   15.4%  <- Highest probability
#   20:   15.1%
# Key-length can be 5*n

# Recover key (0x00 is most frequent byte in binaries)
xortool binary_xored -l 10 -c 00
# Output:
# 1 possible key(s) of length 10:
# secret_key

# Verify decryption
md5sum xortool_out/0_secret_key /bin/ls
# 29942e290876703169e1b614d0b4340a  xortool_out/0_secret_key
# 29942e290876703169e1b614d0b4340a  /bin/ls
```

### Example 2: Text File with Auto-Detection

```bash
# Analyze text file (0x20 = space character)
xortool tool_xored -c 20
# Output:
# The most probable key lengths:
#   10:   11.7%
#   20:   19.8%  <- Highest probability
# Key-length can be 5*n
# 1 possible key(s) of length 20:
# an0ther s3cret \xdd key
```

### Example 3: Long Keys

```bash
# Increase max key length for longer keys
xortool ls_xored -c 00 -m 64
# Output:
# The most probable key lengths:
#   33:   18.4%  <- Detected 33-byte key
# Key-length can be 3*n
# 1 possible key(s) of length 33:
# really long s3cr3t k3y... PADDING
```

### Example 4: Base64-Encoded Ciphertext

```bash
# Use charset filtering for base64
xortool message.enc -b -f -l 23 -t base64
# Output:
# 256 possible key(s) of length 23:
# [multiple candidates shown]
# Found 1 plaintexts with 95.0%+ valid characters
# See files filename-key.csv, filename-char_used-perc_valid.csv
```

### Example 5: Known Plaintext (CTF Flag)

```bash
# Use known flag prefix to filter results
xortool -b -p "xctf{" message.enc
# Only outputs keys where plaintext contains "xctf{"

# Adjust threshold for noisy data
xortool -r 80 -p "flag{" -c ' ' message.enc
# Accept plaintexts with 80%+ valid characters
```

### Example 6: Hex-Encoded Input

```bash
# Process hex-encoded ciphertext
xortool -x -c ' ' file.hex
# Automatically decodes hex before analysis
```

## Integration Guidance for CyberChef-MCP

### Comparison: xortool vs CyberChef XOR Operations

| Feature | xortool | CyberChef XOR | CyberChef XOR Brute Force |
|---------|---------|---------------|---------------------------|
| **Key Length Detection** | Automatic, up to 65 bytes | Manual specification | Fixed (max 2 bytes) |
| **Key Recovery** | Frequency analysis | Not applicable | Exhaustive enumeration |
| **Most Frequent Char** | Configurable + brute force | N/A | N/A |
| **Charset Filtering** | Printable/Base32/Base64/Custom | N/A | N/A |
| **Known Plaintext** | Crib filtering | Crib filtering | Crib filtering |
| **Max Key Length** | Configurable (default 65) | Unlimited | 2 bytes (performance) |
| **Output Format** | Multiple files + CSV mapping | Direct output | Multi-line results |
| **Schemes** | Standard only | Standard/Differential/Cascade | Standard/Differential |
| **Performance** | Fast (Python CLI) | Fast (JavaScript) | Limited (browser constraints) |

**Key Differences:**

1. **xortool strengths:**
   - Automated key length detection using statistical analysis
   - Practical for multi-byte keys (tested up to 65 bytes)
   - Character set filtering for targeted plaintext types
   - Batch output with organized CSV metadata

2. **CyberChef strengths:**
   - Web-based interface (no installation)
   - XOR schemes (differential, cascade) for advanced ciphers
   - Real-time interactive analysis
   - Integration with 300+ other operations in recipes

3. **CyberChef XOR Brute Force limitations:**
   - Maximum 2-byte keys (browser performance constraints)
   - No automated key length detection
   - Limited to exhaustive search (256^keylen combinations)

### Combined Workflow Strategies

#### Strategy 1: Analysis → Decryption

**Use xortool for analysis, CyberChef-MCP for decryption:**

```bash
# Step 1: Determine key length with xortool
xortool ciphertext.bin
# Identifies probable key length (e.g., 15 bytes)

# Step 2: Recover key with xortool
xortool ciphertext.bin -l 15 -c 00
# Discovers key: "some_secret_key"

# Step 3: Decrypt with CyberChef-MCP
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"cyberchef_xor",
  "arguments":{
    "input":"<base64_ciphertext>",
    "key":"some_secret_key",
    "scheme":"Standard"
  }
}}' | docker run -i cyberchef-mcp

# Step 4 (Optional): Chain with other CyberChef operations
# Use cyberchef_bake to combine XOR → From Hex → Gunzip → etc.
```

#### Strategy 2: CTF Challenge Workflow

**Scenario:** Unknown XOR cipher, expecting flag format `flag{...}`

```bash
# Analysis phase (xortool)
xortool -b -p "flag{" -f -t printable challenge.enc

# If xortool finds key, decrypt full file with CyberChef
# for integration with other analysis operations
cyberchef_xor --input-file challenge.enc --key "<discovered_key>"

# Chain with CyberChef operations for multi-stage challenges
cyberchef_bake --recipe '[
  {"op": "XOR", "args": [{"string": "discovered_key"}]},
  {"op": "From Base64"},
  {"op": "Gunzip"},
  {"op": "Regular expression", "args": ["flag{.*?}"]}
]'
```

#### Strategy 3: Malware Analysis

**Scenario:** Analyzing XOR-obfuscated malware configuration

```bash
# 1. Extract suspected XOR blob from malware
# (using other tools like strings, binwalk, etc.)

# 2. Attempt key length detection
xortool malware_blob.bin -m 128  # Malware often uses longer keys

# 3. Try binary frequency analysis (0x00 most common)
xortool malware_blob.bin -l <detected_length> -c 00

# 4. If successful, decrypt with CyberChef for format analysis
cyberchef_xor --input-file malware_blob.bin --key "<key>"

# 5. Chain with parsing operations
cyberchef_bake --recipe '[
  {"op": "XOR", "args": [...]},
  {"op": "To Hex"},
  {"op": "Parse IPv4 header"}  # If config contains C2 IPs
]'
```

### Implementing xortool Algorithms in CyberChef

**Potential Enhancement:** Add "XOR Key Length Analysis" operation to CyberChef

**Implementation considerations:**

1. **Key Length Detection:**
   - Port `calculate_fitnesses()` logic from xortool
   - Return top N probable key lengths with confidence scores
   - Display as table or chart in CyberChef UI

2. **Frequency-Based Key Recovery:**
   - Port `guess_keys()` logic
   - Input: Ciphertext + most frequent character hint
   - Output: Candidate keys sorted by validity score

3. **Performance Optimization:**
   - Use Web Workers for analysis (avoid blocking UI)
   - Implement early termination for low-fitness keys
   - Add progress indicators for long analyses

4. **UI Design:**
   - Input: File upload or paste
   - Parameters: Max key length, character hint, charset
   - Output: Interactive table with key candidates
   - Click-to-decrypt functionality for each candidate

**Reference implementation path:**
```
src/core/operations/XORKeyAnalysis.mjs  # New operation
src/core/lib/XORAnalysis.mjs            # Algorithm library
```

### MCP Server Integration Opportunities

**Proposed MCP Tool: `cyberchef_xor_analyze`**

```json
{
  "name": "cyberchef_xor_analyze",
  "description": "Analyze XOR-encrypted data to detect key length and recover keys (xortool-inspired)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "input": {"type": "string", "description": "Base64-encoded ciphertext"},
      "max_key_length": {"type": "number", "default": 65},
      "most_frequent_char": {"type": "string", "description": "Hex byte (e.g., '00', '20')"},
      "charset": {"type": "string", "enum": ["printable", "base32", "base64"]},
      "known_plaintext": {"type": "string", "description": "Crib for filtering"}
    },
    "required": ["input"]
  }
}
```

**Implementation approach:**
1. Spawn child process running xortool (if installed)
2. Parse output and return structured JSON
3. Alternatively, port Python algorithms to JavaScript

**Advantages:**
- Bridges gap between CyberChef's 2-byte brute force limit and xortool's capabilities
- Enables AI assistants to automatically perform XOR cryptanalysis
- Maintains CyberChef ecosystem (no external tool switching)

## Use Cases

### 1. CTF (Capture The Flag) Competitions

**XOR Challenge Scenario:**
- Flag encrypted with unknown multi-byte XOR key
- Hint: Flag format is `flag{...}` or `CTF{...}`

**xortool Approach:**
```bash
# Quick analysis with known flag prefix
xortool -b -p "flag{" challenge.bin

# If no results, try adjusting threshold
xortool -r 75 -p "flag{" challenge.bin

# Check results
cat xortool_out/filename-char_used-perc_valid.csv
```

**Success indicators:**
- Low number of candidate keys (1-5)
- High validity percentage (>90%)
- Plaintext contains expected flag format

### 2. Malware Analysis

**XOR Obfuscation Patterns:**

| Obfuscation Type | Key Characteristics | xortool Parameters |
|------------------|---------------------|-------------------|
| **Config Strings** | Short keys (4-16 bytes), single-byte XOR common | `-c 00 -m 32` |
| **C2 URLs** | Printable output, often single-byte | `-o -c 00` |
| **Shellcode** | Binary data, longer keys | `-c 00 -m 128` |
| **Embedded PEs** | MZ header known plaintext | `-p "MZ"` |

**Workflow Example:**
```bash
# Extract suspected XOR blob (offset 0x1000, size 0x500)
dd if=malware.exe of=blob.bin bs=1 skip=4096 count=1280

# Analyze
xortool blob.bin -c 00 -m 64

# Check for PE header
strings xortool_out/* | grep -i "This program"
```

### 3. Cryptanalysis Research

**Academic Applications:**
- Studying XOR cipher weaknesses
- Demonstrating frequency analysis attacks
- Teaching cryptographic concepts

**Research Scenarios:**
- Measuring effectiveness of key length detection across different text types
- Comparing IC-based detection vs. other methods
- Analyzing impact of plaintext entropy on key recovery success

### 4. Data Recovery

**Accidental XOR Encryption:**
- Corrupted files XORed with known pattern
- Backup encryption with lost keys
- File format reconstruction

**Example - Corrupted Archive:**
```bash
# Suspect ZIP file XORed during transmission
# ZIP signature: 50 4B 03 04 (PK..)

# Try to recover assuming first bytes should be PK
xortool corrupted.zip -p "PK"

# Check for valid ZIP structure
file xortool_out/*.out | grep "Zip archive"
```

### 5. Network Traffic Analysis

**Encrypted Protocol Analysis:**
- Custom protocols using XOR encryption
- Obfuscated command-and-control traffic
- Proprietary protocol reverse engineering

**Approach:**
```bash
# Extract payload from PCAP
tshark -r capture.pcap -T fields -e data > payload.hex

# Convert and analyze
xxd -r -p payload.hex > payload.bin
xortool payload.bin -c 20  # Assuming text protocol
```

## Command Reference

### Main Tool: xortool

```
Usage:
  xortool [-x] [-m MAX-LEN] [-f] [-t CHARSET] [FILE]
  xortool [-x] [-l LEN] [-c CHAR | -b | -o] [-f] [-t CHARSET] [-p PLAIN] [-r PERCENT] [FILE]
  xortool [-x] [-m MAX-LEN| -l LEN] [-c CHAR | -b | -o] [-f] [-t CHARSET] [-p PLAIN] [-r PERCENT] [FILE]
```

**Options:**

| Option | Description | Default | Example |
|--------|-------------|---------|---------|
| `-x` / `--hex` | Input is hex-encoded string | Binary | `-x` |
| `-l LEN` / `--key-length=LEN` | Known key length | Auto-detect | `-l 16` |
| `-m MAX` / `--max-keylen=MAX` | Maximum key length to probe | 65 | `-m 128` |
| `-c CHAR` / `--char=CHAR` | Most frequent character | None | `-c 20` (space) |
| `-b` / `--brute-chars` | Brute force all 256 characters | Off | `-b` |
| `-o` / `--brute-printable` | Brute force printable chars only | Off | `-o` |
| `-f` / `--filter-output` | Filter outputs by charset validity | Off | `-f` |
| `-t SET` / `--text-charset=SET` | Target character set | printable | `-t base64` |
| `-p TEXT` / `--known-plaintext=TEXT` | Known plaintext string (crib) | None | `-p "flag{"` |
| `-r PCT` / `--threshold=PCT` | Validity threshold percentage | 95 | `-r 80` |

**Character Set Specification:**
- **Predefined:** `printable`, `base32`, `base64`
- **Custom:** Combine `a` (lowercase), `A` (uppercase), `1` (digits), `!` (special), `*` (printable)
- **Example:** `-t "aA1"` = alphanumeric only

### XOR Utility: xortool-xor

```
Usage:
  xortool-xor [-s STR] [-r STR] [-h HEX] [-f FILE] [--cycle|--no-cycle] [-n]
```

**Options:**

| Option | Description | Example |
|--------|-------------|---------|
| `-s STR` | String with `\xAF` escapes | `-s "key\x00\x01"` |
| `-r STR` | Raw string (no escapes) | `-r "password"` |
| `-h HEX` | Hex-encoded key | `-h "4142"` |
| `-f FILE` | Read from file (- for stdin) | `-f key.bin` |
| `--cycle` | Repeat key (default) | `--cycle` |
| `--no-cycle` | Pad with null bytes | `--no-cycle` |
| `-n` / `--no-newline` | Suppress trailing newline | `-n` |

**Multiple Inputs:**
```bash
# XOR three inputs together
xortool-xor -s "key1" -h "414243" -f plaintext.bin
```

## Performance Considerations

### Time Complexity

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Key length detection | O(n * m) | n = file size, m = max_key_length |
| Key recovery (single char) | O(n * k) | k = key_length |
| Key recovery (brute force) | O(n * k * 256) | 256 = all possible bytes |
| Output generation | O(n * j) | j = number of candidate keys |

### Memory Usage

- **Input file:** Loaded entirely into memory
- **Output files:** One file per candidate key
- **Metadata:** Two CSV files regardless of candidate count

**Optimization tips:**
1. Use `-f` to filter outputs (reduces disk I/O)
2. Adjust `-r` threshold to reduce candidate keys
3. Use `-p` known plaintext to narrow results early
4. Limit `-m` max_key_length when possible

### Scalability

**File Size:**
- Tested with files up to several MB
- No hardcoded limits, constrained by available RAM
- Large files may require several seconds for analysis

**Key Length:**
- Default max: 65 bytes (adequate for most cases)
- Can extend to 128+ bytes for specialized scenarios
- Analysis time grows linearly with max_key_length

## Limitations and Considerations

### 1. Requires Character Frequency Bias

xortool relies on **non-uniform plaintext distribution**:
- Works well: Text files (space/E/T frequent), binaries (null bytes)
- Fails: Random data, compressed files, encrypted data

**Mitigation:** Use known plaintext (`-p`) when frequency analysis is unreliable

### 2. Multiple Key Candidates

High-entropy plaintexts produce many candidate keys:
- Brute force mode (`-b`) can generate hundreds of candidates
- Validity filtering (`-f`) helps but may miss correct key

**Mitigation:** Combine with known plaintext and manual inspection of outputs

### 3. Key Length Detection Ambiguity

Multiples of true key length also score high:
- True key length: 5 → Also detects 10, 15, 20, 25...
- Common divisor analysis helps identify base length

**Mitigation:** Check all suggested lengths, prefer smallest with high fitness

### 4. Non-Standard XOR Schemes

xortool assumes standard repeating-key XOR:
- Does not support differential schemes (Input/Output differential)
- Does not support cascading XOR
- Does not support XOR with non-repeating streams

**Mitigation:** Use CyberChef for advanced XOR schemes, xortool for standard cipher analysis

### 5. Performance with Very Long Keys

Keys approaching file size reduce pattern visibility:
- One-time pad (key = file size) is theoretically unbreakable
- Keys > 50% file size have poor detection rates

**Mitigation:** If key length detection fails, consider other cipher types

## Advanced Techniques

### 1. Combining Results from Multiple `-c` Values

```bash
# Try common frequent bytes
for byte in 00 20 0a; do
  echo "=== Testing with most frequent char: 0x$byte ==="
  xortool data.bin -l 12 -c $byte
done

# Compare results and look for consistency
```

### 2. Partial Known Plaintext

```bash
# You know plaintext starts with "BEGIN"
# But xortool needs full plaintext match

# Workaround: XOR first 5 bytes to get partial key
python3 -c "
ct = open('data.bin', 'rb').read()[:5]
pt = b'BEGIN'
key = bytes([c^p for c,p in zip(ct, pt)])
print(key.hex())
"

# Use partial key insight to guide analysis
xortool data.bin -l 5 -b | grep "<partial_key_pattern>"
```

### 3. Iterative Refinement

```bash
# Start broad
xortool data.bin
# Note: Key-length can be 4*n

# Narrow to specific length
xortool data.bin -l 12 -b

# Filter to high-quality results
xortool data.bin -l 12 -b -f -t printable

# Add known plaintext for final filtering
xortool data.bin -l 12 -b -f -t printable -p "expected_string"
```

### 4. Differential Analysis

```bash
# If you have multiple ciphertexts with same key:

# Analyze first file
xortool msg1.enc -c 20

# Verify key works on second file
xortool-xor -f msg2.enc -h "<discovered_key_hex>"
```

## Troubleshooting

### Issue: No probable key lengths found

**Causes:**
- File too small (< 100 bytes)
- Random/compressed plaintext (no patterns)
- Very long key (approaching file size)

**Solutions:**
- Use larger ciphertext samples
- Try brute force with `-b` on known lengths
- Consider other cipher types (not XOR)

### Issue: Many candidate keys (100+)

**Causes:**
- Wrong key length selected
- High-entropy plaintext
- `-b` brute force without filtering

**Solutions:**
- Enable filtering: `-f -t <appropriate_charset>`
- Add known plaintext: `-p "known_string"`
- Increase threshold: `-r 98`

### Issue: Correct key not in top results

**Causes:**
- Incorrect most frequent character assumption
- Plaintext has unusual frequency distribution

**Solutions:**
- Try `-b` to test all characters
- Use `-o` if plaintext is text (printable only)
- Lower threshold: `-r 70`

### Issue: Hex decoding fails

**Causes:**
- Input contains non-hex characters
- Missing `-x` flag

**Solutions:**
- Add `-x` flag for hex input
- Clean input: `tr -d ' \n' < input.hex > cleaned.hex`

## Security Considerations

### 1. XOR Cipher Weaknesses

xortool demonstrates fundamental weaknesses of XOR encryption:
- **Frequency analysis vulnerability** - Character distributions leak information
- **Known plaintext attacks** - Any known plaintext reveals key bytes
- **Key reuse catastrophic** - Same key on multiple messages enables crib dragging

**Lessons for developers:**
- Never use XOR for serious encryption (use AES/ChaCha20)
- If XOR required (obfuscation), use cryptographic PRNG keys
- Combine with other techniques (e.g., XOR after AES)

### 2. Malware Analysis Safety

When analyzing malware with xortool:
1. **Isolate environment** - Use VM/sandbox for malware analysis
2. **Validate outputs** - Decrypted payload may still be malicious
3. **Scan results** - Run antivirus on xortool_out/ directory
4. **Avoid execution** - Never execute recovered binaries without analysis

### 3. Responsible Disclosure

xortool is a dual-use tool (offensive & defensive):
- **Ethical use:** Security research, CTF, malware analysis
- **Prohibited use:** Breaking encryption without authorization
- **Legal compliance:** Follow local laws regarding cryptanalysis tools

## Additional Resources

### Documentation
- **GitHub Repository:** https://github.com/hellman/xortool
- **PyPI Package:** https://pypi.org/project/xortool/
- **Python Packaging:** https://python-poetry.org/

### Related Tools
- **xortool-xor:** Bundled XOR encryption/decryption utility
- **CyberChef:** Web-based XOR operations with additional schemes
- **xor-analyze:** Alternative tool with different statistical approaches
- **unxor:** Brute-force XOR key recovery tool

### Learning Resources
- **XOR Cipher Theory:** [Wikipedia - XOR Cipher](https://en.wikipedia.org/wiki/XOR_cipher)
- **Frequency Analysis:** [Wikipedia - Frequency Analysis](https://en.wikipedia.org/wiki/Frequency_analysis)
- **Index of Coincidence:** [Wikipedia - Index of Coincidence](https://en.wikipedia.org/wiki/Index_of_coincidence)

### Community
- **Issues/PRs:** https://github.com/hellman/xortool/issues
- **Author Contact:** aleksei@affine.group

## Conclusion

xortool is a mature, production-ready tool for XOR cipher cryptanalysis. Its strength lies in automated key length detection and practical key recovery for multi-byte keys, filling a gap not addressed by browser-based tools like CyberChef's 2-byte brute force.

**When to use xortool:**
- Multi-byte XOR keys (3+ bytes)
- Unknown key length scenarios
- Malware configuration extraction
- CTF XOR challenges
- Cryptographic research/education

**When to use CyberChef:**
- Known key and length
- Advanced XOR schemes (differential, cascade)
- Integration with 300+ other operations
- Web-based workflow (no installation)
- Interactive analysis and visualization

**Best practice:** Use xortool for discovery/analysis, then CyberChef-MCP for integration into larger data processing pipelines.

---

**Document Version:** 1.0
**Last Updated:** 2025-12-17
**xortool Version Covered:** 1.1.0
**CyberChef MCP Version:** 1.7.0
