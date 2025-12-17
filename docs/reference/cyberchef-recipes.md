# CyberChef Recipes Reference

## Overview

**CyberChef Recipes** is a community-contributed collection of CyberChef operation chains (recipes) designed to solve common data transformation, malware analysis, and forensic investigation challenges. This reference guide explains how these recipes work and how they can be integrated with the CyberChef MCP Server.

### Project Information

| Property | Value |
|----------|-------|
| Project Name | cyberchef-recipes |
| Repository | https://github.com/mattnotmax/cyberchef-recipes |
| Primary Author | Matt Notmax (@mattnotmax) |
| Contributors | Community-contributed (see individual recipe credits) |
| License | Not specified (assumed open for educational use) |
| Total Recipes | 70+ recipes (as of latest update) |
| Format | JSON arrays of CyberChef operations |

### Description

CyberChef Recipes is a curated collection of operation chains that demonstrate how to use CyberChef for real-world security and data analysis tasks. The repository serves as:

- A knowledge base for malware analysts
- A tutorial resource for learning CyberChef capabilities
- A reference for CTF challenge solutions
- A library of reusable data transformation patterns

The project emphasizes practical, battle-tested recipes used in actual incident response, malware analysis, and digital forensics investigations.

## Recipe Categories

The recipes cover a broad range of security and forensics use cases:

### Malware Analysis (35+ recipes)

- **PowerShell Deobfuscation**: Invoke-Obfuscation, CharCode obfuscation, Cobalt Strike beacons, Emotet, Dridex, BazarLoader, IcedID, Qakbot, Bumblebee
- **PHP Webshells**: gzinflate/base64 encoding, multi-stage deobfuscation, auto-visitor scripts, Magento skimmers
- **Office Maldocs**: OOXML analysis, macro extraction, VBA deobfuscation, DOSfuscation
- **Binary Analysis**: .NET string extraction, shellcode extraction, PE file carving, disassembly
- **Ransomware**: REvil, JobCrypter, GoldMax/Sunshutte decryption

### Data Extraction & Encoding (20+ recipes)

- **Base64 Variants**: Standard, URL-safe, multi-stage encoding, Base-45
- **Character Encoding**: CharCode, hexadecimal, octal, mixed encodings
- **Compression**: gzip, zlib, raw inflate
- **Regex Patterns**: URL extraction, hash extraction, IP addresses, encoded data

### Forensics & Investigations (15+ recipes)

- **File Analysis**: Squid proxy cache, Recycle Bin parser, MFT timestamps
- **Network Analysis**: PCAP parsing, JA3/JA3S fingerprinting, HTTP requests
- **Log Analysis**: Timestamp conversions (Google ei, Squid, UNIX), event log parsing
- **Artifact Extraction**: GPS coordinates, Group Policy passwords, Windows Event IDs

### Data Transformation (10+ recipes)

- **Cryptography**: AES decryption, custom cipher schemes
- **Format Conversion**: Hex/binary conversions, MSI ProductCode transformations, Java byte arrays
- **Text Processing**: String reversal, character substitution, regex replacement
- **Utility**: Password generation, WiFi QR codes, meme creation, randomization

### Advanced Techniques

- **Control Flow**: Loops and labels for iterative processing
- **Subsections**: Nested subsections for multi-layer obfuscation
- **Registers**: Storing and retrieving intermediate values
- **Conditional Jumps**: Dynamic recipe branching
- **HTTP Requests**: API lookups and external data retrieval

## Recipe Format

### JSON Structure

CyberChef recipes are represented as JSON arrays of operation objects. Each operation follows this structure:

```json
[
  {
    "op": "Operation Name",
    "args": ["argument1", "argument2", true, false, ...]
  },
  {
    "op": "Next Operation",
    "args": [...]
  }
]
```

### Example: Simple Base64 Decoding

```json
[
  {
    "op": "Regular expression",
    "args": ["User defined", "[a-zA-Z0-9+/=]{30,}", true, true, false, false, false, false, "List matches"]
  },
  {
    "op": "From Base64",
    "args": ["A-Za-z0-9+/=", true]
  },
  {
    "op": "Raw Inflate",
    "args": [0, 0, "Adaptive", false, false]
  },
  {
    "op": "Generic Code Beautify",
    "args": []
  }
]
```

This recipe:
1. Extracts Base64 strings (30+ characters) using regex
2. Decodes the Base64
3. Decompresses using raw inflate
4. Beautifies the resulting code

### Advanced Features

#### Loops and Labels

```json
[
  {"op": "Label", "args": ["top"]},
  {"op": "Regular expression", "args": ["User defined", "[a-zA-Z0-9+/=]{30,}", ...]},
  {"op": "From Base64", "args": ["A-Za-z0-9+/=", true]},
  {"op": "Jump", "args": ["top", 28]}
]
```

This creates a loop that processes Base64 encoding 29 times (useful for heavily nested encodings).

#### Registers

```json
[
  {"op": "Extract Data", "args": [...]},
  {"op": "Register", "args": ["$R0", false]},
  {"op": "HTTP request", "args": ["GET", "https://api.example.com/$R0", ...]},
  {"op": "Find / Replace", "args": [{"option": "Regex", "string": "$R0"}, "value", ...]}
]
```

Registers (`$R0`, `$R1`, etc.) store intermediate values for reuse later in the recipe.

#### Subsections

```json
[
  {"op": "Subsection", "args": ["regex pattern", "\\n", true, true]},
  {"op": "From Base64", "args": [...]},
  {"op": "Merge", "args": []},
  {"op": "Generic Code Beautify", "args": []}
]
```

Subsections process matched sections independently, then merge results back.

## Integration with CyberChef MCP

### Using Recipes with cyberchef_bake

The `cyberchef_bake` MCP tool accepts recipes in the exact JSON format used by cyberchef-recipes:

```javascript
// Example MCP tool call
{
  "name": "cyberchef_bake",
  "arguments": {
    "input": "SGVsbG8gV29ybGQh",
    "recipe": [
      {"op": "From Base64", "args": ["A-Za-z0-9+/=", true]}
    ]
  }
}
```

### Recipe Translation

Most recipes from cyberchef-recipes can be used directly with MCP by:

1. Extracting the recipe JSON from the README
2. Passing it as the `recipe` argument to `cyberchef_bake`
3. Providing the appropriate input data

**Important**: Some operations may behave differently or be unavailable in the Node.js API compared to the web version.

### Bundling Popular Recipes as Presets

Common recipes can be integrated as MCP server enhancements:

#### Option 1: Server-Side Recipe Library

Create a recipe library in `src/node/recipes/`:

```
src/node/recipes/
  malware/
    powershell-deobfuscation.json
    php-webshell-decode.json
    cobalt-strike-beacon.json
  forensics/
    mft-timestamp-parser.json
    squid-cache-extractor.json
  encoding/
    multi-base64-decode.json
    charcode-extract.json
```

#### Option 2: MCP Tool for Recipe Discovery

Implement a `cyberchef_recipe_list` tool:

```javascript
{
  "name": "cyberchef_recipe_list",
  "description": "List available pre-built CyberChef recipes",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "enum": ["malware", "forensics", "encoding", "all"],
        "description": "Recipe category to list"
      }
    }
  }
}
```

#### Option 3: Recipe Templates

Create parameterized recipe templates:

```javascript
{
  "name": "cyberchef_decode_powershell",
  "description": "Decode obfuscated PowerShell using common patterns",
  "inputSchema": {
    "type": "object",
    "properties": {
      "input": {"type": "string"},
      "encoding_type": {
        "type": "string",
        "enum": ["charcode", "base64", "invoke-obfuscation"]
      }
    }
  }
}
```

### Testing Operations Against Recipe Patterns

Use cyberchef-recipes to validate MCP server operation compatibility:

1. **Extract Common Operations**: Parse all recipes to identify most-used operations
2. **Create Test Suite**: Build tests using actual recipe chains
3. **Validate Behavior**: Ensure Node.js API matches web app behavior
4. **Document Discrepancies**: Note operations that differ or are unsupported

Example test structure:

```javascript
// tests/recipes/community-recipes.test.mjs
describe('CyberChef Community Recipes', () => {
  describe('Recipe 1: Extract base64, raw inflate & beautify', () => {
    it('should decode and inflate obfuscated script', async () => {
      const recipe = [
        {"op": "Regular expression", "args": [...]},
        {"op": "From Base64", "args": [...]},
        {"op": "Raw Inflate", "args": [...]},
        {"op": "Generic Code Beautify", "args": []}
      ];
      const result = await bake(testInput, recipe);
      expect(result).toContain('expected output');
    });
  });
});
```

## Use Cases

### Malware Analysis Workflows

#### 1. PowerShell Deobfuscation Chain

**Scenario**: Analyze obfuscated PowerShell dropper

**Recipe Sequence**:
1. Extract CharCodes → `cyberchef_from_charcode`
2. Decode Base64 → `cyberchef_from_base64`
3. Decompress → `cyberchef_raw_inflate`
4. Extract URLs → `cyberchef_extract_urls`
5. Defang URLs → `cyberchef_defang_url`

**MCP Implementation**:
```json
{
  "name": "cyberchef_bake",
  "arguments": {
    "input": "malicious_script.ps1",
    "recipe": [
      {"op": "Regular expression", "args": ["User defined", "([0-9]{2,3}(,\\s|))+", ...]},
      {"op": "From Charcode", "args": ["Comma", 10]},
      {"op": "From Base64", "args": ["A-Za-z0-9+/=", true]},
      {"op": "Extract URLs", "args": [false]},
      {"op": "Defang URL", "args": [true, true, true, "Valid domains and full URLs"]}
    ]
  }
}
```

#### 2. PHP Webshell Analysis

**Scenario**: Multi-stage PHP webshell with gzinflate + Base64

**Recipe Pattern**:
```
Input → Extract Base64 → Decode → gzinflate → Extract Base64 → Decode → Beautify
```

**Benefits**:
- Reveals hidden backdoor functionality
- Extracts C2 server addresses
- Identifies encoded payloads

### CTF Challenge Solutions

#### 1. Stacked Encoding

**Challenge**: Flag encoded with multiple layers (Base64 x5 + URL encoding + Hex)

**Recipe**: Loop-based decoder
```json
[
  {"op": "Label", "args": ["decode_loop"]},
  {"op": "From Base64", "args": [...]},
  {"op": "Jump", "args": ["decode_loop", 4]},
  {"op": "URL Decode", "args": []},
  {"op": "From Hex", "args": ["Auto"]}
]
```

#### 2. Cipher Substitution

**Challenge**: Custom character substitution cipher

**Recipe**:
```json
[
  {"op": "Find / Replace", "args": [{"option": "Regex", "string": "pattern"}, "replacement", ...]},
  {"op": "ROT13", "args": [true, true, false, 13]},
  {"op": "Reverse", "args": ["Character"]}
]
```

### Forensic Investigation Patterns

#### 1. PCAP Analysis

**Workflow**:
1. Extract network streams
2. Identify JA3 fingerprints
3. Lookup threat intelligence
4. Extract IOCs

**Recipe**: PCAP → JA3 Extraction → API Lookup

#### 2. Timeline Analysis

**Workflow**:
1. Parse MFT timestamps
2. Convert Squid proxy logs
3. Normalize to UTC
4. Generate timeline CSV

**Recipe**: Log Parser → Timestamp Converter → Format CSV

#### 3. Registry Artifact Extraction

**Workflow**:
1. Extract registry hive
2. Decode obfuscated binary data
3. Carve PE files
4. Generate hash values

**Recipe**: From Hex → Raw Inflate → Extract PE → SHA256

### Data Transformation Templates

#### 1. Batch Processing

**Use Case**: Convert 1000s of encoded strings

**Pattern**: Subsection-based batch processing
```json
[
  {"op": "Subsection", "args": ["\\n", "\\n", true, true]},
  {"op": "From Base64", "args": [...]},
  {"op": "Merge", "args": []}
]
```

#### 2. Format Standardization

**Use Case**: Normalize data for SIEM ingestion

**Recipe**: Extract → Transform → Format JSON

#### 3. Automated Reporting

**Use Case**: Generate IOC reports from malware samples

**Recipe**: Extract URLs/IPs → Defang → Lookup Reputation → Format Markdown

## Common Patterns and Techniques

### Regular Expressions

The repository includes essential regex patterns for security work:

#### Encoded Data Extraction

| Pattern | Purpose | Example Use |
|---------|---------|-------------|
| `[a-zA-Z0-9+/=]{30,}` | Extract Base64 (30+ chars) | Find encoded payloads |
| `[a-fA-F0-9]{10,}` | Extract hexadecimal | Find hex strings |
| `[a-fA-F0-9]{32}` | Extract MD5 hashes | Hash identification |
| `[a-fA-F0-9]{40}` | Extract SHA1 hashes | Hash identification |
| `[a-fA-F0-9]{64}` | Extract SHA256 hashes | Hash identification |
| `[\d]{2,3}(,\|')` | Extract character codes | CharCode obfuscation |

#### Lookaheads and Lookbehinds

| Pattern | Purpose | Example |
|---------|---------|---------|
| `(?<=foo)(.*)` | Positive lookbehind | Extract everything after 'foo' |
| `^.*(?=bar)` | Positive lookahead | Extract everything before 'bar' |
| `(?<=')(.*?)(?=')` | Combo | Extract between single quotes |

### Multi-Stage Processing

Many malware samples use nested obfuscation:

```
Layer 1: CharCode
  ↓
Layer 2: Base64
  ↓
Layer 3: gzip compression
  ↓
Layer 4: More Base64
  ↓
Payload
```

**Recipe Strategy**:
1. Use subsections for each layer
2. Apply loops for repeated encoding
3. Use registers to store intermediate results
4. Merge outputs at each stage

### API Integration

Recipe 22 and 56 demonstrate HTTP Request operations:

**Pattern**: Extract → Register → API Call → Parse Response

**Example**: JA3 hash lookup
```json
[
  {"op": "JA3 Fingerprint", "args": []},
  {"op": "Register", "args": ["$R0", false]},
  {"op": "HTTP request", "args": ["GET", "https://ja3er.com/search/$R0", ...]},
  {"op": "JSON Beautify", "args": []}
]
```

**Note**: Same-Origin Policy (SOP) restrictions apply in web browsers. Consider running CyberChef locally or using the Node.js API for unrestricted HTTP access.

## Implementation Recommendations

### For CyberChef MCP Server

#### 1. Recipe Library Integration

**Priority**: HIGH

**Implementation**:
- Clone cyberchef-recipes as git submodule in `ref-proj/`
- Parse README.md to extract recipes programmatically
- Store recipes in `src/node/recipes/` by category
- Create recipe index with metadata (author, use case, complexity)

**Benefits**:
- Provide ready-to-use recipes via MCP
- Reduce friction for common tasks
- Demonstrate MCP server capabilities

#### 2. Recipe Validation Tests

**Priority**: MEDIUM

**Implementation**:
- Select 20-30 most popular recipes
- Create test cases using provided samples (where available)
- Validate operation chain compatibility
- Document unsupported operations or behavioral differences

**File**: `tests/recipes/community-recipes.test.mjs`

**Coverage Target**: 80% of common operation types

#### 3. Recipe Discovery Tool

**Priority**: MEDIUM

**Implementation**:

Add new MCP tool:

```javascript
{
  "name": "cyberchef_recipe_search",
  "description": "Search community recipes by keyword, category, or operation",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {"type": "string", "description": "Search term"},
      "category": {"type": "string", "enum": ["malware", "forensics", "encoding", "crypto", "all"]},
      "operation": {"type": "string", "description": "Filter by operation name"}
    }
  }
}
```

**Returns**:
- Recipe name and number
- Description
- Operation chain
- Use case examples

#### 4. Recipe Templates

**Priority**: LOW

**Implementation**:
- Create parameterized versions of top 10 recipes
- Add dedicated MCP tools (e.g., `cyberchef_decode_powershell`)
- Pre-configure common argument values
- Reduce complexity for common tasks

### Testing Strategy

#### Phase 1: Operation Compatibility

1. Extract all unique operations from 70 recipes
2. Test each operation in Node.js API vs web app
3. Document differences in `docs/reference/operation-compatibility.md`

#### Phase 2: Recipe Validation

1. Select 5 recipes per category (25 total)
2. Create test input files (or use provided samples)
3. Run through MCP `cyberchef_bake`
4. Validate expected outputs
5. Add regression tests

#### Phase 3: Performance Benchmarking

1. Test recipes on varying input sizes (1KB, 1MB, 10MB)
2. Measure execution time
3. Identify bottlenecks
4. Optimize critical paths

### Documentation Tasks

1. **Create Recipe Catalog**: `docs/guides/community-recipes.md`
   - Categorized recipe index
   - Links to original recipes
   - MCP usage examples

2. **Operation Reference**: `docs/reference/operations.md`
   - List all 300+ operations
   - Node.js API compatibility status
   - Usage examples from community recipes

3. **Migration Guide**: `docs/guides/web-to-mcp.md`
   - Convert web recipes to MCP calls
   - Handle unsupported operations
   - Troubleshooting common issues

## Resources

### CyberChef Resources

- **Main Project**: https://gchq.github.io/CyberChef/
- **GitHub**: https://github.com/gchq/CyberChef
- **Wiki**: https://github.com/gchq/CyberChef/wiki

### CyberChef Recipes

- **Repository**: https://github.com/mattnotmax/cyberchef-recipes
- **Author**: @mattnotmax (Twitter)
- **Contributions**: Community pull requests welcome

### Related Projects

- **CyberChef Server**: https://github.com/gchq/CyberChef-server
- **Ciphey**: Automated decryption tool (ref-proj/Ciphey)
- **CryptII**: Alternative encoding/decoding tool (ref-proj/cryptii)

### Educational Resources

- **OSDFCon Talk**: [CyberChef: Zero to Hero](https://www.osdfcon.org/presentations/2019/Jonathan-Glass_Cybersecurity-Zero-to-Hero-With-CyberChef.pdf) by @GlassSec
- **Malware Traffic Analysis**: https://www.malware-traffic-analysis.net/ (sample PCAPs)
- **Hybrid Analysis**: https://www.hybrid-analysis.com/ (malware samples with hashes)

### Community Contributions

To contribute recipes to the original repository:

1. Fork https://github.com/mattnotmax/cyberchef-recipes
2. Add recipe to README.md following existing format
3. Include sample file (if safe/legal)
4. Add screenshot to `screenshots/`
5. Submit pull request
6. Tag @mattnotmax on Twitter for visibility

## Appendix: Recipe Categories

### Complete Recipe Index

| Recipe # | Title | Category | Operations |
|----------|-------|----------|------------|
| 1 | Extract base64, raw inflate & beautify | Encoding | RegEx, Base64, Inflate |
| 2 | Invoke-Obfuscation | Malware/PowerShell | Find/Replace, Reverse, Beautify |
| 3 | From CharCode | Encoding | RegEx, CharCode |
| 4 | Group Policy Preference passwords | Forensics | Base64, AES Decrypt |
| 5 | Using Loops & Labels | Advanced | Label, Jump |
| 6 | Google ei timestamp | Forensics | Base64, Hex, UNIX Timestamp |
| 7 | COM scriptlet to x86 assembly | Malware | Multi-stage decode, Disassemble |
| 8 | Extract hex, convert to hexdump for PE | Malware | RegEx, Hex, Hexdump |
| 9 | Reverse strings, char substitution, base64 | Encoding | Reverse, Find/Replace, Base64 |
| 10 | Extract object from Squid proxy cache | Forensics | Binary extraction, Inflate |
| 11 | Extract GPS Coordinates to Google Maps | Data Transform | RegEx, Find/Replace |
| 12 | Big Number Processing | Math | Arithmetic operations |
| 13 | Parsing DNS PTR records with Registers | Forensics | Registers, RegEx |
| 14 | Decoding POSHC2 executables | Malware/PowerShell | Multi-stage decode |
| 15 | Parsing MFT $SI Timestamps | Forensics | Binary parsing, Timestamps |
| 16 | PHP gzinflate and base64 webshells | Malware/PHP | Base64, gzinflate |
| 17 | Extracting shellcode from PowerShell | Malware/PowerShell | CharCode, Hex |
| 18 | Recycle Bin Parser | Forensics | Subsections, Binary parsing |
| 19 | Identify Obfuscated Base64 | Malware | RegEx highlighting |
| 20 | Using Yara rules | Malware | Yara integration |
| 21 | Hex VBE script in LNK file | Malware | Hex decode, VBE decode |
| 22 | JA3 API search | Network | HTTP Request, Registers |
| 23 | DOSfuscation in malicious DOC | Malware | RegEx groups, Find/Replace |
| 24 | Random letter from string | Utility | HTTP Request, Registers |
| 25 | WiFi QR code | Utility | QR generation |
| 26 | Multistage PHP Webshell | Malware/PHP | Nested decode |
| 27 | Auto Visitor PHP script | Malware/PHP | PHP decode |
| 28 | Cobalt Strike Beacon (Conditional Jumps) | Malware | Conditional logic |
| 29 | Log File Timestamp Manipulation | Forensics | Subsections, Registers |
| 30 | CharCode PowerShell Cobalt Strike | Malware/PowerShell | CharCode |
| 31 | .NET binary string deobfuscation | Malware/.NET | String extraction |
| 32 | Gootkit DLL from registry | Malware | Registry decode |
| 33 | Emotet PowerShell URLs | Malware/PowerShell | URL extraction |
| 34 | OOXML Files URL analysis | Forensics | ZIP, XML parsing |
| 35 | REvil PowerShell ransomware | Malware/Ransomware | Decryption |
| 36 | Password Generator | Utility | Random generation |
| 37 | Sandbox email to malicious URL | Forensics | Multi-stage extraction |
| 38 | PowerShell emoji obfuscation | Malware/PowerShell | Unicode decode |
| 39 | GoldMax encrypted config | Malware | Decryption |
| 40 | Morse Code | Encoding | Morse decode |
| 41 | PHP hex/octal encoding | Malware/PHP | Mixed encoding |
| 42 | PHP Webshell layered obfuscation | Malware/PHP | Multi-layer |
| 43 | Magento skimmer | Malware | JavaScript deobfuscation |
| 44 | JobCrypter Ransomware | Malware/Ransomware | Decryption |
| 45 | Squid Proxy Log Timestamps | Forensics | Timestamp conversion |
| 46 | Tailoring regex | Advanced | RegEx tutorial |
| 47 | Trickbot VBS | Malware | VBScript decode |
| 48 | vjw0rm Emoji | Malware | Unicode/Emoji decode |
| 49 | Disassemble EICAR | Utility | Disassembly |
| 50 | Security Descriptor Definition Language | Forensics | SDDL parsing |
| 51 | Base-45 decoder | Encoding | Base45 |
| 52 | Randomise list | Utility | Randomization |
| 53 | Olevba to PowerShell | Malware | VBA extraction |
| 54 | Windows Event ID 1029 Hashes | Forensics | Event log parsing |
| 55 | BazarLoader maldoc | Malware | Office document |
| 56 | JA3/JA3S from PCAP | Network | PCAP, JA3 |
| 57 | Make a meme | Utility | Image manipulation |
| 58 | IcedID maldoc URL | Malware | Office document |
| 59 | Cobalt Strike beacon config | Malware | Config parsing |
| 60 | Microsoft Safelinks decode | Forensics | URL decode |
| 61 | Qakbot Excel maldoc URLs | Malware | Office document |
| 62 | Emotet Maldoc to PowerShell | Malware | Office document |
| 63 | Dridex obfuscated VBS URLs | Malware | VBScript |
| 64 | Strings to VirusTotal queries | Utility | Query generation |
| 65 | MSF Venom PowerShell | Malware/PowerShell | Metasploit |
| 66 | Nested subsection example | Advanced | Subsections |
| 67 | MSI ProductCode conversion | Forensics | GUID transform |
| 68 | Java signed byte arrays | Encoding | Java-specific |
| 69 | Bumblebee PowerShell DLL | Malware/PowerShell | DLL extraction |
| 70 | Android network config endpoints | Forensics | XML parsing |

### Operation Frequency Analysis

Based on recipe analysis, most frequently used operations:

1. **Regular Expression** (55+ recipes) - Pattern matching and extraction
2. **From Base64** (45+ recipes) - Base64 decoding
3. **Find / Replace** (35+ recipes) - String substitution
4. **From Hex** (25+ recipes) - Hexadecimal decoding
5. **Raw Inflate** (20+ recipes) - Decompression
6. **From Charcode** (18+ recipes) - Character code conversion
7. **Extract URLs** (15+ recipes) - URL extraction
8. **Generic Code Beautify** (15+ recipes) - Code formatting
9. **Subsection** (12+ recipes) - Sectioned processing
10. **Register** (10+ recipes) - Value storage

### Complexity Levels

**Beginner** (1-3 operations):
- Recipes 1, 3, 25, 40, 51, 52

**Intermediate** (4-8 operations):
- Recipes 2, 4, 6, 9, 11, 16, 17, 41, 60, 67, 68

**Advanced** (9-15 operations):
- Recipes 7, 10, 14, 20, 26, 27, 31, 32, 33, 35, 37, 38, 42, 43, 53, 58, 61, 62, 63, 65

**Expert** (15+ operations, advanced features):
- Recipes 5, 13, 18, 19, 22, 23, 24, 28, 29, 30, 34, 44, 46, 55, 56, 59, 66, 69, 70

---

**Last Updated**: 2025-12-17
**CyberChef MCP Version**: 1.7.0
**Source Repository**: https://github.com/mattnotmax/cyberchef-recipes
