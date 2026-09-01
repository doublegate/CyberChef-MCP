# Client Setup

Every client below launches its own container. The server speaks stdio, so the client owns the
process — you are not connecting to a shared instance unless you deliberately run one over HTTP
(see the bottom of this page).

`-i` is required in every one of these. Without it the container exits the instant it starts and
the client reports the server as failed. It is the single most common setup mistake.

## Claude Code

```bash
claude mcp add cyberchef -- docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

Or add it to `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "cyberchef": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/doublegate/cyberchef-mcp_v2:latest"]
    }
  }
}
```

## Claude Desktop

`claude_desktop_config.json` — macOS
`~/Library/Application Support/Claude/`, Windows `%APPDATA%\Claude\`:

```json
{
  "mcpServers": {
    "cyberchef": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/doublegate/cyberchef-mcp_v2:latest"]
    }
  }
}
```

## LM Studio

LM Studio uses Cursor-compatible `mcp.json` notation. Edit it in-app via **Program → Install →
Edit mcp.json**, or directly at `~/.lmstudio/mcp.json`:

```json
{
  "mcpServers": {
    "CyberChef-MCP": {
      "command": "podman",
      "args": ["run", "-i", "--rm", "ghcr.io/doublegate/cyberchef-mcp_v2:latest"]
    }
  }
}
```

Use `docker` in place of `podman` if that is what you have. If LM Studio runs as an AppImage it
inherits your desktop environment's `PATH`, so a bare `podman`/`docker` resolves — no absolute path
needed.

**Set the tool surface deliberately for a local model.** The default (`index`, 28 tools,
~4,900 tokens) is usually right; `all` is 531 tools and ~100,000 tokens, which will swamp most
locally-hosted context windows:

```json
"args": ["run", "-i", "--rm", "-e", "CYBERCHEF_TOOL_SURFACE=curated",
         "ghcr.io/doublegate/cyberchef-mcp_v2:latest"]
```

## Cursor

`~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project — same shape as LM Studio's.

## MCP Inspector

Useful for seeing exactly what the server advertises:

```bash
npx @modelcontextprotocol/inspector docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

## Running from a checkout instead of a container

```bash
git clone https://github.com/doublegate/CyberChef-MCP.git
cd CyberChef-MCP
npm install
npx grunt configTests     # generates two files the server cannot start without
npm run mcp
```

`npx grunt configTests` is not optional: `src/core/config/OperationConfig.json` and
`src/node/index.mjs` are generated and deliberately not committed. Skipping it produces
`ERR_MODULE_NOT_FOUND`.

## One shared server for several clients

stdio gives each client its own process. If you want a single instance that several clients share,
run it over HTTP:

```bash
docker run -d --name cyberchef-mcp -p 127.0.0.1:3000:3000 \
  -e CYBERCHEF_TRANSPORT=http \
  -e CYBERCHEF_HTTP_HOST=0.0.0.0 \
  -e CYBERCHEF_ALLOWED_HOSTS=localhost:3000,127.0.0.1:3000 \
  ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

**Note the `127.0.0.1:` in front of the port mapping.** A bare `-p 3000:3000` publishes on *every*
interface, and **the HTTP transport has no authentication** — anyone who can reach the port gets
every operation. `CYBERCHEF_ALLOWED_HOSTS` is DNS-rebinding protection, not access control: it
checks the `Host` header, which a direct client simply sets correctly.

If you genuinely need it reachable from another machine, put authentication in front of it (a
reverse proxy with auth, an SSH tunnel, or a private network) rather than removing the loopback
binding. `CYBERCHEF_HTTP_HOST=0.0.0.0` binds inside the container; the published port is what
decides who can reach it.

```json
{ "mcpServers": { "cyberchef": { "url": "http://127.0.0.1:3000/mcp" } } }
```

`CYBERCHEF_ALLOWED_HOSTS` is required here because DNS-rebinding protection is on by default and
only permits loopback names it already knows. Sessions are isolated per client, so several clients
against one container is supported rather than merely tolerated.

There is also a **socket transport** — Unix domain socket or loopback TCP — from v2.3.0. See
**[Transports](Transports)** for all three, and **[Configuration](Configuration)** for every
variable.
