/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Health probes and graceful draining, asserted against a real listening server.
 *
 * The properties here are the ones a rolling deploy depends on, and two of them are the opposite
 * of what a naive implementation does:
 *
 *   - liveness stays 200 **while draining**, because a liveness failure gets the pod killed
 *     mid-drain;
 *   - readiness flips to 503 the moment draining starts, which is what makes the load balancer
 *     route around this process before it stops.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createTransport } from "../../src/node/transports.mjs";
import {
    HEALTH_PATHS, LIFECYCLE, isHealthPath, healthResponse,
    lifecycleState, markServing, markDraining, _resetHealthForTest
} from "../../src/node/lib/health.mjs";

/** A do-nothing MCP server factory: these tests exercise the transport, not the protocol. */
function createServer() {
    return { connect: async () => {}, close: async () => {} };
}

/**
 * Start an HTTP transport and wait until it is actually listening.
 *
 * `createTransport` returns before `listen` completes, so `address()` is null until the
 * `listening` event -- the same wait the existing HTTP session tests do.
 *
 * @returns {Promise<{handle: Object, base: string}>} The handle and its base URL.
 */
async function listening() {
    const handle = await createTransport({
        type: "http", port: 0, host: "127.0.0.1", createServer
    });
    await new Promise(resolve => {
        if (handle.httpServer.listening) return resolve();
        handle.httpServer.once("listening", resolve);
    });
    return { handle, base: `http://127.0.0.1:${handle.httpServer.address().port}` };
}

describe("health module", () => {
    beforeEach(() => _resetHealthForTest());

    it("recognises exactly the three probe paths", () => {
        expect(isHealthPath(HEALTH_PATHS.LIVE)).toBe(true);
        expect(isHealthPath(HEALTH_PATHS.READY)).toBe(true);
        expect(isHealthPath(HEALTH_PATHS.STARTUP)).toBe(true);
        expect(isHealthPath("/health")).toBe(false);
        expect(isHealthPath("/mcp")).toBe(false);
        expect(isHealthPath("/health/live/../mcp")).toBe(false);
    });

    it("keeps liveness at 200 in every state, including draining", () => {
        // The assertion that protects a drain from the kubelet.
        for (const enter of [() => {}, markServing, markDraining]) {
            enter();
            expect(healthResponse(HEALTH_PATHS.LIVE).status).toBe(200);
        }
        expect(lifecycleState()).toBe(LIFECYCLE.DRAINING);
    });

    it("fails readiness before serving, passes while serving, fails again while draining", () => {
        expect(healthResponse(HEALTH_PATHS.READY).status).toBe(503);
        markServing();
        expect(healthResponse(HEALTH_PATHS.READY).status).toBe(200);
        markDraining();
        expect(healthResponse(HEALTH_PATHS.READY).status).toBe(503);
    });

    it("does not let a late listening callback undo a drain", () => {
        // `createTransport()` returns BEFORE the `listening` callback fires, so a SIGTERM in that
        // window drains a server whose listener is still binding -- and the callback then lands
        // afterwards. Without the guard it flips readiness back to 200 in the middle of a
        // shutdown, telling the load balancer to resume sending traffic to a process that is going
        // away. Measured before the fix: `draining ready=503` then `serving ready=200`.
        //
        // DRAINING is terminal. The only exit is process exit.
        markDraining();
        markServing();
        expect(lifecycleState()).toBe(LIFECYCLE.DRAINING);
        expect(healthResponse(HEALTH_PATHS.READY).status).toBe(503);
        // Liveness is unaffected either way -- it must stay up through the whole drain.
        expect(healthResponse(HEALTH_PATHS.LIVE).status).toBe(200);
    });

    it("passes startup once started and does not fail again on drain", () => {
        // startupProbe exists to stop the other probes firing during a slow boot. Once started,
        // it must stay started -- an orchestrator that sees it fail later restarts the pod.
        expect(healthResponse(HEALTH_PATHS.STARTUP).status).toBe(503);
        markServing();
        expect(healthResponse(HEALTH_PATHS.STARTUP).status).toBe(200);
        markDraining();
        expect(healthResponse(HEALTH_PATHS.STARTUP).status).toBe(200);
    });

    it("answers an unrecognised path with 404 rather than throwing", () => {
        // The `default` arm is unreachable through `isHealthPath`, and exists so a future caller
        // that forgets the guard degrades into an ordinary not-found instead of a 500. Asserted
        // rather than ignored: a defensive branch nobody exercises is a branch nobody knows works.
        expect(healthResponse("/health/nonsense")).toEqual({
            status: 404, body: { status: "not found" }
        });
    });

    it("reports nothing but a status, so an unauthenticated probe leaks nothing", () => {
        markServing();
        for (const p of Object.values(HEALTH_PATHS)) {
            expect(Object.keys(healthResponse(p).body)).toEqual(["status"]);
        }
    });
});

describe("health endpoints over the real HTTP transport", () => {
    let handle, base;

    beforeEach(async () => {
        _resetHealthForTest();
        ({ handle, base } = await listening());
    });

    afterEach(async () => {
        await handle?.closeAll();
    });

    it("answers all three probes without a token", async () => {
        // No Authorization header anywhere in this test: that is the point.
        for (const [path, expected] of [
            [HEALTH_PATHS.LIVE, 200], [HEALTH_PATHS.READY, 200], [HEALTH_PATHS.STARTUP, 200]
        ]) {
            const res = await fetch(base + path);
            expect(res.status, path).toBe(expected);
            expect(res.headers.get("content-type")).toContain("application/json");
            // A cached "ready" is exactly what a drain must not leave behind in a proxy.
            expect(res.headers.get("cache-control")).toBe("no-store");
        }
    });

    it("is ready as soon as the listener is bound", async () => {
        const res = await fetch(base + HEALTH_PATHS.READY);
        expect(await res.json()).toEqual({ status: "ready" });
    });

    it("does not shadow the MCP endpoint or the 404 for anything else", async () => {
        const res = await fetch(base + "/health", { method: "GET" });
        expect(res.status).toBe(404);
    });
});

describe("draining", () => {
    let handle, base;

    beforeEach(async () => {
        _resetHealthForTest();
        ({ handle, base } = await listening());
    });

    afterEach(async () => {
        await handle?.closeAll();
    });

    it("fails readiness but keeps liveness up, and still serves during the grace window", async () => {
        expect((await fetch(base + HEALTH_PATHS.READY)).status).toBe(200);

        // No sleep-and-hope here. `drain()` calls markDraining() synchronously before its first
        // await, so the state has already flipped by the time it returns a promise -- and the
        // grace window keeps the listener up while we sample. Sleeping a fixed 80ms into a 300ms
        // window instead would be a race that passes on an idle machine and fails on a loaded one.
        const draining = handle.drain({ delayMs: 300, timeoutMs: 2000 });

        const ready = await fetch(base + HEALTH_PATHS.READY);
        const live = await fetch(base + HEALTH_PATHS.LIVE);

        expect(ready.status).toBe(503);
        expect(await ready.json()).toEqual({ status: "draining" });
        // The one that stops the kubelet killing the pod mid-drain.
        expect(live.status).toBe(200);

        await draining;
    }, 20_000);

    it("closes the listener when the drain finishes", async () => {
        await handle.drain({ delayMs: 0, timeoutMs: 1000 });
        await expect(fetch(base + HEALTH_PATHS.LIVE)).rejects.toThrow();
    }, 20_000);

    it("does not wait the full timeout when nothing is in flight", async () => {
        // Guards the in-flight counter against leaking. A leaked counter never reaches zero, so
        // every drain would sit out its entire timeout -- slow, and invisible until a deploy.
        // A 30s cap against a 5s bound: a six-fold margin, so this measures "returned promptly"
        // rather than measuring how loaded the CI runner is. A leaked counter never reaches zero
        // and would sit out the whole 30s, which no amount of load can imitate.
        const started = Date.now();
        await handle.drain({ delayMs: 0, timeoutMs: 30_000 });
        expect(Date.now() - started).toBeLessThan(5000);
    }, 60_000);

    it("counts a completed request back down, so a later drain is still fast", async () => {
        await fetch(base + HEALTH_PATHS.LIVE);
        await fetch(base + "/nope").catch(() => {});
        const started = Date.now();
        await handle.drain({ delayMs: 0, timeoutMs: 30_000 });
        expect(Date.now() - started).toBeLessThan(5000);
    }, 60_000);
});
