/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The shipped observability assets: the Grafana dashboard, the alert rules, and the Helm
 * templates that carry them.
 *
 * These are configuration rather than code, and configuration rots differently: it never throws.
 * A dashboard querying a metric that was renamed shows an empty panel, a `# HELP` duplicated
 * across families fails a whole scrape, and an alert rule copied into a Helm template drifts from
 * its source the first time only one of the two is edited. None of that is caught by running the
 * server. It is caught here.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { load } from "js-yaml";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { renderMetrics } from "../../src/node/lib/prometheus.mjs";
import { TelemetryCollector } from "../../src/node/lib/telemetry.mjs";
import { LRUCache } from "../../src/node/lib/cache.mjs";
import { RateLimiter } from "../../src/node/lib/rate-limit.mjs";
import { ResourceQuotaTracker } from "../../src/node/lib/quota.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DASHBOARD = join(ROOT, "deploy", "grafana", "cyberchef-mcp-dashboard.json");
const ALERTS = join(ROOT, "deploy", "grafana", "alerts.yaml");
const RULE_TEMPLATE = join(ROOT, "deploy", "helm", "cyberchef-mcp", "templates", "prometheusrule.yaml");

const dashboard = JSON.parse(readFileSync(DASHBOARD, "utf8"));

/** Every metric family the server can emit, taken from the renderer rather than a hardcoded list. */
function emittedFamilies() {
    const t = new TelemetryCollector();
    t.record({ tool: "cyberchef_to_base64", success: true });
    const body = renderMetrics({
        quotaTracker: new ResourceQuotaTracker(),
        rateLimiter: new RateLimiter(),
        operationCache: new LRUCache(),
        telemetryCollector: t,
        lifecycleState: "serving"
    });
    return new Set(body.split("\n")
        .filter(l => l.startsWith("# TYPE"))
        .map(l => l.split(" ")[2]));
}

/** Every `expr` anywhere in the dashboard: panel targets and annotation queries alike. */
function dashboardExpressions() {
    const out = [];
    (function walk(node) {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node && typeof node === "object") {
            if (typeof node.expr === "string") out.push(node.expr);
            Object.values(node).forEach(walk);
        }
    })(dashboard);
    return out;
}

/**
 * Every `cyberchef_mcp_*` family name referenced in the given texts.
 *
 * One definition, because this regex IS the contract between the renderer and the shipped assets.
 * It previously existed in three copies with the surrounding Set accumulation duplicated verbatim
 * -- which is the same drift this file exists to catch in the alert rules.
 *
 * @param {...string} texts - Expressions or file contents.
 * @returns {Set<string>} Referenced metric family names.
 */
function referencedMetrics(...texts) {
    const out = new Set();
    for (const text of texts) {
        for (const name of text.match(/\bcyberchef_mcp_[a-z_]+\b/g) || []) out.add(name);
    }
    return out;
}

/** Non-row panels. */
const vizPanels = dashboard.panels.filter(p => p.type !== "row");

describe("the dashboard queries what the server emits", () => {
    it("references no metric the server cannot produce", () => {
        // The failure this prevents is silent: rename a metric in prometheus.mjs and the dashboard
        // keeps loading, keeps looking right, and shows an empty panel. Nothing errors, so nothing
        // is noticed until the panel is needed -- during an incident.
        const emitted = emittedFamilies();
        const referenced = referencedMetrics(...dashboardExpressions());
        expect(referenced.size).toBeGreaterThan(15);
        expect([...referenced].filter(n => !emitted.has(n))).toEqual([]);
    });

    it("charts every metric the server emits", () => {
        // The other direction, and the one that catches a metric added and then forgotten. A series
        // nobody charts is a series nobody looks at, which is indistinguishable from not having it.
        const referenced = referencedMetrics(...dashboardExpressions());
        expect([...emittedFamilies()].filter(n => !referenced.has(n))).toEqual([]);
    });

    it("uses only OTel series that follow the MCP semantic conventions", () => {
        // These are the panels that need an operator-supplied SDK. The names are fixed by the
        // conventions plus the Prometheus exporter's mangling, so a typo here is a permanently
        // empty panel indistinguishable from "no SDK installed".
        const otel = new Set();
        for (const expr of dashboardExpressions()) {
            for (const name of expr.match(/\bmcp_server_[a-z_]+\b/g) || []) otel.add(name);
        }
        expect([...otel].sort()).toEqual([
            "mcp_server_operation_duration_seconds_bucket",
            "mcp_server_operation_duration_seconds_count"
        ]);
    });
});

describe("dashboard structure", () => {
    it("lays panels out without overlap or overflow", () => {
        // Grafana silently reflows overlapping panels rather than reporting it, so a broken layout
        // ships looking fine in the JSON and wrong in the browser.
        const occupied = new Set();
        for (const p of dashboard.panels) {
            const { x, y, w, h } = p.gridPos;
            expect(x + w, `${p.title} overflows the 24-column grid`).toBeLessThanOrEqual(24);
            for (let cx = x; cx < x + w; cx++) {
                for (let cy = y; cy < y + h; cy++) {
                    const key = `${cx},${cy}`;
                    expect(occupied.has(key), `${p.title} overlaps another panel`).toBe(false);
                    occupied.add(key);
                }
            }
        }
    });

    it("gives every panel a description", () => {
        // A dashboard is read under pressure by someone who did not build it. An undescribed panel
        // is a number with no unit of meaning.
        expect(vizPanels.filter(p => !p.description).map(p => p.title)).toEqual([]);
    });

    it("hard-codes no data source uid", () => {
        // A pinned uid makes the dashboard un-importable anywhere but the machine it was exported
        // from -- the single most common reason a shared dashboard "does not work".
        const uids = new Set();
        (function walk(n) {
            if (Array.isArray(n)) return n.forEach(walk);
            if (n && typeof n === "object") {
                if (n.datasource?.uid) uids.add(n.datasource.uid);
                Object.values(n).forEach(walk);
            }
        })(dashboard);
        expect(new Set(uids)).toEqual(new Set(["-- Grafana --", "${datasource}"]));
    });

    it("declares the variables its queries interpolate", () => {
        const declared = new Set(dashboard.templating.list.map(v => v.name));
        const used = new Set();
        for (const expr of dashboardExpressions()) {
            for (const m of expr.matchAll(/\$(?!__)([a-zA-Z_][a-zA-Z0-9_]*)/g)) used.add(m[1]);
        }
        expect([...used].filter(v => !declared.has(v))).toEqual([]);
    });

    it("stays on schema v1", () => {
        // NOT Grafana 12's v2 dynamic-dashboard schema: it is experimental, Grafana's own guidance
        // is not to use it in production, and migration is ONE-WAY -- a converted dashboard cannot
        // be converted back. v1 imports cleanly into Grafana 10, 11 and 12.
        expect(dashboard.schemaVersion).toBeLessThan(40);
        expect(dashboard.uid).toBe("cyberchef-mcp-overview");
    });
});

describe("alert rules", () => {
    const alertsText = readFileSync(ALERTS, "utf8");
    const templateText = readFileSync(RULE_TEMPLATE, "utf8");

    /**
     * The rules from the plain YAML file.
     *
     * Parsed rather than regexed. A first attempt matched `expr:` with a regular expression and
     * captured YAML's `>-` block-scalar indicator as part of the expression, reporting a drift
     * that did not exist -- a false failure, which is the worst kind of test.
     *
     * @returns {Array<Object>} Rule objects.
     */
    function standaloneRules() {
        return load(alertsText).groups[0].rules;
    }

    /**
     * The rules from the Helm template.
     *
     * The template is YAML with Go template directives interleaved, which no YAML parser accepts.
     * Whole-line directives are dropped and inline interpolations are replaced with a placeholder,
     * which leaves valid YAML with the STRUCTURE intact -- and structure is what is being compared.
     * Expressions here contain no interpolation, so they survive verbatim.
     *
     * @returns {Array<Object>} Rule objects.
     */
    function chartRules() {
        const yaml = templateText
            .replace(/\{\{\/\*[\s\S]*?\*\/\}\}/g, "")          // {{/* comments */}}
            .split("\n")
            .filter(line => !/^\s*\{\{-?[\s\S]*\}\}\s*$/.test(line))   // whole-line directives
            .join("\n")
            .replace(/\{\{`([^`]*)`\}\}/g, "$1")                   // {{`{{ $labels.x }}`}}
            .replace(/\{\{[^}]*\}\}/g, "PLACEHOLDER");             // remaining interpolations
        return load(yaml).spec.groups[0].rules;
    }

    it("ships the same alert set in the rules file and the Helm template", () => {
        // The expressions are duplicated because Helm cannot read outside the chart directory. A
        // duplication nothing checks is a duplication that drifts the first time only one side is
        // edited -- and the half that drifts is usually the one not being tested, which here is
        // the one that actually runs in the cluster.
        expect(chartRules().map(r => r.alert)).toEqual(standaloneRules().map(r => r.alert));
    });

    it("keeps the two copies of each rule semantically identical", () => {
        // Whitespace-insensitive, because YAML block scalars wrap differently in the two files and
        // a line break inside a PromQL expression changes nothing about what it means.
        const norm = (e) => String(e).replace(/\s+/g, " ")
            .replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
        const chart = new Map(chartRules().map(r => [r.alert, r]));
        for (const rule of standaloneRules()) {
            const other = chart.get(rule.alert);
            // Asserted before dereferencing. Without it a rule dropped from the Helm template
            // throws a TypeError on `other.expr`, and the failure reads as a broken harness rather
            // than as the rule drift this test exists to report.
            expect(other, `${rule.alert} is missing from the Helm template`).toBeTruthy();
            // CyberChefMCPDown alone differs on purpose: the chart scopes its job matcher to the
            // release name, which the standalone file cannot know.
            if (rule.alert !== "CyberChefMCPDown") {
                expect(norm(other.expr), `${rule.alert} expression drifted`).toBe(norm(rule.expr));
            }
            expect(other.for, `${rule.alert} "for" drifted`).toBe(rule.for);
            expect(other.labels.severity, `${rule.alert} severity drifted`)
                .toBe(rule.labels.severity);
        }
    });

    it("queries only metrics the server emits", () => {
        const emitted = emittedFamilies();
        const referenced = referencedMetrics(alertsText);
        expect(referenced.size).toBeGreaterThan(5);
        expect([...referenced].filter(n => !emitted.has(n))).toEqual([]);
    });

    it("has no latency alert, deliberately", () => {
        // Stated as a test so the absence is a decision on the record rather than an oversight
        // someone helpfully corrects. A base64 decode and a bcrypt comparison are both "one
        // operation"; any single latency threshold is useless for one or a permanent page for the
        // other. Latency belongs on the dashboard, where a human reads the distribution.
        expect(alertsText).not.toMatch(/duration_seconds.*>/);
    });

    it("aggregates every rule by job", () => {
        // One Prometheus commonly scrapes several deployments -- staging beside production, or a
        // canary beside a stable release. A bare `sum()` mixes them, so a healthy production masks
        // a staging fleet with nothing serving, and a normal rollout in one reads as version skew
        // across all of them.
        for (const rule of standaloneRules()) {
            const expr = rule.expr;
            const aggregates = [...expr.matchAll(/\b(sum|count|avg|min|max)\b\s*(by\s*\(([^)]*)\))?/g)];
            for (const [, fn, byClause, labels] of aggregates) {
                expect(byClause, `${rule.alert}: bare ${fn}() mixes deployments`).toBeTruthy();
                expect(labels.split(",").map(x => x.trim()),
                    `${rule.alert}: ${fn}() does not group by job`).toContain("job");
            }
        }
    });

    it("names no tenant, deliberately", () => {
        // Tenant identity is not in the metrics at all, so an alert could not reference one even
        // if someone tried. Pinned here because the alert file is where the temptation would land.
        expect(alertsText).not.toMatch(/\btenant_id\b|\btenant=/);
    });
});
