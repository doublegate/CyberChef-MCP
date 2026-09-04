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
 * WHY THE TOLERANCE IS 25% AND NOT SOMETHING TIGHTER
 * --------------------------------------------------
 * It was measured rather than chosen. Four consecutive runs on an idle machine gave a worst
 * per-task spread of 9.8% and a median of 4.3%; 25% is about 2.5x the worst of those. The first
 * attempt at this study reported spreads up to 84% and would have justified a useless threshold --
 * that was an artefact of two different operations sharing a task name (`SHA2`, registered for
 * both 256 and 512) plus JIT warm-up on the very first bench of a cold process. Fixing the names
 * and discarding the cold run changed the answer by an order of magnitude.
 *
 * A performance regression that matters is a factor, not a few percent. A gate tuned to catch a
 * few percent on a shared CI runner is a gate that gets disabled within two releases.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not fail on an IMPROVEMENT, and it does not silently accept one either: a task faster
 * than baseline by more than the tolerance is reported, because the usual cause is that the
 * benchmark stopped doing the work rather than that the code got faster.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(resolve(HERE, "baseline.json"), "utf8"));

const input = process.argv[2];
if (!input) {
    process.stderr.write(
        "usage: node benchmarks/check-regression.mjs <results.json>\n" +
        "  produce results with: npm run benchmark -- --json > results.json\n");
    process.exit(2);
}

const run = JSON.parse(readFileSync(input, "utf8"));
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
    process.stdout.write("Faster than baseline by more than the tolerance -- confirm the\n" +
        "benchmark still does the work before updating the baseline:\n");
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
