/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Prometheus metrics, in the text exposition format, with no dependencies.
 *
 * WHY NOT `prom-client` OR THE OTEL PROMETHEUS EXPORTER
 * ----------------------------------------------------
 * The exposition format is a few hundred bytes of text generation: `# HELP`, `# TYPE`, and one
 * line per series. Writing it costs less than the dependency does, and this server already
 * maintains the underlying counters -- the quota tracker, the rate limiter and the cache all keep
 * exactly the numbers a scrape wants.
 *
 * The measured alternative was 71 packages and 50 MB for the OTel SDK plus its Prometheus
 * exporter, which also starts an HTTP listener of its own. This server already has a listener with
 * routing, CORS, DNS-rebinding protection and an auth gate in front of it; adding a second one
 * beside it would need all of that again or would quietly have none of it.
 *
 * OFF BY DEFAULT, AND THAT IS A SECURITY DECISION
 * -----------------------------------------------
 * `/metrics` is served only when `CYBERCHEF_METRICS_ENABLED=true`, and it is **unauthenticated**
 * when on, because a Prometheus scraper carries no bearer token -- the same constraint that makes
 * the health probes unauthenticated.
 *
 * But metrics are not health. A health probe answers "should I get traffic" in one word; a scrape
 * reports which tools are being used, how often, how large the inputs are and how many tenants are
 * active. That is a useful reconnaissance surface, so unlike the probes it is opt-in rather than
 * always-on, and the documentation says plainly that it belongs on an internal network or behind a
 * NetworkPolicy.
 *
 * WHAT IS NEVER EXPOSED
 * ---------------------
 * No tenant identifiers, no tool arguments, no subject digests, no recipe names. Tenant COUNT is
 * exposed; tenant NAMES are not -- a metric label is the classic way tenant identity leaks into a
 * system that was never access-controlled for it, and label cardinality makes it permanent.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { VERSION } from "./config.mjs";

/** Prefix for every series, so a scrape groups cleanly beside other exporters. */
const PREFIX = "cyberchef_mcp";

/**
 * Whether the metrics endpoint is served.
 *
 * @param {Object} [env] - Environment (defaults to `process.env`).
 * @returns {boolean} Whether to expose `/metrics`.
 */
export function metricsEnabled(env = process.env) {
    return env.CYBERCHEF_METRICS_ENABLED === "true";
}

/** @param {string} path - A normalised request path. @returns {boolean} Whether it is the scrape. */
export function isMetricsPath(path) {
    return path === "/metrics";
}

/**
 * Escape a label value per the exposition format.
 *
 * Backslash, double quote and newline are the three characters the format reserves. Unescaped,
 * any of them produces a line a scraper rejects -- and since label values here derive from
 * configuration rather than user input the failure would be rare, environment-specific and
 * baffling.
 *
 * @param {string} value - Raw label value.
 * @returns {string} Escaped value.
 */
function escapeLabel(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n");
}

/**
 * One metric family: help, type, and its samples.
 *
 * @param {string} name - Metric name without prefix.
 * @param {string} type - `counter`, `gauge` or `histogram`.
 * @param {string} help - Single-line description.
 * @param {Array<{labels?: Object, value: number}>} samples - The series.
 * @returns {string} Exposition-format lines.
 */
function family(name, type, help, samples) {
    const full = `${PREFIX}_${name}`;
    const lines = [`# HELP ${full} ${help}`, `# TYPE ${full} ${type}`];
    for (const { labels, value } of samples) {
        const pairs = Object.entries(labels || {})
            .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
            .join(",");
        lines.push(pairs ? `${full}{${pairs}} ${value}` : `${full} ${value}`);
    }
    return lines.join("\n");
}

/**
 * Render the current metrics.
 *
 * Reads the live collectors rather than keeping a second copy: a metrics endpoint that maintains
 * its own counters is a second source of truth that drifts from the first one silently.
 *
 * @param {Object} sources - `{quotaTracker, rateLimiter, operationCache, telemetryCollector, lifecycleState}`.
 * @returns {string} The exposition-format body.
 */
export function renderMetrics(sources = {}) {
    const { quotaTracker, rateLimiter, operationCache, telemetryCollector, lifecycleState } = sources;
    const out = [];

    // Build info: the conventional way to expose a version, as a labelled gauge fixed at 1, so a
    // dashboard can join on it rather than parsing a version out of a metric name.
    out.push(family("build_info", "gauge",
        "Build information; always 1, with the version as a label.",
        [{ labels: { version: VERSION }, value: 1 }]));

    if (lifecycleState) {
        // One series per state with 0/1, rather than a number encoding the state. An enum encoded
        // as an integer is unreadable in an alert expression and breaks the moment a state is
        // inserted in the middle.
        //
        // ONE family with three samples, not three families. Emitting the loop as three separate
        // `family()` calls repeated the `# HELP`/`# TYPE` header for the same metric name, which
        // Prometheus rejects as a duplicate declaration -- it fails the whole scrape, not just the
        // offending family, so every other metric here would have gone missing too.
        out.push(family("lifecycle_state", "gauge",
            "Server lifecycle state; 1 for the current state.",
            ["starting", "serving", "draining"].map(state => ({
                labels: { state },
                value: lifecycleState === state ? 1 : 0
            }))));
    }

    if (quotaTracker) {
        const info = quotaTracker.getInfo();
        out.push(family("operations_total", "counter",
            "Operations executed since start.", [{ value: info.totalOperations }]));
        out.push(family("operations_in_flight", "gauge",
            "Operations currently executing.", [{ value: info.concurrentOperations }]));
        out.push(family("max_concurrent_operations", "gauge",
            "Configured per-tenant concurrency limit.", [{ value: info.maxConcurrentOperations }]));
        // COUNT, never names. A tenant identifier in a label is how tenant identity leaks into a
        // system nobody access-controlled for it, and cardinality makes that permanent.
        out.push(family("active_tenants", "gauge",
            "Tenants with at least one operation in flight.", [{ value: info.activeTenants ?? 0 }]));
        out.push(family("input_bytes_total", "counter",
            "Input bytes processed.", [{ value: info.totalInputSize }]));
        out.push(family("output_bytes_total", "counter",
            "Output bytes produced.", [{ value: info.totalOutputSize }]));
    }

    if (rateLimiter) {
        const stats = rateLimiter.getStats();
        out.push(family("rate_limit_enabled", "gauge",
            "1 when rate limiting is enabled.", [{ value: stats.enabled ? 1 : 0 }]));
        out.push(family("rate_limit_tracked_callers", "gauge",
            "Callers currently tracked by the rate limiter.", [{ value: stats.activeConnections }]));
    }

    if (operationCache) {
        const stats = operationCache.getStats();
        out.push(family("cache_items", "gauge",
            "Entries in the operation cache.", [{ value: stats.items }]));
        out.push(family("cache_bytes", "gauge",
            "Bytes held by the operation cache.", [{ value: stats.size }]));
        out.push(family("cache_max_bytes", "gauge",
            "Configured cache size limit in bytes.", [{ value: stats.maxSize }]));
    }

    if (telemetryCollector) {
        // Monotonic totals, NOT the sampled buffer.
        //
        // The buffer is a 10k ring that drops its oldest entries, so counts derived from it fall
        // when it rolls over -- and Prometheus reads a falling counter as a process restart,
        // quietly inventing traffic in every `rate()` over it. These come from separate counters
        // that only increase, and they are maintained whether or not telemetry buffering is on,
        // so a default deployment reports its real traffic rather than a convincing zero.
        const totals = telemetryCollector.exportTotals();
        if (totals.length) {
            out.push(family("tool_calls_total", "counter",
                "Tool executions since start, by tool.",
                totals.map(t => ({ labels: { tool: t.tool }, value: t.calls }))));
            out.push(family("tool_failures_total", "counter",
                "Failed tool executions since start, by tool.",
                totals.map(t => ({ labels: { tool: t.tool }, value: t.failures }))));
            out.push(family("tool_cache_hits_total", "counter",
                "Tool executions served from cache since start, by tool.",
                totals.map(t => ({ labels: { tool: t.tool }, value: t.cached }))));
        }

        // The buffer depth, as a gauge and named as one. Usually 0, because telemetry buffering is
        // opt-in; exposed anyway so the series exists to alert on before traffic arrives.
        out.push(family("telemetry_buffered_samples", "gauge",
            "Per-call telemetry records currently buffered (opt-in; 0 when disabled).",
            [{ value: telemetryCollector.exportMetrics().length }]));
    }

    // Process metrics a scrape is always expected to carry.
    const mem = process.memoryUsage();
    out.push(family("process_resident_memory_bytes", "gauge",
        "Resident set size in bytes.", [{ value: mem.rss }]));
    out.push(family("process_heap_used_bytes", "gauge",
        "Heap in use in bytes.", [{ value: mem.heapUsed }]));
    out.push(family("process_uptime_seconds", "gauge",
        "Process uptime in seconds.", [{ value: Math.round(process.uptime()) }]));

    // The format requires a trailing newline; a scraper rejects a body without one.
    return out.join("\n") + "\n";
}

/** The content type Prometheus expects for the text exposition format. */
export const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";
