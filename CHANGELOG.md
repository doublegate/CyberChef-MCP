# Changelog

All notable changes to the CyberChef MCP Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

### Changed
- Enhanced README with security highlights and production-ready status
- Improved README badges with more descriptive labels
- Updated Quick Start section to prioritize GHCR image over building from source
- Expanded Technical Highlights section with security and CI/CD information
- Reorganized Documentation section with clear categorization
- Enhanced Contributing section with detailed workflow and expectations

### Fixed
- README documentation links to reflect new directory structure (`docs/planning/`, `docs/security/`, `docs/releases/`)

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
