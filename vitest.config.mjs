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
                // The whole measured surface. Each sits just under its own actual figure
                // (95.71 / 88.79 / 96.34 / 96.57) so a real regression trips it.
                //
                // NOTE the order. Vitest takes these as named keys; the docs quote them in the
                // conventional statements/branches/functions/lines order, so the gate written here
                // as lines/functions/branches/statements is the same "95/88/96/96" the CHANGELOG
                // and release notes describe. They are not swapped -- a reviewer read them as
                // swapped once, which is why this note exists.
                lines: 96,
                functions: 96,
                branches: 88,
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
            // `perFile: true` is NOT set yet, and the reason is specific rather than reluctance.
            // Two files carry the whole deficit -- mcp-server.mjs (72.5% branches) and
            // transports.mjs -- and both are dominated by SDK error callbacks and per-request
            // handler bodies that only become individually testable after the `registerTool`
            // decomposition. That decomposition was deliberately NOT done in v2.3.0: the SDK v2
            // migration reached protocol revision 2026-07-28 without it (see
            // docs/internal/v2.3.0-findings-log.md, F-04), so forcing it now would be a large
            // rewrite bought purely to move a number. The per-glob tier above delivers the
            // property `perFile` was wanted for -- a weak module cannot hide behind healthy ones --
            // for the half of the tree where it is achievable today.
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
