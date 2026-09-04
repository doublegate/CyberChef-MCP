#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Compare a benchmark run against the committed baseline, and fail on a regression.
 *
 * WHY THIS EXISTS
 * ---------------
 * `performance-benchmarks.yml` said so in its own PR comment: *"this check cannot fail on a
 * regression."* Both benchmark steps carried `continue-on-error: true`, and the harness printed a
 * table and threw the numbers away -- so the cold-start work of v2.6.0 and the image-size work of
 * v2.8.0 were unprotected. A regression posted a number to a pull request and nothing stopped it
 * merging.
 *
 * WHY THE TOLERANCE IS 20%, AND WHAT IT WAS BEFORE
 * ------------------------------------------------
 * It has been 25%, then 50%, and is now 20%. The number moved every time the measurement did, and
 * the history is kept because each step explains the next.
 *
 * 25% came from a LOCAL study: four consecutive runs on an idle developer machine, worst per-task
 * spread 9.8%, median 4.3%. (An earlier version of that study reported spreads up to 84% and would
 * have justified a useless threshold -- that was two operations sharing a task name, `SHA2`
 * registered for both 256 and 512, plus JIT warm-up on the first bench of a cold process. Fixing
 * the names and discarding the cold run moved the answer by an order of magnitude.)
 *
 * 50% came from discovering that a local study cannot set a threshold for a gate that runs on
 * GitHub's shared runners against a baseline captured elsewhere. Three CI runs against that
 * baseline produced deltas from -25.5% to +99.1% and TWO false failures -- `Entropy (100KB)` at
 * -25.3%, then `Frequency distribution (100KB)` at -25.5%, a different task each time with nothing
 * in the diff touching either. Two cries of wolf in three runs is how a gate gets disabled.
 *
 * Both false failures were CROSS-MACHINE artefacts, and v3.4.0 removed their cause: the committed
 * baseline is now captured on the runner by `.github/workflows/benchmark-baseline.yml`, so the
 * gate compares like against like. The tolerance no longer has to absorb a machine-class
 * difference -- only the runner pool's own variance, which was measured across three separate
 * instances:
 *
 *     between the three captured medians    worst 6.7%    median 1.5%
 *     within one capture (4 runs), pooled   worst 15.2%   median 3.6%   1 of 90 above 15%
 *
 * Simulated with each capture as the baseline and the other two as the run under test: ZERO false
 * failures at 20%, at 15%, and even at 10%, across 180 comparisons.
 *
 * 20% is chosen rather than 10%, which the data would also support. Three instances over sixteen
 * minutes is a narrow sample of a pool that is not homogeneous and varies by day and region, and
 * picking a threshold from the sample it was measured on is a mistake this project has made twice
 * before. 20% is 3x the worst observed cross-instance spread and sits above the worst
 * single-capture spread, so a genuinely noisy instance still does not fail a build.
 *
 * The full study is in docs/internal/measurements/v3.4.0-runner-baseline.md.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not fail on an IMPROVEMENT, and it does not silently accept one either: a task faster
 * than baseline by more than the tolerance is reported, because one cause is that the benchmark
 * stopped doing the work rather than that the code got faster.
 *
 * THE BASELINE IS NO LONGER MACHINE-RELATIVE, AND THAT IS THE POINT
 * -----------------------------------------------------------------
 * Through v3.3.0 the committed baseline came from a developer machine, and the consequence was
 * measured rather than assumed: the GitHub runner ran 27-99% FASTER across most tasks. That is a
 * machine-class difference, not noise, and it had a consequence worth stating plainly --
 *
 *     a regression smaller than the cross-machine offset was not caught on CI.
 *
 * If CI runs ~30% faster than the baseline machine, code that got 25% slower still measures faster
 * than baseline and passes. The gate caught FACTOR-level regressions on CI and tolerance-level
 * ones only on the machine the baseline came from.
 *
 * Since v3.4.0 the baseline is captured on the runner, and `_machine` in baseline.json says which
 * -- derived from `GITHUB_RUN_ID` at capture time, not asserted, because the previous version
 * carried the sentence "Captured on one developer machine" over into a runner capture and was
 * therefore wrong the first time the workflow ran.
 *
 * A locally captured baseline is still possible and still says so in `_machine`. If you see that
 * text in a committed baseline, the cross-machine caveat above is live again.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(resolve(HERE, "baseline.json"), "utf8"));

const input = process.argv[2];
if (!input) {
    process.stderr.write(
        "usage: node benchmarks/check-regression.mjs <results.json>\n" +
        "       node benchmarks/check-regression.mjs --run   (runs the benchmark itself)\n");
    process.exit(2);
}

// `--run` executes the benchmark and keeps the JSON in memory. The npm script used to redirect
// into a fixed path under /tmp, which two concurrent runs would fight over -- and the redirect
// was itself the thing that broke this gate's first CI run, by capturing npm's banner. Removing
// the shell from between the measurement and the comparison removes both.
const run = input === "--run" ?
    JSON.parse(execFileSync(
        process.execPath, [resolve(HERE, "operation-benchmarks.mjs"), "--json"],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] })) :
    JSON.parse(readFileSync(input, "utf8"));
const observed = new Map(run.results.map(r => [r.task, r]));
const tolerance = baseline.tolerancePct / 100;

const regressions = [];
const improvements = [];
const missing = [];

for (const [task, base] of Object.entries(baseline.tasks)) {
    const now = observed.get(task);
    if (!now) {
        // A task in the baseline that the run did not produce is a failure, not a skip. Renaming
        // or deleting a benchmark silently shrinks what is protected, which is the same way a
        // consistency check stops checking.
        missing.push(task);
        continue;
    }
    const ratio = now.throughputMedian / base.throughputMedian;
    const deltaPct = (ratio - 1) * 100;
    const row = { task, base: base.throughputMedian, now: now.throughputMedian, deltaPct };
    if (ratio < 1 - tolerance) regressions.push(row);
    else if (ratio > 1 + tolerance) improvements.push(row);
}

const extra = run.results.map(r => r.task).filter(t => !(t in baseline.tasks));

const fmt = r =>
    `  ${r.task.padEnd(30)} ${r.base.toFixed(1).padStart(10)} -> ` +
    `${r.now.toFixed(1).padStart(10)}  ${r.deltaPct >= 0 ? "+" : ""}${r.deltaPct.toFixed(1)}%`;

process.stdout.write(
    `\nBenchmark regression check\n` +
    `  baseline: ${baseline.capturedFor} (${baseline.runs} runs, ${baseline.node})\n` +
    `  tolerance: ${baseline.tolerancePct}% on median throughput\n` +
    `  compared: ${Object.keys(baseline.tasks).length} tasks\n\n`);

if (improvements.length > 0) {
    process.stdout.write(
        `Faster than baseline by more than the tolerance (${improvements.length} of ` +
        `${Object.keys(baseline.tasks).length}). Two causes, and they look identical here:\n` +
        "  - a faster MACHINE than the one the baseline came from, which is the usual answer on\n" +
        "    CI and is not a finding;\n" +
        "  - a benchmark that stopped doing the work, which is.\n" +
        "Check the second before updating the baseline.\n");
    for (const r of improvements) process.stdout.write(`${fmt(r)}\n`);
    process.stdout.write("\n");
}
if (extra.length > 0) {
    process.stdout.write(`Not in the baseline (add them): ${extra.join(", ")}\n\n`);
}

if (missing.length === 0 && regressions.length === 0) {
    process.stdout.write("No regression.\n");
    process.exit(0);
}

if (missing.length > 0) {
    process.stdout.write(`Missing from the run (${missing.length}):\n`);
    for (const t of missing) process.stdout.write(`  ${t}\n`);
    process.stdout.write("\n");
}
if (regressions.length > 0) {
    process.stdout.write(`REGRESSIONS (${regressions.length}):\n`);
    for (const r of regressions) process.stdout.write(`${fmt(r)}\n`);
    process.stdout.write(
        "\nIf this is intended, regenerate the baseline with `npm run benchmark:baseline` and\n" +
        "say why in the commit message. A baseline moved without a reason is a gate switched off.\n");
}
process.exit(1);
