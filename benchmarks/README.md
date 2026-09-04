# Benchmarks and measurement

Everything here reports **bytes** and **operations per second**, never tokens. No tokenizer has
ever been in this repository, every historical `~N tokens` figure was bytes divided by four, and
counting Claude tokens with a GPT tokenizer would swap one unvalidated proxy for another.

| Command | Measures | Gates? |
|---|---|---|
| `npm run benchmark` | Operation throughput, printed as tables | no |
| `npm run benchmark:json` | The same, machine-readable | no |
| `npm run benchmark:check` | Throughput against `baseline.json` | **yes**, in CI |
| `npm run benchmark:baseline` | Regenerates `baseline.json` from five runs | — |
| `npm run measure:surfaces` | `tools/list` payload per tool surface | no |
| `npm run measure:results` | Tool **result** payloads across representative cases | no |

## The regression gate

`performance-benchmarks.yml` used to say in its own PR comment that it *"cannot fail on a
regression"*, and it was right: the harness printed a table and discarded the numbers, so v2.6.0's
cold-start work and v2.8.0's image-size work were unprotected.

`check-regression.mjs` compares median throughput per task to `baseline.json` and fails on:

- a task slower than baseline by more than the tolerance;
- a baselined task **missing** from the run — renaming or deleting a benchmark otherwise shrinks
  what is protected without anyone noticing.

A task *faster* than the tolerance is reported and not failed, because the usual cause is a
benchmark that stopped doing the work.

### Why the tolerance is 25%

Measured, not chosen — and the first measurement was wrong by an order of magnitude, which is the
part worth knowing.

It reported per-task spreads up to **84%**, a number plausible enough to believe on a JIT-compiled
workload, and wide enough to justify a gate that could never fire. Two causes:

1. **A task-name collision.** `SHA2` is registered twice, for 256 and for 512, and both emitted
   tasks called `SHA2 (1KB)`. The 84% "variance" was two operations taking turns in one slot.
2. **JIT warm-up.** The first bench of a cold process absorbs it: `To Base64 (1KB)` measured 7,482
   ops/s cold against 11,445–12,188 warm.

With names disambiguated and the cold run discarded, four runs give a worst per-task spread of
**9.8%** and a median of **4.3%**. 25% is roughly 2.5x the worst observed: a regression that matters
is a factor, not a few percent, and a gate tuned to a few percent on a shared CI runner is a gate
that gets disabled within two releases.

### What the gate does not catch

**The baseline is machine-relative.** On its first green CI run the GitHub runner measured
**27–99% faster** than the machine the baseline came from — a machine-class difference, not noise.
So:

> a regression smaller than the cross-machine offset will not be caught on CI.

If the runner is ~30% faster, code that got 25% slower still measures faster than baseline and
passes. The gate catches **factor-level** regressions on CI, and tolerance-level ones only on the
machine the baseline came from. That is still strictly better than a check that said in its own
output it could not fail, but "gates" and "gates against what" are different claims.

The fix is a baseline captured on the runner, compared like against like — carried forward.

**CI variance is otherwise uncharacterised.** One green run is not a characterisation; it does show
the tolerance produced no false failure.

### Moving the baseline

`npm run benchmark:baseline`, then commit **with the reason it moved**. A baseline moved without a
stated reason is a gate switched off, and it looks identical to one moved for a good reason.

## Reading `measure:results` before proposing an efficiency change

This exists because v3.2.0's planned feature — a `response_format` enum across the high-volume
tools, on a published 65% reduction — did not survive contact with this catalogue:

```text
short transform                    55 bytes
describe one operation          3,115
list one category              18,057
search                         27,060      <- the only real target
large transform (64 KB in)     87,423      <- the payload IS the answer
```

The median result is ~3,000 bytes, so a format flag across 504 operation tools buys nothing. The
one outlier was `cyberchef_search`, and its problem was not verbosity in general: it returned the
full `OperationConfig` entry per match, which is *more* than `cyberchef_describe_operation` returns
for the same operations. It now summarises, at 3,087 bytes, with `detailed: true` restoring the old
payload.

Measure the shape before choosing the fix.
