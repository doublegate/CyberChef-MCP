#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Bump the release version, by editing the fields that hold it.
 *
 * WHY THIS EXISTS
 * ---------------
 * Because the obvious way is wrong, and it was wrong twice before anyone noticed.
 *
 * A release bump used to be `replace(oldVersion, newVersion)` over each file that carries the
 * version. That is fine for `"version": "3.5.0"` and silently destructive everywhere a version
 * string appears in PROSE. `server.json` carries a long `_comment` recording what went wrong in
 * which release, and the blanket replace rewrote it:
 *
 *     v3.4.0 wrote   "Measured in v3.4.0: six validation errors ..."
 *     v3.5.0's bump  -> "Measured in v3.5.0: ..."
 *     v3.6.0's bump  -> "Measured in v3.6.0: ..."
 *
 * A dated claim drifted two whole releases, and `npm run check:versions` reported the file correct
 * throughout -- correctly, because it checks version FIELDS and prose is not one. It was caught by a
 * reviewer reading the sentence, which is not a mechanism.
 *
 * The same hazard is why `deploy/compose/docker-compose.yml`'s digest-pinning comment was missed at
 * v2.8.0, v2.8.1 and v2.9.0 -- there the prose needed to move and did not; here it must NOT move and
 * did. Both come from treating a file as a bag of strings rather than as a document with fields.
 *
 * So: fields by name, everywhere the format allows it. The two files with no field structure --
 * compose and the README -- get anchored patterns that match a version only where a version belongs,
 * and every pattern must match or this fails. A bump that quietly matches nothing is how a location
 * drops out of the release process.
 *
 * `npm run check:versions` remains the gate; this is the tool that makes it pass honestly.
 *
 * Usage: node scripts/bump-version.mjs <new-version>
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const next = process.argv[2];

if (!next || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(next)) {
    process.stdout.write(
        "usage: node scripts/bump-version.mjs <new-version>\n\n" +
        "  e.g. node scripts/bump-version.mjs 3.7.0\n\n" +
        "Edits the version FIELDS. Never does a blanket string replace: prose in this repository\n" +
        "records which release found what, and a blanket replace rewrites that history.\n");
    process.exit(2);
}

const read = file => readFileSync(join(ROOT, file), "utf8");
const write = (file, text) => writeFileSync(join(ROOT, file), text);
const changes = [];

/** @returns {string} JSON with this repository's formatting: two spaces, trailing newline. */
const stringify = value => `${JSON.stringify(value, null, 2)}\n`;

// package.json -- the single source at runtime.
{
    const pkg = JSON.parse(read("package.json"));
    changes.push(["package.json", "version", pkg.version, next]);
    pkg.version = next;
    write("package.json", stringify(pkg));
}

// server.json -- `version`, the npm package's `version`, and the TAG inside the OCI identifier.
// The identifier is a canonical reference, so its tag is the version; the rest of the string, and
// the whole `_comment`, must not be touched.
{
    const doc = JSON.parse(read("server.json"));
    changes.push(["server.json", "version", doc.version, next]);
    doc.version = next;
    for (const [i, pkg] of (doc.packages ?? []).entries()) {
        if (pkg.registryType === "oci" && typeof pkg.identifier === "string") {
            const bumped = pkg.identifier.replace(/:[^:/]+$/, `:${next}`);
            changes.push([`server.json packages[${i}]`, "identifier tag", pkg.identifier, bumped]);
            pkg.identifier = bumped;
        } else if (pkg.version !== undefined) {
            changes.push([`server.json packages[${i}]`, "version", pkg.version, next]);
            pkg.version = next;
        }
    }
    write("server.json", stringify(doc));
}

/**
 * Replace every match of an anchored pattern, and fail if it matches nothing.
 *
 * A pattern that has stopped matching is how a location silently drops out of the release process --
 * the same failure `check-version-consistency.mjs` exists to catch, arriving one step earlier.
 *
 * The expected count is REQUIRED, and it is the mechanism this script most needed. Its first run
 * matched a version-shaped string 34 times where 1 was meant and rewrote 32 historical release links
 * in the README -- reporting "(34)" as though a big number were a good sign. Too FEW matches means a
 * location has dropped out of the release; too MANY means the pattern is eating something it should
 * not. Both are failures and neither is visible without saying up front what was expected.
 *
 * @param {string} file - Repository-relative path.
 * @param {string} what - Human label for the report.
 * @param {number} expected - Exactly how many matches there should be.
 * @param {RegExp} pattern - Must contain one capture group around the version.
 */
function replaceAnchored(file, what, expected, pattern) {
    const before = read(file);
    let count = 0;
    const after = before.replace(pattern, (match, version) => {
        count += 1;
        return match.replace(version, next);
    });
    if (count !== expected) {
        process.stdout.write(
            `\nFAIL  ${file}: the pattern for "${what}" matched ${count} time(s), expected ${expected}.\n` +
            (count < expected ?
                "      Too few: a location has dropped out of the release process silently.\n" :
                "      Too many: the pattern is matching something that is not a version field.\n" +
                "      That is how 32 historical release links in the README were once rewritten.\n") +
            "      Fix the pattern or the count here; do not edit the file by hand.\n");
        process.exit(1);
    }
    changes.push([file, `${what} (${count})`, "", next]);
    write(file, after);
}

// Helm: appVersion is the application; the chart's own `version` moves separately and by hand,
// because it tracks the chart rather than the app -- see AGENTS.md.
replaceAnchored("deploy/helm/cyberchef-mcp/Chart.yaml", "appVersion", 1,
    /^appVersion:\s*"(\d+\.\d+\.\d+[\w.-]*)"/gm);
replaceAnchored("deploy/helm/cyberchef-mcp/values.yaml", "image.tag", 1,
    /^\s*tag:\s*"(\d+\.\d+\.\d+[\w.-]*)"/gm);
// The digest-pinning COMMENT in values.yaml names the tag an operator should inspect. It is prose
// that must move, unlike server.json's history -- which is why patterns beat both blanket replace
// and blanket caution.
replaceAnchored("deploy/helm/cyberchef-mcp/values.yaml", "digest example", 1,
    /cyberchef-mcp_v\d+:(\d+\.\d+\.\d+[\w.-]*)/g);

// Compose: every image reference including the ones inside the digest-pinning comment, which were
// missed at v2.8.0, v2.8.1 and v2.9.0.
replaceAnchored("deploy/compose/docker-compose.yml", "image references and digest prose", 3,
    /cyberchef-mcp_v\d+:(\d+\.\d+\.\d+[\w.-]*)/g);

// README. Anchored HARD, and the reason is a mistake this script made on its first run.
//
// The banner's version and its release-notes link are bumped TOGETHER, matched as one string on one
// line. The first version of this matched `docs/releases/vX.Y.Z.md` on its own -- and the README
// links to **32 historical release notes**, so a single run rewrote every one of them to point at
// the new version. It destroyed the changelog section of the README while reporting
// "release-notes link (34)" as though that were a success.
//
// That is precisely the failure this whole script exists to prevent -- a version-shaped string is
// not a version field -- committed by the fix for it. A count of 34 where 1 was meant is exactly the
// signal `replaceAnchored` could have caught, which is why it now reports counts loudly enough to
// notice and why the patterns below are anchored to their surrounding text rather than to the shape
// of a version.
replaceAnchored("README.md", "latest-release banner and its link", 1,
    /\*\*Latest Release:\*\* v(\d+\.\d+\.\d+[\w.-]*) \| \[Release Notes\]\(docs\/releases\/v\d+\.\d+\.\d+[\w.-]*\.md\)/g);
// The banner's link needs the same new version in its second half; done as a second pass over the
// already-bumped banner line so that the pattern above stays one unambiguous anchor.
{
    const before = read("README.md");
    const after = before.replace(
        /(\*\*Latest Release:\*\* v[\d.\w-]+ \| \[Release Notes\]\(docs\/releases\/v)(\d+\.\d+\.\d+[\w.-]*)(\.md\))/g,
        (match, head, _version, tail) => `${head}${next}${tail}`);
    if (before === after) {
        process.stdout.write("\nFAIL  README.md: the banner's release-notes link did not update.\n");
        process.exit(1);
    }
    changes.push(["README.md", "banner release-notes link", "", next]);
    write("README.md", after);
}
replaceAnchored("README.md", "download URL and filename", 2,
    /cyberchef-mcp-v(\d+\.\d+\.\d+[\w.-]*)-docker-image\.tar\.gz/g);
replaceAnchored("README.md", "download tag path", 1,
    /releases\/download\/v(\d+\.\d+\.\d+[\w.-]*)\//g);

process.stdout.write(`Bumped to ${next}\n\n`);
for (const [file, what, from, to] of changes) {
    process.stdout.write(`  ${file.padEnd(34)} ${what.padEnd(28)} ${from ? `${from} -> ` : ""}${to}\n`);
}
process.stdout.write(
    "\nNOT touched: the chart's own `version` (it tracks the chart, not the app), and every line\n" +
    "of prose that records which release found what. Run `npm run check:versions` next.\n");
