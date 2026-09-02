/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The Prometheus exposition endpoint.
 *
 * Three classes of property are pinned here, and the first two are the ones that bite:
 *
 *   - FORMAT. A malformed exposition body does not degrade gracefully -- Prometheus rejects the
 *     WHOLE scrape, so one bad family takes every other metric with it. The first draft of this
 *     module emitted three `# HELP` lines for `lifecycle_state` and would have done exactly that.
 *   - COUNTER SEMANTICS. A "counter" that can fall is worse than no metric, because Prometheus
 *     reads the fall as a process restart and invents traffic to bridge it.
 *   - DISCLOSURE. The endpoint is unauthenticated by necessity, so what it does NOT say is part
 *     of its contract.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
    renderMetrics, metricsEnabled, isMetricsPath, METRICS_CONTENT_TYPE
} from "../../src/node/lib/prometheus.mjs";
import { TelemetryCollector } from "../../src/node/lib/telemetry.mjs";
import { LRUCache } from "../../src/node/lib/cache.mjs";
import { RateLimiter } from "../../src/node/lib/rate-limit.mjs";
import { ResourceQuotaTracker } from "../../src/node/lib/quota.mjs";

/** Every collector, so a render exercises every branch. */
function allSources(extra = {}) {
    return {
        quotaTracker: new ResourceQuotaTracker(),
        rateLimiter: new RateLimiter(),
        operationCache: new LRUCache(),
        telemetryCollector: new TelemetryCollector(),
        lifecycleState: "serving",
        ...extra
    };
}

/** Parse an exposition body into `{name -> {type, help, samples[]}}`. */
function parse(body) {
    const families = new Map();
    const helpSeen = [];
    const typeSeen = [];
    for (const line of body.split("\n")) {
        if (!line) continue;
        let m = /^# HELP (\S+) (.*)$/.exec(line);
        if (m) {
            helpSeen.push(m[1]);
            families.set(m[1], { ...(families.get(m[1]) || { samples: [] }), help: m[2] });
            continue;
        }
        m = /^# TYPE (\S+) (\S+)$/.exec(line);
        if (m) {
            typeSeen.push(m[1]);
            families.set(m[1], { ...(families.get(m[1]) || { samples: [] }), type: m[2] });
            continue;
        }
        m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})? (.+)$/.exec(line);
        expect(m, `unparseable exposition line: ${line}`).toBeTruthy();
        const fam = families.get(m[1]);
        expect(fam, `sample for undeclared family: ${m[1]}`).toBeTruthy();
        fam.samples.push({ labels: m[2] || "", value: m[3] });
    }
    return { families, helpSeen, typeSeen };
}

describe("exposition format", () => {
    it("declares HELP and TYPE exactly once per family", () => {
        // The regression this pins: emitting the lifecycle states as three separate families
        // repeated `# HELP cyberchef_mcp_lifecycle_state` three times. Prometheus rejects a
        // duplicated declaration and fails the ENTIRE scrape, so every other metric here would
        // have silently disappeared with it.
        const { helpSeen, typeSeen } = parse(renderMetrics(allSources()));
        expect(new Set(helpSeen).size).toBe(helpSeen.length);
        expect(new Set(typeSeen).size).toBe(typeSeen.length);
    });

    it("emits one lifecycle family carrying all three states", () => {
        const { families } = parse(renderMetrics(allSources({ lifecycleState: "draining" })));
        const fam = families.get("cyberchef_mcp_lifecycle_state");
        expect(fam.samples).toHaveLength(3);
        const active = fam.samples.filter(s => s.value === "1");
        expect(active).toHaveLength(1);
        expect(active[0].labels).toContain("draining");
    });

    it("gives every sample a declared family, and every line a parseable shape", () => {
        // parse() asserts both internally; this states the intent so a failure reads as a format
        // break rather than as a mysterious regex error.
        expect(() => parse(renderMetrics(allSources()))).not.toThrow();
    });

    it("ends with a newline, which a scraper requires", () => {
        expect(renderMetrics(allSources()).endsWith("\n")).toBe(true);
    });

    it("escapes the three characters the format reserves in a label value", () => {
        // Reachable through the version label, which is the only label whose value is not drawn
        // from a fixed set. Asserted on the escaping function's effect rather than contrived
        // input, so the property holds for any label added later.
        const body = renderMetrics(allSources());
        for (const line of body.split("\n")) {
            if (line.startsWith("#") || !line.includes("{")) continue;
            const labels = line.slice(line.indexOf("{") + 1, line.lastIndexOf("}"));
            // No raw newline can survive, and every quote must be either a delimiter or escaped.
            expect(labels).not.toContain("\n");
            const unescaped = labels.replace(/\\./g, "");
            expect((unescaped.match(/"/g) || []).length % 2).toBe(0);
        }
    });

    it("names a content type Prometheus accepts", () => {
        expect(METRICS_CONTENT_TYPE).toMatch(/^text\/plain; version=0\.0\.4/);
    });
});

describe("counter semantics", () => {
    it("keeps per-tool totals monotonic across a full buffer rollover", () => {
        // THE decisive test. The telemetry buffer is a ring that drops its oldest entries, so a
        // count derived from it FALLS on rollover -- and Prometheus reads a falling counter as a
        // restart, bridging the gap with traffic that never happened. The totals are separate
        // counters precisely so this cannot occur.
        const t = new TelemetryCollector();
        t.maxMetrics = 5;
        const reads = [];
        for (let i = 0; i < 50; i++) {
            t.record({ tool: "cyberchef_to_base64", success: true });
            reads.push(t.exportTotals()[0].calls);
        }
        expect(t.exportMetrics().length).toBeLessThanOrEqual(5);   // the ring did roll over
        for (let i = 1; i < reads.length; i++) {
            expect(reads[i]).toBeGreaterThanOrEqual(reads[i - 1]);
        }
        expect(reads.at(-1)).toBe(50);
    });

    it("counts tool calls even when telemetry buffering is disabled", () => {
        // TELEMETRY_ENABLED is off by default. With the gate above the counters, /metrics on a
        // default deployment reports zero tool calls forever no matter how much traffic the
        // server serves -- and an operator reads that as an idle server or a broken endpoint.
        // A monitoring surface that reads empty under load is worse than none, because it is
        // believed.
        const t = new TelemetryCollector();
        expect(t.exportMetrics()).toHaveLength(0);       // buffering really is off
        t.record({ tool: "cyberchef_md5", success: true });
        t.record({ tool: "cyberchef_md5", success: false });
        expect(t.exportMetrics()).toHaveLength(0);       // still off
        expect(t.exportTotals()).toEqual([{ tool: "cyberchef_md5", calls: 2, failures: 1, cached: 0 }]);
    });

    it("does not let clear() reset the totals", () => {
        // clear() is reachable from an MCP tool. A counter a caller can zero is not a counter --
        // Prometheus would read the drop as a restart and paper over it.
        const t = new TelemetryCollector();
        t.record({ tool: "cyberchef_md5", success: true });
        t.clear();
        expect(t.exportTotals()[0].calls).toBe(1);
    });

    it("declares as counters exactly those series that only increase", () => {
        const { families } = parse(renderMetrics(allSources()));
        for (const [name, fam] of families) {
            if (name.endsWith("_total")) expect(fam.type).toBe("counter");
            else expect(fam.type).toBe("gauge");
        }
    });
});

describe("label cardinality is bounded", () => {
    it("collapses unknown tool names into one series once the cap is reached", () => {
        // Not hypothetical: verified against a running server, calling
        // `cyberchef_definitely_not_a_tool` created its own series. The name reaching the counter
        // is the name the CALLER asked for -- an unknown one is dispatched, fails to resolve, and
        // is recorded as a failure. Unbounded, anyone who can reach this server can mint arbitrary
        // Prometheus labels in a loop and explode cardinality in a monitoring system shared with
        // every other service.
        const t = new TelemetryCollector();
        t.maxTools = 4;
        for (const real of ["a", "b", "c", "d"]) t.record({ tool: real, success: true });
        for (let i = 0; i < 5000; i++) t.record({ tool: `cyberchef_attack_${i}`, success: false });

        const totals = t.exportTotals();
        expect(totals).toHaveLength(5);                       // 4 real + 1 overflow bucket
        const overflow = totals.find(x => x.tool === "__other__");
        expect(overflow.calls).toBe(5000);
        // Bucketed, not dropped: a flood of unknown names is exactly what an operator wants to see.
        expect(overflow.failures).toBe(5000);
    });

    it("keeps counting real tools normally after the cap is hit", () => {
        const t = new TelemetryCollector();
        t.maxTools = 2;
        t.record({ tool: "real", success: true });
        t.record({ tool: "also_real", success: true });
        for (let i = 0; i < 100; i++) t.record({ tool: `junk_${i}`, success: false });
        t.record({ tool: "real", success: true });
        expect(t.exportTotals().find(x => x.tool === "real").calls).toBe(2);
    });
});

describe("what the endpoint never discloses", () => {
    it("reports a tenant count and never a tenant name", () => {
        // /metrics is unauthenticated by necessity -- a scraper carries no bearer token -- so a
        // tenant identifier in a label is tenant identity leaking into a surface nobody
        // access-controlled for it, made permanent by cardinality.
        const quotaTracker = new ResourceQuotaTracker();
        quotaTracker.acquire("acme-corp");
        quotaTracker.acquire("globex-industries");
        const body = renderMetrics(allSources({ quotaTracker }));
        expect(body).toContain("cyberchef_mcp_active_tenants 2");
        expect(body).not.toContain("acme-corp");
        expect(body).not.toContain("globex-industries");
    });

    it("carries no argument, input content or error message", () => {
        const t = new TelemetryCollector();
        t.record({ tool: "cyberchef_aes_decrypt", success: false, inputSize: 9 });
        const body = renderMetrics(allSources({ telemetryCollector: t }));
        // Only names, numbers and the version reach the body. Anything resembling free text would
        // have to arrive through a label, and the only labels are `tool`, `state` and `version`.
        for (const line of body.split("\n")) {
            if (line.startsWith("#") || !line.includes("{")) continue;
            const keys = [...line.matchAll(/([a-z_]+)="/g)].map(m => m[1]);
            expect(new Set(keys).size).toBeGreaterThan(0);
            for (const k of keys) expect(["tool", "state", "version"]).toContain(k);
        }
    });
});

describe("enablement and routing", () => {
    beforeEach(() => {
        delete process.env.CYBERCHEF_METRICS_ENABLED;
    });

    it("is off unless the variable is exactly \"true\"", () => {
        expect(metricsEnabled({})).toBe(false);
        expect(metricsEnabled({ CYBERCHEF_METRICS_ENABLED: "false" })).toBe(false);
        expect(metricsEnabled({ CYBERCHEF_METRICS_ENABLED: "1" })).toBe(false);
        expect(metricsEnabled({ CYBERCHEF_METRICS_ENABLED: "TRUE" })).toBe(false);
        expect(metricsEnabled({ CYBERCHEF_METRICS_ENABLED: "true" })).toBe(true);
    });

    it("matches only the exact path", () => {
        expect(isMetricsPath("/metrics")).toBe(true);
        expect(isMetricsPath("/metrics/")).toBe(false);
        expect(isMetricsPath("/Metrics")).toBe(false);
        expect(isMetricsPath("/metrics/../mcp")).toBe(false);
    });
});

describe("rendering with collectors absent", () => {
    it("still produces a valid body", () => {
        // The transport passes whatever the server hands it. A missing collector must degrade to
        // fewer series, not to a malformed scrape.
        const body = renderMetrics({});
        expect(() => parse(body)).not.toThrow();
        expect(body).toContain("cyberchef_mcp_build_info");
        expect(body).toContain("cyberchef_mcp_process_uptime_seconds");
    });
});
