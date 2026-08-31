# Changelog

All notable changes to the CyberChef MCP Server project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet. Add user-visible changes here in the same PR as the change itself — the reviewer
guidance in `.github/agy-review.md` flags a behaviour change that arrives without one.

## [2.0.0] - 2026-08-31

Upstream **v11.4.0** (504 operations) · **GPL-3.0-or-later** · Node `>=24 <27` · **zero open
security alerts**. Full notes: [`docs/releases/v2.0.0.md`](docs/releases/v2.0.0.md); migration:
[`docs/v2.0.0-breaking-changes.md`](docs/v2.0.0-breaking-changes.md).

### Added
- **ReDoS screening for user-supplied regular expressions** (`src/node/lib/safe-regex.mjs`), replacing the removed `src/core/lib/SafeRegex.mjs`. Screens regex-bearing arguments in `resolveArgValue` — the single point every user argument passes through, covering single-operation tools, `cyberchef_bake` and batch execution with one hook — and rejects catastrophic-backtracking shapes before the pattern is ever executed.
  Two things make this different from its predecessor rather than a reinstatement:
  - It lives in the **fork-owned MCP layer**, outside every sync allowlist, so no upstream sync can disconnect it. The original sat in `src/core/` and was silently stripped.
  - It ships with **26 tests**, including a regression guard that fails if the screen is ever unwired from the dispatch path and a coverage check that fails if the argument heuristic stops matching the operations that compile user patterns. The original had none, which is why its removal went unnoticed for four releases.
  The old module's "timeout-based validation (100ms)" is deliberately **not** reimplemented: catastrophic backtracking blocks the event loop, so no JavaScript timer can fire while it runs. The same applies to `CYBERCHEF_OPERATION_TIMEOUT`, which gives no protection against ReDoS — screening before execution is the only thing that works single-threaded. Configurable via `CYBERCHEF_MAX_REGEX_LENGTH` (default 1000).
- **Antigravity PR reviewer**: `.github/workflows/antigravity-review.yml` plus `scripts/agy-review.sh` and helpers run a first-pass adversarial review on every same-repo PR, and on `/agy-review` from a maintainer. Runs on a self-hosted runner against a Google AI Ultra OAuth session, so it costs no metered API spend. Restores the automated PR review lost when Gemini Code Assist for GitHub was retired.
- **Repository style guide for reviewers**: `.github/agy-review.md` gives the reviewer this project's conventions (fork hygiene for `src/core/**`, generated files, MCP-layer rules) instead of generic advice.
- **`patches/fork/` — fork changes to upstream-owned files, re-applied after every sync.** Three patches, each verified to apply to pristine v11.4.0: `crypto.randomBytes` instead of `Math.random()` for GOST cryptographic randomness (upstream still ships `Math.random()`), backslash-before-quote escaping in `Utils.parsePrettyRecipe` (upstream still ships the `lgtm [js/incomplete-sanitization]`-suppressed version), and this fork's scoped `@natlibfi/loglevel-message-prefix` dependency.
  **A patch that no longer applies fails the sync.** That is the alarm missing when a ReDoS mitigation was silently reverted by a sync and stayed gone for four releases. Patches also beat a protected-file list: `Utils.mjs` gains upstream's new `_validatePrettyRecipe` *and* keeps our escaping fix, where protecting the file wholesale would have discarded upstream's improvement.

### Changed
- **BREAKING (reversal): DEP001, DEP007 and DEP008 are WITHDRAWN — the `cyberchef_` prefix is permanent.** Since v1.8.0 these three warned that `cyberchef_to_base64` would become `to_base64` and that `cyberchef_bake`/`cyberchef_search` would be renamed. That is not happening, in v2.0.0 or later.

  Measured before deciding: removing the prefix saves **1,208 of 183,115 bytes** in the `tools/list` payload — **2.6%** of roughly 45,800 tokens — while making **19 tool names collide** in MCP's flat per-session namespace (`bake search md5 sha1 sha2 hash filter sort merge diff reverse unique fork jump label comment register subtract parse_uri`), and breaking every existing integration. Nearly every other connected MCP server plausibly defines `search`; the prefix is what makes exposing it safe at all. The real context cost is the 483-tool surface, not the name length.

  Withdrawing breaks nobody: no code can depend on a name that has never shipped. **If you renamed tool calls in anticipation, revert them.**

  At runtime these codes now emit a one-time `[WITHDRAWN]` notice at **info**, and are deliberately *not* elevated to errors under `V2_COMPATIBILITY_MODE` — that mode exists to preview what v2.0.0 breaks, and reporting a withdrawn change there would tell users to migrate away from a name that is staying. `getToolName()` returns the prefixed name in every mode, including an explicit `forV2 = true`. `docs/v2.0.0-breaking-changes.md` is rewritten around the reversal, and `docs/releases/v1.8.0.md` carries a dated correction rather than being rewritten.

- **Upstream CyberChef 10.19.4 → 11.4.0.** 505 operation files (was 464); `OperationConfig` holds 504, and the difference is an upstream duplicate, not a loss — `GeneratePrime.mjs` and `RandomPrime.mjs` are **byte-identical** and both declare `this.name = "Pseudo-Random Prime Generator"`, so one shadows the other harmlessly. Tool baseline regenerated: 465 → 506.
- **Node floor is now 24.** Added `engines: {"node": ">=24 <27"}`, matching upstream exactly.
- **Dependency set adopted from upstream**, including two breaking majors that cost nothing because the code that uses them is mirrored: `jimp` 0.22 → 1.6 (no fork-owned code uses it) and `js-yaml` 4 → 5. The `overrides` pin holding `js-yaml` at `^4.1.1` was **removed** — leaving it would have silently defeated the upgrade while installing cleanly.
- **`src/node/recipe-manager.mjs` migrated to js-yaml 5** named imports. It is fork-owned, so the mirror could not do it: `import yaml from "js-yaml"` is `undefined` under v5, which fails at call time rather than import time.
- **`argSelector` argument type supported** (`src/node/lib/tool-schema.mjs`). 19 operations use it, including AES Encrypt/Decrypt; without a case they would have offered a free-text field where only fixed modes are valid.
- **Upstream-owned test suites were adopted from v11.4.0** (`tests/{lib,node,operations,samples}`). Upstream migrated these to `await assert.rejects(...)` for the async `bake()`; our stale copies still used `assert.throws`. `tests/mcp/` remains fork-owned and untouched.

  **This was a one-time adoption during the v11.4.0 landing, not an ongoing mirror** — an earlier wording said "are now mirrored too", which is not what `upstream-sync.yml` does. Its mirror covers `src/core/**` plus six upstream-owned `src/node/*.mjs` files, and its scope check *fails the run* on anything outside that allowlist plus `tests/mcp/baseline.json`. So `tests/` is fork-owned for sync purposes and a local assertion fix there is stable. The distinction matters: the wrong wording would send the next maintainer looking for a fork patch to protect an edit that nothing threatens.
- **`Gruntfile.js` runs `generateHTMLEntities.mjs`.** v11.4.0 introduced a **sixth** generated file, `src/core/lib/HTMLEntities.mjs`. Without it `FromHTMLEntity.mjs` imports a module that does not exist, `generateConfig` dies, and `OperationConfig.json` is left as the literal `[]` — an MCP server with zero tools, from a Grunt run that reports success.

- **BREAKING — Licence: Apache-2.0 → GPL-3.0-or-later.** Applies to v2.0.0 and later. Versions
  1.9.x and earlier remain Apache-2.0 and are unaffected.
  v2.0.0 incorporates algorithms from reference security tools whose licences constrain the choice:
  **katana** is GPL-3.0-or-later (which rules out GPLv2), **John the Ripper** is GPL-2.0-or-later
  (usable under GPLv3), and upstream CyberChef is Apache-2.0 (compatible with GPLv3, *not* GPLv2).
  GPL-3.0-or-later is the only licence admitting all three.
  This is **not** a relicensing of GCHQ's code. Upstream files keep their Apache-2.0 headers and
  copyright; only the combined work changes licence, as Apache-2.0's one-way compatibility with
  GPLv3 permits. The previous combined notice is preserved as `LICENSE.Apache-2.0`.
  **What it means for you:** running CyberChef-MCP, including serving it over HTTP, carries no
  obligation — GPLv3 has no network-use clause. Distributing a *derivative* must also be GPLv3. If
  your policy precludes GPLv3, remain on the v1.9.x line, which stays Apache-2.0 through its LTS
  window. See [ADR 0001](docs/adr/0001-relicense-to-gpl-3-0-or-later.md) and
  `THIRD-PARTY-NOTICES.md`.
- **Upstream Monitor Schedule**: Changed cron from every 6 hours to weekly (Sundays at noon UTC) to reduce unnecessary CI runs
- **BREAKING (output format): `Bcrypt` now emits the `$2b$` prefix, not `$2a$`.** `bcryptjs` 2.x → 3.x changes the revision identifier it *generates*. `$2a$` marks the pre-2011 revision whose length counter had a wraparound bug; `$2b$` is the corrected one, so generating it is the desired behaviour rather than something to pin back.

  **Verification is unaffected** — `bcryptjs` still accepts `$2a$`, `$2b$` and `$2y$` on compare, so `Bcrypt Compare` and `Bcrypt Parse` keep working against every previously-generated hash. Only newly *generated* hashes change, and only in the two-character revision tag. Anything asserting a literal `$2a$` prefix on this operation's output needs updating; `tests/node/tests/operations.mjs` was.
- **`.gitignore` corrected.** Added `.env` / `.env.*` (with `!.env.example`), `dist/`, `*.log`. Removed stale entries: `travis.log` (this project has never used Travis) and `tests/browser/output/*` (the web app went in v1.7.1, and the sync now fails if it returns). `ref-proj/` is no longer ignored — it is a declared submodule tracked as a gitlink, and ignoring a tracked path is what forced `git add -f` in two workflows. Every remaining entry is annotated with why it exists.
- **Upstream sync widened from `src/core/operations/*.mjs` to the whole synced tree.** The old mechanism compared flat basenames in one directory, which cannot express a major-version jump. Measured 10.19.4 → 11.4.0: 449 files identical, **112 differing, 61 added upstream, 1 removed upstream**. It now mirrors all of `src/core/**` plus the six upstream-owned `src/node/*.mjs` files with `rsync -a --delete`, so additions, modifications and deletions apply atomically.
  The deletion case is why atomicity matters: upstream removed `src/core/lib/ImageManipulation.mjs` and refactored `BlurImage`/`SharpenImage` to use `jimp` directly. Syncing operations without `lib/` orphans the library; syncing `lib/` without operations breaks the build.
- **Sync scope is now verified with an allowlist rather than a denylist.** The previous check enumerated forbidden paths, so it only caught mistakes someone had thought of. Anything outside the declared scope now fails the run.

### Removed
- **Fork patch `02-utils-escape-backslashes`.** Upstream fixed the underlying incomplete-sanitization issue in v11.4.0 with `Utils._validatePrettyRecipe()` and a corrected parsing regex. The patch still applied cleanly — and was still wrong, double-escaping what upstream now handles and breaking upstream's own new test. A clean apply is not evidence a patch is still needed.

- **`src/core/lib/SafeRegex.mjs`** (138 lines, added v1.4.1): dead code. The module was never self-acting — it worked by having operations import `createSafeRegExp` — and a later run of `upstream-sync.yml` overwrote those operations verbatim from upstream, removing every import. Nothing in the tree referenced it. Reviving it would mean re-adding imports that the next sync strips again, so it is removed rather than restored. Any future regex hardening must live in the fork-owned MCP layer under `src/node/`, where the sync cannot reach it, or be contributed upstream.
- **`src/core/config/OperationConfig.json` is no longer tracked.** It was gitignored *and* committed at the same time — the only such file in the repository — because `upstream-sync.yml` force-added it on every run. It is generated from the operations by `npx grunt configTests`, so a committed copy is a 1.7MB derived artefact whose diff cannot be meaningfully reviewed and which goes stale the moment an operation changes. Every CI workflow, the Dockerfile and the documented local setup already regenerate it. The force-add is removed from the sync.

### Fixed
- **Streamable HTTP transport now serves multiple clients** ([#36](https://github.com/doublegate/CyberChef-MCP/issues/36)). The HTTP branch created **one** `StreamableHTTPServerTransport` for the whole process and routed every request from every client into it. The SDK marks a transport initialized on the first `initialize` it sees and rejects any further one, so the first client to connect worked and every one after it got `{"code":-32600,"message":"Invalid Request: Server already initialized"}`. Many clients probe the endpoint before their formal handshake, so a single client could burn the one available initialize on its own probe and then reject itself.

  Rewritten as a session map: each session gets its own MCP `Server` **and** its own transport, created on an unsessioned `initialize` and routed thereafter by the `Mcp-Session-Id` header. This is the shape the SDK's own advisory GHSA-345p-7cg4-v4c7 requires — sharing server or transport instances between clients leaks state across them — not merely the tidier one.

  Browser clients get CORS handling: an `OPTIONS` preflight is answered (it used to 405, so a browser client's POST was never sent), with allow headers emitted only for an origin on `CYBERCHEF_ALLOWED_ORIGINS`. Default-deny is deliberate — `Access-Control-Allow-Origin: *` on a server that may bind `0.0.0.0` is how a hostile page reaches a local MCP server. The response carries `Access-Control-Expose-Headers: Mcp-Session-Id`, without which the browser hides the session id from the page's JavaScript and every follow-up request 400s.

  **Session creation is capped** (`CYBERCHEF_MAX_SESSIONS`, default 100). An `initialize` is unauthenticated and creates a `Server` + transport retained for the full session timeout, and session creation sits outside the operation rate limiter and the resource quota tracker — both govern *tool calls*, which by definition only happen once a session exists. Unbounded, a loop of `initialize` requests exhausts the process (CWE-400). Slots are reserved before the await so a concurrent burst cannot all pass the check before any lands, and released on every failure path.

  Also added: `DELETE /mcp` teardown, idle-session reaping (`CYBERCHEF_SESSION_TIMEOUT`, 30 min), a bounded request body (`CYBERCHEF_HTTP_MAX_BODY`, 4 MiB), `405` for unsupported methods, `404` rather than a silently-fresh session for an unknown session id, opt-in DNS-rebinding protection (`CYBERCHEF_ALLOWED_HOSTS`), and `EXPOSE 3000` with HTTP usage documented in `Dockerfile.mcp`. New guide: `docs/guides/http-transport.md`.

  Verified end to end against the container: reproduced on the published `cyberchef-mcp_v1:latest` (client 1 succeeds, client 2 returns the reported error verbatim) and fixed on the new build (three clients, three distinct sessions, full `initialize` → `tools/list` → `tools/call` → `DELETE` → `404` lifecycle). `transports.mjs` coverage went from **36.84% to 94.69%** lines — the untested lines 36-57 were exactly where the defect lived, which is not a coincidence.

- **The Docker build was silently running a failed config step.** `.dockerignore` excluded `tests/`, but `src/core/config/scripts/generateOpsIndex.mjs` (upstream's file, byte-identical) now writes two indexes and `readdir`s `tests/operations/tests/` unconditionally — so `npx grunt configTests` died with `ENOENT` inside the image build. It was invisible because the Gruntfile chained its config scripts with `;`, making the chain's exit status that of a trailing `echo`; the ops index had already been written, so the image built green with the error discarded. Chaining with `&&` surfaced it.

  Fixed by not excluding `tests/` from the build context rather than by hand-editing the mirrored generator, which the next sync would revert. The image is unaffected either way — the builder stage `rm -rf`s `tests` before the runtime stage copies `/app` — so this costs 3.7 MB of build context and nothing in the shipped image. `test-results/` and `ref-proj/` are now excluded too: listing `/app` in the built image showed both had been shipping, `ref-proj` being a second full copy of the CyberChef source tree.
- **`View Bit Plane: malformed PNG` expectation updated for jimp 1.6.1.** 1.6.0 reported `unrecognised content at end of stream` (from the PNG decoder, which was still entered); 1.6.1 rejects the buffer earlier with `Could not find MIME for Buffer`. Upstream pins jimp at exactly `1.6.0` and still asserts the old text. Both are correct reports of the same malformed input and the operation still fails closed with an `OperationError`, so this is an assertion update, not a behaviour regression.
- **Benchmark results now update one comment instead of appending a new one per push** (#56). The `report` job called `issues.createComment` unconditionally, which was invisible only because the step had been 403ing since it was written. It now finds its previous comment by a hidden `<!-- performance-benchmark-results -->` marker and calls `updateComment`, falling back to a plain create on any lookup failure — a duplicate comment is noise, failing to report is worse.

  The lookup uses `github.paginate`, which returns one flat array across all pages. That is deliberate: `listComments` and `gh api --paginate` both emit one array **per page**, so a `.find()` written for a single array silently misses the marker on a long thread and degrades into exactly the duplicate posting this fixes — a failure already reproduced and fixed once in `scripts/agy-review.sh`.
- **`AGY_DRY_RUN` no longer deletes the prompt it exists to show you** (#49). The EXIT trap fires on the dry-run block's `exit 0`, so the one mode whose purpose is "let me look at the assembled prompt" removed it on the way out. It now keeps the prompt and the on-disk diff handoff, cleans up everything else, and logs their paths to stderr so a `> prompt.txt` redirect still captures only the prompt.
- **`scripts/_agy_print.sh` prints a usage line instead of `$1: unbound variable`** (#49), and rejects an unreadable prompt file with a clear message. It is the script most likely to be run by hand while debugging a review — and for the same reason it now reads the prompt with `$(<file)` rather than `$(cat "$file")`, since `cat` parses a leading `-` in the path as an option (`cat -notes.txt` → `cat: invalid option -- 'n'`).
- **The reviewer's cleanup trap no longer passes empty operands to `rm -f`** (#49). `rm -f ""` is silent on GNU coreutils — which is why this never surfaced on the Linux runner — but BSD/macOS `rm` writes to stderr. `${v:+"$v"}` expands to no operand at all rather than an empty one.
- **Documentation asserting a security protection that no longer existed.** `README.md` described SafeRegex as an active mitigation; `docs/reference/cyberchef-upstream.md` — the *live* upstream-sync guide — instructed maintainers to re-apply "SafeRegex imports" after each sync and listed a table of four "MCP patches" of which **three did not exist** (`Magic.mjs`, `Recipe.mjs` and `api.mjs` differed from upstream only by JSON-import syntax, not by the changes claimed). Both corrected against the actual tree. Historical reports keep their text and carry a pointer to the incident record at `docs/security/2026-08-30-saferegex-reverted-by-upstream-sync.md`.
- **The one real fork patch is now documented as such.** `src/core/Utils.mjs` escapes backslashes before double quotes, replacing upstream's `// lgtm [js/incomplete-sanitization]` suppression. Upstream still ships the suppressed version as of v11.4.0, so this is reverted by any sync that widens to `src/core/**` — it is now on the fork-owned manifest instead of being undocumented.
- **Node runtime warnings on startup, now zero.** Two classes, both traced to a source rather than silenced:
  - `[DEP0040] DeprecationWarning: The 'punycode' module is deprecated` — raised by our own `FromPunycode.mjs`/`ToPunycode.mjs`, which imported the bare specifier `punycode`. For unprefixed names Node resolves builtins ahead of `node_modules`, so this always bound to the deprecated built-in. Fixed by adopting the userland `punycode.js` package — exactly what upstream did in v11.4.0, so the next sync confirms this change rather than reverting it.
  - `Warning: Accessing non-existent property 'b2u'/'u2b'/'Pair' of module exports inside circular dependency` — a circular `require` inside `kbpgp`. Our pin was an exact `2.1.15` while upstream uses `^2.1.18`; matching that range resolves to 2.1.19, which no longer emits them.
- **Documentation**: Corrected `ENABLE_WORKERS` env var references to `CYBERCHEF_ENABLE_WORKERS` across README.md, CLAUDE.md, and release notes
- **Documentation**: Updated upstream monitor schedule references from "every 6 hours" to "weekly" in README.md
- **Documentation**: Updated Dockerfile base image references from `node:18-alpine`/`node:22-alpine` to Chainguard distroless in architecture docs and CLAUDE.md
- **Documentation**: Updated coverage threshold references in CLAUDE.md to match current thresholds (75% lines/stmts, 90% functions, 70% branches)
- **Documentation**: Expanded MCP tools listing and CI/CD workflow table in CLAUDE.md

### Security
- **CVE-2026-42615 (HIGH, CVSS 7.2, CWE-79) — XSS in `Show Base64 offsets`.** Upstream built the operation's `<span>`-annotated output by concatenating attacker-influenced text into an HTML string; the vector is the **Alphabet** argument, whose characters land inside span bodies and inside the single-quoted `title='...'` tooltip attribute. Fixed by adopting upstream v11.4.0's file byte-for-byte — the entire diff is `Utils.escapeHtml()` around each interpolated segment — and pinned by `tests/mcp/cve-regressions.test.mjs`, which fails against the pre-fix file (7 span bodies carried raw `<`, `>` and `"`).

  Exposure for this fork was nil, and the record says so: `DishHTML.toArrayBuffer()` strips tags and unescapes entities before any Node-API or MCP consumer sees the value, so the CVE is a web-UI issue. Taken because the image also ships `src/core` for direct use, and because converging on upstream is cheaper than diverging from it.
- **minimatch 3.0.8 → 3.1.5** (CVE-2026-26996 / -27903 / -27904, 3× HIGH). Reached the tree only via `grunt-contrib-watch → gaze → globule`. Fixed with a version-selector override, `"minimatch@3": "^3.1.5"`, which lifts the 3.x line without disturbing `minimatch@10.2.6` under `glob@13`.
- **`nightwatch` removed, clearing uuid 8.3.2** (MEDIUM). Fixed at the root rather than by overriding a transitive dependency: the browser tests nightwatch runs do not exist in this fork — `tests/browser/` and `nightwatch.json` went in v1.7.1 — so it was unrunnable dead weight. `grunt-contrib-connect`, `chromedriver`, the `testui`/`testuidev` scripts, the `testui` grunt task and the `exec.browserTests` command went with it. 274 packages left the tree.
- **`Dockerfile.mcp`: explicit `USER 65532:65532` in the runtime stage** (Trivy DS-0002, HIGH). The last `USER` directive was `root` in the *builder* stage, and the runtime stage relied on the base image's default. Behaviour is unchanged — `id` reported `uid=65532(node)` before and after — but depending on a base image's default for this was the weaker choice.
- **`Dockerfile.mcp`: both `FROM` lines pinned by digest** (Trivy DS-0001, MEDIUM). Chainguard's public catalog publishes only `latest`/`latest-dev`, so a digest is the only reproducible reference; `.github/dependabot.yml`'s `docker` ecosystem bumps it weekly, which is the staleness cover a bare `latest` is usually chosen for.
- **`.trivyignore` added** — one entry, `CVE-2025-14505` (elliptic ≤ 6.6.1), with a written justification: no fixed version exists anywhere, and it reaches the tree only through `crypto-browserify`, a webpack *browser* polyfill whose `crypto` alias is never applied on Node. Wired in through an explicit `trivyignores:` input rather than trivy's cwd default.
- **`SECURITY.md` corrected.** The supported-versions table still named 1.2.x as current, five releases stale, and it documented UID **1001 `cyberchef`** while the image has run as UID **65532 `nonroot`** since the move to Chainguard.
- **Full disposition recorded** in `docs/security/2026-08-31-open-alert-sweep.md`: every open alert fixed, suppressed with a justification, or dismissed with a reason — including the three CodeQL alerts on upstream-identical files, and why the intended `codeql-config.yml` scoping turned out not to be expressible.

## [1.9.0] - 2026-02-05

### Added
- **MCP Streaming Protocol** (closes #13): `executeWithStreamingProgress()` sends `notifications/progress` via MCP SDK progress token mechanism
- **Worker Thread Pool with Piscina** (closes #15): CPU-intensive operations offloaded to worker threads with configurable pool size
- **Streamable HTTP Transport**: Transport factory supporting stdio (default) or HTTP via `CYBERCHEF_TRANSPORT=http`
- **`cyberchef_worker_stats` tool**: Monitor worker pool utilization at runtime
- New `src/node/transports.mjs` transport factory (stdio/HTTP)
- New `src/node/worker.mjs` worker thread script for Piscina
- New `src/node/worker-pool.mjs` worker pool manager
- New test files: handler-dispatch, config-variations, worker-pool, transports
- 9 new environment variables for transport, worker pool, and worker routing configuration

### Changed
- **Upstream Sync v10.20.0** (closes #26): Merged 10 modified operations (Argon2, DeriveEVPKey, Filter, FindReplace, JSONBeautify, PHPDeserialize, RAKE, Register, RegularExpression, Subsection)
- **Test Suites**: 126 new tests (total: 689 tests, all passing) (closes #14)
- **Coverage Thresholds**: Raised to 75% lines/stmts, 90% functions, 70% branches
- **Coverage**: 75.64% lines, 71.98% branches, 91.5% functions

### Security
- `@modelcontextprotocol/sdk` ^1.22.0 -> ^1.26.0 (fixes #45, #52)
- `lodash` ^4.17.21 -> ^4.17.23 (fixes #51)
- `diff` ^5.2.0 -> ^5.2.2 (fixes #50)
- `qs >=6.14.1` override added (fixes #43)
- Trivy container scan now fails CI on vulnerabilities (closes #16)
- `grunt-chmod` replaced with native `fs.chmod` (closes #19)
- **elliptic (#46):** No fix available - documented for tracking

### Removed
- Dead `BufferPool` class code from mcp-server.mjs (closes #20)
- Commented-out `CPU_INTENSIVE_OPERATIONS` set (moved to worker-pool.mjs)

## [1.8.0] - 2025-12-17

### Added
- **Deprecation Warning System** (`src/node/deprecation.mjs`): Comprehensive runtime warning system for APIs changing in v2.0.0
  - 8 deprecation codes (DEP001-DEP008) covering tool naming, recipe schema, error format, configuration, arguments, recipe format, and meta-tool renames
  - Session-based warning tracking (warnings emitted only once per session per code)
  - Suppressible via `CYBERCHEF_SUPPRESS_DEPRECATIONS=true` environment variable
  - V2 compatibility mode that elevates warnings to errors via `V2_COMPATIBILITY_MODE=true`
  - Recipe analysis tools (`analyzeRecipeCompatibility`, `transformRecipeToV2`)
  - Utility functions (`getToolName`, `stripToolPrefix`)
- **Migration Preview Tool** (`cyberchef_migration_preview`): New MCP tool for analyzing and transforming recipes
  - `analyze` mode: Check recipes for v2.0.0 compatibility issues with detailed diagnostics
  - `transform` mode: Automatically convert recipes to v2.0.0 format
  - Reports issues with severity levels (breaking/warning), locations, and fix suggestions
- **Deprecation Stats Tool** (`cyberchef_deprecation_stats`): New MCP tool for tracking deprecated API usage
  - Shows which deprecations have been triggered in current session
  - Includes session duration, suppression status, and v2 compatibility mode status
  - Lists all available deprecation codes with details
- **v2.0.0 Breaking Changes Documentation** (`docs/v2.0.0-breaking-changes.md`): Comprehensive migration guide
  - Tool naming convention changes (removing `cyberchef_` prefix)
  - Recipe schema format changes (Zod v4 validation)
  - Error response format changes (structured error codes)
  - Configuration system changes (unified config file)
  - Legacy argument handling changes (named object args)
  - Recipe array format changes (explicit operation objects)
  - Meta-tool renames (`cyberchef_bake` -> `bake`, `cyberchef_search` -> `search`)
  - Migration examples and FAQ section
- **Test Suites**: 81 new tests for v1.8.0 features (total: 563 tests, all passing)
  - `tests/mcp/deprecation.test.mjs`: 43 tests for deprecation warning system
  - `tests/mcp/migration-preview.test.mjs`: 38 tests for migration preview tool and server integration
  - Increased from 493 tests (v1.7.2) to 563 tests across 15 test suites

### Changed
- **VERSION**: Updated from 1.7.3 to 1.8.0 in `src/node/mcp-server.mjs`
- **Server Startup Logging**: Enhanced to display v1.8.0 configuration options (V2_COMPATIBILITY_MODE, SUPPRESS_DEPRECATIONS)
- **Meta-tool Deprecation Warnings**: `cyberchef_bake` and `cyberchef_search` now emit deprecation warnings when used

### Documentation
- **Release Notes** (`docs/releases/v1.8.0.md`): Comprehensive release notes for v1.8.0
- Updated README.md with v1.8.0 features and migration tools
- Updated CLAUDE.md with v1.8.0 version references
- Updated project roadmap to reflect Phase 3 progress

## [1.7.3] - 2025-12-17

### Added
- **Reference Documentation** (`docs/reference/`): 12 comprehensive security tool documentation files (~312KB total)
  - Master index `README.md` with navigation and categorization
  - 11 security tool reference documents: `ares.md`, `ciphey.md`, `cryptii.md`, `cyberchef-recipes.md`, `cyberchef-server.md`, `cyberchef-upstream.md`, `john-the-ripper.md`, `katana.md`, `pwntools.md`, `rsactftool.md`, `xortool.md`
  - Each document includes: project overview, key features, installation, usage examples, integration notes, and relevant algorithms
  - Purpose: Support v2.0.0 external project integration planning
- **External Project Integration Planning** (`docs/planning/ext-proj-int/`): 30 comprehensive planning documents (~23,600 lines)
  - **Overview**: `README.md` and `overview.md` - Integration strategy and architecture
  - **Phase Plans** (4 files): `phase-1-foundation.md`, `phase-2-js-native.md`, `phase-3-algorithm-port.md`, `phase-4-advanced.md`
  - **Sprint Plans** (12 files): Detailed task breakdowns for sprints 1.1 through 4.3
    - Phase 1: Tool registry infrastructure, testing framework extensions
    - Phase 2: cryptii integration, recipe presets, pwntools binary utilities
    - Phase 3: Ciphey auto-decode, xortool analysis, RsaCtfTool factorization, katana patterns
    - Phase 4: John hash ID, composite workflows, documentation and release
  - **Tool Integration Plans** (8 files): Per-tool integration strategies for Ciphey, cryptii, xortool, RsaCtfTool, John, pwntools, katana, recipes
  - **Technical Guides** (4 files): `tool-registration.md`, `algorithm-porting.md`, `testing-strategy.md`, `dependencies.md`
  - **Target**: v2.0.0+ with 80-120 new MCP tools from 8 security tool projects
  - **Timeline**: 24 weeks across 4 phases

### Changed
- **README.md**: Added new documentation sections
  - "v2.0.0 Integration Planning" section linking to external project integration docs
  - "Reference Documentation" section linking to security tool reference docs
  - Enhanced Roadmap section with v2.0.0 planning summary
- **Project Roadmap**: Updated Phase 2 to v1.7.3 and Phase 3 status to "Planning Complete"

## [1.7.2] - 2025-12-17

### Changed
- **CI Workflow**: Renamed "Core CI" to "MCP Server CI" for clarity on workflow purpose
- **CI Workflow**: Removed web UI production build step from MCP Server CI workflow (not needed for MCP-focused fork)

### Fixed
- **Codecov Integration**: Updated from deprecated `codecov/test-results-action@v1` to `codecov/codecov-action@v5` with `report_type: test_results` parameter
  - Ensures continued test analytics support as test-results-action is being deprecated
  - Uses same action for both coverage and test results uploads
- **Tests**: Fixed "Scan for embedded files" test to use existing test data file (`tests/node/sampleData/pic.jpg`)
  - Replaced missing `tests/samples/hello` with actual test file
  - Test now passes consistently
- **Documentation**: Corrected operation count from 464 to 463 in README.md
- **Documentation**: Updated coverage metrics to reflect current state (74.97% lines, 90.39% functions)

### Added
- **Test Coverage**: Expanded test suite from 343 to 493 tests across 13 test files
  - Added coverage improvement tests in `coverage-improvement.test.mjs` (68 tests)
  - Added real server handler integration tests in `real-server-handlers.test.mjs`
  - Added server integration tests in `server-integration.test.mjs`
  - Total test count: 493 tests covering all MCP server components
- **Documentation**: Added cleanup analysis scripts to `scripts/cyberchef-cleanup/` directory

## [1.7.1] - 2025-12-16

### Changed
- **Repository Structure**: Cleaned up 88 unused upstream files for MCP-focused codebase
  - Removed 81 web UI files from `src/web/` (stylesheets, fonts, images, UI components)
  - Removed 4 browser test files from `tests/browser/` (Nightwatch.js browser tests)
  - Removed 2 config files (`nightwatch.json` for browser testing, `postcss.config.js` for CSS processing)
  - Removed 1 `.devcontainer/devcontainer.json` for VS Code dev containers
  - Net reduction: ~19,260 lines of code
  - All MCP functionality preserved (343 tests still passing)
- **Upstream Sync Workflows**: Complete rewrite for selective file synchronization model
  - `upstream-monitor.yml`: Enhanced to work with `ref-proj/CyberChef/` directory structure for full upstream clone
  - `upstream-sync.yml`: Complete rewrite to copy only `src/core/operations/*.mjs` files from upstream
    - Prevents restoration of deleted web UI files during sync
    - Verifies no excluded files are copied to main codebase
    - Creates pull request for review instead of direct merge to master
    - Includes comprehensive testing before PR creation
  - `rollback.yml`: Enhanced with state comparison table and ref-proj rollback guidance
  - New sync philosophy: Selective file copying instead of git merge to preserve MCP-specific modifications
- **GitHub Templates**: Updated 5 issue and pull request templates with fork-specific references
  - Bug report template: Updated upstream repository references
  - Feature request template: Added context for MCP-specific features
  - Pull request template: Updated contribution guidelines
  - Issue templates: Clarified fork relationship with GCHQ/CyberChef
- **Configuration Files**: Multiple enhancements for project consistency and compliance
  - `CODE_OF_CONDUCT.md`: Updated enforcement contact from GCHQ to `doublegate@pm.me` for fork-specific reporting
  - `LICENSE`: Added fork notice header crediting both GCHQ (original CyberChef) and DoubleGate (MCP fork maintainer)
  - `eslint.config.mjs`: Fixed flat config structure with proper exports, added comprehensive MCP server documentation
  - `.editorconfig`: Added comprehensive file type configurations (JSON, YAML, Markdown, Shell scripts, etc.)
  - `.cspell.json`: Added 96 project-specific terms for accurate spell checking (CyberChef operations, MCP terminology, technical terms)

### Added
- **Documentation**: `docs/guides/upstream-sync-guide.md` - Comprehensive guide to selective upstream synchronization workflow (540 lines)
  - Explains selective sync model vs. full git merge approach
  - Documents file exclusion rules (88 files never synced from upstream)
  - Provides troubleshooting guidance for common sync issues
  - Includes workflow diagrams for monitor → sync → merge flow
  - Details testing strategy for pre-sync, during sync, and post-sync validation
  - Covers common scenarios: routine updates, manual sync, rollback, breaking changes

## [1.7.0] - 2025-12-16

### Added
- **Batch Processing (P0)**: Execute multiple operations in a single request
  - New tool: `cyberchef_batch` with parallel and sequential execution modes
  - Partial success support - operations continue even if some fail
  - Configurable batch size limit (default: 100 operations)
  - Environment variable: `CYBERCHEF_BATCH_MAX_SIZE`, `CYBERCHEF_BATCH_ENABLED`
  - BatchProcessor class for orchestrating batch execution
- **Telemetry & Analytics (P1)**: Privacy-first usage metrics collection
  - New tool: `cyberchef_telemetry_export` for exporting metrics in JSON or summary format
  - Metrics collected: tool name, duration, data sizes, success status, cache hits (NO input/output data)
  - Statistics: total calls, success rate, average duration, cache hit rate
  - TelemetryCollector class with configurable retention (10,000 metrics max)
  - Environment variable: `CYBERCHEF_TELEMETRY_ENABLED` (default: false - privacy-first)
- **Rate Limiting (P1)**: Sliding window rate limiting for resource protection
  - Per-connection request tracking with configurable limits
  - Automatic cleanup of expired timestamps
  - 429 error responses with retry-after information when limit exceeded
  - RateLimiter class implementing sliding window algorithm
  - Environment variables: `CYBERCHEF_RATE_LIMIT_ENABLED`, `CYBERCHEF_RATE_LIMIT_REQUESTS`, `CYBERCHEF_RATE_LIMIT_WINDOW`
  - Default: disabled (no restrictions by default)
- **Cache Enhancements (P2)**: New tools for cache inspection and management
  - New tool: `cyberchef_cache_stats` for real-time cache statistics
  - New tool: `cyberchef_cache_clear` for manual cache invalidation
  - Cache-enabled flag for disabling caching if needed
  - Environment variable: `CYBERCHEF_CACHE_ENABLED` (default: true)
- **Resource Quotas (P2)**: Track and enforce resource usage limits
  - New tool: `cyberchef_quota_info` for current quota and usage information
  - Concurrent operation tracking and enforcement
  - Total data size tracking (input/output volumes)
  - ResourceQuotaTracker class for quota management
  - Environment variable: `CYBERCHEF_MAX_CONCURRENT_OPS` (default: 10)
- **Test Coverage**: Added 32 new test cases for v1.7.0 features
  - TelemetryCollector: 5 tests
  - RateLimiter: 6 tests
  - ResourceQuotaTracker: 7 tests
  - BatchProcessor: 8 tests
  - Cache Enhancements: 4 tests
  - Integration Tests: 2 tests
  - Total tests increased from 311 to 343

### Changed
- **Integrated tracking into standard operations**: All operations now include telemetry, rate limiting, and quota tracking
- **Server startup logging**: Enhanced to display all v1.7.0 configuration options
- **Exports**: Added new classes and constants for testing
  - Classes: `TelemetryCollector`, `RateLimiter`, `ResourceQuotaTracker`, `BatchProcessor`
  - Constants: `BATCH_MAX_SIZE`, `BATCH_ENABLED`, `TELEMETRY_ENABLED`, `RATE_LIMIT_ENABLED`, etc.

### Security
- **Privacy-first defaults**: Telemetry disabled by default, no sensitive data collected
- **Rate limiting**: Protects against abuse when enabled
- **Resource quotas**: Prevents DoS attacks via resource exhaustion

## [1.6.2] - 2025-12-16

### Fixed
- **ESLint Errors**: Fixed 12 ESLint errors in test files
  - Removed unused imports (beforeEach, vi)
  - Fixed duplicate key in logger test
  - Fixed camelCase violations in recipe-validator tests
  - Fixed dot notation issue in recipe-validator tests
  - Added eslint-disable-next-line for intentionally unused loop variables
- **ENABLE_WORKERS Default**: Changed default from `true` to `false`
  - Worker threads are not yet implemented, so default should be disabled
  - Updated `src/node/mcp-server.mjs` to default to `false`
  - Updated configuration documentation in README.md and user guide
- **Configuration Documentation**: Updated all references to ENABLE_WORKERS
  - README.md: Updated default value and added clarification
  - docs/guides/user_guide.md: Updated default value and description

## [1.6.1] - 2025-12-16

### Added
- **Comprehensive Codecov Integration**: Complete coverage analytics, bundle analysis, and test analytics
  - **Coverage Analytics**: Automated coverage tracking with status checks on pull requests
    - V8 coverage provider generating lcov, JSON, HTML, and Cobertura reports
    - 70% minimum coverage threshold for project (lines, functions, statements)
    - 75% minimum coverage threshold for new code (patch coverage)
    - Flags for different test types (mcp-tests, core-tests, node-api)
    - Component-level coverage tracking (MCP Server, Core Operations, Node API)
  - **Bundle Analysis**: Webpack bundle size tracking and visualization
    - Integration with @codecov/webpack-plugin for automated uploads
    - Bundle size change detection in pull requests
    - Historical bundle size trends and optimization insights
    - Dry-run mode for local development without token
  - **Test Analytics**: JUnit XML test result reporting and analysis
    - Test performance tracking over time
    - Flaky test detection and identification
    - Test execution time monitoring and regression detection
  - **Configuration Files**:
    - `codecov.yml`: Coverage thresholds, status checks, PR commenting, path exclusions
    - Updated `vitest.config.mjs`: V8 coverage, JUnit XML reporter, coverage thresholds
    - Updated `.github/workflows/core-ci.yml`: Codecov action integration with test results upload
    - Updated `Gruntfile.js`: Webpack bundle analysis plugin configuration
  - **GitHub Actions Integration**:
    - Coverage upload using codecov/codecov-action@v5
    - Test results upload using codecov/test-results-action@v1
    - Bundle analysis triggered on production builds
    - All uploads include appropriate flags and metadata
  - **Documentation**:
    - `docs/guides/codecov-integration.md`: Comprehensive 400+ line integration guide
    - `CODECOV_INTEGRATION_SUMMARY.md`: Implementation summary
    - `CODECOV_VERIFICATION.md`: Verification guide

### Changed
- Enhanced test infrastructure to generate coverage and test result reports
- Updated `.gitignore` to exclude coverage artifacts (coverage/, test-results/, .nyc_output/)
- Updated README.md with comprehensive Codecov section in CI/CD documentation
- **Comprehensive Test Suite Expansion**: Increased from 274 to 311 tests (+37 tests)
  - Added 67 mcp-server.mjs unit tests covering core functionality
  - All 9 test files in `tests/mcp/` now provide full coverage of MCP server components
  - Test files: errors, logger, streaming, retry, recipe-validator, recipe-storage, recipe-manager, mcp-server, validation
- **Coverage Improvements**: All thresholds now met
  - Lines: 78.93% (threshold: 70%)
  - Statements: 78.7% (threshold: 70%)
  - Functions: 89.33% (threshold: 70%)
  - Branches: 74.68% (threshold: 65%)
- **mcp-server.mjs Exports**: Added testable exports for unit testing
  - `LRUCache` class for cache testing
  - `MemoryMonitor` class for memory monitoring tests
  - Utility functions: `sanitizeToolName`, `mapArgsToZod`, `resolveArgValue`, `validateInputSize`
  - Configuration constants: `VERSION`, `MAX_INPUT_SIZE`, `OPERATION_TIMEOUT`, cache settings

### Fixed
- Fixed `codecov.yml` validation error by removing deprecated `ui` field from configuration
- Fixed mcp-server.mjs 0% coverage by adding exports and updating tests to import actual implementations
- Fixed recipe-storage.mjs test isolation with `createEmptyStorage()` factory function for consistent timestamp generation

## [1.6.0] - 2025-12-16

### Added
- **Recipe Management System**: Comprehensive recipe storage and management
  - Save multi-operation recipes with names, descriptions, tags, and metadata
  - Recipe CRUD operations: create, read, update, delete
  - Recipe execution with saved configurations
  - Recipe composition: nest recipes within recipes
  - Recipe validation and complexity estimation
  - Circular dependency detection
  - Recipe library with 25+ curated examples across 5 categories
- **Recipe Import/Export**: Multi-format recipe portability
  - JSON format (native)
  - YAML format (human-readable)
  - URL format (shareable base64-encoded links)
  - CyberChef format (compatibility with upstream)
- **Recipe Validation Tools**: Pre-execution validation
  - Validate recipe structure without saving
  - Test recipes with sample inputs
  - Operation name and argument validation
  - Complexity and execution time estimation
- **New MCP Tools** (10 total):
  - `cyberchef_recipe_create` - Create new recipe
  - `cyberchef_recipe_get` - Retrieve recipe by ID
  - `cyberchef_recipe_list` - List recipes with filtering
  - `cyberchef_recipe_update` - Update existing recipe
  - `cyberchef_recipe_delete` - Delete recipe
  - `cyberchef_recipe_execute` - Execute saved recipe
  - `cyberchef_recipe_export` - Export to JSON/YAML/URL/CyberChef
  - `cyberchef_recipe_import` - Import from various formats
  - `cyberchef_recipe_validate` - Validate recipe structure
  - `cyberchef_recipe_test` - Test with sample inputs
- **Recipe Storage**: JSON file-based storage with atomic writes
  - In-memory caching for performance
  - Automatic backup creation
  - Recipe versioning (semver)
  - Storage statistics and metadata
- **Environment Variables**: New configuration options
  - `CYBERCHEF_RECIPE_STORAGE` - Storage file path (default: `./recipes.json`)
  - `CYBERCHEF_RECIPE_MAX_COUNT` - Maximum recipes (default: 10000)
  - `CYBERCHEF_RECIPE_MAX_OPERATIONS` - Max operations per recipe (default: 100)
  - `CYBERCHEF_RECIPE_MAX_DEPTH` - Max nesting depth (default: 5)

### Changed
- Updated MCP server version from 1.5.1 to 1.6.0
- Enhanced server initialization to include recipe manager setup
- Improved tool registration with 10 additional recipe management tools

### Fixed
- None

## [1.5.1] - 2025-12-15

### Added
- **Dual-Registry Publishing**: Images now published to both Docker Hub and GitHub Container Registry (GHCR)
  - Docker Hub: Primary distribution with Docker Scout health score monitoring
  - GHCR: Secondary distribution for GitHub ecosystem integration
  - Enables maximum accessibility and security transparency
- **Supply Chain Attestations**: Enhanced security compliance for Docker Hub images
  - Provenance attestation with `mode=max` for SLSA Build Level 3 compliance
  - SBOM attestation in SPDX-JSON format (in-toto)
  - Achieves optimal Docker Scout health score (grade A or B)
  - Attestations account for 15 points out of 100 in health score calculation
- **Docker Scout Health Score Optimization**: Resolved 'C' grade by adding missing attestations
  - Root cause: Missing provenance and SBOM attestations
  - Solution: Enabled attestation generation in GitHub Actions workflow
  - Expected improvement: 'C' → 'B' or 'A' health score
- **New Documentation Guides**:
  - `docs/guides/DOCKER_HUB_SETUP.md`: Quick start guide for Docker Hub publishing with attestations
  - `docs/guides/docker-scout-attestations.md`: Comprehensive guide to supply chain attestations, health scores, verification, and troubleshooting

### Changed
- **GitHub Actions Workflow Updates**:
  - `.github/workflows/mcp-release.yml`: Enhanced for dual-registry publishing
    - Added Docker Hub login step with `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets
    - Added metadata extraction for both GHCR and Docker Hub
    - Updated `docker/build-push-action` to v6 for attestation support
    - Added `provenance: mode=max` parameter for maximum build provenance detail
    - Added `sbom: true` parameter for automatic SBOM generation
    - Updated permissions to include `attestations: write` and `id-token: write`
    - Both attestations automatically attached to images in both registries
  - `.github/workflows/mcp-docker-build.yml`: Updated to v6 and added comprehensive documentation
    - Added detailed comments explaining attestation limitations with `load: true`
    - Clarified that attestations only work with registry push (not local Docker daemon)
- **README.md**: Major updates for dual-registry publishing
  - Updated Quick Start to prioritize Docker Hub as primary distribution
  - Added GHCR as alternative installation option
  - Enhanced Technical Highlights with dual-registry and attestation information
  - Expanded Supply Chain Security section with detailed attestation documentation
  - Added new documentation guides to User Guides section
  - Updated Repository Information with Docker Hub as primary registry

### Security
- **Enhanced Supply Chain Transparency**: Complete build provenance and SBOM for all releases
  - Verifiable supply chain integrity via SLSA provenance attestation
  - Complete dependency tree with version information via SBOM attestation
  - Supports compliance with security standards (SLSA, SSDF, SOC 2, ISO 27001)
- **Docker Hub Health Score**: Public visibility into security posture
  - Health score badge visible on Docker Hub repository
  - Detailed policy results available for review
  - Automated vulnerability scanning by Docker Scout

### Infrastructure
- **Required GitHub Secrets**: Two new secrets for Docker Hub publishing
  - `DOCKERHUB_USERNAME`: Docker Hub username
  - `DOCKERHUB_TOKEN`: Docker Hub access token with Read, Write, Delete permissions
- **Dual SBOM Strategy**: Comprehensive software bill of materials
  - Docker attestation SBOM: Attached to image manifest for registry-based validation
  - Trivy SBOM artifact: Standalone CycloneDX file for offline audits and compliance reporting

## [1.5.0] - 2025-12-15

### Added - Enhanced Error Handling and Observability
- **CyberChefMCPError Class**: Comprehensive error handling with error codes, context, and recovery suggestions
  - Error codes: `INVALID_INPUT`, `MISSING_ARGUMENT`, `OPERATION_FAILED`, `TIMEOUT`, `OUT_OF_MEMORY`, `UNSUPPORTED_OPERATION`, `CACHE_ERROR`, `STREAMING_ERROR`
  - Rich context capture (input size, operation name, request ID, timestamp)
  - Automatic recovery suggestions based on error type
  - Retryable vs non-retryable error classification
- **Structured Logging with Pino**: Production-ready JSON logging for observability
  - Log levels: `debug`, `info`, `warn`, `error`, `fatal`
  - Request correlation with UUID-based request IDs
  - Event types: `request_start`, `request_complete`, `request_error`, `cache_operation`, `memory_check`, `streaming_operation`, `retry_attempt`
  - Performance metrics: duration, input/output sizes, cache hits
  - Configurable via `LOG_LEVEL` environment variable
- **Automatic Retry Logic**: Exponential backoff for transient failures
  - Default 3 retry attempts for timeouts, memory issues, cache errors
  - Exponential backoff: 1s → 2s → 4s with jitter
  - Non-retryable errors fail immediately (invalid input, missing arguments)
  - Configurable via `CYBERCHEF_MAX_RETRIES`, `CYBERCHEF_INITIAL_BACKOFF`, `CYBERCHEF_MAX_BACKOFF`, `CYBERCHEF_BACKOFF_MULTIPLIER`
- **MCP Streaming Infrastructure**: Foundation for progressive results on large operations
  - Streaming strategy detection based on operation type and input size
  - Chunked streaming for encoding, hashing operations (Base64, Hex, MD5, SHA)
  - Progress reporting every 10MB
  - Configurable via `CYBERCHEF_STREAM_CHUNK_SIZE`, `CYBERCHEF_STREAM_PROGRESS_INTERVAL`
- **Circuit Breaker Pattern**: Protection against cascading failures
  - Opens after 5 consecutive failures
  - Reset timeout: 60 seconds
  - States: CLOSED, OPEN, HALF_OPEN
- **Request Correlation**: End-to-end tracking with UUID request IDs
  - Request IDs in all log entries
  - Request IDs in error messages
  - Duration tracking from start to completion

### Changed
- **Version bump**: `1.4.6` → `1.5.0` in `package.json` (mcpVersion) and `mcp-server.mjs`
- **Error Handling**: All errors now use `CyberChefMCPError` with structured formatting
- **Logging**: Replaced `console.error` with structured Pino logging throughout
- **Memory Monitoring**: Now uses structured logging instead of console output
- **Operation Execution**: All operations now include retry logic and request tracking
- **Cache Logging**: Cache hits/misses logged with structured events

### Dependencies
- **Added**: `pino@^9.6.0` for structured logging

### Documentation
- **Release notes**: Comprehensive `docs/releases/v1.5.0.md` with configuration examples
- **Environment variables**: 7 new configuration options documented
- **Migration guide**: Zero breaking changes, drop-in replacement for v1.4.6

### Performance
- **50% Better Error Recovery**: Automatic retry reduces manual intervention
- **Faster Debugging**: Structured logs with request IDs speed up troubleshooting
- **Reduced Downtime**: Circuit breaker prevents cascading failures
- **Better Observability**: JSON logs integrate with monitoring tools

### New Environment Variables
- `LOG_LEVEL`: Logging level (default: `info`)
- `CYBERCHEF_MAX_RETRIES`: Maximum retry attempts (default: `3`)
- `CYBERCHEF_INITIAL_BACKOFF`: Initial backoff delay in ms (default: `1000`)
- `CYBERCHEF_MAX_BACKOFF`: Maximum backoff delay in ms (default: `10000`)
- `CYBERCHEF_BACKOFF_MULTIPLIER`: Backoff multiplier (default: `2`)
- `CYBERCHEF_STREAM_CHUNK_SIZE`: Chunk size for streaming (default: `1048576`)
- `CYBERCHEF_STREAM_PROGRESS_INTERVAL`: Progress reporting interval (default: `10485760`)

### Success Metrics
- ✅ Enhanced error messages with context and suggestions
- ✅ Structured logs in JSON format for production monitoring
- ✅ Automatic retry for transient failures
- ✅ Request correlation with UUID tracking
- ✅ Streaming infrastructure for large operations
- ✅ All 1,933 unit tests passing
- ✅ All 465 MCP tool validations passing

## [1.4.6] - 2025-12-14

### Security - Sprint 1: Security Hardening
*   **Chainguard Distroless Base Image**: Migrated from `node:22-alpine` to `cgr.dev/chainguard/node:latest`
    *   **Zero-CVE Baseline**: Daily security updates with 7-day SLA for critical CVE patches
    *   **70% Smaller Attack Surface**: Minimal OS footprint (no shell, no package manager, only runtime dependencies)
    *   **SLSA Build Level 3 Provenance**: Verifiable supply chain integrity via Chainguard attestations
    *   **Multi-stage Build**: Uses `-dev` variant for compilation, distroless for production runtime
    *   **Non-Root Execution**: Runs as UID 65532 (nonroot user) in distroless environment
    *   Reduces container size from ~270MB (Alpine) to ~90MB (distroless)
*   **Security Scan Fail Thresholds**: Trivy scanner now configured to fail builds on vulnerabilities
    *   Added `exit-code: '1'` to `.github/workflows/mcp-docker-build.yml`
    *   Prevents images with CRITICAL or HIGH vulnerabilities from reaching production
    *   Enforces zero-tolerance security policy in CI/CD pipeline
*   **Read-Only Filesystem Support**: Container now fully supports `--read-only` mode
    *   Compliance-ready for PCI-DSS, SOC 2, FedRAMP immutable deployment requirements
    *   Requires tmpfs mount: `--tmpfs /tmp:rw,noexec,nosuid,size=100m`
    *   Documented in `Dockerfile.mcp` comments and README security section

### Added - Sprint 1: Security Hardening
*   **Dual SBOM Strategy**: Comprehensive supply chain transparency
    *   **Part 1**: Docker buildx attestations in `.github/workflows/mcp-release.yml`
        *   Provenance attestation (`mode=max`) for complete build process metadata
        *   SBOM attestation for automatic dependency tree generation
        *   Enables Docker Scout automated scanning and health score improvements ('C' → 'B' or 'A')
        *   Supports SLSA Level 2+ compliance for supply chain integrity
    *   **Part 2**: Trivy CycloneDX SBOM for offline compliance auditing
        *   Generated during release workflow
        *   Attached as release asset for verification and compliance reporting
        *   Complete dependency tree with version information
*   **Enhanced Error Logging**: Improved operational observability in `src/node/mcp-server.mjs`
    *   Added diagnostic logging for OperationConfig schema generation failures
    *   Logs operation name, tool name, argument count, and error message
    *   Does not disrupt MCP protocol communication
*   **Docker Build Context Optimization**: Enhanced `.dockerignore` file
    *   Added exclusions for generated files: `OperationConfig.json`, `modules/`, `index.mjs`
    *   Prevents permission conflicts during multi-stage builds
    *   Reduces build context size for faster image builds

### Changed - Sprint 1: Security Hardening
*   **Dockerfile.mcp**: Complete rewrite for Chainguard distroless base
    *   Stage 1: Uses `cgr.dev/chainguard/node:latest-dev` for building (includes npm, build tools)
    *   Stage 2: Uses `cgr.dev/chainguard/node:latest` for runtime (distroless, minimal attack surface)
    *   Added SlowBuffer compatibility patches for Node.js 22+ during build
    *   Optimized layer caching for faster rebuilds
    *   Runs as UID 65532 (nonroot user) instead of UID 1001
*   **GitHub Actions Workflow**: Upgraded Docker build action in `.github/workflows/mcp-release.yml`
    *   Updated from `docker/build-push-action@v5` to `@v6` for attestation support
    *   Added `provenance: mode=max` parameter for maximum build provenance detail
    *   Added `sbom: true` parameter for automatic SBOM generation
    *   Both attestations attached to container image and GHCR registry
*   **README.md**: Comprehensive security documentation updates
    *   Added "Latest Security Enhancements (v1.4.5 Sprint 1)" section
    *   Updated Quick Start with read-only filesystem example
    *   Enhanced "Secure Deployment" section with Chainguard-specific guidance
    *   Updated container size from ~270MB to ~90MB in Technical Highlights

### Performance - Sprint 1: Security Hardening
*   **Container Size Reduction**: 70% smaller image size (~270MB → ~90MB compressed)
    *   Faster image pulls from GHCR
    *   Reduced storage footprint for offline deployments
    *   Lower bandwidth requirements for CI/CD pipelines

## [1.4.5] - 2025-12-14

### Added
- **Docker Scout Supply Chain Attestations**: Enhanced container image security and transparency
  - Provenance attestation (mode=max) for verifiable build integrity
  - SBOM attestation automatically generated and attached to releases
  - Enables compliance with supply chain security standards (SLSA, SSDF)
  - Improves Docker Scout health score from 'C' to expected 'B' or 'A'
- **Documentation Organization**: New structured directory layout for improved navigation
  - `docs/architecture/` - Technical design documents (3 files)
  - `docs/guides/` - User-facing guides (2 files)
  - `docs/internal/` - Internal working documents (4 files)
  - `docs/planning/phases/` - Development phase breakdowns (7 files)
  - `docs/planning/strategies/` - Strategic planning documents (5 files)
  - `docs/planning/future-releases/` - Release specifications (23 files)
  - `docs/releases/` - Release notes (11 files)
  - `docs/security/` - Security documentation (3 files)

### Changed
- **GitHub Actions Workflow**: Upgraded Docker build action for attestation support
  - Updated from `docker/build-push-action@v5` to `@v6` in `mcp-release.yml`
  - Added `provenance: mode=max` parameter for maximum build provenance detail
  - Added `sbom: true` parameter for automatic SBOM generation
- **Documentation Structure**: Major reorganization of 39 files using `git mv` (history preserved)
  - Reduced root-level markdown files from 12 to 8
  - Created logical subdirectories under `docs/` for better organization
  - All internal links updated to reflect new paths
- **README.md**: Updated documentation section to reflect new organized structure
  - User Guides section links to `docs/guides/`
  - Technical Documentation section links to `docs/architecture/`
  - Project Management section links to `docs/planning/`
  - Strategic Planning section links to `docs/planning/strategies/`

### Fixed
- **Docker Scout Health Score**: Resolved 'C' rating due to missing attestations
  - Root cause: No provenance or SBOM attestations in container images
  - Solution: Enabled attestation generation in GitHub Actions workflow
  - Expected improvement: 'C' → 'B' or 'A' health score
- **Documentation Links**: Fixed all broken internal documentation links after reorganization
  - Updated paths in README.md, CLAUDE.md, and cross-references
  - Verified all links point to correct new locations

### Security
- **Build Provenance**: Verifiable supply chain integrity via SLSA provenance attestation
  - Records complete build process metadata (builder, materials, recipe)
  - Enables verification of artifact authenticity
  - Supports SLSA Level 2+ compliance
- **Software Transparency**: Comprehensive SBOM for dependency tracking
  - CycloneDX format SBOM automatically generated
  - Complete dependency tree with version information
  - Enables vulnerability tracking and compliance auditing

## [1.4.4] - 2025-12-14

### Fixed
- **Docker Hub Build**: Resolved webpack child compilation failures preventing Docker Hub CI/CD from building v1.4.2 and v1.4.3
  - Root cause: Corrupted import path in `@natlibfi/loglevel-message-prefix@3.0.1` package
  - Automated fix via postinstall script using sed to correct the import path
  - Cross-platform support for Linux and macOS
  - Prevents webpack child compiler failures in all 5 web workers
- **Docker Hub Build**: Optimized memory usage and webpack configuration for Docker Hub's constrained resources
  - Set `NODE_OPTIONS="--max-old-space-size=4096"` in Dockerfile
  - Reduced webpack parallelism to 1 to minimize resource contention
  - Made BundleAnalyzerPlugin resilient with `logLevel: "warn"`
  - Enhanced webpack stats with `children: true` for debugging visibility

### Security
- **Fixed 12 Code Scanning Vulnerabilities**: Comprehensive security hardening for web UI (PR #10)
  - **CRITICAL**: Fixed code injection vulnerability in `src/web/waiters/OutputWaiter.mjs`
  - **HIGH**: Enhanced XSS prevention with attribute allowlist
  - **HIGH**: Added comprehensive attribute value validation
  - **HIGH**: Enhanced protocol validation to prevent malicious URIs
  - All 12 vulnerabilities are in web UI code only - MCP server remains unaffected

### Added
- **GitHub Copilot Instructions**: Added comprehensive development guidance (PR #12)
  - Created `.github/copilot-instructions.md` with quick start workflow and code conventions
  - Created `.github/agents/copilot-instructions.md` for discovery
  - Includes architecture overview, development tasks, and troubleshooting
- **Grunt Task**: New `exec:fixLoglevelMessagePrefix` task in Gruntfile.js
  - Automatically fixes corrupted package on postinstall

### Changed
- **Version bump**: `1.4.3` → `1.4.4` in `package.json` and `mcp-server.mjs`
- **Webpack Configuration**: Enhanced debugging and reliability
  - Set `stats.children: true` to expose worker compilation errors
  - Added webpack ignore patterns for warnings
  - Reduced `parallelism: 1` for resource-constrained environments
- **Dockerfile**: Memory optimization for Docker Hub builds
  - Added `NODE_OPTIONS="--max-old-space-size=4096"` environment variable

### Testing
- All 1,933 unit tests passing (1,716 operation tests + 217 Node API tests)
- Local build: SUCCESS (webpack 5.103.0 compiled in 98s)
- Docker build: SUCCESS (285MB image created)
- MCP server: All 465 tools operational


## [1.4.3] - 2025-12-14

### Fixed
- **Dependencies**: Resolved critical npm install failure caused by incompatible overrides
  - Removed problematic `rimraf@>=5.0.0` override that broke `grunt-contrib-clean` (rimraf v5+ has incompatible API)
  - Removed `inflight@>=2.0.0` override (version 2.0.0 does not exist)
  - Removed `glob@>=10.0.0` override (was conflicting with transitive dependencies)
- **Dependencies**: Removed unused `@babel/polyfill` dependency (not imported anywhere in source code)
- **Dependencies**: Added `glob@^10.5.0` as direct devDependency (required by Gruntfile.js)
- **Node.js**: Package-lock regenerated with Node.js 22 for full compatibility

### Testing
- All 1,933 unit tests passing (1,716 operation tests + 217 Node API tests)
- CJS and ESM consumer tests passing
- npm install succeeds without errors on Node.js 22

## [1.4.2] - 2025-12-14

### Changed
- Replaced deprecated `loglevel-message-prefix` package with `@natlibfi/loglevel-message-prefix@^3.0.1`
- Updated all 5 worker files to use new logging package:
  - `src/core/ChefWorker.js`
  - `src/web/workers/DishWorker.mjs`
  - `src/web/workers/InputWorker.mjs`
  - `src/web/workers/LoaderWorker.js`
  - `src/web/workers/ZipWorker.mjs`

### Fixed
- **CI/CD**: Added browserslist database auto-update (`npx update-browserslist-db@latest`) to prevent outdated caniuse-lite warnings
  - Applied to `core-ci.yml` and `performance-benchmarks.yml` workflows
- **CI/CD**: Added git default branch configuration (`git config --global init.defaultBranch master`) to suppress Git 3.0 deprecation hints
  - Applied to all 5 workflow files (9 jobs total): `core-ci.yml`, `mcp-docker-build.yml`, `mcp-release.yml`, `performance-benchmarks.yml`, `security-scan.yml`

### Known Issues
- npm deprecation warnings remain for transitive dependencies that cannot be updated without breaking changes:
  - `bootstrap@4.6.2`, `bootstrap-colorpicker@3.4.0`, `popper.js@1.16.1` (web UI dependencies)
  - `glob@7.x/8.x`, `rimraf@2.7.1`, `inflight@1.0.6` (from grunt-contrib-clean and other build tools)
  - `@astronautlabs/amf@0.0.6` (node ^14 engine warning - informational only, package works on Node 22)

## [1.4.1] - 2025-12-14

### Security
- **Fixed 11 of 12 Code Scanning Vulnerabilities**: Comprehensive security hardening addressing ReDoS and cryptographic weaknesses
  - **CRITICAL**: Fixed insecure cryptographic randomness in `src/core/vendor/gost/gostRandom.mjs`
    - Replaced `Math.random()` with Node.js `crypto.randomBytes()` for cryptographic operations
    - Prevents predictable cryptographic key generation
    - Throws error if no secure RNG is available
  - **HIGH**: Fixed 7 Regular Expression Denial of Service (ReDoS) vulnerabilities across 6 operations
    - `src/core/operations/RAKE.mjs` (2 instances)
    - `src/core/operations/Filter.mjs`
    - `src/core/operations/FindReplace.mjs`
    - `src/core/operations/Register.mjs`
    - `src/core/operations/Subsection.mjs`
    - `src/core/operations/RegularExpression.mjs`
  - **LOW**: Documented 3 acceptable `Math.random()` usages in non-cryptographic contexts
    - `Numberwang.mjs` (trivia facts)
    - `RandomizeColourPalette.mjs` (color seeds)
    - `LoremIpsum.mjs` (placeholder text)
  - **DOCUMENTED**: Web UI code injection vulnerability (OutputWaiter.mjs) - Web UI only, not affecting MCP server

### Added
- **SafeRegex.mjs Security Module**: New centralized regex validation utility (`src/core/lib/SafeRegex.mjs`)
  - Pattern length validation (10,000 character maximum)
  - ReDoS pattern detection (nested quantifiers, overlapping alternations)
  - Timeout-based validation (100ms) to detect catastrophic backtracking
  - XRegExp and standard RegExp support
  - Exported functions: `validateRegexPattern()`, `createSafeRegExp()`, `createSafeXRegExp()`, `escapeRegex()`
- **GitHub Copilot Agent Support**: Added `.github/agents/copilot-instructions.md` to ensure GitHub Copilot Agents can discover and use custom instructions

### Changed
- **Regex operations**: All user-controlled regex patterns now validated through SafeRegex module
- **GOST cryptography**: Enhanced random number generation with secure fallback error handling

### Fixed
- **Security**: Eliminated ReDoS attack vectors preventing denial of service through malicious regex patterns
- **Security**: Cryptographic operations now use cryptographically secure random number generation exclusively

### Testing
- All 1,933 unit tests passing (1,716 operation tests + 217 Node API tests)
- ESLint validation passing
- Manual testing with known ReDoS patterns confirms proper rejection
- Cryptographic operations verified using secure RNG

## [1.4.0] - 2025-12-14

### Added
- **Performance Optimization Infrastructure**: Comprehensive performance improvements for handling large operations
  - LRU cache for operation results (100MB default, configurable)
  - Buffer pooling for memory optimization
  - Memory monitoring with periodic logging
  - Input size validation (100MB max default, configurable)
  - Operation timeout enforcement (30s default, configurable)
- **Streaming API**: Automatic streaming for large inputs (>10MB threshold)
  - Chunked processing for memory efficiency
  - Supports encoding, compression, and hashing operations
  - Transparent fallback for non-streaming operations
  - Configurable via `CYBERCHEF_STREAMING_THRESHOLD` environment variable
- **Resource Limits**: Configurable limits for stability and security
  - Max input size: `CYBERCHEF_MAX_INPUT_SIZE` (default: 100MB)
  - Operation timeout: `CYBERCHEF_OPERATION_TIMEOUT` (default: 30s)
  - Cache size: `CYBERCHEF_CACHE_MAX_SIZE` (default: 100MB)
  - Cache items: `CYBERCHEF_CACHE_MAX_ITEMS` (default: 1000)
- **Performance Benchmark Suite**: Comprehensive benchmarking infrastructure
  - Tinybench-based benchmark suite with 20+ operations across 6 categories
    - Encoding (Base64, Hex)
    - Hashing (MD5, SHA256, SHA512)
    - Compression (Gzip)
    - Cryptographic (AES Encrypt)
    - Text (Regular Expression)
    - Analysis (Entropy, Frequency Distribution)
  - Multiple input size testing (1KB, 10KB, 100KB)
  - New script: `npm run benchmark`
  - CI/CD integration via `performance-benchmarks.yml` workflow
  - Automated benchmark execution on code changes
- **Worker Thread Infrastructure**: Foundation for CPU-intensive operation offloading
  - Identification of 25+ CPU-intensive operations including:
    - Cryptographic: AES, DES, RSA, Bcrypt, Scrypt
    - Hashing: SHA family, MD5, BLAKE2, Whirlpool
    - Compression: Gzip, Bzip2
    - Key generation: RSA, PGP
  - Infrastructure for future worker pool implementation
  - Configurable via `CYBERCHEF_ENABLE_WORKERS` environment variable

### Changed
- **Version bump**: `1.3.0` → `1.4.0` in `package.json` (mcpVersion field) and `mcp-server.mjs`
- **Server startup**: Enhanced logging with performance configuration display
  - Shows max input size, timeout, streaming threshold, cache settings
  - Better visibility into server capabilities
- **Operation execution**: All operations now benefit from caching and resource limits
  - Cache hit logging for debugging
  - Streaming detection and activation logging
  - Memory usage monitoring

### Performance
- **Memory efficiency**: LRU cache reduces redundant computation for repeated operations
- **Large input handling**: 100MB+ inputs processed via streaming without OOM errors
- **Latency improvements**: Cached operations return instantly
- **Resource protection**: Timeouts prevent runaway operations

### Documentation
- **Release notes**: Comprehensive `docs/releases/v1.4.0.md` with configuration examples and migration guide
- **Performance tuning guide**: `docs/performance-tuning.md` with deployment scenarios and optimization strategies
- **Benchmark documentation**: Usage instructions and CI integration details
- **Environment variables**: Complete reference for all 7 configuration options
- **README.md**: New "Performance & Configuration" section with examples for different deployment scenarios
- **Updated version references**: All documentation updated from v1.3.0 to v1.4.0

### Dependencies
- **Added**: `tinybench@^4.1.0` for performance benchmarking

### Success Metrics
- ✅ Process 100MB inputs successfully via streaming
- ✅ Memory monitoring and cache management operational
- ✅ Operation timeout enforcement working
- ✅ Benchmark suite integrated into CI/CD
- ✅ All 465 MCP tools validated and functional

## [1.3.0] - 2025-12-14

### Added
- **Upstream Release Monitoring**: Automated GitHub Actions workflow to detect new CyberChef releases
  - Runs every 6 hours via cron schedule
  - Creates GitHub issues for new releases with actionable next steps
  - Prevents duplicate notifications
  - Workflow: `.github/workflows/upstream-monitor.yml`
- **Automated Upstream Sync**: Complete automation for merging upstream changes
  - Triggered by issue label (`upstream-sync-approved`) or manual dispatch
  - Automatic merge of upstream CyberChef changes
  - Regenerates `OperationConfig.json` with Grunt
  - Applies Node 22 compatibility patches
  - Runs comprehensive test suite validation
  - Updates baseline for regression detection
  - Creates pull request with detailed changeset
  - Handles merge conflicts with manual intervention guidance
  - Workflow: `.github/workflows/upstream-sync.yml`
- **MCP Validation Test Suite**: Comprehensive Vitest-based testing
  - 465 total tool validations (463 operations + 2 meta-tools)
  - Meta-tool functionality tests (cyberchef_bake, cyberchef_search)
  - 50+ sample operation execution tests
  - Schema validation for all operations
  - Breaking change detection via baseline comparison
  - Performance benchmarks (10 operations in <1 second)
  - Error handling validation
  - Test file: `tests/mcp/validation.test.mjs`
  - New script: `npm run test:mcp`
- **Tool Baseline Tracking**: Regression detection system
  - Complete inventory of 465 tools with metadata
  - Operation schemas and argument types
  - Version tracking for compatibility
  - Baseline file: `tests/mcp/baseline.json`
- **Emergency Rollback Mechanism**: Manual workflow for quick reversion
  - Rolls back to specified commit or parent
  - Regenerates configurations automatically
  - Runs full test suite for validation
  - Creates rollback PR with detailed summary
  - Workflow: `.github/workflows/rollback.yml`
- **Vitest Configuration**: Modern testing framework integration
  - Isolated MCP test execution
  - Node environment with ESM support
  - 10-second timeout for slow operations
  - Config file: `vitest.config.mjs`

### Changed
- **Version bump**: `1.2.6` → `1.3.0` in `package.json` (mcpVersion field) and `mcp-server.mjs`
- **Testing infrastructure**: Added Vitest alongside existing test framework
  - New devDependency: `vitest@^1.0.0`
  - Separate test suite prevents conflicts with existing tests

### Documentation
- **Release notes**: Comprehensive `docs/releases/v1.3.0.md` with usage examples
- **Workflow documentation**: Detailed usage instructions for all three workflows
- **Test documentation**: Coverage metrics and execution guidelines
- **Version references**: Updated across README.md, user_guide.md, SECURITY.md

### Success Metrics
- ✅ Zero manual intervention for patch/minor updates
- ✅ Automated PR creation within 24 hours of upstream release
- ✅ Comprehensive test validation (465 tools)
- ✅ Rollback capability tested and documented
- ✅ OperationConfig regeneration automated in CI

### Security
- All workflows follow GitHub Actions security best practices
- Environment variables used for all dynamic inputs
- No direct interpolation of user-controlled data
- Token permissions scoped to minimum required
- Input sanitization for workflow_dispatch parameters

## [1.2.6] - 2025-12-14

### Changed
- **Dockerfile** (web app): Optimized nginx base image for smaller footprint and improved security
  - Changed from `nginx:stable-alpine` to `nginx:1.29-alpine-slim`
  - `alpine-slim` variant provides reduced image size with minimal attack surface
  - Explicit nginx version pinning for reproducible builds
- **Dockerfile** (web app): Enhanced non-root permission setup for alpine-slim variant
  - Added explicit creation of nginx cache directories (`/var/cache/nginx/*`)
  - Added proper ownership for `/var/run` and `/run` directories
  - Fixed `permission denied` errors for nginx PID file and cache directories
  - Ensures proper non-root execution with nginx user in alpine-slim environment

### Fixed
- **nginx:alpine-slim compatibility**: Resolved permission denied errors for non-root nginx execution
  - Root cause: `alpine-slim` variant has stricter default permissions than standard `alpine`
  - Fixed cache directory permissions: `mkdir -p` for client_temp, proxy_temp, fastcgi_temp, uwsgi_temp, scgi_temp
  - Fixed PID file permissions: `chown -R nginx:nginx /var/run && chown -R nginx:nginx /run`

### Documentation
- Updated version references across all documentation files
- Added v1.2.6 to release notes index
- Updated download URLs and installation instructions

## [1.2.5] - 2025-12-14

### Security
- **Fixed 5 GitHub Security code scanning alerts**:
  - **DS026**: Added HEALTHCHECK to original `Dockerfile` (web app) for container orchestration
  - **DS002**: Added non-root user (nginx) execution to original `Dockerfile` (web app)
  - **CVE-2025-64756**: Updated npm in `Dockerfile.mcp` to fix glob command injection vulnerability (glob 10.4.5 → 10.5.0+)
  - **js/insufficient-password-hash** (x2): Dismissed as false positive - DeriveEVPKey intentionally implements OpenSSL EVP_BytesToKey for compatibility, NOT password storage. Users should use Argon2/bcrypt/scrypt operations for secure password hashing.
- **Argon2 operation hardened to OWASP 2024-2025 recommendations**:
  - Default type changed from Argon2i → **Argon2id** (hybrid side-channel + GPU resistance)
  - Default memory increased from 4 MiB → **19 MiB** (OWASP minimum recommendation)
  - Default iterations adjusted to **2** (OWASP recommended for 19 MiB memory)
  - Added OWASP recommendation note to operation description
  - Reference: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

### Changed
- **Dockerfile** (web app): Security hardening overhaul
  - Added OCI metadata labels
  - Added non-root user execution (nginx user)
  - Added HEALTHCHECK instruction for container orchestration
  - Added EXPOSE 80 declaration
  - **Upgraded Node.js 18 → Node.js 22** for build stage (crypto global + ES module support)
  - Added SlowBuffer compatibility patches for Node.js 22
- **Dockerfile.mcp**: Added npm update to fix bundled glob CVE-2025-64756
- **.dockerignore**: Expanded exclusions to prevent unnecessary files in MCP container
  - Excludes original `Dockerfile` to prevent Trivy alerts on web app Dockerfile in MCP container
  - Added IDE, test, and temporary file exclusions for smaller container image
- **babel.config.js**: Updated from `@babel/plugin-syntax-import-assertions` to `@babel/plugin-syntax-import-attributes`
  - Fixes ES2024 import attributes syntax (`with { type: "json" }`)
  - Enables proper Webpack parsing of JSON imports
- Version bump: `1.2.0` → `1.2.5` in `package.json`, `mcp-server.mjs`, and documentation

### Fixed
- **Docker Hub build failure**: Fixed `ReferenceError: crypto is not defined` during web app Dockerfile build
  - Root cause: Node.js 18 lacks global `crypto` object (added in Node.js 19+)
  - Solution: Upgraded builder stage from `node:18-alpine` to `node:22-alpine`
- **Webpack build failure**: Fixed `Module parse failed: Unexpected token` for JSON imports
  - Root cause: Babel's `@babel/plugin-syntax-import-assertions` doesn't support ES2024 `with` syntax
  - Solution: Switched to `@babel/plugin-syntax-import-attributes` with `deprecatedAssertSyntax` option

## [1.2.0] - 2025-12-14

### Security
- **Non-root container execution**: Container now runs as dedicated `cyberchef` user (UID 1001)
  - Prevents privilege escalation attacks
  - Reduces impact of container escape vulnerabilities
- **Automated vulnerability scanning**: Integrated Trivy for container and dependency scanning
  - Scans on every push, pull request, and release
  - Weekly scheduled scans for newly discovered CVEs
  - Results uploaded to GitHub Security tab (SARIF format)
- **SBOM generation**: Software Bill of Materials (CycloneDX format) generated for each release
  - Attached to GitHub releases for supply chain transparency
  - Enables dependency tracking and compliance
- **Read-only filesystem support**: Container compatible with `--read-only` flag
  - Enables immutable deployments
  - Reduces attack surface
- **Security policy**: Added comprehensive `SECURITY.md` with vulnerability reporting guidelines

### Added
- **New CI workflow**: `.github/workflows/security-scan.yml` for automated security scanning
  - Trivy container vulnerability scanning
  - Trivy filesystem/dependency scanning
  - npm audit results collection
  - SBOM generation as artifact
- **Container health check**: Built-in Docker HEALTHCHECK for orchestration
- **OCI metadata labels**: Standard container labels for documentation and provenance
- **Security documentation**: Enhanced user guide with security best practices section

### Changed
- **Dockerfile.mcp**: Complete security hardening overhaul
  - Added non-root user creation (cyberchef:cyberchef, UID/GID 1001)
  - Added OCI image labels for metadata
  - Added security comments and documentation
  - Removed unnecessary files from production image (tests, docs, config files)
  - Added HEALTHCHECK instruction
- **mcp-docker-build.yml**: Added Trivy scanning and non-root verification
- **mcp-release.yml**: Added SBOM generation and attachment to releases
  - Added automatic GitHub Release creation for version tags
  - Fixed Docker image tag handling for tarball export (uses `latest` tag)
- **README.md**: Updated security section with v1.2.0 hardening features
- **user_guide.md**: Added comprehensive security best practices section
- **CodeQL Action v3 → v4**: Migrated all workflows from deprecated CodeQL v3 to v4
  - `codeql.yml`: `init@v4` and `analyze@v4`
  - `security-scan.yml`: `upload-sarif@v4` (2 occurrences)
  - `mcp-docker-build.yml`: `upload-sarif@v4`
  - `mcp-release.yml`: `upload-sarif@v4`
- Updated all version references from v1.1.0 to v1.2.0

### Fixed
- **mcp-release.yml**: Fixed Docker image tag mismatch preventing release asset generation
  - `docker/metadata-action` generates tags without 'v' prefix (e.g., `1.2.0` not `v1.2.0`)
  - Changed to use `latest` tag for docker pull, save, and Trivy scans
- **mcp-release.yml**: Fixed missing GitHub Release creation before asset uploads
  - Workflow now automatically creates release if it doesn't exist
  - Uses `gh release create` with `--verify-tag` for safety

### Documentation
- **Comprehensive product roadmap v1.1.0 to v3.0.0** spanning 19 releases across 6 development phases
  - `docs/ROADMAP.md`: Master roadmap with Gantt timeline, release overview, and LTS strategy
  - 19 release plans (`docs/planning/release-v1.2.0.md` through `release-v3.0.0.md`)
  - 6 phase/sprint documents covering Q1 2026 through Q3 2027
- **Strategy documents** for major architectural initiatives:
  - `UPSTREAM-SYNC-STRATEGY.md`: Automated CyberChef update monitoring via Renovate/GitHub Actions
  - `SECURITY-HARDENING-PLAN.md`: Docker Hardened Images, non-root execution, Trivy scanning, SBOM
  - `MULTI-MODAL-STRATEGY.md`: Binary data, image, and audio handling through MCP protocol
  - `PLUGIN-ARCHITECTURE-DESIGN.md`: Custom operation registration with sandboxed execution
  - `ENTERPRISE-FEATURES-PLAN.md`: OAuth 2.1, RBAC, audit logging, multi-tenancy
- **Extended task tracker** with 500+ tasks organized by release (v1.2.0 - v3.0.0)
- New "Project Roadmap" section in README with phase overview table

## [1.1.0] - 2025-12-13

### Security
- **Fixed 11 vulnerabilities** (5 code scanning + 2 dependency + 4 npm audit fixes)
  - CWE-116: Incomplete string escaping in `Utils.mjs`, `PHPDeserialize.mjs`, and `JSONBeautify.mjs`
  - CWE-79: Cross-site scripting (XSS) in `BindingsWaiter.mjs`
  - CWE-916: Insufficient password hash iterations in `DeriveEVPKey.mjs` (now 10,000 minimum)
  - CVE-2024-55565: Removed `babel-plugin-transform-builtin-extend` (prototype pollution)
  - GHSA-64g7-mvw6-v9qj: Added `shelljs@>=0.8.5` override (command injection)
  - Updated `@modelcontextprotocol/sdk` to 1.24.3 (DNS rebinding fix)
  - Updated `@babel/helpers` and `@babel/runtime` to 7.28.4 (ReDoS fixes)
  - Updated `body-parser`, `brace-expansion`, `jws` via npm audit
- **Enhanced password hashing**: Increased DeriveEVPKey minimum iterations from 1,000 → 10,000 (NIST SP 800-63B compliance)
- **XSS protection**: Replaced `innerHTML` with safe DOM API methods (`textContent`, `createElement`)
- **String escaping**: Implemented proper two-step escaping pattern (backslashes first, then quotes)
- **Vulnerability reduction**: 76% overall (16 of 21 vulnerabilities fixed)
- **Production MCP server runtime**: Low Risk (5 remaining issues in dev dependencies only)

### Added
- **Docker image tarball distribution** for offline installation (approximately 270MB compressed)
  - Automated tarball export in `mcp-release.yml` workflow
  - Pre-built images available as release assets on GitHub Releases
  - Enables installation without GHCR access via `docker load`
- Node.js version badge to README
- Docker badge to README
- Claude Desktop client configuration section in README
- Comprehensive security section in README documenting 76% vulnerability reduction
- Enhanced documentation structure with categorized links (User, Technical, Project Management, Security)
- Testing section in README with npm test commands
- CI/CD workflow links and descriptions in README
- Repository information section with GHCR and issue tracker links
- Development workflow guidelines in Contributing section
- Option to pull pre-built Docker images from GHCR in Quick Start
- **Offline installation instructions** in README with tarball download steps
- Created `CLAUDE.md` project guidance file for Claude Code AI assistant
- Created `.github/SECURITY_MAINTENANCE.md` ongoing security procedures guide
- Created `.github/copilot-instructions.md` for GitHub Copilot
- Created `scripts/fix-serialize-javascript.js` automated patch for Node.js 22+ compatibility
- Added `mcpVersion` field to `package.json` (separate from CyberChef version)

### Changed
- Enhanced README with security highlights and production-ready status
- Improved README badges with more descriptive labels
- Updated Quick Start section to prioritize GHCR image over building from source
- Expanded Technical Highlights section with security and CI/CD information
- Reorganized Documentation section with clear categorization
- Enhanced Contributing section with detailed workflow and expectations
- Documentation reorganization:
  - Created `docs/planning/` directory (moved `to-dos/roadmap.md` and `to-dos/tasks.md`)
  - Created `docs/releases/` directory (moved `RELEASE_NOTES.md` → `docs/releases/v1.0.0.md`)
  - Created `docs/security/` directory (moved `SECURITY_AUDIT.md` → `docs/security/audit.md`)
- Updated all documentation references to reflect new paths
- Improved CHANGELOG.md formatting and organization
- Updated `.gitignore` to exclude Docker tarballs and CLAUDE.local.md

### Fixed
- README documentation links to reflect new directory structure (`docs/planning/`, `docs/security/`, `docs/releases/`)
- **Node.js 22 compatibility**: Fixed `serialize-javascript` compatibility with automated patch
- **Build process**: Corrected test expectations for DeriveEVPKey (10,000 iterations)
- **CI workflows**: All 5 GitHub Actions workflows verified passing
- JWT and JPath test failures (updated RSA keys to 2048 bits, fixed ES384/ES512 curves)

### Removed
- `babel-plugin-transform-builtin-extend` from dependencies (deprecated, security risk)
- `GEMINI.md` file (consolidated guidance into CLAUDE.md and copilot-instructions.md)

### Breaking Changes
- **DeriveEVPKey minimum iterations increased to 10,000** (NIST SP 800-63B compliance)
  - Users specifying `<10,000` iterations will receive secure minimum with warning
  - Update recipes using DeriveEVPKey with low iteration counts

## [1.0.0-post-security] - 2025-12-13

### Security
- **Fixed 7 vulnerabilities** (5 code scanning + 2 dependency)
  - CWE-116: Incomplete string escaping in `Utils.mjs`, `PHPDeserialize.mjs`, and `JSONBeautify.mjs`
  - CWE-79: Cross-site scripting (XSS) in `BindingsWaiter.mjs`
  - CWE-916: Insufficient password hash iterations in `DeriveEVPKey.mjs`
  - Prototype pollution in `babel-plugin-transform-builtin-extend`
  - Command injection in `shelljs` (via transitive dependency)
- **Enhanced password hashing**: Increased DeriveEVPKey default iterations from 1 → 10,000 (NIST SP 800-132 compliance)
- **Runtime enforcement**: Added minimum iteration count of 1,000 with validation and user warnings
- **XSS protection**: Replaced `innerHTML` with safe DOM API methods (`textContent`, `createElement`)
- **String escaping**: Implemented proper two-step escaping pattern (backslashes first, then quotes)
- **Dependency hardening**: Added npm overrides for `shelljs@>=0.8.5`

### Changed
- Documentation reorganization:
  - Created `docs/planning/` directory (moved `to-dos/roadmap.md` and `to-dos/tasks.md`)
  - Created `docs/releases/` directory (moved `RELEASE_NOTES.md` → `docs/releases/v1.0.0.md`)
  - Created `docs/security/` directory (moved `SECURITY_AUDIT.md` → `docs/security/audit.md`)
  - Removed `GEMINI.md` (consolidated into existing AI assistant instructions)
- Updated `CLAUDE.md` with new directory structure and documentation sections
- Updated all documentation references to reflect new paths

### Fixed
- **Node.js 22 compatibility**: Fixed `serialize-javascript` compatibility and updated test expectations
- **Build process**: Corrected test expectations for serialization output format
- **Dependency conflicts**: Resolved version mismatches and deprecated package usage

### Removed
- `babel-plugin-transform-builtin-extend` from dependencies (deprecated, security risk)
- `GEMINI.md` file (consolidated guidance)

## [1.0.0] - 2025-11-20

### Added - Major MCP Server Transformation
This release marks the transformation of the CyberChef repository into a fully functional Model Context Protocol (MCP) Server.

#### MCP Server Implementation
- New entry point `src/node/mcp-server.mjs` using `@modelcontextprotocol/sdk`
- Stdio transport support for CLI and IDE integration
- `cyberchef_bake` meta-tool for executing complex multi-stage recipes
- 300+ dynamically generated atomic operation tools (e.g., `cyberchef_aes_decrypt`, `cyberchef_to_base64`)
- `cyberchef_search` utility for operation discovery
- Zod-based schema validation for all tool inputs

#### Containerization
- `Dockerfile.mcp` based on `node:22-alpine`
- Automated CyberChef configuration generation in container build
- Optimized multi-stage build process
- SlowBuffer compatibility patches for Node.js 22+

#### CI/CD Pipelines
- `mcp-docker-build.yml`: Automated Docker container builds on every push
- `mcp-release.yml`: Automated GHCR publishing on version tags
- `core-ci.yml`: Maintains stability of underlying CyberChef logic
- `codeql.yml`: Automated security scanning
- `pull_requests.yml`: PR validation workflow

#### Documentation
- Complete README rewrite focused on MCP usage
- `docs/architecture.md`: Technical design documentation
- `docs/user_guide.md`: Installation and client configuration guide
- `docs/commands.md`: Comprehensive tool reference
- `docs/technical_implementation.md`: Implementation details
- `docs/project_summary.md`: Project overview
- `docs/releases/v1.0.0.md`: Release notes

### Changed
- Refactored all JSON imports to use modern `import ... with { type: "json" }` syntax (Node.js 22+)
- Patched `avsc` and `buffer-equal-constant-time` for SlowBuffer deprecation
- Updated core CI workflows to support Node.js v22
- Migrated from legacy CyberChef web app focus to MCP server focus

### Fixed
- Node.js v22 compatibility issues with deprecated APIs
- ES Module import syntax for JSON files
- SlowBuffer usage in legacy dependencies

---

## Original CyberChef History

<details>
    <summary>Click to expand version history of the original CyberChef Web App (up to v10.19.4)</summary>

### [10.19.0] - 2024-06-21
- Add support for ECDSA and DSA in 'Parse CSR' [@robinsandhu] | [#1828]
- Fix typos in SIGABA.mjs [@eltociear] | [#1834]

*(Previous history truncated for brevity - refer to the original repository for full history)*
</details>
