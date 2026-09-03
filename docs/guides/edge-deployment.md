# Edge and constrained deployment

Running the server on small hardware, on ARM, or with no route to the internet.

## Architectures

| Platform | Published | Typical hardware |
|---|---|---|
| `linux/amd64` | yes | servers, cloud, most CI |
| `linux/arm64` | **yes, from v2.8.0** | Apple Silicon, AWS Graviton, Raspberry Pi 4/5 |
| `linux/arm/v7` | **no** | Raspberry Pi 3 and older 32-bit ARM |

`docker pull` resolves the right one for you; there is nothing to configure.

**arm/v7 is not available, and the reason is the base image.** `cgr.dev/chainguard/node` publishes
amd64 and arm64 and nothing else, so serving a 32-bit Pi would mean changing base image entirely —
giving up the distroless runtime, the digest pinning and the non-root default that go with it. That
is a bigger trade than 32-bit ARM support is worth here, so it is stated rather than quietly
omitted. If you need it, building `Dockerfile.mcp` against a `node:*-alpine` base on the device
itself is the practical route.

## Image size

| | v2.7.0 | v2.8.0 |
|---|---|---|
| Image | 643 MB | **453 MB** |
| Packages | 1,190 | **432** |

v2.8.0 replaced a hardcoded list of nine package globs with a real `npm prune --omit=dev`. 885 of
the 1,190 packages in the old runtime image were dev-only — `typescript`, `@rolldown`, `@octokit`,
`@babel`, `lightningcss` and the rest — which was attack surface as much as weight.

**It will not get to 50 MB, and you should not wait for that.** `@jimp` (89 MB) and
`tesseract.js-core` (44 MB) are production dependencies of real operations: image manipulation and
OCR. A server exposing all 504 operations cannot be a 50 MB image. If you need one, the honest
answer is a different product — a build with a fixed subset of operations — not a smaller version
of this one.

### Memory

Measured, on an idle process after startup:

```text
RSS       96 MB
heapUsed  22 MB
```

**Expect a one-time step of roughly 100–200 MB** the first time `cyberchef_search`, batch search, or
a saved recipe runs. That is the Node API loading all 505 operation implementations, deferred in
v2.6.0 so that cold start could be ~185 ms. It happens once per process and is not a leak — but a
memory limit sized for the idle figure will OOM at that moment rather than at startup, which is a
confusing place to discover it.

Set limits against the *loaded* figure, not the idle one.

## Recommended settings by deployment size

There is no "profile" setting to choose, deliberately — a profile system would be a new layer of
indirection over environment variables that already exist. This is the same thing as a table.

| | Small (Pi 4, 1 GB) | Medium (2 vCPU, 2 GB) | Large (shared service) |
|---|---|---|---|
| `CYBERCHEF_TOOL_SURFACE` | `index` (default) | `index` | `curated` |
| `CYBERCHEF_MAX_CONCURRENT_OPS` | `2` | `5` | `10` (default) |
| `CYBERCHEF_CACHE_MAX_SIZE` | `16777216` (16 MB) | `67108864` (64 MB) | `104857600` (default) |
| `ENABLE_WORKERS` | unset | unset | `true` |
| `CYBERCHEF_METRICS_ENABLED` | unset | `true` | `true` |
| Container memory limit | 512 Mi | 1 Gi | 1 Gi |

Two notes on the small column. `ENABLE_WORKERS` stays off because a worker pool costs a second Node
heap for a machine that has one core to give it. And the memory limit is 512 Mi rather than 256 Mi
because of the one-time step above — a Pi that only ever runs `cyberchef_to_base64` never pays it,
but the first `cyberchef_search` will.

## Offline and air-gapped

**Most of this already worked.** 502 of the 504 operations are pure functions over bytes and have
never touched a network. Exactly two reach outside the process:

- `HTTP request`
- `DNS over HTTPS`

**No other CyberChef operation makes an outbound call**, and the server itself adds none: there is
no plugin loader ([ADR 0002](../adr/0002-tool-registry-is-not-a-plugin-loader.md)), and it exports
no telemetry of its own (it depends on the OpenTelemetry *API* only — the operator supplies any SDK,
and any collector traffic is that SDK's, not the server's).

**Authentication is the exception, and it is worth putting in your egress plan.** If
`CYBERCHEF_AUTH_ISSUER` is set, the server fetches JWKS from the issuer to validate bearer tokens —
bounded since v2.6.0 by a 5 s deadline and a circuit breaker, but still outbound traffic that an
allowlist has to permit. `CYBERCHEF_OFFLINE` does not disable it, because a deployment that
validates tokens against a *local* issuer is a perfectly ordinary air-gapped configuration and
refusing that would break it. If you are fully air-gapped and not using OAuth, leave
`CYBERCHEF_AUTH_ISSUER` unset and the server makes no outbound call at all.

### The switch

```bash
CYBERCHEF_OFFLINE=true
```

Those two operations are then refused immediately, with an error naming them, instead of hanging
until the OS gives up on a connection to a host that is not routable — which is what happens
without it, while holding a concurrency slot for the duration.

The check is applied to the **recipe**, not the tool name. That distinction is the whole feature:
`cyberchef_bake` is not a network tool, but `cyberchef_bake` with a recipe containing `HTTP request`
is a network call. It is enforced on every path that reaches the engine — direct operations,
`cyberchef_bake`, `cyberchef_batch`, registry tools, streaming, and saved-recipe execute and test.

### What it is not

**It is a posture, not a sandbox.** It refuses operations this server knows to be networked. It
cannot stop a process from opening a socket, and it is not a security boundary.

If you need enforcement rather than cooperation, that belongs in the network namespace:

```yaml
# Kubernetes: deny all egress from the pod.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: cyberchef-mcp-no-egress
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: cyberchef-mcp
  policyTypes: [Egress]
  egress: []          # nothing; add DNS back if your readiness tooling needs it
```

```bash
# Docker: no network at all. stdio only -- there is no port to reach.
docker run -i --rm --network none \
  -e CYBERCHEF_OFFLINE=true \
  ghcr.io/doublegate/cyberchef-mcp_v3:3.0.0
```

Use the switch *and* the namespace control. The switch gives a clear error to the caller; the
namespace makes it true.

## Installing without a registry

Every release attaches a Docker image tarball:

```bash
# On a connected machine
wget https://github.com/doublegate/CyberChef-MCP/releases/download/v3.0.0/cyberchef-mcp-v3.0.0-docker-image.tar.gz

# On the air-gapped machine
docker load < cyberchef-mcp-v3.0.0-docker-image.tar.gz
```

**The tarball is amd64.** It exists for air-gapped installs, where you know which machine you are
feeding, and shipping both architectures would double a 200 MB asset for no one's benefit. On arm64,
pull from the registry on a connected machine and `docker save` it yourself:

```bash
docker pull --platform linux/arm64 ghcr.io/doublegate/cyberchef-mcp_v3:3.0.0
docker save ghcr.io/doublegate/cyberchef-mcp_v3:3.0.0 | gzip > cyberchef-mcp-arm64.tar.gz
```

npm works offline the same way, once the version is on the registry — the tarball and the npm
publish happen in the same release workflow, so `npm pack` against a version whose release is still
in flight returns `E404`:

```bash
npm pack cyberchef-mcp@3.0.0          # on a connected machine, after the release publishes
npm install ./cyberchef-mcp-3.0.0.tgz --ignore-scripts   # on the target
```

To build a tarball from a source checkout before then, `npm pack` in the repository root produces
the same artefact.

## Verifying what you got

```bash
# Which architectures the tag carries
docker buildx imagetools inspect ghcr.io/doublegate/cyberchef-mcp_v3:3.0.0

# That the running image is the architecture you expect
docker image inspect ghcr.io/doublegate/cyberchef-mcp_v3:3.0.0 --format '{{.Architecture}}'

# That it serves -- a LIVENESS probe, not a conformance check
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v3:3.0.0
```

That one-liner works because protocol revision 2026-07-28 removed `initialize` -- the server is
stateless per request, so a bare `tools/list` is a legal first message. It tells you the image
starts, finds its operations and answers. It does **not** tell you a compliant client can use it,
and this project has an expensive reason to keep those apart: three releases shipped 524 tools with
an empty `inputSchema` while a suite of hand-rolled JSON-RPC stayed green, because raw JSON-RPC
does no schema validation and the official SDK client rejects that response outright.

For the check that actually proves usability, drive it with a client that enforces the protocol:

```bash
npx @modelcontextprotocol/inspector \
  docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v3:3.0.0
```

`tests/mcp/stdio-client-contract.test.mjs` is the automated form of the same thing.
