/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Resource quota tracking for concurrent operations and data sizes.
 *
 * Extracted verbatim from mcp-server.mjs during the v2.0.0 decomposition. Behaviour is
 * unchanged; the only edits are the import and export lines needed to stand alone.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { MAX_INPUT_SIZE } from "./config.mjs";

/**
 * Resource quota tracker (v1.7.0).
 */
class ResourceQuotaTracker {
    /**
     * Create a new resource quota tracker.
     */
    constructor() {
        this.concurrentOps = 0;
        this.maxConcurrentOps = parseInt(process.env.CYBERCHEF_MAX_CONCURRENT_OPS, 10) || 10;
        this.totalOps = 0;
        this.totalInputSize = 0;
        this.totalOutputSize = 0;
    }

    /**
     * Acquire a quota slot.
     *
     * @returns {boolean} True if slot acquired, false if quota exceeded.
     */
    acquire() {
        if (this.concurrentOps >= this.maxConcurrentOps) {
            return false;
        }
        this.concurrentOps++;
        this.totalOps++;
        return true;
    }

    /**
     * Release a quota slot.
     */
    release() {
        this.concurrentOps = Math.max(0, this.concurrentOps - 1);
    }

    /**
     * Track data sizes.
     *
     * @param {number} inputSize - Input data size in bytes.
     * @param {number} outputSize - Output data size in bytes.
     */
    trackData(inputSize, outputSize) {
        this.totalInputSize += inputSize;
        this.totalOutputSize += outputSize;
    }

    /**
     * Get quota information.
     *
     * @returns {Object} Quota information.
     */
    getInfo() {
        return {
            concurrentOperations: this.concurrentOps,
            maxConcurrentOperations: this.maxConcurrentOps,
            totalOperations: this.totalOps,
            totalInputSize: this.totalInputSize,
            totalOutputSize: this.totalOutputSize,
            inputSizeMB: (this.totalInputSize / 1024 / 1024).toFixed(2),
            outputSizeMB: (this.totalOutputSize / 1024 / 1024).toFixed(2),
            maxInputSizeMB: (MAX_INPUT_SIZE / 1024 / 1024).toFixed(2)
        };
    }

    /**
     * Reset statistics.
     */
    reset() {
        this.totalOps = 0;
        this.totalInputSize = 0;
        this.totalOutputSize = 0;
    }
}

export { ResourceQuotaTracker };
