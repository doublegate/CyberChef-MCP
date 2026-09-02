# Deploying CyberChef MCP

Manifests for running the server as a **shared HTTP service**.

**Most people do not need any of this.** The ordinary way to use an MCP server is to let the
client launch it on stdio — `npx cyberchef-mcp` — which needs no deployment, no ports, and no
authentication, because the client already owns the process. Reach for this directory when the
server is a service several people or machines talk to.

| | |
|---|---|
| [`helm/cyberchef-mcp`](helm/cyberchef-mcp) | Kubernetes chart: probes, drain, HPA, PDB, ingress |
| [`compose/docker-compose.yml`](compose/docker-compose.yml) | Docker Compose, for a single host |

## What scales, and what does not

The server is **stateless per request**. MCP protocol revision `2026-07-28` removed protocol-level
sessions entirely — no `initialize` handshake, no `Mcp-Session-Id`, no resumable streams — so
there is nothing to make sticky and no session store to run. Replicas need no coordination and no
session affinity.

Two things are per-process, and only one of them matters:

| state | per replica | consequence |
|---|---|---|
| Operation cache | yes | Fine. It is a cache; each replica warms its own. |
| **Recipe storage** | **yes** | **The real constraint.** See below. |

### The recipe constraint

Saved recipes are a JSON file. There is deliberately no database and no Redis: adding one to
coordinate a single JSON document would be a large dependency for a small problem, and this
project keeps its dependency surface small on purpose.

So there are exactly two correct configurations:

1. **A volume per replica** (`persistence.perReplica=true`, the chart default when persistence is
   on). Each replica keeps its own recipes. They do not share, so they cannot conflict — at the
   cost of a recipe being visible only on the pod that saved it.
2. **One replica** with a single volume.

Sharing one volume between replicas is **not** supported, and the chart refuses to render it:

```
$ helm template . --set persistence.enabled=true \
    --set persistence.perReplica=false --set replicaCount=3
Error: persistence.perReplica=false shares ONE recipe volume between replicas, which makes
them conflict: the server detects the stale write and refuses it, so saves fail.
```

The server also detects it at run time. Each save carries a generation, checked against the file
immediately before the commit, so a stale writer is **refused** rather than silently discarding
the other replica's work. Before that check, the failure looked like this:

```
A saved. A sees: [ 'saved-by-A' ]
B saved WITHOUT complaint
on disk now:     [ 'saved-by-B' ]      <- A's recipe is gone
```

It is a conflict detector, not a lock — there is a window between the check and the commit, and
Node has no portable advisory locking. It turns silent data loss into a clear error, which is the
part worth having.

If you do not use saved recipes, none of this applies: scale freely.

## Zero-downtime rolling updates

Kubernetes sends `SIGTERM` and removes the pod from Service endpoints **at the same time**, and
endpoint removal has to propagate through kube-proxy and any ingress before traffic actually
stops. A server that exits on SIGTERM therefore drops the requests routed during that window: the
deploy looks clean and a fraction of requests fail.

The chart closes that window from both ends:

```
preStopSleepSeconds: 5      # delays SIGTERM so endpoint removal propagates first
drain.delaySeconds: 5       # after SIGTERM, keeps serving while readiness reports failure
drain.timeoutSeconds: 20    # then waits for in-flight work, bounded
terminationGracePeriodSeconds: 45   # must exceed 5 + 5 + 20
```

If you change any of those, keep the grace period larger than the sum, or the kubelet SIGKILLs
the process partway through its own shutdown and the drain achieves nothing.

## Probes

Three endpoints, unauthenticated because a kubelet probe carries no bearer token, and
deliberately uninformative — a status string, nothing else.

| path | meaning | while draining |
|---|---|---|
| `/health/startup` | finished booting | 200 |
| `/health/ready` | send me traffic | **503** |
| `/health/live` | process is working | **200** |

**Liveness stays healthy during a drain, and that is not an oversight.** A failing liveness probe
means *restart me*; during a drain the server is deliberately refusing new traffic while finishing
in-flight work, and a liveness failure there gets the pod killed mid-drain — the opposite of what
the drain is for. Only readiness flips.

## Quick start

```bash
# Kubernetes
helm install cyberchef deploy/helm/cyberchef-mcp

# Docker Compose
docker compose -f deploy/compose/docker-compose.yml up
```

Then point an MCP client at `http://<service>:3000/mcp`.

## Authorization

Off unless configured, and the chart refuses configurations the server would reject at startup:

```bash
helm install cyberchef deploy/helm/cyberchef-mcp \
  --set auth.enabled=true \
  --set auth.issuer=https://auth.example.com \
  --set auth.resource=https://mcp.example.com/mcp
```

`auth.resource` is required, not optional. It is what the token's `aud` claim is checked against
(RFC 8707), so a mismatch — a stray trailing slash, a different host — rejects every otherwise
valid token, and the symptom looks exactly like "authentication is broken".

Multi-tenancy requires authorization; the chart fails at template time rather than letting the pod
crashloop, because the tenant is read from a claim on a **verified** token and without one every
caller would silently share a tenant.

See the [Configuration wiki page](../docs/wiki/Configuration.md) for every variable.

## Ingress and SSE

A `tools/call` may answer with an SSE stream. If your ingress buffers responses, streamed progress
arrives all at once when the request finishes. For ingress-nginx:

```yaml
ingress:
  annotations:
    nginx.ingress.kubernetes.io/proxy-buffering: "off"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
```

SSE responses already carry `X-Accel-Buffering: no` — set by the MCP SDK's Streamable HTTP
handler, not by this server — which nginx honours. The annotations cover proxies that do not, and
the read timeout, which that header does not affect.
