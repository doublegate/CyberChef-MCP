#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Regenerate `benchmarks/baseline.json` from several consecutive benchmark runs.
 *
 * SEVERAL runs, and the median of them, because one run is not a baseline. The first study behind
 * this file reported per-task spreads up to 84% and would have justified a tolerance so wide the
 * gate could never fire; that number was two operations sharing a task name plus JIT warm-up on
 * the first bench of a cold process. Four runs, medians, and the cold one discarded gave a worst
 * spread of 9.8%.
 *
 * The first run is deliberately thrown away for that reason -- it is systematically slower, and a
 * baseline built from it is a baseline every later run beats.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCH = resolve(HERE, "operation-benchmarks.mjs");
const OUT = resolve(HERE, "baseline.json");

const KEEP = 4;
const capturedFor = JSON.parse(readFileSync(resolve(HERE, "../package.json"), "utf8")).version;

/** @returns {number} The median of a numeric array. */
const median = xs => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const existingBaseline = JSON.parse(readFileSync(OUT, "utf8"));

const runs = [];
for (let i = 0; i <= KEEP; i++) {
    process.stderr.write(`run ${i + 1}/${KEEP + 1}${i === 0 ? " (discarded: cold)" : ""}\n`);
    const out = execFileSync(process.execPath, [BENCH, "--json"], {
        encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"]
    });
    if (i > 0) runs.push(JSON.parse(out));
}

const by = new Map();
for (const run of runs) {
    for (const r of run.results) {
        if (!by.has(r.task)) by.set(r.task, { suite: r.suite, values: [] });
        by.get(r.task).values.push(r.throughputMedian);
    }
}

// A task in the CURRENT baseline that no retained run produced would silently disappear from the
// gate -- and `check-regression.mjs` could then never report it missing, because it would no
// longer be in the baseline to miss. `operation-benchmarks.mjs` catches a Gzip timeout and
// completes without those results, so this is reachable rather than theoretical.
const previous = Object.keys(existingBaseline.tasks ?? {});
const dropped = previous.filter(t => !by.has(t));
if (dropped.length > 0 && !process.argv.includes("--allow-dropped")) {
    process.stderr.write(
        `\nRefusing to write a baseline that drops ${dropped.length} task(s):\n` +
        dropped.map(t => `  ${t}\n`).join("") +
        "\nA run that produced no result for these -- a timeout, a rename, a deletion -- would\n" +
        "quietly shrink what the gate protects. Re-run, or pass --allow-dropped if the removal\n" +
        "is intended, and say so in the commit message.\n");
    process.exit(1);
}

const tasks = {};
const spreads = [];
for (const task of [...by.keys()].sort()) {
    const { suite, values } = by.get(task);
    const spread = (Math.max(...values) - Math.min(...values)) / median(values) * 100;
    spreads.push(spread);
    tasks[task] = {
        suite,
        throughputMedian: Number(median(values).toFixed(1)),
        observedSpreadPct: Number(spread.toFixed(1))
    };
}

const worst = Math.max(...spreads);
const mid = median(spreads);
const existing = existingBaseline;

// WHERE THIS RAN, derived rather than asserted.
//
// The script used to carry `_machine` and `toleranceRationale` over from the previous file via
// `...existing`, so a baseline captured on a GitHub runner inherited the sentence "Captured on one
// developer machine" and the claim "CI variance is NOT yet measured". Both were false the moment
// `benchmark-baseline.yml` ran for the first time, and a provenance field that lies is worse than
// no provenance field: the whole point of the record is to say what the numbers can be compared to.
//
// `GITHUB_RUN_ID` rather than `CI`, because the run id is what makes the record actionable -- it
// names the run whose logs and artifacts hold the raw numbers.
const runId = process.env.GITHUB_RUN_ID;
const machine = runId ?
    `Captured on a GitHub Actions runner (${process.env.RUNNER_OS ?? "unknown OS"}/` +
    `${process.env.RUNNER_ARCH ?? "unknown arch"}), workflow run ${runId}. This is the machine ` +
    "class the regression gate executes on, so the comparison is like against like and the " +
    "cross-machine offset that limited earlier baselines does not apply." :
    "Captured on a developer machine, NOT on the runner the gate executes on. A regression " +
    "smaller than the cross-machine offset will not be caught on CI. Prefer a baseline from " +
    "`.github/workflows/benchmark-baseline.yml`.";

writeFileSync(OUT, `${JSON.stringify({
    ...existing,
    capturedFor,
    capturedAt: runs.at(-1).capturedAt,
    node: runs.at(-1).node,
    runs: runs.length,
    // Set when this ran on a runner, and REMOVED when it did not -- `...existing` above carries
    // the previous file's fields forward, so a local capture would otherwise keep the runner id of
    // the baseline it replaces while `_machine` says developer machine. The file would then claim
    // two different origins at once, which is the same defect as the inherited `_machine` text this
    // block was written to fix. Found in review on PR #118.
    capturedOnRunnerRunId: runId ?? undefined,
    _machine: machine,
    toleranceRationale:
        `Measured, not chosen. Across ${runs.length} runs on this machine the worst per-task ` +
        `spread was ${worst.toFixed(1)}% and the median was ${mid.toFixed(1)}%. The tolerance ` +
        `of ${existing.tolerancePct}% is set from the CROSS-INSTANCE study in ` +
        "docs/internal/measurements/v3.4.0-runner-baseline.md, not from this single capture -- " +
        "one machine's spread cannot tell you what a pool of machines does, which is the mistake " +
        "that produced two false failures and a 50% stopgap.",
    tasks
}, null, 2)}\n`);

process.stderr.write(
    `\nwrote ${OUT}\n  ${Object.keys(tasks).length} tasks, worst spread ` +
    `${worst.toFixed(1)}%, median ${mid.toFixed(1)}%\n` +
    "  commit the change WITH the reason it moved.\n");
