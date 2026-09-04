# Installation

Three ways to run the server. **Docker is the recommended one** — it pins Node, the operating
system and every dependency, which matters here because CyberChef's operation set reaches into
native crypto and image libraries.

## Docker

```bash
docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v3:latest
```

| Tag | Points at |
|---|---|
| `latest` | The newest release |
| `3.0.0` | An exact version — **use this in anything you depend on** |
| `3.0` | The newest patch of 3.0 |
| `3` | The newest 3.x |

The package name carries the major, so the v2.x line stays reachable at
`ghcr.io/doublegate/cyberchef-mcp_v2` with its own `2.10.0` / `2.10` / `2` / `latest` tags, and
v1.9.x at `_v1`. A major release renames the image rather than superseding the old one.

Also published to Docker Hub as `parobek/cyberchef-mcp`. Both registries carry the same image,
built once and pushed to both, with provenance and SBOM attestations.

**`-i` is mandatory.** stdio transport means the server reads JSON-RPC from standard input; without
`-i` Docker gives it no stdin and the process exits immediately.

**`--rm` is a convenience**, not a requirement — it cleans up the container when the client
disconnects. Without it you accumulate stopped containers.

The image runs as UID 65532 (`nonroot`) on a Chainguard Wolfi base.

> **It is not shell-free.** This page said "contains no shell" until v3.2.0, and measuring the
> published image found `/usr/bin/sh`, `ash`, `busybox` (v1.38.0) and `npm`. What is genuinely
> absent is a package manager: no `apk`, no `wget`, no `curl`. If your threat model assumed no
> shell, it needs revisiting — see
> [the v3.1.0 baseline](https://github.com/doublegate/CyberChef-MCP/blob/master/docs/internal/measurements/v3.1.0-baseline.md).

## npm

```bash
npx cyberchef-mcp
```

Published as `cyberchef-mcp` since **2.5.0**. Requires **Node `>=24 <27`**, matching upstream
CyberChef's own floor, and carries a second binary — `cyberchef-migrate`, the v1-to-v2 migration
helper.

> This section said "prepared, not yet published" until v3.0.0. Publishing was *prepared* in
> v2.3.0; the first release that actually published was v2.5.0, and no document was updated when
> it succeeded. Corrected against `npm view cyberchef-mcp versions`.

Docker is still the recommended route — it pins Node, the operating system and every dependency,
which matters because CyberChef's operation set reaches into native crypto and image libraries.

## From source

```bash
git clone https://github.com/doublegate/CyberChef-MCP.git
cd CyberChef-MCP
npm install
npx grunt configTests    # REQUIRED -- generates two files that are not committed
npm run mcp
```

**`npx grunt configTests` is not optional.** It generates `src/core/config/OperationConfig.json`
and `src/node/index.mjs`, both of which are gitignored because they are build products. Skipping it
produces:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module './index.mjs'
```

which reads like a broken checkout and is not.

### If `npm test` fails with `SlowBuffer is not defined`

One dependency (`avsc`) still references a Node API removed years ago. The Dockerfile and CI patch
it in place before running tests; locally, apply the same substitution to
`node_modules/avsc/lib/types.js`, replacing `new SlowBuffer` with `Buffer.alloc`. There are two
references in `avsc@5.7.9`.

## Verifying an install

Point a **real MCP client** at it. That is the authoritative check, and the reason is this
project's own most expensive lesson: raw JSON-RPC does no schema validation, so three releases once
shipped with every tool carrying an empty `inputSchema` while hand-written probes reported success.

A one-line ping is still a useful *container* smoke test — it proves the image starts and answers:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v3:latest
```

Next: **[Client Setup](Client-Setup)**.
