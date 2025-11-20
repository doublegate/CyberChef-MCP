# CyberChef MCP Server Context

## Project Overview
This repository hosts the **Model Context Protocol (MCP) Server** adaptation of CyberChef. While it contains the full source code for the original CyberChef web application, the primary focus of this fork/configuration is to expose CyberChef's operations as executable tools for AI agents (Cursor, Claude, etc.).

## Key Technologies
-   **Runtime:** Node.js v22+ (Alpine Linux in Docker).
-   **Protocol:** [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).
-   **SDK:** `@modelcontextprotocol/sdk`.
-   **Validation:** `zod` and `zod-to-json-schema` for tool input validation.
-   **Core Logic:** CyberChef (JavaScript/ES Modules).
-   **Build System:** Grunt (legacy/core config generation) + NPM Scripts.

## Architecture
The MCP Server wraps the existing CyberChef Node.js API:

1.  **Entry Point:** `src/node/mcp-server.mjs`
    *   Initializes the MCP Server instance (Stdio transport).
    *   Dynamically loads `OperationConfig.json`.
    *   Registers `cyberchef_bake` (meta-tool) and `cyberchef_<op_name>` (atomic tools).
    *   Handles `callTool` requests by mapping them to `CyberChef.bake()`.
2.  **Core API:** `src/node/index.mjs` & `src/node/api.mjs`
    *   The bridge between the Node.js environment and CyberChef's business logic.
3.  **Configuration:** `src/core/config/OperationConfig.json`
    *   Generated via Grunt. Contains metadata for all operations (args, types, descriptions).

## Operational Workflows

### 1. Prerequisites
Before running the server (locally or in Docker), the CyberChef configuration files **must** be generated. The original source uses Grunt for this.

```bash
# Required to generate src/core/config/OperationConfig.json and src/node/index.mjs
npx grunt configTests
```

### 2. Running the Server
**Local Node.js:**
```bash
npm run mcp
```
*Reads from stdin, writes to stdout.*

**Docker (Recommended):**
```bash
docker build -f Dockerfile.mcp -t cyberchef-mcp .
docker run -i --rm cyberchef-mcp
```
*Note: The `-i` flag is critical to keep stdin open.*

### 3. Development & Maintenance
-   **Adding/Modifying Tools:**
    *   The MCP tools are *dynamically* generated from `OperationConfig.json`.
    *   To change a tool's definition, modify the underlying CyberChef operation in `src/core/operations/` and regenerate config (`npx grunt configTests`).
    *   To modify how tools are mapped (e.g., argument naming, Zod conversion), edit `src/node/mcp-server.mjs`.
-   **Documentation:**
    *   `docs/commands.md` contains the list of available tools.
    *   `src/node/generate_docs.mjs` (if present) is a utility to regenerate this documentation.

## Important File Locations
-   `src/node/mcp-server.mjs`: **Main Server Logic.**
-   `Dockerfile.mcp`: **Production Docker build.** Contains patches for Node.js compatibility.
-   `README.md`: User-facing guide.
-   `docs/`: Technical documentation and user guides.
-   `GEMINI.md`: This context file.

## Code Conventions & Compatibility
-   **Node.js Compatibility:**
    *   Use `import ... with {type: "json"}` for JSON imports (Node v22+ requirement).
    *   **Do not** use `assert {type: "json"}`.
-   **Legacy Patching:**
    *   Dependencies `avsc` and `buffer-equal-constant-time` use the deprecated `SlowBuffer`.
    *   `Dockerfile.mcp` applies `sed` patches to fix this during the build. If running locally on Node v22+, these files in `node_modules` must be patched manually or via a post-install script if `npm install` overwrites them.
-   **Tool Naming:**
    *   MCP Tools must be `snake_case`.
    *   Prefix: `cyberchef_`.
    *   Example: "To Base64" -> `cyberchef_to_base64`.

## Troubleshooting
-   **"SlowBuffer is not defined":** Indicates the `node_modules` haven't been patched. See `Dockerfile.mcp` for the fix.
-   **"Cannot find module .../OperationConfig.json":** Run `npx grunt configTests` to generate the missing config files.
-   **Container exits immediately:** Ensure you are using `docker run -i` (interactive) to keep stdin open.