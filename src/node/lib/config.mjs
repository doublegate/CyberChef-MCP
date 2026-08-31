/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Environment-derived configuration constants.
 *
 * Resolved once at module load, which is the pre-existing behaviour.
 *
 * Extracted verbatim from mcp-server.mjs during the v2.0.0 decomposition. Behaviour is
 * unchanged; the only edits are the import and export lines needed to stand alone.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import pkg from "../../../package.json" with { type: "json" };

// Read from package.json rather than restated here.
//
// This constant used to be a hardcoded string, which made the product version live in EIGHT
// places (package.json, this file, tests/mcp/baseline.json and four test assertions) that had to
// be edited together and silently disagreed when they were not. Deriving it leaves one.
export const VERSION = pkg.mcpVersion;
export const MAX_INPUT_SIZE = parseInt(process.env.CYBERCHEF_MAX_INPUT_SIZE, 10) || 100 * 1024 * 1024; // 100MB default
export const OPERATION_TIMEOUT = parseInt(process.env.CYBERCHEF_OPERATION_TIMEOUT, 10) || 30000; // 30s default
export const STREAMING_THRESHOLD = parseInt(process.env.CYBERCHEF_STREAMING_THRESHOLD, 10) || 10 * 1024 * 1024; // 10MB default
export const ENABLE_STREAMING = process.env.CYBERCHEF_ENABLE_STREAMING !== "false"; // Enabled by default
export const ENABLE_WORKERS = process.env.CYBERCHEF_ENABLE_WORKERS === "true"; // Disabled by default (workers not yet implemented)
export const CACHE_MAX_SIZE = parseInt(process.env.CYBERCHEF_CACHE_MAX_SIZE, 10) || 100 * 1024 * 1024; // 100MB default
export const CACHE_MAX_ITEMS = parseInt(process.env.CYBERCHEF_CACHE_MAX_ITEMS, 10) || 1000;
export const BATCH_MAX_SIZE = parseInt(process.env.CYBERCHEF_BATCH_MAX_SIZE, 10) || 100;
export const BATCH_ENABLED = process.env.CYBERCHEF_BATCH_ENABLED !== "false"; // Enabled by default
export const TELEMETRY_ENABLED = process.env.CYBERCHEF_TELEMETRY_ENABLED === "true"; // Disabled by default (privacy-first)
export const RATE_LIMIT_ENABLED = process.env.CYBERCHEF_RATE_LIMIT_ENABLED === "true"; // Disabled by default
export const RATE_LIMIT_REQUESTS = parseInt(process.env.CYBERCHEF_RATE_LIMIT_REQUESTS, 10) || 100;
export const RATE_LIMIT_WINDOW = parseInt(process.env.CYBERCHEF_RATE_LIMIT_WINDOW, 10) || 60000; // 60 seconds
export const CACHE_ENABLED = process.env.CYBERCHEF_CACHE_ENABLED !== "false"; // Enabled by default
export const V2_COMPATIBILITY_MODE = process.env.V2_COMPATIBILITY_MODE === "true"; // Disabled by default
export const SUPPRESS_DEPRECATIONS = process.env.CYBERCHEF_SUPPRESS_DEPRECATIONS === "true"; // Disabled by default
