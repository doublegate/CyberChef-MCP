# Phase 4 — Protocol adoption (v4.7.0 – v4.8.0)

> **Renumbered and merged 2026-09-11.** Four spec-dependent charters became two: result contracts
> (v4.7.0) and auth-metadata-plus-audit (v4.8.0). Progressive discovery left this phase entirely —
> the measurement said this project needs the mechanism regardless of whether the specification
> standardises one, so it is now [v4.1.0](../charters/v4.1.0.md) and first in the line.

Charters: [`v4.7.0`](../charters/v4.7.0.md) (result contracts),
[`v4.8.0`](../charters/v4.8.0.md) (auth metadata + audit context, merged).

**Neither may start until its trigger fires** — see
[`00-PHASE-0-TRIGGER-WATCH.md`](./00-PHASE-0-TRIGGER-WATCH.md). Both are currently *watching*.

## The gate every one of them passes through first

- [ ] **Read the SDK source, not its changelog.** Ritual step 2, and v3.0.0 is the worked example of
      skipping it: it planned to implement cache fields the SDK already filled and an error-code
      renumbering the SDK had already done, while missing the real defect, which was in this repo.
- [ ] **Search the ecosystem for the thing you are about to build, by name, on the registry.** Added
      after v3.1.0, because its absence let v3.0.0 ship a conformance release verified only by its
      own tests, four weeks after an official conformance suite covering those exact SEPs was
      published. Fifteen minutes against hand-building a suite.
- [ ] Run the **official conformance suite** with `--suite all`. `active` excludes the pending suite,
      which is where the scenarios validating this server's newest work sit.

## Per-charter entry conditions

| Charter | Watch | Do not start until |
|---|---|---|
| **v4.7.0** result contracts | T-4 | SEP-2145 reaches `final`, or SEP-2998 / SEP-3279 does, or a result-shape SEP appears in the draft changelog, or the SDK ships it — **read the source, not the changelog**. Note the correction: **SEP-2419 is `cache_hint`, not result contracts**, and this row named it wrongly until 2026-09-11 |
| **v4.8.0** auth metadata + audit | T-6, T-7 | SEP-1488, SEP-2817 **or** SEP-3004 reaches `final`, **and** the standard is expressible without recording tool arguments and without resolving authorization from arguments. Both audit SEPs are at `proposal` and SEP-2817 is still seeking a sponsor |

Progressive discovery **left this phase**: four SEP attempts are closed and the owning WG is
unformed (T-5), so this project builds the mechanism itself in [v4.1.0](../charters/v4.1.0.md)
rather than waiting on a standard that has not arrived in eighteen months of trying.

## Non-negotiables that survive any adoption

- [ ] **Tool arguments are never recorded** — not in metrics, spans, or audit. Here they are the
      sensitive material. An audit standard requiring otherwise is declined, publicly, with reasons.
- [ ] **Listing is never stricter than dispatch.** Hiding a tool a caller could invoke is
      misinformation, not caution.
- [ ] Tool names resolve against the real dispatch catalogue before becoming a label or attribute,
      with the 1024-name cap behind it as defence in depth — the cap alone is exhaustible.
- [ ] Presented-output behaviour stays pinned by `presented-output.test.mjs`, both directions.

## Done when

Each adopted SEP has a conformance scenario passing in the official suite, not only an in-tree test.
