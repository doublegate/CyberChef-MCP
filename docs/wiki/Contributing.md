# Contributing

## Setting up

```bash
git clone https://github.com/doublegate/CyberChef-MCP.git
cd CyberChef-MCP
npm install
npx grunt configTests    # REQUIRED -- see Installation
```

Node **`>=24 <27`**. Package manager is **npm** — not pnpm, not bun.

## The gates

Everything here must pass before a pull request is ready. CI runs the same commands.

```bash
npm run lint            # ESLint via grunt -- zero errors
npm test                # core: 241 Node-API + 2,289 operation tests
npm run test:mcp        # MCP: 1,111 tests across 39 files (Vitest)
npm run test:coverage   # thresholds: 95 statements / 96 lines / 88 branches / 96 functions
npm run testnodeconsumer
```

Two suites, not interchangeable: the core tests are custom Node runners, the MCP tests are Vitest.

## Conventions

- **4-space indentation.** Upstream CyberChef style, not 2.
- **No prettier.** Formatting is enforced by ESLint.
- **Conventional Commits** — `feat(scope):`, `fix(scope):`, and so on.
- **JSON imports** use `with { type: "json" }`, not `assert`.
- Two lint rules interact awkwardly and are worth knowing before you fight them: `camelcase` with
  `properties: "always"` and `dot-notation` together make a snake_case property **unassignable**
  after an object exists. Build such objects as literals with quoted keys, or use `Object.assign`.

## The rule that matters most

**Never hand-edit anything under `src/core/`** or the six upstream-owned files in `src/node/`. Add a
patch under `patches/fork/` instead. See **[Fork & Upstream](Fork-and-Upstream)** for the incident
that made this a rule.

## Testing philosophy

**Test through a real MCP client, not hand-rolled JSON-RPC.** This is the project's most expensive
lesson. Every test before v2.1.0 spoke raw JSON-RPC or called handlers directly — and raw JSON-RPC
does no schema validation, so three releases shipped in which **every one of 524 tools carried an
empty `inputSchema`** while the suite stayed green. An official SDK client rejects that response
outright. `tests/mcp/stdio-client-contract.test.mjs` exists to close that gap.

**Pin a known answer before implementing.** For anything with a correct answer — a hash format, a
factorisation, a pattern offset — write the vector first and verify the implementation against it.
And **generate the vector or cite where it came from; never recall it.** A sha512crypt vector
written from memory during v2.4.0 was 84 characters where the format has 86, and the reflex on a
red test is to change the code rather than count the string.

**Ask what makes it confidently wrong.** Tests that cover what a tool is *for* miss the cases that
matter most. Three correctness bugs in v2.4.0 — a square modulus, a digest colliding with a
structural pattern, a fragment below the uniqueness window — all lived in inputs nobody had thought
to construct.

**Examples are executable.** `examples/` holds nine self-asserting scripts that CI runs.
Documentation that is not executed drifts.

## Pull requests

Several bots review automatically — CodeQL, Trivy, CodeRabbit, Copilot, and a self-hosted
Antigravity reviewer. **Reply to every review thread**, whether you adopt, reject or defer, and
verify each claim against the code before answering. In v2.4.0 two suggestions would have
introduced bugs if taken on trust, and several correct ones were nearly dismissed.

## Where decisions are recorded

- `docs/adr/` — architecture decisions, Nygard format
- `docs/internal/*-findings-log.md` — what was measured during each release, including what the
  plan got wrong. These are worth reading before changing anything they cover.
- `docs/releases/` — release notes
- `docs/planning/ROADMAP.md` — where things are going
