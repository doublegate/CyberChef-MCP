# CyberChef MCP Server

This project provides a **Model Context Protocol (MCP)** server interface for **CyberChef**, the "Cyber Swiss Army Knife" created by [GCHQ](https://github.com/gchq/CyberChef).

By running this server, you enable AI assistants (like Claude, Cursor AI, and others) to natively utilize CyberChef's extensive library of 463+ data manipulation operations—including encryption, encoding, compression, and forensic analysis—as executable tools.

**Latest Release:** v1.4.2 | [Release Notes](docs/releases/v1.4.2.md) | [Security Policy](SECURITY.md) | [Security Fixes Report](SECURITY_FIX_REPORT.md)

![CyberChef MCP Banner](images/CyberChef-MCP_Banner-Logo.jpg)

[![MCP Enabled](https://img.shields.io/badge/MCP-Enabled-blue)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Docker Version](https://img.shields.io/github/v/release/doublegate/CyberChef-MCP?logo=docker&label=docker)](https://github.com/doublegate/CyberChef-MCP/releases)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![Security Scan](https://github.com/doublegate/CyberChef-MCP/actions/workflows/security-scan.yml/badge.svg)](https://github.com/doublegate/CyberChef-MCP/actions/workflows/security-scan.yml)

## Project Context

**CyberChef** is a simple, intuitive web app for carrying out all manner of "cyber" operations within a web browser. It was originally conceived and built by [GCHQ](https://github.com/gchq/CyberChef).

This fork wraps the core CyberChef Node.js API into an MCP server, bridging the gap between natural language AI intent and deterministic data processing.

![CyberChef MCP Blueprint](images/CyberChef-MCP_Blueprint.jpg)

## Features

### MCP Tools
The server exposes CyberChef operations as MCP tools:

*   **`cyberchef_bake`**: The "Omni-tool". Executes a full CyberChef recipe (a chain of operations) on an input. Ideal for complex, multi-step transformations (e.g., "Decode Base64, then Gunzip, then prettify JSON").
*   **Atomic Operations**: 463 individual tools for specific tasks, dynamically generated from the CyberChef configuration.
    *   `cyberchef_to_base64` / `cyberchef_from_base64`
    *   `cyberchef_aes_decrypt`
    *   `cyberchef_sha2`
    *   `cyberchef_yara_rules`
    *   ...and hundreds more.
*   **`cyberchef_search`**: A utility tool to help the AI discover available operations and their descriptions.

### Technical Highlights
*   **Dockerized**: Runs as a lightweight, self-contained Docker container based on Alpine Linux with Node.js 22 (~270MB compressed).
*   **Stdio Transport**: Communicates via standard input/output, making it easy to integrate with CLI-based MCP clients.
*   **Schema Validation**: All inputs are validated against schemas derived from CyberChef's internal type system using `zod`.
*   **Modern Node.js**: Fully compatible with Node.js v22+ with automated compatibility patches.
*   **Performance Optimized** (v1.4.0): LRU cache for operation results (100MB default), automatic streaming for large inputs (10MB+ threshold), configurable resource limits (100MB max input, 30s timeout), memory monitoring, and comprehensive benchmark suite. See [Performance Tuning Guide](docs/performance-tuning.md) for configuration options.
*   **Upstream Sync Automation** (v1.3.0): Automated monitoring of upstream CyberChef releases every 6 hours, one-click synchronization workflow, comprehensive validation test suite with 465 tool tests, and emergency rollback mechanism.
*   **Security Hardened** (v1.2.0+): Non-root container execution (UID 1001), automated Trivy vulnerability scanning, SBOM generation, read-only filesystem support, OWASP 2024-2025 Argon2 hardening, and nginx:alpine-slim optimization. **Latest improvements**: Fixed 11 of 12 code scanning vulnerabilities including critical cryptographic randomness weakness and 7 ReDoS vulnerabilities. New SafeRegex module provides centralized validation for all user-controlled regex patterns. See [Security Policy](SECURITY.md) and [Security Fixes Report](SECURITY_FIX_REPORT.md) for details.
*   **Production Ready**: Comprehensive CI/CD with CodeQL v4, automated testing, and container image publishing to GHCR.

## Quick Start

### Prerequisites
*   **Docker** installed and running.

### Installation Options

**Option 1: Pull from GitHub Container Registry (Online, Recommended)**
```bash
docker pull ghcr.io/doublegate/cyberchef-mcp_v1:latest
docker tag ghcr.io/doublegate/cyberchef-mcp_v1:latest cyberchef-mcp
docker run -i --rm cyberchef-mcp
```

**Option 2: Download Pre-built Image (Offline Installation)**

For environments without direct GHCR access, download the pre-built Docker image tarball from the [latest release](https://github.com/doublegate/CyberChef-MCP/releases/latest):

1.  **Download the tarball** (approximately 270MB compressed):
    ```bash
    # Download from GitHub Releases
    wget https://github.com/doublegate/CyberChef-MCP/releases/download/v1.4.2/cyberchef-mcp-v1.4.2-docker-image.tar.gz
    ```

2.  **Load the image into Docker:**
    ```bash
    docker load < cyberchef-mcp-v1.4.2-docker-image.tar.gz
    ```

3.  **Tag for easier usage:**
    ```bash
    docker tag ghcr.io/doublegate/cyberchef-mcp_v1:v1.4.2 cyberchef-mcp
    ```

4.  **Run the server:**
    ```bash
    docker run -i --rm cyberchef-mcp
    ```

**Option 3: Build from Source**
1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/doublegate/CyberChef-MCP.git
    cd CyberChef-MCP
    ```

2.  **Build the Docker Image:**
    ```bash
    docker build -f Dockerfile.mcp -t cyberchef-mcp .
    ```

3.  **Run the Server (Interactive Mode):**
    This command starts the server and listens on stdin. This is what your MCP client will run.
    ```bash
    docker run -i --rm cyberchef-mcp
    ```

## Client Configuration

### Cursor AI
1.  Go to **Settings** > **Features** > **MCP**.
2.  Add a new server:
    *   **Name:** `CyberChef`
    *   **Type:** `command`
    *   **Command:** `docker`
    *   **Args:** `run -i --rm cyberchef-mcp`

### Claude Code (CLI)
Add to your configuration file (typically `~/.config/claude/config.json`):
```json
{
  "mcpServers": {
    "cyberchef": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "cyberchef-mcp"]
    }
  }
}
```

### Claude Desktop
Add to your Claude Desktop configuration file:
*   **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
*   **Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cyberchef": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "cyberchef-mcp"]
    }
  }
}
```

After adding the configuration, restart Claude Desktop. The CyberChef tools will appear in the available tools panel.

## Performance & Configuration

Version 1.4.0 introduces comprehensive performance optimizations and configurable resource limits. All features can be tuned via environment variables for your deployment needs.

### Performance Features

**LRU Cache for Operation Results**
- Automatically caches operation results to eliminate redundant computation
- Configurable cache size (100MB default) and item count (1000 default)
- Cache keys based on operation + input + arguments (SHA256 hash)

**Automatic Streaming for Large Inputs**
- Inputs exceeding 10MB automatically use chunked processing
- Supports encoding, compression, and hashing operations
- Memory-efficient handling of 100MB+ files
- Transparent fallback for non-streaming operations

**Resource Limits**
- Maximum input size validation (100MB default)
- Operation timeout enforcement (30 seconds default)
- Prevents out-of-memory crashes and runaway operations

**Memory Monitoring**
- Periodic memory usage logging to stderr
- Heap and RSS tracking for troubleshooting

### Configuration Options

All performance features are configurable via environment variables:

```bash
# Maximum input size (bytes)
CYBERCHEF_MAX_INPUT_SIZE=104857600       # 100MB default

# Operation timeout (milliseconds)
CYBERCHEF_OPERATION_TIMEOUT=30000        # 30s default

# Streaming threshold (bytes)
CYBERCHEF_STREAMING_THRESHOLD=10485760   # 10MB default

# Enable/disable streaming
CYBERCHEF_ENABLE_STREAMING=true          # Enabled by default

# Enable/disable worker threads (infrastructure only in v1.4.0)
CYBERCHEF_ENABLE_WORKERS=true            # Enabled by default

# Cache maximum size (bytes)
CYBERCHEF_CACHE_MAX_SIZE=104857600       # 100MB default

# Cache maximum items
CYBERCHEF_CACHE_MAX_ITEMS=1000           # 1000 items default
```

### Example Configurations

**High-Throughput Server (Large Files)**
```bash
docker run -i --rm --memory=4g \
  -e CYBERCHEF_MAX_INPUT_SIZE=524288000 \
  -e CYBERCHEF_STREAMING_THRESHOLD=52428800 \
  -e CYBERCHEF_CACHE_MAX_SIZE=524288000 \
  -e CYBERCHEF_OPERATION_TIMEOUT=120000 \
  ghcr.io/doublegate/cyberchef-mcp_v1:latest
```

**Low-Memory Environment**
```bash
docker run -i --rm --memory=512m \
  -e CYBERCHEF_MAX_INPUT_SIZE=10485760 \
  -e CYBERCHEF_STREAMING_THRESHOLD=5242880 \
  -e CYBERCHEF_CACHE_MAX_SIZE=10485760 \
  -e CYBERCHEF_CACHE_MAX_ITEMS=100 \
  ghcr.io/doublegate/cyberchef-mcp_v1:latest
```

**Claude Desktop with Custom Limits**
```json
{
  "mcpServers": {
    "cyberchef": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "CYBERCHEF_MAX_INPUT_SIZE=209715200",
        "-e", "CYBERCHEF_CACHE_MAX_SIZE=209715200",
        "ghcr.io/doublegate/cyberchef-mcp_v1:latest"
      ]
    }
  }
}
```

For detailed performance tuning guidance, see the [Performance Tuning Guide](docs/performance-tuning.md).

### Performance Benchmarks

Run the benchmark suite to measure performance on your hardware:

```bash
# Install dependencies
npm install

# Generate required configuration
npx grunt configTests

# Run benchmarks
npm run benchmark
```

The benchmark suite tests 20+ operations across multiple input sizes (1KB, 10KB, 100KB) in categories including:
- Encoding operations (Base64, Hex)
- Hashing operations (MD5, SHA256, SHA512)
- Compression operations (Gzip)
- Cryptographic operations (AES)
- Text operations (Regex)
- Analysis operations (Entropy, Frequency Distribution)

## Security

This project implements comprehensive security hardening with continuous improvements:

### Latest Security Enhancements (Post-v1.4.0)
*   **11 of 12 Code Scanning Vulnerabilities Fixed**: Comprehensive security hardening completed
    *   **CRITICAL**: Fixed insecure cryptographic randomness in GOST library - replaced `Math.random()` with `crypto.randomBytes()`
    *   **HIGH**: Eliminated 7 ReDoS (Regular Expression Denial of Service) vulnerabilities across 6 operations
    *   **NEW MODULE**: SafeRegex.mjs provides centralized validation for all user-controlled regex patterns
        *   Pattern length limits (10,000 characters)
        *   ReDoS pattern detection (nested quantifiers, overlapping alternations)
        *   Timeout-based validation (100ms) to detect catastrophic backtracking
        *   XRegExp and standard RegExp support
*   **All 1,933 Tests Passing**: Security fixes validated with comprehensive test suite
*   See [Security Fixes Report](SECURITY_FIX_REPORT.md) for complete details

### Container Security (v1.2.0+)
*   **Non-Root Execution**: Container runs as dedicated `cyberchef` user (UID 1001)
*   **Read-Only Filesystem**: Supports `--read-only` flag for immutable deployments
*   **Minimal Attack Surface**: Development files removed from production image
*   **Health Checks**: Built-in container health monitoring

### Cryptographic Hardening (v1.2.5)
*   **Argon2 OWASP Compliance**: Default parameters follow OWASP 2024-2025 recommendations
    *   Type: Argon2id (hybrid side-channel + GPU resistance)
    *   Memory: 19 MiB (OWASP minimum)
    *   Iterations: 2 (OWASP recommended for 19 MiB)
*   **Secure Random Number Generation**: All cryptographic operations use `crypto.randomBytes()` or `crypto.getRandomValues()`
*   **CVE-2025-64756 Fixed**: Updated npm to resolve glob command injection vulnerability

### Automated Security Scanning
*   **Trivy Integration**: Container and dependency scanning on every build
*   **CodeQL Analysis**: Continuous code scanning for security vulnerabilities
*   **SBOM Generation**: CycloneDX Software Bill of Materials with each release
*   **Weekly Scans**: Scheduled scans catch newly discovered vulnerabilities
*   **GitHub Security Tab**: All findings automatically uploaded

### Secure Deployment
```bash
# Recommended: Run with maximum security options
docker run -i --rm \
  --read-only \
  --tmpfs /tmp:size=100M \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  cyberchef-mcp
```

For detailed information, see:
*   [Security Policy](SECURITY.md) - Vulnerability reporting and security policies
*   [Security Audit](docs/security/audit.md) - Comprehensive security assessment
*   [Security Fixes Report](SECURITY_FIX_REPORT.md) - Latest vulnerability fixes
*   [Security Fixes Summary](SECURITY_FIXES_SUMMARY.md) - Quick reference guide

## Project Roadmap

CyberChef MCP Server has a comprehensive development roadmap spanning **19 releases** across **6 phases** through August 2027.

| Phase | Releases | Timeline | Focus | Status |
|-------|----------|----------|-------|--------|
| **Phase 1: Foundation** | v1.2.0 - v1.4.0 | Q4 2025 - Q1 2026 | Security hardening, upstream sync, performance | **v1.4.0 Released** |
| **Phase 2: Enhancement** | v1.5.0 - v1.7.0 | Q2 2026 | Streaming, recipe management, batch processing | Planned |
| **Phase 3: Maturity** | v1.8.0 - v2.0.0 | Q3 2026 | API stabilization, breaking changes, v2.0.0 | Planned |
| **Phase 4: Expansion** | v2.1.0 - v2.3.0 | Q4 2026 | Multi-modal, advanced transports, plugins | Planned |
| **Phase 5: Enterprise** | v2.4.0 - v2.6.0 | Q1 2027 | OAuth 2.1, RBAC, Kubernetes, observability | Planned |
| **Phase 6: Evolution** | v2.7.0 - v3.0.0 | Q2-Q3 2027 | Edge deployment, AI-native features, v3.0.0 | Planned |

See the [**Full Roadmap**](docs/ROADMAP.md) for detailed release plans and timelines.

## Documentation

Detailed documentation can be found in the [`docs/`](docs/) directory:

### User Documentation
*   [**User Guide**](docs/user_guide.md): Detailed installation and client configuration
*   [**Commands Reference**](docs/commands.md): List of all available MCP tools and operations

### Technical Documentation
*   [**Architecture**](docs/architecture.md): Technical design of the MCP server
*   [**Technical Implementation**](docs/technical_implementation.md): Implementation details
*   [**Project Summary**](docs/project_summary.md): Project overview

### Project Planning
*   [**Product Roadmap**](docs/ROADMAP.md): Comprehensive v1.1.0 → v3.0.0 roadmap with timeline
*   [**Release Plans**](docs/planning/): Individual release specifications (v1.2.0 - v3.0.0)
*   [**Phase Documents**](docs/planning/): Sprint breakdowns for each development phase
*   [**Tasks**](docs/planning/tasks.md): 500+ implementation tasks organized by release

### Strategy Documents
*   [**Upstream Sync Strategy**](docs/planning/UPSTREAM-SYNC-STRATEGY.md): Automated CyberChef update monitoring
*   [**Security Hardening Plan**](docs/planning/SECURITY-HARDENING-PLAN.md): Docker DHI, non-root, SBOM generation
*   [**Multi-Modal Strategy**](docs/planning/MULTI-MODAL-STRATEGY.md): Image/binary/audio handling via MCP
*   [**Plugin Architecture**](docs/planning/PLUGIN-ARCHITECTURE-DESIGN.md): Custom operations and sandboxed execution
*   [**Enterprise Features**](docs/planning/ENTERPRISE-FEATURES-PLAN.md): OAuth 2.1, RBAC, audit logging

### Security & Releases
*   [**Security Policy**](SECURITY.md): Security policy and vulnerability reporting
*   [**Security Audit**](docs/security/audit.md): Comprehensive security assessment
*   [**Security Fixes Report**](SECURITY_FIX_REPORT.md): Detailed report of 11 vulnerability fixes (ReDoS and cryptographic weaknesses)
*   [**Security Fixes Summary**](SECURITY_FIXES_SUMMARY.md): Quick reference for recent security improvements
*   [**Release Notes v1.4.2**](docs/releases/v1.4.2.md): CI/CD improvements and zero-warning workflows
*   [**Release Notes v1.4.1**](docs/releases/v1.4.1.md): Security patch - 11 Code Scanning vulnerabilities fixed
*   [**Release Notes v1.4.0**](docs/releases/v1.4.0.md): Performance optimization with caching, streaming, and resource limits
*   [**Performance Tuning Guide**](docs/performance-tuning.md): Configuration guide for optimizing performance
*   [**Release Notes v1.3.0**](docs/releases/v1.3.0.md): Upstream sync automation with comprehensive testing
*   [**Release Notes v1.2.6**](docs/releases/v1.2.6.md): nginx:alpine-slim optimization for web app
*   [**Release Notes v1.2.5**](docs/releases/v1.2.5.md): Security patch with OWASP Argon2 hardening
*   [**Release Notes v1.2.0**](docs/releases/v1.2.0.md): Security hardening release
*   [**Release Notes v1.1.0**](docs/releases/v1.1.0.md): Security fixes and Node.js 22 compatibility
*   [**Release Notes v1.0.0**](docs/releases/v1.0.0.md): Initial MCP server release

## Development

### Local Setup
If you want to modify the server code without Docker:

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Generate Config:** (Required to build the internal operation lists)
    ```bash
    npx grunt configTests
    ```
3.  **Run Server:**
    ```bash
    npm run mcp
    ```

### CI/CD
This project uses GitHub Actions to ensure stability and security:

**Core Development Workflows:**
*   **Core CI** ([`core-ci.yml`](.github/workflows/core-ci.yml)): Tests the underlying CyberChef logic and configuration generation on Node.js v22
*   **Docker Build** ([`mcp-docker-build.yml`](.github/workflows/mcp-docker-build.yml)): Builds, verifies, and security scans the `cyberchef-mcp` Docker image
*   **Pull Request Checks** ([`pull_requests.yml`](.github/workflows/pull_requests.yml)): Automated testing and validation for pull requests
*   **Performance Benchmarks** ([`performance-benchmarks.yml`](.github/workflows/performance-benchmarks.yml)): Automated performance regression testing on code changes (v1.4.0+)

**Security & Release Workflows:**
*   **Security Scan** ([`security-scan.yml`](.github/workflows/security-scan.yml)): Trivy vulnerability scanning, SBOM generation, weekly scheduled scans
*   **CodeQL Analysis** ([`codeql.yml`](.github/workflows/codeql.yml)): Automated security scanning for code vulnerabilities (CodeQL v4)
*   **Release** ([`mcp-release.yml`](.github/workflows/mcp-release.yml)): Publishes Docker image to GHCR with SBOM attachment on version tags (`v*`), automatically creates GitHub releases

**Upstream Sync Automation (v1.3.0):**
*   **Upstream Monitor** ([`upstream-monitor.yml`](.github/workflows/upstream-monitor.yml)): Monitors GCHQ/CyberChef for new releases every 6 hours, creates GitHub issues for review
*   **Upstream Sync** ([`upstream-sync.yml`](.github/workflows/upstream-sync.yml)): Automated synchronization workflow with merge, config regeneration, testing, and PR creation
*   **Rollback** ([`rollback.yml`](.github/workflows/rollback.yml)): Emergency rollback mechanism for reverting problematic upstream merges

All workflows use the latest CodeQL Action v4 for security scanning and SARIF upload.

### Testing
```bash
# Run all tests (requires Node.js 22+)
npm test

# Run MCP validation test suite (465 tool tests with Vitest)
npm run test:mcp

# Run performance benchmarks (v1.4.0+)
npm run benchmark

# Test Node.js consumer compatibility
npm run testnodeconsumer

# Test UI (requires production build first)
npm run build
npm run testui

# Lint code
npm run lint
```

## Contributing

Contributions to the MCP adapter are welcome! We appreciate:

*   **Bug Reports**: Open an issue with detailed steps to reproduce
*   **Feature Requests**: Check [Roadmap](docs/planning/roadmap.md) first, then open an issue
*   **Pull Requests**: See [Tasks](docs/planning/tasks.md) for areas needing work
*   **Documentation**: Improvements to guides and examples are always welcome

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and test thoroughly
4. Commit with conventional commit messages (`feat:`, `fix:`, `docs:`, etc.)
5. Push to your fork and submit a pull request

For contributions to the core CyberChef operations, please credit the original [GCHQ repository](https://github.com/gchq/CyberChef).

## Repository Information

*   **Original CyberChef**: [GCHQ/CyberChef](https://github.com/gchq/CyberChef)
*   **MCP Fork**: [doublegate/CyberChef-MCP](https://github.com/doublegate/CyberChef-MCP)
*   **Container Registry**: [ghcr.io/doublegate/cyberchef-mcp_v1](https://github.com/doublegate/CyberChef-MCP/pkgs/container/cyberchef-mcp_v1)
*   **Issue Tracker**: [GitHub Issues](https://github.com/doublegate/CyberChef-MCP/issues)

## Support

If you find this project useful, consider supporting its development:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=flat&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/doublegate)
[![Thanks.dev](https://img.shields.io/badge/Thanks.dev-Support-blue)](https://thanks.dev/doublegate)

## Licensing

CyberChef is released under the [Apache 2.0 Licence](https://www.apache.org/licenses/LICENSE-2.0) and is covered by [Crown Copyright](https://www.nationalarchives.gov.uk/information-management/re-using-public-sector-information/uk-government-licensing-framework/crown-copyright/).

This MCP server adapter maintains the same Apache 2.0 license.
