# CyberChef MCP Server v1.0.0

**Release Date:** 2025-11-20

## 🚀 Major Release: MCP Server Transformation

This release marks the transformation of the CyberChef repository into a fully functional **Model Context Protocol (MCP) Server**. This enables AI assistants (like Claude, Cursor AI, etc.) to natively execute CyberChef's 300+ data manipulation operations as deterministic tools.

### ✨ Key Features

*   **MCP Server Implementation:**
    *   New entry point `src/node/mcp-server.mjs` utilizing `@modelcontextprotocol/sdk`.
    *   Supports `stdio` transport for easy integration with CLI and IDE clients.
*   **Comprehensive Tool Suite:**
    *   **`cyberchef_bake`**: A meta-tool that accepts raw CyberChef recipes, allowing for complex, multi-stage data processing in a single round-trip.
    *   **Atomic Tools**: Dynamically exposes ~300 individual operations (e.g., `cyberchef_aes_decrypt`, `cyberchef_to_base64`, `cyberchef_yara_rules`) with type-safe schemas.
    *   **`cyberchef_search`**: A utility for agents to discover available operations.
*   **Dockerized Runtime:**
    *   New `Dockerfile.mcp` based on `node:22-alpine`.
    *   Optimized build process that handles CyberChef's legacy Grunt configuration generation automatically.
*   **Robust Validation:**
    *   All tool inputs are validated using `zod` schemas generated from CyberChef's internal type definitions.

### 🛠️ Technical Changes

*   **Node.js v22+ Compatibility:**
    *   Refactored all JSON imports to use the modern `import ... with { type: "json" }` syntax.
    *   Patched legacy dependencies (`avsc`, `buffer-equal-constant-time`) to replace deprecated `SlowBuffer` usage with `Buffer.alloc`.
*   **CI/CD Pipelines (GitHub Actions):**
    *   **`mcp-docker-build.yml`**: Automatically builds and verifies the Docker container on every push.
    *   **`mcp-release.yml`**: Automates publishing the container image to GitHub Container Registry (GHCR) on version tags.
    *   **`core-ci.yml`**: Maintains stability of the underlying CyberChef core logic.
*   **Documentation:**
    *   Complete rewrite of `README.md` to focus on MCP usage.
    *   Added `docs/architecture.md`, `docs/user_guide.md`, and `docs/commands.md`.

### 📦 Usage

**Run via Docker:**
```bash
docker run -i --rm cyberchef-mcp:v1.0.0
```

**Configure in Claude/Cursor:**
```json
{
  "mcpServers": {
    "cyberchef": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "cyberchef-mcp:v1.0.0"]
    }
  }
}
```
