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

### Why the tolerance is 20%

Measured, not chosen — three times, because the measurement kept turning out to be of the wrong
thing. The history is kept because each step explains the next.

**First measurement, wrong by an order of magnitude.** It reported per-task spreads up to **84%**,
plausible enough to believe on a JIT-compiled workload and wide enough to justify a gate that could
never fire. Two causes: `SHA2` is registered twice, for 256 and for 512, and both emitted tasks
called `SHA2 (1KB)` — the "variance" was two operations taking turns in one slot; and the first
bench of a cold process absorbs JIT warm-up (`To Base64 (1KB)` measured 7,482 ops/s cold against
11,445–12,188 warm). With names disambiguated and the cold run discarded, four runs on an idle
developer machine give a worst per-task spread of **9.8%** and a median of **4.3%**. That supported
**25%**, which shipped first.

**Then CI disagreed.** Three runs on GitHub's shared runners produced deltas from **−25.5% to
+99.1%** and **two false failures**: `Entropy (100KB)` at −25.3%, then
`Frequency distribution (100KB)` at −25.5%, a different task each time with nothing in the diff
touching either. Two cries of wolf in three runs is how a gate gets switched off, so the tolerance
went to **50%** — what a cross-machine baseline can honestly support.

**Then the baseline moved to the runner (v3.4.0), and both false failures lost their cause.** They
were cross-machine artefacts, and the gate now compares like against like. What remains is the
runner pool's own variance, measured across three separate instances:

```text
between the three captured medians (30 tasks)   worst  6.7%   median 1.5%
within one capture (4 runs), pooled  (n = 90)   worst 15.2%   median 3.6%   1 of 90 above 15%
```

Simulated with each capture as the baseline and the other two as the run under test — 180
comparisons — there are **zero** false failures at 20%, at 15%, and even at 10%. Verified through
the real checker afterwards rather than a reimplementation: both other captures report
"No regression" against the committed baseline.

So **20%**, not the 10% the data would also support. Three instances over sixteen minutes is a
narrow sample of a pool that is not homogeneous and varies by day and region, and picking a
threshold from the sample it was measured on is a mistake this project has made twice. 20% is 3x
the worst observed cross-instance spread and clears the worst single-capture spread. Full study:
[`../docs/internal/measurements/v3.4.0-runner-baseline.md`](../docs/internal/measurements/v3.4.0-runner-baseline.md).

The missing-task check is unaffected and stays exact: a benchmark that disappears is a fact, not a
measurement.

### What the gate does not catch

**It used to be machine-relative, and that mattered more than the tolerance did.** Through v3.3.0
the baseline came from a developer machine while the gate ran on GitHub's runners, which measured
**27–99% faster** — a machine class, not noise. The consequence:

> a regression smaller than the cross-machine offset was not caught on CI.

If the runner is ~30% faster, code that got 25% slower still measures faster than baseline and
passes. That is fixed: the committed baseline is captured by
`.github/workflows/benchmark-baseline.yml`, and `_machine` in `baseline.json` says which machine it
came from — **derived** from `GITHUB_RUN_ID`, not asserted, because the previous version carried
"Captured on one developer machine" forward into a runner capture and was wrong the first time the
workflow ran. If you see that sentence in a committed baseline, the caveat above is live again.

**Longer-term runner drift is still uncharacterised.** Three captures sixteen minutes apart say
nothing about what the pool does across weeks. The workflow runs monthly; revisit the number after
a few cycles, on the evidence, rather than on the next release for its own sake.

**arm64 is unmeasured.** The published image is multi-arch and no benchmark has run on arm64
hardware. The v3.3.0 timings came from QEMU on an amd64 host and measure the emulator.

### Moving the baseline

Dispatch `.github/workflows/benchmark-baseline.yml` and merge the branch it pushes. It captures on
the runner the gate executes on, which is the whole point — a local capture is not comparable to
what CI measures, and it now says so in `_machine`.

`npm run benchmark:baseline` still works and is the right tool for investigating a change locally.
It produces a **developer-machine** baseline; committing one reintroduces the cross-machine gap
described above.

Either way, commit **with the reason it moved**. A baseline moved without a stated reason is a gate
switched off, and it looks identical to one moved for a good reason.

The workflow pushes a branch rather than opening the pull request itself. Actions is not permitted
to create pull requests on this repository, and the setting that would permit it also grants
Actions the right to *approve* them — a review bypass, in a workflow whose entire purpose is to keep
a gate's reference point under review. The safety property was never the PR; it is that this never
pushes to `master`.

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
