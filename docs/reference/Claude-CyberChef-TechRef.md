# CyberChef: Complete technical reference for GCHQ's data transformation tool

CyberChef stands as the security industry's most versatile client-side data transformation platform, offering **over 300 operations** spanning cryptography, encoding, forensics, and malware analysis—all executing entirely in the browser without server-side data transmission. Built on a sophisticated Operation/Recipe/Ingredient architecture with Web Worker parallelism, the tool supports both browser and Node.js environments through well-defined APIs. For MCP server development, CyberChef's modular design and existing REST server implementation (CyberChef-server) make it an excellent wrapping candidate, with **95%+ of operations being stateless and idempotent**. Security considerations include historical XSS vulnerabilities (CVE-2019-15532) and GCHQ's explicit warning that cryptographic operations should not be relied upon for production security.

---

## Core architecture and the Operation/Recipe/Ingredient paradigm

CyberChef implements a **Command Pattern combined with Chain of Responsibility**, creating a pipeline-based transformation system. The architecture separates concerns across four primary classes that manage data flow from input through transformation to output.

The **Chef** class serves as the facade and orchestrator, coordinating recipe execution through its `bake()` method. The **Dish** class acts as a universal data container implementing a hub-and-spoke type conversion model with **ArrayBuffer as the central interchange format**—any input type converts to ArrayBuffer first, then converts to the required output type. The **Recipe** class manages the operation sequence, handling breakpoints, disabled operations, and flow control. Each **Operation** is a self-contained command with defined `inputType`, `outputType`, argument specifications, and a `run()` method containing transformation logic.

The directory structure reflects this modular design:

```
src/
├── core/                    # Processing engine
│   ├── Chef.mjs            # Orchestration facade
│   ├── Dish.mjs            # Data container with type coercion
│   ├── Recipe.mjs          # Operation sequence manager
│   ├── Operation.mjs       # Base transformation class
│   ├── Ingredient.mjs      # Argument/parameter handler
│   ├── operations/         # 300+ operation implementations
│   ├── lib/               # Shared utilities (Code.mjs, Base85.mjs)
│   ├── dishTypes/         # Type conversion handlers
│   └── config/
│       └── Categories.json # Operation taxonomy
├── web/                    # Browser interface
│   ├── App.mjs            # Main application view
│   ├── Manager.mjs        # Event coordination
│   ├── waiters/           # UI event handlers
│   └── workers/           # Web Worker implementations
└── node/                  # Node.js API
    ├── index.mjs         # ES6 entry point
    └── wrapper.js        # CommonJS compatibility
```

Data flows through operations via the Dish class's automatic type coercion. When an operation requires a different input type than the current Dish value, conversion happens transparently: `String → ArrayBuffer → ByteArray`. This enables seamless chaining of operations regardless of their internal data type requirements.

---

## Build system and JavaScript implementation details

CyberChef uses **Grunt as the task runner with Webpack for module bundling**, supported by Babel for transpilation and PostCSS for stylesheet processing. The build system produces separate outputs for web deployment and Node.js library usage.

Key build configuration highlights include Webpack's handling of Web Workers via worker-loader, code splitting for production builds, and Hot Module Replacement during development. Building requires **`NODE_OPTIONS=--max_old_space_size=2048`** due to the large dependency tree and operation count.

Development commands follow npm conventions:
- `npm start` launches webpack-dev-server on port 8080
- `npm run build` produces optimized production bundles
- `npm run node` builds the Node.js library
- `npm test` executes the test suite

The web application implements a "Waiter" pattern for event handling, where specialized waiter classes (`RecipeWaiter`, `InputWaiter`, `OutputWaiter`, `WorkerWaiter`) handle distinct UI responsibilities. This observer-style architecture maintains separation between the UI layer and core processing logic.

---

## Web Worker implementation enables non-blocking operations

CyberChef employs four specialized Web Workers to maintain UI responsiveness during heavy processing:

| Worker | Purpose |
|--------|---------|
| **ChefWorker** | Primary recipe execution, cancellable operations |
| **InputWorker** | Asynchronous input data loading |
| **LoaderWorker** | File loading pool for multiple files |
| **ZipWorker** | Output compression and download preparation |

The worker pool size adapts to available hardware via `navigator.hardwareConcurrency`, typically spawning 4-8 ChefWorkers for multi-input processing. This architecture enables **cancellation of long-running operations** and keeps the UI thread responsive even during intensive cryptographic or compression operations.

Auto-bake functionality monitors operation duration, automatically disabling if processing exceeds **200ms** to prevent UI lockup. State management persists recipes through Local Storage and enables sharing via URL hash encoding, where both recipe configuration and input data can be embedded in shareable links.

---

## Complete operations taxonomy across security domains

CyberChef organizes its **300+ operations** into logical categories covering the full spectrum of security analysis needs.

**Cryptographic operations** support both modern and historical algorithms. Symmetric encryption includes AES (128/192/256-bit with CBC, ECB, CTR, GCM, OFB, CFB modes), DES, Triple DES, Blowfish, RC4, Rabbit, and Fernet. Asymmetric operations cover RSA encrypt/decrypt/sign/verify with key generation, plus full PGP/GPG support via the kbpgp library. Historical cipher enthusiasts gain access to Caesar, Vigenère, Atbash, Affine, and notably **Enigma machine simulation** with Typex and Lorenz variants.

**Hashing operations** span the complete algorithm landscape: MD5, MD6, SHA family (SHA-0 through SHA-3 including SHAKE variants), BLAKE2/BLAKE3, Whirlpool, RIPEMD variants, SM3 (Chinese standard), GOST/Streebog (Russian standards), plus password-specific functions like bcrypt, Argon2, and scrypt. HMAC and CMAC authentication codes support all underlying hash algorithms.

**Encoding operations** handle every common format: Base64 (standard and URL-safe), Base32, Base45 (COVID certificates), Base58 (Bitcoin), Base62, Base85/Ascii85, hexadecimal, binary, octal, URL encoding, HTML entities, Punycode, and Quoted Printable. Character code operations include Charcode conversion, Morse code, Braille, and NATO phonetic alphabet.

**Data analysis capabilities** include Shannon entropy calculation for randomness detection, frequency distribution analysis, chi-squared testing against language profiles (supporting 100+ languages), and the powerful **Magic operation** that automatically detects encoding through pattern matching, magic bytes, UTF-8 validation, entropy analysis, and single-byte XOR brute-forcing.

---

## Cryptographic library dependencies and security implications

CyberChef relies on established JavaScript cryptographic libraries rather than custom implementations:

| Library | Version | Operations Supported |
|---------|---------|---------------------|
| **crypto-js** | ^4.2.0 | AES, DES, 3DES, Rabbit, RC4, MD5, SHA |
| **node-forge** | ^0.10.0+ | RSA, X.509, PEM, ASN.1 parsing |
| **jsrsasign** | ^10.4.0+ | JWT, X.509, RSA signing |
| **bcryptjs** | ^2.4.3 | Password hashing |
| **argon2-browser** | ^1.18.0 | Memory-hard password hashing (WASM) |
| **blakejs** | ^1.2.1 | BLAKE2b/BLAKE2s |
| **kbpgp** | 2.1.15 | PGP/GPG operations |

A critical consideration: **crypto-js is deprecated by its maintainers**, who recommend migrating to the native Web Crypto API. GCHQ explicitly states: *"Cryptographic operations in CyberChef should not be relied upon to provide security in any situation. No guarantee is offered for their correctness."* The tool targets analysis and debugging, not production cryptographic applications.

---

## Malware analysis and forensics operation support

CyberChef has become indispensable for malware analysis workflows through operations specifically designed for deobfuscation and payload extraction.

**XOR operations** include single-byte, multi-byte, and brute-force modes that automatically test 256 key variants against known plaintext patterns. The **Subsection operation** applies transformations only to regex-matched portions, enabling surgical deobfuscation of specific encoded segments within larger scripts. **Registers** ($R0-$R9) store captured values for dynamic reuse across recipe steps—essential for extracting encryption keys or configuration values from malware samples.

**Disassembly support** covers x86 architecture in 16, 32, and 64-bit modes through the Capstone engine bindings. String extraction handles both ASCII and Unicode with configurable length thresholds. The **YARA Rules operation** enables pattern matching directly within CyberChef, useful for quick IOC identification.

For forensics, timestamp operations convert between Unix epochs, Windows FILETIME, and human-readable formats. Recipes exist for parsing **$MFT $SI timestamps**, **Windows Recycle Bin metadata**, and **Google 'ei' parameter timestamps** embedded in URLs. File format detection uses magic byte signatures for 400+ file types, while embedded file scanning enables file carving from memory dumps or compound documents.

---

## Network forensics and protocol parsing capabilities

Network analysis operations parse common protocols and IP addressing schemes:

- **IPv4/IPv6 parsing** with CIDR notation support
- **TCP/UDP header parsing** extracting ports, flags, and sequence numbers
- **TLS record parsing** for encrypted traffic analysis
- **MAC address formatting** across multiple conventions
- **DNS over HTTPS** resolution via Google and Cloudflare resolvers
- **URI parsing** with component extraction

The **Defang URL/IP** operations transform indicators into safe formats for sharing (converting `http://` to `hxxp://` and `.` to `[.]`), while corresponding refang operations restore them for blocklist ingestion or threat intelligence platform input.

Only three operations make external network calls: DNS over HTTPS, HTTP Request (with CORS restrictions in browsers), and Show on Map (Wikimedia tiles). All other processing remains entirely client-side.

---

## Node.js API enables programmatic automation

The `cyberchef` npm package provides full programmatic access to all operations:

```javascript
const chef = require("cyberchef");

// Direct operation calls
chef.toBase64("Hello World");  // => "SGVsbG8gV29ybGQ="

// Recipe execution (accepts exported JSON from web UI)
const result = chef.bake("Secret data", [
    {"op": "To Base64", "args": ["A-Za-z0-9+/="]},
    {"op": "SHA256", "args": []}
]);

// Chaining via Dish type
chef.ROT13("Medium rare").apply(chef.toHex).toString();
```

The `chef.help("operation")` method returns operation metadata including argument types, defaults, and descriptions—useful for dynamic tool generation.

**Flow Control operations are excluded** from the Node.js API (Fork, Merge, Jump, Conditional Jump) as they require recipe-level context. The `excludedOperations.mjs` configuration documents these limitations.

---

## REST API server deployment via CyberChef-server

GCHQ maintains **CyberChef-server**, an official REST API wrapper enabling headless operation:

```bash
docker run -it --rm -p 3000:3000 gchq/cyberchef-server
```

**Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/bake` | POST | Execute recipe on single input |
| `/batch/bake` | POST | Process multiple inputs simultaneously |
| `/magic` | POST | Automatic encoding detection |

Request format mirrors web UI recipe exports:

```json
{
    "input": "SGVsbG8gV29ybGQ=",
    "recipe": [
        {"op": "From Base64", "args": []},
        {"op": "MD5", "args": []}
    ],
    "outputType": "string"
}
```

This REST pattern aligns well with MCP tool requirements, as each endpoint accepts structured JSON and returns deterministic results.

---

## Security model prioritizes client-side data isolation

CyberChef's security architecture centers on **complete client-side processing**—input data and recipe configurations never transmit to GCHQ or any external server (with the three noted exceptions). The tool can be downloaded as a standalone HTML file for air-gapped environments.

The trust model establishes clear boundaries:

- **Browser sandbox** contains all JavaScript execution
- **Data isolation** maintains recipe/input locally
- **URL sharing** potentially exposes data via hash parameters—a consideration for sensitive analysis
- **External API calls** subject to Same-Origin Policy and CORS restrictions

GCHQ states: *"We understand that in the cybersecurity industry, people are often working on data that they want to keep to themselves due to commercial or personal sensitivities, so running all processing locally is very important to us."*

---

## Known vulnerabilities and historical security issues

### CVE-2019-15532 (Medium Severity)
XSS vulnerability in `core/operations/TextEncodingBruteForce.mjs` affecting versions before 8.31.2. Fixed in v8.31.3.

### Additional documented XSS vectors (GitHub Issues):
- **Issue #1468** (Nov 2022): DOM-based XSS via recipe parameter—operation names added to innerHTML without sanitization
- **Issue #1318** (Feb 2022): Prototype pollution through JPath operation
- **Issue #1949** (2024): XSS via malformed operation in URL hash recipe parameter
- **Issue #483** (Jan 2019): Unescaped `<>` in "To Table" operation

No formal GitHub Security Advisories exist for CyberChef; vulnerabilities are tracked through standard issues. The recurring pattern involves **HTML injection through recipe parameters and operation names** rendered without proper escaping.

---

## Supply chain security and dependency analysis

CyberChef's dependency profile presents moderate supply chain risk:

| Concern | Assessment |
|---------|------------|
| **Dependency count** | 70+ direct dependencies—large attack surface |
| **crypto-js deprecation** | Maintainers recommend migration to Web Crypto API |
| **node-forge** | Historical prototype pollution vulnerability (patched) |
| **Maintenance activity** | Snyk flags "Inactive" status (no npm releases in 12+ months) |
| **npm audit** | Historical reports showed 27+ dependency vulnerabilities |

Current Snyk analysis shows **no direct vulnerabilities** in CyberChef 10.19.4, though transitive vulnerabilities exist in older versions through dependencies.

---

## Self-hosted deployment security hardening

For organizational deployment, implement defense-in-depth through HTTP headers:

```nginx
# nginx configuration
add_header Content-Security-Policy "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:;" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
add_header Cache-Control "no-store" always;
```

Network isolation recommendations:
- Deploy on isolated network segment for sensitive analysis
- Block outbound internet if processing confidential data
- Use standalone HTML file for highest-security environments
- Run `npm audit` on self-hosted deployments

Private disclosure contacts: `oss@gchq.gov.uk` and `n1474335@gmail.com`

---

## MCP server development architecture assessment

CyberChef's architecture proves **highly suitable for MCP wrapping** due to several factors:

**Favorable characteristics:**
- **Existing Node.js API** enables direct library import without subprocess management
- **Official REST server** establishes request/response patterns compatible with MCP
- **Modular operations** define clean input/output contracts with typed schemas
- **Stateless design**—95%+ of operations are idempotent with no session requirements
- **Self-documenting operations** include argument specifications and descriptions

**Tool exposure strategy options:**

| Approach | Tool Count | Trade-offs |
|----------|------------|------------|
| **Operation-level** | ~300 tools | Maximum granularity, overwhelming discovery |
| **Recipe-level** | 1 tool | Maximum flexibility, requires recipe knowledge |
| **Category-level** | ~15 tools | Balanced discoverability and capability |

**Recommended architecture**: Start with a single `cyberchef_bake` tool accepting recipe JSON for maximum flexibility, then expand to category-level tools (encoding, hashing, encryption, compression, extraction, analysis) for improved LLM discoverability.

**Serialization requirements:**
- Text input passes directly as strings
- Binary data should be Base64 encoded with explicit typing
- Output format specifiable via `outputType` parameter
- File operations may require temporary storage in server mode

**Stateless deployment model:**
```
MCP Client → JSON-RPC 2.0 → MCP Server → CyberChef Node API
                            (stateless)
```

Each request instantiates fresh operation execution—no sticky sessions required, enabling horizontal scaling and load balancer compatibility.

---

## Real-world operational workflows and recipes

### SOC analyst workflows

**IOC extraction pipeline:**
```
Input: Raw logs/alerts
Recipe: Extract IP Addresses → Extract Domains → Defang URL → Defang IP Addresses
Output: Safe-to-share indicator list
```

**Base64 PowerShell command decoding:**
```
Recipe: Regular expression([a-zA-Z0-9+/=]{30,}) → From Base64 → Decode text(UTF-16LE)
```

### Malware analysis patterns

**Multi-layer deobfuscation (webshell example):**
```
Recipe: Label(start) → Regular expression(base64) → From Base64 → Raw Inflate → Jump(start, 21)
Purpose: Decode 21 rounds of compression/encoding
```

**Cobalt Strike beacon extraction:**
```
Recipe: From Base64 → XOR(key:35) → Strings
```

**Dynamic key extraction with Registers:**
1. Capture AES key via regex: `[a-zA-Z0-9+/=]{44}` → Store in $R0
2. Capture IV from first 16 bytes → Store in $R1
3. AES Decrypt using $R0 and $R1

### Digital forensics applications

**$MFT timestamp parsing:**
```
Recipe: Take bytes(160,64) → Fork → Swap endianness → Windows Filetime to UNIX Timestamp → From UNIX Timestamp
Output: $SI Creation, Modified, MFT Change, Access times
```

**Windows Recycle Bin metadata extraction** (Recipe 18 from mattnotmax):
```
Recipe: Subsection → Decode text(UTF16LE) → Swap endianness → Windows Filetime conversion
Output: Deleted file path, deletion timestamp, original size
```

---

## Technical specifications and performance characteristics

| Specification | Value |
|---------------|-------|
| **Browser support** | Chrome 57+, Firefox 52+, Safari 11+, Edge 16+ |
| **Maximum file size** | ~2GB (browser-dependent) |
| **Output threshold** | 1MiB default before file download |
| **Node.js support** | v18+ |
| **Build memory requirement** | 2GB+ Node heap |
| **Auto-bake timeout** | 200ms operation threshold |
| **WebAssembly usage** | Limited (Argon2-browser) |
| **Offline capability** | Full via Service Worker/standalone HTML |

Performance degrades on large inputs due to JavaScript's single-threaded nature within Web Workers. For production batch processing of large datasets, the Node.js API or CyberChef-server with containerized horizontal scaling provides better throughput.

---

## Community resources and recipe repositories

**Primary recipe collections:**
- **mattnotmax/cyberchef-recipes** (2.2k GitHub stars): 70+ documented recipes with use cases
- **IntelCorgi/OSINT_CyberChef_Recipes**: OSINT-focused indicator processing
- **Embee Research tutorials**: Advanced malware analysis techniques

**Training resources:**
- Applied Network Defense: "CyberChef for Security Analysts" (15+ hours)
- TryHackMe: CyberChef learning room
- OSDF Conference: "Zero to Hero with CyberChef" (Jonathan Glass)
- Huntress Blog: Advanced CyberChef Tips series

**Integration ecosystem:**
- Browser extensions (Chrome, Firefox)
- Burp Suite: SentToCyberChef plugin
- Splunk Technology Add-on
- Cortex XSOAR: Official integration pack
- Chepy: Python library with CLI providing CyberChef-compatible operations

---

## Conclusion and implementation guidance

CyberChef delivers unmatched versatility for security data transformation through its **client-side architecture, extensive operation library, and well-documented APIs**. For MCP server development, the existing Node.js API and REST server patterns provide proven integration templates.

Key implementation considerations:

- Deploy latest version to address historical XSS vulnerabilities
- Self-host with security headers for sensitive data analysis
- Never rely on cryptographic operations for production security
- Leverage the recipe-level API for maximum MCP tool flexibility
- Consider category-level tool grouping for improved LLM operation discovery

The tool's strength lies in rapid prototyping and analysis—complex automation should transition to dedicated scripts once workflows stabilize. For production deployments, containerized CyberChef-server instances behind load balancers provide scalable, stateless transformation services compatible with modern security orchestration platforms.