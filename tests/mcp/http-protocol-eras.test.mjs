/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Both protocol eras over HTTP, through the real listener.
 *
 * The HTTP branch serves two eras from one `createServer` factory, and routes between them with
 * `isLegacyRequest` — the entry's own classification step exported as a predicate, so the routing
 * cannot disagree with the handler it dispatches to. The eras are deliberately NOT symmetric, and
 * the asymmetry is what these tests pin:
 *
 *   - **2025 era** keeps the sessionful wiring: `Mcp-Session-Id`, the idle sweeper, the capacity
 *     limit. That is where `http-transport-sessions.test.mjs` lives.
 *   - **2026-07-28** is served per request by `createMcpHandler`, with `legacy: 'reject'` so the
 *     entry never serves its own stateless legacy fallback. A second, unaccounted route to the
 *     same tools is exactly what that option prevents.
 *
 * The security note matters more than the feature: the modern entry is documented as
 * validation-free, so the DNS-rebinding protection the sessionful transport gets from
 * `enableDnsRebindingProtection` has to be applied by hand in front of it. A forged Host must be
 * refused on BOTH paths or the modern one becomes a way around the check.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { Server } from "@modelcontextprotocol/server";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createTransport } from "../../src/node/transports.mjs";

const MODERN = "2026-07-28";

/** A minimal server, so these tests exercise routing rather than the CyberChef tool surface. */
function makeServer() {
    const s = new Server({ name: "era-test", version: "0.0.0" }, { capabilities: { tools: {} } });
    s.setRequestHandler("tools/list", async () => ({
        tools: [{ name: "ping", description: "Returns pong", inputSchema: { type: "object", properties: {} } }]
    }));
    s.setRequestHandler("tools/call", async () => ({ content: [{ type: "text", text: "pong" }] }));
    return s;
}

let handle;
let port;

beforeEach(async () => {
    handle = await createTransport({ type: "http", port: 0, createServer: makeServer });
    // `port: 0` asks the OS for an ephemeral port, which is not assigned until the socket is bound.
    await new Promise((resolve) => {
        if (handle.httpServer.listening) {
            resolve();
            return;
        }
        handle.httpServer.once("listening", resolve);
    });
    port = handle.httpServer.address().port;
});

afterEach(async () => {
    if (handle?.closeAll) await handle.closeAll();
});

/**
 * One raw HTTP POST. Raw `http` rather than `fetch`, because `fetch` refuses to let a caller set
 * Host — and a forged Host is the subject of the last test.
 *
 * @param {Object} body - JSON-RPC body.
 * @param {Object} [headers] - Extra request headers.
 * @returns {Promise<{status: number, headers: Object, body: string}>} The response.
 */
function post(body, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = http.request({
            host: "127.0.0.1", port, path: "/mcp", method: "POST",
            headers: {
                "content-type": "application/json",
                "accept": "application/json, text/event-stream",
                "content-length": Buffer.byteLength(payload),
                ...headers
            }
        }, (res) => {
            let data = "";
            res.on("data", c => {
                data += c;
            });
            res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on("error", reject);
        req.end(payload);
    });
}

/**
 * The `_meta` envelope claim that marks a request as belonging to the modern era.
 *
 * Only the Host-check case uses this hand-built form: routing and the Host check are both decided
 * before the envelope is validated, so a minimal claim exercises them, and building a complete one
 * by hand would only re-implement the client. Everything that has to actually work goes through
 * the real v2 client below.
 */
const MODERN_META = { "io.modelcontextprotocol/protocolVersion": MODERN };

/**
 * A real modern-era client, connected over Streamable HTTP.
 *
 * @returns {Promise<Client>} The connected client; the caller closes it.
 */
async function modernClient() {
    const client = new Client(
        { name: "modern-http-probe", version: "0.0.0" },
        { capabilities: {}, versionNegotiation: { mode: { pin: MODERN } } }
    );
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    return client;
}

describe("HTTP protocol eras", () => {
    it("routes a claim-less initialize to the sessionful 2025 wiring", async () => {
        const res = await post({
            jsonrpc: "2.0", id: 1, method: "initialize",
            params: {
                protocolVersion: "2025-06-18", capabilities: {},
                clientInfo: { name: "legacy", version: "0.0.0" }
            }
        });
        expect(res.status).toBe(200);
        // A session id is the visible signature of the legacy path; the modern path issues none.
        expect(res.headers["mcp-session-id"]).toBeDefined();
    });

    it("serves the 2026-07-28 entry to a client that pins it", async () => {
        const client = await modernClient();
        try {
            expect(client.getNegotiatedProtocolVersion()).toBe(MODERN);
            const { tools } = await client.listTools();
            expect(tools.map(t => t.name)).toEqual(["ping"]);
            const result = await client.callTool({ name: "ping", arguments: {} });
            expect(result.content[0].text).toBe("pong");
        } finally {
            await client.close();
        }
    });

    it("opens no session for modern traffic, so the sessionful accounting is untouched", async () => {
        const client = await modernClient();
        try {
            await client.listTools();
            // The modern leg is served per request by `createMcpHandler`. If it ever started
            // opening sessions, the capacity limit and idle sweeper would be counting two
            // different kinds of thing.
            expect(handle.sessions.size).toBe(0);
        } finally {
            await client.close();
        }
    });

    it("refuses a request with no Host header at all", async () => {
        // HTTP/1.1 requires Host, so its absence is a malformed request rather than a permissive
        // case: "no host" must never read as "no objection". Which layer catches it is not the
        // point and is not asserted -- an empty Host is rejected as a bad request (400) before it
        // reaches the allowlist check, which would have answered 403. Either way it does not
        // reach a server.
        const res = await post(
            { jsonrpc: "2.0", id: 4, method: "tools/list", params: { _meta: MODERN_META } },
            { host: "" }
        );
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
    });

    it("refuses a forged Host on the modern path, as the sessionful path already does", async () => {
        const res = await post(
            { jsonrpc: "2.0", id: 3, method: "tools/list", params: { _meta: MODERN_META } },
            { host: "evil.example.com" }
        );
        // The modern entry performs no validation of its own: if this ever returns 200, the
        // hand-written check in front of it has been lost and the endpoint is rebindable.
        expect(res.status).toBe(403);
        expect(res.body).toContain("Host header not allowed");
    });
});
