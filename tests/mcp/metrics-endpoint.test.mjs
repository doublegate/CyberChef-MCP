/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The /metrics route, asserted against a real listening server.
 *
 * Routing is where this endpoint's security properties actually live. It sits BEFORE the auth
 * gate, like the health probes -- a Prometheus scraper carries no bearer token -- so the only
 * things standing between it and an anonymous reader are the enablement flag and the fact that
 * the endpoint says nothing sensitive. Both are pinned here.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createTransport } from "../../src/node/transports.mjs";
import { _resetHealthForTest } from "../../src/node/lib/health.mjs";
import { TelemetryCollector } from "../../src/node/lib/telemetry.mjs";
import { LRUCache } from "../../src/node/lib/cache.mjs";
import { RateLimiter } from "../../src/node/lib/rate-limit.mjs";
import { ResourceQuotaTracker } from "../../src/node/lib/quota.mjs";

/** A do-nothing MCP server factory: these tests exercise the transport, not the protocol. */
function createServer() {
    return { connect: async () => {}, close: async () => {} };
}

let open_ = [];

/**
 * Start an HTTP transport and wait until it is actually listening.
 *
 * @param {Object} [opts] - Extra createTransport options.
 * @returns {Promise<{handle: Object, base: string, sources: Object}>} Handle, base URL, collectors.
 */
async function listening(opts = {}) {
    const sources = {
        quotaTracker: new ResourceQuotaTracker(),
        rateLimiter: new RateLimiter(),
        operationCache: new LRUCache(),
        telemetryCollector: new TelemetryCollector()
    };
    const handle = await createTransport({
        type: "http", port: 0, host: "127.0.0.1", createServer,
        metricsSources: sources, ...opts
    });
    await new Promise(resolve => {
        if (handle.httpServer.listening) return resolve();
        handle.httpServer.once("listening", resolve);
    });
    open_.push(handle);
    return { handle, base: `http://127.0.0.1:${handle.httpServer.address().port}`, sources };
}

beforeEach(() => {
    _resetHealthForTest();
    delete process.env.CYBERCHEF_METRICS_ENABLED;
});

afterEach(async () => {
    for (const h of open_) await h.closeAll?.().catch(() => {});
    open_ = [];
    delete process.env.CYBERCHEF_METRICS_ENABLED;
});

describe("enablement", () => {
    it("404s when metrics are disabled", async () => {
        // An ordinary 404, not a 403 and not a "metrics disabled" body. A prober must not be able
        // to distinguish "this server has metrics, switched off" from "this is not that server".
        const { base } = await listening();
        const res = await fetch(`${base}/metrics`);
        expect(res.status).toBe(404);
        expect(await res.text()).not.toMatch(/metric/i);
    });

    it("serves the exposition body when enabled", async () => {
        process.env.CYBERCHEF_METRICS_ENABLED = "true";
        const { base } = await listening();
        const res = await fetch(`${base}/metrics`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toMatch(/^text\/plain; version=0\.0\.4/);
        const body = await res.text();
        expect(body).toContain("# TYPE cyberchef_mcp_build_info gauge");
        expect(body.endsWith("\n")).toBe(true);
    });

    it("stays 404 when the flag is on but no collectors were supplied", async () => {
        // The transport can be constructed without metricsSources -- the tests do it, and so does
        // any embedder. Rendering an empty body there would advertise an endpoint that reports
        // nothing, which is a worse answer than not having one.
        process.env.CYBERCHEF_METRICS_ENABLED = "true";
        const { base } = await listening({ metricsSources: undefined });
        expect((await fetch(`${base}/metrics`)).status).toBe(404);
    });

    it("is never cached", async () => {
        process.env.CYBERCHEF_METRICS_ENABLED = "true";
        const { base } = await listening();
        const res = await fetch(`${base}/metrics`);
        expect(res.headers.get("cache-control")).toBe("no-store");
    });
});

describe("what the route reports", () => {
    beforeEach(() => {
        process.env.CYBERCHEF_METRICS_ENABLED = "true";
    });

    it("reads the LIVE collectors, not a private copy", async () => {
        // A metrics endpoint that keeps its own counters is a second source of truth that drifts
        // from the first one silently. Proven by mutating the collectors after the server started
        // and watching the scrape change.
        const { base, sources } = await listening();
        expect(await (await fetch(`${base}/metrics`)).text())
            .toContain("cyberchef_mcp_operations_total 0");

        sources.quotaTracker.acquire("tenant-a");
        sources.quotaTracker.acquire("tenant-a");
        sources.telemetryCollector.record({ tool: "cyberchef_md5", success: true });

        const body = await (await fetch(`${base}/metrics`)).text();
        expect(body).toContain("cyberchef_mcp_operations_total 2");
        expect(body).toContain("cyberchef_mcp_operations_in_flight 2");
        expect(body).toContain('cyberchef_mcp_tool_calls_total{tool="cyberchef_md5"} 1');
    });

    it("reports the transport's actual lifecycle state", async () => {
        const { base, handle } = await listening();
        expect(await (await fetch(`${base}/metrics`)).text())
            .toContain('cyberchef_mcp_lifecycle_state{state="serving"} 1');

        // A real delay, not 0. With delayMs 0 the drain goes straight through to closing the
        // listener and the scrape below races the shutdown -- which is exactly the window the
        // drain delay exists to keep open, so testing it with the window shut proves nothing.
        const draining = handle.drain({ delayMs: 500, timeoutMs: 500 });
        const body = await (await fetch(`${base}/metrics`)).text();
        expect(body).toContain('cyberchef_mcp_lifecycle_state{state="draining"} 1');
        expect(body).toContain('cyberchef_mcp_lifecycle_state{state="serving"} 0');
        await draining;
    });
});

describe("path matching", () => {
    beforeEach(() => {
        process.env.CYBERCHEF_METRICS_ENABLED = "true";
    });

    it("answers only the metrics path", async () => {
        const { base } = await listening();
        for (const path of ["/Metrics", "/metrics/extra", "/mcp/metrics", "/metric"]) {
            expect((await fetch(`${base}${path}`)).status, path).toBe(404);
        }
        expect((await fetch(`${base}/metrics`)).status).toBe(200);
    });

    it("tolerates a trailing slash, like every other route", async () => {
        // normalizeEndpointPath strips trailing slashes for the MCP endpoint and the probes, so
        // /metrics/ resolving is CONSISTENT rather than lax. Asserted so the shared normalisation
        // is not later "tightened" for this one route alone, which would make /metrics the only
        // path on the server where a trailing slash is fatal.
        const { base } = await listening();
        expect((await fetch(`${base}/metrics/`)).status).toBe(200);
    });

    it("ignores a query string, as the other routes do", async () => {
        const { base } = await listening();
        expect((await fetch(`${base}/metrics?format=json`)).status).toBe(200);
    });
});
