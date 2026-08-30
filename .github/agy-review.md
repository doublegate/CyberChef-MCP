# Review Style Guide — CyberChef-MCP

Project-specific rules for the Antigravity PR reviewer. CyberChef-MCP is a **fork of GCHQ
CyberChef** (`gchq/CyberChef`) that wraps the CyberChef Node.js API as an MCP server. Most
PRs in the current series belong to the **v2.0.0 release train** (see
`docs/planning/ROADMAP.md` and `docs/v2.0.0-breaking-changes.md`).

## Priorities (in order)

1. **Correctness of cryptographic and data-transformation output.** This is a security
   toolkit: a silently wrong decode, hash, or cipher result is worse than a crash.
2. **Security**: validate external input at boundaries; no secrets in code, logs, or error
   messages; prefer allowlists.
3. **Fork hygiene** — see below. This is the rule most reviewers miss.
4. Clear error handling: structured errors from `src/node/errors.mjs`, never a bare throw
   across the MCP boundary.
5. Tests accompany behaviour changes.

## Fork hygiene (project-specific, flag as BLOCKING)

- **Never hand-edit files under `src/core/`.** They are synced from upstream by
  `.github/workflows/upstream-sync.yml`. A local edit there is silently reverted on the next
  sync and permanently forks us from upstream. Fixes belong upstream, or in the MCP layer.
- **Never edit generated files**: `src/core/config/OperationConfig.json` and
  `src/node/index.mjs` are produced by `npx grunt configTests` and are gitignored.
- **Do not alter Apache-2.0 licence headers on upstream files.** The project is
  `GPL-3.0-or-later` as a combined work; upstream files keep their original headers.
- Ported code from a reference project (`ref-proj/*`) must carry an
  `SPDX-License-Identifier` and a provenance comment naming source project, file, and commit,
  plus a row in `THIRD-PARTY-NOTICES.md`.

## MCP-layer conventions

- Tool names: snake_case, **no `cyberchef_` prefix** as of v2.0.0 (DEP001). New external
  tools use `<category>_<operation>`; `preset_*` for the recipe corpus, `recipe_*` reserved
  for the v1.6.0 management tools.
- Tool arguments are named objects validated with Zod — never positional arrays (DEP005).
- `bake()` and `NodeRecipe.execute()` are **async** as of upstream v11.0.0. Flag any call
  site that uses the return value synchronously or calls `.then()` on it without awaiting.
- Anything long-running must respect the timeout/retry wrapper in `src/node/retry.mjs` and
  the worker-pool routing in `src/node/worker-pool.mjs`.
- HTTP transport is **per-session**: one `Server` + `StreamableHTTPServerTransport` pair per
  session ID. Sharing them across clients leaks cross-client data (GHSA-345p-7cg4-v4c7) —
  flag any reintroduction of a shared instance as BLOCKING.

## Conventions

- Conventional Commits (`feat|fix|docs|refactor|test|chore|perf|build|ci`).
- **4-space indentation** (upstream CyberChef style, not 2). CamelCase for objects and
  namespaces, camelCase for functions and variables.
- JSON imports use `with { type: "json" }`, never the deprecated `assert`.
- No emojis in code, comments, commits, or docs.
- Prefer vanilla JS; do not add a framework dependency without justification.
- Behaviour changes update `CHANGELOG.md` in the same PR.

## What to flag as BLOCKING

- Unvalidated external input reaching a sink (shell, filesystem, network, `eval`).
- Hardcoded credentials or tokens; secrets in error messages or logs.
- A hand-edit to `src/core/**` or to a generated file (see Fork hygiene).
- Breaking a public MCP tool name, argument shape, or recipe format without a
  `src/node/deprecation.mjs` entry and a `CHANGELOG.md` note.
- Silent failure paths: swallowed errors, ignored return values, an unawaited promise.
- A workflow interpolating untrusted `github.event.*` data directly into a `run:` block.
- Coverage dropping below the `vitest.config.mjs` thresholds (75% lines/statements,
  90% functions, 70% branches).

## What to keep as SUGGESTION / NITPICK

- Naming, structure, and readability.
- Missing tests for non-critical paths.
- Performance ideas without a measurement — profile before optimizing.
- Documentation phrasing, provided the facts are right.
