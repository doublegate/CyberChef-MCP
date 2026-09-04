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

**CyberChef MCP Server** (v3.8.0) - Fork of GCHQ CyberChef wrapping the Node.js API into an MCP
server. Exposes 504 operations (encryption, encoding, compression, forensics) as AI assistant tools.

| Metric | Value |
|--------|-------|
| MCP Version | 3.8.0 (single source: `package.json` `version`, read by `src/node/lib/config.mjs`). `mcpVersion` was removed in v2.2.0 -- npm requires `version` to be the published version, so the upstream base moved to `cyberchefUpstreamVersion`. |
| Upstream base | CyberChef **v11.4.0** |
| Operations / tools | 504 operations **plus 18 registry tools** that are not operations. `tools/list` is an **index** by default (41 tools, **42,901 bytes**); `CYBERCHEF_TOOL_SURFACE=curated\|all` for 119 (106,147) or all 544 (423,305). Every figure here was 325 bytes low through v3.3.0 -- recorded during its development and never re-measured before the tag, which is this row's own warning happening to this row. The index **doubled in v3.3.0** and that is the cost of twelve new registry tools: a registry tool has no navigation path, so one that is not listed cannot be called at all, and listing must never be stricter than dispatch. Bytes, not tokens: no tokenizer has ever been in this repo and every historical `~N tokens` figure was bytes/4. Re-measure with `npm run measure:surfaces` rather than trusting this row -- every number in `tool-catalog.mjs`'s header had drifted by v3.1.0. All 504 reachable via `cyberchef_bake` + the three navigation tools. Every tool carries annotations + a title. |
| Licence | **GPL-3.0-or-later** (from v2.0.0; v1.9.x and earlier are Apache-2.0) |
| Node | `>=24 <27`; image runs Node 26.8.1, digest-pinned. **CI tests BOTH ends of that range** (24 = the declared floor, 26 = what ships) since v2.8.1 -- before that every workflow tested 24 while the image shipped 26, so the runtime users get was never exercised. Non-test workflows all run 26. |
| Image | **453 MB** (was 643 MB in v2.7.0), and a package count that depends on how you count: **402** by `find -maxdepth 3 -name package.json`, **384** by walking directories that contain one. The row said `432 packages` with no method until v3.2.0, which is the defect -- all three are defensible answers to slightly different questions. `Dockerfile.mcp` runs `npm prune --omit=dev` -- NOT a hardcoded `rm -rf` list, which is what it was through v2.7.0 and could not keep pace with a 1,310-path tree. Any change here must be re-verified by running the FULL operation suite against production-only deps, not a smoke test. **<50 MB is unreachable**: `@jimp` 89 MB + `tesseract.js-core` 44 MB are production deps of real operations. |
| Platforms | `linux/amd64` + `linux/arm64` (v2.8.0). **arm64 throughput is measured on real hardware since v3.8.0** -- `performance-benchmarks.yml` has a `benchmark-arm64` job on `ubuntu-24.04-arm`, reporting into the PR comment. The carried-forward note said this needed hardware for five releases while `mcp-docker-build.yml` was already using that same runner. It reports and does not gate: there is no arm64 noise floor yet, and this project has moved two thresholds set from a first measurement. **Not arm/v7** -- the Chainguard base does not exist for it. arm64 builds under QEMU in 4m46s (vs ~4m30s native amd64) because the pruned tree is pure JS/wasm; that number is why there is no native-runner matrix. `@napi-rs/nice` platform binaries are OPTIONAL deps, so CI asserts the arm64 one resolved -- a wrong resolution still builds a working image and fails later in the worker pool. |
| Offline | `CYBERCHEF_OFFLINE=true` refuses the only 2 networked operations (`HTTP request`, `DNS over HTTPS`) of 504. Guard is on the **recipe**, not the tool name (`cyberchef_bake` carrying `HTTP request` is a network call), applied at all 4 engine entries -- `bakeOnCore`, the direct-operation branch above the worker split, and recipe-manager execute + test. A posture, not a sandbox. |
| Presented output | **44 operations declare a `presentType` differing from `outputType`** -- the presenter targets a browser. `bakeOnCore` asks for the presented form because a few carry their payload ONLY in markup (`Generate QR Code` -> `<img src="data:image/png...">`); for the rest it returned a browser artefact. Since v2.9.0 it prefers `Chef.bake`'s `dish` (the raw, unpresented value, free from the same bake) when the presented value has markup and **no** media. Resolved **before the cache** -- a decision downstream of the cache applies to a miss and not a hit. `JSON Beautify` is why this is a correctness rule and not a formatting one: its keys' quotes were markup structure, so stripping tags returned unparseable JSON. Both directions are pinned by `tests/mcp/presented-output.test.mjs`. |
| Magic | `cyberchef_magic` does NOT go through the operation; `src/node/lib/magic.mjs` calls `speculativeExecution` directly and returns a plain-text report + `structuredContent`. Reason: the operation emitted the web results **table**, with its recipes in the pretty form (`From_Base64('A-Za-z0-9+/=',true,false)`) which **`bake` rejects** -- the most actionable field was the one field a caller could not use. Recipes are now emitted as `[{op,args}]` and a test bakes every one. Language is an **estimate**, never a determination: chi-squared byte frequencies called "Attack at dawn" German at probability 1.35e-8, and accuracy does not rise monotonically with length, so no cutoff fixes it. This path bypasses `resolveArgValue`, so it screens the crib regex itself. |
| Configuration | Two sources: `cyberchef.config.json` and environment variables, with **env > file > default**. 64 settings in 15 sections; the mapping is a committed literal in `src/node/lib/config-file.mjs`, NOT a runtime transform (`http.maxSessions` is `CYBERCHEF_MAX_SESSIONS`, not `CYBERCHEF_HTTP_MAX_SESSIONS`, so a derived name would be set and read by nothing). Applied by populating `process.env` before anything reads it, because settings are resolved at MODULE LOAD in ~30 places across five modules -- hence `bootstrap-config.mjs` and the rule that it is imported FIRST. Fails closed on unknown sections/keys/types. Added in v2.10.0; the migration guide had told users to write this file since v1.8.0 and nothing read it. |
| Tests | 1,640 MCP (68 files) + 241 Node-API + 2,289 operations + 9 CI-executed examples |
| Coverage | Measured in v3.8.0: **96.6% lines / 89.5% branches / 96.5% functions / 95.5% statements** -- quoted in the order vitest's own summary prints, because this row had lines and statements **transposed** (95.7 lines / 96.6 statements) for six releases, which is the exact confusion `vitest.config.mjs` carries a paragraph warning about. Thresholds raised in v2.3.0 from 75/70/90/75 to **95/89/96/96** (branches raised again in v2.7.0) -- that tuple is written lines/branches/functions/statements, matching the config's named keys and NOT the order above. With `src/node/lib/**` held separately at 99/94/100/99. The old numbers were twenty points below actual, so the gate could not fail. `perFile` is off deliberately; see `vitest.config.mjs` for why. Gated on **pull requests** since v2.2.0. |
| Open security alerts | **0** Dependabot, **0** code-scanning (55 dispositioned in v2.1.1) |
| MCP surfaces | tools + **prompts** (6) + **resources** (`recipe://<id>`), all three declared from one `SERVER_CAPABILITIES` -- there are two server construction sites and two capability lists drift. **Tasks and `extensions` are declined**, with the reasons at `SERVER_CAPABILITIES` and a negative test as a tripwire: tasks need state outliving the request and this server deliberately has none. |
| RBAC | Scope filtering on `tools/list` activates only when auth is on. `cyberchef_bake` and `cyberchef_batch` are priced by the **recipe submitted**, not by `openWorldHint` -- 502 of 504 operations need only `cyberchef:read`, so pricing `bake` at `network` made the meta-tool cost more than the operations it runs. `cyberchef_recipe_execute` is deliberately excluded: it carries only an id, and resolving it would move the authorization check after a storage read. Listing must never be stricter than dispatch -- hiding a tool the caller could successfully invoke is misinformation, not caution. |
| Cache hints | `ttlMs`/`cacheScope` (SEP-2549) are filled by the SDK at the 2026-era encode seam from a `cacheHints` constructor option -- the server does NOT build the fields. It defaulted to `{0, private}`, i.e. conformant and telling every client to cache nothing. Values chosen in `src/node/lib/cache-hints.mjs`; `resources/list` and `resources/read` stay at **0** because saved recipes change on any caller's write and **no `listChanged` capability is declared**, so the TTL is a client's only invalidation signal. The option, not a handler-returned field: the legacy codec passes results through unchanged, so a handler-set `ttlMs` would leak onto the **2025 wire**. |
| Conformance | **The official suite is the oracle, not the in-tree tests.** `npm run conformance` runs `@modelcontextprotocol/conformance` (devDependency, pinned exact) against BOTH eras in CI. 141 checks pass; the rest are baselined in `conformance/expected-failures.yaml` **with a written reason each**, and the run fails when a baselined entry starts PASSING as well as when something breaks. v3.0.0 claimed 2026-07-28 conformance on its own tests while a suite covering the exact SEPs it implemented had been published four weeks earlier -- it found a real defect on first run. `--suite all` is required: the scenarios validating v3.0.0 (`caching`, `server-stateless`, `sep-2164-resource-not-found`) sit in the **pending** suite that `active` excludes. |
| Protocol | **2026-07-28 and the 2025 era**, both served from one set of handlers, on stdio and HTTP. SDK v2 (`@modelcontextprotocol/server` + `/node`); `@modelcontextprotocol/sdk` 1.x is a **devDependency only**, kept so the suite can prove a legacy client still connects. The era decision lives in the `serveStdio` entry, NOT in the transport -- a bare `StdioServerTransport` plus `server.connect()` serves 2025 only. |
| Transports | `stdio` (default), `http` (Streamable HTTP, per session), `socket` (Unix domain socket or loopback TCP, one pinned server per connection). No WebSocket: MCP does not define one and no SDK ships one. |
| Observability | `/metrics` (Prometheus, dependency-free, **off** unless `CYBERCHEF_METRICS_ENABLED=true`) + OpenTelemetry spans on the **API only** -- `@opentelemetry/api` is the sole runtime dep added in v2.7.0, and the SDK is deliberately NOT bundled (71 pkgs / 50 MB / +100 ms vs 1 / 2.6 MB / +9 ms). Operator supplies the SDK via `--import`. Tool arguments are never recorded -- the MCP conventions mark them Opt-In and here they ARE the sensitive material. Tool names are resolved against the real dispatch catalogue before becoming a metric label OR a span attribute (`toolDimension` in mcp-server.mjs), with a 1024-name cap behind it as defence in depth -- the name is caller-controlled, and a cap ALONE is exhaustible: fill it first and legitimate tools collapse into `__other__`. `/metrics` is behind `hostAllowed()`, unlike the health probes, which may skip it because they disclose nothing. Dashboard + alerts in `deploy/grafana/`, verified by execution (`promtool`, a live scrape, a real drain) not review. |
| Gates that can fail | **The same-host benchmark gate (v3.6.0) is the one that matters now**: on a pull request, `performance-benchmarks.yml` benchmarks the merge base AND the head in one job on one runner and fails when a task is more than **25%** slower. Both halves were measured before it gated -- a -7.6% worst-case noise floor over four runs on unchanged code, and a detection curve from a deliberate tunable slowdown (10% extra work reads -8.2%, 25% reads -20.2%, 50% reads -32.8%, untouched tasks stay within -3.7%). So it catches a task **>25% slower**, which took ~33% extra work; **a quarter more work does NOT fail** and is printed instead. Stating that is the point -- the two previous thresholds were quoted as if they caught everything. Every gate here was checked against its own claim in v3.2.0. `performance-benchmarks.yml` said in its own PR comment that it *"cannot fail on a regression"* -- it now compares median throughput to `benchmarks/baseline.json` at a **50%** tolerance and fails on a **missing** task too. The number is measured and has moved three times: 25% from a local four-run study; 50% when a developer-machine baseline against a CI runner produced two false failures in three runs; 20% in v3.4.0 once the baseline moved ONTO the runner (three instances, worst spread 6.7%, zero false failures in a 180-comparison simulation) -- and back to **50% the same day**, when four real CI runs swung `To Hex (100KB)` -41.8% and `Regular expression (1KB)` +28.2% ON THE SAME RUN, on tasks the release does not touch (the benchmark imports the generated bridge, which reaches no changed module). Three captures sixteen minutes apart sampled one class of host; the pool is heterogeneous in memory bandwidth. **The number is not the lever** -- a median of runs, or normalising against a calibration task, is. `docs/internal/measurements/v3.4.0-runner-baseline.md` keeps the study AND its disproof. Trivy is back to `CRITICAL,HIGH` in both workflows, its `TODO(PR 7)` precondition ("backlog cleared to zero") having been met eight releases earlier; measured 0/0 before restoring. `helm-chart.yml` lints and renders the chart -- nothing did until v3.2.0, and v3.1.0's `image.digest` branch was verified by hand. |
| Metadata integrity | `tests/mcp/metadata-integrity.test.mjs` screens all 7,408 model-visible strings for TAG-block, control, bidi and zero-width characters, and is a **blocking** step in `upstream-sync.yml` -- the rest of that workflow warns and opens the PR, which is right for a broken test and wrong for text a diff review cannot render. Ordinary non-ASCII (89 strings) is tolerated on purpose. |
| Fork patches | 10 in `patches/fork/` (01, 03-11). A patch that stops applying **fails the sync** -- that is the alarm SafeRegex never had. |
| Vendored | `src/vendor/crypto-api/` (MIT -- the published package cannot be loaded: no `main` file in its tarball, extensionless ESM imports) and `src/vendor/bmfonts/` (Apache-2.0, for `Add Text To Image`). Both are lint- and coverage-exempt and carry a README explaining when to delete them. |
| Registry tools | **18** in `src/node/tools/`, for analyses an operation cannot express. v2.4.0: `xor_key_length`, `cyclic_pattern`, `hash_identify`, `rsa_attack`. v3.3.0 adds twelve: `classical_cipher`, `corpus_diff`, `crib_drag`, `entropy_scan`, `hash_crack`, `hash_statistics`, `jwt_weakness`, `plaintext_check`, `rsa_multi_key`, `substitution_break`, `timestamp_identify`, `vigenere_break`. v3.4.0 adds `ecdsa_recover`; v3.8.0 adds `cert_chain`. Three kinds of gap: a **loop with a decision** inside it (the two cipher solvers), a statistic computed **across inputs** (`corpus_diff`, `rsa_multi_key`, `hash_statistics`, `ecdsa_recover`, `cert_chain`), and a cipher upstream simply lacks (`classical_cipher`) -- which is a registry tool rather than an operation because `src/core/**` is mirrored, so each would be a `patches/fork` patch that has to keep applying forever. `src/node/tools/lib/english.mjs` is the shared language model; its trigram table is **generated** by `scripts/build-english-trigrams.mjs` from this repository's own prose and must stay regenerable byte-for-byte (the generator once read its own base64 output back in as English -- base64 contains `//`). Loading is an explicit import list in `src/node/tools/index.mjs` (**not** `src/node/index.mjs`, which is the generated operation bridge) -- **no loader, no directory scan, no path from configuration.** `node:vm` is not a security boundary and this was measured: a capability passed into a vm context reaches the real `process` via `constructor`. Registration **throws** if a tool would shadow an operation or meta-tool. [ADR 0002](docs/adr/0002-tool-registry-is-not-a-plugin-loader.md). |
| MCP registry | **Listed from v3.5.0**, published by `publish-mcp.yml` on the version tag with GitHub **OIDC** -- no registry credential is stored. v3.4.0 added both ownership proofs (`mcpName` in `package.json`, the `io.modelcontextprotocol.server.name` LABEL on the image) and never used them; the registry returned `count: 0` until this release. The job waits for the npm package the listing points at, because the registry hosts METADATA and a listing published before its artefacts resolves to nothing -- and it reads the registry back afterwards, because `publish` exiting 0 is not evidence. |
| npm | **Published since 2.5.0** as `cyberchef-mcp` -- seven versions, verified with `npm view cyberchef-mcp versions`. Four documents said otherwise until v3.0.0 (this row, `docs/wiki/Installation.md`, `docs/wiki/FAQ.md` and `server.json`'s own comment), because the claim was written when it was true and nothing re-checked it after the first publish succeeded. `server.json` now carries the npm record and is in `check:versions`. |

**Focus:** MCP server (`src/node/mcp-server.mjs` + `src/node/lib/**`), not the web app.

**Test through a real MCP client, not hand-rolled JSON-RPC.** This is the v2.1.0 lesson and it is
the expensive one. Every test before v2.1.0 spoke raw JSON-RPC or called handlers directly, and
raw JSON-RPC does no schema validation -- so three releases shipped in which **every one of the 524
tools carried an empty `inputSchema`** (`zod-to-json-schema@3` fails silently against Zod 4) and
the suite was green throughout. The official SDK client rejects that response outright. The same
blind spot hid logs going to stdout, 31 symmetric ciphers that could never be called, and a tool
that killed the process. `tests/mcp/stdio-client-contract.test.mjs` exists to close it; do not add
a protocol-level feature without a test that goes through the client.

**`src/core` reaches for a bare global `File`, and only the generated bridge provides one.**
Five operations construct `new File(...)` without importing it (`Unzip`, `Untar`, `Tar`,
`Zip`, `Split Colour Channels`). The single `global.File = File` is at `src/node/index.mjs:516`
-- the bridge this server does NOT import eagerly -- so `core-recipe.mjs` installs the shim
itself. Remove that line and `Unzip` silently returns members with the right names and zero
bytes each. It cannot be reproduced in-process: any harness that loaded the bridge puts the
shim back. `tests/mcp/list-file-output.test.mjs` goes through a real client for that reason.

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
npm start                # Run the MCP server (same as `npm run mcp`)
npm run build            # Generate OperationConfig.json + src/node/index.mjs (grunt configTests)
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
| `Dockerfile.mcp` | MCP server container (Chainguard Wolfi base -- **not** shell-free: BusyBox and `npm` are present, `apk`/`wget`/`curl` are not; two documents claimed otherwise until v3.2.0) |
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
| `publish-mcp.yml` | Tags `v*` | Publish `server.json` to the MCP registry (GitHub OIDC) |

**Version bump locations.** `package.json` is the single source at RUNTIME, but a release touches
nine places, and the last three are the ones that get missed:

1. `package.json` `version`
2. `package-lock.json` -- two fields; `npm install --package-lock-only` does both
3. `deploy/helm/cyberchef-mcp/Chart.yaml` `appVersion` **and** the chart's own `version`
4. `deploy/helm/cyberchef-mcp/values.yaml` `image.tag`
5. `deploy/compose/docker-compose.yml` -- the `image:` line **including the package major**
6. **`deploy/compose/docker-compose.yml` -- the PROSE in the digest-pinning comment.** Missed at
   v2.8.0, v2.8.1 **and v2.9.0** -- and at v2.9.0 the `image:` line, `Chart.yaml` `appVersion` and
   `values.yaml` `image.tag` were missed too, so the chart and compose file published with that tag
   deploy **v2.8.1**.
7. README `**Latest Release:**` banner, the offline download URLs, and the AGENTS.md heading + docs
   map + MCP Version row in this file
8. `server.json` -- `version` and `packages[0].version`/`identifier`. Stale at `2.4.1` for six
   releases, because it is not published from CI and nothing was looking at it.
9. **On a MAJOR bump, the image is RENAMED, not re-tagged.** `mcp-release.yml` derives the GHCR
   package from the tag's major (`cyberchef-mcp_v${major}`), so `values.yaml` `image.repository`,
   the compose `image:` line and `server.json` `identifier` all move to `_v<new major>` -- and the
   ~40 live documents that name the image do too. At v3.0.0 the chart paired an un-bumped
   `repository` with a bumped `tag`, which resolves to an image that will never be pushed while
   `check:versions` reported ok. It now asserts the major as well as the version.

`npm run check:server-json` is the sibling gate: it validates `server.json` against the schema it declares (**2025-12-11**; it was 2025-09-29 and already a version behind on the day v3.4.0 shipped it, which is why CI ALSO runs the registry's own `mcp-publisher validate` as an oracle -- the transcribed checker stays the blocking gate because it runs offline, the oracle is the only thing that can contradict its author) and asserts that `mcpName` in `package.json` and the `io.modelcontextprotocol.server.name` LABEL in `Dockerfile.mcp` both equal `server.json`'s `name` -- one identifier in three files, and the registry rejects a publish if any disagrees. It fails when `$schema` names a version whose rules it does not carry, rather than checking the wrong rules quietly.

**Do not rely on this list. Run `npm run check:versions`.** Three consecutive releases got the
version wrong while the note above told the author not to, which is the point at which a checklist
has to become a gate. `scripts/check-version-consistency.mjs` runs in both CI workflows, checks
every location here, and fails when a location matches *nothing* as well as when it disagrees -- a
pattern that has stopped matching is how a consistency check silently stops checking. Its
operation-count half **discovers** the files it checks rather than listing them: v3.7.0 found that a
hand-written four-file list had reported `ok` for two releases while **nine** live occurrences said
505, including a Grafana alert annotation and a Helm memory-request comment. Coverage 7 -> 37.
Use `node scripts/bump-version.mjs <version>` to bump -- it edits version FIELDS, never doing a
blanket string replace, because that silently rewrote `server.json`'s recorded history for two
releases and destroyed 32 historical README links on its first attempt at a fix. The list is
kept as documentation of what is covered, not as the mechanism.

**The Docker Hub namespace is `parobek`, not `doublegate`, and `check:versions` now asserts it.**
The two registries do not share a name: GHCR is `ghcr.io/doublegate/cyberchef-mcp_v<major>` and
Docker Hub is `parobek/cyberchef-mcp`. `mcp-release.yml` builds the second from
`${{ secrets.DOCKERHUB_USERNAME }}`, so the workflow does not say what the image is called and
nothing in the tree connected the two -- assuming they matched produced a confident report that the
Docker Hub publish was broken when it had never failed once. The check derives the expected
namespace from `docs/registry/dockerhub-description.md`, which the release workflow pushes as that
repository's description, and asserts every live document agrees.

`AGENTS.md` is one of the checked documents, because this paragraph is where the namespace is
written down -- putting a name in a file and leaving that file out of the check is the drift the
check exists to stop.

It cannot see the secret, so it establishes that the documents agree with each other and not that
they agree with the repository the workflow pushes to. That half is already covered by
construction: the release workflow pulls `$DOCKERHUB_IMAGE_NAME:latest` back for the tarball
immediately after the push, so a failed or misdirected push fails the job.

Release cut (module 70 has the ceremony; this is the repo-specific mechanic):

```bash
# --cleanup=verbatim is REQUIRED, not optional. Without it `git tag -F` treats every line
# beginning with `#` as a comment and strips it, so a markdown release note loses ALL of its
# headings and the tag message becomes an unstructured wall of text.
#
# This went unnoticed for the whole v2.x line: v2.2.0 lost 12 headings, v2.3.0 lost 12,
# v2.4.0 lost 16, v2.4.1 lost 9. Published tags are immutable, so those stay as they are;
# v2.5.0 is the first tag with its headings intact.
#
# The GitHub Release is unaffected either way -- mcp-release.yml passes the same file through
# `gh release create --notes-file`, which does not strip anything. Only the git tag message
# was ever degraded, which is why nobody saw it.
git tag -a vX.Y.Z --cleanup=verbatim -F docs/releases/vX.Y.Z.md && git push origin vX.Y.Z
# Tag from `master` AFTER the release PR merges: `docker/metadata-action` moves `latest` for any
# non-prerelease semver tag, so tagging a release branch still moves it.
# The GHCR package name carries the MAJOR: v3.x publishes to
# ghcr.io/doublegate/cyberchef-mcp_v3, v2.x to ..._v2, the v1.9.x line to ..._v1.
# A major bump therefore RENAMES the image -- `check:versions` asserts the major in
# docker-compose.yml, values.yaml and server.json for exactly that reason.
```

Verify the tag kept its structure before pushing. Count headings rather than diffing the whole
message: `%(contents)` appends a trailing newline, so a full diff reports a one-byte mismatch on a
perfectly good tag and would be ignored within a release or two.

```bash
[ "$(git tag -l vX.Y.Z --format='%(contents)' | grep -c '^#')" \
  = "$(grep -c '^#' docs/releases/vX.Y.Z.md)" ] && echo "tag kept its headings"
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
| Benchmarks | `benchmarks/README.md` (what each command measures, and why the tolerance is 50% after 20% was tried and disproved) |
| Architecture | `docs/architecture/architecture.md`, `technical_implementation.md`, `performance-tuning.md` |
| Guides | `docs/guides/commands.md` (MCP tools), `user_guide.md` (installation), `edge-deployment.md` (arm64, size, offline, air-gapped), `configuration.md` (all 64 settings; generated from `config-file.mjs` and asserted against it) |
| Planning | `docs/planning/v3/` (**current**: the v3.0.0 plan, `RE-MEASURE.md`, `task-level-scoring.md` -- the design that concludes AGAINST building an eval harness, and one-page charters through v4.0.0), `docs/planning/ROADMAP.md`. `docs/planning/future-releases/` and `phases/` are **historical** -- every file carries a dated banner saying what replaced it. |
| Security | `docs/security/audit.md` |
| Reference | `docs/reference/mcp-2026-07-28-conformance.md`, `agent-tool-design.md`, `mcp-eval-benchmarks.md`, `mcp-threat-model-2026.md` -- written summaries with citations and retrieval dates, not vendored PDFs |
| Releases | `docs/releases/v3.8.0.md` (latest), then `v3.7.0.md`, `v3.6.0.md`, `v3.5.0.md`, `v3.4.0.md`, `v3.3.0.md`, `v3.2.0.md`, `v3.1.0.md`, `v3.0.0.md`, `v2.10.0.md` ... `v2.0.0.md`, `v1.9.0.md` ... `v1.0.0.md` |
| Internal | `docs/internal/tech-debt-analysis-v1.6.1.md` (project health: 8.9/10) |
| Measurement | `conformance/README.md` (the external oracle and why its baseline is a baseline); `benchmarks/README.md` (`measure:surfaces`, `measure:results`, `benchmark:check` and the variance study behind the tolerance, including why 20% did not hold); `docs/internal/measurements/v3.8.0-arm64-first-run.md` (the first arm64 numbers on real hardware, and why one run is not a gate), `docs/internal/measurements/v3.5.0-same-host-comparison.md` (why the calibration-task idea was tested and discarded, what replaced it, and in v3.6.0 the noise floor AND detection curve that made it a gate), `v3.4.0-runner-baseline.md` (the runner-captured baseline, its cross-instance study AND the CI runs that disproved the 20% tolerance it argued for), `v3.1.0-baseline.md` (the superseded developer-machine study). Everything is in BYTES: no tokenizer has ever been in this repo. |

<<< MC-PROJECT-END >>>
