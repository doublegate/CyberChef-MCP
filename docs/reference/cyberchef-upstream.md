# CyberChef Upstream Reference

This document provides comprehensive information about the upstream GCHQ CyberChef project that serves as the foundation for the CyberChef MCP Server fork.

## Table of Contents
- [Project Overview](#project-overview)
- [Technical Architecture](#technical-architecture)
- [Key Components](#key-components)
- [Build System](#build-system)
- [Integration with MCP Fork](#integration-with-mcp-fork)
- [Key Files and Directories](#key-files-and-directories)
- [Pulling Updates from Upstream](#pulling-updates-from-upstream)
- [References](#references)

---

## Project Overview

### Basic Information

| Attribute | Value |
|-----------|-------|
| **Project Name** | CyberChef |
| **Tagline** | *The Cyber Swiss Army Knife* |
| **Description** | A simple, intuitive web app for carrying out all manner of "cyber" operations within a web browser |
| **Author** | GCHQ (Government Communications Headquarters, UK) |
| **Primary Maintainer** | n1474335 <n1474335@gmail.com> |
| **License** | Apache License 2.0 |
| **Copyright** | Crown Copyright 2016 |
| **Repository** | https://github.com/gchq/CyberChef |
| **Live Demo** | https://gchq.github.io/CyberChef |
| **NPM Package** | https://www.npmjs.com/package/cyberchef |
| **Current Version** | 10.19.4 (as of reference snapshot) |

### Purpose and Design Philosophy

CyberChef is designed to enable both technical and non-technical analysts to manipulate data in complex ways without having to deal with complex tools or algorithms. It was conceived, designed, built and incrementally improved by an analyst in their 10% innovation time over several years.

The tool is **entirely client-side** - no recipe configuration or input data is ever sent to the CyberChef web server. All processing is carried out within the browser, on the user's own computer.

### Key Features

1. **300+ Operations**: Encoding, encryption, compression, hashing, parsing, forensics, and much more
2. **Drag and Drop Interface**: Operations can be dragged in/out of the recipe list or reorganized
3. **Auto Bake**: Automatically processes data whenever input or recipe changes
4. **Large File Support**: Files up to 2GB can be processed (browser-dependent)
5. **Recipe Chaining**: Combine multiple operations in complex pipelines
6. **Breakpoints**: Pause execution at any operation to inspect intermediate results
7. **Deep Linking**: Share recipes and inputs via URL hash parameters
8. **Save/Load Recipes**: Store frequently-used recipes in local storage
9. **Magic Detection**: Automatically detect and decode encoded data
10. **Node.js API**: Full programmatic access via Node.js module

### Cryptographic Disclaimer

From the official documentation:

> Cryptographic operations in CyberChef should not be relied upon to provide security in any situation. No guarantee is offered for their correctness.

---

## Technical Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CyberChef                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   Web UI     │    │  Node.js API │    │   Docker     │ │
│  │ (Browser App)│    │   (Library)  │    │  (Isolated)  │ │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘ │
│         │                   │                    │         │
│         └───────────────────┴────────────────────┘         │
│                             │                              │
│                    ┌────────▼────────┐                     │
│                    │   Core Engine   │                     │
│                    │  (Operations)   │                     │
│                    └─────────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Core Architectural Patterns

CyberChef implements several design patterns:

1. **Command Pattern**: Each operation is a self-contained command with defined inputs/outputs
2. **Chain of Responsibility**: Operations form a pipeline where each processes the data
3. **Facade Pattern**: The `Chef` class provides a simple interface to the complex system
4. **Strategy Pattern**: Operations can be swapped and arranged dynamically
5. **Observer Pattern**: Waiters observe and handle UI events

### Technology Stack

| Layer | Technologies |
|-------|--------------|
| **Build System** | Grunt, Webpack 5, Babel |
| **Frontend** | Vanilla JavaScript (ES6+), Bootstrap 4, jQuery 3.7, CodeMirror 6 |
| **Backend** | Node.js 16+ (for library usage) |
| **Testing** | Nightwatch (UI), Custom test framework (operations) |
| **Linting** | ESLint 9+ |
| **Styling** | PostCSS, Bootstrap Material Design |
| **Cryptography** | crypto-js, node-forge, jsrsasign, bcryptjs, argon2-browser |
| **Data Processing** | protobufjs, avsc, jimp, tesseract.js, jsonwebtoken |

### Directory Structure

```
CyberChef/
├── src/
│   ├── core/                 # Core processing engine
│   │   ├── Chef.mjs         # Main orchestrator
│   │   ├── Dish.mjs         # Data container with type coercion
│   │   ├── Recipe.mjs       # Operation sequence manager
│   │   ├── Operation.mjs    # Base operation class
│   │   ├── Ingredient.mjs   # Operation argument handler
│   │   ├── Utils.mjs        # Utility functions
│   │   ├── operations/      # 463 operation implementations
│   │   ├── lib/            # Shared libraries
│   │   ├── dishTypes/      # Type conversion handlers
│   │   ├── errors/         # Custom error classes
│   │   ├── config/         # Operation metadata and categories
│   │   └── vendor/         # Third-party vendored code
│   ├── node/               # Node.js API layer
│   │   ├── index.mjs       # ES module entry point
│   │   ├── wrapper.js      # CommonJS entry point
│   │   ├── api.mjs         # Core API functions
│   │   ├── config/         # Node-specific configuration
│   │   └── repl.mjs        # Interactive REPL
│   └── web/                # Browser-specific code
│       ├── App.mjs         # Main application view
│       ├── Manager.mjs     # Event coordination
│       ├── waiters/        # UI event handlers
│       ├── workers/        # Web Worker implementations
│       ├── html/           # HTML templates
│       ├── stylesheets/    # CSS/SCSS files
│       ├── static/         # Images and static assets
│       └── utils/          # Web-specific utilities
├── tests/
│   ├── operations/         # Operation unit tests
│   ├── node/              # Node.js API tests
│   └── browser/           # UI integration tests
├── build/                  # Build output (generated)
├── Gruntfile.js           # Build configuration
├── webpack.config.js      # Webpack configuration
├── package.json           # Node.js package metadata
├── Dockerfile             # Docker container for web app
└── .github/
    └── workflows/         # GitHub Actions CI/CD
```

---

## Key Components

### 1. Core Engine (`src/core/`)

#### Chef (Chef.mjs)
The main orchestrator that coordinates recipe execution. Provides the `bake()` method that processes data through a recipe.

**Key Responsibilities:**
- Instantiate recipes from operation lists
- Execute recipes on input data
- Handle errors and exceptions
- Manage bake progress callbacks

#### Dish (Dish.mjs)
Universal data container implementing automatic type conversion.

**Supported Types:**
- String
- ArrayBuffer (central interchange format)
- ByteArray
- Number
- HTML
- BigNumber
- JSON
- File
- List<File>

**Type Conversion Hub-and-Spoke Model:**
```
String ──────┐
ByteArray ───┤
Number ──────┼──> ArrayBuffer ──> Required Output Type
BigNumber ───┤
JSON ────────┤
HTML ────────┘
```

#### Recipe (Recipe.mjs)
Manages the sequence of operations, handling:
- Operation execution order
- Breakpoints
- Disabled operations
- Flow control operations

#### Operation (Operation.mjs)
Base class for all operations. Each operation defines:
- `name`: Display name
- `type`: Category
- `description`: Help text
- `inputType`: Expected input data type
- `outputType`: Produced output data type
- `args`: Array of Ingredient specifications
- `run()`: Transformation logic

### 2. Operations (`src/core/operations/`)

The heart of CyberChef - 463 individual operation files, each implementing a specific transformation.

**Operation Count by Category** (approximate):

| Category | Count | Examples |
|----------|-------|----------|
| Cryptography | 80+ | AES, RSA, DES, Enigma |
| Encoding | 60+ | Base64, Hex, URL, Punycode |
| Hashing | 40+ | MD5, SHA family, bcrypt, Argon2 |
| Data Format | 50+ | JSON, XML, Protobuf, CBOR |
| Compression | 20+ | gzip, bzip2, LZMA, LZ4 |
| Networking | 30+ | IP parsing, DNS, HTTP headers |
| Utils | 40+ | Text manipulation, math, regex |
| DateTime | 15+ | Parsing, formatting, conversion |
| Forensics | 20+ | File carving, EXIF, magic bytes |
| Code | 30+ | JavaScript, Python, SQL beautify |
| Image | 15+ | QR codes, image manipulation |
| Other | 60+ | Various specialized operations |

### 3. Node.js API (`src/node/`)

Provides programmatic access to CyberChef operations.

**Entry Points:**
- `index.mjs`: ES6 module exports
- `wrapper.js`: CommonJS compatibility layer

**Key Files:**
- `api.mjs`: Core API functions
- `config/OperationConfig.json`: Auto-generated operation metadata
- `repl.mjs`: Interactive REPL for testing

**Usage Example:**
```javascript
import CyberChef from 'cyberchef';

const result = CyberChef.bake('Hello World', [
    { op: 'To Base64' },
    { op: 'AES Encrypt', args: ['key', 'iv', 'CBC'] }
]);
```

### 4. Web UI (`src/web/`)

Browser-specific implementation with drag-and-drop interface.

**Waiter Pattern:**
Specialized classes handle different UI responsibilities:
- `RecipeWaiter`: Recipe panel interactions
- `InputWaiter`: Input panel handling
- `OutputWaiter`: Output panel management
- `WorkerWaiter`: Web Worker coordination
- `ControlsWaiter`: Control button events
- `HighlighterWaiter`: Text selection highlighting

**Web Workers:**
- `ChefWorker.js`: Primary recipe execution (cancellable)
- `InputWorker.mjs`: Asynchronous input loading
- `LoaderWorker.mjs`: File loading pool
- `ZipWorker.mjs`: Output compression

---

## Build System

### Grunt Tasks

CyberChef uses Grunt as the primary task runner with the following main tasks:

```bash
# Development server with hot reload
npm start
# or: npx grunt dev

# Production build (web app)
npm run build
# or: npx grunt prod

# Build Node.js library
npm run node
# or: npx grunt node

# Generate configuration files (required before tests)
npx grunt configTests

# Run all tests
npm test

# Lint code
npm run lint
# or: npx grunt lint

# UI tests
npm run testui
```

### Build Process Flow

1. **Config Generation** (`exec:generateConfig`)
   - Scans all operations in `src/core/operations/`
   - Generates `src/core/config/OperationConfig.json`
   - Creates `src/node/index.mjs` with all exports

2. **Module Resolution** (`findModules`)
   - Discovers all generated modules
   - Updates Webpack entry points

3. **Webpack Build** (`webpack:web` or `webpack:node`)
   - Transpiles ES6+ with Babel
   - Bundles dependencies
   - Applies optimizations
   - Generates source maps

4. **Post-Processing**
   - Copy standalone files
   - Create ZIP distribution
   - Calculate download hash
   - Set permissions with chmod

### Important Build Requirements

**Memory Requirements:**
The build process requires increased Node.js heap size due to the large dependency tree:

```bash
export NODE_OPTIONS=--max_old_space_size=2048
```

**Browser Support:**
```json
"browserslist": [
  "Chrome >= 50",
  "Firefox >= 38",
  "node >= 16"
]
```

### Generated Files (NOT committed to git)

These files are auto-generated by Grunt and should NOT be edited manually:

- `src/core/config/OperationConfig.json` - Operation metadata
- `src/node/index.mjs` - Node.js API entry point
- `src/core/config/modules/` - Module configuration
- `build/` - All build outputs

---

## Integration with MCP Fork

### Selective Sync Model

The CyberChef MCP Server fork uses a **selective sync** approach:

**KEPT from upstream:**
- `src/core/` - Core processing engine (with minor patches)
- `src/core/operations/` - All 463 operations
- `src/core/lib/` - Shared libraries
- `src/core/config/` - Configuration system
- `package.json` dependencies
- Build system (Gruntfile.js, webpack.config.js)
- Tests for core functionality

**REMOVED from upstream:**
- `src/web/` - Entire browser UI (except minimal stubs)
- `tests/browser/` - UI integration tests
- Web-specific dependencies (where possible)
- Docker configuration for web app

**ADDED in MCP fork:**
- `src/node/mcp-server.mjs` - MCP server implementation
- `src/node/logger.mjs` - Structured logging
- `src/node/errors.mjs` - Enhanced error handling
- `src/node/retry.mjs` - Retry logic for operations
- `src/node/streaming.mjs` - Streaming support
- `src/node/recipe-*.mjs` - Recipe management system
- `src/node/recipes/` - Predefined recipe library
- `Dockerfile.mcp` - MCP server container
- MCP-specific tests (`tests/node/test-mcp-*.mjs`)

### Modified Files in MCP Fork

Several upstream files have been patched for MCP compatibility:

| File | Modifications | Reason |
|------|--------------|--------|
| `src/core/lib/Magic.mjs` | Added SafeRegex import | Prevent ReDoS attacks |
| `src/core/Recipe.mjs` | Enhanced error handling | Better debugging |
| `src/core/Utils.mjs` | Added utility functions | MCP-specific needs |
| `src/node/api.mjs` | Streaming support | Handle large inputs |
| Various operations | Regex safety patches | Security hardening |

### Compatibility Considerations

1. **Node.js Version**: Upstream supports Node 16+, MCP fork targets Node 22+
2. **Dependencies**: MCP fork adds MCP SDK dependencies
3. **Type System**: Both use the same Dish type system
4. **Operation Signatures**: Fully compatible - MCP wraps upstream operations
5. **Configuration**: MCP generates tools from OperationConfig.json

### Differences from Upstream

```diff
Upstream CyberChef (GCHQ)          CyberChef MCP Server
============================       ============================
+ Web UI (browser app)             - Web UI removed
+ Docker web container             + Docker MCP container
+ Auto-bake feature                - Auto-bake N/A
+ Deep linking                     - Deep linking N/A
+ Local storage recipes            + JSON file recipes
+ Interactive UI                   + MCP protocol interface
- MCP server                       + MCP server (stdio transport)
- Recipe management API            + Recipe validation/storage API
- Structured logging               + Winston logging
- Retry logic                      + Exponential backoff retry
```

---

## Key Files and Directories

### Essential Configuration Files

#### package.json
Defines project metadata, dependencies, and scripts.

**Key NPM Scripts:**
- `start`: Development server
- `build`: Production build
- `node`: Node.js library build
- `test`: Run all tests
- `lint`: ESLint check
- `newop`: Interactive operation creation wizard

**Major Dependencies:**
- **Cryptography**: crypto-js, node-forge, jsrsasign, bcryptjs, argon2-browser
- **Compression**: @blu3r4y/lzma, browserify-zlib, bson
- **Data Processing**: protobufjs, avsc, jimp, tesseract.js
- **Build Tools**: webpack, grunt, babel, eslint

#### Gruntfile.js
Orchestrates the entire build process.

**Main Tasks:**
- `dev`: Development build with watch
- `prod`: Production build
- `node`: Node.js library compilation
- `configTests`: Generate test configurations
- `testui`: Run UI tests
- `testnodeconsumer`: Test CJS/ESM consumers

**Key Configuration:**
- Module entry point discovery
- Webpack configuration extension
- File copying and zipping
- Permission management
- Config generation scripts

#### webpack.config.js
Webpack bundling configuration for both web and Node targets.

**Features:**
- Code splitting
- Worker loader for Web Workers
- CSS extraction
- Source maps
- Bundle analysis
- Hot Module Replacement (dev)

### Core Source Files

#### src/core/Chef.mjs
Main orchestration class.

**Key Methods:**
- `bake(input, recipeConfig)`: Execute a recipe
- `help(search, excludeHidden)`: Search operations
- `bakeInputs(inputs, options)`: Process multiple inputs

#### src/core/Dish.mjs
Universal data container.

**Key Methods:**
- `get(type)`: Get value as specific type
- `set(value, type)`: Set value with type
- `valid()`: Check if value is valid
- `presentAs(type)`: Convert to type without changing internal state

#### src/core/Recipe.mjs
Operation sequence manager.

**Key Methods:**
- `execute(dish, startOp, endOp)`: Run operation sequence
- `addOperation(name)`: Add operation to recipe
- `lastRunOp`: Track execution progress

#### src/core/Operation.mjs
Base operation class.

**Properties:**
- `name`, `type`, `description`
- `inputType`, `outputType`
- `args`: Array of Ingredients
- `run(input, args)`: Core transformation logic

### Configuration Files

#### src/core/config/Categories.json
Defines operation taxonomy.

**Structure:**
```json
{
  "Cryptography": ["AES Decrypt", "AES Encrypt", ...],
  "Encoding": ["From Base64", "To Base64", ...],
  ...
}
```

#### src/core/config/OperationConfig.json (Generated)
Auto-generated operation metadata used by Node.js API and MCP server.

**Generated By:**
```bash
npx grunt configTests
```

**Structure:**
```json
{
  "AES Decrypt": {
    "description": "...",
    "inputType": "string",
    "outputType": "string",
    "args": [
      {"name": "Key", "type": "toggleString", ...},
      ...
    ]
  }
}
```

### Test Files

#### tests/operations/index.mjs
Main test runner for operation tests.

**Test Structure:**
Each operation has a corresponding test file with:
- Input/output test cases
- Edge cases
- Error handling tests

#### tests/node/index.mjs
Node.js API tests.

**Coverage:**
- Import/export functionality
- API method behavior
- Error handling
- Type conversions

### Docker Files

#### Dockerfile (Upstream Web App)
Builds the web application container.

**Key Steps:**
1. Install dependencies
2. Build production bundle
3. Serve with NGINX

#### .dockerignore
Excludes unnecessary files from Docker context.

---

## Pulling Updates from Upstream

### Update Strategy

The CyberChef MCP fork should periodically sync with upstream to get:
- New operations
- Bug fixes
- Performance improvements
- Security patches

### Sync Process

1. **Add upstream remote** (if not already added):
```bash
git remote add upstream https://github.com/gchq/CyberChef.git
git fetch upstream
```

2. **Review upstream changes**:
```bash
git log upstream/master --oneline --since="2024-01-01"
```

3. **Selectively merge changes**:
```bash
# Checkout a new branch
git checkout -b sync-upstream-YYYY-MM-DD

# Merge specific files/directories
git checkout upstream/master -- src/core/operations/
git checkout upstream/master -- src/core/lib/
git checkout upstream/master -- package.json

# Review and resolve conflicts
git status
git diff
```

4. **Re-apply MCP patches**:
```bash
# SafeRegex imports
# Node 22 compatibility fixes
# Custom modifications
```

5. **Regenerate configurations**:
```bash
npm install
npx grunt configTests
```

6. **Run tests**:
```bash
npm test
npm run test:mcp
```

7. **Commit and merge**:
```bash
git commit -m "chore: sync with upstream CyberChef vX.Y.Z"
git checkout master
git merge sync-upstream-YYYY-MM-DD
```

### Files to Watch

When pulling updates, pay special attention to:

| File/Directory | Action | Reason |
|----------------|--------|--------|
| `src/core/operations/` | Merge | New operations available |
| `src/core/lib/` | Review + Merge | May need SafeRegex patches |
| `package.json` | Review + Merge | Dependency updates |
| `Gruntfile.js` | Review + Merge | Build process changes |
| `src/core/Chef.mjs` | Review carefully | Core orchestration |
| `src/core/Dish.mjs` | Review carefully | Type system changes |
| `src/core/Recipe.mjs` | Review carefully | May have MCP patches |

### Avoiding Merge Conflicts

To minimize conflicts:

1. **Never modify operation files directly** - wrap them in MCP layer
2. **Document all patches** with comments explaining why
3. **Keep patches minimal** - only what's strictly necessary
4. **Test thoroughly** after each sync

### Version Tracking

Track upstream version in MCP fork:

```javascript
// In mcp-server.mjs or package.json
const UPSTREAM_VERSION = "10.19.4";
const MCP_VERSION = "1.7.0";
```

---

## References

### Official Resources

- **GitHub Repository**: https://github.com/gchq/CyberChef
- **Live Demo**: https://gchq.github.io/CyberChef
- **NPM Package**: https://www.npmjs.com/package/cyberchef
- **Wiki**: https://github.com/gchq/CyberChef/wiki
- **Contributing Guide**: https://github.com/gchq/CyberChef/wiki/Contributing
- **Node API Documentation**: https://github.com/gchq/CyberChef/wiki/Node-API
- **Gitter Chat**: https://gitter.im/gchq/CyberChef

### Related Projects

- **CyberChef-server**: https://github.com/gchq/CyberChef-server (REST API)
- **cyberchef-recipes**: https://github.com/mattnotmax/cyberchef-recipes (Recipe collection)

### Security

- **Security Policy**: https://github.com/gchq/CyberChef/security/policy
- **CVE-2019-15532**: XSS vulnerability in HTML output (fixed)

### License

- **License**: Apache License 2.0
- **Copyright**: Crown Copyright 2016
- **Full Text**: https://github.com/gchq/CyberChef/blob/master/LICENSE

---

## Changelog of Reference Snapshot

The reference snapshot in `ref-proj/CyberChef` was taken at:
- **Commit**: [To be documented]
- **Date**: [To be documented]
- **Version**: 10.19.4
- **Operations Count**: 463

---

*This documentation is maintained as part of the CyberChef MCP Server project and is updated whenever the upstream reference is synced.*
