/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * MCP Transport Factory for CyberChef.
 *
 * Provides stdio (default), Streamable HTTP, or a socket binding, selected by the
 * CYBERCHEF_TRANSPORT environment variable.
 *
 *   stdio   - the process's own stdin/stdout. One connection by construction.
 *   http    - Streamable HTTP, per session, serving both protocol eras.
 *   socket  - the stdio binding over a Unix domain socket or loopback TCP stream, one pinned
 *             server instance per connection. CYBERCHEF_SOCKET_PATH or CYBERCHEF_SOCKET_PORT
 *             (+ CYBERCHEF_SOCKET_HOST, CYBERCHEF_SOCKET_MAX_CONNECTIONS,
 *             CYBERCHEF_SOCKET_ALLOW_REMOTE).
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

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { getLogger } from "./logger.mjs";
import {
    loadAuthConfig, protectedResourceMetadata, unauthorizedChallenge, insufficientScopeChallenge,
    verifyToken, bearerFrom, subjectDigest, satisfies, withAuthContext
} from "./lib/auth.mjs";
import { audit, OUTCOME } from "./lib/audit.mjs";

/**
 * Whether a path is the RFC 9728 discovery document.
 *
 * Both forms are accepted. RFC 9728 inserts the well-known segment before the resource path, so a
 * server at `/mcp` is discovered at `/.well-known/oauth-protected-resource/mcp` -- but clients in
 * the wild also request the bare form, and answering only the spec-exact one makes the server look
 * unprotected to a client that guessed. Both describe the same single resource here.
 *
 * @param {string} path - The normalised request path.
 * @returns {boolean} Whether to serve the metadata document.
 */
function isProtectedResourceMetadataPath(path) {
    return path === "/.well-known/oauth-protected-resource" ||
        path.startsWith("/.well-known/oauth-protected-resource/");
}

/**
 * Supported transport types.
 */
export const TransportType = {
    STDIO: "stdio",
    HTTP: "http",
    SOCKET: "socket"
};

/** Connections accepted concurrently on the socket transport, unless configured otherwise. */
export const DEFAULT_SOCKET_MAX_CONNECTIONS = 16;

/**
 * Whether a bind address is loopback-only.
 *
 * The socket transport carries NO authentication -- it is the stdio binding over a stream, and the
 * stdio binding's security model is "the peer already has your process". On a Unix socket that is
 * filesystem permissions; on TCP it is nothing at all. So a non-loopback bind is refused unless it
 * is asked for explicitly, because the failure mode is an unauthenticated MCP server, exposing 504
 * operations, reachable from the network by anyone who can route to it.
 *
 * @param {string} host - The bind address.
 * @returns {boolean} True when the address is loopback.
 */
export function isLoopbackAddress(host) {
    if (!host) return false;
    const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
    if (bare === "localhost" || bare === "::1" || bare === "0:0:0:0:0:0:0:1") return true;
    // The whole 127.0.0.0/8 block is loopback, not just 127.0.0.1.
    return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare);
}

/** Header carrying the session id, per the Streamable HTTP spec. Node lowercases header names. */
const SESSION_HEADER = "mcp-session-id";

/** Idle sessions are reaped after this long without a request. */
export const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** How often the reaper runs. */
export const DEFAULT_SESSION_SWEEP_MS = 60 * 1000;

/**
 * The longest usable Unix domain socket path on this platform.
 *
 * `sockaddr_un.sun_path` is a fixed 108-byte field on Linux and 104 on macOS/BSD, NUL included, and
 * the kernel rejects anything longer with a bare `EINVAL: invalid argument` that names the path but
 * says nothing about why. That is close to unguessable -- it was hit here with a perfectly ordinary
 * 128-character path under a temp directory -- so the length is checked up front instead.
 *
 * @returns {number} Maximum path length in bytes.
 */
export function maxSocketPathLength() {
    return process.platform === "darwin" ? 103 : 107;
}

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
 * Normalize the session-id header to a single, trimmed string.
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
export function normalizeSessionId(raw) {
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
 * Normalize a URL or configured endpoint path for comparison.
 *
 * Drops any query string, strips trailing slashes, and maps the empty result back to "/" so that
 * a root endpoint compares equal to itself. Used on BOTH the request path and the configured path,
 * so the two cannot drift apart.
 *
 * @param {string|undefined} value - A request URL or a configured path.
 * @returns {string} The normalized path.
 */
export function normalizeEndpointPath(value) {
    return (value || "").split("?")[0].replace(/\/+$/, "") || "/";
}

/**
 * The request id from a parsed body, when there is exactly one unambiguous candidate.
 *
 * A batch has several, so there is no single id to echo and null is the correct answer -- which is
 * also what JSON-RPC 2.0 prescribes when the id cannot be determined.
 *
 * @param {*} body - Parsed JSON-RPC body.
 * @returns {string|number|null} The id, or null.
 */
function requestIdOf(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const id = body.id;
    return typeof id === "string" || typeof id === "number" ? id : null;
}

/**
 * Write a JSON-RPC error response.
 *
 * @param {import("node:http").ServerResponse} res - The response.
 * @param {number} status - HTTP status code.
 * @param {number} code - JSON-RPC error code.
 * @param {string} message - Human-readable message.
 * @param {string|number|null} [id] - The request id to echo, when it is known.
 * @returns {void}
 */
function sendJsonRpcError(res, status, code, message, id = null) {
    if (res.headersSent) return;
    // JSON-RPC 2.0 requires `id` to match the request when it could be determined, and permits
    // null only when it could not (a parse error, or a body that never yielded one). Echoing it
    // where we DO know it is what lets a client correlate the failure with the call it made.
    const body = JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id });
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
 * @param {Object} [options.transport] - stdio only: serve over this transport instead of the
 *   process's own stdin/stdout. Used by the tests, and by any stdio binding over a socket.
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
        // The MCP endpoint path. Configurable rather than hardcoded so the server can be mounted
        // elsewhere, but checked, so an unrelated request (a browser's GET /favicon.ico) gets a
        // plain 404 instead of being routed into the transport and answered with the confusing
        // "Session not found".
        const mcpPath = options.path || process.env.CYBERCHEF_HTTP_PATH || "/mcp";
        // BOTH sides of the route comparison go through this, which is the point of extracting it.
        // They were normalized separately, and only the request side had the `|| "/"` fallback --
        // so `CYBERCHEF_HTTP_PATH=/` normalized the configured path to the empty string while a
        // request for it normalized to "/", and every request 404'd. A root endpoint is a
        // perfectly reasonable thing to configure, and it was the one value that could not work.
        const mcpPathNormalized = normalizeEndpointPath(mcpPath);
        // Hard cap on concurrent sessions.
        //
        // Without one, a single unauthenticated `initialize` creates a Server + transport pair
        // that is retained for CYBERCHEF_SESSION_TIMEOUT (30 minutes by default), and a loop of
        // them exhausts the process. Session creation sits OUTSIDE the operation rate limiter and
        // the resource quota tracker -- both of those govern tool calls, which by definition
        // happen after a session exists -- so nothing else was bounding this.
        const maxSessions = numeric(options.maxSessions, "CYBERCHEF_MAX_SESSIONS", 100);
        // Exposed so the reaping path is testable in bounded time; not an env var, because there
        // is no operational reason to change it.
        const sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SESSION_SWEEP_MS;
        const host = options.host || process.env.CYBERCHEF_HTTP_HOST || "127.0.0.1";
        const maxBodyBytes = numeric(options.maxBodyBytes, "CYBERCHEF_HTTP_MAX_BODY", 4 * 1024 * 1024);
        const sessionTimeoutMs = numeric(
            options.sessionTimeoutMs, "CYBERCHEF_SESSION_TIMEOUT", DEFAULT_SESSION_TIMEOUT_MS);

        // DNS-rebinding protection is ON BY DEFAULT.
        //
        // An earlier version of this comment said it was opt-in "because the default bind is
        // loopback, where it adds nothing". That was WRONG, and it had the attack backwards:
        // DNS rebinding EXISTS to reach loopback and private interfaces, using the victim's own
        // browser as the proxy that the firewall cannot see.
        //
        //   1. The victim loads evil.com, whose DNS answer has a 1-second TTL.
        //   2. The page fetches http://evil.com:3000/mcp. The browser re-resolves; the attacker
        //      now answers 127.0.0.1.
        //   3. The request lands on THIS server, carrying `Host: evil.com:3000`.
        //   4. The browser considers it SAME-ORIGIN with the page -- origin and target are both
        //      http://evil.com:3000 -- so there is no preflight, whatever the Content-Type, and
        //      the response body is readable by the attacker's script.
        //
        // So the CORS default-deny below is not a mitigation for this: it is never consulted. And
        // `initialize` needs no session id, so a hostile page can open a session and drive every
        // tool -- on a server whose recipe storage touches the filesystem. The Host header is the
        // only thing that still tells the truth, which is why the MCP spec requires validating it
        // and why the default is now to do so.
        //
        // Binding to a non-loopback address therefore requires naming the hosts you will reach it
        // by, in CYBERCHEF_ALLOWED_HOSTS. `CYBERCHEF_ALLOWED_HOSTS=*` disables the check outright
        // and says so in the log, for someone who has put a real proxy in front.
        //
        // The SDK deprecates its built-in check in favour of external middleware; it is wired here
        // because this server ships without one and "there is no middleware" is not a mitigation.
        const csv = (value, envName) => {
            const raw = value ?? process.env[envName];
            if (!raw) return undefined;
            // `String(raw)` rather than `raw.split`: `value` comes from a programmatic caller, so a
            // number or boolean reaches here and `(3000).split` is a TypeError thrown during
            // construction -- a config typo taking the server down instead of being ignored.
            const list = Array.isArray(raw) ? raw : String(raw).split(",");
            const cleaned = list.map(h => String(h).trim()).filter(Boolean);
            return cleaned.length ? cleaned : undefined;
        };
        const configuredHosts = csv(options.allowedHosts, "CYBERCHEF_ALLOWED_HOSTS");
        // `*` is the explicit, logged opt-out. Spelled as a value rather than as a second env var
        // so that "what hosts are allowed" has exactly one place to look.
        const hostCheckDisabled = configuredHosts?.length === 1 && configuredHosts[0] === "*";

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

        // Authorization is OPTIONAL per the MCP specification and OFF unless an issuer is set, so
        // an existing deployment is unaffected by upgrading. `options.auth` exists for tests; the
        // ordinary path reads the environment.
        const authConfig = options.auth || loadAuthConfig();

        const createServer = options.createServer;
        if (typeof createServer !== "function") {
            throw new TypeError(
                "createTransport({type:'http'}) requires a createServer factory: each session " +
                "needs its own MCP Server instance (see issue #36)."
            );
        }

        const {
            NodeStreamableHTTPServerTransport: StreamableHTTPServerTransport,
            toNodeHandler, toWebRequest
        } = await import("@modelcontextprotocol/node");
        const { createMcpHandler, isLegacyRequest } = await import("@modelcontextprotocol/server");
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
            // `Vary: Origin` on EVERY response once an allowlist is configured, including the
            // rejections. The response varies by origin whether or not this particular one was
            // allowed, and sending Vary only on the allowed path is the classic hole: a shared
            // cache stores the header-less response produced for some other origin and then
            // serves it to an allowlisted one, which fails CORS for a request that should have
            // succeeded. Announcing the axis of variation is what makes the cache key correct.
            const vary = allowedOrigins ? { "Vary": "Origin" } : {};
            if (!allowedOrigins || !origin || !allowedOrigins.includes(origin)) return vary;
            return {
                ...vary,
                "Access-Control-Allow-Origin": origin,
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

        // Sessions being created right now. Counted separately because a session does not enter
        // the map until `onsessioninitialized` fires inside handleRequest -- so checking only
        // `sessions.size` lets an unbounded burst of concurrent initializes all pass the capacity
        // check before any of them lands. Reserving first closes that race.
        let pendingSessions = 0;

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
                logger.warn(`session ${sessionId}: transport close failed: ${err.message}`);
            }
            try {
                await entry.server.close();
            } catch (err) {
                logger.warn(`session ${sessionId}: server close failed: ${err.message}`);
            }
            logger.info(`MCP session closed (${reason}): ${sessionId} [${sessions.size} active]`);
        }

        /**
         * The Host values this server will answer to.
         *
         * Resolved lazily rather than at construction because `port: 0` asks the OS for an
         * ephemeral port, and the real one is not known until the listener is bound. The SDK
         * compares the whole Host header by exact string, and a browser includes the port
         * whenever it is not the scheme default -- so every name is listed twice, with and
         * without it.
         *
         * @returns {string[]|undefined} The allowlist, or undefined when the check is disabled.
         */
        function effectiveAllowedHosts() {
            if (hostCheckDisabled) return undefined;
            if (configuredHosts) return configuredHosts;
            const bound = httpServer.address();
            const actualPort = (bound && typeof bound === "object" ? bound.port : null) ?? port;
            const names = new Set();
            for (const name of ["localhost", "127.0.0.1", "[::1]"]) {
                names.add(name);
                names.add(`${name}:${actualPort}`);
            }
            return [...names];
        }

        /**
         * Whether the Host header is one this server will answer.
         *
         * The modern entry is deliberately validation-free -- the SDK says so explicitly -- so the
         * DNS-rebinding protection the sessionful transport gets from `enableDnsRebindingProtection`
         * has to be applied by hand in front of it. Same allowlist, so the two paths cannot end up
         * with different answers about which hosts are acceptable.
         *
         * @param {import("node:http").IncomingMessage} req - The request.
         * @returns {boolean} True when the request may proceed.
         */
        function hostAllowed(req) {
            const allowed = effectiveAllowedHosts();
            if (!allowed) return true;              // checking disabled by configuration
            const host = req.headers.host;
            if (!host) return false;                // HTTP/1.1 requires it; absent means malformed
            return allowed.includes(host) || allowed.includes(host.split(":")[0]);
        }

        // The 2026-07-28 entry. `legacy: 'reject'` because this server routes the eras itself with
        // `isLegacyRequest` -- 2025 traffic goes to the sessionful wiring below, which has the
        // session accounting, the idle sweeper and the capacity limit. Letting the entry serve its
        // own stateless legacy fallback as well would create a second, unaccounted way to reach the
        // same tools.
        //
        // ONE factory for both legs, which is the property that matters: the modern path and the
        // sessionful path build their servers from the same `createServer`, so the eras cannot
        // drift apart in what they expose.
        const modernHandler = toNodeHandler(
            createMcpHandler(createServer, { legacy: "reject" }),
            { onerror: (err) => logger.error(`modern MCP handler error: ${err.message}`) }
        );

        /**
         * Build a fresh Server + transport pair and connect them.
         *
         * @returns {Promise<Object>} The connected transport.
         */
        async function newSession() {
            const mcpServer = createServer();
            const sessionAllowedHosts = effectiveAllowedHosts();
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                ...(sessionAllowedHosts ?
                    { allowedHosts: sessionAllowedHosts, enableDnsRebindingProtection: true } :
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

                // Path check first, so an unrelated request never reaches session routing OR the
                // preflight branch. Query strings are ignored; only the path is significant.
                //
                // Ordering matters and an earlier revision had it backwards: answering OPTIONS
                // before this check made `OPTIONS /anything` return 204, advertising an endpoint
                // that does not exist and contradicting the documented "every other path 404s".
                const path = normalizeEndpointPath(req.url);

                // RFC 9728 discovery, served BEFORE the endpoint check and deliberately without
                // authentication: a client cannot learn how to authenticate if discovery itself
                // requires a token. Answered only when an issuer is configured, so an unprotected
                // deployment does not advertise an authorization server it does not have.
                if (authConfig.enabled && isProtectedResourceMetadataPath(path)) {
                    const doc = JSON.stringify(protectedResourceMetadata(authConfig));
                    res.writeHead(200, {
                        "Content-Type": "application/json; charset=utf-8",
                        // Cacheable: the document changes only when the server is reconfigured, and
                        // a client fetches it on every 401 until it holds a token.
                        "Cache-Control": "public, max-age=3600"
                    });
                    res.end(doc);
                    return;
                }

                if (path !== mcpPathNormalized) {
                    sendJsonRpcError(res, 404, -32601, `Not Found: the MCP endpoint is ${mcpPath}`);
                    return;
                }

                // Authorization gate. Placed after the path check so an unrelated URL still 404s
                // rather than revealing that this host runs a protected MCP server, and before
                // method routing so it covers POST, GET (SSE) and DELETE alike -- session teardown
                // is as much an operation as a tool call.
                //
                // OPTIONS is exempt: a CORS preflight carries no Authorization header by
                // definition, and challenging it makes the browser abandon the request before the
                // real one is ever sent.
                let auth = { claims: null, scopes: [], subject: "anonymous" };
                if (authConfig.enabled && req.method !== "OPTIONS") {
                    const token = bearerFrom(req.headers);
                    const result = await verifyToken(token, authConfig);
                    if (!result.ok) {
                        // A key-discovery failure is the server's fault, not the caller's.
                        // Answering 401 there would send a client to re-authenticate against an
                        // authorization server that is working correctly.
                        if (result.serverError) {
                            sendJsonRpcError(res, 503, -32000,
                                "Authorization temporarily unavailable: cannot reach the authorization server");
                            return;
                        }
                        audit({
                            outcome: OUTCOME.UNAUTHENTICATED, tool: `${req.method} ${path}`,
                            reason: result.reason,
                            sessionId: normalizeSessionId(req.headers[SESSION_HEADER]) || undefined
                        });
                        res.setHeader("WWW-Authenticate", unauthorizedChallenge(authConfig));
                        sendJsonRpcError(res, 401, -32000, "Unauthorized: a valid access token is required");
                        return;
                    }
                    auth = {
                        claims: result.claims,
                        scopes: result.scopes,
                        subject: subjectDigest(result.claims)
                    };
                    // A deployment may demand a baseline scope on every request, independent of
                    // the per-tool check that happens at dispatch.
                    if (!satisfies(auth.scopes, authConfig.requiredScopes)) {
                        audit({
                            outcome: OUTCOME.DENIED, tool: `${req.method} ${path}`,
                            subject: auth.subject, scopes: auth.scopes,
                            required: authConfig.requiredScopes, reason: "baseline scope"
                        });
                        res.setHeader("WWW-Authenticate",
                            insufficientScopeChallenge(authConfig, authConfig.requiredScopes));
                        sendJsonRpcError(res, 403, -32000, "Forbidden: insufficient scope");
                        return;
                    }
                }

                // Preflight. Carries no body and no session, so it is answered before any of the
                // routing below -- but only for the real endpoint.
                if (req.method === "OPTIONS") {
                    res.writeHead(204, { "Allow": "GET, POST, DELETE, OPTIONS" });
                    res.end();
                    return;
                }

                const sessionId = normalizeSessionId(req.headers[SESSION_HEADER]);

                // GET (server-initiated SSE) and DELETE (explicit teardown) are only meaningful
                // for an established session, and both are routed purely by header.
                // From here on the request runs inside the authenticated caller's context, so
                // per-tool authorisation at dispatch can see who is asking without every layer
                // between here and there growing a parameter.
                //
                // `null` when authorization is disabled, and that is load-bearing rather than
                // tidiness: the dispatch guard treats a PRESENT context as "this caller was
                // authenticated, hold them to their scopes". Installing `{scopes: []}` for an
                // unauthenticated deployment made every call fail closed against scopes nobody had
                // configured -- caught by the two-client HTTP example, which no unit test covered
                // because each module was individually correct.
                return await withAuthContext(authConfig.enabled ? auth : null, async () => {
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

                // Era routing. `isLegacyRequest` is the entry's own classification step exported as
                // a predicate -- the same code `createMcpHandler` runs -- so this branch cannot
                // disagree with the handler it dispatches to. The body is passed in because it has
                // already been read: classifying from the request alone would clone a used body and
                // throw.
                //
                // Everything reaching here is a POST; body-less GET and DELETE session operations
                // are answered above and always classify legacy anyway.
                    if (!(await isLegacyRequest(await toWebRequest(req, body), body))) {
                        if (!hostAllowed(req)) {
                            sendJsonRpcError(res, 403, -32000, "Forbidden: Host header not allowed",
                                requestIdOf(body));
                            return;
                        }
                        await modernHandler(req, res, body);
                        return;
                    }

                    if (sessionId) {
                        const entry = sessions.get(sessionId);
                        if (!entry) {
                        // A stale id from a client that outlived a server restart. 404 is what the
                        // spec prescribes and what makes a conforming client re-initialize.
                            sendJsonRpcError(res, 404, -32001, "Session not found", requestIdOf(body));
                            return;
                        }
                        entry.lastSeen = Date.now();
                        await entry.transport.handleRequest(req, res, body);
                        return;
                    }

                // No session id. Only an initialize may open one; anything else is a client that
                // lost its session id, and answering it on a fresh session would silently give it
                // a different conversation than the one it thinks it is in.
                // An empty body earns its own message. It used to fall through to the
                // session-header error below, which is true but not the useful truth: the caller
                // sent nothing, and telling them they are missing a header sends them looking in
                // the wrong place.
                    if (body === undefined) {
                        sendJsonRpcError(res, 400, -32600, "Invalid Request: empty request body");
                        return;
                    }

                    if (!isInitializeBody(body)) {
                        sendJsonRpcError(
                            res, 400, -32000,
                            "Bad Request: Mcp-Session-Id header required for non-initialize requests",
                            requestIdOf(body)
                        );
                        return;
                    }

                    if (sessions.size + pendingSessions >= maxSessions) {
                        logger.warn(
                            `refusing new session: at capacity (${sessions.size} active, ` +
                        `${pendingSessions} pending, limit ${maxSessions})`
                        );
                        sendJsonRpcError(
                            res, 503, -32000,
                            `Server at session capacity (${maxSessions}). Retry later, or close an idle session with DELETE.`,
                            requestIdOf(body)
                        );
                        return;
                    }

                // Reserved before the await and released in `finally`, so every failure path gives
                // the slot back -- including one where newSession() throws after constructing the
                // Server. The count can briefly double-count a session that has already landed in
                // the map, which errs toward refusing one session too early rather than admitting
                // one too many.
                    pendingSessions++;
                    try {
                        const transport = await newSession();
                        await transport.handleRequest(req, res, body);
                    } finally {
                        pendingSessions--;
                    }
                });
            } catch (err) {
                const status = err.statusCode || 500;
                logger.error(`HTTP transport error (${status}): ${err.message}`);
                sendJsonRpcError(
                    res, status,
                    status === 400 ? -32700 : -32603,
                    // Never echo err.message for a 500: it can carry internal detail.
                    status >= 500 ? "Internal server error" : err.message
                );
                // On 413 the client may still be streaming a body we have already decided to
                // refuse, so sever the socket rather than keep reading it.
                //
                // Ordered on `finish`, not called straight away: `req.destroy()` tears down the
                // SOCKET, which req and res share, so destroying before the response has been
                // flushed can truncate it into an ECONNRESET -- the client would lose the very
                // 413 that explains what happened. `finish` fires once the response has been
                // handed off, and `writableFinished` covers the case where it already has.
                //
                // Not `res.end(cb)`: sendJsonRpcError has already ended the response, and a second
                // end() reads like a bug even though node tolerates it (verified: it invokes the
                // callback and does not throw).
                if (status === 413) {
                    if (res.writableFinished) {
                        req.destroy();
                    } else {
                        res.once("finish", () => req.destroy());
                    }
                }
            }
        });

        // Idle sessions are reaped rather than left to accumulate: a client that disappears
        // without a DELETE otherwise pins a Server instance for the lifetime of the process.
        const sweeper = setInterval(() => {
            const cutoff = Date.now() - sessionTimeoutMs;
            for (const [id, entry] of sessions) {
                if (entry.lastSeen < cutoff) closeSessionDetached(id, "idle timeout");
            }
        }, sweepIntervalMs);
        // Do not hold the event loop open for the sweeper alone. Unconditional call: `unref` has
        // been on Timeout since node 0.9, far below this package's `engines: >=24` floor, so the
        // optional-call was guarding against nothing.
        sweeper.unref();

        httpServer.listen(port, host, () => {
            logger.info(`Streamable HTTP transport listening on ${host}:${port}${mcpPath}`);
            logger.info(`  session timeout: ${Math.round(sessionTimeoutMs / 1000)}s, max sessions: ${maxSessions}`);
            const hosts = effectiveAllowedHosts();
            if (hosts) {
                logger.info(`  DNS rebinding protection: on (${hosts.join(", ")})`);
            } else {
                logger.warn("  DNS rebinding protection: OFF (CYBERCHEF_ALLOWED_HOSTS=*) -- any " +
                    "website the user visits can drive this server via a rebound hostname");
            }
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
            // Reject on a real close error rather than resolving WITH it -- `close(resolve)` hands
            // the Error object to resolve, so a genuine failure looked like success.
            //
            // ERR_SERVER_NOT_RUNNING is exempt on purpose: closeAll() is documented idempotent and
            // the suite calls it twice (an explicit call plus afterEach). Rejecting there would
            // turn a guarantee into a failure.
            await new Promise((resolve, reject) => {
                httpServer.close(err => {
                    if (err && err.code !== "ERR_SERVER_NOT_RUNNING") reject(err);
                    else resolve();
                });
            });
        }

        // `transport` is null on purpose. There is no process-wide transport any more, and
        // returning one would invite exactly the `server.connect(transport)` that caused #36.
        return { transport: null, httpServer, sessions, closeAll };
    }

    if (type === TransportType.SOCKET) {
        // The stdio binding over a stream rather than a pipe. This is the SDK's own documented
        // custom-transport route ("a `StdioServerTransport` constructed over a Unix domain socket
        // or TCP stream"), and it is what the v2.3.0 roadmap's "advanced transports" line was
        // actually reaching for -- WebSocket, which that line named, is not an MCP transport at
        // all. See docs/planning/ROADMAP.md.
        //
        // Per connection: one transport over the socket, handed to `serveStdio`, which pins ONE
        // server instance for that connection's lifetime. So this inherits the same isolation the
        // HTTP branch was rewritten for in issue #36 -- no two clients share a `Server` -- without
        // needing session ids, because the socket IS the session.
        const net = await import("node:net");
        const fs = await import("node:fs");
        const { StdioServerTransport } = await import("@modelcontextprotocol/server/stdio");

        const createServer = options.createServer;
        if (typeof createServer !== "function") {
            throw new TypeError(
                "createTransport({type:'socket'}) requires a createServer factory: each " +
                "connection is pinned to its own MCP Server instance."
            );
        }

        const socketPath = options.socketPath ?? process.env.CYBERCHEF_SOCKET_PATH;
        const host = options.host ?? process.env.CYBERCHEF_SOCKET_HOST ?? "127.0.0.1";
        const portRaw = options.port ?? process.env.CYBERCHEF_SOCKET_PORT;
        const port = portRaw === undefined || portRaw === null || portRaw === "" ?
            undefined : parseInt(portRaw, 10);
        const maxConnections = parseInt(
            options.maxConnections ?? process.env.CYBERCHEF_SOCKET_MAX_CONNECTIONS, 10
        ) || DEFAULT_SOCKET_MAX_CONNECTIONS;

        if (!socketPath && port === undefined) {
            throw new TypeError(
                "createTransport({type:'socket'}) needs CYBERCHEF_SOCKET_PATH (a Unix domain " +
                "socket) or CYBERCHEF_SOCKET_PORT (TCP)."
            );
        }
        if (socketPath && port !== undefined) {
            throw new TypeError(
                "createTransport({type:'socket'}): set CYBERCHEF_SOCKET_PATH or " +
                "CYBERCHEF_SOCKET_PORT, not both -- one server binds one address."
            );
        }
        if (port !== undefined && Number.isNaN(port)) {
            throw new TypeError("createTransport({type:'socket'}): CYBERCHEF_SOCKET_PORT is not a number.");
        }

        // Fail closed on a network-reachable bind. See isLoopbackAddress for why.
        const allowRemote = String(
            options.allowRemote ?? process.env.CYBERCHEF_SOCKET_ALLOW_REMOTE ?? ""
        ).toLowerCase() === "true";
        if (port !== undefined && !isLoopbackAddress(host) && !allowRemote) {
            throw new TypeError(
                `createTransport({type:'socket'}): refusing to bind ${host}:${port}. This ` +
                "transport has no authentication, so a non-loopback bind exposes every operation " +
                "to anyone who can reach the port. Set CYBERCHEF_SOCKET_ALLOW_REMOTE=true to " +
                "override, and put your own authentication in front of it."
            );
        }

        if (socketPath) {
            const limit = maxSocketPathLength();
            const length = Buffer.byteLength(socketPath);
            if (length > limit) {
                throw new TypeError(
                    `createTransport({type:'socket'}): socket path is ${length} bytes, and this ` +
                    `platform allows ${limit}. The kernel reports this only as a bare EINVAL, ` +
                    "which names the path but not the reason. Use a shorter path."
                );
            }
        }

        if (socketPath) {
            // A stale socket file from a crashed process must be removed, and a LIVE one must not
            // be. Existence alone cannot tell them apart, so probe it: a connection that is
            // refused means nothing is listening. Anything else -- a live server, or a path that
            // is not a socket at all -- is left alone and the bind fails loudly instead.
            let stat = null;
            try {
                stat = fs.statSync(socketPath);
            } catch (err) {
                if (err.code !== "ENOENT") throw err;
            }
            if (stat) {
                if (!stat.isSocket()) {
                    throw new Error(
                        `createTransport({type:'socket'}): ${socketPath} exists and is not a ` +
                        "socket. Refusing to remove it."
                    );
                }
                const live = await new Promise((resolve) => {
                    const probe = net.connect(socketPath);
                    probe.once("connect", () => {
                        probe.destroy();
                        resolve(true);
                    });
                    probe.once("error", () => resolve(false));
                });
                if (live) {
                    throw new Error(
                        `createTransport({type:'socket'}): ${socketPath} is already served by a ` +
                        "running process."
                    );
                }
                fs.unlinkSync(socketPath);
                logger.warn(`removed stale socket file ${socketPath}`);
            }
        }

        /** Open connections, so shutdown can close them and the tests can count them. */
        const connections = new Set();

        const socketServer = net.createServer((socket) => {
            if (connections.size >= maxConnections) {
                logger.warn(`refusing connection: at capacity (${connections.size}/${maxConnections})`);
                socket.destroy();
                return;
            }
            // Nagle batches small writes, which for a request/response protocol on a local socket
            // is latency for no benefit.
            socket.setNoDelay?.(true);

            const handle = serveStdio(createServer, {
                transport: new StdioServerTransport(socket, socket),
                onerror: (err) => logger.error(`socket connection error: ${err.message}`)
            });
            const entry = { socket, handle };
            connections.add(entry);
            logger.info(`socket connection opened [${connections.size} active]`);

            const drop = () => {
                if (!connections.delete(entry)) return;   // already dropped
                // Close the pinned server instance too. Dropping only the socket would leak one
                // Server per connection for the process's lifetime.
                // Not awaited, because `drop` is a synchronous close/error listener -- there is
                // nothing here to await into. Not silent either: a teardown failure is expected
                // when the peer has already gone, but expected is not the same as uninteresting,
                // and a close that fails for some OTHER reason should leave a trace.
                Promise.resolve(handle.close()).catch(err =>
                    logger.debug(`socket connection teardown failed: ${err.message}`));
                logger.info(`socket connection closed [${connections.size} active]`);
            };
            socket.once("close", drop);
            socket.once("error", (err) => {
                // ECONNRESET is a client that hung up mid-write; it is normal, not an incident.
                if (err.code !== "ECONNRESET") logger.warn(`socket error: ${err.message}`);
                drop();
            });
        });

        // The mode has to be right AT CREATION, not shortly after. `listen()` creates the socket
        // with the process umask, and a `chmodSync` on the next line still leaves a window in
        // which a permissive umask published a world-writable socket -- and a connection accepted
        // during that window survives the mode change. So the umask is tightened around the bind
        // and restored immediately, and the chmod stays as a belt-and-braces assertion of the
        // final mode.
        const previousUmask = socketPath === undefined ? undefined : process.umask(0o177);
        try {
            await new Promise((resolve, reject) => {
                socketServer.once("error", reject);
                if (socketPath) socketServer.listen(socketPath, resolve);
                else socketServer.listen(port, host, resolve);
            });
        } finally {
            if (previousUmask !== undefined) process.umask(previousUmask);
        }

        if (socketPath) {
            // Owner-only. A Unix socket's access control IS its file mode.
            fs.chmodSync(socketPath, 0o600);
        }

        const bound = socketServer.address();
        logger.info(`Running on socket transport: ${
            typeof bound === "string" ? bound : `${bound.address}:${bound.port}`
        } (max ${maxConnections} connections)`);

        /**
         * Close every connection and stop listening.
         *
         * @returns {Promise<void>} Resolves once everything is closed.
         */
        async function closeAll() {
            // Close the pinned server instances EXPLICITLY rather than relying on each socket's
            // "close" listener. `destroy()` emits "close" asynchronously, so a synchronous
            // `connections.clear()` here would run first, `drop()`'s `connections.delete(entry)`
            // would then return false, and it would return before ever calling `handle.close()` --
            // leaking one Server per connection. In `runServer()` the process exits immediately
            // afterwards so the impact is bounded, but the tests and any embedded caller keep
            // running.
            const entries = [...connections];
            connections.clear();
            await Promise.all(entries.map(async entry => {
                entry.socket.destroy();
                try {
                    await entry.handle.close();
                } catch (err) {
                    // Best-effort by design -- one connection failing to close must not abort the
                    // shutdown of the others -- but recorded rather than discarded.
                    logger.debug(`socket connection teardown failed during shutdown: ${err.message}`);
                }
            }));
            await new Promise((resolve, reject) => {
                socketServer.close(err => {
                    if (err && err.code !== "ERR_SERVER_NOT_RUNNING") reject(err);
                    else resolve();
                });
            });
            // node removes the socket file on a clean close; this is for the case where it did not.
            if (socketPath) {
                try {
                    fs.unlinkSync(socketPath);
                } catch (err) {
                    if (err.code !== "ENOENT") throw err;
                }
            }
        }

        return { transport: null, httpServer: null, socketServer, connections, closeAll };
    }

    // Default: stdio.
    //
    // `serveStdio` rather than a bare `StdioServerTransport`, because the era decision lives in the
    // entry, not in the transport. Measured against SDK v2.0.0: a bare transport plus
    // `server.connect()` serves the 2025 era only -- a client pinning protocol revision 2026-07-28
    // fails negotiation outright with ERA_NEGOTIATION_FAILED, because nothing answers its
    // `server/discover` probe. `serveStdio` classifies the opening exchange, pins ONE instance from
    // the factory for the connection's lifetime, and serves whichever era the client opened with.
    //
    // So this returns `transport: null` for the same reason the HTTP branch does: there is no
    // process-wide transport to connect any more, and `server.connect(transport)` in `runServer()`
    // would bypass the entry that makes the modern era reachable.
    const createServer = options.createServer;
    if (typeof createServer !== "function") {
        throw new TypeError(
            "createTransport({type:'stdio'}) requires a createServer factory: the stdio entry " +
            "pins one instance per connection and owns the era decision."
        );
    }
    const handle = serveStdio(createServer, {
        // `options.transport` is how a caller drives the stdio entry WITHOUT touching the
        // process's own stdin/stdout: the entry defaults to real process stdio, which a test
        // runner must never hand over. It is also the seam the SDK documents for a stdio binding
        // over a socket rather than a pipe.
        ...(options.transport ? { transport: options.transport } : {}),
        onerror: (err) => logger.error(`stdio transport error: ${err.message}`)
    });
    return { transport: null, httpServer: null, closeAll: () => handle.close() };
}

/**
 * Get the configured transport type.
 *
 * @returns {string} The transport type.
 */
export function getTransportType() {
    return process.env.CYBERCHEF_TRANSPORT || TransportType.STDIO;
}
