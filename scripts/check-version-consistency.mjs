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

const expected = JSON.parse(read("package.json")).version;
const expectedMajor = expected.split(".")[0];

/**
 * Every place the release version appears, and how to find it.
 *
 * Each entry yields zero or more occurrences. A location that yields NONE is itself a failure:
 * that means the pattern stopped matching, which is how a check quietly stops checking.
 *
 * An occurrence may carry its own `compare` value when what is being asserted is not the full
 * version -- the container package name carries only the major.
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
        // A SEPARATE, REQUIRED location, deliberately not folded into the one above.
        //
        // The repository name carries the major, and the tag alone cannot catch that:
        // `image.repository` and `image.tag` are two halves of one reference, and at v3.0.0 the
        // tag moved while the repository did not, resolving to `cyberchef-mcp_v2:3.0.0` -- an
        // image that will never be pushed, in the chart this project publishes. A green tag check
        // beside a stale repository is worse than no check, because it reads as verified.
        //
        // Folding it into the optional entry above would have reproduced that in a new way: the
        // two share one `optional`, so deleting the repository line would leave the tag matching
        // and the location silently unverified. `optional` is about a value the chart may legally
        // omit; the repository is not one.
        file: "deploy/helm/cyberchef-mcp/values.yaml",
        find: text => [...text.matchAll(/^\s*repository:.*cyberchef-mcp_v([0-9]+)/gm)]
            .map(m => ({ what: "image.repository major", value: `${m[1]}.x.x`,
                compare: `${expectedMajor}.x.x` }))
    },
    {
        // The MCP registry record. Not published from CI, which is exactly why it drifts: it sat
        // at 2.4.1 through six releases and nothing reported it, because nothing was looking.
        file: "server.json",
        find: text => {
            const doc = JSON.parse(text);
            return [
                { what: "version", value: doc.version ?? "(absent)" },
                ...(doc.packages ?? []).flatMap((pkg, i) => {
                    // An OCI identifier carries the major; an npm one does not, and both are
                    // legitimate entries here. Match on the registry rather than on whether the
                    // regex happened to fire -- deriving the occurrence FROM the match meant a
                    // malformed identifier produced no occurrence at all and passed silently,
                    // which is the same "stopped matching" failure this file exists to prevent.
                    const oci = pkg.registryType === "oci";
                    const major = /cyberchef-mcp_v([0-9]+)/.exec(pkg.identifier ?? "")?.[1];
                    return [
                        { what: `packages[${i}].version`, value: pkg.version ?? "(absent)" },
                        ...(oci ? [{
                            what: `packages[${i}].identifier major`,
                            value: major === undefined ?
                                `(no major in "${pkg.identifier ?? ""}")` : `${major}.x.x`,
                            compare: `${expectedMajor}.x.x`
                        }] : [])
                    ];
                })
            ];
        }
    },
    {
        file: "deploy/compose/docker-compose.yml",
        // Every image reference, including the ones inside the digest-pinning COMMENT. The prose
        // is the half that keeps getting missed, because a bump replaces the image line and not
        // the sentence above it.
        //
        // The package-name major is matched too, and checked. This pattern read `_v2` literally
        // until v3.0.0, which made it the same dated fuse as the npm-publish guard in
        // `mcp-release.yml`: `mcp-release.yml` publishes to `cyberchef-mcp_v${major}`, so at
        // v3.0.0 the compose file must move to `_v3` -- and a hardcoded `_v2` pattern would have
        // found ZERO references and, by the rule below, failed with "the pattern has stopped
        // matching" rather than naming the actual problem. A check that only works for the major
        // it was written in is a check with an expiry date.
        find: text => [...text.matchAll(/cyberchef-mcp_v([0-9]+):([0-9]+\.[0-9]+\.[0-9]+)/g)]
            .flatMap((m, i) => [
                { what: `image reference ${i + 1}`, value: m[2] },
                { what: `image reference ${i + 1} package major`, value: `${m[1]}.x.x`,
                    compare: `${expectedMajor}.x.x` }
            ])
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
    },
    {
        // The asset FILENAME, which is a separate occurrence from the URL above and was missed
        // by it: the download URL said v3.0.0 while the `docker load` line two steps later still
        // named the v2.10.0 tarball, so a reader following the instructions in order downloaded
        // one file and loaded another.
        file: "README.md",
        find: text => [...text.matchAll(/cyberchef-mcp-v([0-9]+\.[0-9]+\.[0-9]+)-docker-image\.tar\.gz/g)]
            .map((m, i) => ({ what: `release asset filename ${i + 1}`, value: m[1] }))
    }
];

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

    for (const { what, value, compare } of occurrences) {
        const want = compare ?? expected;
        // Marked from the comparison, not from having been visited. It previously read `ok` for
        // every occurrence including the failing ones, so a drifted file appeared twice -- once
        // as `ok  values.yaml (image.repository major): 2.x.x` and once as a FAIL for the same
        // line. A report that says `ok` next to a wrong value teaches the reader to skim it.
        checked.push(`${value === want ? "ok" : "BAD"}  ${location.file} (${what}): ${value}`);
        if (value !== want) {
            problems.push(`${location.file} (${what}): ${value}, expected ${want}`);
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
for (const line of checked) process.stdout.write(`  ${line}\n`);
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
