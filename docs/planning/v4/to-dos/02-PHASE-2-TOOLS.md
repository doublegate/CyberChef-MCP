# Phase 2 — The `ext-proj-int` programme (v4.2.0, v4.3.0)

Charters: [`v4.2.0`](../charters/v4.2.0.md), [`v4.3.0`](../charters/v4.3.0.md).

## Sprint 2.0 — Re-measure the backlog before picking anything

- [ ] Re-check the ext-proj-int candidate list against the **live 504**, not against its own notes.
      Four consecutive releases found a candidate an existing operation already covered.
- [ ] `npm run measure:surfaces`. Every registry tool grows the default index, and a registry tool
      cannot hide behind it — one that is not listed cannot be called at all.
- [ ] Record the headroom figure in the findings log **before** choosing scope.

## Per-tool checklist — repeat for each

- [ ] It fills one of the three gaps: a loop with a decision inside it, a statistic across inputs,
      or a cipher upstream lacks. If it is `run(input, args)` over one input, it is an operation.
- [ ] Contract: `export default {name, title, description, category, inputSchema (Zod), run,
      annotations}`. Name must **not** start with `cyberchef_`.
- [ ] Registered by explicit import in `src/node/tools/index.mjs` — **not** `src/node/index.mjs`,
      which is the generated operation bridge. No loader, no directory scan, no path from config.
- [ ] Licence recorded in `THIRD-PARTY-NOTICES.md` **in the same change** if anything is borrowed.
- [ ] The description says what the tool rests on and what it does **not** establish. `cert_chain`
      is the cautionary tale: it advertised a cryptographic guarantee it did not make.
- [ ] Documented in every inventory. `registry-tool-docs.test.mjs` discovers them, so a miss fails.
- [ ] Tests include an adversarial case, not only a happy path.

## Sprint 2.x — Close out each release

- [ ] Re-measure the surface tuple and update all ten live documents plus the canonical table.
- [ ] Full gates, findings log, release notes.

## Done when

The slice ships with every tool documented in every inventory and the surface figures re-measured
rather than carried forward.
