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

import { RATE_LIMIT_ENABLED, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW } from "./config.mjs";

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
    }

    /**
     * Check if request is allowed.
     *
     * @param {string} connectionId - Connection identifier.
     * @returns {Object} Result with allowed flag and retry-after time.
     */
    checkLimit(connectionId = "default") {
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
            return { allowed: false, retryAfter };
        }

        // Add current timestamp
        validTimestamps.push(now);
        this.requests.set(connectionId, validTimestamps);

        return { allowed: true, retryAfter: 0 };
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
