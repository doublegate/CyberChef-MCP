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

/** Label the per-tool counters collapse to once the distinct-name cap is reached. */
const OVERFLOW_TOOL = "__other__";

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
        // Monotonic per-tool totals (v2.7.0), separate from the buffer above.
        //
        // The buffer is a 10k ring: it holds the LAST 10k executions and drops the oldest, so a
        // count derived from it decreases on rollover. Prometheus reads a decreasing counter as a
        // process restart and treats the drop as a reset, so `rate()` over a buffer-derived series
        // silently invents traffic that did not happen. These counters only ever go up, which is
        // what makes them safe to publish as counters.
        //
        // Map<tool, {calls, failures, cached}>.
        this.totals = new Map();
        // Hard cap on DISTINCT tool names, with the overflow bucketed under a single label.
        //
        // This is a security bound, not tidiness. The tool name reaching record() is the name the
        // CALLER asked for, and an unknown one still reaches here -- it is dispatched, fails to
        // resolve, and is recorded as a failure. Verified against a running server: calling
        // `cyberchef_definitely_not_a_tool` created its own series.
        //
        // Left unbounded, anyone who can call this server can mint arbitrary Prometheus labels by
        // invoking `cyberchef_<random>` in a loop -- growing this Map without limit in the server
        // and, far worse, exploding cardinality in the monitoring system, where each new label set
        // is a new time series that persists for the retention period. That takes out the
        // monitoring for every other service sharing it.
        //
        // The real catalogue is ~500 tools, so 1024 admits every legitimate name with room to
        // spare while making the attack a single flat series.
        this.maxTools = 1024;
    }

    /**
     * Record a tool execution metric.
     *
     * @param {Object} metric - Metric object.
     */
    record(metric) {
        // Counted BEFORE the opt-in gate, and deliberately.
        //
        // What telemetry makes opt-in is the per-call RECORD -- duration, sizes, timestamp, one
        // row per execution. A count of how many times a tool ran carries none of that, and the
        // server already counts total operations unconditionally in the quota tracker; this is
        // the same number broken out by tool name.
        //
        // The alternative was measured against its consequence rather than argued: with the gate
        // above this, /metrics on a default deployment reports zero tool calls forever, no matter
        // how much traffic the server is serving. An operator would conclude the server is idle,
        // or that the endpoint is broken. A monitoring surface that reads empty under load is
        // worse than no monitoring surface, because it is believed.
        if (metric && metric.tool) {
            // Overflow is bucketed, not dropped: a flood of unknown tool names is worth SEEING as
            // a rising `other` series, and dropping it silently would hide exactly the traffic an
            // operator most wants to know about.
            const key = this.totals.has(metric.tool) ? metric.tool :
                (this.totals.size >= this.maxTools ? OVERFLOW_TOOL : metric.tool);
            const t = this.totals.get(key) || { calls: 0, failures: 0, cached: 0 };
            t.calls++;
            if (metric.success === false) t.failures++;
            if (metric.cached) t.cached++;
            this.totals.set(key, t);
        }

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
     * Monotonic per-tool totals, for the Prometheus endpoint.
     *
     * Distinct from `exportMetrics()`: that returns the sampled ring buffer, this returns
     * cumulative counts that never decrease. Returns a copy so a caller cannot mutate the
     * counters by editing what it was handed.
     *
     * @returns {Array<{tool: string, calls: number, failures: number, cached: number}>} Totals.
     */
    exportTotals() {
        return [...this.totals].map(([tool, v]) => ({ tool, ...v }));
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
        // The BUFFER only. `totals` is deliberately left alone: a counter any caller can reset is
        // not a counter, and this is reachable from an MCP tool, so clearing it here would let a
        // client zero the server's own metrics -- which Prometheus would read as a restart and
        // paper over with a reset adjustment.
        this.metrics = [];
    }
}

export { TelemetryCollector };
