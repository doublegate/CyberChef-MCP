# Release History

Full notes for every version live in
[`docs/releases/`](https://github.com/doublegate/CyberChef-MCP/tree/master/docs/releases) and on the
[releases page](https://github.com/doublegate/CyberChef-MCP/releases). This is the shape of the 2.x
line, and what each release was actually *about*.

## v2.7.0 — observability

A dependency-free Prometheus endpoint at `/metrics` (**off by default** — see
**[Configuration](Configuration#observability-v270)** for why it is opt-in when the health probes
are not), OpenTelemetry spans following the MCP semantic conventions, and trace correlation on every
log line.

It adds **one** package, and that was the release's main decision: the OTel *API*, not the SDK.
Measured at 1 package / 2.6 MB / +9 ms against the SDK's 71 packages / 50 MB / +100 ms — which would
have handed back more than half of v2.6.0's startup work on every stdio launch, for users collecting
nothing. You supply the SDK, so every OTLP backend works rather than the three the plan named.

Tool arguments are never recorded. The conventions mark them Opt-In, and for this server the
arguments *are* the sensitive material.

Ships a 25-panel Grafana dashboard, 9 alert rules, a Helm `ServiceMonitor` and `PrometheusRule`, and
a runnable Prometheus + Grafana stack — all of it executed against a live server rather than
reviewed. Building the dashboard is what found the bugs: per-tool counters that could *decrease*
(and so would have made `rate()` invent traffic), counters that read zero forever on a default
deployment, a duplicated `# HELP` line that fails an entire scrape, and caller-controlled metric
labels that anyone could have used to explode a shared Prometheus.

## v2.6.0 — deployable, and seven times faster to start

Cold start ~1300 ms → **~185 ms**. 88% of it was one import pulling in all 505 operation
implementations before answering anything, on a path only three tools need. A background warm-up was
tried, measured, and removed — module loading blocks the event loop, so "in the background" is not
something it can be.

Health probes and a drain that loses no requests during a rolling update. Liveness deliberately
stays healthy while draining: a liveness failure there gets the pod killed mid-drain.

A [Helm chart and Compose file](https://github.com/doublegate/CyberChef-MCP/tree/master/deploy),
where the chart *refuses to render* configurations the server would reject at startup. Conflict
detection on saved recipes — two replicas sharing one file had been silently discarding each other's
writes. And a 5 s deadline plus a circuit breaker on JWKS calls, so an issuer outage no longer turns
every request into two outbound ones.

The plan's centrepiece — a Redis session store with affinity and sticky sessions — was dropped:
MCP `2026-07-28` removed protocol-level sessions, so there was nothing to externalise.

## v2.5.0 — authorization and multi-tenancy

OAuth 2.1 **Resource Server** on HTTP: RFC 9728 Protected Resource Metadata, JWKS bearer validation,
and RFC 8707 audience binding — the check that stops a token minted for another service being
replayed here. Scope-based RBAC with three scopes, where the scope a tool needs is *derived from its
annotations* rather than a table that goes stale. Audit logging.

Multi-tenancy across the operation cache, recipe store, concurrency pool and audit trail, with the
tenant read from a claim on an already-verified token — never from a header the caller controls.
Without it, any caller on a shared HTTP deployment could read and delete any other caller's recipes.

Also fixed a rate limiter that had never limited anything since v1.7.0: it was keyed on a
per-request UUID, so every call looked like a first-time caller. Measured at 0 denials in 1000
requests against a limit of 5.

Not applied to stdio, deliberately — the specification says stdio SHOULD NOT use OAuth, because a
bearer token protects nothing when the client already owns the process.

## v2.4.0 — the tool registry

Four analysis tools that an operation cannot express: `xor_key_length`, `cyclic_pattern`,
`hash_identify`, `rsa_attack`. See **[Analysis Tools](Analysis-Tools)**.

No plugin loader, deliberately — `node:vm` is not a security boundary, and that was measured rather
than assumed. Also corrected three documents that described work nobody had done, including a
third-party notices file crediting eight ports that were not ports.

## v2.3.0 — protocol currency and transports

Protocol revision **2026-07-28** on both stdio and HTTP, served alongside the 2025 era from one set
of handlers (MCP SDK v2). A **socket transport**. npm distribution unblocked.

And the release that found **17 image operations returning Node's shared buffer pool instead of the
image** — a `Buffer` is a view, so `.buffer` is the pool, and a 129-byte PNG came back as a
65,599-byte `ArrayBuffer` of whatever the process had recently allocated. Reported privately
upstream as GHSA-hj7h-fgw7-x6w8. `Add Text To Image` turned out never to have worked in this fork
at all.

Coverage thresholds were raised from 75/70/90/75 to **95/88/96/96** — the old numbers sat twenty
points below actual, so the gate could not fail.

## v2.2.0 — multi-modal

`Generate QR Code`, `Render Image` and the image set return a real MCP `image` content block;
`Play Media` returns `audio`. Before this, the html-to-text conversion deleted the payload and
these operations returned an empty string — they had never worked over MCP.

**Tool annotations on every tool**, so a client can skip the approval prompt for a pure operation.
The exceptions were measured, not guessed: only `HTTP request` and `DNS over HTTPS` reach the
network. Plus five [prompts and recipe resources](Prompts-and-Resources).

## v2.1.1 — security sweep

55 code-scanning alerts dispositioned: fixed, suppressed with a written justification, or dismissed
with a reason.

## v2.1.0 — the tool surface

`tools/list` became an **index** rather than a catalogue: ~24 tools instead of 527 at the time.
See
**[The Tool Surface](Tool-Surface)**.

This is also the release whose testing lesson shaped everything after it. Every test before it
spoke raw JSON-RPC — which does no schema validation — so three releases had shipped with **every
one of 524 tools carrying an empty `inputSchema`**, with the suite green throughout.

## v2.0.0 — the major

Upstream catch-up **v10.19.4 → v11.4.0** (440 → 505 operations). Relicensed to
**GPL-3.0-or-later**. Per-session HTTP transport. 272 security findings closed. The `cyberchef_`
prefix removal was **withdrawn** after measurement: it saved 2.6% of the payload against breaking
every integration and creating 19 colliding names.

## Before 2.0

The 1.x line ran from v1.0.0 to v1.9.0, building the MCP layer itself: streaming and structured
errors (1.5), recipe management (1.6), batch and caching and quotas (1.7), the deprecation contract
(1.8), worker threads (1.9).

`cyberchef-mcp_v1` is **frozen but pullable**. Its tags stay available, and a v1.9.x maintenance
branch ships security-only patches until roughly March 2027 — still under **Apache-2.0**, since the
GPL relicensing applies from v2.0.0 forward.

## Versioning

SemVer. Additive features ship off by default so non-major releases stay compatible. Breaking
save-state, format or API changes are reserved for a clearly announced major.
