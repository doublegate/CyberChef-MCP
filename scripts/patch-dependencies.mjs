#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Patch installed dependencies that do not work as published.
 *
 * WHY THIS REPLACED THE GRUNT TASKS
 * ---------------------------------
 * These five fixes used to be `postinstall: npx grunt exec:fix...`, each shelling out to `sed`
 * with a `darwin` / default branch. That is fine in a checkout and **fatal for a published
 * package**: `postinstall` runs on the CONSUMER's machine, where `grunt` is a devDependency that
 * was never installed, and where `sed` may not exist at all. `npx cyberchef-mcp` would have failed
 * during install, which is precisely the sort of thing that only shows up if you actually pack the
 * tarball and try it.
 *
 * Doing it in Node also deletes the platform branching outright. The old commands differed between
 * macOS and Linux solely because BSD `sed -i` requires an argument and GNU `sed -i` refuses one --
 * a difference with nothing to do with the edits themselves.
 *
 * RULES THIS SCRIPT FOLLOWS
 * -------------------------
 * - **Idempotent.** `postinstall` runs on every install, and several of these patches are not
 *   safely repeatable textually (the jimp one adds a key; applying it twice would add it twice).
 *   Each checks for its own result first.
 * - **A missing target is not an error.** Not every dependency is present in every install --
 *   `serialize-javascript` is not even a declared dependency of this project any more -- and a
 *   `postinstall` that fails takes the whole install down with it.
 * - **Write only on change**, so a re-install does not churn file mtimes and invalidate caches.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Where a dependency actually lives.
 *
 * NOT `<this package>/node_modules/<name>`. When this project is INSTALLED as a dependency, npm
 * runs `postinstall` inside `node_modules/cyberchef-mcp/`, while the dependencies themselves are
 * hoisted to the consumer's root `node_modules/`. Assuming a local directory made every patch
 * silently report "target absent", and the installed server then died on the first import:
 *
 *     Cannot find module '.../node_modules/crypto-api/src/hasher/has160'
 *
 * which was the crypto-api patch not having been applied. (That patch is gone -- crypto-api is
 * vendored now, see src/vendor/crypto-api/README.md -- but the resolution bug it exposed applies
 * to every patch below.) Resolution first, then an upward walk for packages whose `exports` map
 * refuses a deep path.
 *
 * @param {string} name - Package name.
 * @returns {string|null} Absolute path to the package directory, or null if it is not installed.
 */
function packageDir(name) {
    try {
        return dirname(require.resolve(`${name}/package.json`));
    } catch {
        // `exports` can block `/package.json`; fall back to looking for it on disk.
    }
    let dir = HERE;
    for (;;) {
        const candidate = join(dir, "node_modules", ...name.split("/"));
        if (existsSync(candidate)) return candidate;
        const up = dirname(dir);
        if (up === dir || dir === parse(dir).root) return null;
        dir = up;
    }
}

let changed = 0;
let skipped = 0;

/**
 * Apply an edit to one file, if it exists and the edit is not already applied.
 *
 * @param {string} pkgName - The dependency's package name.
 * @param {string} relPath - Path within that package.
 * @param {Function} edit - Receives the contents, returns the new contents or null for no change.
 * @param {string} label - What this patch is, for the log.
 * @returns {void}
 */
function patch(pkgName, relPath, edit, label) {
    const dir = packageDir(pkgName);
    if (!dir) {
        skipped++;
        return;
    }
    const file = join(dir, relPath);

    // Read and handle the failure, rather than `existsSync` then read. Checking first is a
    // time-of-check/time-of-use race (CodeQL js/file-system-race) -- the exploit path here is thin,
    // since anyone able to swap a file in node_modules mid-install can simply edit it, but the
    // race-free form is also one syscall shorter and says what it means: try, and cope if it is
    // not there.
    let before;
    try {
        before = readFileSync(file, "utf8");
    } catch (err) {
        if (err.code !== "ENOENT" && err.code !== "ENOTDIR") throw err;
        skipped++;
        return;
    }

    const after = edit(before);
    if (after === null || after === before) return;
    writeFileSync(file, after);
    console.log(`  patched  ${label}`);
    changed++;
}

// 1. snackbarjs ships a self-closing div that is not valid HTML.
patch("snackbarjs", "src/snackbar.js",
    (s) => s.replace(/<div id=snackbar-container\/>/g, "<div id=snackbar-container>"),
    "snackbarjs container markup");

// 2. jimp's package.json omits `"type": "module"`, so its ESM build loads as CommonJS.
patch("jimp", "package.json", (s) => {
    if (/"type"\s*:\s*"module"/.test(s)) return null;      // already declared
    if (!s.includes("\"es/index.js\",")) return null;      // shape changed; leave it alone
    return s.replace("\"es/index.js\",", "\"es/index.js\",\n  \"type\": \"module\",");
}, "jimp type: module");

// 3. serialize-javascript calls `crypto.getRandomValues` without checking that `crypto` is global.
patch("serialize-javascript", "index.js", (s) => {
    if (s.includes("var nodeCrypto = require")) return null;   // already patched
    if (!s.includes("crypto.getRandomValues(new Uint8Array(UID_LENGTH))")) return null;
    return s.replace(
        "var bytes = crypto.getRandomValues(new Uint8Array(UID_LENGTH));",
        "var nodeCrypto = require('crypto');\n" +
        "    var bytes = nodeCrypto.randomBytes(UID_LENGTH);");
}, "serialize-javascript crypto");

// 4. @natlibfi/loglevel-message-prefix has a typo'd scoped require: `@natlibfi(es6-polyfills`.
patch("@natlibfi/loglevel-message-prefix", "lib/main.js",
    (s) => s.replace(/@natlibfi\(es6-polyfills/g, "@natlibfi/es6-polyfills"),
    "loglevel-message-prefix scoped require");

console.log(changed ?
    `patch-dependencies: ${changed} patch(es) applied${skipped ? `, ${skipped} target(s) absent` : ""}` :
    `patch-dependencies: nothing to do${skipped ? ` (${skipped} target(s) absent)` : ""}`);
