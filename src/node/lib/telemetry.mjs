/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Privacy-first usage telemetry. Opt-in; never captures input or output data.
 *
 * Extracted verbatim from mcp-server.mjs during the v2.0.0 decomposition. Behaviour is
 * unchanged; the only edits are the import and export lines needed to stand alone.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { TELEMETRY_ENABLED } from "./config.mjs";

/**
 * Telemetry collector for usage analytics (v1.7.0).
 * Privacy-first: no input/output data is captured.
 */
class TelemetryCollector {
    /**
     * Create a new telemetry collector.
     */
    constructor() {
        this.metrics = [];
        this.maxMetrics = 10000; // Keep last 10k metrics
    }

    /**
     * Record a tool execution metric.
     *
     * @param {Object} metric - Metric object.
     */
    record(metric) {
        if (!TELEMETRY_ENABLED) return;

        this.metrics.push({
            tool: metric.tool,
            duration: metric.duration,
            inputSize: metric.inputSize,
            outputSize: metric.outputSize,
            success: metric.success,
            cached: metric.cached || false,
            timestamp: Date.now()
        });

        // Limit metrics array size
        if (this.metrics.length > this.maxMetrics) {
            this.metrics.shift();
        }
    }

    /**
     * Export all collected metrics.
     *
     * @returns {Array} Array of metric objects.
     */
    exportMetrics() {
        return [...this.metrics];
    }

    /**
     * Get telemetry statistics.
     *
     * @returns {Object} Statistics object.
     */
    getStats() {
        if (this.metrics.length === 0) {
            return {
                totalCalls: 0,
                successRate: 0,
                avgDuration: 0,
                cacheHitRate: 0
            };
        }

        const successCount = this.metrics.filter(m => m.success).length;
        const cachedCount = this.metrics.filter(m => m.cached).length;
        const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);

        return {
            totalCalls: this.metrics.length,
            successRate: (successCount / this.metrics.length * 100).toFixed(2) + "%",
            avgDuration: Math.round(totalDuration / this.metrics.length) + "ms",
            cacheHitRate: (cachedCount / this.metrics.length * 100).toFixed(2) + "%"
        };
    }

    /**
     * Clear all metrics.
     */
    clear() {
        this.metrics = [];
    }
}

export { TelemetryCollector };
