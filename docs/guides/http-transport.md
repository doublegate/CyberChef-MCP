# Streamable HTTP Transport

The MCP server speaks **stdio** by default. Set `CYBERCHEF_TRANSPORT=http` to serve the
[Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
instead, for browser clients, remote clients, and anything that cannot spawn a subprocess.

> **Multiple simultaneous clients require v2.0.0 or later.** Before it, the HTTP branch created one
> transport for the whole process, so the first client to connect worked and every one after it was
> refused with `Invalid Request: Server already initialized`
> ([#36](https://github.com/doublegate/CyberChef-MCP/issues/36)). Each client now gets its own
> session, its own transport, and its own MCP `Server` instance.

---

## Quick start

```bash
docker run --rm -p 3000:3000 \
  -e CYBERCHEF_TRANSPORT=http \
  -e CYBERCHEF_HTTP_HOST=0.0.0.0 \
  -e CYBERCHEF_ALLOWED_HOSTS=localhost:3000,127.0.0.1:3000 \
  ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

Point any MCP client at `http://127.0.0.1:3000/mcp`.

`CYBERCHEF_HTTP_HOST=0.0.0.0` is **required in a container**. The default `127.0.0.1` is loopback
*inside the container*, so a published port reaches nothing — the symptom is a connection refused
that looks like the server failed to start when it started fine.

Locally, without Docker:

```bash
CYBERCHEF_TRANSPORT=http npm run mcp
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_TRANSPORT` | `stdio` | `stdio` or `http`. Nothing listens unless this is `http`. |
| `CYBERCHEF_HTTP_PORT` | `3000` | Listen port. `0` asks the OS for an ephemeral port. |
| `CYBERCHEF_HTTP_HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` in a container. |
| `CYBERCHEF_ALLOWED_HOSTS` | *(unset)* | Comma-separated `Host` allowlist. Setting it enables DNS-rebinding protection. |
| `CYBERCHEF_ALLOWED_ORIGINS` | *(unset)* | Comma-separated `Origin` allowlist. Setting it enables CORS. Required by browser clients. |
| `CYBERCHEF_SESSION_TIMEOUT` | `1800000` | Idle session reap threshold, in ms (30 minutes). |
| `CYBERCHEF_HTTP_MAX_BODY` | `4194304` | Maximum accepted request body, in bytes (4 MiB). |
| `CYBERCHEF_HTTP_PATH` | `/mcp` | The endpoint path. Anything else gets a plain `404`. |
| `CYBERCHEF_MAX_SESSIONS` | `100` | Hard cap on concurrent sessions. Beyond it, `initialize` gets `503`. |

### On `CYBERCHEF_ALLOWED_HOSTS`

Off by default, and that default is right for the default bind: on loopback there is no rebinding
attack to prevent. It becomes worth setting the moment you bind `0.0.0.0`, because a page in a
user's browser can then be made to resolve an attacker-controlled name to `127.0.0.1` and POST to
the server as a same-origin request.

Set it to the host values clients actually send, including the port:

```bash
CYBERCHEF_ALLOWED_HOSTS=localhost:3000,127.0.0.1:3000
```

The MCP SDK marks its built-in check deprecated in favour of external middleware. It is wired up
here anyway, because this server ships without middleware and "there is no middleware" is not a
mitigation. If you front the server with a reverse proxy that validates `Host`, you do not need it.

### On `CYBERCHEF_ALLOWED_ORIGINS` (browser clients)

A browser-based MCP client — MCP Inspector's web UI is one — sends an `OPTIONS` **preflight** before
its `POST`, because the request carries a custom `Mcp-Session-Id` header. The server answers the
preflight, but it sends CORS *allow* headers only for an origin on this list. Without the list the
preflight is well-formed and the browser correctly refuses to proceed.

```bash
CYBERCHEF_ALLOWED_ORIGINS=http://localhost:6274
```

That default-deny is deliberate: `Access-Control-Allow-Origin: *` on a server that may be bound to
`0.0.0.0` is how a hostile page reaches a local MCP server, so it is not on offer.

When the origin matches, the response also carries `Access-Control-Expose-Headers: Mcp-Session-Id`.
That one header is the difference between a browser client working and appearing to lose its
session on every request: without it the browser hides the session id from the client's JavaScript,
so the client cannot echo it back and every follow-up request gets a `400`.

Command-line and desktop clients (Claude Desktop, Cursor, LM Studio) send no `Origin` and need none
of this.

## How sessions work

1. A client POSTs an `initialize` request with **no** `Mcp-Session-Id` header.
2. The server creates a fresh `Server` + transport pair, generates a session id, and returns it in
   the `Mcp-Session-Id` response header.
3. The client includes that header on every subsequent request.
4. `DELETE /mcp` with the header ends the session. So does 30 minutes of inactivity.

Concretely:

```bash
# 1. initialize -- note the returned session id
SID=$(curl -s -D - -o /dev/null -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-06-18","capabilities":{},
        "clientInfo":{"name":"curl","version":"1"}}}' \
  | grep -i '^mcp-session-id' | tr -d '\r' | cut -d' ' -f2)

# 2. complete the handshake
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# 3. use it
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# 4. end it
curl -s -X DELETE http://127.0.0.1:3000/mcp -H "mcp-session-id: $SID"
```

The `Accept` header must list **both** `application/json` and `text/event-stream`. The spec requires
it and the SDK answers `406` otherwise — a failure that reads like a routing problem and is not.

### Responses arrive as SSE frames

An `initialize` is answered as `text/event-stream`, so the body looks like:

```text
event: message
data: {"result":{...},"jsonrpc":"2.0","id":1}
```

Real MCP clients handle this. Shell scripts need to strip the `data: ` prefix.

## Status codes

| Situation | Response |
|---|---|
| `initialize` with no session id | `200`, new session, `Mcp-Session-Id` header set |
| Any request with a valid session id | `200` |
| Non-`initialize` POST with no session id | `400` — `Mcp-Session-Id header required` |
| Any request with an unknown/expired session id | `404` — `Session not found` |
| `GET` or `DELETE` with no/unknown session | `404` |
| Any path other than `CYBERCHEF_HTTP_PATH` | `404` naming the correct endpoint |
| `OPTIONS` (CORS preflight) | `204`, with allow headers only for an allowlisted origin |
| Any method other than GET/POST/DELETE/OPTIONS | `405` with an `Allow` header |
| `initialize` at `CYBERCHEF_MAX_SESSIONS` | `503` — retry later, or `DELETE` an idle session |
| Body over `CYBERCHEF_HTTP_MAX_BODY` | `413` |
| Body that is not valid JSON | `400` |

A `404` on a previously working session id is normal after a server restart or an idle timeout: it
is the signal for a conforming client to re-initialize. The server deliberately does **not** open a
fresh session for an unrecognised id, because that would hand the client a different conversation
from the one it believes it is in — silently, with no error to notice.

## What is shared and what is not

Per session: the MCP `Server` instance and its transport, i.e. protocol lifecycle state.

Process-wide, on purpose: the operation cache, telemetry collector, rate limiter and resource quota
tracker. These are *resource controls*. Giving each session its own copy would let any caller reset
all four by opening a new session, which is the opposite of what they are for.

## Troubleshooting

**`Invalid Request: Server already initialized`** — you are running v1.9.0 or earlier. Upgrade;
this is [#36](https://github.com/doublegate/CyberChef-MCP/issues/36) and it is fixed in v2.0.0.

**Connection refused from the host, container running** — `CYBERCHEF_HTTP_HOST` is still
`127.0.0.1`. Set it to `0.0.0.0`.

**`406 Not Acceptable`** — the `Accept` header is missing `text/event-stream`.

**`404 Session not found` immediately after initialize** — the client is not echoing the
`Mcp-Session-Id` response header back on subsequent requests.

**A browser client fails with a CORS error, or its requests never leave the browser** — set
`CYBERCHEF_ALLOWED_ORIGINS` to the page's origin. Command-line clients do not need it.

**A browser client initializes and then 400s on every following request** — the session id is
reaching the browser but not the page's JavaScript. Confirm the response carries
`Access-Control-Expose-Headers: Mcp-Session-Id`, which requires the origin to be allowlisted.

**`503 Server at session capacity`** — `CYBERCHEF_MAX_SESSIONS` (default 100) is reached. Usually
clients disconnecting without `DELETE`; they are reaped after `CYBERCHEF_SESSION_TIMEOUT`. The cap
exists because an `initialize` is unauthenticated and creates a `Server` held for the full session
timeout, and session creation is **not** covered by the operation rate limiter or the quota tracker
— both of those govern tool calls, which only happen once a session exists.

**Sessions accumulating** — clients are disconnecting without `DELETE`. They are reaped after
`CYBERCHEF_SESSION_TIMEOUT`; lower it if your clients are short-lived.

## Related

- [User Guide](user_guide.md) — installation and client configuration
- [Commands Reference](commands.md) — the MCP tool surface
- [Security Policy](../../SECURITY.md)
