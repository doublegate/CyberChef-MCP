# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Project Overview

**CyberChef MCP Server** (v1.9.0) - Fork of GCHQ CyberChef wrapping the Node.js API into an MCP server. Exposes 300+ operations (encryption, encoding, compression, forensics) as AI assistant tools.

| Metric | Value |
|--------|-------|
| MCP Version | 1.9.0 |
| Tests | 689 (100% passing) |
| Coverage | 75.64% lines, 91.5% functions |

**Focus:** MCP server (`src/node/mcp-server.mjs`), not the web app.

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

### Development & Testing
```bash
npm start               # Dev server with hot reload
npm run build           # Production build
npm run lint            # ESLint (zero errors required)
npm test                # Core unit tests
npm run test:mcp        # MCP server tests (689 tests)
npm run test:coverage   # Coverage report (thresholds: 75% lines/stmts, 90% functions, 70% branches)
npm run testnodeconsumer # Test CJS/ESM consumers
```

### MCP Server Manual Testing
```bash
# List tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | docker run -i --rm cyberchef-mcp
# Call tool
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"cyberchef_to_base64","arguments":{"input":"Hello"}}}' | docker run -i --rm cyberchef-mcp
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
| `Dockerfile.mcp` | MCP server container (Chainguard distroless) |
| `Gruntfile.js` | Build orchestration for config generation |

### MCP Tools Structure

1. **`cyberchef_bake`** - Meta-tool for complex recipe chains
2. **`cyberchef_search`** - Operation discovery via `help()` function
3. **`cyberchef_<op_name>`** - 300+ dynamically generated tools from OperationConfig
4. **`cyberchef_worker_stats`** - Worker thread pool monitoring (v1.9.0)
5. **`cyberchef_deprecation_stats`** / **`cyberchef_migration_preview`** - v2.0.0 migration tools (v1.8.0)
6. **Recipe tools** - `cyberchef_recipe_create/get/list/update/delete/execute/export/import/validate/test` (v1.6.0)
7. **`cyberchef_batch`** / **`cyberchef_telemetry_export`** / **`cyberchef_cache_stats`** / **`cyberchef_cache_clear`** / **`cyberchef_quota_info`** (v1.7.0)

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
| `core-ci.yml` | Push to master | Lint + tests + Codecov coverage |
| `mcp-docker-build.yml` | Push to master | Build and verify Docker image |
| `mcp-release.yml` | Tags `v*` | Publish to Docker Hub + GHCR |
| `security-scan.yml` | Push/PR/weekly | Trivy + npm audit |
| `upstream-monitor.yml` | Weekly (Sun noon UTC) | Check for upstream releases |
| `upstream-sync.yml` | Label/manual | Selective upstream sync |
| `rollback.yml` | Manual | Emergency rollback |
| `pull_requests.yml` | PRs | PR validation |
| `performance-benchmarks.yml` | Push | Performance regression testing |
| `codeql.yml` | Push/PR/weekly | CodeQL security scanning |

### Release Process
```bash
git tag -a v1.x.x -F docs/releases/v1.x.x.md && git push origin v1.x.x
# Workflow publishes to ghcr.io/doublegate/cyberchef-mcp_v1
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

| Category | Key Files |
|----------|-----------|
| Architecture | `docs/architecture/architecture.md`, `technical_implementation.md`, `performance-tuning.md` |
| Guides | `docs/guides/commands.md` (MCP tools), `user_guide.md` (installation) |
| Planning | `docs/planning/ROADMAP.md`, `docs/planning/phases/overview.md` |
| Security | `docs/security/audit.md` |
| Releases | `docs/releases/v1.9.0.md` (latest), `v1.8.0.md`, `v1.7.3.md`, `v1.7.2.md`, `v1.7.1.md`, `v1.7.0.md` ... `v1.0.0.md` |
| Internal | `docs/internal/tech-debt-analysis-v1.6.1.md` (project health: 8.9/10) |
