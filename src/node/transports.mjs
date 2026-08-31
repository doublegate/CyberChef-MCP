/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * MCP Transport Factory for CyberChef.
 *
 * Provides stdio (default) or Streamable HTTP transport based on
 * the CYBERCHEF_TRANSPORT environment variable.
 *
 * THE HTTP BRANCH IS PER-SESSION, AND THAT IS THE WHOLE POINT
 * ----------------------------------------------------------
 * Until v2.0.0 this file created ONE `StreamableHTTPServerTransport` for the process and routed
 * every request from every client into it. The SDK marks a transport initialized on the first
 * `initialize` it sees and then rejects any further one:
 *
 *     if (this._initialized && this.sessionId !== undefined) {
 *         return this.createJsonErrorResponse(400, -32600,
 *             'Invalid Request: Server already initialized');
 *     }
 *                       -- @modelcontextprotocol/sdk webStandardStreamableHttp.js:522
 *
 * So the FIRST client to connect worked and every client after it was refused, which is issue #36
 * exactly. Many clients also send a discovery probe before their formal handshake, so a single
 * client could burn the one available initialize on its own probe and then reject itself.
 *
 * This is not merely a lifecycle nuisance. The SDK's own advisory GHSA-345p-7cg4-v4c7 is that
 * sharing server or transport instances between clients leaks data across them, so a fresh
 * `Server` + transport pair per session is the required shape rather than the tidier one.
 *
 * What is deliberately NOT per-session: the operation cache, telemetry collector, rate limiter and
 * quota tracker stay process-wide. They are resource controls, and per-session copies would let a
 * caller reset every one of them by opening a new session.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getLogger } from "./logger.mjs";

/**
 * Supported transport types.
 */
export const TransportType = {
    STDIO: "stdio",
    HTTP: "http"
};

/** Header carrying the session id, per the Streamable HTTP spec. Node lowercases header names. */
const SESSION_HEADER = "mcp-session-id";

/** Idle sessions are reaped after this long without a request. */
export const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** How often the reaper runs. */
export const DEFAULT_SESSION_SWEEP_MS = 60 * 1000;

/**
 * Read a JSON request body, bounded.
 *
 * The body has to be read here rather than handed straight to `transport.handleRequest()`,
 * because routing needs to know whether an unsessioned POST is an `initialize` before it can
 * decide which transport to give it to. The parsed value is then passed through as `parsedBody`
 * so the stream is not consumed twice -- reading it once and forgetting to forward it is a hang,
 * not an error, which is a considerably worse failure than a rejected request.
 *
 * @param {import("node:http").IncomingMessage} req - The request.
 * @param {number} limit - Maximum accepted body size in bytes.
 * @returns {Promise<*>} The parsed JSON body.
 */
async function readJsonBody(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) {
            const err = new Error(`Request body exceeds ${limit} bytes`);
            err.statusCode = 413;
            throw err;
        }
        chunks.push(chunk);
    }
    if (size === 0) return undefined;
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        const err = new Error("Parse error: body is not valid JSON");
        err.statusCode = 400;
        throw err;
    }
}

/**
 * True when a parsed body is (or contains) an MCP `initialize` request.
 *
 * Checked structurally rather than with the SDK's `isInitializeRequest`, so that a batch is
 * handled too and so this module does not depend on a schema export whose path has moved between
 * SDK majors.
 *
 * @param {*} body - Parsed JSON-RPC body: an object or a batch array.
 * @returns {boolean} Whether the body initiates a session.
 */
export function isInitializeBody(body) {
    const one = m => Boolean(m) && typeof m === "object" && m.method === "initialize";
    return Array.isArray(body) ? body.some(one) : one(body);
}

/**
 * Normalise the session-id header to a single, trimmed string.
 *
 * Node's http module joins duplicate header values with ", " for every header except set-cookie,
 * so two `Mcp-Session-Id` headers arrive here as the STRING "aaa, bbb" rather than as an array
 * (verified against node's own parser). That value matches no session, so the request already
 * failed closed with a 404 -- but it failed for a reason no log line explained.
 *
 * Both shapes are handled anyway: `string[]` is what the type signature admits and what a future
 * Node change or a non-http caller could produce, and a comma is never valid inside a UUID, so
 * rejecting a joined value outright is strictly better than looking up a string that cannot match.
 *
 * @param {string|string[]|undefined} raw - The raw header value.
 * @returns {string|undefined} A single session id, or undefined if absent or ambiguous.
 */
export function normaliseSessionId(raw) {
    if (raw === undefined || raw === null) return undefined;
    const value = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : undefined) : raw;
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    // Empty, or a joined duplicate. Treated as "no usable session id" rather than as a lookup that
    // is guaranteed to miss.
    if (trimmed === "" || trimmed.includes(",")) return undefined;
    return trimmed;
}

/**
 * Write a JSON-RPC error response.
 *
 * @param {import("node:http").ServerResponse} res - The response.
 * @param {number} status - HTTP status code.
 * @param {number} code - JSON-RPC error code.
 * @param {string} message - Human-readable message.
 * @returns {void}
 */
function sendJsonRpcError(res, status, code, message) {
    if (res.headersSent) return;
    const body = JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null });
    // charset explicit: the body is JSON.stringify output, which may contain non-ASCII from an
    // echoed message, and a client that guesses latin-1 will mangle it.
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
}

/**
 * Create a transport instance based on configuration.
 *
 * @param {Object} options - Transport options.
 * @param {string} options.type - Transport type ("stdio" or "http").
 * @param {number} options.port - HTTP port (default: 3000).
 * @param {string} options.host - HTTP host (default: "127.0.0.1").
 * @param {Function} options.createServer - Factory returning a fresh MCP `Server` per session.
 *   Required for HTTP; a session cannot share one.
 * @param {number} options.maxBodyBytes - Maximum accepted request body (default 4 MiB).
 * @param {number} options.sessionTimeoutMs - Idle-session reap threshold.
 * @param {string[]} options.allowedHosts - Host header allowlist for DNS-rebinding protection.
 * @returns {Promise<Object>} `{ transport, httpServer, sessions?, closeAll? }`.
 */
export async function createTransport(options = {}) {
    const type = options.type || process.env.CYBERCHEF_TRANSPORT || TransportType.STDIO;
    const logger = getLogger();

    if (type === TransportType.HTTP) {
        // `??` and an explicit NaN check, NOT `||`. `port: 0` is meaningful -- it asks the OS for
        // an ephemeral port, which is how the tests avoid colliding with a developer's own server
        // -- and `0 || 3000` silently yields 3000. That exact bug was caught by the new suite on
        // its first run: every test bound 3000 and the second listener died with EADDRINUSE.
        const numeric = (value, envName, fallback) => {
            if (value !== undefined && value !== null) return value;
            const parsed = parseInt(process.env[envName], 10);
            return Number.isNaN(parsed) ? fallback : parsed;
        };
        const port = numeric(options.port, "CYBERCHEF_HTTP_PORT", 3000);
        const host = options.host || process.env.CYBERCHEF_HTTP_HOST || "127.0.0.1";
        const maxBodyBytes = numeric(options.maxBodyBytes, "CYBERCHEF_HTTP_MAX_BODY", 4 * 1024 * 1024);
        const sessionTimeoutMs = numeric(
            options.sessionTimeoutMs, "CYBERCHEF_SESSION_TIMEOUT", DEFAULT_SESSION_TIMEOUT_MS);

        // DNS-rebinding protection is opt-in because the default bind is loopback, where it adds
        // nothing. It matters when the host is 0.0.0.0 -- the configuration the issue reporter
        // used -- since a browser page can then be made to POST to the server via a rebound name.
        // The SDK deprecates its built-in check in favour of external middleware; it is wired here
        // because this server ships without one and "there is no middleware" is not a mitigation.
        const csv = (value, envName) => {
            const raw = value ?? process.env[envName];
            if (!raw) return undefined;
            const list = Array.isArray(raw) ? raw : raw.split(",");
            const cleaned = list.map(h => String(h).trim()).filter(Boolean);
            return cleaned.length ? cleaned : undefined;
        };
        const allowedHosts = csv(options.allowedHosts, "CYBERCHEF_ALLOWED_HOSTS");

        // CORS is OPT-IN, and off by default on purpose.
        //
        // A browser MCP client (MCP Inspector's web UI is one, and it is named in issue #36)
        // preflights its POST with OPTIONS, because the request carries a custom `Mcp-Session-Id`
        // header. Answering 405 there fails the preflight and the client never sends the POST.
        //
        // But permissive CORS on a server bound to 0.0.0.0 is how a hostile page reaches a local
        // MCP server, so `Access-Control-Allow-Origin: *` is not on offer. Without
        // CYBERCHEF_ALLOWED_ORIGINS the OPTIONS gets a well-formed 204 with NO allow headers,
        // which the browser correctly refuses -- default-deny, and semantically honest about the
        // method being supported, unlike a 405.
        const allowedOrigins = csv(options.allowedOrigins, "CYBERCHEF_ALLOWED_ORIGINS");

        const createServer = options.createServer;
        if (typeof createServer !== "function") {
            throw new TypeError(
                "createTransport({type:'http'}) requires a createServer factory: each session " +
                "needs its own MCP Server instance (see issue #36)."
            );
        }

        const { StreamableHTTPServerTransport } = await import(
            "@modelcontextprotocol/sdk/server/streamableHttp.js"
        );
        const http = await import("node:http");
        const { randomUUID } = await import("node:crypto");

        /**
         * CORS headers for one request, or none when the origin is not allowlisted.
         *
         * @param {import("node:http").IncomingMessage} req - The request.
         * @returns {Object} Headers to merge into the response.
         */
        function corsHeaders(req) {
            const origin = req.headers.origin;
            if (!allowedOrigins || !origin || !allowedOrigins.includes(origin)) return {};
            return {
                "Access-Control-Allow-Origin": origin,
                // Echoing the origin makes the response origin-specific, so Vary is required or a
                // shared cache can serve one origin's response to another.
                "Vary": "Origin",
                "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, Authorization",
                // Without this the browser hides Mcp-Session-Id from the client's JS, so it can
                // never send it back and every follow-up request 400s. This one line is the
                // difference between a browser client working and appearing to lose its session.
                "Access-Control-Expose-Headers": "Mcp-Session-Id",
                "Access-Control-Max-Age": "600"
            };
        }

        /** @type {Map<string, {server: Object, transport: Object, lastSeen: number}>} */
        const sessions = new Map();

        /**
         * Fire-and-forget a closeSession() without dropping a rejection on the floor.
         *
         * closeSession already try/catches both halves, so it should not reject -- but "should
         * not" is exactly the assumption the repository style guide forbids relying on ("silent
         * failure paths: ... an unawaited promise"). This makes the guarantee structural rather
         * than dependent on reading closeSession's internals, which is the point of the rule.
         *
         * @param {string} sessionId - The session to close.
         * @param {string} reason - Why, for the log line.
         * @returns {void}
         */
        function closeSessionDetached(sessionId, reason) {
            closeSession(sessionId, reason).catch(err => {
                logger.error(`session ${sessionId}: teardown failed (${reason}): ${err.message}`);
            });
        }

        /**
         * Tear down one session and forget it. Safe to call for an unknown id.
         *
         * @param {string} sessionId - The session to close.
         * @param {string} reason - Why, for the log line.
         * @returns {Promise<void>} Resolves once both halves are closed.
         */
        async function closeSession(sessionId, reason) {
            const entry = sessions.get(sessionId);
            if (!entry) return;
            sessions.delete(sessionId);
            // Both closes are best-effort: a half-closed session must not keep the map entry
            // alive, and an error here is not something a caller can act on.
            try {
                await entry.transport.close();
            } catch (err) {
                logger.debug(`session ${sessionId}: transport close failed: ${err.message}`);
            }
            try {
                await entry.server.close();
            } catch (err) {
                logger.debug(`session ${sessionId}: server close failed: ${err.message}`);
            }
            logger.info(`MCP session closed (${reason}): ${sessionId} [${sessions.size} active]`);
        }

        /**
         * Build a fresh Server + transport pair and connect them.
         *
         * @returns {Promise<Object>} The connected transport.
         */
        async function newSession() {
            const mcpServer = createServer();
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                ...(allowedHosts ?
                    { allowedHosts, enableDnsRebindingProtection: true } :
                    {}),
                onsessioninitialized: (sessionId) => {
                    sessions.set(sessionId, {
                        server: mcpServer,
                        transport,
                        lastSeen: Date.now()
                    });
                    logger.info(`MCP session initialized: ${sessionId} [${sessions.size} active]`);
                },
                onsessionclosed: (sessionId) => {
                    // Fired for a client DELETE. closeSession is idempotent, so the transport's
                    // own onclose firing afterwards is harmless.
                    closeSessionDetached(sessionId, "client DELETE");
                }
            });

            // A transport that dies for any other reason (network drop, server close) must not
            // leave its entry behind, or the map becomes a slow leak keyed by dead sessions.
            transport.onclose = () => {
                if (transport.sessionId) closeSessionDetached(transport.sessionId, "transport closed");
            };

            await mcpServer.connect(transport);
            return transport;
        }

        const httpServer = http.createServer(async (req, res) => {
            try {
                const cors = corsHeaders(req);
                for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);

                // Preflight. Answered before anything else, since it carries no body and no
                // session and must not be mistaken for a malformed request.
                if (req.method === "OPTIONS") {
                    res.writeHead(204, { "Allow": "GET, POST, DELETE, OPTIONS" });
                    res.end();
                    return;
                }

                const sessionId = normaliseSessionId(req.headers[SESSION_HEADER]);

                // GET (server-initiated SSE) and DELETE (explicit teardown) are only meaningful
                // for an established session, and both are routed purely by header.
                if (req.method === "GET" || req.method === "DELETE") {
                    const entry = sessionId ? sessions.get(sessionId) : undefined;
                    if (!entry) {
                        sendJsonRpcError(res, 404, -32001, "Session not found");
                        return;
                    }
                    entry.lastSeen = Date.now();
                    await entry.transport.handleRequest(req, res);
                    return;
                }

                if (req.method !== "POST") {
                    res.writeHead(405, { "Allow": "GET, POST, DELETE, OPTIONS" });
                    res.end();
                    return;
                }

                const body = await readJsonBody(req, maxBodyBytes);

                if (sessionId) {
                    const entry = sessions.get(sessionId);
                    if (!entry) {
                        // A stale id from a client that outlived a server restart. 404 is what the
                        // spec prescribes and what makes a conforming client re-initialize.
                        sendJsonRpcError(res, 404, -32001, "Session not found");
                        return;
                    }
                    entry.lastSeen = Date.now();
                    await entry.transport.handleRequest(req, res, body);
                    return;
                }

                // No session id. Only an initialize may open one; anything else is a client that
                // lost its session id, and answering it on a fresh session would silently give it
                // a different conversation than the one it thinks it is in.
                if (!isInitializeBody(body)) {
                    sendJsonRpcError(
                        res, 400, -32000,
                        "Bad Request: Mcp-Session-Id header required for non-initialize requests"
                    );
                    return;
                }

                const transport = await newSession();
                await transport.handleRequest(req, res, body);
            } catch (err) {
                const status = err.statusCode || 500;
                logger.error(`HTTP transport error (${status}): ${err.message}`);
                sendJsonRpcError(
                    res, status,
                    status === 400 ? -32700 : -32603,
                    // Never echo err.message for a 500: it can carry internal detail.
                    status >= 500 ? "Internal server error" : err.message
                );
            }
        });

        // Idle sessions are reaped rather than left to accumulate: a client that disappears
        // without a DELETE otherwise pins a Server instance for the lifetime of the process.
        const sweeper = setInterval(() => {
            const cutoff = Date.now() - sessionTimeoutMs;
            for (const [id, entry] of sessions) {
                if (entry.lastSeen < cutoff) closeSessionDetached(id, "idle timeout");
            }
        }, DEFAULT_SESSION_SWEEP_MS);
        // Do not hold the event loop open for the sweeper alone.
        sweeper.unref?.();

        httpServer.listen(port, host, () => {
            logger.info(`Streamable HTTP transport listening on ${host}:${port}`);
            logger.info(`  session timeout: ${Math.round(sessionTimeoutMs / 1000)}s`);
            logger.info(`  DNS rebinding protection: ${allowedHosts ? `on (${allowedHosts.join(", ")})` : "off"}`);
            logger.info(`  CORS: ${allowedOrigins ? `on (${allowedOrigins.join(", ")})` : "off -- browser clients need CYBERCHEF_ALLOWED_ORIGINS"}`);
        });

        /**
         * Close every session and the listener. Used by tests and by shutdown.
         *
         * @returns {Promise<void>} Resolves once everything is closed.
         */
        async function closeAll() {
            clearInterval(sweeper);
            await Promise.all([...sessions.keys()].map(id => closeSession(id, "server shutdown")));
            // `close()` stops accepting NEW connections but waits for existing ones to end. An
            // idle keep-alive socket -- which any HTTP/1.1 client leaves behind -- therefore hangs
            // the shutdown until its timeout. Severing them first is what makes closeAll()
            // actually close. (node >= 18.2)
            httpServer.closeAllConnections?.();
            await new Promise(resolve => httpServer.close(resolve));
        }

        // `transport` is null on purpose. There is no process-wide transport any more, and
        // returning one would invite exactly the `server.connect(transport)` that caused #36.
        return { transport: null, httpServer, sessions, closeAll };
    }

    // Default: stdio. Single connection by construction, so the module-level server is correct.
    const transport = new StdioServerTransport();
    return { transport, httpServer: null };
}

/**
 * Get the configured transport type.
 *
 * @returns {string} The transport type.
 */
export function getTransportType() {
    return process.env.CYBERCHEF_TRANSPORT || TransportType.STDIO;
}
