#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Assert that every place carrying the release version agrees with `package.json`.
 *
 * WHY THIS EXISTS
 * ---------------
 * A release touches the version in several files, and AGENTS.md has carried a checklist naming
 * them -- including the note "Missed at both v2.8.0 and v2.8.1 ... Two occurrences is a pattern,
 * not an accident."
 *
 * The note did not work. v2.9.0 missed **four** of them:
 *
 *     package.json                     2.9.0
 *     deploy/compose image line        2.8.1
 *     deploy/compose digest prose      2.8.1
 *     Chart.yaml appVersion            2.8.1
 *
 * So the published chart and compose file deployed the PREVIOUS release, and nothing reported it,
 * because nothing was checking. Three consecutive releases got this wrong while a document told
 * the author not to.
 *
 * A prose checklist cannot fail a build. This can, which is the entire point: the fix for a
 * recurring miss is a gate, not another sentence asking people to remember.
 *
 * WHAT IT DOES NOT CHECK
 * ----------------------
 * The chart's own `version` (as opposed to `appVersion`) is deliberately excluded. It is the
 * CHART's version, not the application's; Helm convention is that it moves when the templates
 * change, which is not on every application release. It is listed in the report as context so a
 * releaser can decide, and never fails the run.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Read a file from the repository root.
 *
 * @param {string} relative - Path relative to the repository root.
 * @returns {string} The file contents.
 */
function read(relative) {
    return readFileSync(join(ROOT, relative), "utf8");
}

/**
 * Every place the release version appears, and how to find it.
 *
 * Each entry yields zero or more occurrences. A location that yields NONE is itself a failure:
 * that means the pattern stopped matching, which is how a check quietly stops checking.
 */
const LOCATIONS = [
    {
        file: "package-lock.json",
        find: text => {
            const lock = JSON.parse(text);
            return [
                { what: "version", value: lock.version },
                { what: 'packages[""].version', value: lock.packages?.[""]?.version }
            ].filter(o => o.value !== undefined);
        }
    },
    {
        file: "deploy/helm/cyberchef-mcp/Chart.yaml",
        find: text => [...text.matchAll(/^appVersion:\s*"?([0-9]+\.[0-9]+\.[0-9]+)"?/gm)]
            .map(m => ({ what: "appVersion", value: m[1] }))
    },
    {
        file: "deploy/helm/cyberchef-mcp/values.yaml",
        find: text => [...text.matchAll(/^\s*tag:\s*"?([0-9]+\.[0-9]+\.[0-9]+)"?/gm)]
            .map(m => ({ what: "image.tag", value: m[1] })),
        // The chart defaults `tag` to the chart's appVersion, so an explicit tag is optional.
        optional: true
    },
    {
        file: "deploy/compose/docker-compose.yml",
        // Every image reference, including the ones inside the digest-pinning COMMENT. The prose
        // is the half that keeps getting missed, because a bump replaces the image line and not
        // the sentence above it.
        find: text => [...text.matchAll(/cyberchef-mcp_v2:([0-9]+\.[0-9]+\.[0-9]+)/g)]
            .map((m, i) => ({ what: `image reference ${i + 1}`, value: m[1] }))
    },
    {
        file: "README.md",
        find: text => [...text.matchAll(/\*\*Latest Release:\*\*\s*v([0-9]+\.[0-9]+\.[0-9]+)/g)]
            .map(m => ({ what: "Latest Release banner", value: m[1] }))
    },
    {
        file: "README.md",
        find: text => [...text.matchAll(/releases\/download\/v([0-9]+\.[0-9]+\.[0-9]+)\//g)]
            .map((m, i) => ({ what: `release asset URL ${i + 1}`, value: m[1] }))
    }
];

const expected = JSON.parse(read("package.json")).version;
const problems = [];
const checked = [];

for (const location of LOCATIONS) {
    let occurrences;
    try {
        occurrences = location.find(read(location.file));
    } catch (error) {
        problems.push(`${location.file}: could not be read or parsed -- ${error.message}`);
        continue;
    }

    if (occurrences.length === 0) {
        if (!location.optional) {
            // A pattern that matches nothing is not a pass. This is how a consistency check
            // silently stops checking: someone reformats a file, the regex stops matching, and the
            // gate goes green for a location it is no longer looking at.
            problems.push(
                `${location.file}: found no version reference at all -- the check's pattern has ` +
                `stopped matching, so this file is no longer being verified`);
        }
        continue;
    }

    for (const { what, value } of occurrences) {
        checked.push(`${location.file} (${what}): ${value}`);
        if (value !== expected) {
            problems.push(`${location.file} (${what}): ${value}, expected ${expected}`);
        }
    }
}

// Context only, never a failure. See the header for why the chart version is not the app version.
let chartVersion = "unknown";
try {
    chartVersion = (read("deploy/helm/cyberchef-mcp/Chart.yaml")
        .match(/^version:\s*"?([0-9]+\.[0-9]+\.[0-9]+)"?/m) ?? [])[1] ?? "unknown";
} catch { /* reported by the appVersion entry above */ }

process.stdout.write(`package.json version: ${expected}\n\n`);
for (const line of checked) process.stdout.write(`  ok  ${line}\n`);
process.stdout.write(`\n  --  Helm chart version (not checked, moves with the templates): ${chartVersion}\n`);

if (problems.length > 0) {
    process.stdout.write(`\n${problems.length} problem(s):\n\n`);
    for (const p of problems) process.stdout.write(`  FAIL  ${p}\n`);
    process.stdout.write(
        "\nEvery location above must carry the version in package.json. See the release section " +
        "of AGENTS.md.\n");
    process.exit(1);
}

process.stdout.write("\nAll version references agree.\n");
