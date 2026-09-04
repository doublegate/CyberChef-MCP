# Observability

A Grafana dashboard, Prometheus alerting rules, and what they are built on.

| File | What it is |
|---|---|
| `cyberchef-mcp-dashboard.json` | The dashboard. 25 panels, 5 rows. Import it, or provision it. |
| `alerts.yaml` | 9 Prometheus alerting rules. Also shipped by the Helm chart as a `PrometheusRule`. |

## Start here: two independent sources of data

The dashboard reads from two places, and it is worth knowing which is which before wondering why
a panel is empty.

**The `/metrics` endpoint** is built into the server, has no dependencies, and needs nothing but
`CYBERCHEF_METRICS_ENABLED=true`. 20 metric families: traffic, per-tool counters, quota, cache,
rate limiter, lifecycle, process. **21 of the 25 panels run on this alone.**

**OpenTelemetry traces and the duration histogram** need an SDK, which this server deliberately
does not bundle — see below. Without one, the four panels in the Latency row read *No data* and the other 21 work.

## Enabling the metrics endpoint

```bash
CYBERCHEF_METRICS_ENABLED=true   # off by default
```

Then `GET /metrics` on the same listener as `/mcp`. There is no second port.

**It is unauthenticated when on, and it is opt-in for a reason.** A Prometheus scraper carries no
bearer token, which is the same constraint that makes the health probes unauthenticated. But
metrics are not health: a probe answers "should I get traffic" in one word, while a scrape reports
which tools are being used, how often, how large the inputs are, and how many tenants are active.
That is a useful reconnaissance surface. So unlike the probes it is off unless asked for, and it
belongs on an internal network or behind a `NetworkPolicy`.

When disabled, `/metrics` is not special-cased at all — it falls through to the ordinary 404, so a
prober cannot tell "metrics off" from "not this server".

### What is never exposed

No tenant identifiers, no tool arguments, no subject digests, no recipe names, no error messages.

Tenant **count** is exposed; tenant **names** are not. A tenant identifier in a metric label is the
classic way tenant identity leaks into a system nobody access-controlled for it, and label
cardinality makes it permanent. If you need per-tenant attribution, take it from the audit log,
which *is* access-controlled.

Tool names carry a hard cap of 1024 distinct labels, overflowing into `__other__`. The tool name
reaching the counter is the name the *caller* asked for — an unknown one is dispatched, fails to
resolve, and is recorded as a failure — so without that cap anyone able to call this server could
mint arbitrary Prometheus labels in a loop and explode cardinality in a monitoring system shared
with every other service. Overflow is bucketed rather than dropped, because a flood of unknown tool
names is worth seeing.

## Traces and the latency panels

The server depends on `@opentelemetry/api` and nothing else. It creates spans and records the
conventional histogram; it never configures an exporter, a sampler or a processor. **You supply the
SDK**, which is the standard Node pattern:

```bash
node --import ./otel-bootstrap.mjs src/node/mcp-server.mjs
```

Measured before deciding:

| | packages | disk | startup |
|---|---|---|---|
| `@opentelemetry/sdk-node` + OTLP + Prometheus exporters | 71 | 50 MB | **+100 ms** |
| `@opentelemetry/api` alone | 1 | 2.6 MB | **+9 ms** |

v2.6.0 spent an entire release taking cold start from ~1300 ms to ~185 ms. Bundling the SDK gives
back more than half of that on **every stdio launch** — which is how essentially every editor starts
this server, where there is no collector and never will be. And the API is genuinely free when
nothing is registered: 100,000 span-plus-metric cycles measured at **8 ms total**, 0.08 µs each,
with `isRecording()` returning false.

The upside is not only cost. Because the operator picks the exporter, **every OTLP backend works**
rather than a chosen few.

### Tool arguments are never recorded

The MCP semantic conventions define `gen_ai.tool.call.arguments` and `gen_ai.tool.call.result` as
**Opt-In**. This server does not opt in, and the reason is specific rather than general caution:
*the arguments to a CyberChef tool are the sensitive material.* A key, a password hash, the document
being decoded. Shipping them to a tracing backend copies exactly what the caller is analysing into a
system with different retention, different access control, and usually a longer memory.

`error.type` is set from the structured error **code** or the exception class — never the message,
because messages quote their input.

Sizes and counts are recorded. Content never is.

### Exemplars

The latency heatmap requests exemplars, so a bucket can link to the trace that produced it. That
needs three things: an SDK (above), Prometheus started with `--enable-feature=exemplar-storage`, and
a trace destination on the Prometheus data source:

```yaml
jsonData:
  exemplarTraceIdDestinations:
    - name: trace_id
      datasourceUid: tempo          # your tracing data source
      urlDisplayLabel: "View trace"
```

With those in place the magenta dots on the heatmap become clickable. Without them the heatmap still
works; there are simply no dots.

## Running it

The repository ships a stack that wires all of this together, which is how the dashboard and the
rules here were actually verified rather than reviewed by eye:

```bash
docker compose -f deploy/compose/docker-compose.yml \
               -f deploy/compose/docker-compose.observability.yml up
```

Grafana on <http://127.0.0.1:3001> opens straight onto the dashboard; Prometheus on
<http://127.0.0.1:9090> has the alert rules loaded. Both bind to loopback, and Grafana runs
anonymous-admin — it is a development stack, not a deployment.

### Kubernetes

The Helm chart wires the scrape for you:

```yaml
metrics:
  enabled: true
monitoring:
  serviceMonitor:
    enabled: true      # needs the Prometheus Operator CRDs
  prometheusRule:
    enabled: true      # ships alerts.yaml as a PrometheusRule
```

Without the Operator, set `monitoring.podAnnotations: true` for the classic
`prometheus.io/scrape` annotations instead.

### Importing the dashboard by hand

Grafana → Dashboards → New → Import → upload `cyberchef-mcp-dashboard.json`, and pick your
Prometheus data source when prompted. The dashboard has no hard-coded data source UID; it uses a
`datasource` variable, so it works against any Prometheus without editing.

## Reading the dashboard

Panels carry their own descriptions — hover the ⓘ. The three worth knowing before an incident:

**Lifecycle state per replica** (state timeline) is the deploy panel. A correct rolling update is a
band of `draining` that appears on one replica at a time and clears within the drain budget, while
at least one other stays `serving`. Two shapes are faults: `draining` that never ends (the drain is
stuck and will be SIGKILLed), and every replica leaving `serving` at once (no surge capacity, and
traffic was dropped).

**Operation duration distribution** is a heatmap rather than percentile lines because CyberChef
latency is genuinely multi-modal — a cache hit, a base64 decode and a bcrypt comparison are three
populations sharing one histogram. A p95 line averages them into a number describing none of them.
Percentiles are the right thing to *alert* on; the distribution is the right thing to *diagnose*
from, which is why both are there.

**Memory per replica** will show a step of roughly 100–200 MB the first time `cyberchef_search`,
batch search, or a saved recipe runs on a replica. That is the Node API loading all 504 operation
implementations, deferred in v2.6.0. It happens once per process and is **not a leak** — but a
container memory limit sized for the idle process will OOM exactly there, rather than at startup.

## Alerting

`alerts.yaml` holds 9 rules. Two absences are deliberate:

**No latency alert.** This server has no meaningful latency SLO to write one against — any single
threshold is either useless for the fast operations or a permanent page for the slow ones. Latency
belongs on the dashboard, where a human reads the distribution.

**No per-tenant alert.** Tenant identity is not in the metrics, on purpose.

Two rules are more carefully guarded than they first look. `CyberChefMCPQuotaSaturated` compares the
process-wide in-flight count against a **per-tenant** limit, which is only meaningful with one
active tenant — so it is gated on `active_tenants <= 1` rather than misfiring on every multi-tenant
deployment. `CyberChefMCPCacheThrashing` requires a full cache **and** a poor hit rate, because
either alone is healthy: a full cache with a good hit rate is a cache working, and a poor hit rate
on a cold cache is a cache warming.

## Metric reference

| Metric | Type | Notes |
|---|---|---|
| `cyberchef_mcp_build_info` | gauge | Always 1, version in a label. Join on it. |
| `cyberchef_mcp_lifecycle_state` | gauge | 0/1 per `state`. One family, three samples. |
| `cyberchef_mcp_operations_total` | counter | Operations accepted by the quota tracker. |
| `cyberchef_mcp_operations_in_flight` | gauge | Currently executing. |
| `cyberchef_mcp_max_concurrent_operations` | gauge | The limit — **per tenant**. |
| `cyberchef_mcp_active_tenants` | gauge | Count only. Never names. |
| `cyberchef_mcp_input_bytes_total` | counter | Bytes into operations. |
| `cyberchef_mcp_output_bytes_total` | counter | Bytes out. |
| `cyberchef_mcp_tool_calls_total` | counter | Per tool. Monotonic. |
| `cyberchef_mcp_tool_failures_total` | counter | Per tool. |
| `cyberchef_mcp_tool_cache_hits_total` | counter | Per tool. |
| `cyberchef_mcp_telemetry_buffered_samples` | gauge | Opt-in buffer depth; 0 by default. |
| `cyberchef_mcp_rate_limit_enabled` | gauge | 1 when enforcing. |
| `cyberchef_mcp_rate_limit_tracked_callers` | gauge | Callers under track. |
| `cyberchef_mcp_cache_items` / `_bytes` / `_max_bytes` | gauge | Operation cache. |
| `cyberchef_mcp_process_resident_memory_bytes` | gauge | RSS. |
| `cyberchef_mcp_process_heap_used_bytes` | gauge | Heap. |
| `cyberchef_mcp_process_uptime_seconds` | gauge | Monotonic within a process; `resets()` finds restarts. |
| `mcp.server.operation.duration` | histogram | **OTel only.** Seconds, per the MCP conventions. |

### The counters are counters

The per-tool totals come from dedicated monotonic counters, **not** from the telemetry ring buffer.
That distinction is load-bearing and was a bug in the first draft of this work: the buffer holds the
last 10,000 executions and drops the oldest, so a count derived from it *falls* on rollover —
and Prometheus reads a falling counter as a process restart, quietly inventing traffic in every
`rate()` over it.

They are also maintained **whether or not** `CYBERCHEF_TELEMETRY_ENABLED` is set. That flag gates
the per-call records — durations, sizes, timestamps, one row per execution — not the fact that a
tool ran. With the gate above the counters, `/metrics` on a default deployment would report zero
tool calls forever, no matter how much traffic the server was serving; an operator would conclude
the server was idle or the endpoint broken. A monitoring surface that reads empty under load is
worse than none, because it is believed.

### On schema version

The dashboard is schema v1 (`schemaVersion: 39`), not Grafana 12's v2 dynamic-dashboard schema.
That is deliberate: v2 is experimental, Grafana's own guidance is not to use it in production, and
migration to it is **one-way** — a dashboard converted cannot be converted back. v1 imports cleanly
into Grafana 10, 11 and 12.
