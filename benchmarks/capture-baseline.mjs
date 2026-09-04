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
const existing = JSON.parse(readFileSync(OUT, "utf8"));

writeFileSync(OUT, `${JSON.stringify({
    ...existing,
    capturedFor,
    capturedAt: runs.at(-1).capturedAt,
    node: runs.at(-1).node,
    runs: runs.length,
    toleranceRationale:
        `Measured, not chosen. Across ${runs.length} runs the worst per-task spread was ` +
        `${worst.toFixed(1)}% and the median was ${mid.toFixed(1)}%, on an otherwise idle ` +
        `machine. ${existing.tolerancePct}% is roughly 2.5x the worst observed spread: wide ` +
        "enough that runner noise does not fail a build, narrow enough to catch the kind of " +
        "regression that matters, which is a factor rather than a few percent. CI variance is " +
        "NOT yet measured -- revisit once there are enough runs to characterise it.",
    tasks
}, null, 2)}\n`);

process.stderr.write(
    `\nwrote ${OUT}\n  ${Object.keys(tasks).length} tasks, worst spread ` +
    `${worst.toFixed(1)}%, median ${mid.toFixed(1)}%\n` +
    "  commit the change WITH the reason it moved.\n");
