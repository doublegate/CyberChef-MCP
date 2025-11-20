# Changelog

## MCP Server Conversion

### [v1.0.0-mcp] - 2025-11-20
**Major Architecture Change:**
This repository has been converted into a **Model Context Protocol (MCP) Server**.

-   **New Features:**
    -   Implemented `src/node/mcp-server.mjs` using `@modelcontextprotocol/sdk`.
    -   Exposed `cyberchef_bake` meta-tool for executing arbitrary recipes.
    -   Exposed 300+ individual CyberChef operations as MCP tools (`cyberchef_*`).
    -   Added `cyberchef_search` tool.
    -   Added `Dockerfile.mcp` for containerized deployment.
    -   Added detailed documentation in `docs/`.

-   **Modifications:**
    -   Patched `avsc` and `buffer-equal-constant-time` dependencies for Node.js v22+ compatibility.
    -   Updated ES Module import syntax from `assert` to `with` for JSON files.
    -   Added `mcp` script to `package.json`.

---

## Original CyberChef History

<details>
    <summary>Click to expand version history of the original CyberChef Web App (up to v10.19.4)</summary>

### [10.19.0] - 2024-06-21
- Add support for ECDSA and DSA in 'Parse CSR' [@robinsandhu] | [#1828]
- Fix typos in SIGABA.mjs [@eltociear] | [#1834]

*(Previous history truncated for brevity - refer to the original repository for full history)*
</details>