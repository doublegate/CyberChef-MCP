# Configuration

Every setting is an environment variable. Nothing requires a config file.

## Tool surface

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_TOOL_SURFACE` | `index` | `index`, `curated` or `all` — see **[The Tool Surface](Tool-Surface)** |
| `CYBERCHEF_TOOL_ALLOWLIST` | *unset* | Comma-separated **operation names** (`To Base64`), overriding the mode |
| `CYBERCHEF_EXPOSE_ALL_OPS` | `false` | Historical alias for `CYBERCHEF_TOOL_SURFACE=all` |
| `CYBERCHEF_MAX_TOOL_DESCRIPTION` | — | Truncates long operation descriptions in `tools/list` |

## Transport

See **[Transports](Transports)** for the full picture.

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_TRANSPORT` | `stdio` | `stdio`, `http` or `socket` |
| `CYBERCHEF_HTTP_HOST` | `127.0.0.1` | Bind address **inside** the container |
| `CYBERCHEF_HTTP_PORT` | `3000` | |
| `CYBERCHEF_HTTP_PATH` | `/mcp` | |
| `CYBERCHEF_HTTP_MAX_BODY` | — | Request body cap |
| `CYBERCHEF_ALLOWED_HOSTS` | loopback names | **DNS-rebinding protection**, on by default. `*` disables it |
| `CYBERCHEF_ALLOWED_ORIGINS` | — | `Origin` header allowlist |
| `CYBERCHEF_MAX_SESSIONS` | — | Concurrent HTTP sessions |
| `CYBERCHEF_SESSION_TIMEOUT` | — | Idle session reaping |
| `CYBERCHEF_SOCKET_PATH` | — | Unix domain socket, created `0600` |
| `CYBERCHEF_SOCKET_HOST` / `_PORT` | `127.0.0.1` / — | Loopback TCP instead |
| `CYBERCHEF_SOCKET_MAX_CONNECTIONS` | — | |
| `CYBERCHEF_SOCKET_ALLOW_REMOTE` | *unset* | Required to bind off-loopback |

**`CYBERCHEF_ALLOWED_HOSTS` is DNS-rebinding protection, not access control.** It checks the `Host`
header, which a direct client simply sets correctly. It stops a *browser* on the victim's machine
being used to reach a loopback server; it stops nothing else.

## Authorization (v2.5.0)

**Off unless `CYBERCHEF_AUTH_ISSUER` is set**, and applies to the **HTTP transport only** — the MCP
specification says stdio `SHOULD NOT` use OAuth and should take credentials from the environment,
because a bearer token protects nothing when the client already owns the process.

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_AUTH_ISSUER` | *unset* | The authorization server's issuer URL. **Setting this turns authorization on.** |
| `CYBERCHEF_AUTH_RESOURCE` | *unset* | This server's canonical URI, e.g. `https://mcp.example.com/mcp`. Must be absolute and carry no fragment |
| `CYBERCHEF_AUTH_AUDIENCE` | the resource URI | Override only if your authorization server issues a fixed audience string that is not a URI |
| `CYBERCHEF_AUTH_JWKS_URI` | discovered | Skips RFC 8414 / OpenID discovery |
| `CYBERCHEF_AUTH_REQUIRED_SCOPES` | *none* | A baseline scope demanded on every request, in addition to the per-tool check |
| `CYBERCHEF_AUDIT_ENABLED` | follows auth | Force audit logging on or off independently |
| `CYBERCHEF_TENANT_CLAIM` | *unset* | Token claim naming the tenant, e.g. `tid`. **Setting this turns multi-tenancy on**, and requires `CYBERCHEF_AUTH_ISSUER` |

**`CYBERCHEF_AUTH_RESOURCE` is not optional in practice.** It is what the token's `aud` claim is
checked against (RFC 8707), so a mismatch — a stray trailing slash, a different host — rejects
every otherwise-valid token. Getting this wrong looks like "authentication is broken" and is
actually "the audience does not match".

### Scopes

| Scope | Grants |
|---|---|
| `cyberchef:read` | Pure operations — encode, decode, hash, parse |
| `cyberchef:write` | Anything that changes state: recipe create/update/delete, cache clear. Implies `read` |
| `cyberchef:network` | The two operations that reach the internet (`HTTP request`, `DNS over HTTPS`) and `cyberchef_bake`, which can run either. Implies `read` |

`network` is deliberately **not** implied by `write`: an operation that reaches the internet is not
adequately described as "write", and conflating them would let a token granted for local mutation
drive outbound requests.

Which scope a tool needs is derived from its MCP annotations rather than a hand-maintained table,
so a tool added upstream is classified the moment it is annotated. See
**[Security](Security)** for the reasoning.

### A minimal setup

```bash
docker run -i --rm -p 127.0.0.1:3000:3000 \
  -e CYBERCHEF_TRANSPORT=http \
  -e CYBERCHEF_AUTH_ISSUER=https://auth.example.com \
  -e CYBERCHEF_AUTH_RESOURCE=https://mcp.example.com/mcp \
  ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

Verify discovery works before pointing a client at it — the metadata document is served without a
token, by design:

```bash
curl -s http://127.0.0.1:3000/.well-known/oauth-protected-resource/mcp | jq
```


## Multi-tenancy (v2.5.0)

**Off unless `CYBERCHEF_TENANT_CLAIM` is set.** With it unset the server runs in a single tenant
and behaves exactly as it did before v2.5.0 — which is correct for stdio, where one client owns the
process, and for any single-user HTTP deployment.

Set it to the claim your authorization server puts the tenant in: `tid` for Microsoft Entra,
`org_id` for Auth0, or whatever your issuer uses.

```bash
docker run -i --rm \
  -e CYBERCHEF_TRANSPORT=http \
  -e CYBERCHEF_AUTH_ISSUER=https://auth.example.com \
  -e CYBERCHEF_AUTH_RESOURCE=https://mcp.example.com/mcp \
  -e CYBERCHEF_TENANT_CLAIM=tid \
  cyberchef-mcp
```

**Tenancy requires authorization, and the server will not start without it.** The tenant is read
from a claim on a token the server has already verified. Without authorization there is no verified
token, so every caller would silently share one tenant while you believed they were separated —
which is why this is a startup error rather than a warning.

What is isolated:

| | |
|---|---|
| **Recipes** | scoped per tenant for read, list, update, delete, stats and `clear()` |
| **Operation cache** | tenant is part of the cache key |
| **Concurrency slots** | `CYBERCHEF_MAX_CONCURRENT_OPS` applies *per tenant* |
| **Recipe cap** | `CYBERCHEF_RECIPE_MAX_COUNT` applies *per tenant* |
| **Audit records** | carry the tenant |

**Upgrading an existing recipe store is safe.** A recipe saved before v2.5.0 has no tenant field
and belongs to the default tenant, so a single-tenant deployment sees exactly what it saw before.

**A token whose tenant claim is missing, blank, or malformed is refused with `403`** rather than
placed in the default tenant — putting an unidentifiable caller in with everyone else is the
failure this feature exists to prevent. Identifiers are validated against an allowlist
(`A-Za-z0-9._:@-`, at most 128 characters); `.`, `..` and `default` are reserved.

## Health and shutdown (v2.6.0)

**HTTP transport only.** On stdio there is no listener to probe and no load balancer to inform.

Three endpoints, served **without authentication** because a kubelet probe carries no bearer
token, and deliberately uninformative — a status string and nothing else:

| path | 200 when | 503 when |
|---|---|---|
| `/health/startup` | the listener is bound | still starting |
| `/health/ready` | serving | starting **or draining** |
| `/health/live` | **always**, until the process exits | never |

**Liveness stays healthy during a drain, and that is deliberate.** A failing liveness probe means
*restart me*; during a drain the server is refusing new traffic while finishing in-flight work, so
a liveness failure there gets the pod killed mid-drain — the opposite of what the drain is for.
Only readiness flips. If you wire liveness to `/health/ready`, you have recreated that bug.

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_DRAIN_DELAY_MS` | `5000` | After `SIGTERM`: how long to keep serving while readiness reports failure |
| `CYBERCHEF_DRAIN_TIMEOUT_MS` | `20000` | Then how long to wait for in-flight requests before closing anyway |

The delay exists because Kubernetes sends `SIGTERM` and removes the pod from Service endpoints
**at the same time**, and endpoint removal has to propagate through kube-proxy and any ingress
first. A server that exits on `SIGTERM` therefore drops the requests routed during that window:
the deploy looks clean and a fraction of requests fail.

Keep `terminationGracePeriodSeconds` **larger** than `preStop + delay + timeout`, or the kubelet
`SIGKILL`s the process partway through its own shutdown and the drain achieves nothing. The
[Helm chart](https://github.com/doublegate/CyberChef-MCP/tree/master/deploy/helm/cyberchef-mcp)
sets all four consistently.

Both default to 0 being meaningful, not missing: `CYBERCHEF_DRAIN_DELAY_MS=0` disables the grace
window, which is what you want under Docker Compose or anywhere without a load balancer.

## Scaling and replicas (v2.6.0)

The server is **stateless per request**. MCP revision `2026-07-28` removed protocol-level sessions
entirely, so replicas need no session store, no sticky routing and no affinity.

One thing is not shared: **saved recipes are a JSON file**, local to each process. There is
deliberately no database — see [Deploying](https://github.com/doublegate/CyberChef-MCP/tree/master/deploy)
for the reasoning. Two supported configurations:

1. **A volume per replica** — recipes are per-pod, and replicas cannot conflict.
2. **A single replica** with one volume.

Pointing several replicas at one shared file is not supported. The server detects it: each save
carries a generation checked immediately before the commit, so a stale writer is **refused** rather
than silently discarding another replica's recipes. It is a conflict detector, not a lock.

If you do not use saved recipes, none of this applies — scale freely.

## Limits and safety

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_MAX_INPUT_SIZE` | `104857600` (100 MB) | Rejected above this |
| `CYBERCHEF_OPERATION_TIMEOUT` | `30000` (30 s) | Per call, including registry tools |
| `CYBERCHEF_MAX_CONCURRENT_OPS` | — | Quota on simultaneous operations |
| `CYBERCHEF_MAX_REGEX_LENGTH` | — | Guards the regex-taking operations against ReDoS |
| `CYBERCHEF_RATE_LIMIT_ENABLED` | `false` | |
| `CYBERCHEF_RATE_LIMIT_REQUESTS` | `100` | Per window |
| `CYBERCHEF_RATE_LIMIT_WINDOW` | `60000` (60 s) | |

## Performance

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_CACHE_ENABLED` | `true` | LRU cache of operation results |
| `CYBERCHEF_CACHE_MAX_SIZE` | `104857600` (100 MB) | |
| `CYBERCHEF_CACHE_MAX_ITEMS` | `1000` | |
| `CYBERCHEF_ENABLE_STREAMING` | `true` | |
| `CYBERCHEF_STREAMING_THRESHOLD` | `10485760` (10 MB) | Inputs above this stream |
| `CYBERCHEF_STREAM_CHUNK_SIZE` / `_MAX_CHUNKS` / `_PROGRESS_INTERVAL` | — | |
| `CYBERCHEF_ENABLE_WORKERS` | `false` | Worker-thread pool, opt-in |
| `CYBERCHEF_WORKER_MIN_THREADS` / `_MAX_THREADS` | — | |
| `CYBERCHEF_WORKER_MIN_INPUT_SIZE` / `_IDLE_TIMEOUT` | — | |
| `CYBERCHEF_MAX_RETRIES` / `_INITIAL_BACKOFF` / `_MAX_BACKOFF` / `_BACKOFF_MULTIPLIER` | — | Retry policy |

## Batch, recipes, telemetry

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_BATCH_ENABLED` | `true` | |
| `CYBERCHEF_BATCH_MAX_SIZE` | `100` | |
| `CYBERCHEF_RECIPE_STORAGE` | — | Where saved recipes live |
| `CYBERCHEF_RECIPE_BACKUP` | — | |
| `CYBERCHEF_RECIPE_MAX_COUNT` / `_MAX_OPERATIONS` / `_MAX_DEPTH` | — | |
| `CYBERCHEF_TELEMETRY_ENABLED` | `false` | **Off by default, privacy-first.** Local only; nothing leaves the process unless you export it |

## Output and diagnostics

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_BINARY_OUTPUT` | *latin1* | Set to `base64` for base64 instead of byte-lossless latin1 text |
| `CYBERCHEF_SUPPRESS_DEPRECATIONS` | `false` | |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

**Logs always go to stderr**, never stdout, because stdout is the protocol stream on stdio.

## Setting them

**Docker:**
```bash
docker run -i --rm \
  -e CYBERCHEF_TOOL_SURFACE=curated \
  -e LOG_LEVEL=debug \
  ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

**In a client config** (`env` block):
```json
{
  "mcpServers": {
    "cyberchef": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "CYBERCHEF_TOOL_SURFACE=curated",
               "ghcr.io/doublegate/cyberchef-mcp_v2:latest"]
    }
  }
}
```

Note that `-e VAR=value` must go in `args` **before** the image name, not after — Docker stops
parsing its own flags at the image.
