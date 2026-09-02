/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Sliding-window rate limiter.
 *
 * Extracted verbatim from mcp-server.mjs during the v2.0.0 decomposition. Behaviour is
 * unchanged; the only edits are the import and export lines needed to stand alone.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import {
    RATE_LIMIT_ENABLED, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW, DEFAULT_TENANT
} from "./config.mjs";

/**
 * Caller count above which `sweep` starts reclaiming expired entries.
 *
 * Above any realistic set of simultaneously-active callers, so an ordinary deployment never pays
 * for the scan, and far below the point where retained entries matter.
 */
const SWEEP_THRESHOLD = 1024;

/**
 * Rate limiter using sliding window algorithm (v1.7.0).
 */
class RateLimiter {
    /**
     * Create a new rate limiter.
     *
     * @param {number} maxRequests - Maximum requests per window.
     * @param {number} windowMs - Window size in milliseconds.
     */
    constructor(maxRequests = RATE_LIMIT_REQUESTS, windowMs = RATE_LIMIT_WINDOW) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = new Map(); // connectionId -> [timestamps]
        // When `sweep` last ran. Starts at 0 so the first sweep is never delayed.
        this.lastSweep = 0;
    }

    /**
     * Check if request is allowed.
     *
     * @param {string} connectionId - Connection identifier.
     * @returns {Object} Result with allowed flag and retry-after time.
     */
    checkLimit(connectionId = DEFAULT_TENANT) {
        if (!RATE_LIMIT_ENABLED) {
            return { allowed: true, retryAfter: 0 };
        }

        const now = Date.now();
        const timestamps = this.requests.get(connectionId) || [];

        // Remove old timestamps outside the window
        const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);

        if (validTimestamps.length >= this.maxRequests) {
            const oldestTimestamp = validTimestamps[0];
            const retryAfter = Math.ceil((oldestTimestamp + this.windowMs - now) / 1000);
            // Write the pruned array back even on the reject path. Without this, a caller who
            // keeps hitting the limit never has their expired timestamps dropped, so the entry
            // only ever grows.
            this.requests.set(connectionId, validTimestamps);
            this.sweep(now);
            return { allowed: false, retryAfter };
        }

        // Add current timestamp
        validTimestamps.push(now);
        this.requests.set(connectionId, validTimestamps);
        this.sweep(now);

        return { allowed: true, retryAfter: 0 };
    }

    /**
     * Drop callers with no activity left inside the window.
     *
     * The tracking Map had nothing that removed entries: `checkLimit` pruned timestamps *within*
     * a caller's array but never removed the caller, so the Map grew by one entry per distinct
     * key and stayed that way for the life of the process. Harmless while keys were few and
     * unbounded once they were not -- which, given the keying bug this release also fixes, is
     * what was actually happening: one entry per request, forever.
     *
     * Amortised rather than scheduled: no timer to leak, nothing to unref, and no behaviour on an
     * idle server.
     *
     * **Rate-limited to once per window, which is what makes "amortised" true.** The first version
     * gated only on size, so once the Map stayed above the threshold -- exactly the case a
     * high-cardinality key like subject-within-tenant produces -- it rescanned every caller on
     * every single request, turning a leak fix into an O(callers) cost per call. Nothing can have
     * expired since the last sweep sooner than one window, so sweeping more often than that cannot
     * reclaim anything and only burns CPU.
     *
     * @param {number} now - Current timestamp.
     */
    sweep(now) {
        if (this.requests.size <= SWEEP_THRESHOLD) return;
        if (now - this.lastSweep < this.windowMs) return;
        this.lastSweep = now;
        for (const [key, timestamps] of this.requests) {
            if (!timestamps.length || now - timestamps[timestamps.length - 1] >= this.windowMs) {
                this.requests.delete(key);
            }
        }
    }

    /**
     * Get rate limit statistics.
     *
     * @returns {Object} Statistics object.
     */
    getStats() {
        const connections = this.requests.size;
        let totalRequests = 0;
        for (const timestamps of this.requests.values()) {
            totalRequests += timestamps.length;
        }

        return {
            enabled: RATE_LIMIT_ENABLED,
            maxRequests: this.maxRequests,
            windowMs: this.windowMs,
            activeConnections: connections,
            totalTrackedRequests: totalRequests
        };
    }

    /**
     * Clear all tracked requests.
     */
    clear() {
        this.requests.clear();
    }
}

export { RateLimiter };
