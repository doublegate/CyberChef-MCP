<!-- Managed by Master-Claude. Universal rules come from the imported/inlined core.
     Edit only inside the MC-PROJECT block; mc-sync overwrites everything else. -->
<!-- mc-core: 0.2.0 | mode=import | lang=typescript -->
# AGENTS.md — CyberChef

@/home/parobek/.claude/master-core/AGENTS.base.md
@/home/parobek/.claude/master-core/lang/typescript.md
@/home/parobek/.claude/master-core/modules/10-commits-and-versioning.md
@/home/parobek/.claude/master-core/modules/20-testing-and-accuracy.md
@/home/parobek/.claude/master-core/modules/30-quality-gates.md
@/home/parobek/.claude/master-core/modules/40-docs-and-adrs.md
@/home/parobek/.claude/master-core/modules/50-architecture-patterns.md
@/home/parobek/.claude/master-core/modules/60-security.md
@/home/parobek/.claude/master-core/modules/70-release-ceremony.md
@/home/parobek/.claude/master-core/modules/80-phase-sprint-workflow.md
@/home/parobek/.claude/master-core/modules/90-multi-language-integration.md
@/home/parobek/.claude/master-core/modules/91-agent-system-architecture.md
@/home/parobek/.claude/master-core/modules/95-named-pattern-library.md

<<< MC-PROJECT-START >>>
## Project: CyberChef

**CyberChef MCP Server** (v2.1.0) - Fork of GCHQ CyberChef wrapping the Node.js API into an MCP
server. Exposes 504 operations (encryption, encoding, compression, forensics) as AI assistant tools.

| Metric | Value |
|--------|-------|
| MCP Version | 2.1.0 (single source: `package.json` `mcpVersion`, read by `src/node/lib/config.mjs`) |
| Upstream base | CyberChef **v11.4.0** |
| Operations / tools | 504 operations. `tools/list` is an **index** by default (~24 tools, ~2.5k tokens); `CYBERCHEF_TOOL_SURFACE=curated\|all` for ~100 or all 524. All 504 reachable via `cyberchef_bake` + the three navigation tools. |
| Licence | **GPL-3.0-or-later** (from v2.0.0; v1.9.x and earlier are Apache-2.0) |
| Node | `>=24 <27`; image runs Node 26.8.1, digest-pinned |
| Tests | 798 MCP (25 files) + 241 Node-API + 2,289 operations + 8 CI-executed examples |
| Coverage | 78.8% lines / 75.1% branches / 90.5% functions overall; `src/node/lib/**` at 95.2% lines |
| Open security alerts | **0** Dependabot, **0** code-scanning |

**Focus:** MCP server (`src/node/mcp-server.mjs` + `src/node/lib/**`), not the web app.

**Test through a real MCP client, not hand-rolled JSON-RPC.** This is the v2.1.0 lesson and it is
the expensive one. Every test before v2.1.0 spoke raw JSON-RPC or called handlers directly, and
raw JSON-RPC does no schema validation -- so three releases shipped in which **every one of the 524
tools carried an empty `inputSchema`** (`zod-to-json-schema@3` fails silently against Zod 4) and
the suite was green throughout. The official SDK client rejects that response outright. The same
blind spot hid logs going to stdout, 31 symmetric ciphers that could never be called, and a tool
that killed the process. `tests/mcp/stdio-client-contract.test.mjs` exists to close it; do not add
a protocol-level feature without a test that goes through the client.

**Examples are executable and CI runs them.** `examples/` holds eight self-asserting scripts and
`tests/mcp/examples.test.mjs` runs each one. Documentation that is not executed drifts -- see
`docs/security/2026-08-30-saferegex-reverted-by-upstream-sync.md` for what that cost last time.

**Fork hygiene — the rule that matters most here.** The sync mirrors `src/core/**` **except the
three generated paths** (`config/modules/`, `config/OperationConfig.json`, `operations/index.mjs`,
which `npx grunt configTests` produces and `.gitignore` excludes), plus six upstream-owned
`src/node/*.mjs` files: `api.mjs`, `apiUtils.mjs`, `File.mjs`, `NodeDish.mjs`, `NodeRecipe.mjs`,
`repl.mjs`. **Never hand-edit any of them.** To change one, either adopt upstream's version (if
upstream already has the change) or add a `patches/fork/*.patch`, which the sync re-applies and
which **fails the sync if it stops applying**. A ReDoS mitigation was once
hand-edited into `src/core/operations/` and silently reverted by a sync, staying gone for four
releases while three documents claimed it was active:
`docs/security/2026-08-30-saferegex-reverted-by-upstream-sync.md`.

**The `cyberchef_` prefix is permanent.** DEP001/DEP007/DEP008 announced its removal in v1.8.0 and
were **withdrawn** in v2.0.0 (2.6% payload saving against 19 colliding tool names and every
integration broken). Do not strip it, and do not reintroduce the rename in docs or code.

---

### Overlay overrides (this repo is JS/ESM, not TypeScript)

The shared `lang/typescript.md` overlay assumes pnpm + tsc + prettier. Here:

- Package manager is **npm** (`package-lock.json`); never run pnpm or bun.
- No `tsconfig.json` and no `typescript` dependency - **there is no `tsc --noEmit` gate**.
- No prettier - formatting is enforced by ESLint (`eslint.config.mjs`) via `npm run lint`.
- Two distinct suites: core tests are custom Node runners (`npm test`), MCP tests are
  Vitest (`npm run test:mcp`, `vitest.config.mjs`). They are not interchangeable.

### Essential Commands

Setup (required before running locally - both generated files below are uncommitted):

```bash
npm install
npx grunt configTests    # Generates OperationConfig.json and index.mjs - REQUIRED
```

Run the MCP server:

```bash
# Docker (preferred)
docker build -f Dockerfile.mcp -t cyberchef-mcp .
docker run -i --rm cyberchef-mcp    # -i flag is CRITICAL

# Local Node.js
npm run mcp
```

Development and testing:

```bash
npm start                # Dev server with hot reload (grunt dev)
npm run build            # Production build (grunt prod)
npm run lint             # ESLint via grunt - zero errors required
npm test                 # Core unit tests (custom Node runners)
npm run test:mcp         # MCP server tests, Vitest (757 tests across 22 files)
npm run test:coverage    # Thresholds: 75% lines/stmts, 90% functions, 70% branches
npm run testnodeconsumer # Test CJS/ESM consumers
```

MCP server manual testing:

```bash
# List tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | docker run -i --rm cyberchef-mcp
# Call tool
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"cyberchef_to_base64","arguments":{"input":"Hello"}}}' | docker run -i --rm cyberchef-mcp
```

### Architecture

```
MCP Client (AI/IDE) <--> CyberChef MCP Server <--> CyberChef Node API <--> CyberChef Core
                         (src/node/mcp-server.mjs)  (src/node/index.mjs)    (src/core/)
```

| File | Purpose |
|------|---------|
| `src/node/mcp-server.mjs` | MCP server entry point - protocol, tool registration, call dispatch |
| `src/node/index.mjs` | Node.js API bridge (**generated** by Grunt) |
| `src/core/config/OperationConfig.json` | Operation metadata (**generated** by Grunt) |
| `src/core/operations/*.mjs` | Individual operation implementations |
| `Dockerfile.mcp` | MCP server container (Chainguard distroless) |
| `Gruntfile.js` | Build orchestration for config generation |

Generated files, **not committed** - regenerate with `npx grunt configTests`:
`src/core/config/OperationConfig.json` and `src/node/index.mjs`.

### MCP Tools Structure

1. **`cyberchef_bake`** - Meta-tool for complex recipe chains
2. **`cyberchef_search`** - Operation discovery via the `help()` function
3. **`cyberchef_<op_name>`** - 504 dynamically generated tools from OperationConfig
4. **`cyberchef_worker_stats`** - Worker thread pool monitoring (v1.9.0)
5. **`cyberchef_deprecation_stats`** / **`cyberchef_migration_preview`** - v2.0.0 migration tools (v1.8.0)
6. **Recipe tools** - `cyberchef_recipe_create/get/list/update/delete/execute/export/import/validate/test` (v1.6.0)
7. **`cyberchef_batch`** / **`cyberchef_telemetry_export`** / **`cyberchef_cache_stats`** / **`cyberchef_cache_clear`** / **`cyberchef_quota_info`** (v1.7.0)

Tool naming: operations are sanitized to snake_case with a `cyberchef_` prefix
(e.g. "AES Decrypt" -> `cyberchef_aes_decrypt`).

### Node compatibility patches

`Dockerfile.mcp` and the CI workflows run two in-place `sed` substitutions for the deprecated
`SlowBuffer`. Run them locally too if `npm test` fails with `SlowBuffer is not defined`:

- `node_modules/avsc/lib/types.js`: `new SlowBuffer` -> `Buffer.alloc` — **still needed**
  (`avsc@5.7.9` contains 2 references)
- `node_modules/buffer-equal-constant-time/index.js`: `SlowBuffer` -> `Buffer` — **now a no-op**
  (`buffer-equal-constant-time@1.0.1` contains none). Left in place as a harmless self-healing
  guard rather than removed from five files.

### CI/CD

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

Release cut (module 70 has the ceremony; this is the repo-specific mechanic):

```bash
git tag -a v1.x.x -F docs/releases/v1.x.x.md && git push origin v1.x.x
# Workflow publishes to ghcr.io/doublegate/cyberchef-mcp_v1
```

### Code Conventions

- **JSON imports:** use `import ... with {type: "json"}` (not `assert`)
- **Tool naming:** `cyberchef_` prefix + snake_case
- **Indentation:** 4 spaces (upstream CyberChef style, not 2)
- **Identifiers:** CamelCase (objects/namespaces), camelCase (functions/variables)
- **Dependencies:** prefer vanilla JS; avoid unnecessary frameworks

### Common Issues

| Issue | Solution |
|-------|----------|
| `SlowBuffer is not defined` | Apply the `avsc` substitution above |
| `ERR_MODULE_NOT_FOUND` for Config | Run `npx grunt configTests` |
| Container exits instantly | Add the `-i` flag to `docker run` |

### Documentation Map

| Category | Key Files |
|----------|-----------|
| Architecture | `docs/architecture/architecture.md`, `technical_implementation.md`, `performance-tuning.md` |
| Guides | `docs/guides/commands.md` (MCP tools), `user_guide.md` (installation) |
| Planning | `docs/planning/ROADMAP.md`, `docs/planning/phases/overview.md` |
| Security | `docs/security/audit.md` |
| Releases | `docs/releases/v2.0.0.md` (latest), `v1.9.0.md`, `v1.8.0.md` ... `v1.0.0.md` |
| Internal | `docs/internal/tech-debt-analysis-v1.6.1.md` (project health: 8.9/10) |

<<< MC-PROJECT-END >>>
