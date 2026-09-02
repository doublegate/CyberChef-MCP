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
// be edited together and silently disagreed when they were not.
//
// package.json is now the only one: this derives it, the four tests assert against it, and
// baseline.json no longer carries a version at all -- it records the tool INVENTORY, and nothing
// ever read a version from it.
//
// It reads `version`, not `mcpVersion`, from v2.2.0. `version` used to hold the UPSTREAM base
// (11.4.0) while the product version hid in a bespoke `mcpVersion` -- workable until the package
// is published, since npm requires `version` to be the version it publishes. The upstream base
// now lives in `cyberchefUpstreamVersion`, so each number says which one it is.
export const VERSION = pkg.version;
export const MAX_INPUT_SIZE = parseInt(process.env.CYBERCHEF_MAX_INPUT_SIZE, 10) || 100 * 1024 * 1024; // 100MB default
export const OPERATION_TIMEOUT = parseInt(process.env.CYBERCHEF_OPERATION_TIMEOUT, 10) || 30000; // 30s default
export const STREAMING_THRESHOLD = parseInt(process.env.CYBERCHEF_STREAMING_THRESHOLD, 10) || 10 * 1024 * 1024; // 10MB default
export const ENABLE_STREAMING = process.env.CYBERCHEF_ENABLE_STREAMING !== "false"; // Enabled by default
// Disabled by default -- opt-in, not unimplemented. The comment here read "workers not yet
// implemented" long after `worker-pool.mjs`, `worker.mjs` and the `shouldUseWorker` routing in
// `handleCallTool` all shipped, which is the kind of stale note that makes a reader distrust the
// feature rather than the comment.
export const ENABLE_WORKERS = process.env.CYBERCHEF_ENABLE_WORKERS === "true";
export const CACHE_MAX_SIZE = parseInt(process.env.CYBERCHEF_CACHE_MAX_SIZE, 10) || 100 * 1024 * 1024; // 100MB default
export const CACHE_MAX_ITEMS = parseInt(process.env.CYBERCHEF_CACHE_MAX_ITEMS, 10) || 1000;
export const BATCH_MAX_SIZE = parseInt(process.env.CYBERCHEF_BATCH_MAX_SIZE, 10) || 100;
export const BATCH_ENABLED = process.env.CYBERCHEF_BATCH_ENABLED !== "false"; // Enabled by default
export const TELEMETRY_ENABLED = process.env.CYBERCHEF_TELEMETRY_ENABLED === "true"; // Disabled by default (privacy-first)
export const RATE_LIMIT_ENABLED = process.env.CYBERCHEF_RATE_LIMIT_ENABLED === "true"; // Disabled by default
export const RATE_LIMIT_REQUESTS = parseInt(process.env.CYBERCHEF_RATE_LIMIT_REQUESTS, 10) || 100;
export const RATE_LIMIT_WINDOW = parseInt(process.env.CYBERCHEF_RATE_LIMIT_WINDOW, 10) || 60000; // 60 seconds
export const CACHE_ENABLED = process.env.CYBERCHEF_CACHE_ENABLED !== "false"; // Enabled by default
// The tenant every entry belongs to when tenancy is disabled.
//
// Lives here rather than in tenancy.mjs so the leaf modules that need it -- cache, quota,
// rate-limit -- can key on it without importing the tenancy module, which pulls in auth.mjs and
// jsonwebtoken behind it. tenancy.mjs re-exports it, so there is still one definition and one
// obvious place to import it from.
export const DEFAULT_TENANT = "default";
export const V2_COMPATIBILITY_MODE = process.env.V2_COMPATIBILITY_MODE === "true"; // Disabled by default
export const SUPPRESS_DEPRECATIONS = process.env.CYBERCHEF_SUPPRESS_DEPRECATIONS === "true"; // Disabled by default
