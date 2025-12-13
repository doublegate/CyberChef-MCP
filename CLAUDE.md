# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **CyberChef MCP Server** - a fork of the GCHQ CyberChef project that wraps the core CyberChef Node.js API into a Model Context Protocol (MCP) server. It exposes 300+ data manipulation operations (encryption, encoding, compression, forensic analysis) as executable tools for AI assistants.

**Primary focus:** The MCP server implementation in `src/node/mcp-server.mjs`, not the web app.

## Essential Commands

### Setup (Required Before Running Locally)
```bash
npm install
npx grunt configTests    # Generates OperationConfig.json and index.mjs - REQUIRED
```

### Run MCP Server
```bash
# Docker (preferred)
docker build -f Dockerfile.mcp -t cyberchef-mcp .
docker run -i --rm cyberchef-mcp    # -i flag is CRITICAL

# Local Node.js
npm run mcp
```

### Development
```bash
npm start               # Dev server with hot reload (grunt dev)
npm run build           # Production build (grunt prod)
npm run lint            # ESLint
npm test                # Unit tests (node + operations)
npm run testui          # UI tests (requires prod build first)
npm run testnodeconsumer # Test CJS/ESM consumers
npm run newop           # Scaffold a new operation
```

### Testing MCP Server Manually
```bash
# List tools
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | docker run -i --rm cyberchef-mcp

# Call a tool
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "cyberchef_to_base64", "arguments": {"input": "Hello"}}}' | docker run -i --rm cyberchef-mcp
```

## Architecture

```
MCP Client (AI/IDE) <--> CyberChef MCP Server <--> CyberChef Node API <--> CyberChef Core
                         (src/node/mcp-server.mjs)  (src/node/index.mjs)    (src/core/)
```

### Key Files

| File | Purpose |
|------|---------|
| `src/node/mcp-server.mjs` | MCP server entry point - handles protocol, tool registration, call dispatch |
| `src/node/index.mjs` | Node.js API bridge (**generated** by Grunt) |
| `src/core/config/OperationConfig.json` | Operation metadata (**generated** by Grunt) |
| `src/core/operations/*.mjs` | Individual operation implementations |
| `Dockerfile.mcp` | MCP server container (node:22-alpine) |
| `Gruntfile.js` | Build orchestration for config generation |

### MCP Tools Structure

1. **`cyberchef_bake`** - Meta-tool for complex recipe chains
2. **`cyberchef_search`** - Operation discovery via `help()` function
3. **`cyberchef_<op_name>`** - 300+ dynamically generated tools from OperationConfig

Tool naming: Operations are sanitized to snake_case with `cyberchef_` prefix (e.g., "AES Decrypt" -> `cyberchef_aes_decrypt`).

### Generated Files

These are **not committed** - regenerate with `npx grunt configTests`:
- `src/core/config/OperationConfig.json`
- `src/node/index.mjs`

## Node 22 Compatibility

The Dockerfile applies patches for deprecated `SlowBuffer`:
```bash
sed -i 's/new SlowBuffer/Buffer.alloc/g' node_modules/avsc/lib/types.js
sed -i 's/SlowBuffer/Buffer/g' node_modules/buffer-equal-constant-time/index.js
```

Run these manually if developing locally on Node 22+.

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `core-ci.yml` | Push to master (src/core, src/node) | Lint + unit tests on Node 22 |
| `mcp-docker-build.yml` | Push to master | Build and verify Docker image |
| `mcp-release.yml` | Tags `v*` | Publish to GHCR |

### Release Process
```bash
# Update RELEASE_NOTES.md
git tag -a v1.x.x -F RELEASE_NOTES.md
git push origin v1.x.x
# mcp-release workflow publishes to ghcr.io/doublegate/cyberchef-mcp_v1
```

## Code Conventions

- **JSON imports:** Use `import ... with {type: "json"}` (not `assert`)
- **Tool naming:** `cyberchef_` prefix + snake_case
- **Indentation:** 4 spaces
- **Identifiers:** CamelCase (objects/namespaces), camelCase (functions/variables)
- **Dependencies:** Prefer Vanilla JS; avoid unnecessary frameworks

## Common Issues

| Issue | Solution |
|-------|----------|
| `SlowBuffer is not defined` | Run the `sed` patches from Dockerfile.mcp |
| `ERR_MODULE_NOT_FOUND` for Config | Run `npx grunt configTests` |
| Container exits instantly | Add `-i` flag to `docker run` |

## Documentation

- `docs/architecture.md` - Technical design details
- `docs/commands.md` - Full list of MCP tools and operations
- `docs/user_guide.md` - Installation and client configuration
- `to-dos/roadmap.md` - Project roadmap and planned features
