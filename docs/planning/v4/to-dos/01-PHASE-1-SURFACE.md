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

- [ ] One table: name, schema, handler. `META_TOOLS` (line 371) and the 23-branch dispatch chain
      derive from it rather than mirroring each other.
- [ ] The gate, verified in **both** directions: a declared tool with no handler, and a handler with
      no declaration. Both are silent today.
- [ ] Behaviour preserved, proven through a real client before and after. A tidier dispatch that
      answers differently is a regression with good intentions.
- [ ] Record `mcp-server.mjs` coverage before and after — **82.2% of 394 statements** today. A
      consolidation that does not move it has probably moved complexity rather than removed it.

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
