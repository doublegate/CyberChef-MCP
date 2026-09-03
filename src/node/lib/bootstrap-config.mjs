/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Apply `cyberchef.config.json` before anything reads a setting.
 *
 * WHY THIS IS A SEPARATE MODULE WHOSE IMPORT IS A SIDE EFFECT
 * ----------------------------------------------------------
 * Settings are read at MODULE LOAD, into module-scope constants:
 *
 *     const STORAGE_FILE = process.env.CYBERCHEF_RECIPE_STORAGE || "./recipes.json";
 *
 * There are ~30 such reads across `config.mjs`, `recipe-storage.mjs`, `tool-surface.mjs`,
 * `safe-regex.mjs` and `transports.mjs`. Once one of those modules is evaluated its value is fixed,
 * so the configuration file has to be in `process.env` BEFORE the first of them loads.
 *
 * ES module imports are evaluated depth-first in source order, so importing this module first in an
 * entry point guarantees it runs before the rest of that entry point's graph. That is the whole
 * mechanism, and it is why this file imports nothing but `config-file.mjs` -- pulling in anything
 * that itself reads a setting would defeat the ordering it exists to establish.
 *
 * This is the same hazard the test suite hit in v2.9.0, where a store path resolved at module load
 * meant `process.env` had to be set in a vitest `setupFiles` entry rather than in a `beforeAll`.
 *
 * FAILING HERE STOPS THE SERVER, ON PURPOSE
 * -----------------------------------------
 * A broken configuration file throws during import, so the process exits before serving anything.
 * For a file that can set `offline`, `maxRegexLength` and an operation allowlist, refusing to start
 * is the correct response to "I could not understand your security settings" -- the alternative is
 * running with defaults the operator did not choose and does not know they have.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { applyConfigFile, ConfigFileError } from "./config-file.mjs";

/**
 * What the configuration file did, for the startup banner to report.
 *
 * Recorded rather than logged here: the logger does not exist yet at this point in the load order,
 * and creating one would import modules this must stay ahead of.
 */
export const configFileResult = load();

/**
 * Apply the file, reporting a configuration mistake as a message rather than a stack trace.
 *
 * Letting the error propagate out of module evaluation is fail-closed, which is right, but what the
 * operator sees is an ESM loader stack ending in `asyncRunEntryPointWithESMLoader` -- the one frame
 * with nothing to do with their file. The mistake is theirs to fix and the message has to be
 * legible, so it is printed on its own and the process exits.
 *
 * Only a `ConfigFileError` is handled this way. Anything else is a bug in this code, and a stack
 * trace is exactly what should be shown for that.
 *
 * @returns {Object} The result of applying the file.
 */
function load() {
    try {
        return applyConfigFile();
    } catch (error) {
        if (!(error instanceof ConfigFileError)) throw error;
        // stderr, never stdout: the stdio transport reserves stdout for JSON-RPC, and a stray line
        // there corrupts the stream for a client that is already connected. Same rule the logger
        // follows, and the reason logging to fd 1 was a shipped defect through v2.0.0.
        process.stderr.write(
            `\ncyberchef.config.json: ${error.message}\n\n` +
            `The server did not start. Fix the file, or remove it to use environment variables ` +
            `only.\n`);
        process.exit(1);
    }
}
