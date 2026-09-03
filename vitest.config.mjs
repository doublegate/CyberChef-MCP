/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Vitest configuration for MCP Server validation tests.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Only run MCP tests to avoid conflicts with existing test infrastructure
        include: ["tests/mcp/**/*.test.mjs"],

        // Use Node environment (not jsdom)
        environment: "node",

        // Gives each test file its own recipe store BEFORE its modules load, which is the only
        // point at which that can be decided -- `recipe-storage.mjs` resolves the path once, into
        // a module-scope const. Without it, 13 files shared `./recipes.json` and raced the replica
        // generation guard under parallel execution. See the setup file for the measurement.
        setupFiles: ["tests/mcp/setup/recipe-store-isolation.mjs"],

        // Enable globals for describe/it/expect
        globals: true,

        // Booting a suite's server builds the tool surface over 504 operations, which on this
        // machine lands at 9.5-10s for the heavier files -- i.e. right on the old 10s default.
        // Adding one more parallel suite was enough to tip two of them over, as a *hook* timeout,
        // which reports as a whole-file failure and looks nothing like "the runner was busy".
        // These are integration suites; the timeout should mean "broken", not "loaded".
        testTimeout: 30000,
        // hookTimeout was never set, so beforeAll inherited the 10s default -- which is where the
        // flake actually was, since that is where the server gets built.
        hookTimeout: 30000,

        // Silent mode for passed tests (reduce noise)
        silent: false,

        // Coverage configuration for Codecov
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov", "json", "html"],
            reportsDirectory: "./coverage",
            include: [
                "src/node/mcp-server.mjs",
                "src/node/errors.mjs",
                "src/node/logger.mjs",
                "src/node/streaming.mjs",
                "src/node/retry.mjs",
                "src/node/recipe-validator.mjs",
                "src/node/recipe-storage.mjs",
                "src/node/recipe-manager.mjs",
                "src/node/worker-pool.mjs",
                "src/node/transports.mjs",
                "src/node/deprecation.mjs",
                // Added in v2.3.0. It is our code on the worker-threads path and had never been
                // measured -- absent from this list, so present in no report.
                "src/node/worker.mjs",
                "src/node/lib/**/*.{js,mjs}",
                // Added with the registry in v2.4.0. Omitting a new directory is exactly how
                // src/node/worker.mjs went unmeasured for six releases -- it was our code, on a
                // real path, absent from this list and therefore from every report.
                "src/node/tools/**/*.{js,mjs}",
            ],
            exclude: [
                "node_modules/**",
                "tests/**",
                "build/**",
                "dist/**",
                "src/core/vendor/**",
                "src/vendor/**",
                "src/core/operations/legacy/**",
                "**/*.test.{js,mjs}",
                "**/*.config.{js,mjs}",
            ],
            // Coverage thresholds, raised in v2.3.0 from 75/70/90/75 -- numbers so far below
            // actual (93/85/93/94 at the time) that the gate could not fail, which is the same
            // as not having one.
            //
            // Two tiers, because one global number is exactly how a 50%-covered file hid behind
            // ten healthy ones before v2.0.0:
            thresholds: {
                // The whole measured surface. Each sits just under its own actual figure, so a
                // real regression trips it. NAMED rather than written as a bare tuple, because
                // the paragraph below quotes a different order and an unlabelled tuple beside it
                // reads as a misconfigured gate:
                //
                //   statements 95.78   branches 89.97   functions 96.62   lines 96.63  (v2.7.0)
                //
                // NOTE the order. Vitest takes these as named keys; the docs quote them in the
                // conventional statements/branches/functions/lines order, so the gate written here
                // as lines/functions/branches/statements is the same "95/88/96/96" the CHANGELOG
                // and release notes describe. They are not swapped -- a reviewer read them as
                // swapped once, which is why this note exists.
                lines: 96,
                functions: 96,
                branches: 89,
                statements: 95,

                // The extracted pure-logic modules are held near-perfect, because they are pure
                // functions with no excuse: no process wiring, no SDK callbacks, no I/O.
                "src/node/lib/**": {
                    lines: 99,
                    functions: 100,
                    branches: 94,
                    statements: 99
                }
            },
            // A note on the glob tier's semantics, because a reviewer asked and the answer is not
            // obvious: WITHOUT `perFile: true` inside the glob object, those numbers are checked
            // against the glob's AGGREGATE, not against each file. That is deliberate here.
            // Per-file enforcement on this tier would be floored by `lib/prompts.mjs` at 72%
            // branches, whose uncovered branches are `args?.x ?? ""` fallbacks that `getPrompt`
            // makes unreachable -- it rejects a missing or empty required argument two lines
            // earlier. Setting the tier to 72 to accommodate one file's dead defensive code would
            // be a WEAKER gate than the 94% aggregate, not a stronger one. So: aggregate, stated
            // plainly, rather than a per-file number chosen by the worst case.
            //
            // `perFile: true` is NOT set globally either, and the reason is specific rather than
            // reluctance.
            // Two files carry the whole deficit -- mcp-server.mjs (72.5% branches) and
            // transports.mjs -- and both are dominated by SDK error callbacks and per-request
            // handler bodies that only become individually testable after the `registerTool`
            // decomposition. That decomposition was deliberately NOT done in v2.3.0: the SDK v2
            // migration reached protocol revision 2026-07-28 without it (see
            // docs/internal/v2.3.0-findings-log.md, F-04), so forcing it now would be a large
            // rewrite bought purely to move a number. The per-glob tier above does not deliver
            // per-file enforcement either (see the note above); what it does deliver is a much
            // higher bar for the half of the tree that has no excuse, so a regression there trips
            // long before it would move the global number.
            //
            // `thresholds.autoUpdate` stays off: it silently ratchets and turns a regression gate
            // into a rubber stamp. Raise these deliberately.
            all: true,  // Include all files in coverage, even untested ones
        },

        // JUnit XML reporter for Codecov Test Analytics
        reporters: ["default", "junit"],
        outputFile: {
            junit: "./test-results/junit.xml",
        },
    },
});
