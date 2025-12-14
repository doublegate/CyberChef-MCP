/**
 * Vitest configuration for MCP Server validation tests.
 *
 * @author DoubleGate
 * @license Apache-2.0
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

        // Extended timeout for potentially slow operations
        testTimeout: 10000,

        // Fail fast on first failure (useful for CI)
        bail: 1,

        // Silent mode for passed tests (reduce noise)
        silent: false,
    },
});
