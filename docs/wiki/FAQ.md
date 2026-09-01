# FAQ

## Is this GCHQ's CyberChef?

It is a **fork** of it. All 504 operations come from
[gchq/CyberChef](https://github.com/gchq/CyberChef) v11.4.0, mirrored verbatim. What this project
adds is the MCP server around them: tool schemas, transports, recipe storage, streaming, batching.

Anything under `src/core/` is upstream code and is never hand-edited here — deliberate changes are
carried as patches under `patches/fork/`, which are re-applied after each sync and **fail the sync
if they stop applying**. That mechanism exists because a security mitigation was once hand-edited
into `src/core/` and silently reverted by a later sync, staying gone for four releases while three
documents claimed it was active.

## Why is the licence GPL-3.0-or-later when CyberChef is Apache-2.0?

From v2.0.0 onward. Apache-2.0 is one-way compatible into GPLv3, so upstream's code keeps its own
licence and headers while the combined work is GPLv3. The v1.9.x line remains Apache-2.0.

The reason is planned work: two reference projects intended for integration are GPL (katana is
GPLv3-or-later, which forces v3 specifically). See
[ADR 0001](https://doublegate.github.io/CyberChef-MCP/decisions/adr-0001-gpl/).

## Why do tool names start with `cyberchef_`?

Because MCP's tool namespace is flat per session. Removing the prefix was announced as a breaking
change in v1.8.0 and **withdrawn in v2.0.0** after measurement: it saved 1,208 tokens — 2.6% of the
payload — and produced 19 names that would collide with other servers, including `search`, `diff`,
`filter`, `sort`, `merge` and `fork`. The prefix is permanent.

## Can I use it without Docker?

Yes — clone, `npm install`, `npx grunt configTests`, `npm run mcp`. Publishing to npm is *prepared*
as of v2.3.0 (a `--ignore-scripts` install of the packed tarball starts and serves) but the package
is **not yet on the registry**, so `npx cyberchef-mcp` does not work today.

## Which protocol revisions does it speak?

Both **2026-07-28** and the 2025 era, from one set of handlers, on stdio and HTTP. A client using
the older `initialize` handshake still negotiates 2025-11-25 and is unaffected.

## Is it safe to point at untrusted input?

The operations are CyberChef's, with CyberChef's properties — several are parsers over untrusted
bytes. The MCP layer adds input-size limits, an operation timeout, concurrency and rate limits, and
structured errors. The container runs non-root (UID 65532) on a distroless base and supports
`--read-only`.

The honest caveat, which upstream states too: no guarantee is offered for the correctness or
security of cryptographic operations. Treat it as an analysis tool, not a security boundary.

## Does it phone home?

No. Telemetry is off by default, and when enabled it is local-only — `cyberchef_telemetry_export`
returns it to *you*. The only outbound network access in the whole operation set is from two
operations that exist to make requests: `HTTP request` and `DNS over HTTPS`. Both are marked
`openWorldHint: true` so a client can prompt before running them.

## How do I run a CyberChef recipe I already have?

Paste it into `cyberchef_bake`. Both argument forms work — positional arrays as the web UI writes
them, and named objects:

```json
{ "input": "…", "recipe": [{ "op": "From Base64" }, { "op": "Gunzip" }] }
```

## What is the difference between the wiki and the documentation site?

The [site](https://doublegate.github.io/CyberChef-MCP/) is generated from `docs/` and from the
server's own `OperationConfig`, so it cannot drift from the code. The wiki is the practical layer
and is editable without a pull request. If they disagree, the site is right.
