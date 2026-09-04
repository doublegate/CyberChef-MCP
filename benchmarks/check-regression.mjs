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
 * WHY THE TOLERANCE IS 50%, AND WHY IT WAS 25% FOR ABOUT AN HOUR
 * --------------------------------------------------------------
 * Measured twice, in two places, and the second place is the one that set the number.
 *
 * Locally: four consecutive runs on an idle machine give a worst per-task spread of 9.8% and a
 * median of 4.3%. 25% is 2.5x the worst of those, and that is what shipped first. (An earlier
 * study reported spreads up to 84% and would have justified a useless threshold -- that was two
 * operations sharing a task name, `SHA2` registered for both 256 and 512, plus JIT warm-up on the
 * first bench of a cold process. Fixing the names and discarding the cold run moved the answer by
 * an order of magnitude.)
 *
 * On GitHub's shared runners: three runs against this baseline produced deltas from -25.5% to
 * +99.1% and **two false failures** -- `Entropy (100KB)` at -25.3%, then `Frequency distribution
 * (100KB)` at -25.5%, a different task each time with nothing in the diff touching either. Two
 * cries of wolf in three runs is how a gate gets disabled, and a disabled gate is what this whole
 * exercise replaced.
 *
 * So 50%, which is what a CROSS-MACHINE baseline can honestly support: it fires on factor-level
 * regressions and not on runner noise. A regression that matters is a factor, not a few percent.
 * The real fix is a baseline captured on the runner, or a median of several runs there -- both
 * carried forward, neither bodged in here.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not fail on an IMPROVEMENT, and it does not silently accept one either: a task faster
 * than baseline by more than the tolerance is reported, because one cause is that the benchmark
 * stopped doing the work rather than that the code got faster.
 *
 * THE BASELINE IS MACHINE-RELATIVE, AND THIS LIMITS WHAT THE GATE CATCHES
 * ----------------------------------------------------------------------
 * Measured on this gate's first green CI run: the GitHub runner is 27-99% FASTER than the machine
 * the baseline was captured on, across most tasks. That is a machine-class difference, not noise,
 * and it has a consequence worth stating rather than discovering later:
 *
 *     a regression smaller than the cross-machine offset will not be caught on CI.
 *
 * If CI runs ~30% faster than the baseline machine, code that got 25% slower still measures faster
 * than baseline and passes. The gate therefore catches FACTOR-level regressions on CI and
 * tolerance-level ones only where it is run on the machine the baseline came from.
 *
 * The fix is a baseline captured on the runner, compared like against like. That is a follow-up
 * with its own measurement, not something to bodge in here -- and until it exists, this comment is
 * the honest description of the gate's reach. See v3.2.0 findings log F-10.
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
