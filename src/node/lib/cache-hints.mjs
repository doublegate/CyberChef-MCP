/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * How long a client may cache each list result, and who may cache it.
 *
 * WHAT THIS IS
 * ------------
 * MCP 2026-07-28 (SEP-2549) adds `ttlMs` and `cacheScope` to the results of `tools/list`,
 * `prompts/list`, `resources/list`, `resources/read`, `resources/templates/list` and
 * `server/discover`. `ttlMs` is a freshness hint in milliseconds; `cacheScope` is `"public"` or
 * `"private"` and decides whether a shared intermediary may hold the response.
 *
 * The SDK already fills both, so this server was CONFORMANT before this module existed -- just
 * maximally conservative, defaulting everything to `{ttlMs: 0, cacheScope: "private"}`, which
 * tells every client to cache nothing. The work here is choosing honest values, not implementing
 * a field.
 *
 * WHY THE SERVER OPTION AND NOT THE HANDLERS
 * ------------------------------------------
 * These go through the `cacheHints` constructor option, which the 2026 codec reads. A handler
 * could return the fields itself, and that would be a mistake: the legacy codec passes a result
 * through unchanged, so a handler-returned `ttlMs` would leak onto the **2025 wire**, which every
 * currently deployed v1-SDK client speaks. The option is invisible to that era by construction.
 *
 * `assertValidCacheHint` also validates these at CONSTRUCTION, so a typo throws a `RangeError`
 * before the server serves anything rather than at encode time under load.
 *
 * WHY A WRONG VALUE HERE IS A BUG AND NOT A PREFERENCE
 * ---------------------------------------------------
 * A TTL longer than the truth is a client serving a stale list with no way to know. This server
 * declares **no** `listChanged` capability and emits no list-changed notification, so a client has
 * no invalidation signal other than the TTL expiring. That is why the two volatile results below
 * are 0 rather than "something small".
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

/** An hour. The static documents are literals in this repository; they change when it ships. */
const ONE_HOUR = 3_600_000;

/** Ten minutes. Long enough to be worth caching, short enough that a config change lands. */
const TEN_MINUTES = 600_000;

/**
 * Five minutes, for a list that varies by token.
 *
 * Bounded by a typical access-token lifetime rather than by how often the surface changes: under
 * scope filtering the answer depends on the caller, so a re-scoped token must start seeing its new
 * tools promptly rather than after the surface itself happens to change.
 */
const FIVE_MINUTES = 300_000;

/**
 * The cache hints this server offers, given whether authorisation is enabled.
 *
 * @param {boolean} authEnabled - Whether OAuth is configured, from `loadAuthConfig().enabled`.
 * @returns {Object} A `cacheHints` map for the `Server` constructor.
 */
export function serverCacheHints(authEnabled) {
    return {
        // The tool surface is fixed for the process lifetime -- it comes from environment and
        // config read at module load. With auth on it also varies BY TOKEN, because `tools/list`
        // is scope-filtered, so it stops being shareable and shortens.
        //
        // Auth is a process-wide setting, so this is decidable once here. There is no per-request
        // variation to model.
        "tools/list": authEnabled ?
            { ttlMs: FIVE_MINUTES, cacheScope: "private" } :
            { ttlMs: TEN_MINUTES, cacheScope: "public" },

        // Five prompts, a literal in lib/prompts.mjs. Never caller-dependent.
        "prompts/list": { ttlMs: ONE_HOUR, cacheScope: "public" },

        // One template, `recipe://{id}`, also a literal.
        "resources/templates/list": { ttlMs: ONE_HOUR, cacheScope: "public" },

        // The saved recipes. Volatile in both dimensions that matter: the list changes the moment
        // any caller saves a recipe, and it is partitioned by tenant, so it is neither stable nor
        // shareable. With no list-changed notification to invalidate a cache, the only honest
        // answer is "do not cache this".
        "resources/list": { ttlMs: 0, cacheScope: "private" },
        "resources/read": { ttlMs: 0, cacheScope: "private" },

        // Server identity and capabilities, invariant for the process.
        "server/discover": { ttlMs: TEN_MINUTES, cacheScope: "public" }
    };
}
