# MCP 2026-07-28: what it requires of a server

**Source:** <https://modelcontextprotocol.io/specification/2026-07-28/changelog> — retrieved 2026-09-03.
**Why this file:** v3.0.0's scope was derived from this document. Each row records what the spec
says and what this server did about it, so a later reader can tell a deliberate decision from an
oversight.

## The revision in one line

The largest change since MCP launched: the protocol core becomes **stateless**. `initialize` and the
protocol-level session are gone, every request carries its own version and capabilities in `_meta`,
and `server/discover` replaces the handshake.

## What this server had to do

| Change | Requirement | Here |
|---|---|---|
| Cacheable results (SEP-2549) | `ttlMs` + `cacheScope` required on the six list/read methods | **Filled by the SDK**; v3.0.0 chose values. See `src/node/lib/cache-hints.mjs` |
| Deterministic tool order | SHOULD, for client caching and prompt-cache hits | Three tiers, each sorted by code unit |
| Error code allocation | resource-not-found `-32002` → `-32602`; `-32020…-32099` reserved for the spec; `-32000…-32019` stays implementation-defined | SDK handles the renumbering. The real gap was local: string error codes became `-32603` |
| Trace context | `traceparent` / `tracestate` / `baggage` documented as `_meta` keys | Extracted, with a manual W3C fallback because this server has no OTel SDK |
| `extensions` capability | Optional | Not declared — see below |
| Tasks extension | `io.modelcontextprotocol/tasks`, polling via `tasks/get` | Declined; streaming plus progress already covers it |
| Roots / Sampling / Logging | **Deprecated**, 12-month window | Never used |
| HTTP+SSE transport | **Deprecated** | Never used; this server is Streamable HTTP |
| OAuth DCR | **Deprecated** in favour of Client ID Metadata Documents | Does not apply — this is a resource server only |

## Handled by the SDK, not by this server

Worth recording, because a reader of the changelog would reasonably expect these to be work:

- `server/discover`, and version negotiation per request
- the `resultType` field (`"complete"` / `"input_required"`) on every result
- Multi Round-Trip Requests, which replace server-initiated `roots/list`, `sampling/createMessage`
  and `elicitation/create`
- `subscriptions/listen`, replacing the HTTP GET stream and `resources/subscribe`
- the `Mcp-Method` / `Mcp-Name` routable headers
- removal of SSE resumability and `Last-Event-ID`

`@modelcontextprotocol/server@2.0.0` is the current release and implements these. The lesson from
v3.0.0's F-05 is that reading the SDK's source, rather than the spec alone, is what tells you which
column a requirement falls in.

## Governance

The revision adds a formal **feature lifecycle**: Active → Deprecated → Removed, with a minimum
twelve-month deprecation window and a published registry of deprecated features. Worth tracking:
it means a deprecation announcement is now a dated commitment rather than a hint.
