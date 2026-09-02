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

import { describe, it, expect, beforeEach, vi } from "vitest";

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
        // The value pattern is Prometheus's numeric grammar, NOT `.+`. With `.+` the parser
        // accepted `cyberchef_mcp_operations_total undefined` as a valid line, so it could not
        // catch a collector field going missing -- which fails the entire scrape in production.
        m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})? (NaN|[+-]Inf|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$/.exec(line);
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
        // Reserved characters DRIVEN THROUGH the escaper, via the tool label -- the one label
        // whose value is not from a fixed set.
        //
        // The previous version of this test only read a body whose labels were all clean, so it
        // asserted nothing about escaping at all: swapping the backslash and quote replacements in
        // prometheus.mjs -- which produces genuinely different output -- left it green. Verified
        // by making that swap.
        const dirty = new TelemetryCollector();
        dirty.record({ tool: "cyberchef_a\\b\"c\nd", success: true });
        const body = renderMetrics(allSources({ telemetryCollector: dirty }));

        // Backslash escaped FIRST, so the backslash introduced by escaping the quote is not itself
        // escaped a second time. Ordering is the whole content of this assertion.
        expect(body).toContain('cyberchef_a\\\\b\\"c\\nd');
        expect(body).not.toContain("\ncyberchef_a\\b");   // no raw newline survived into a label
        expect(() => parse(body)).not.toThrow();

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

describe("sample values are always valid", () => {
    it("renders a missing collector field as NaN rather than \"undefined\"", () => {
        // A collector that gains a field, loses one, or is replaced by a stand-in used to render
        // the literal string `undefined` into the body -- and Prometheus rejects the WHOLE scrape
        // on one unparseable line, so a single missing field took every other metric with it.
        // NaN is a legal value and is the honest rendering of "this collector reported no number".
        const partial = { getInfo: () => ({ concurrentOperations: 1 }) };
        const body = renderMetrics({ quotaTracker: partial });
        expect(body).not.toContain("undefined");
        expect(body).toContain("cyberchef_mcp_operations_total NaN");
        expect(() => parse(body)).not.toThrow();
    });

    it("keeps the sign of an infinity", () => {
        const inf = { getStats: () => ({ items: Infinity, size: -Infinity, maxSize: 1 }) };
        const body = renderMetrics({ operationCache: inf });
        expect(body).toContain("cyberchef_mcp_cache_items +Inf");
        expect(body).toContain("cyberchef_mcp_cache_bytes -Inf");
        expect(() => parse(body)).not.toThrow();
    });
});

describe("counter semantics", () => {
    it("keeps per-tool totals monotonic across a full buffer rollover", async () => {
        // THE decisive test. The telemetry buffer is a ring that drops its oldest entries, so a
        // count derived from it FALLS on rollover -- and Prometheus reads a falling counter as a
        // restart, bridging the gap with traffic that never happened. The totals are separate
        // counters precisely so this cannot occur.
        //
        // Telemetry must be ENABLED for this to test anything. With the default environment
        // `record()` updates the totals and returns before touching the buffer, so the buffer
        // stays empty -- and the old `expect(length).toBeLessThanOrEqual(5)` passed against 0,
        // asserting that a rollover which never happened did not break anything. The flag is read
        // at module load, so the module graph is reset and re-imported with it set.
        //
        // Restored in `finally`. A failing assertion below would otherwise skip the cleanup and
        // leak BOTH an enabled telemetry flag and a reset module graph into every later test in
        // this file -- turning one honest failure into a run whose results depend on test order,
        // which is far harder to diagnose than the failure that caused it.
        vi.stubEnv("CYBERCHEF_TELEMETRY_ENABLED", "true");
        vi.resetModules();
        try {
            const { TelemetryCollector: Fresh } = await import("../../src/node/lib/telemetry.mjs");

            const t = new Fresh();
            t.maxMetrics = 5;
            const reads = [];
            for (let i = 0; i < 50; i++) {
                t.record({ tool: "cyberchef_to_base64", success: true });
                reads.push(t.exportTotals()[0].calls);
            }

            // The ring genuinely filled and genuinely dropped entries -- 50 recorded, 5 held.
            expect(t.exportMetrics().length).toBe(5);
            for (let i = 1; i < reads.length; i++) {
                expect(reads[i]).toBeGreaterThanOrEqual(reads[i - 1]);
            }
            expect(reads.at(-1)).toBe(50);
        } finally {
            vi.unstubAllEnvs();
            vi.resetModules();
        }
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

describe("the dispatch-boundary bound on tool labels", () => {
    it("passes through every kind of tool this server actually dispatches", async () => {
        // Operations, meta-tools and registry tools alike. Bounding by resolution would be a
        // regression if it collapsed real tools, so the pass-through is asserted first.
        const { toolDimension } = await import("../../src/node/mcp-server.mjs");
        for (const real of ["cyberchef_to_base64", "cyberchef_bake", "cyberchef_search",
                            "cyberchef_hash_identify", "cyberchef_recipe_list"]) {
            expect(toolDimension(real), real).toBe(real);
        }
    });

    it("folds an unresolvable name into the overflow bucket", async () => {
        const { toolDimension } = await import("../../src/node/mcp-server.mjs");
        for (const bogus of ["cyberchef_definitely_not_a_tool", "cyberchef_", "", null, undefined,
                             {}, "../../etc/passwd"]) {
            expect(toolDimension(bogus)).toBe("__other__");
        }
    });

    it("cannot have its slots exhausted before real tools arrive", async () => {
        // The failure a bare cap does NOT prevent, and the reason the resolution exists.
        //
        // With only a cap, an attacker calling `cyberchef_<random>` maxTools times before real
        // traffic fills every slot -- and legitimate tools then collapse into `__other__`. The
        // attack degrades exactly the metrics the cap was supposed to contain. Resolving against
        // the catalogue first means an unknown name never occupies a slot at all.
        const { toolDimension } = await import("../../src/node/mcp-server.mjs");
        const t = new TelemetryCollector();
        t.maxTools = 8;

        for (let i = 0; i < 5000; i++) {
            t.record({ tool: toolDimension(`cyberchef_attack_${i}`), success: false });
        }
        t.record({ tool: toolDimension("cyberchef_to_base64"), success: true });

        const totals = t.exportTotals();
        // Two series: the overflow bucket, and the real tool -- which arrived LAST and still got
        // its own. Without the resolution the 5000 would have consumed all 8 slots first.
        expect(totals.map(x => x.tool).sort()).toEqual(["__other__", "cyberchef_to_base64"]);
        expect(totals.find(x => x.tool === "cyberchef_to_base64").calls).toBe(1);
        expect(totals.find(x => x.tool === "__other__").calls).toBe(5000);
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
