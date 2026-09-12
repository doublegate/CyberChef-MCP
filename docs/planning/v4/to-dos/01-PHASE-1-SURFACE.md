# Phase 1 — The surface (v4.1.0–v4.2.0)

Charters: [`../charters/v4.1.0.md`](../charters/v4.1.0.md) and
[`../charters/v4.2.0.md`](../charters/v4.2.0.md). Both triggers have **fired**, both are local, and
neither waits on anything external. This is the phase that unblocks the tool programme.

> **Rewritten 2026-09-11.** The previous Phase 1 was the entry-point guard, which shipped as
> v3.10.0; it is archived at `../archive/v4.1.0-entry-point.md`.
>
> **v4.1.0 SHIPPED 2026-09-11.** Sprints 1.1-1.4 are done; 1.5 is v4.2.0 and remains open. Sprint
> 1.1 did not go as written: the ceiling it was to pin **does not exist**, and building the gate is
> what proved that (F-02). The index cannot cost more than `curated` by adding registry tools at any
> number, because they are listed on every surface and all three grow together. The gate was rebuilt
> on properties that can move -- the index lists no registry tool, `curated`/`all` list every one,
> and the index stays under 30 tools.
>
> **v4.2.0 SHIPPED 2026-09-12.** Sprint 1.5 is done, and it did not go as written either. The gate
> it was to build **already existed** — `tests/mcp/meta-tool-parity.test.mjs`, written in v3.7.0,
> asserting both directions — so the charter's "the dispatch table has never had its version" was
> false and the release opened by duplicating a check. That gate is syntactic, and the refactor this
> sprint asks for breaks it, so it is superseded and removed rather than patched. The "uniform" ten
> recipe branches were **eight**: `recipe_execute` guards input size and returns a string, and
> `recipe_export` was double-encoded by the table. Both keep their branches. See F-02 in
> `../../../internal/v4.2.0-findings-log.md`. **Phase 1 is now complete.**

---

## Sprint 1.1 — Prove the ceiling before removing it

The arithmetic is in the charter, but a sprint starts by re-measuring rather than trusting it.

- [x] Re-run `npm run measure:surfaces` and re-derive the split: navigation/meta bytes vs registry
      bytes. It was **14,305 / 30,663** on 2026-09-11. If it has moved, the charter's projections
      move with it.
- [x] Pin the ceiling as a **test**, not a note: assert that the index stays below `curated`. It is
      the claim `tool-catalog.mjs`'s header rests on, and today nothing checks it — the surface gate
      compares documents against the server, never the two presets against each other.
      Verify it fails by adding stub registry tools until it does.
- [x] Confirm the four navigation paths behave as measured — `search` finds, `describe_operation`
      refuses, `bake` refuses, `categories` omits. Six documents claim something stronger; the
      wording fix rides with this sprint.

## Sprint 1.2 — Give registry tools a schema path

- [x] `cyberchef_describe_operation` serves a registry tool's schema instead of erroring.
      `buildRegistry` and `ToolRegistry` are already imported at `mcp-server.mjs:56`; the Zod schema
      is already there; `toInputSchema` already converts it.
- [x] `cyberchef_categories` lists the analysis tools as a category, so the walk down reaches them.
- [x] Test through a **real client**, not by calling handlers — the v2.1.0 rule. Three releases
      shipped 524 tools with empty `inputSchema` while a green suite watched.

## Sprint 1.3 — Give them an invocation path

- [x] `cyberchef_analyse(tool, args)` dispatches to any registry tool.
- [x] Argument fidelity is the whole point: a call through the dispatcher must validate and behave
      **identically** to the direct call. Assert it for every registry tool, discovered from the
      registry rather than listed — `stdio-client-contract.test.mjs` already has the fixture table
      and the discovery that keeps it honest.
- [x] Errors keep their shape: `INVALID_INPUT` with the field, not a generic dispatcher error.

## Sprint 1.4 — Take them off the index, and only now

- [x] Registry tools leave `index`. **This is the irreversible step** — do not start it until 1.2
      and 1.3 are green, because between them and this the tools are neither listed nor reachable.
- [x] Re-measure all three surfaces. Update the canonical table and every live document in the same
      change; `tool-surface-figures.test.mjs` gates it against the running server.
- [x] Measure the dispatcher's own schema cost. `~15,905 bytes` **assumes** one dispatcher sized like
      an average registry tool. Assuming is what this project keeps writing findings logs about.

## Sprint 1.5 — One place to add a tool (v4.2.0)

- [x] One table: name, schema, handler. `META_TOOLS` (line 371) and the 23-branch dispatch chain
      derive from it rather than mirroring each other. **Eight of ten**, not all — see the banner.
- [x] The gate, verified in **both** directions: a declared tool with no handler, and a handler with
      no declaration. Both are silent today. The second direction was **circular** on the first
      attempt and only injecting the defect found it; `tests/mcp/dispatch-table.test.mjs` carries
      the rebuilt version and the reason.
- [x] Behaviour preserved, proven through a real client before and after. A tidier dispatch that
      answers differently is a regression with good intentions — and it was, twice, on the first
      attempt. Proven by two instruments kept in `docs/internal/measurements/`:
      `list-contract-snapshot.mjs` (the whole `tools/list` response, all three surfaces,
      byte-identical: 21,185 / 145,016 / 583,253 bytes) and `meta-tool-answers.mjs` (27 calls
      through a real client, byte-identical answers).
- [x] Record `mcp-server.mjs` coverage before and after — **82.2% of 394 statements** today. A
      consolidation that does not move it has probably moved complexity rather than removed it.
      Measured **85.40% of 418 → 85.75% of 393** statements and **68.04% → 70.56%** branches: 25
      fewer statements and 10 fewer branches to cover, with the covered count essentially flat.
      (The 82.2%/394 figure above was v4.0.0's; it had already moved before this sprint started.)

---

## Definition of done for the phase

```text
index surface          measured, documented, and below `curated` by a gated margin
registry tools         discoverable, describable, and callable without being listed
growth curve           flat -- adding a registry tool no longer grows the index
meta-tool dispatch     one table, gated in both directions
every claim            re-measured, not carried forward
```

## What this phase must not do

- **Change what any registry tool does.** The three-gap bar for admitting one is untouched.
- **Introduce a loader.** [ADR 0002](../../../adr/0002-tool-registry-is-not-a-plugin-loader.md) settled
  it on a measurement; a table of explicit imports is not a loader.
- **Ship 1.4 without 1.3.** Stated twice because it is the one ordering in this phase that is not a
  preference: it is the difference between progressive disclosure and a tool nobody can call.
