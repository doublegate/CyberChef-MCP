/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Streamable HTTP transport: session lifecycle and multi-client isolation.
 *
 * This is the regression suite for issue #36 -- "Server already initialized" across multiple
 * clients. Every test here drives a REAL http.Server over a real socket rather than mocking the
 * SDK, because the bug lived entirely in how requests were routed to transports; a mock of the
 * transport would have been written against the same wrong assumption and passed.
 *
 * The old `tests/mcp/transports.test.mjs` never exercised the HTTP branch at all, which is not a
 * coincidence: 36.84% line coverage on transports.mjs and the untested lines 36-57 were exactly
 * where the defect was.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// Raw http, because `fetch` refuses to let a caller set Host -- and a forged Host is the entire
// subject of the DNS-rebinding tests below.
import http from "node:http";
// The v2 SDK, matching production: `createMcpServer()` returns a v2 `Server`, so a v1 server here
// would leave the real pairing untested while still passing (the generations are wire-compatible).
import { Server } from "@modelcontextprotocol/server";
import {
    createTransport, isInitializeBody, normalizeSessionId, normalizeEndpointPath
} from "../../src/node/transports.mjs";

/**
 * A minimal MCP server standing in for the real one.
 *
 * Deliberately not the production server: these tests are about session routing, and importing
 * mcp-server.mjs would drag in the recipe manager, worker pool and a 500-tool schema build for a
 * property none of that affects. It counts its own instantiations, which is how "one Server per
 * session" is asserted rather than assumed.
 */
let serversCreated = 0;

/**
 * @returns {Server} A tiny MCP server exposing one echo tool.
 */
function createTinyServer() {
    serversCreated++;
    const id = serversCreated;
    const server = new Server(
        { name: "test-server", version: "0.0.0" },
        { capabilities: { tools: {} } }
    );
    server.setRequestHandler("tools/list", async () => ({
        tools: [{
            name: "echo",
            description: `echo from server instance ${id}`,
            inputSchema: { type: "object", properties: { text: { type: "string" } } }
        }]
    }));
    server.setRequestHandler("tools/call", async (request) => ({
        content: [{ type: "text", text: `instance ${id}: ${request.params.arguments?.text ?? ""}` }]
    }));
    return server;
}

const INITIALIZE = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "vitest", version: "0.0.0" }
    }
};

/**
 * POST a JSON-RPC body and return status, headers and parsed payload.
 *
 * The Accept header carries BOTH json and event-stream because the Streamable HTTP spec requires
 * it and the SDK returns 406 otherwise -- a failure that looks like a routing bug and is not.
 *
 * @param {string} base - Server origin.
 * @param {*} body - JSON-RPC body.
 * @param {Object} [headers] - Extra headers, e.g. a session id.
 * @returns {Promise<{status: number, sessionId: (string|null), text: string, json: *}>} Result.
 */
async function post(base, body, headers = {}) {
    const res = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            ...headers
        },
        body: JSON.stringify(body)
    });
    const text = await res.text();
    return {
        status: res.status,
        sessionId: res.headers.get("mcp-session-id"),
        text,
        json: parseMaybeSse(text)
    };
}

/**
 * Parse a response that may be plain JSON or a single SSE frame.
 *
 * The transport answers an initialize with `text/event-stream` unless `enableJsonResponse` is set,
 * so a test that only did JSON.parse would fail on the very request it is trying to assert.
 *
 * @param {string} text - Raw response body.
 * @returns {*} Parsed payload, or null if neither form parses.
 */
function parseMaybeSse(text) {
    try {
        return JSON.parse(text);
    } catch {
        const line = text.split("\n").find(l => l.startsWith("data:"));
        if (!line) return null;
        try {
            return JSON.parse(line.slice(5).trim());
        } catch {
            return null;
        }
    }
}

/**
 * Wait for a condition instead of sleeping for a guessed interval.
 *
 * A fixed `setTimeout(50)` is a bet that teardown finishes in 50 ms, which is usually true and
 * occasionally not on a loaded CI runner -- and when it loses, the failure is a confusing
 * assertion about session count rather than anything about the code under test.
 *
 * @param {Function} predicate - Called until it returns truthy.
 * @param {number} [timeoutMs] - Give up after this long.
 * @returns {Promise<void>} Resolves when the predicate holds; rejects on timeout.
 */
async function waitFor(predicate, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (predicate()) return;
        if (Date.now() > deadline) throw new Error("waitFor: condition not met within " + timeoutMs + "ms");
        await new Promise(resolve => setTimeout(resolve, 5));
    }
}

describe("Streamable HTTP transport - session lifecycle (issue #36)", () => {
    let handle;
    let base;

    beforeEach(async () => {
        serversCreated = 0;
        // Port 0: the OS picks a free one, so the suite cannot collide with a developer's own
        // server on 3000 or with a parallel test run.
        handle = await createTransport({
            type: "http",
            port: 0,
            host: "127.0.0.1",
            createServer: createTinyServer
        });
        await new Promise(resolve => {
            if (handle.httpServer.listening) return resolve();
            handle.httpServer.once("listening", resolve);
        });
        base = `http://127.0.0.1:${handle.httpServer.address().port}`;
    });

    afterEach(async () => {
        await handle.closeAll();
    });

    it("returns a null process-wide transport, because there isn't one", () => {
        // The old shape returned a single shared transport, and `server.connect(transport)` on it
        // is what made every client after the first fail. Null is load-bearing, not an oversight.
        expect(handle.transport).toBeNull();
        expect(handle.httpServer).toBeTruthy();
        expect(handle.sessions.size).toBe(0);
    });

    it("lets TWO clients both complete initialize - the exact bug from issue #36", async () => {
        const first = await post(base, INITIALIZE);
        expect(first.status).toBe(200);
        expect(first.sessionId).toBeTruthy();

        const second = await post(base, INITIALIZE);

        // Before the fix this was 400 with
        //   {"code":-32600,"message":"Invalid Request: Server already initialized"}
        expect(second.status).toBe(200);
        expect(second.text).not.toContain("Server already initialized");
        expect(second.sessionId).toBeTruthy();

        expect(second.sessionId).not.toBe(first.sessionId);
        expect(handle.sessions.size).toBe(2);
        expect(serversCreated).toBe(2);
    });

    it("survives a discovery probe followed by the formal handshake", async () => {
        // The reporter's clients probe the endpoint before handshaking. With one shared transport
        // the probe consumed the single available initialize and the client then rejected itself.
        const probe = await post(base, INITIALIZE);
        expect(probe.status).toBe(200);

        const handshake = await post(base, INITIALIZE);
        expect(handshake.status).toBe(200);
        expect(handshake.text).not.toContain("already initialized");
    });

    it("keeps ten concurrent clients isolated", async () => {
        const results = await Promise.all(
            Array.from({ length: 10 }, () => post(base, INITIALIZE))
        );
        for (const r of results) {
            expect(r.status).toBe(200);
            expect(r.sessionId).toBeTruthy();
        }
        expect(new Set(results.map(r => r.sessionId)).size).toBe(10);
        expect(handle.sessions.size).toBe(10);
        expect(serversCreated).toBe(10);
    });

    it("routes a follow-up request to its own session's server instance", async () => {
        const a = await post(base, INITIALIZE);
        const b = await post(base, INITIALIZE);

        const listA = await post(base, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
            { "mcp-session-id": a.sessionId });
        const listB = await post(base, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
            { "mcp-session-id": b.sessionId });

        expect(listA.status).toBe(200);
        expect(listB.status).toBe(200);

        // Each tiny server stamps its instance number into the tool description, so identical
        // descriptions here would mean both sessions reached the same Server -- the shared-state
        // leak GHSA-345p-7cg4-v4c7 describes, passing a naive "both got 200" assertion.
        const descA = listA.json?.result?.tools?.[0]?.description;
        const descB = listB.json?.result?.tools?.[0]?.description;
        expect(descA).toBeTruthy();
        expect(descB).toBeTruthy();
        expect(descA).not.toBe(descB);
    });

    it("rejects a non-initialize POST that carries no session id", async () => {
        const res = await post(base, { jsonrpc: "2.0", id: 9, method: "tools/list", params: {} });
        expect(res.status).toBe(400);
        expect(res.json.error.message).toContain("Mcp-Session-Id");
        // Crucially it did NOT open a session for it: answering on a fresh session would hand the
        // client a different conversation from the one it believes it is in.
        expect(handle.sessions.size).toBe(0);
    });

    it("404s an unknown session id instead of silently opening a new one", async () => {
        const res = await post(base, { jsonrpc: "2.0", id: 9, method: "tools/list", params: {} },
            { "mcp-session-id": "00000000-0000-4000-8000-000000000000" });
        expect(res.status).toBe(404);
        expect(handle.sessions.size).toBe(0);
    });

    it("tears the session down on DELETE and forgets it", async () => {
        const a = await post(base, INITIALIZE);
        expect(handle.sessions.size).toBe(1);

        const del = await fetch(`${base}/mcp`, {
            method: "DELETE",
            headers: { "mcp-session-id": a.sessionId }
        });
        expect(del.status).toBeLessThan(400);

        // The teardown is async (onsessionclosed -> closeSession), so wait for it rather than
        // sleeping a guessed interval.
        await waitFor(() => handle.sessions.size === 0);
        expect(handle.sessions.size).toBe(0);

        const after = await post(base, { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
            { "mcp-session-id": a.sessionId });
        expect(after.status).toBe(404);
    });

    it("404s a DELETE or GET for an unknown session", async () => {
        for (const method of ["DELETE", "GET"]) {
            const res = await fetch(`${base}/mcp`, {
                method,
                headers: { "mcp-session-id": "nope", "Accept": "text/event-stream" }
            });
            expect(res.status).toBe(404);
        }
    });

    it("400s a POST carrying a DUPLICATED session header instead of routing it", async () => {
        const a = await post(base, INITIALIZE);
        // Two Mcp-Session-Id headers arrive joined as "id, id". Before normalisation that string
        // was looked up directly -- a guaranteed miss that surfaced as a bare 404 with nothing to
        // explain it. It is now treated as "no usable session id", so a non-initialize request
        // gets the 400 that names the actual problem.
        const res = await fetch(`${base}/mcp`, {
            method: "POST",
            headers: [
                ["Content-Type", "application/json"],
                ["Accept", "application/json, text/event-stream"],
                ["mcp-session-id", a.sessionId],
                ["mcp-session-id", a.sessionId]
            ],
            body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/list", params: {} })
        });
        expect(res.status).toBe(400);
        // The real session is untouched.
        expect(handle.sessions.size).toBe(1);
    });

    it("404s a request to any other path, without touching session routing", async () => {
        // A browser hitting GET /favicon.ico used to be routed into the transport and answered
        // with "Session not found", which points the reader at sessions for a request that was
        // never about one.
        const res = await fetch(`${base}/favicon.ico`);
        expect(res.status).toBe(404);
        const body = JSON.parse(await res.text());
        expect(body.error.message).toContain("/mcp");
        expect(body.error.message).not.toContain("Session not found");
    });

    it("ignores a query string and a trailing slash on the endpoint path", async () => {
        const res = await fetch(`${base}/mcp/?foo=bar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream"
            },
            body: JSON.stringify(INITIALIZE)
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("mcp-session-id")).toBeTruthy();
    });

    it("404s an OPTIONS to a non-MCP path, rather than advertising an endpoint that isn't there", async () => {
        // The preflight branch used to run BEFORE the path check, so `OPTIONS /anything` returned
        // 204 -- contradicting the documented "every other path 404s" and telling a browser the
        // endpoint exists.
        const res = await fetch(`${base}/not-mcp`, {
            method: "OPTIONS",
            headers: { "Origin": "http://localhost:6274", "Access-Control-Request-Method": "POST" }
        });
        expect(res.status).toBe(404);
    });

    it("refuses a new session once at capacity, and recovers when one is released", async () => {
        // An unauthenticated initialize creates a Server + transport retained for the full session
        // timeout. Unbounded, a loop of them exhausts the process -- and session creation sits
        // outside the operation rate limiter and quota tracker, both of which only govern tool
        // calls, i.e. things that happen after a session already exists.
        const capped = await createTransport({
            type: "http", port: 0, host: "127.0.0.1",
            createServer: createTinyServer, maxSessions: 2
        });
        await new Promise(resolve => {
            if (capped.httpServer.listening) return resolve();
            capped.httpServer.once("listening", resolve);
        });
        const cappedBase = `http://127.0.0.1:${capped.httpServer.address().port}`;
        try {
            const a = await post(cappedBase, INITIALIZE);
            const b = await post(cappedBase, INITIALIZE);
            expect(a.status).toBe(200);
            expect(b.status).toBe(200);
            expect(capped.sessions.size).toBe(2);

            const refused = await post(cappedBase, INITIALIZE);
            expect(refused.status).toBe(503);
            expect(refused.json.error.message).toContain("session capacity");
            expect(capped.sessions.size).toBe(2);

            // Freeing a slot must actually free it -- a leaked reservation would keep refusing.
            await fetch(`${cappedBase}/mcp`, { method: "DELETE", headers: { "mcp-session-id": a.sessionId } });
            await waitFor(() => capped.sessions.size === 1);

            const admitted = await post(cappedBase, INITIALIZE);
            expect(admitted.status).toBe(200);
            expect(capped.sessions.size).toBe(2);
        } finally {
            await capped.closeAll();
        }
    });

    it("holds the cap against a CONCURRENT burst, not just sequential requests", async () => {
        // The reason a pending counter exists: a session does not enter the map until
        // onsessioninitialized fires inside handleRequest, so checking only sessions.size lets a
        // simultaneous burst all pass the capacity check before any of them lands.
        const capped = await createTransport({
            type: "http", port: 0, host: "127.0.0.1",
            createServer: createTinyServer, maxSessions: 3
        });
        await new Promise(resolve => {
            if (capped.httpServer.listening) return resolve();
            capped.httpServer.once("listening", resolve);
        });
        const cappedBase = `http://127.0.0.1:${capped.httpServer.address().port}`;
        try {
            const results = await Promise.all(
                Array.from({ length: 12 }, () => post(cappedBase, INITIALIZE))
            );
            const ok = results.filter(r => r.status === 200);
            const refused = results.filter(r => r.status === 503);
            expect(ok.length).toBeLessThanOrEqual(3);
            expect(ok.length + refused.length).toBe(12);
            expect(capped.sessions.size).toBeLessThanOrEqual(3);
        } finally {
            await capped.closeAll();
        }
    });

    it("reaps an idle session and closes both of its halves", async () => {
        // The CYBERCHEF_SESSION_TIMEOUT path. Driven with a short timeout and a short sweep
        // interval rather than by waiting out the 30-minute default.
        const reaped = await createTransport({
            type: "http", port: 0, host: "127.0.0.1",
            createServer: createTinyServer,
            sessionTimeoutMs: 30,
            sweepIntervalMs: 10
        });
        await new Promise(resolve => {
            if (reaped.httpServer.listening) return resolve();
            reaped.httpServer.once("listening", resolve);
        });
        const reapedBase = `http://127.0.0.1:${reaped.httpServer.address().port}`;
        try {
            const a = await post(reapedBase, INITIALIZE);
            expect(reaped.sessions.size).toBe(1);
            const entry = reaped.sessions.get(a.sessionId);
            expect(entry).toBeTruthy();

            const transportClosed = vi.spyOn(entry.transport, "close");
            const serverClosed = vi.spyOn(entry.server, "close");

            await waitFor(() => reaped.sessions.size === 0, 3000);

            // Both halves closed, not just the map entry dropped -- an entry removed without
            // closing its transport leaks the socket and the Server.
            expect(transportClosed).toHaveBeenCalled();
            expect(serverClosed).toHaveBeenCalled();

            // And the id is genuinely gone.
            const after = await post(reapedBase, { jsonrpc: "2.0", id: 7, method: "tools/list", params: {} },
                { "mcp-session-id": a.sessionId });
            expect(after.status).toBe(404);
        } finally {
            await reaped.closeAll();
        }
    });

    it("405s an unsupported method", async () => {
        const res = await fetch(`${base}/mcp`, { method: "PUT" });
        expect(res.status).toBe(405);
        expect(res.headers.get("allow")).toContain("POST");
        expect(res.headers.get("allow")).toContain("OPTIONS");
    });

    it("answers a CORS preflight instead of 405ing it", async () => {
        // A browser MCP client (MCP Inspector's web UI, named in issue #36) preflights its POST
        // because the request carries a custom Mcp-Session-Id header. A 405 here means the POST is
        // never sent and the client fails with no useful diagnostic.
        const res = await fetch(`${base}/mcp`, {
            method: "OPTIONS",
            headers: {
                "Origin": "http://localhost:6274",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type, mcp-session-id"
            }
        });
        expect(res.status).toBe(204);
        expect(res.headers.get("allow")).toContain("OPTIONS");
    });

    it("sends NO CORS allow headers unless an origin is allowlisted", async () => {
        // Default-deny. Permissive CORS on a server that may be bound to 0.0.0.0 is how a hostile
        // page reaches a local MCP server, so `*` is not on offer.
        const res = await fetch(`${base}/mcp`, {
            method: "OPTIONS",
            headers: { "Origin": "http://evil.example" }
        });
        expect(res.status).toBe(204);
        expect(res.headers.get("access-control-allow-origin")).toBeNull();
        // No allowlist configured at all, so the response cannot vary by origin and Vary would be
        // noise. (With an allowlist, rejections DO carry it -- asserted below.)
        expect(res.headers.get("vary")).toBeNull();
    });

    it("sends CORS headers for an allowlisted origin, and exposes Mcp-Session-Id", async () => {
        const cors = await createTransport({
            type: "http", port: 0, host: "127.0.0.1",
            createServer: createTinyServer,
            allowedOrigins: ["http://localhost:6274"]
        });
        await new Promise(resolve => {
            if (cors.httpServer.listening) return resolve();
            cors.httpServer.once("listening", resolve);
        });
        const corsBase = `http://127.0.0.1:${cors.httpServer.address().port}`;
        try {
            const pre = await fetch(`${corsBase}/mcp`, {
                method: "OPTIONS",
                headers: {
                    "Origin": "http://localhost:6274",
                    "Access-Control-Request-Method": "POST"
                }
            });
            expect(pre.status).toBe(204);
            expect(pre.headers.get("access-control-allow-origin")).toBe("http://localhost:6274");
            expect(pre.headers.get("vary")).toContain("Origin");
            expect(pre.headers.get("access-control-allow-headers")).toContain("Mcp-Session-Id");

            // Without Expose-Headers the browser hides Mcp-Session-Id from the client's JS, so it
            // can never echo it back and every follow-up request 400s. This assertion is the
            // difference between a browser client working and appearing to lose its session.
            expect(pre.headers.get("access-control-expose-headers")).toContain("Mcp-Session-Id");

            const init = await fetch(`${corsBase}/mcp`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    "Origin": "http://localhost:6274"
                },
                body: JSON.stringify(INITIALIZE)
            });
            expect(init.status).toBe(200);
            expect(init.headers.get("access-control-allow-origin")).toBe("http://localhost:6274");
            expect(init.headers.get("access-control-expose-headers")).toContain("Mcp-Session-Id");

            // A different origin gets no allow header -- but it DOES get Vary: Origin. Without
            // that, a shared cache could store this header-less response and later serve it to
            // the allowlisted origin, failing CORS for a request that should have succeeded.
            const other = await fetch(`${corsBase}/mcp`, {
                method: "OPTIONS",
                headers: { "Origin": "http://evil.example" }
            });
            expect(other.headers.get("access-control-allow-origin")).toBeNull();
            expect(other.headers.get("vary")).toContain("Origin");
        } finally {
            await cors.closeAll();
        }
    });

    it("413s a body over the limit without opening a session", async () => {
        const small = await createTransport({
            type: "http", port: 0, host: "127.0.0.1",
            createServer: createTinyServer, maxBodyBytes: 64
        });
        await new Promise(resolve => {
            if (small.httpServer.listening) return resolve();
            small.httpServer.once("listening", resolve);
        });
        const smallBase = `http://127.0.0.1:${small.httpServer.address().port}`;
        try {
            const res = await post(smallBase, {
                ...INITIALIZE,
                params: { ...INITIALIZE.params, padding: "x".repeat(500) }
            });
            expect(res.status).toBe(413);
            expect(small.sessions.size).toBe(0);
        } finally {
            await small.closeAll();
        }
    });

    it("echoes the request id in a JSON-RPC error when it knows it", async () => {
        // JSON-RPC 2.0 permits `id: null` only when the id could not be determined. For a
        // well-formed body that simply lacks a session header, it is known -- and echoing it is
        // what lets a client correlate the failure with the call it made.
        const res = await post(base, { jsonrpc: "2.0", id: 4242, method: "tools/list", params: {} });
        expect(res.status).toBe(400);
        expect(res.json.id).toBe(4242);

        // A batch has several ids and therefore no single one to echo: null is correct there.
        const batch = await post(base, [
            { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
            { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }
        ]);
        expect(batch.status).toBe(400);
        expect(batch.json.id).toBeNull();
    });

    it("400s an EMPTY body with a message about the body, not about a header", async () => {
        // This used to fall through to "Mcp-Session-Id header required", which is true and
        // unhelpful: the caller sent nothing, so pointing at a header sends them looking in the
        // wrong place.
        const res = await fetch(`${base}/mcp`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" }
        });
        expect(res.status).toBe(400);
        const body = JSON.parse(await res.text());
        expect(body.error.message).toContain("empty request body");
        expect(body.error.message).not.toContain("Mcp-Session-Id");
        expect(handle.sessions.size).toBe(0);
    });

    it("400s a malformed JSON body", async () => {
        const res = await fetch(`${base}/mcp`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
            body: "{ not json"
        });
        expect(res.status).toBe(400);
        expect(handle.sessions.size).toBe(0);
    });

    it("closeAll() closes every live session", async () => {
        await post(base, INITIALIZE);
        await post(base, INITIALIZE);
        expect(handle.sessions.size).toBe(2);

        await handle.closeAll();
        expect(handle.sessions.size).toBe(0);

        // afterEach calls closeAll again; it must be idempotent rather than throw.
    });
});

describe("DNS-rebinding protection", () => {
    /**
     * Stand up a transport and wait for it to bind, returning it plus its real origin.
     *
     * @param {Object} opts - Extra createTransport options.
     * @returns {Promise<{handle: Object, base: string, port: number}>} The bound server.
     */
    async function boot(opts = {}) {
        const h = await createTransport({
            type: "http", port: 0, host: "127.0.0.1",
            createServer: createTinyServer,
            ...opts
        });
        await new Promise(resolve => {
            if (h.httpServer.listening) return resolve();
            h.httpServer.once("listening", resolve);
        });
        const port = h.httpServer.address().port;
        return { handle: h, base: `http://127.0.0.1:${port}`, port };
    }

    /**
     * POST an initialize with an explicit, possibly-forged Host header.
     *
     * `fetch` will not let a caller override Host, so this speaks HTTP directly -- which is the
     * only way to reproduce the attack, since the whole point is a Host that does not match the
     * address the socket actually connected to.
     *
     * @param {number} port - Port to connect to on 127.0.0.1.
     * @param {string} host - The Host header value to send.
     * @returns {Promise<{status: number, body: string}>} Status line and body.
     */
    function postWithHost(port, host) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify(INITIALIZE);
            const req = http.request({
                host: "127.0.0.1",
                port,
                path: "/mcp",
                method: "POST",
                headers: {
                    "Host": host,
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    "Content-Length": Buffer.byteLength(payload)
                }
            }, res => {
                let body = "";
                res.setEncoding("utf8");
                res.on("data", c => {
                    body += c;
                });
                res.on("end", () => resolve({ status: res.statusCode, body }));
            });
            req.on("error", reject);
            req.end(payload);
        });
    }

    it("is ON BY DEFAULT and rejects a rebound Host", async () => {
        // The attack this exists to stop: a page on evil.example whose DNS is rebound to
        // 127.0.0.1. The browser treats the request as same-origin with itself, so no preflight
        // is sent and the CORS default-deny is never consulted. The Host header is the only
        // thing left that still tells the truth.
        const { handle: h, port } = await boot();
        try {
            const res = await postWithHost(port, "evil.example:" + port);
            expect(res.status).toBe(403);
            expect(res.body).toMatch(/Invalid Host header/);
        } finally {
            await h.closeAll();
        }
    });

    it("accepts the loopback names it is actually reached by, with and without the port", async () => {
        const { handle: h, port } = await boot();
        try {
            for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, "127.0.0.1", "localhost"]) {
                const res = await postWithHost(port, host);
                expect(res.status, `Host: ${host}`).toBe(200);
            }
        } finally {
            await h.closeAll();
        }
    });

    it("honours an explicit allowlist instead of the default", async () => {
        const { handle: h, port } = await boot({ allowedHosts: ["mcp.internal:9000"] });
        try {
            expect((await postWithHost(port, "mcp.internal:9000")).status).toBe(200);
            // The loopback defaults are REPLACED, not merged -- an explicit list means the
            // operator has said what they will be reached by.
            expect((await postWithHost(port, `127.0.0.1:${port}`)).status).toBe(403);
        } finally {
            await h.closeAll();
        }
    });

    it("can be disabled outright with the explicit `*` opt-out", async () => {
        const { handle: h, port } = await boot({ allowedHosts: ["*"] });
        try {
            expect((await postWithHost(port, "evil.example:" + port)).status).toBe(200);
        } finally {
            await h.closeAll();
        }
    });
});

describe("endpoint path routing", () => {
    it("normalizes both sides of the comparison identically", () => {
        // The bug this guards: the two sides were normalized SEPARATELY and only the request side
        // had the `|| "/"` fallback, so a configured "/" became "" while a request for it became
        // "/" -- and the one path that could never work was the root.
        expect(normalizeEndpointPath("/")).toBe("/");
        expect(normalizeEndpointPath("//")).toBe("/");
        expect(normalizeEndpointPath("")).toBe("/");
        expect(normalizeEndpointPath(undefined)).toBe("/");
        expect(normalizeEndpointPath("/mcp")).toBe("/mcp");
        expect(normalizeEndpointPath("/mcp/")).toBe("/mcp");
        expect(normalizeEndpointPath("/mcp///")).toBe("/mcp");
        expect(normalizeEndpointPath("/mcp?x=1")).toBe("/mcp");
    });

    it("serves a root endpoint when CYBERCHEF_HTTP_PATH is /", async () => {
        const h = await createTransport({
            type: "http", port: 0, host: "127.0.0.1", path: "/",
            createServer: createTinyServer
        });
        await new Promise(resolve => {
            if (h.httpServer.listening) return resolve();
            h.httpServer.once("listening", resolve);
        });
        const rootBase = `http://127.0.0.1:${h.httpServer.address().port}`;
        try {
            const res = await fetch(rootBase + "/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream"
                },
                body: JSON.stringify(INITIALIZE)
            });
            expect(res.status).toBe(200);
            expect(res.headers.get("mcp-session-id")).toBeTruthy();
        } finally {
            await h.closeAll();
        }
    });
});

describe("createTransport - HTTP guard rails", () => {
    it("refuses to build an HTTP transport without a per-session server factory", async () => {
        await expect(
            createTransport({ type: "http", port: 0, host: "127.0.0.1" })
        ).rejects.toThrow(/createServer factory/);
    });
});

describe("normalizeSessionId", () => {
    it("passes a single trimmed id through", () => {
        expect(normalizeSessionId("abc")).toBe("abc");
        expect(normalizeSessionId("  abc  ")).toBe("abc");
        expect(normalizeSessionId(["abc"])).toBe("abc");
    });

    it("rejects a DUPLICATED header rather than looking up a value that cannot match", () => {
        // Node joins duplicate header values with ", " for every header except set-cookie, so two
        // `Mcp-Session-Id` headers arrive as the string "aaa, bbb" -- verified against node's own
        // parser. A comma is never valid inside a UUID.
        expect(normalizeSessionId("aaa, bbb")).toBeUndefined();
        expect(normalizeSessionId(["aaa", "bbb"])).toBeUndefined();
    });

    it("treats absent, empty and non-string values as no session", () => {
        expect(normalizeSessionId(undefined)).toBeUndefined();
        expect(normalizeSessionId(null)).toBeUndefined();
        expect(normalizeSessionId("")).toBeUndefined();
        expect(normalizeSessionId("   ")).toBeUndefined();
        expect(normalizeSessionId([])).toBeUndefined();
        expect(normalizeSessionId(42)).toBeUndefined();
    });
});

describe("isInitializeBody", () => {
    it("recognises a single initialize request", () => {
        expect(isInitializeBody({ jsonrpc: "2.0", id: 1, method: "initialize" })).toBe(true);
    });

    it("recognises an initialize inside a batch", () => {
        expect(isInitializeBody([
            { jsonrpc: "2.0", id: 1, method: "ping" },
            { jsonrpc: "2.0", id: 2, method: "initialize" }
        ])).toBe(true);
    });

    it("rejects other methods, and anything that is not a message", () => {
        expect(isInitializeBody({ jsonrpc: "2.0", id: 1, method: "tools/list" })).toBe(false);
        expect(isInitializeBody([])).toBe(false);
        expect(isInitializeBody(null)).toBe(false);
        expect(isInitializeBody(undefined)).toBe(false);
        expect(isInitializeBody("initialize")).toBe(false);
    });
});
