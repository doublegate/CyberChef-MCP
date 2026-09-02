/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * LRU cache for operation results, bounded by both item count and total bytes.
 *
 * Extracted verbatim from mcp-server.mjs during the v2.0.0 decomposition. Behaviour is
 * unchanged; the only edits are the import and export lines needed to stand alone.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { createHash } from "crypto";
import { CACHE_MAX_SIZE, CACHE_MAX_ITEMS, DEFAULT_TENANT } from "./config.mjs";

/**
 * Simple LRU Cache for operation results.
 */
class LRUCache {
    /**
     * Create a new LRU cache.
     *
     * @param {number} maxSize - Maximum total size in bytes.
     * @param {number} maxItems - Maximum number of items.
     */
    constructor(maxSize = CACHE_MAX_SIZE, maxItems = CACHE_MAX_ITEMS) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.maxItems = maxItems;
        this.currentSize = 0;
    }

    /**
     * Generate a cache key from operation parameters.
     *
     * @param {string} operation - Operation name.
     * @param {string} input - Input data.
     * @param {Array} args - Operation arguments.
     * @param {string} [tenant] - Tenant the entry belongs to.
     * @returns {string} SHA256 hash of the parameters.
     */
    getCacheKey(operation, input, args, tenant = DEFAULT_TENANT) {
        const hash = createHash("sha256");
        // The tenant, first, so entries from different tenants can never collide.
        //
        // Operation results are deterministic, so a shared cache does not hand one tenant
        // another's OUTPUT -- the same input yields the same answer either way. What it does leak
        // is timing: a hit returns immediately and a miss does the work, so a caller can learn
        // whether some other tenant has already run a given input. Against a security toolkit
        // that is a real question to be able to ask -- "has anyone here already decoded this
        // sample" -- and it is the same shape of cross-caller leak as GHSA-rmg9-8936-vx66.
        //
        // Length-prefixed for the same reason the input is below: without it, tenant "ab" with
        // operation "cd" and tenant "abc" with operation "d" hash identically.
        hash.update(String(tenant.length));
        hash.update(tenant);
        hash.update(operation);
        // The WHOLE input, not a prefix.
        //
        // This previously hashed `input.substring(0, 1000)`, which is unsound: two different
        // inputs sharing their first 1,000 characters produce the same key, so the second caller
        // receives the FIRST caller's answer. Measured before fixing:
        //
        //     a = "x".repeat(1000) + "SECRET-A"        (1,008 chars)
        //     b = "x".repeat(1000) + "DIFFERENT-B"     (1,011 chars)
        //     keys equal: true   -> lookup with b returned "ANSWER-FOR-A"
        //
        // Two consequences, and the second is the serious one. A silently wrong result for valid
        // input; and on a shared HTTP server, one caller receiving output computed from another
        // caller's data. Long inputs sharing a prefix are ordinary -- the same document with
        // different trailing content, log lines, padded records.
        //
        // The cost is real and affordable: full SHA-256 is 2.3 ms at 1 MB and 252 ms at the 100 MB
        // input ceiling. That is negligible against the operation it guards, which is what actually
        // scales with input size -- Gzip alone is 305 ms at 100 KB. A cache that returns the wrong
        // answer quickly is worth less than no cache at all.
        //
        // The length is mixed in as well. It is redundant given a full hash, and it is one line
        // that makes a prefix collision impossible to reintroduce by "optimising" this back to a
        // substring without also noticing the length check.
        hash.update(String(input.length));
        hash.update(input);
        hash.update(JSON.stringify(args));
        return hash.digest("hex");
    }

    /**
     * Get a value from the cache.
     *
     * @param {string} key - Cache key.
     * @returns {any} Cached value or null if not found.
     */
    get(key) {
        if (!this.cache.has(key)) return null;
        const item = this.cache.get(key);
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.value;
    }

    /**
     * Store a value in the cache.
     *
     * @param {string} key - Cache key.
     * @param {any} value - Value to cache.
     */
    set(key, value) {
        const size = Buffer.byteLength(JSON.stringify(value));

        // Don't cache if value is too large
        if (size > this.maxSize / 10) return;

        // Evict oldest items if needed
        while (this.cache.size >= this.maxItems || this.currentSize + size > this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            const oldItem = this.cache.get(oldestKey);
            this.currentSize -= oldItem.size;
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, { value, size });
        this.currentSize += size;
    }

    /**
     * Clear the cache.
     */
    clear() {
        this.cache.clear();
        this.currentSize = 0;
    }

    /**
     * Get cache statistics.
     *
     * @returns {Object} Cache statistics including items, size, maxSize, maxItems.
     */
    getStats() {
        return {
            items: this.cache.size,
            size: this.currentSize,
            maxSize: this.maxSize,
            maxItems: this.maxItems
        };
    }
}

export { LRUCache };
