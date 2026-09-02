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

import { MAX_INPUT_SIZE, DEFAULT_TENANT } from "./config.mjs";

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
        // Per-tenant in-flight counts. The aggregate `concurrentOps` above is kept as the
        // process-wide total, because `getInfo()` reports it and a deployment still wants to know
        // how loaded the process is overall.
        this.perTenant = new Map();
    }

    /**
     * Acquire a quota slot.
     *
     * The limit applies **per tenant**, not process-wide. A single shared pool means the busiest
     * tenant decides how much capacity everyone else gets: ten concurrent operations from one
     * caller exhausts the default pool and every other tenant is refused, without any of them
     * having done anything. That is a denial of service one tenant can inflict on another by
     * ordinary use, which is not a threat model a shared deployment can accept.
     *
     * @param {string} [tenant] - Tenant to charge the slot to.
     * @returns {boolean} True if slot acquired, false if quota exceeded.
     */
    acquire(tenant = DEFAULT_TENANT) {
        const inFlight = this.perTenant.get(tenant) || 0;
        if (inFlight >= this.maxConcurrentOps) {
            return false;
        }
        this.perTenant.set(tenant, inFlight + 1);
        this.concurrentOps++;
        this.totalOps++;
        return true;
    }

    /**
     * Release a quota slot.
     *
     * Deletes the tenant's entry once it reaches zero, so the Map tracks tenants that are
     * currently active rather than every tenant ever seen.
     *
     * @param {string} [tenant] - Tenant the slot was charged to.
     */
    release(tenant = DEFAULT_TENANT) {
        const inFlight = this.perTenant.get(tenant) || 0;
        if (inFlight <= 1) {
            this.perTenant.delete(tenant);
        } else {
            this.perTenant.set(tenant, inFlight - 1);
        }
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
            // The limit is per tenant, so the aggregate above can exceed it legitimately when
            // several tenants are busy at once. Reporting the active tenant count makes that
            // number readable instead of alarming.
            activeTenants: this.perTenant.size,
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
