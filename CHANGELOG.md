# Changelog

All notable changes to the CyberChef MCP Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Dependencies**: Resolved critical npm install failure caused by incompatible overrides
  - Removed problematic `rimraf@>=5.0.0` override that broke `grunt-contrib-clean` (rimraf v5+ has incompatible API)
  - Removed `inflight@>=2.0.0` override (version 2.0.0 does not exist)
  - Removed `glob@>=10.0.0` override (was conflicting with transitive dependencies)
- **Dependencies**: Removed unused `@babel/polyfill` dependency (not imported anywhere in source code)
- **Dependencies**: Added `glob@^10.5.0` as direct devDependency (required by Gruntfile.js)
- **Node.js**: Package-lock regenerated with Node.js 22 for full compatibility

### Testing
- All 1,933 unit tests passing (1,716 operation tests + 217 Node API tests)
- CJS and ESM consumer tests passing
- npm install succeeds without errors on Node.js 22

## [1.4.2] - 2025-12-14

### Changed
- Replaced deprecated `loglevel-message-prefix` package with `@natlibfi/loglevel-message-prefix@^3.0.1`
- Updated all 5 worker files to use new logging package:
  - `src/core/ChefWorker.js`
  - `src/web/workers/DishWorker.mjs`
  - `src/web/workers/InputWorker.mjs`
  - `src/web/workers/LoaderWorker.js`
  - `src/web/workers/ZipWorker.mjs`

### Fixed
- **CI/CD**: Added browserslist database auto-update (`npx update-browserslist-db@latest`) to prevent outdated caniuse-lite warnings
  - Applied to `core-ci.yml` and `performance-benchmarks.yml` workflows
- **CI/CD**: Added git default branch configuration (`git config --global init.defaultBranch master`) to suppress Git 3.0 deprecation hints
  - Applied to all 5 workflow files (9 jobs total): `core-ci.yml`, `mcp-docker-build.yml`, `mcp-release.yml`, `performance-benchmarks.yml`, `security-scan.yml`

### Known Issues
- npm deprecation warnings remain for transitive dependencies that cannot be updated without breaking changes:
  - `bootstrap@4.6.2`, `bootstrap-colorpicker@3.4.0`, `popper.js@1.16.1` (web UI dependencies)
  - `glob@7.x/8.x`, `rimraf@2.7.1`, `inflight@1.0.6` (from grunt-contrib-clean and other build tools)
  - `@astronautlabs/amf@0.0.6` (node ^14 engine warning - informational only, package works on Node 22)

## [1.4.1] - 2025-12-14

### Security
- **Fixed 11 of 12 Code Scanning Vulnerabilities**: Comprehensive security hardening addressing ReDoS and cryptographic weaknesses
  - **CRITICAL**: Fixed insecure cryptographic randomness in `src/core/vendor/gost/gostRandom.mjs`
    - Replaced `Math.random()` with Node.js `crypto.randomBytes()` for cryptographic operations
    - Prevents predictable cryptographic key generation
    - Throws error if no secure RNG is available
  - **HIGH**: Fixed 7 Regular Expression Denial of Service (ReDoS) vulnerabilities across 6 operations
    - `src/core/operations/RAKE.mjs` (2 instances)
    - `src/core/operations/Filter.mjs`
    - `src/core/operations/FindReplace.mjs`
    - `src/core/operations/Register.mjs`
    - `src/core/operations/Subsection.mjs`
    - `src/core/operations/RegularExpression.mjs`
  - **LOW**: Documented 3 acceptable `Math.random()` usages in non-cryptographic contexts
    - `Numberwang.mjs` (trivia facts)
    - `RandomizeColourPalette.mjs` (color seeds)
    - `LoremIpsum.mjs` (placeholder text)
  - **DOCUMENTED**: Web UI code injection vulnerability (OutputWaiter.mjs) - Web UI only, not affecting MCP server

### Added
- **SafeRegex.mjs Security Module**: New centralized regex validation utility (`src/core/lib/SafeRegex.mjs`)
  - Pattern length validation (10,000 character maximum)
  - ReDoS pattern detection (nested quantifiers, overlapping alternations)
  - Timeout-based validation (100ms) to detect catastrophic backtracking
  - XRegExp and standard RegExp support
  - Exported functions: `validateRegexPattern()`, `createSafeRegExp()`, `createSafeXRegExp()`, `escapeRegex()`
- **GitHub Copilot Agent Support**: Added `.github/agents/copilot-instructions.md` to ensure GitHub Copilot Agents can discover and use custom instructions

### Changed
- **Regex operations**: All user-controlled regex patterns now validated through SafeRegex module
- **GOST cryptography**: Enhanced random number generation with secure fallback error handling

### Fixed
- **Security**: Eliminated ReDoS attack vectors preventing denial of service through malicious regex patterns
- **Security**: Cryptographic operations now use cryptographically secure random number generation exclusively

### Testing
- All 1,933 unit tests passing (1,716 operation tests + 217 Node API tests)
- ESLint validation passing
- Manual testing with known ReDoS patterns confirms proper rejection
- Cryptographic operations verified using secure RNG

## [1.4.0] - 2025-12-14

### Added
- **Performance Optimization Infrastructure**: Comprehensive performance improvements for handling large operations
  - LRU cache for operation results (100MB default, configurable)
  - Buffer pooling for memory optimization
  - Memory monitoring with periodic logging
  - Input size validation (100MB max default, configurable)
  - Operation timeout enforcement (30s default, configurable)
- **Streaming API**: Automatic streaming for large inputs (>10MB threshold)
  - Chunked processing for memory efficiency
  - Supports encoding, compression, and hashing operations
  - Transparent fallback for non-streaming operations
  - Configurable via `CYBERCHEF_STREAMING_THRESHOLD` environment variable
- **Resource Limits**: Configurable limits for stability and security
  - Max input size: `CYBERCHEF_MAX_INPUT_SIZE` (default: 100MB)
  - Operation timeout: `CYBERCHEF_OPERATION_TIMEOUT` (default: 30s)
  - Cache size: `CYBERCHEF_CACHE_MAX_SIZE` (default: 100MB)
  - Cache items: `CYBERCHEF_CACHE_MAX_ITEMS` (default: 1000)
- **Performance Benchmark Suite**: Comprehensive benchmarking infrastructure
  - Tinybench-based benchmark suite with 20+ operations across 6 categories
    - Encoding (Base64, Hex)
    - Hashing (MD5, SHA256, SHA512)
    - Compression (Gzip)
    - Cryptographic (AES Encrypt)
    - Text (Regular Expression)
    - Analysis (Entropy, Frequency Distribution)
  - Multiple input size testing (1KB, 10KB, 100KB)
  - New script: `npm run benchmark`
  - CI/CD integration via `performance-benchmarks.yml` workflow
  - Automated benchmark execution on code changes
- **Worker Thread Infrastructure**: Foundation for CPU-intensive operation offloading
  - Identification of 25+ CPU-intensive operations including:
    - Cryptographic: AES, DES, RSA, Bcrypt, Scrypt
    - Hashing: SHA family, MD5, BLAKE2, Whirlpool
    - Compression: Gzip, Bzip2
    - Key generation: RSA, PGP
  - Infrastructure for future worker pool implementation
  - Configurable via `CYBERCHEF_ENABLE_WORKERS` environment variable

### Changed
- **Version bump**: `1.3.0` → `1.4.0` in `package.json` (mcpVersion field) and `mcp-server.mjs`
- **Server startup**: Enhanced logging with performance configuration display
  - Shows max input size, timeout, streaming threshold, cache settings
  - Better visibility into server capabilities
- **Operation execution**: All operations now benefit from caching and resource limits
  - Cache hit logging for debugging
  - Streaming detection and activation logging
  - Memory usage monitoring

### Performance
- **Memory efficiency**: LRU cache reduces redundant computation for repeated operations
- **Large input handling**: 100MB+ inputs processed via streaming without OOM errors
- **Latency improvements**: Cached operations return instantly
- **Resource protection**: Timeouts prevent runaway operations

### Documentation
- **Release notes**: Comprehensive `docs/releases/v1.4.0.md` with configuration examples and migration guide
- **Performance tuning guide**: `docs/performance-tuning.md` with deployment scenarios and optimization strategies
- **Benchmark documentation**: Usage instructions and CI integration details
- **Environment variables**: Complete reference for all 7 configuration options
- **README.md**: New "Performance & Configuration" section with examples for different deployment scenarios
- **Updated version references**: All documentation updated from v1.3.0 to v1.4.0

### Dependencies
- **Added**: `tinybench@^4.1.0` for performance benchmarking

### Success Metrics
- ✅ Process 100MB inputs successfully via streaming
- ✅ Memory monitoring and cache management operational
- ✅ Operation timeout enforcement working
- ✅ Benchmark suite integrated into CI/CD
- ✅ All 465 MCP tools validated and functional

## [1.3.0] - 2025-12-14

### Added
- **Upstream Release Monitoring**: Automated GitHub Actions workflow to detect new CyberChef releases
  - Runs every 6 hours via cron schedule
  - Creates GitHub issues for new releases with actionable next steps
  - Prevents duplicate notifications
  - Workflow: `.github/workflows/upstream-monitor.yml`
- **Automated Upstream Sync**: Complete automation for merging upstream changes
  - Triggered by issue label (`upstream-sync-approved`) or manual dispatch
  - Automatic merge of upstream CyberChef changes
  - Regenerates `OperationConfig.json` with Grunt
  - Applies Node 22 compatibility patches
  - Runs comprehensive test suite validation
  - Updates baseline for regression detection
  - Creates pull request with detailed changeset
  - Handles merge conflicts with manual intervention guidance
  - Workflow: `.github/workflows/upstream-sync.yml`
- **MCP Validation Test Suite**: Comprehensive Vitest-based testing
  - 465 total tool validations (463 operations + 2 meta-tools)
  - Meta-tool functionality tests (cyberchef_bake, cyberchef_search)
  - 50+ sample operation execution tests
  - Schema validation for all operations
  - Breaking change detection via baseline comparison
  - Performance benchmarks (10 operations in <1 second)
  - Error handling validation
  - Test file: `tests/mcp/validation.test.mjs`
  - New script: `npm run test:mcp`
- **Tool Baseline Tracking**: Regression detection system
  - Complete inventory of 465 tools with metadata
  - Operation schemas and argument types
  - Version tracking for compatibility
  - Baseline file: `tests/mcp/baseline.json`
- **Emergency Rollback Mechanism**: Manual workflow for quick reversion
  - Rolls back to specified commit or parent
  - Regenerates configurations automatically
  - Runs full test suite for validation
  - Creates rollback PR with detailed summary
  - Workflow: `.github/workflows/rollback.yml`
- **Vitest Configuration**: Modern testing framework integration
  - Isolated MCP test execution
  - Node environment with ESM support
  - 10-second timeout for slow operations
  - Config file: `vitest.config.mjs`

### Changed
- **Version bump**: `1.2.6` → `1.3.0` in `package.json` (mcpVersion field) and `mcp-server.mjs`
- **Testing infrastructure**: Added Vitest alongside existing test framework
  - New devDependency: `vitest@^1.0.0`
  - Separate test suite prevents conflicts with existing tests

### Documentation
- **Release notes**: Comprehensive `docs/releases/v1.3.0.md` with usage examples
- **Workflow documentation**: Detailed usage instructions for all three workflows
- **Test documentation**: Coverage metrics and execution guidelines
- **Version references**: Updated across README.md, user_guide.md, SECURITY.md

### Success Metrics
- ✅ Zero manual intervention for patch/minor updates
- ✅ Automated PR creation within 24 hours of upstream release
- ✅ Comprehensive test validation (465 tools)
- ✅ Rollback capability tested and documented
- ✅ OperationConfig regeneration automated in CI

### Security
- All workflows follow GitHub Actions security best practices
- Environment variables used for all dynamic inputs
- No direct interpolation of user-controlled data
- Token permissions scoped to minimum required
- Input sanitization for workflow_dispatch parameters

## [1.2.6] - 2025-12-14

### Changed
- **Dockerfile** (web app): Optimized nginx base image for smaller footprint and improved security
  - Changed from `nginx:stable-alpine` to `nginx:1.29-alpine-slim`
  - `alpine-slim` variant provides reduced image size with minimal attack surface
  - Explicit nginx version pinning for reproducible builds
- **Dockerfile** (web app): Enhanced non-root permission setup for alpine-slim variant
  - Added explicit creation of nginx cache directories (`/var/cache/nginx/*`)
  - Added proper ownership for `/var/run` and `/run` directories
  - Fixed `permission denied` errors for nginx PID file and cache directories
  - Ensures proper non-root execution with nginx user in alpine-slim environment

### Fixed
- **nginx:alpine-slim compatibility**: Resolved permission denied errors for non-root nginx execution
  - Root cause: `alpine-slim` variant has stricter default permissions than standard `alpine`
  - Fixed cache directory permissions: `mkdir -p` for client_temp, proxy_temp, fastcgi_temp, uwsgi_temp, scgi_temp
  - Fixed PID file permissions: `chown -R nginx:nginx /var/run && chown -R nginx:nginx /run`

### Documentation
- Updated version references across all documentation files
- Added v1.2.6 to release notes index
- Updated download URLs and installation instructions

## [1.2.5] - 2025-12-14

### Security
- **Fixed 5 GitHub Security code scanning alerts**:
  - **DS026**: Added HEALTHCHECK to original `Dockerfile` (web app) for container orchestration
  - **DS002**: Added non-root user (nginx) execution to original `Dockerfile` (web app)
  - **CVE-2025-64756**: Updated npm in `Dockerfile.mcp` to fix glob command injection vulnerability (glob 10.4.5 → 10.5.0+)
  - **js/insufficient-password-hash** (x2): Dismissed as false positive - DeriveEVPKey intentionally implements OpenSSL EVP_BytesToKey for compatibility, NOT password storage. Users should use Argon2/bcrypt/scrypt operations for secure password hashing.
- **Argon2 operation hardened to OWASP 2024-2025 recommendations**:
  - Default type changed from Argon2i → **Argon2id** (hybrid side-channel + GPU resistance)
  - Default memory increased from 4 MiB → **19 MiB** (OWASP minimum recommendation)
  - Default iterations adjusted to **2** (OWASP recommended for 19 MiB memory)
  - Added OWASP recommendation note to operation description
  - Reference: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

### Changed
- **Dockerfile** (web app): Security hardening overhaul
  - Added OCI metadata labels
  - Added non-root user execution (nginx user)
  - Added HEALTHCHECK instruction for container orchestration
  - Added EXPOSE 80 declaration
  - **Upgraded Node.js 18 → Node.js 22** for build stage (crypto global + ES module support)
  - Added SlowBuffer compatibility patches for Node.js 22
- **Dockerfile.mcp**: Added npm update to fix bundled glob CVE-2025-64756
- **.dockerignore**: Expanded exclusions to prevent unnecessary files in MCP container
  - Excludes original `Dockerfile` to prevent Trivy alerts on web app Dockerfile in MCP container
  - Added IDE, test, and temporary file exclusions for smaller container image
- **babel.config.js**: Updated from `@babel/plugin-syntax-import-assertions` to `@babel/plugin-syntax-import-attributes`
  - Fixes ES2024 import attributes syntax (`with { type: "json" }`)
  - Enables proper Webpack parsing of JSON imports
- Version bump: `1.2.0` → `1.2.5` in `package.json`, `mcp-server.mjs`, and documentation

### Fixed
- **Docker Hub build failure**: Fixed `ReferenceError: crypto is not defined` during web app Dockerfile build
  - Root cause: Node.js 18 lacks global `crypto` object (added in Node.js 19+)
  - Solution: Upgraded builder stage from `node:18-alpine` to `node:22-alpine`
- **Webpack build failure**: Fixed `Module parse failed: Unexpected token` for JSON imports
  - Root cause: Babel's `@babel/plugin-syntax-import-assertions` doesn't support ES2024 `with` syntax
  - Solution: Switched to `@babel/plugin-syntax-import-attributes` with `deprecatedAssertSyntax` option

## [1.2.0] - 2025-12-14

### Security
- **Non-root container execution**: Container now runs as dedicated `cyberchef` user (UID 1001)
  - Prevents privilege escalation attacks
  - Reduces impact of container escape vulnerabilities
- **Automated vulnerability scanning**: Integrated Trivy for container and dependency scanning
  - Scans on every push, pull request, and release
  - Weekly scheduled scans for newly discovered CVEs
  - Results uploaded to GitHub Security tab (SARIF format)
- **SBOM generation**: Software Bill of Materials (CycloneDX format) generated for each release
  - Attached to GitHub releases for supply chain transparency
  - Enables dependency tracking and compliance
- **Read-only filesystem support**: Container compatible with `--read-only` flag
  - Enables immutable deployments
  - Reduces attack surface
- **Security policy**: Added comprehensive `SECURITY.md` with vulnerability reporting guidelines

### Added
- **New CI workflow**: `.github/workflows/security-scan.yml` for automated security scanning
  - Trivy container vulnerability scanning
  - Trivy filesystem/dependency scanning
  - npm audit results collection
  - SBOM generation as artifact
- **Container health check**: Built-in Docker HEALTHCHECK for orchestration
- **OCI metadata labels**: Standard container labels for documentation and provenance
- **Security documentation**: Enhanced user guide with security best practices section

### Changed
- **Dockerfile.mcp**: Complete security hardening overhaul
  - Added non-root user creation (cyberchef:cyberchef, UID/GID 1001)
  - Added OCI image labels for metadata
  - Added security comments and documentation
  - Removed unnecessary files from production image (tests, docs, config files)
  - Added HEALTHCHECK instruction
- **mcp-docker-build.yml**: Added Trivy scanning and non-root verification
- **mcp-release.yml**: Added SBOM generation and attachment to releases
  - Added automatic GitHub Release creation for version tags
  - Fixed Docker image tag handling for tarball export (uses `latest` tag)
- **README.md**: Updated security section with v1.2.0 hardening features
- **user_guide.md**: Added comprehensive security best practices section
- **CodeQL Action v3 → v4**: Migrated all workflows from deprecated CodeQL v3 to v4
  - `codeql.yml`: `init@v4` and `analyze@v4`
  - `security-scan.yml`: `upload-sarif@v4` (2 occurrences)
  - `mcp-docker-build.yml`: `upload-sarif@v4`
  - `mcp-release.yml`: `upload-sarif@v4`
- Updated all version references from v1.1.0 to v1.2.0

### Fixed
- **mcp-release.yml**: Fixed Docker image tag mismatch preventing release asset generation
  - `docker/metadata-action` generates tags without 'v' prefix (e.g., `1.2.0` not `v1.2.0`)
  - Changed to use `latest` tag for docker pull, save, and Trivy scans
- **mcp-release.yml**: Fixed missing GitHub Release creation before asset uploads
  - Workflow now automatically creates release if it doesn't exist
  - Uses `gh release create` with `--verify-tag` for safety

### Documentation
- **Comprehensive product roadmap v1.1.0 to v3.0.0** spanning 19 releases across 6 development phases
  - `docs/ROADMAP.md`: Master roadmap with Gantt timeline, release overview, and LTS strategy
  - 19 release plans (`docs/planning/release-v1.2.0.md` through `release-v3.0.0.md`)
  - 6 phase/sprint documents covering Q1 2026 through Q3 2027
- **Strategy documents** for major architectural initiatives:
  - `UPSTREAM-SYNC-STRATEGY.md`: Automated CyberChef update monitoring via Renovate/GitHub Actions
  - `SECURITY-HARDENING-PLAN.md`: Docker Hardened Images, non-root execution, Trivy scanning, SBOM
  - `MULTI-MODAL-STRATEGY.md`: Binary data, image, and audio handling through MCP protocol
  - `PLUGIN-ARCHITECTURE-DESIGN.md`: Custom operation registration with sandboxed execution
  - `ENTERPRISE-FEATURES-PLAN.md`: OAuth 2.1, RBAC, audit logging, multi-tenancy
- **Extended task tracker** with 500+ tasks organized by release (v1.2.0 - v3.0.0)
- New "Project Roadmap" section in README with phase overview table

## [1.1.0] - 2025-12-13

### Security
- **Fixed 11 vulnerabilities** (5 code scanning + 2 dependency + 4 npm audit fixes)
  - CWE-116: Incomplete string escaping in `Utils.mjs`, `PHPDeserialize.mjs`, and `JSONBeautify.mjs`
  - CWE-79: Cross-site scripting (XSS) in `BindingsWaiter.mjs`
  - CWE-916: Insufficient password hash iterations in `DeriveEVPKey.mjs` (now 10,000 minimum)
  - CVE-2024-55565: Removed `babel-plugin-transform-builtin-extend` (prototype pollution)
  - GHSA-64g7-mvw6-v9qj: Added `shelljs@>=0.8.5` override (command injection)
  - Updated `@modelcontextprotocol/sdk` to 1.24.3 (DNS rebinding fix)
  - Updated `@babel/helpers` and `@babel/runtime` to 7.28.4 (ReDoS fixes)
  - Updated `body-parser`, `brace-expansion`, `jws` via npm audit
- **Enhanced password hashing**: Increased DeriveEVPKey minimum iterations from 1,000 → 10,000 (NIST SP 800-63B compliance)
- **XSS protection**: Replaced `innerHTML` with safe DOM API methods (`textContent`, `createElement`)
- **String escaping**: Implemented proper two-step escaping pattern (backslashes first, then quotes)
- **Vulnerability reduction**: 76% overall (16 of 21 vulnerabilities fixed)
- **Production MCP server runtime**: Low Risk (5 remaining issues in dev dependencies only)

### Added
- **Docker image tarball distribution** for offline installation (approximately 270MB compressed)
  - Automated tarball export in `mcp-release.yml` workflow
  - Pre-built images available as release assets on GitHub Releases
  - Enables installation without GHCR access via `docker load`
- Node.js version badge to README
- Docker badge to README
- Claude Desktop client configuration section in README
- Comprehensive security section in README documenting 76% vulnerability reduction
- Enhanced documentation structure with categorized links (User, Technical, Project Management, Security)
- Testing section in README with npm test commands
- CI/CD workflow links and descriptions in README
- Repository information section with GHCR and issue tracker links
- Development workflow guidelines in Contributing section
- Option to pull pre-built Docker images from GHCR in Quick Start
- **Offline installation instructions** in README with tarball download steps
- Created `CLAUDE.md` project guidance file for Claude Code AI assistant
- Created `.github/SECURITY_MAINTENANCE.md` ongoing security procedures guide
- Created `.github/copilot-instructions.md` for GitHub Copilot
- Created `scripts/fix-serialize-javascript.js` automated patch for Node.js 22+ compatibility
- Added `mcpVersion` field to `package.json` (separate from CyberChef version)

### Changed
- Enhanced README with security highlights and production-ready status
- Improved README badges with more descriptive labels
- Updated Quick Start section to prioritize GHCR image over building from source
- Expanded Technical Highlights section with security and CI/CD information
- Reorganized Documentation section with clear categorization
- Enhanced Contributing section with detailed workflow and expectations
- Documentation reorganization:
  - Created `docs/planning/` directory (moved `to-dos/roadmap.md` and `to-dos/tasks.md`)
  - Created `docs/releases/` directory (moved `RELEASE_NOTES.md` → `docs/releases/v1.0.0.md`)
  - Created `docs/security/` directory (moved `SECURITY_AUDIT.md` → `docs/security/audit.md`)
- Updated all documentation references to reflect new paths
- Improved CHANGELOG.md formatting and organization
- Updated `.gitignore` to exclude Docker tarballs and CLAUDE.local.md

### Fixed
- README documentation links to reflect new directory structure (`docs/planning/`, `docs/security/`, `docs/releases/`)
- **Node.js 22 compatibility**: Fixed `serialize-javascript` compatibility with automated patch
- **Build process**: Corrected test expectations for DeriveEVPKey (10,000 iterations)
- **CI workflows**: All 5 GitHub Actions workflows verified passing
- JWT and JPath test failures (updated RSA keys to 2048 bits, fixed ES384/ES512 curves)

### Removed
- `babel-plugin-transform-builtin-extend` from dependencies (deprecated, security risk)
- `GEMINI.md` file (consolidated guidance into CLAUDE.md and copilot-instructions.md)

### Breaking Changes
- **DeriveEVPKey minimum iterations increased to 10,000** (NIST SP 800-63B compliance)
  - Users specifying `<10,000` iterations will receive secure minimum with warning
  - Update recipes using DeriveEVPKey with low iteration counts

## [1.0.0-post-security] - 2025-12-13

### Security
- **Fixed 7 vulnerabilities** (5 code scanning + 2 dependency)
  - CWE-116: Incomplete string escaping in `Utils.mjs`, `PHPDeserialize.mjs`, and `JSONBeautify.mjs`
  - CWE-79: Cross-site scripting (XSS) in `BindingsWaiter.mjs`
  - CWE-916: Insufficient password hash iterations in `DeriveEVPKey.mjs`
  - Prototype pollution in `babel-plugin-transform-builtin-extend`
  - Command injection in `shelljs` (via transitive dependency)
- **Enhanced password hashing**: Increased DeriveEVPKey default iterations from 1 → 10,000 (NIST SP 800-132 compliance)
- **Runtime enforcement**: Added minimum iteration count of 1,000 with validation and user warnings
- **XSS protection**: Replaced `innerHTML` with safe DOM API methods (`textContent`, `createElement`)
- **String escaping**: Implemented proper two-step escaping pattern (backslashes first, then quotes)
- **Dependency hardening**: Added npm overrides for `shelljs@>=0.8.5`

### Changed
- Documentation reorganization:
  - Created `docs/planning/` directory (moved `to-dos/roadmap.md` and `to-dos/tasks.md`)
  - Created `docs/releases/` directory (moved `RELEASE_NOTES.md` → `docs/releases/v1.0.0.md`)
  - Created `docs/security/` directory (moved `SECURITY_AUDIT.md` → `docs/security/audit.md`)
  - Removed `GEMINI.md` (consolidated into existing AI assistant instructions)
- Updated `CLAUDE.md` with new directory structure and documentation sections
- Updated all documentation references to reflect new paths

### Fixed
- **Node.js 22 compatibility**: Fixed `serialize-javascript` compatibility and updated test expectations
- **Build process**: Corrected test expectations for serialization output format
- **Dependency conflicts**: Resolved version mismatches and deprecated package usage

### Removed
- `babel-plugin-transform-builtin-extend` from dependencies (deprecated, security risk)
- `GEMINI.md` file (consolidated guidance)

## [1.0.0] - 2025-11-20

### Added - Major MCP Server Transformation
This release marks the transformation of the CyberChef repository into a fully functional Model Context Protocol (MCP) Server.

#### MCP Server Implementation
- New entry point `src/node/mcp-server.mjs` using `@modelcontextprotocol/sdk`
- Stdio transport support for CLI and IDE integration
- `cyberchef_bake` meta-tool for executing complex multi-stage recipes
- 300+ dynamically generated atomic operation tools (e.g., `cyberchef_aes_decrypt`, `cyberchef_to_base64`)
- `cyberchef_search` utility for operation discovery
- Zod-based schema validation for all tool inputs

#### Containerization
- `Dockerfile.mcp` based on `node:22-alpine`
- Automated CyberChef configuration generation in container build
- Optimized multi-stage build process
- SlowBuffer compatibility patches for Node.js 22+

#### CI/CD Pipelines
- `mcp-docker-build.yml`: Automated Docker container builds on every push
- `mcp-release.yml`: Automated GHCR publishing on version tags
- `core-ci.yml`: Maintains stability of underlying CyberChef logic
- `codeql.yml`: Automated security scanning
- `pull_requests.yml`: PR validation workflow

#### Documentation
- Complete README rewrite focused on MCP usage
- `docs/architecture.md`: Technical design documentation
- `docs/user_guide.md`: Installation and client configuration guide
- `docs/commands.md`: Comprehensive tool reference
- `docs/technical_implementation.md`: Implementation details
- `docs/project_summary.md`: Project overview
- `docs/releases/v1.0.0.md`: Release notes

### Changed
- Refactored all JSON imports to use modern `import ... with { type: "json" }` syntax (Node.js 22+)
- Patched `avsc` and `buffer-equal-constant-time` for SlowBuffer deprecation
- Updated core CI workflows to support Node.js v22
- Migrated from legacy CyberChef web app focus to MCP server focus

### Fixed
- Node.js v22 compatibility issues with deprecated APIs
- ES Module import syntax for JSON files
- SlowBuffer usage in legacy dependencies

---

## Original CyberChef History

<details>
    <summary>Click to expand version history of the original CyberChef Web App (up to v10.19.4)</summary>

### [10.19.0] - 2024-06-21
- Add support for ECDSA and DSA in 'Parse CSR' [@robinsandhu] | [#1828]
- Fix typos in SIGABA.mjs [@eltociear] | [#1834]

*(Previous history truncated for brevity - refer to the original repository for full history)*
</details>
