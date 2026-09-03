/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Give every test file its own recipe store.
 *
 * THE PROBLEM
 * -----------
 * `recipe-storage.mjs` resolves its path ONCE, at module load, into a module-scope const:
 *
 *     const STORAGE_FILE = process.env.CYBERCHEF_RECIPE_STORAGE || "./recipes.json";
 *
 * So a test file that does not set that variable before the module loads writes
 * `./recipes.json` in the repository root -- and **13 of the MCP test files did**, measured by
 * running each one alone and checking whether the file appeared:
 *
 *     auth  config-variations  coverage-improvement  examples  handler-dispatch
 *     mcp-server  migration-preview  offline  prometheus  server-integration
 *     stdio-client-contract  tenancy  v1.7.0
 *
 * Vitest runs test FILES in parallel, so any two of those running at once write the same file, and
 * the replica generation guard added in v2.6.0 correctly refuses:
 *
 *     Recipe storage changed underneath this process: expected generation 0 but found 1.
 *
 * That surfaces as a single unexplained failure somewhere in an otherwise green run -- which is
 * exactly what it did, twice, in files that had nothing to do with the change being tested.
 *
 * WHY THIS IS A SETUP FILE AND NOT 13 EDITS
 * -----------------------------------------
 * The first attempt patched the spawn sites individually. It missed one **in a file it had already
 * patched**: `stdio-client-contract.test.mjs` has a second `describe` with a raw
 * `spawn(process.execPath, [SERVER])` carrying no `env` at all, so the file kept writing the shared
 * store after being "fixed". Enumerating call sites is the failure mode here, not the fix.
 *
 * A setup file runs before the test file's own module graph is loaded, so the const above sees this
 * value. Child processes inherit it through `process.env`, which covers the spawned servers too --
 * including the raw `spawn` that was missed, and any added later.
 *
 * A test that wants a specific location still overrides it (several do, to assert storage behaviour
 * on a known path); this only changes the DEFAULT from "shared by everything" to "private to this
 * file".
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// `mkdtemp` rather than a name built from the pid: vitest reuses worker processes across files, so
// a pid is not unique per file, and two files sharing a store is the bug being fixed.
const storeDir = mkdtempSync(join(tmpdir(), "cyberchef-test-store-"));

process.env.CYBERCHEF_RECIPE_STORAGE = join(storeDir, "recipes.json");

// Off by default in tests: the backup doubles the writes for no assertion, and a test that cares
// about backup behaviour sets it itself.
if (process.env.CYBERCHEF_RECIPE_BACKUP === undefined) {
    process.env.CYBERCHEF_RECIPE_BACKUP = "false";
}

afterAll(() => {
    rmSync(storeDir, { recursive: true, force: true });
});
