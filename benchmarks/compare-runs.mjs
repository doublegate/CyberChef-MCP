#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Compare two benchmark runs measured on the SAME machine.
 *
 * WHY THIS EXISTS
 * ---------------
 * `check-regression.mjs` compares a CI run against a stored baseline, and across GitHub's runner
 * pool that comparison is dominated by which host the job landed on rather than by the code. The
 * measurement is in `docs/internal/measurements/v3.4.0-runner-baseline.md` and it is not marginal:
 * across four runs the median throughput against one stored baseline ranged from -2.3% to
 * **+101.4%**, and on the two worst runs individual tasks moved -42% and +29% *simultaneously*.
 *
 * v3.4.0's findings log proposed normalising by a calibration task. v3.5.0 tested that proposal
 * against those same four runs before building it, and it does not work: dividing out each run's
 * median leaves a residual spread of -39.7% and -44.3% against raw deltas of -38.6% and -42.1%.
 * The correction is worth about two percentage points, because the hosts differ in *profile* and
 * not by a scale factor -- memory-bandwidth-bound tasks collapse while a CPU-bound one improves on
 * the same run, and no single constant corrects two directions at once.
 *
 * So this does not try to estimate the host and subtract it. It removes the host from the
 * comparison entirely: benchmark the merge base and the head **in one job, on one runner**, and
 * compare those. Whatever that host is, both sides got it.
 *
 * WHAT IT DOES NOT DO YET
 * -----------------------
 * It does not fail a build, and that is deliberate rather than timid. The tolerance a same-host
 * comparison justifies has **not been measured** -- v3.4.0 measured 15.2% worst-case across four
 * separate process runs on one instance, which is suggestive and is not the same experiment. Every
 * previous threshold in this project was set from thin evidence and moved within days; setting this
 * one before the data exists would be that mistake a fourth time.
 *
 * So it reports, the numbers accumulate in pull-request comments, and the threshold gets set from
 * them. `check-regression.mjs` remains the blocking gate in the meantime. When this becomes the
 * gate, say so here and in `benchmarks/README.md` together.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { readFileSync } from "node:fs";

const [basePath, headPath] = process.argv.slice(2);
if (!basePath || !headPath) {
    process.stdout.write(
        "usage: node benchmarks/compare-runs.mjs <base-results.json> <head-results.json>\n\n" +
        "Both files come from `node benchmarks/operation-benchmarks.mjs --json`, measured on the\n" +
        "same machine in the same job. Comparing runs from different machines is what this exists\n" +
        "to avoid.\n");
    process.exit(2);
}

/**
 * Read a results file into a task-to-throughput map.
 *
 * @param {string} path - The file.
 * @returns {Map<string, number>} Task name to median throughput.
 */
function readRun(path) {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return new Map(parsed.results.map(entry => [entry.task, entry.throughputMedian]));
}

const base = readRun(basePath);
const head = readRun(headPath);

const rows = [];
const onlyBase = [];
const onlyHead = [];

for (const [task, baseValue] of base) {
    if (!head.has(task)) {
        onlyBase.push(task);
        continue;
    }
    const headValue = head.get(task);
    // Guard the division rather than emit Infinity: a zero here means the base run produced no
    // measurement for the task, which is a broken run and not a 100% regression.
    if (!baseValue) continue;
    rows.push({ task, base: baseValue, head: headValue, deltaPct: (headValue / baseValue - 1) * 100 });
}
for (const task of head.keys()) if (!base.has(task)) onlyHead.push(task);

rows.sort((a, b) => a.deltaPct - b.deltaPct);

/** @returns {number} The median of a numeric array. */
function median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const deltas = rows.map(row => row.deltaPct);
const fmt = row =>
    `  ${row.task.padEnd(34)}${row.base.toFixed(1).padStart(10)} -> ${row.head.toFixed(1).padStart(10)}  ` +
    `${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct.toFixed(1)}%`;

process.stdout.write(
    "Same-host comparison: merge base vs head, one runner, one job\n\n" +
    `  tasks compared: ${rows.length}\n` +
    `  median delta:   ${median(deltas) >= 0 ? "+" : ""}${median(deltas).toFixed(1)}%\n` +
    `  worst slower:   ${deltas.length ? `${deltas[0].toFixed(1)}%  (${rows[0].task})` : "n/a"}\n` +
    `  worst faster:   ${deltas.length ? `+${deltas.at(-1).toFixed(1)}%  (${rows.at(-1).task})` : "n/a"}\n\n`);

// The five largest movements in each direction. The whole table is noise to read and the tails are
// where a regression would be.
const tail = 5;
if (rows.length) {
    process.stdout.write("Largest slowdowns:\n");
    for (const row of rows.slice(0, tail)) process.stdout.write(`${fmt(row)}\n`);
    process.stdout.write("\nLargest speedups:\n");
    for (const row of rows.slice(-tail).reverse()) process.stdout.write(`${fmt(row)}\n`);
}

if (onlyBase.length || onlyHead.length) {
    process.stdout.write("\nTasks present on one side only:\n");
    for (const task of onlyBase) process.stdout.write(`  base only: ${task}\n`);
    for (const task of onlyHead) process.stdout.write(`  head only: ${task}\n`);
}

process.stdout.write(
    "\nBoth runs measured on the same runner in the same job, so host variance cancels rather than\n" +
    "being estimated and subtracted. This does NOT fail the build: the tolerance a same-host\n" +
    "comparison justifies has not been measured yet, and setting one before the data exists is the\n" +
    "mistake that moved this project's threshold three times already. The numbers here are that\n" +
    "data. See benchmarks/README.md.\n");
