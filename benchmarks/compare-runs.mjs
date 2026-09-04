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
 * WHY THE THRESHOLD IS 25%, AND WHAT IT DOES NOT CATCH
 * ----------------------------------------------------
 * v3.5.0 shipped this as reporting only, on the grounds that the tolerance a same-host comparison
 * justifies had not been measured. v3.6.0 measured it, in two halves -- and the second half is the
 * one no previous attempt at this gate ever did.
 *
 * THE NOISE FLOOR. Four same-host runs on v3.5.0's own pull request, all on code that changes
 * nothing in the benchmarked path:
 *
 *     worst slower  -2.2%   -1.7%   -6.9%   -7.6%
 *
 * plus -1.8% from two runs of identical code on a developer machine. So: **-7.6% worst observed**.
 *
 * THE DETECTION CURVE. A noise floor answers "what will not fire" and says nothing about "what
 * will", which is how the previous two thresholds came to be quoted as if they caught everything.
 * So `To Hex` was given a deliberate, tunable slowdown -- redoing a measured fraction of its own
 * work, so the slowdown carries the operation's real profile -- and compared against the same
 * worktree unmodified:
 *
 *     nominal extra work    To Hex 100KB    worst UNTOUCHED task
 *                   10%          -8.2%            -3.7%
 *                   25%         -20.2%            -3.1%
 *                   50%         -32.8%            -2.5%
 *
 * Two things follow. It detects roughly linearly; and the regression stays LOCALISED -- every
 * untouched task stays inside the noise floor at every magnitude, which is what makes a per-task
 * threshold meaningful rather than a suite-wide smear.
 *
 * 25% sits above the -7.6% floor by 3.3x, matching the 2.5-3x margin this project's precedent uses.
 *
 * SO WHAT DOES IT ACTUALLY CATCH. Stated in both framings, because the two are easy to conflate and
 * conflating them is how a gate's reach gets overstated:
 *
 *     the gate fires when a task is MORE THAN 25% SLOWER
 *     in the experiment that took ~33% extra work (interpolating -20.2% at 25% and -32.8% at 50%)
 *
 * Verified against the experiment's own data rather than asserted: 50% extra work FAILS, 25% extra
 * work PASSES and is reported at -20.2%, 10% PASSES and is reported at -8.2%.
 *
 * That is a narrower claim than the previous two thresholds made for themselves, and it is the
 * accurate one. **A quarter of the work added to an operation does not fail this build.** It is
 * printed with its number for a human to read, which is why the comparison is reported in full on
 * every run and not only on failure. A gate whose reach is overstated is how this project came to
 * cite, as evidence, gates that could not fail at all.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { readFileSync } from "node:fs";

/**
 * Per-task slowdown that fails the build, as a percentage.
 *
 * See the header for the measurement. Changing it means redoing that measurement, not adjusting a
 * number until CI is quiet -- which is what happened to the stored-baseline tolerance three times.
 */
const TOLERANCE_PCT = 25;

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
const unmeasured = [];

for (const [task, baseValue] of base) {
    if (!head.has(task)) {
        onlyBase.push(task);
        continue;
    }
    const headValue = head.get(task);
    // A zero base means the base run produced no measurement for the task -- a broken run, not a
    // 100% regression, so it must not be divided by. It is RECORDED rather than skipped: dropping
    // it silently shrinks what the comparison covers while the summary still says "30 tasks
    // compared", which is the shape of every "gate that quietly stopped checking" this project has
    // found.
    if (!baseValue || !headValue) {
        unmeasured.push({ task, base: baseValue, head: headValue });
        continue;
    }
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
// Split by direction rather than taking the ends of the sorted list. With every task regressing,
// the last element is still negative, and it was being printed as "worst faster: +-2.0%" and listed
// under "Largest speedups" -- a report that contradicts itself in exactly the run where it matters
// most.
const slower = rows.filter(row => row.deltaPct < 0);
const faster = rows.filter(row => row.deltaPct > 0).reverse();
const fmt = row =>
    `  ${row.task.padEnd(34)}${row.base.toFixed(1).padStart(10)} -> ${row.head.toFixed(1).padStart(10)}  ` +
    `${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct.toFixed(1)}%`;

process.stdout.write(
    "Same-host comparison: merge base vs head, one runner, one job\n\n" +
    `  tasks compared: ${rows.length}\n` +
    `  median delta:   ${median(deltas) >= 0 ? "+" : ""}${median(deltas).toFixed(1)}%\n` +
    `  worst slower:   ${slower.length ? `${slower[0].deltaPct.toFixed(1)}%  (${slower[0].task})` : "n/a"}\n` +
    `  worst faster:   ${faster.length ? `+${faster[0].deltaPct.toFixed(1)}%  (${faster[0].task})` : "n/a"}\n\n`);

// The five largest movements in each direction. The whole table is noise to read and the tails are
// where a regression would be.
const tail = 5;
if (slower.length) {
    process.stdout.write("Largest slowdowns:\n");
    for (const row of slower.slice(0, tail)) process.stdout.write(`${fmt(row)}\n`);
} else {
    process.stdout.write("Largest slowdowns: none -- no task was slower.\n");
}
if (faster.length) {
    process.stdout.write("\nLargest speedups:\n");
    for (const row of faster.slice(0, tail)) process.stdout.write(`${fmt(row)}\n`);
} else {
    process.stdout.write("\nLargest speedups: none -- no task was faster.\n");
}

if (onlyBase.length || onlyHead.length) {
    process.stdout.write("\nTasks present on one side only:\n");
    for (const task of onlyBase) process.stdout.write(`  base only: ${task}\n`);
    for (const task of onlyHead) process.stdout.write(`  head only: ${task}\n`);
}

if (unmeasured.length) {
    process.stdout.write(
        "\nTasks with no usable measurement, EXCLUDED from every figure above:\n");
    for (const entry of unmeasured) {
        process.stdout.write(`  ${entry.task}: base ${entry.base}, head ${entry.head}\n`);
    }
    process.stdout.write(
        "  A zero throughput is a broken run rather than a 100% change, so these cannot be\n" +
        "  divided. They are listed because silently dropping them would shrink what this\n" +
        "  compares while the count above still looked complete.\n");
}

// THE GATE. Per task, not on the median: a real regression is localised -- measured, see the
// header -- so a suite-wide statistic would dilute exactly the signal worth failing on.
const regressions = rows.filter(row => row.deltaPct < -TOLERANCE_PCT);

process.stdout.write(
    `\nBoth runs measured on the same machine, so host variance cancels rather than being estimated\n` +
    `and subtracted. Fails on any task slower by more than ${TOLERANCE_PCT}%.\n\n` +
    "Measured reach, stated precisely: the noise floor on unchanged code is -7.6% worst observed;\n" +
    "25% extra work in an operation reads at -20.2% and PASSES; 50% reads at -32.8% and fails. So\n" +
    "adding a quarter to an operation's work does NOT fail this build -- it is printed above with\n" +
    "its number. Read those numbers; a pass is not proof there is no regression.\n" +
    "See benchmarks/README.md.\n");

if (unmeasured.length) {
    // A task that could not be compared is not a task that passed. Failing here rather than
    // reporting it: silently shrinking coverage is the failure this project keeps finding, and a
    // benchmark that produced no measurement on one side is broken rather than unchanged.
    process.stdout.write(
        `\n${unmeasured.length} task(s) had no usable measurement. That is a broken run, not a\n` +
        "clean one -- investigate before trusting anything above.\n");
    process.exit(1);
}

if (regressions.length) {
    process.stdout.write(`\nREGRESSIONS (${regressions.length}), same host, vs the merge base:\n`);
    for (const row of regressions) process.stdout.write(`${fmt(row)}\n`);
    process.stdout.write(
        "\nBoth sides ran on the same machine in the same job, so this is not host variance -- that\n" +
        "is the whole point of comparing this way. If it is intentional, say so in the pull request.\n");
    process.exit(1);
}
