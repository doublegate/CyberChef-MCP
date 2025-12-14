# Changelog

All notable changes to the CyberChef MCP Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

*No unreleased changes.*

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
