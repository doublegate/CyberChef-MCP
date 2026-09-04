# v3 planning

| File | What it is |
|---|---|
| `v3.0.0-plan.md` | The executable plan for the release being worked on |
| `RE-MEASURE.md` | **Mandatory** before any charter becomes a release |
| `charters/` | One page per candidate release: intent, candidate scope, kill criteria |

## Status, 2026-09-03

| Charter | State |
|---|---|
| `v3.1.0-evaluation-harness.md` | **Executed** as v3.1.0, re-scoped on measurement — its own kill criterion fired |
| `v3.2.0-result-efficiency.md` | **Executed** as v3.2.0. Track B whole; Track A re-aimed by measurement; Track C not started |
| `v3.3.0-external-tools.md` | Unscheduled |
| `v3.x-supply-chain.md` | **Absorbed** into v3.2.0 Track B; its trigger fired |
| `v4.0.0.md` | Unscheduled; determined by the spec |

## Why this is smaller than `../future-releases/`

That directory holds 19 release plans written mostly in December 2025, of which four carry
"Superseded" banners and most of the rest are wrong without saying so. Six consecutive releases
opened by measuring their plan and finding it empty or already built.

The conclusion is not that the plans were careless. It is that **a detailed plan for a release two
years out is a hypothesis written at the point of least information**. So here there is one deep
plan for the release actually being executed, and a page each for the rest, with the measurement
ritual as a gate between them.

`../future-releases/` and the rest of the v2-era corpus stay where they are, annotated. The
reasoning in them is often good; only the conclusions expired.
