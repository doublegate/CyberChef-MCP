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
import { CACHE_MAX_SIZE, CACHE_MAX_ITEMS } from "./config.mjs";

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
     * @returns {string} SHA256 hash of the parameters.
     */
    getCacheKey(operation, input, args) {
        const hash = createHash("sha256");
        hash.update(operation);
        hash.update(input.substring(0, 1000)); // Use first 1KB for hash
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
