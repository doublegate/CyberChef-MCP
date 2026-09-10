# Phase 4 — Protocol adoption (v4.5.0 – v4.8.0)

Charters: [`v4.5.0`](../charters/v4.5.0.md), [`v4.6.0`](../charters/v4.6.0.md),
[`v4.7.0`](../charters/v4.7.0.md), [`v4.8.0`](../charters/v4.8.0.md).

**None of these may start until its trigger fires** — see
[`00-PHASE-0-TRIGGER-WATCH.md`](./00-PHASE-0-TRIGGER-WATCH.md). All four are currently *watching*.

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

| Charter | Do not start until |
|---|---|
| v4.5.0 result contracts | SEP-2419 `final`, or a result-envelope SEP in the draft changelog |
| v4.6.0 auth metadata | SEP-1488 `final`, or in the draft changelog |
| v4.7.0 progressive discovery | A SEP **number** exists **and** it is in the draft changelog |
| v4.8.0 audit context | SEP-2817 or SEP-3004 `final`, or in the draft changelog |

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
