#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Do two commits install the same dependency tree?
 *
 * WHY THIS EXISTS
 * ---------------
 * The same-host benchmark comparison reuses one `node_modules` across two checkouts, which is only
 * honest while both commits would install the same thing. The first version of that guard was
 * `git diff --quiet <base> HEAD -- package.json package-lock.json`, and CI skipped the comparison
 * on the very first pull request that used it.
 *
 * It was right to, by its own rule, and the rule was wrong: **a release PR bumps the version**, so
 * `package.json` and `package-lock.json` always differ on exactly the pull requests where the
 * comparison is most wanted. A version bump changes those files without changing a single
 * dependency.
 *
 * So the comparison is on the resolved dependency TREE rather than on the files. From
 * `package-lock.json`, every entry under `packages` except the root `""` — the root entry is the
 * project itself, and its `version` is precisely the field a release bumps. Two commits whose
 * remaining entries agree install byte-identical `node_modules`, whatever their own version says.
 *
 * `dependencies` and `devDependencies` from `package.json` are compared too. They are implied by a
 * matching lock, but a lock can be stale relative to its manifest, and this is a guard rather than
 * a derivation.
 *
 * Exits 0 when the trees match, 1 when they do not, and 2 on a malformed input — which the caller
 * must treat as "do not compare" rather than as "differs", since a parse failure says nothing about
 * the dependencies.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [aDir, bDir] = process.argv.slice(2);
if (!aDir || !bDir) {
    process.stderr.write("usage: node benchmarks/deps-identical.mjs <dirA> <dirB>\n");
    process.exit(2);
}

/**
 * A stable fingerprint of one checkout's dependency tree.
 *
 * @param {string} dir - A directory holding package.json and package-lock.json.
 * @returns {string} A hex digest.
 */
function fingerprint(dir) {
    const lock = JSON.parse(readFileSync(`${dir}/package-lock.json`, "utf8"));
    const pkg = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));

    // Everything but the root entry. The root describes THIS package -- its name, its version, and
    // the dependency ranges it declares -- and its `version` is what a release bumps. The installed
    // tree is the other entries.
    const packages = Object.fromEntries(
        Object.entries(lock.packages ?? {}).filter(([path]) => path !== ""));

    // Sorted, so key order in the file cannot change the fingerprint. `npm install
    // --package-lock-only` has reordered entries before now.
    const canonical = JSON.stringify({
        packages: Object.keys(packages).sort().map(key => [key, packages[key]]),
        dependencies: Object.entries(pkg.dependencies ?? {}).sort(),
        devDependencies: Object.entries(pkg.devDependencies ?? {}).sort(),
        // The lockfile format itself: a v2 and a v3 lock describing the same versions still install
        // differently enough that comparing runs across them would be dishonest.
        lockfileVersion: lock.lockfileVersion
    });
    return createHash("sha256").update(canonical).digest("hex");
}

let a, b;
try {
    a = fingerprint(aDir);
    b = fingerprint(bDir);
} catch (error) {
    process.stdout.write(`could not fingerprint dependencies: ${error.message}\n`);
    process.exit(2);
}

process.stdout.write(`${aDir}: ${a.slice(0, 16)}\n${bDir}: ${b.slice(0, 16)}\n`);
if (a === b) {
    process.stdout.write("identical dependency trees; one node_modules serves both\n");
    process.exit(0);
}
process.stdout.write(
    "dependency trees DIFFER. Reusing one node_modules would benchmark one commit against the\n" +
    "other's dependencies, which measures neither.\n");
process.exit(1);
