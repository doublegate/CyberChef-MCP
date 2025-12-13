# CyberChef MCP Server

[![](https://img.shields.io/badge/MCP-Enabled-blue)](https://modelcontextprotocol.io/)
[![](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Build and Test MCP Server](https://github.com/parobek/CyberChef/actions/workflows/mcp-docker-build.yml/badge.svg)](https://github.com/parobek/CyberChef/actions/workflows/mcp-docker-build.yml)

This project provides a **Model Context Protocol (MCP)** server interface for **CyberChef**, the "Cyber Swiss Army Knife".

By running this server, you enable AI assistants (like Claude, Cursor AI, and others) to natively utilize CyberChef's extensive library of 300+ data manipulation operations—including encryption, encoding, compression, and forensic analysis—as executable tools.

## Project Context

**CyberChef** is a simple, intuitive web app for carrying out all manner of "cyber" operations within a web browser. It was originally conceived and built by [GCHQ](https://github.com/gchq/CyberChef).

This fork wraps the core CyberChef Node.js API into an MCP server, bridging the gap between natural language AI intent and deterministic data processing.

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
*   **Dockerized**: Runs as a lightweight, self-contained Docker container based on Alpine Linux.
*   **Stdio Transport**: Communicates via standard input/output, making it easy to integrate with CLI-based MCP clients.
*   **Schema Validation**: All inputs are validated against schemas derived from CyberChef's internal type system using `zod`.
*   **Modern Node.js**: Patched and configured to run on Node.js v22+.

## Quick Start

### Prerequisites
*   **Docker** installed and running.

### Installation & Usage

1.  **Build the Docker Image:**
    ```bash
    docker build -f Dockerfile.mcp -t cyberchef-mcp .
    ```

2.  **Run the Server (Interactive Mode):**
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
Add to your configuration file:
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

## Documentation

Detailed documentation can be found in the [`docs/`](docs/) directory:
*   [**User Guide**](docs/user_guide.md): Detailed installation and client configuration.
*   [**Commands Reference**](docs/commands.md): List of all available MCP tools and operations.
*   [**Architecture**](docs/architecture.md): Technical design of the MCP server.

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
This project uses GitHub Actions to ensure stability:
*   **Core CI:** Tests the underlying CyberChef logic and configuration generation on Node.js v22.
*   **Docker Build:** Builds and verifies the `cyberchef-mcp` Docker image on every push.
*   **Release:** Automatically publishes the Docker image to GHCR on version tags (`v*`).

## Contributing

Contributions to the MCP adapter are welcome! Please refer to the [`docs/planning/`](docs/planning/) directory for planned features and tasks.

For contributions to the core CyberChef operations, please credit the original [GCHQ repository](https://github.com/gchq/CyberChef).

## Licensing

CyberChef is released under the [Apache 2.0 Licence](https://www.apache.org/licenses/LICENSE-2.0) and is covered by [Crown Copyright](https://www.nationalarchives.gov.uk/information-management/re-using-public-sector-information/uk-government-licensing-framework/crown-copyright/).
