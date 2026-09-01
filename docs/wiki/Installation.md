# Installation

Three ways to run the server. **Docker is the recommended one** — it pins Node, the operating
system and every dependency, which matters here because CyberChef's operation set reaches into
native crypto and image libraries.

## Docker

```bash
docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

| Tag | Points at |
|---|---|
| `latest` | The newest release |
| `2.4.0` | An exact version — **use this in anything you depend on** |
| `2.4` | The newest patch of 2.4 |
| `2` | The newest 2.x |

Also published to Docker Hub as `parobek/cyberchef-mcp`. Both registries carry the same image,
built once and pushed to both, with provenance and SBOM attestations.

**`-i` is mandatory.** stdio transport means the server reads JSON-RPC from standard input; without
`-i` Docker gives it no stdin and the process exits immediately.

**`--rm` is a convenience**, not a requirement — it cleans up the container when the client
disconnects. Without it you accumulate stopped containers.

The image runs as UID 65532 (`nonroot`) on a distroless Chainguard base, and contains no shell.

## npm — prepared, not yet published

**`npx cyberchef-mcp` does not work today.** The package is *publishable* as of v2.3.0 — the
install script that blocked it is gone, and `npm install --ignore-scripts` of the packed tarball
starts and serves — but it is not on the registry.

`server.json` deliberately carries no npm record for the same reason: advertising a package that is
not there sends clients to an install that 404s. The record gets added in the same change that
publishes it.

Until then, use Docker or a source checkout. When it does ship it will require **Node `>=24 <27`**,
matching upstream CyberChef's own floor, and will carry a second binary — `cyberchef-migrate`, the
v1-to-v2 migration helper.

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
  | docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

Next: **[Client Setup](Client-Setup)**.
