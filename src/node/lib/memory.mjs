/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Process memory monitoring and pressure reporting.
 *
 * Extracted verbatim from mcp-server.mjs during the v2.0.0 decomposition. Behaviour is
 * unchanged; the only edits are the import and export lines needed to stand alone.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { logMemory } from "../logger.mjs";

/**
 * Memory monitor for resource tracking.
 */
class MemoryMonitor {
    /**
     * Create a new memory monitor.
     */
    constructor() {
        this.lastCheck = Date.now();
        this.checkInterval = 5000; // Check every 5 seconds
    }

    /**
     * Check memory usage and log if interval elapsed.
     *
     * @returns {Object|undefined} Memory usage object or undefined if not checked.
     */
    check() {
        const now = Date.now();
        if (now - this.lastCheck < this.checkInterval) return;

        this.lastCheck = now;
        const usage = process.memoryUsage();

        // Log memory usage with structured logging
        logMemory(usage);

        return usage;
    }

    /**
     * Get current memory usage.
     *
     * @returns {Object} Memory usage object.
     */
    getUsage() {
        return process.memoryUsage();
    }
}

export { MemoryMonitor };
