# CyberChef MCP Server

> ## ⚠️ Security advisory — upgrade to `2.4.1` or `1.9.1`
>
> **[GHSA-rmg9-8936-vx66](https://github.com/doublegate/CyberChef-MCP/security/advisories/GHSA-rmg9-8936-vx66)** (CVSS 5.9)
>
> **Every tag below `2.4.1` on the v2 line, and below `1.9.1` on the v1 line, is affected** —
> that is `1.4.0` through `2.4.0`, including all `release-v*` tags.
>
> The operation cache keyed entries on only the first 1,000 characters of the input, so two
> different inputs sharing that prefix collided. The second caller received the **first caller's
> result** — a silently wrong answer, and on a shared server, one caller receiving output computed
> from another caller's data.
>
> | | |
> |---|---|
> | **Patched** | `2.4.1` (current) · `1.9.1` (Apache-2.0 maintenance line) |
> | **Mitigation without upgrading** | `CYBERCHEF_CACHE_ENABLED=false` |
> | **`latest`** | already points at `2.4.1` |
>
> Older tags are **kept deliberately** so pinned deployments and reproducible builds do not break.
> They are not maintained and will not receive fixes. Pin to `2.4.1` or later.


A **Model Context Protocol (MCP)** server wrapping [GCHQ CyberChef](https://github.com/gchq/CyberChef),
the "Cyber Swiss Army Knife". It exposes **504 data-manipulation operations** — encryption, encoding,
compression, hashing, forensics — as tools an AI assistant can call directly.

**Source & docs:** https://github.com/doublegate/CyberChef-MCP ·
**Licence:** GPL-3.0-or-later (v1.9.x and earlier are Apache-2.0)

---

## Quick start

```bash
docker pull parobek/cyberchef-mcp:latest

echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | docker run -i --rm parobek/cyberchef-mcp:latest
```

The **`-i` flag is required**. Without stdin the container exits immediately — the single most
common setup mistake.

## Use it with an MCP client

```json
{
  "mcpServers": {
    "cyberchef": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "parobek/cyberchef-mcp:latest"]
    }
  }
}
```

Works with Claude Desktop, Claude Code, Cursor, and any client that speaks MCP over stdio.

## What you get

`tools/list` returns about **24 tools**, not 504 — deliberately. Sending 504 tool schemas on every
request costs roughly 86,000 tokens before the user types anything, so the default surface is an
**index**:

| Tool | Purpose |
|---|---|
| `cyberchef_bake` | Run a recipe. Reaches **any** of the 504 operations by name. |
| `cyberchef_search` | Find an operation by keyword. |
| `cyberchef_categories` | Browse the 16 operation categories. |
| `cyberchef_list_operations` | List the operations in one category. |
| `cyberchef_describe_operation` | Full argument schema for the operations you chose. |
| `cyberchef_magic` | Detect what an unknown blob is. Present in every surface. |

Plus recipe management, batching, and cache/quota tools.

**Nothing is unreachable.** Every one of the 504 operations is reachable through this index —
verified, not asserted: walking every category reaches 504/504 and describes 504/504.

Prefer the old behaviour? One variable:

```bash
# All 524 tools, ~86,000 tokens per tools/list
docker run -i --rm -e CYBERCHEF_TOOL_SURFACE=all parobek/cyberchef-mcp:latest

# A middle ground: ~100 tools, ~16,600 tokens
docker run -i --rm -e CYBERCHEF_TOOL_SURFACE=curated parobek/cyberchef-mcp:latest
```

## Tags

| Tag | Meaning |
|---|---|
| `latest` | Newest release from the default branch |
| `2.1.0`, `2.1`, `2` | Specific version, minor line, major line |
| `1.9.0`, `1.9`, `1` | The frozen v1 line — Apache-2.0, security patches only until ~March 2027 |

`release-v1.x.x` tags predate the current scheme and are kept so older references keep working.

Also on GHCR: `ghcr.io/doublegate/cyberchef-mcp_v3` (major-versioned).

## Example

```bash
# Decode, decompress and extract indicators in one call
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"cyberchef_bake","arguments":{
    "input":"H4sIAAAAAAAA/...",
    "recipe":[{"op":"From Base64"},{"op":"Gunzip"},{"op":"Extract IP addresses"}]}}}' \
  | docker run -i --rm parobek/cyberchef-mcp:latest
```

Eight runnable examples — quickstart, recipes, discovery, forensic triage, saved recipes, batching,
multi-client HTTP, shell usage — are in
[`examples/`](https://github.com/doublegate/CyberChef-MCP/tree/master/examples), and CI executes them
on every change.

## Configuration

Common variables (the [User Guide](https://github.com/doublegate/CyberChef-MCP/blob/master/docs/guides/user_guide.md)
documents all of them):

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_TOOL_SURFACE` | `index` | `index`, `curated` or `all` |
| `CYBERCHEF_TRANSPORT` | `stdio` | `stdio`, `http`, or `socket` (Unix domain socket / loopback TCP) |
| `CYBERCHEF_MAX_INPUT_SIZE` | `104857600` | Maximum input, in bytes |
| `CYBERCHEF_OPERATION_TIMEOUT` | `30000` | Per-operation timeout, in ms |
| `LOG_LEVEL` | `info` | Diagnostics verbosity (written to stderr) |

## HTTP transport

```bash
docker run --rm -p 3000:3000 \
  -e CYBERCHEF_TRANSPORT=http \
  -e CYBERCHEF_HTTP_HOST=0.0.0.0 \
  -e CYBERCHEF_ALLOWED_HOSTS=localhost:3000,127.0.0.1:3000 \
  parobek/cyberchef-mcp:latest
```

Serves many clients, each with its own session. DNS-rebinding protection is on by default, so a
non-loopback bind needs `CYBERCHEF_ALLOWED_HOSTS`.

## Security

- Runs as unprivileged **UID 65532** (Chainguard `nonroot`); both base images digest-pinned
- ReDoS screening on every user-supplied regular expression, *before* it executes
- SBOM (CycloneDX) and Trivy scan attached to every release
- Hardened invocation:

```bash
docker run -i --rm --read-only --tmpfs /tmp:size=100M \
  --cap-drop=ALL --security-opt=no-new-privileges parobek/cyberchef-mcp:latest
```

## Documentation

- [Tutorial](https://github.com/doublegate/CyberChef-MCP/blob/master/docs/guides/tutorial.md) — a guided first hour
- [User Guide](https://github.com/doublegate/CyberChef-MCP/blob/master/docs/guides/user_guide.md) — install, config, tuning
- [Tool reference](https://github.com/doublegate/CyberChef-MCP/blob/master/docs/guides/commands.md)
- [Release notes](https://github.com/doublegate/CyberChef-MCP/releases)

