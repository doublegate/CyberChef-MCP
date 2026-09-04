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

import { readFileSync, readdirSync } from "node:fs";
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

// The operation COUNT, which is a derived number that appeared in prose and drifted. Three live
// documents said 505 where `OperationConfig` has 504, including the alert description an operator
// reads while diagnosing a restart loop. `check:versions` covered versions and package majors and
// nothing else, so nothing was looking.
//
// Read from the generated config rather than hardcoded: the number moves when upstream adds an
// operation, and a check that has to be edited on every sync is a check that gets edited wrongly.
// Absent before `grunt configTests` runs, so the count locations are skipped rather than failed --
// this script must stay runnable on a fresh clone.
/**
 * The phrasings that mean THE WHOLE OPERATION CATALOGUE.
 *
 * ONE definition, because there are two consumers -- the file discovery below and the check itself
 * -- and within a single edit they had already diverged: discovery kept two anchors while the check
 * gained a third, so `src/node/lib/node-api.mjs` was excluded from discovery and its two wrong
 * counts stayed invisible. Exactly the duplication this release adds a guard for elsewhere.
 *
 * `g` is deliberately absent here; a shared regex with `g` carries mutable `lastIndex` between
 * consumers and would make `.test()` alternate true/false on identical input.
 */
const CATALOGUE_COUNT = /(?:all|loads|exposes|importing) ([0-9]{3})[- ]operation|\b([0-9]{3})-operation \*?barrel/;

/**
 * Every text file in the repository that could carry a whole-catalogue operation count.
 *
 * Walked rather than listed. The previous version named four files and the claim lives in eleven,
 * so `check:versions` passed for two releases while seven locations were wrong.
 *
 * Excluded, and each for a reason rather than for convenience:
 *
 *   - `node_modules`, `.git`, generated output -- not this project's prose.
 *   - `docs/releases/**`, `docs/internal/**`, `CHANGELOG.md`, `docs/wiki/Release-History.md`,
 *     `docs/planning/future-releases/**` -- HISTORICAL RECORDS. They describe what was true at the
 *     time, including counts that have since changed, and correcting them would falsify the record.
 *     This is the same rule that keeps a release note immutable.
 *
 * `Release-History.md` moves from checked to excluded in v3.7.0. It was in the old four-file list
 * and it is a history document; it happened to be consistent, which is luck rather than design.
 *
 * @returns {string[]} Repository-relative paths.
 */
function discoverFiles() {
    const SKIP_DIRS = new Set([
        "node_modules", ".git", ".github/workflows/node_modules", "coverage", "test-results",
        "ref-proj", "src/vendor", "src/core/vendor"
    ]);
    // Historical records: what was true when written, and not to be rewritten.
    const SKIP_PREFIXES = [
        "docs/releases/", "docs/internal/", "docs/planning/future-releases/", "docs/planning/phases/"
    ];
    const SKIP_FILES = new Set([
        "CHANGELOG.md",
        "docs/wiki/Release-History.md",
        // Describes UPSTREAM's repository tree at v10.19.4, where the count genuinely was 463.
        // Not this fork's catalogue, and correcting it to 504 would make it wrong.
        "docs/reference/cyberchef-upstream.md",
        // This file's own comments quote example phrasings, including counts that are deliberately
        // not 504. A checker that fails on its own documentation is a checker nobody edits.
        "scripts/check-version-consistency.mjs"
    ]);
    const EXTENSIONS = [".md", ".mjs", ".js", ".json", ".yml", ".yaml"];

    const found = [];
    const walk = (dir) => {
        for (const entry of readdirSync(join(ROOT, dir || "."), { withFileTypes: true })) {
            const rel = dir ? `${dir}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name) || SKIP_DIRS.has(rel)) continue;
                walk(rel);
            } else if (EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
                if (SKIP_FILES.has(rel)) continue;
                if (SKIP_PREFIXES.some(prefix => rel.startsWith(prefix))) continue;
                found.push(rel);
            }
        }
    };
    walk("");
    // Only files that actually make the claim, so the report names locations rather than the tree.
    return found.filter(file => {
        try {
            return CATALOGUE_COUNT.test(read(file));
        } catch {
            return false;
        }
    });
}

let operationCount = null;
try {
    operationCount = Object.keys(JSON.parse(read("src/core/config/OperationConfig.json"))).length;
} catch (error) {
    // ONLY a missing file means "not generated yet". Swallowing every error would let a
    // malformed config -- a truncated write, a failed codegen -- silently disable all three
    // count checks while the gate reported success, which is the failure this file exists to
    // prevent one level up.
    if (error.code !== "ENOENT") throw error;
}

/**
 * Every reference to a Docker Hub image in a file, as `{namespace, tag}`.
 *
 * Three things this has to get right, and a plain `<ns>/cyberchef-mcp` gets all three wrong -- it
 * fired on an npm badge, the npm package page and a Unix socket path on the first run:
 *
 *   - **GHCR is excluded** by `(?![\w-])`. That package is `cyberchef-mcp_v3`, and an underscore
 *     is a word character, so the name never completes.
 *   - **A deeper URL path segment is not a namespace.** The lookbehind rejects a match whose
 *     namespace is itself preceded by `/`, which is what `.../npm/v/cyberchef-mcp`,
 *     `.../package/cyberchef-mcp` and `/run/cyberchef-mcp.sock` all are. Requiring a `:tag`
 *     instead would have been simpler and wrong: two of the live mentions are prose naming the
 *     image with no tag at all.
 *   - **Except the two registry prefixes**, which ARE followed by a real namespace. Listed
 *     explicitly rather than carved out of the lookbehind, so what they are is visible.
 *
 * The tag class includes `-`. Without it `:3.3.0-rc.1` captured as `3.3.0`, which then passed the
 * release-version comparison and reported **ok** for a document pointing at a release candidate --
 * a truncation that manufactures agreement rather than finding it.
 *
 * @param {string} text - File contents.
 * @returns {Array<{namespace: string, tag: string|undefined}>} Every occurrence, in order.
 */
const dockerHubRefs = (text) =>
    [...text.matchAll(
        /(?:hub\.docker\.com\/r\/|docker\.io\/|(?<![\w./-]))([a-z0-9][a-z0-9._-]*)\/cyberchef-mcp(?![\w-])(?::([\w][\w.-]*))?/g)]
        .map(m => ({ namespace: m[1], tag: m[2] }));

// The Docker Hub namespace, which no file in this repository derives and `package.json` does not
// carry: `mcp-release.yml` builds the image name from `${{ secrets.DOCKERHUB_USERNAME }}`, so a
// reader of the workflow cannot tell what the image is called, and neither can this script.
//
// `docs/registry/dockerhub-description.md` is the source because the release workflow PUSHES it to
// Docker Hub as that repository's description. It is the file most tightly bound to the real
// repository, which makes it the least arbitrary choice available.
//
// WHAT THIS DOES AND DOES NOT ESTABLISH, because the distinction is the whole value of the check.
// It establishes that every live document naming the image agrees, so changing one forces the
// rest. It CANNOT see the secret, so it cannot tell you the documents match the repository the
// workflow actually pushes to. That half is verified elsewhere and by construction: the release
// workflow's tarball step does `docker pull "$DOCKERHUB_REGISTRY/$DOCKERHUB_IMAGE_NAME:latest"`
// immediately after the push, so a failed or misdirected push fails the job.
//
// The gap this closes is real and was found the hard way: the namespace is `parobek` while the
// GitHub owner is `doublegate`, nothing in the tree connects the two, and assuming they matched
// produced a confident report that the Docker Hub publish was broken when it had never failed.
const DOCKERHUB_SOURCE = "docs/registry/dockerhub-description.md";
let dockerHubNamespace = null;
try {
    dockerHubNamespace = dockerHubRefs(read(DOCKERHUB_SOURCE))[0]?.namespace ?? null;
} catch (error) {
    // Committed, so a missing file is a real failure rather than "not generated yet". Reported
    // through the same machinery as everything else so it cannot pass quietly.
    if (error.code !== "ENOENT") throw error;
}

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
                    // An OCI identifier is a canonical reference -- `ghcr.io/owner/image:tag` --
                    // and the registry REQUIRES that form, rejecting a `registryBaseUrl` alongside
                    // it. So the tag carries the version and the entry has no `version` field:
                    // checking one that is legitimately absent would report a false failure.
                    // Instead the tag itself is asserted, which is a stronger claim than the major
                    // this used to check.
                    const tag = oci ? /:([^:/]+)$/.exec(pkg.identifier ?? "")?.[1] : undefined;
                    return [
                        ...(oci ? [] : [{ what: `packages[${i}].version`, value: pkg.version ?? "(absent)" }]),
                        ...(oci ? [{
                            what: `packages[${i}].identifier tag`,
                            value: tag ?? `(no tag in "${pkg.identifier ?? ""}")`
                        }, {
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
    ...(operationCount === null ? [] : [
        // One pattern per file rather than per phrasing. The first version of this matched three
        // hand-written phrases and missed five more occurrences in the same files, which review
        // found -- a check that covers some occurrences of a claim reads as covering the claim.
        //
        // v3.7.0: the same mistake, one level up. That fix left a hand-written list of FOUR files,
        // and the claim appears in eleven. `check:versions` reported every operation-count location
        // `ok` for two releases while seven live locations said 505 -- including a Grafana panel
        // description an operator reads. A check that covers four of eleven files reads exactly
        // like a check that covers the claim.
        //
        // So the files are DISCOVERED, not listed. A new document making the claim is covered the
        // day it is written, and the only way to escape the check is to be in the exclusion list
        // below -- which is short, explicit, and about history rather than convenience.
        ...discoverFiles().map(file => ({
            file,
            // Anchored on phrasings that mean THE WHOLE CATALOGUE. A bare `NNN operation`
            // matches "2,289 operation tests" and "100-operation" in an unrelated sentence, which
            // is worse than under-matching: a check that fires on the wrong claim gets deleted.
            //
            // A third anchor, `NNN operation implementations`, was added in v3.7.0 and REMOVED in
            // its review. It matched every one of the nine stale locations -- but it would have
            // made this gate demand that an IMPLEMENTATION count equal the CATALOGUE count, and
            // those are different numbers: the bridge imports 494 modules where `OperationConfig`
            // has 504. The gate would have enforced a figure that is not true and rejected the
            // accurate one. The phrase was removed from the prose instead, since those sentences
            // are about the COST of the eager import and the count was never load-bearing -- which
            // is precisely why a wrong one survived three releases.
            find: text => [...text.matchAll(new RegExp(CATALOGUE_COUNT, "g"))]
                .map((m, i) => ({ what: `operation count ${i + 1}`, value: m[1] ?? m[2],
                    compare: String(operationCount) }))
        }))
    ]),
    {
        file: "README.md",
        find: text => [...text.matchAll(/releases\/download\/v([0-9]+\.[0-9]+\.[0-9]+)\//g)]
            .map((m, i) => ({ what: `release asset URL ${i + 1}`, value: m[1] }))
    },
    ...(dockerHubNamespace === null ? [{
        // The source itself could not be read or no longer names an image. Reported as a location
        // rather than skipped: without it every entry below has nothing to compare against, and a
        // check whose expected value silently became `null` is the failure this file exists to
        // prevent.
        file: DOCKERHUB_SOURCE,
        find: () => []
    }] : [
        DOCKERHUB_SOURCE,
        "README.md",
        "AGENTS.md",
        "docs/guides/user_guide.md",
        "docs/wiki/Installation.md"
    ].map(file => ({
        file,
        // Required, not optional. These are where a reader looks for the pull command, and one of
        // them quietly ceasing to name the image is exactly the "stopped matching" case the rule
        // below is for -- the failure message tells the next person to update this list, which is
        // the correct outcome for a deliberate removal too.
        //
        // AGENTS.md is here because THIS CHANGE put the namespace in it, in the note explaining
        // that the two registries differ. Writing the name into a document and leaving it out of
        // the check is precisely the drift the check exists to stop, committed while adding it.
        //
        // CHANGELOG.md and the findings logs are excluded on purpose, and not only because they
        // are historical: the v2.6.0 entry deliberately names BOTH the right image and the wrong
        // one it was mistaken for, so including it would fail on text that is correct.
        find: (text) => dockerHubRefs(text).flatMap(({ namespace, tag }, i) => [
            { what: `Docker Hub namespace ${i + 1}`, value: namespace, compare: dockerHubNamespace },
            // A versioned reference gets its version checked too. Folded into the same occurrence
            // rather than given its own location, because every reference today is `:latest` and a
            // separate entry would match nothing and fail by the rule below -- a check that is
            // wrong until someone happens to add the thing it looks for.
            //
            // Exactly `X.Y.Z`, or `X.Y.Z-suffix`, and nothing else. `:latest`, `:3` and `:3.3` are
            // legitimate floating tags on this repository and are not release versions, so they
            // are not compared -- the same rule the compose-file entry above applies. A PRERELEASE
            // tag is compared and therefore fails, which is the point: `:3.3.0-rc.1` in a live
            // document is never right for a released one, and it used to be truncated to `3.3.0`
            // and reported ok.
            ...(tag && /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+].*)?$/.test(tag) ?
                [{ what: `Docker Hub tag ${i + 1}`, value: tag }] : [])
        ])
    }))),
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
