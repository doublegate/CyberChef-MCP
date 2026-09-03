# Release plans

One plan per release, written ahead of the work. `ROADMAP.md` is the authoritative numbering;
`docs/releases/<version>.md` is the authoritative record of what actually shipped.

> **Historical as of 2026-09-03.** Every file in this directory now carries a dated banner saying
> whether it was delivered, delivered-and-re-scoped, or superseded, and by what. **No plan here
> describes unshipped work.**
>
> Planning for v3.0.0 onward lives in [`../v3/`](../v3/), and is deliberately shaped differently:
> one deep plan for the release being executed, a one-page charter for each candidate after it, and
> [`../v3/RE-MEASURE.md`](../v3/RE-MEASURE.md) as a mandatory gate between them. The reason is in
> this directory's own record — six consecutive releases opened by measuring their plan and finding
> it empty, already built, or superseded. **A detailed plan for a release two years out is a
> hypothesis written at the point of least information.**

## The one-version offset, and how it was reconciled

This set was written in December 2025 and numbered on the assumption that every planned release
would ship in order. From **v2.1.0 onward it did not**: an unplanned v2.1.0 was cut, and every
subsequent plan shipped one version later than its title. The plans stayed as written while
`ROADMAP.md` was updated to reality, so for several releases the two disagreed — a plan titled
"v2.4.0 — Enterprise Features" described what was actually being built as v2.5.0.

Reconciled in v2.5.0, deliberately in two different ways:

| plan file | its theme | disposition |
|---|---|---|
| `release-v2.1.0.md` | Multi-Modal Support | **shipped as v2.2.0** — annotated, not renamed |
| `release-v2.2.0.md` | Advanced Transports | **shipped as v2.3.0** — annotated, not renamed |
| `release-v2.3.0.md` | Plugin Architecture | **shipped as v2.4.0** — annotated, not renamed |
| `release-v2.4.0.md` | Enterprise Features | **shipped as v2.5.0** — annotated, not renamed |
| `release-v2.6.0.md` | Distributed Architecture | **renumbered** from v2.5.0 |
| `release-v2.7.0.md` | Observability & Monitoring | **renumbered** from v2.6.0 |
| `release-v2.8.0.md` | Edge Deployment | **renumbered** from v2.7.0 |
| `release-v2.9.0.md` | AI-Native Features | **renumbered** from v2.8.0 |
| `release-v2.9.x.md` | Pre-v3.0.0 Polish | **renumbered** from v2.9.0 |

**Why the two halves are treated differently.** A plan for a release that has already shipped is a
historical document: renaming it to match the version it turned into would make the directory tidy
at the cost of falsifying what was planned and when. Those carry a banner naming the release that
delivered them instead. A plan for a release that has *not* happened has no history to protect and
every reason to carry the right number, so those were renumbered outright.

There is deliberately **no `release-v2.1.0.md`** describing what v2.1.0 shipped. v2.1.0 was not in
this plan set; it was cut in response to what v2.0.0 found. Its record is
[`docs/releases/v2.1.0.md`](../../releases/v2.1.0.md).

## Re-scoped themes

Three plans were re-scoped rather than executed as written, each recorded where the decision was
made rather than quietly dropped:

- **Advanced Transports** (shipped as v2.3.0) — "WebSocket, Streamable HTTP, SSE" no longer
  described anything buildable against the current MCP specification; shipped as protocol currency.
- **Plugin Architecture** (shipped as v2.4.0) — the registry shipped, the loader did not.
  [ADR 0002](../../adr/0002-tool-registry-is-not-a-plugin-loader.md) records why, including the
  measurement showing `node:vm` cannot sandbox a plugin that holds any capability at all.
- **Enterprise Features** (shipped as v2.5.0) — authorization applies to HTTP only. The MCP
  authorization specification says an stdio implementation SHOULD NOT use OAuth and should take
  credentials from the environment, so the default transport is untouched.
