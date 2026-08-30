---
applyTo: "src/node/**"
---

# MCP server layer

This is the project's own code — the MCP wrapper around CyberChef's Node API. Unlike `src/core/`,
changes here are welcome and permanent.

## Async boundary

`bake()` and `NodeRecipe.execute()` are **async** as of upstream v11.0.0. Flag any call site that:

- uses the return value synchronously,
- calls `.then()` on it without awaiting, or
- assumes `bake` throws synchronously rather than returning a rejected promise.

`Promise.race([...])` wrappers are fine — they auto-wrap a non-promise — but explicit `await` is
clearer and is the house form.

## Tool generation

Tool names come from `sanitizeToolName()` in `mcp-server.mjs`, applied to operation display names
from `OperationConfig`. This is **not** upstream's `sanitise()`; the two are unrelated and must not
be conflated. Changing either the sanitizer or an operation's display name changes a public tool
name, which is a breaking change requiring an entry in `src/node/deprecation.mjs`.

`mapArgsToZod()` must handle every CyberChef arg type, including `argSelector`, and honour
`defaultIndex` on `option`/`editableOption`. Upstream now calls `validateIngredients()` on every
operation run, so arguments the MCP layer coerces must survive that validation or surface a typed
error from `errors.mjs`.

## Transports

The Streamable HTTP transport requires **one `Server` + `StreamableHTTPServerTransport` pair per
session ID**, dispatched on the `mcp-session-id` header. Sharing a single instance across clients
leaks cross-client response data (GHSA-345p-7cg4-v4c7) and produces
`Invalid Request: Server already initialized` for every client after the first. Flag any
reintroduction of a shared instance as blocking.

## Conventions

- Never throw a bare `Error` across the MCP boundary — use the structured types in `errors.mjs`.
- Long-running work goes through `retry.mjs` (timeout + backoff) and, for CPU-bound operations,
  `worker-pool.mjs`.
- Validate external input at the boundary with Zod; never trust tool arguments.
- 4-space indentation, `import ... with { type: "json" }`, no emojis.
- Secrets from `process.env` only, and never in an error message or log line.
