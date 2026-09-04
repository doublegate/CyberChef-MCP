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
| `node benchmarks/compare-runs.mjs <base> <head>` | Two runs measured on the **same** machine | **yes**, on PRs |

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

### Why the tolerance is 50%

Measured, not chosen — four times now, and the fourth measurement is the one that disproved the
third. The history is kept because the *shape* of the error repeats.

**A local study.** Four runs on an idle developer machine give a worst per-task spread of 9.8%.
(An earlier version reported up to 84% and would have justified a gate that could never fire: two
operations shared a task name, `SHA2` for both 256 and 512, and JIT warm-up inflated the first
bench of a cold process. Fixing the names and discarding the cold run moved the answer by an order
of magnitude.) That supported **25%**.

**CI disagreed.** Three runs on GitHub's shared runners produced deltas from −25.5% to +99.1% and
two false failures on a different task each time. Two cries of wolf in three runs is how a gate gets
switched off, so the tolerance went to **50%** — what a cross-machine baseline can honestly support.

**v3.4.0 moved the baseline onto the runner** and measured three captures from three instances:
worst spread between their medians 6.7%, and zero false failures simulating the gate over 180
comparisons at 20%, 15%, even 10%. That supported **20%**.

**CI disagreed again, within the hour.** Four runs on the release branch split two-pass/two-fail:

```text
To Hex (100KB)                  -41.8%
To Hex (10KB)                   -37.0%
Frequency distribution (100KB)  -29.2%
Entropy (100KB)                 -26.2%
Regular expression (1KB)        +28.2%   <- on the SAME run
Regular expression (10KB)       +24.0%
```

Both directions at once, on tasks no commit in that branch touched — `operation-benchmarks.mjs`
imports `bake` from `src/node/index.mjs`, and the generated bridge does not reach any module the
release changed. That is a different **host**: the memory-bandwidth-bound tasks collapsed while the
CPU-bound one improved.

The study's flaw was sampling rather than arithmetic. Three captures sixteen minutes apart landed
on one class of host — and the document said so while choosing 20% over the 10% its own data
allowed. Being aware of a bias is not being protected from it.

So **50%**, which covers the −41.8% actually observed. Full study and disproof:
[`../docs/internal/measurements/v3.4.0-runner-baseline.md`](../docs/internal/measurements/v3.4.0-runner-baseline.md).

**The number is not the lever worth pulling**, and v3.5.0 stopped pulling it. See below.

The missing-task check is unaffected and stays exact: a benchmark that disappears is a fact, not a
measurement.

## The same-host comparison (v3.5.0)

The tolerance argument above is really an argument about comparing across machines. v3.5.0 stopped
doing that.

v3.4.0 proposed **normalising against a calibration task**. v3.5.0 tested that proposal on the four
runs that motivated it, before building it, and it does not work: dividing out each run's median
leaves a residual spread of **-39.7%** and **-44.3%** against raw deltas of -38.6% and -42.1%. The
correction is worth about two percentage points, because the hosts differ in *profile* rather than
by a scale factor — memory-bound tasks collapse while a CPU-bound one improves on the same run, and
no single constant corrects two directions at once.

So the host is removed from the comparison instead of estimated. On a pull request,
`performance-benchmarks.yml` now benchmarks the **merge base** and the **head** in one job on one
runner and compares those two. Whatever that host is, both sides got it. First measurement, on a
branch whose benchmarked paths are unchanged:

```text
tasks compared: 30      median -0.2%      worst -5.5%      best +3.6%
```

against the cross-host range of -42% to +101%. Roughly tenfold tighter.

### It gates, since v3.6.0, at 25% per task

v3.5.0 shipped it reporting-only because the tolerance it justifies had not been measured. v3.6.0
measured both halves — and the second half is the one no previous attempt at this gate ever did.

**The noise floor.** Four same-host runs on v3.5.0's pull request, all on code that changes nothing
in the benchmarked path: worst slower `-2.2%`, `-1.7%`, `-6.9%`, `-7.6%`. Plus `-1.8%` from two runs
of identical code on a developer machine. So **-7.6% worst observed**.

**The detection curve.** A noise floor says what will *not* fire and nothing about what will — which
is how the previous two thresholds came to be quoted as if they caught everything. So `To Hex` was
given a deliberate, tunable slowdown (redoing a measured fraction of its own work, so the slowdown
carries the operation's real profile) and compared against the same worktree unmodified:

```text
nominal extra work    To Hex 100KB    worst UNTOUCHED task
              10%          -8.2%            -3.7%
              25%         -20.2%            -3.1%
              50%         -32.8%            -2.5%
```

It detects roughly linearly, and — the property that makes a *per-task* threshold meaningful — the
regression stays **localised**: every untouched task stays inside the noise floor at every
magnitude.

25% is 3.3x the worst observed noise, matching the 2.5-3x margin this project's precedent uses.

**What it catches, stated in both framings, because conflating them is how reach gets overstated:**

```text
the gate fires when a task is MORE THAN 25% SLOWER
in the experiment that took ~33% extra work
```

Verified by running the gate over the experiment's own fixtures: identical code passes, two runner
captures pass, 10% extra work passes (reported at -8.2%), **25% extra work passes** (reported at
-20.2%), 50% fails, and a task with no usable measurement fails because a broken run is not a clean
one.

**A quarter of the work added to an operation does not fail this build.** The full comparison prints
on every run, pass or fail, so the numbers below the threshold are readable. A pass is not proof
there is no regression.

Two limits worth knowing:

- `node_modules` is shared between the two checkouts, so the comparison is **skipped with a notice**
  when `package.json` or `package-lock.json` differs between base and head. Benchmarking the base
  against the head's dependency tree would measure neither commit.
- It exists only on pull requests. A push to `master` has no merge base, so the stored-baseline gate
  is the only check there.

Full detail: [`../docs/internal/measurements/v3.5.0-same-host-comparison.md`](../docs/internal/measurements/v3.5.0-same-host-comparison.md).

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
