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
 * WHY THE TOLERANCE IS 50%, AND WHY 20% DID NOT SURVIVE
 * ------------------------------------------------------
 * It has been 25%, then 50%, then 20% for a few hours, and is 50% again. Each move followed a
 * measurement; the last one followed a measurement being WRONG, which is the useful part.
 *
 * 25% came from a LOCAL study: four runs on an idle developer machine, worst per-task spread 9.8%.
 * (An earlier version of that study reported spreads up to 84% and would have justified a useless
 * threshold -- two operations shared a task name, `SHA2` for both 256 and 512, plus JIT warm-up on
 * the first bench of a cold process. Fixing the names and discarding the cold run moved the answer
 * by an order of magnitude.)
 *
 * 50% came from discovering a local study cannot set a threshold for a gate that runs on GitHub's
 * shared runners against a baseline captured elsewhere: three CI runs produced deltas from -25.5%
 * to +99.1% and TWO false failures on different tasks each time.
 *
 * 20% came from v3.4.0 moving the baseline ONTO the runner and then measuring three captures from
 * three instances: worst spread between their medians 6.7%, and zero false failures simulating the
 * gate over 180 comparisons at 20%, 15%, even 10%.
 *
 * **CI disproved it within the hour.** Four runs on the release branch split two-pass/two-fail:
 *
 *     To Hex (100KB)                  -41.8%
 *     To Hex (10KB)                   -37.0%
 *     Frequency distribution (100KB)  -29.2%
 *     Entropy (100KB)                 -26.2%
 *     Regular expression (1KB)        +28.2%   <- on the SAME run
 *     Regular expression (10KB)       +24.0%
 *
 * Both directions at once, on tasks no commit in that branch touched -- this file's benchmark
 * imports `bake` from `src/node/index.mjs`, and the generated bridge does not reach any module the
 * release changed. It is a different HOST: the memory-bandwidth-bound tasks collapsed while the
 * CPU-bound one improved.
 *
 * The study's flaw was sampling, not arithmetic. Three captures sixteen minutes apart landed on one
 * class of host, and it even said so while choosing 20% over the 10% its data allowed -- being
 * aware of a bias is not being protected from it.
 *
 * So 50%, which covers the -41.8% actually observed. The number is not the interesting part any
 * more, and widening it further would not be either: the real fix is a median of several runs (the
 * baseline is a median of four and this compares ONE run against it) or normalising against a
 * calibration task, which targets host-class difference directly. Both are follow-ups with their
 * own validation, not something to bodge in here.
 *
 * The full study and its disproof: docs/internal/measurements/v3.4.0-runner-baseline.md.
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
