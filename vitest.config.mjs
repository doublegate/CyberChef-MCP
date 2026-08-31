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
            // Coverage thresholds (raised in v1.9.0)
            thresholds: {
                lines: 75,
                functions: 90,
                branches: 70,
                statements: 75,
            },
            all: true,  // Include all files in coverage, even untested ones
        },

        // JUnit XML reporter for Codecov Test Analytics
        reporters: ["default", "junit"],
        outputFile: {
            junit: "./test-results/junit.xml",
        },
    },
});
