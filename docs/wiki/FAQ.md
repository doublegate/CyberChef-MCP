# FAQ

## Why do I only see 40 tools when you say there are 504 operations?

Because `tools/list` goes to the model on **every** request, and sending all 543 costs about
421,041 bytes before anyone types anything. The default is an index: 40 tools, 40,637 bytes.

**Nothing becomes unreachable.** `cyberchef_bake` runs any of the 504 by name, and
`cyberchef_categories` → `cyberchef_list_operations` → `cyberchef_describe_operation` walks down to
any of them. Set `CYBERCHEF_TOOL_SURFACE=curated` (118) or `=all` (543) if you would rather
pre-load. Full detail: **[The Tool Surface](Tool-Surface)**.

## What are the sixteen tools that are not operations?

`cyberchef_xor_key_length`, `cyberchef_cyclic_pattern`, `cyberchef_hash_identify` and
`cyberchef_rsa_attack`, added in v2.4.0, plus twelve more added in v3.3.0:
`cyberchef_classical_cipher`, `cyberchef_corpus_diff`, `cyberchef_crib_drag`,
`cyberchef_entropy_scan`, `cyberchef_hash_crack`, `cyberchef_hash_statistics`,
`cyberchef_jwt_weakness`, `cyberchef_plaintext_check`, `cyberchef_rsa_multi_key`,
`cyberchef_substitution_break`, `cyberchef_timestamp_identify` and `cyberchef_vigenere_break`. An
operation is a pure `run(input, args)` over one input, which cannot express an *analysis* — and
`cyberchef_bake` cannot either, because a recipe is a pipeline, not a loop. They are in every tool
surface because none is reachable through `bake`. See **[Analysis Tools](Analysis-Tools)**.

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

Yes — clone, `npm install`, `npx grunt configTests`, `npm run mcp`. See **[Installation](Installation)**.

`npx cyberchef-mcp` also works: the package has been on the registry since **2.5.0**. This answer
said the opposite until v3.0.0 — publishing was *prepared* in v2.3.0 and the first release that
actually published was v2.5.0, after which nothing re-checked the claim. `server.json` carries the
npm record as of v3.0.0.

## Which protocol revisions does it speak?

Both **2026-07-28** and the 2025 era, from one set of handlers, on stdio and HTTP. A client using
the older `initialize` handshake still negotiates 2025-11-25 and is unaffected.

## Is it safe to point at untrusted input?

The operations are CyberChef's, with CyberChef's properties — several are parsers over untrusted
bytes. The MCP layer adds input-size limits, an operation timeout, concurrency and rate limits, and
structured errors. The container runs non-root (UID 65532) on a Chainguard Wolfi base -- which is not shell-free; see [Installation](Installation) -- and supports
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

## Why is there no plugin system?

Because `node:vm` is not a security boundary, and that was measured rather than argued: a capability
handed into a vm context reaches the real `process` through its own `constructor`, and every useful
tool needs at least one capability. Tools are registered by explicit import, in a reviewed pull
request. See **[Security](Security)** and
[ADR 0002](https://github.com/doublegate/CyberChef-MCP/blob/master/docs/adr/0002-tool-registry-is-not-a-plugin-loader.md).

## Can several clients share one server?

Yes, over HTTP — each session gets its own server and transport instance. Sharing them leaks data
between clients, which is the substance of the SDK's own GHSA-345p-7cg4-v4c7 advisory. Bind to
`127.0.0.1`: there is **no authentication** on any transport. See **[Transports](Transports)**.

## What is the difference between the wiki and the documentation site?

The [site](https://doublegate.github.io/CyberChef-MCP/) is generated from `docs/` and from the
server's own `OperationConfig`, so it cannot drift from the code. The wiki is the practical layer
and is editable without a pull request. If they disagree, the site is right.
