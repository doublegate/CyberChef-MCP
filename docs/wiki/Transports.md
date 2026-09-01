# Transports

Three, chosen with `CYBERCHEF_TRANSPORT`. There is deliberately **no WebSocket transport** — MCP
does not define one, and no SDK ships one.

| | `CYBERCHEF_TRANSPORT` | Use it when |
|---|---|---|
| **stdio** *(default)* | `stdio` | A local client launches the server as a subprocess. This is what Claude Desktop, Claude Code, Cursor and LM Studio all do. |
| **Streamable HTTP** | `http` | Several clients share one server, or the server runs somewhere else. |
| **Socket** | `socket` | A Unix domain socket, or loopback TCP, for a local integration that is not a subprocess. |

## stdio

```bash
docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

The server reads JSON-RPC on stdin and writes it on stdout. **All logging goes to stderr** — there
is a test asserting that every stdout line parses as JSON-RPC, because a single stray `console.log`
corrupts the protocol stream and the failure looks like a client bug.

## Streamable HTTP

```bash
docker run -i --rm -p 127.0.0.1:3000:3000 \
  -e CYBERCHEF_TRANSPORT=http \
  ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

| Variable | Default |
|---|---|
| `CYBERCHEF_HTTP_HOST` | `127.0.0.1` |
| `CYBERCHEF_HTTP_PATH` | `/mcp` |

**Bind to `127.0.0.1`, not `0.0.0.0`.** The published port above is deliberately written
`127.0.0.1:3000:3000` rather than `-p 3000:3000`: the latter publishes on every interface, and this
server has **no authentication**. Anything that can reach the port can run any of 504 operations.

Each session gets its own `Server` and transport instance. Sharing them across clients leaks data
between them — that is the substance of the SDK's own GHSA-345p-7cg4-v4c7 advisory, and the bug
behind issue #36 in this repository.

Both protocol eras are served from one set of handlers, routed per request: a 2025-era client
negotiates through `initialize` and keeps the sessionful wiring; a 2026-07-28 client is served per
request.

## Socket

```bash
CYBERCHEF_TRANSPORT=socket CYBERCHEF_SOCKET_PATH=/run/cyberchef.sock npm run mcp
```

| Variable | Default | Notes |
|---|---|---|
| `CYBERCHEF_SOCKET_PATH` | — | A Unix domain socket path. Created `0600`. |
| `CYBERCHEF_SOCKET_HOST` | `127.0.0.1` | For loopback TCP instead |
| `CYBERCHEF_SOCKET_PORT` | — | |
| `CYBERCHEF_SOCKET_MAX_CONNECTIONS` | — | |
| `CYBERCHEF_SOCKET_ALLOW_REMOTE` | *unset* | Required to bind off-loopback |

One pinned server instance per connection, for the same isolation reason as HTTP.

**A non-loopback bind is refused unless explicitly allowed.** The socket carries no
authentication, so binding it to a routable address without saying so deliberately would be a
mistake the server declines to make for you. The Unix socket's mode is set with the umask tightened
around `listen()`, so there is no window in which it exists at a laxer mode.

## Protocol eras

Both are served from the same handlers, on stdio and HTTP:

- **2026-07-28** — the current revision: no `initialize` handshake, a `server/discover`
  advertisement instead, and per-request version negotiation through a `_meta` envelope.
- **The 2025 era** (`2024-10-07` … `2025-11-25`) — the legacy family, reached through the ordinary
  `initialize` handshake.

Existing clients are unaffected by the upgrade. A v1-SDK client still negotiates `2025-11-25`
against the same registrations.

> One implementation detail that costs time if you go looking: **the era decision lives in the
> `serveStdio` entry point, not in the transport.** A bare `StdioServerTransport` plus
> `server.connect()` serves the 2025 era only, and fails a modern client with
> `ERA_NEGOTIATION_FAILED`.
