# Phase 1 — Foundation (v4.1.0)

Charter: [`../charters/v4.1.0.md`](../charters/v4.1.0.md). The one charter ready **now**: the defect
is measured, present, and independently confirmed by a reviewer.

## Sprint 1.1 — Establish the contract before changing it

- [ ] Pin the failing test first: import `src/node/mcp-server.mjs` in a test and assert **no server
      started** — no banner, no listening transport, no recipe manager holding a path. It must fail
      against today's code, or it is not testing anything.
- [ ] Inventory every caller that depends on the module-scope `runServer()`: `npm run mcp`, the
      Docker `CMD`, the `bin` entry, `examples/*`, and every documented quick-start.
- [ ] Record the count. Roughly forty documents name `docker run -i`; the exact figure decides how
      much of the doc sweep this release carries.

## Sprint 1.2 — The guard

- [ ] Add a main-module guard, or an exported `close()`, or both — a reviewer proposed the second
      and it is the better shape for tests.
- [ ] `npm run mcp` still serves stdio. Verify **through a real MCP client**, not by watching logs.
- [ ] The Docker image still serves stdio: build and run `docker run -i --rm`, then `tools/list`.
- [ ] The **era decision** still lives in `serveStdio` and both eras still negotiate. A bare
      `StdioServerTransport` plus `server.connect()` serves 2025 only — that regression is silent.

## Sprint 1.3 — Reclaim the workaround

- [ ] Restore teardown in `in-process-handlers`, `prompts-resources`, `rate-limit-dispatch`,
      `tenancy` — the four directories v3.9.0 deliberately leaks.
- [ ] Delete the leak comments and the F-13 cross-references they carry.
- [ ] Run the MCP suite **at CI concurrency**, not just locally. v3.9.0's race passed locally twice
      and failed on both Node versions in CI.

## Sprint 1.4 — Close out

- [ ] `npm run conformance` — both eras against the external oracle.
- [ ] Full gates; re-measure the test count and coverage tuple rather than carrying them forward.
- [ ] Findings log F-01 first, as always.

## Done when

The regression test from 1.1 passes, all four teardowns are restored, and `docker run -i` behaves
exactly as documented.
