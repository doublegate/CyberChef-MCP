# CyberChef MCP Server

This project provides a **Model Context Protocol (MCP)** server interface for **CyberChef**, the "Cyber Swiss Army Knife" created by [GCHQ](https://github.com/gchq/CyberChef).

By running this server, you enable AI assistants (like Claude, Cursor AI, and others) to natively utilize CyberChef's extensive library of 300+ data manipulation operations—including encryption, encoding, compression, and forensic analysis—as executable tools.

**Latest Release:** v1.1.0 | [Release Notes](docs/releases/v1.1.0.md) | [Security Audit](docs/security/audit.md)

![CyberChef MCP Banner](images/CyberChef-MCP_Banner-Logo.jpg)

[![MCP Enabled](https://img.shields.io/badge/MCP-Enabled-blue)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Docker Version](https://img.shields.io/github/v/release/doublegate/CyberChef-MCP?logo=docker&label=docker)](https://github.com/doublegate/CyberChef-MCP/releases)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)

## Project Context

**CyberChef** is a simple, intuitive web app for carrying out all manner of "cyber" operations within a web browser. It was originally conceived and built by [GCHQ](https://github.com/gchq/CyberChef).

This fork wraps the core CyberChef Node.js API into an MCP server, bridging the gap between natural language AI intent and deterministic data processing.

![CyberChef MCP Blueprint](images/CyberChef-MCP_Blueprint.jpg)

## Features

### MCP Tools
The server exposes CyberChef operations as MCP tools:

*   **`cyberchef_bake`**: The "Omni-tool". Executes a full CyberChef recipe (a chain of operations) on an input. Ideal for complex, multi-step transformations (e.g., "Decode Base64, then Gunzip, then prettify JSON").
*   **Atomic Operations**: Over 300 individual tools for specific tasks, dynamically generated from the CyberChef configuration.
    *   `cyberchef_to_base64` / `cyberchef_from_base64`
    *   `cyberchef_aes_decrypt`
    *   `cyberchef_sha2`
    *   `cyberchef_yara_rules`
    *   ...and hundreds more.
*   **`cyberchef_search`**: A utility tool to help the AI discover available operations and their descriptions.

### Technical Highlights
*   **Dockerized**: Runs as a lightweight, self-contained Docker container based on Alpine Linux with Node.js 22.
*   **Stdio Transport**: Communicates via standard input/output, making it easy to integrate with CLI-based MCP clients.
*   **Schema Validation**: All inputs are validated against schemas derived from CyberChef's internal type system using `zod`.
*   **Modern Node.js**: Fully compatible with Node.js v22+ with automated compatibility patches.
*   **Security Hardened**: 76% vulnerability reduction (16 of 21 vulnerabilities fixed), enhanced password hashing (10,000 iterations), and comprehensive XSS protection. See [Security Audit](docs/security/audit.md) for details.
*   **Production Ready**: Includes comprehensive CI/CD pipelines, automated testing, and container image publishing to GHCR.

## Quick Start

### Prerequisites
*   **Docker** installed and running.

### Installation Options

**Option 1: Pull from GitHub Container Registry (Online, Recommended)**
```bash
docker pull ghcr.io/doublegate/cyberchef-mcp_v1:latest
docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v1:latest
```

**Option 2: Download Pre-built Image (Offline Installation)**

For environments without direct GHCR access, download the pre-built Docker image tarball from the [latest release](https://github.com/doublegate/CyberChef-MCP/releases/latest):

1.  **Download the tarball** (approximately 270MB compressed):
    ```bash
    # Download from GitHub Releases
    wget https://github.com/doublegate/CyberChef-MCP/releases/download/v1.1.0/cyberchef-mcp-v1.1.0-docker-image.tar.gz
    ```

2.  **Load the image into Docker:**
    ```bash
    docker load < cyberchef-mcp-v1.1.0-docker-image.tar.gz
    ```

3.  **Run the server:**
    ```bash
    docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v1:v1.1.0
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

## Security

This project has undergone comprehensive security hardening:

*   **Vulnerability Reduction**: 76% of identified vulnerabilities fixed (16 out of 21)
*   **Enhanced Password Hashing**: DeriveEVPKey now uses 10,000 iterations (NIST recommended minimum)
*   **XSS Protection**: Comprehensive fixes for cross-site scripting vulnerabilities
*   **String Escaping**: Proper two-step escaping pattern implemented across all operations
*   **Dependency Security**: Automated overrides for vulnerable transitive dependencies

**Current Status:**
*   5 remaining vulnerabilities (all in development dependencies only)
*   2 distinct issues affecting development build tools (not production MCP server)
*   Production MCP server runtime: **Low Risk**

For detailed information, see the [Security Audit Report](docs/security/audit.md).

## Documentation

Detailed documentation can be found in the [`docs/`](docs/) directory:

### User Documentation
*   [**User Guide**](docs/user_guide.md): Detailed installation and client configuration
*   [**Commands Reference**](docs/commands.md): List of all available MCP tools and operations

### Technical Documentation
*   [**Architecture**](docs/architecture.md): Technical design of the MCP server
*   [**Technical Implementation**](docs/technical_implementation.md): Implementation details
*   [**Project Summary**](docs/project_summary.md): Project overview

### Project Management
*   [**Roadmap**](docs/planning/roadmap.md): Future features and planned enhancements
*   [**Tasks**](docs/planning/tasks.md): Specific implementation tasks

### Security & Releases
*   [**Security Audit**](docs/security/audit.md): Comprehensive security assessment
*   [**Release Notes v1.1.0**](docs/releases/v1.1.0.md): Security hardening and Node.js 22 compatibility
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
*   **Core CI** ([`core-ci.yml`](.github/workflows/core-ci.yml)): Tests the underlying CyberChef logic and configuration generation on Node.js v22
*   **Docker Build** ([`mcp-docker-build.yml`](.github/workflows/mcp-docker-build.yml)): Builds and verifies the `cyberchef-mcp` Docker image on every push to master
*   **Release** ([`mcp-release.yml`](.github/workflows/mcp-release.yml)): Automatically publishes the Docker image to GHCR on version tags (`v*`)
*   **CodeQL Analysis** ([`codeql.yml`](.github/workflows/codeql.yml)): Automated security scanning for code vulnerabilities
*   **Pull Request Checks** ([`pull_requests.yml`](.github/workflows/pull_requests.yml)): Automated testing and validation for pull requests

### Testing
```bash
# Run all tests (requires Node.js 22+)
npm test

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

## Licensing

CyberChef is released under the [Apache 2.0 Licence](https://www.apache.org/licenses/LICENSE-2.0) and is covered by [Crown Copyright](https://www.nationalarchives.gov.uk/information-management/re-using-public-sector-information/uk-government-licensing-framework/crown-copyright/).

This MCP server adapter maintains the same Apache 2.0 license.
