# CyberChef MCP Server — User Guide

Installation, client configuration, tuning and operations. If you have never used this server
before, start with the **[Tutorial](tutorial.md)** instead; this document is the reference you come
back to.

**Contents**

- [Install](#install)
- [Connecting a client](#connecting-a-client)
- [The tool surface — how many tools you see, and why](#the-tool-surface--how-many-tools-you-see-and-why)
- [Using the tools](#using-the-tools)
- [Transports: stdio and HTTP](#transports-stdio-and-http)
- [Environment variables](#environment-variables)
- [Performance and tuning](#performance-and-tuning)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## Install

### Docker (recommended)

```bash
docker pull ghcr.io/doublegate/cyberchef-mcp_v2:latest
docker tag  ghcr.io/doublegate/cyberchef-mcp_v2:latest cyberchef-mcp
```

Docker Hub carries the same image as `parobek/cyberchef-mcp`. The GHCR package is
**major-versioned**: `_v2` for 2.x, `_v1` for the frozen 1.9.x line.

Offline, from a release tarball:

```bash
wget https://github.com/doublegate/CyberChef-MCP/releases/download/v2.1.0/cyberchef-mcp-v2.1.0-docker-image.tar.gz
docker load < cyberchef-mcp-v2.1.0-docker-image.tar.gz
docker tag ghcr.io/doublegate/cyberchef-mcp_v2:v2.1.0 cyberchef-mcp
```

From source:

```bash
docker build -f Dockerfile.mcp -t cyberchef-mcp .
```

### From a checkout

```bash
npm install
npx grunt configTests     # REQUIRED -- generates OperationConfig.json and src/node/index.mjs
npm run mcp
```

Both generated files are gitignored, so a fresh clone cannot start without that second command.
Node **>=24 <27** is required; the published image runs Node 26.

### Verify

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | docker run -i --rm cyberchef-mcp | jq '.result.tools | length'
```

The `-i` flag is **required**. Without stdin the container exits immediately, which looks like a
crash and is not one.

---

## Connecting a client

The shape is the same everywhere: a command, and arguments that run it in the foreground.

### Claude Desktop / Claude Code

`~/.claude/config.json` (or the app's MCP settings):

```json
{
  "mcpServers": {
    "cyberchef": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "cyberchef-mcp"]
    }
  }
}
```

### Cursor

Settings → MCP → **Add New MCP Server**

- **Name:** `cyberchef`
- **Type:** `command`
- **Command:** `docker`
- **Args:** `run -i --rm cyberchef-mcp`

### Any generic MCP client

```json
{
  "mcpServers": {
    "cyberchef": { "command": "docker", "args": ["run", "-i", "--rm", "cyberchef-mcp"] }
  }
}
```

### Passing environment variables

Add `-e` pairs to the args, before the image name:

```json
"args": ["run", "-i", "--rm",
         "-e", "CYBERCHEF_TOOL_SURFACE=curated",
         "-e", "CYBERCHEF_OPERATION_TIMEOUT=60000",
         "cyberchef-mcp"]
```

### Without Docker

```json
{
  "mcpServers": {
    "cyberchef": {
      "command": "node",
      "args": ["--openssl-legacy-provider", "/path/to/CyberChef/src/node/mcp-server.mjs"]
    }
  }
}
```

`--openssl-legacy-provider` is not optional. A few operations reach algorithms OpenSSL 3 moved out
of its default provider; without it `Generate all hashes` silently returns its input unchanged.
`npm run mcp` and the Docker image both set it for you.

---

## The tool surface — how many tools you see, and why

`tools/list` is sent to the model on **every** request. Exposing all 504 operations costs roughly
**86,000 tokens** before the user has typed anything, and model tool-selection quality is known to
degrade well before that many definitions.

So the default is an **index**, not a catalogue:

| `CYBERCHEF_TOOL_SURFACE` | Tools in `tools/list` | Approx. tokens |
|---|---|---|
| **`index`** *(default)* | ~24 | **~2,500** |
| `curated` | ~100 | ~16,600 |
| `all` | 524 | ~86,000 |

**Nothing becomes unreachable.** `cyberchef_bake` runs any of the 504 operations by name, and three
navigation tools let a client find the name and its arguments:

```
cyberchef_categories            16 categories, with counts and examples   (~2 KB)
  cyberchef_list_operations     the operations in one category            (~8 KB for 50)
    cyberchef_describe_operation  full argument schema for the ones chosen (~1.6 KB each)
      cyberchef_bake            runs it
```

`cyberchef_search` short-circuits the walk when you already know roughly what you want.

**`Magic` is exposed in every surface**, including `index`. It is what you reach for *before* you
know what you are looking at, so making it three calls deep would invert the cost.

Fine-grained control:

```bash
CYBERCHEF_TOOL_ALLOWLIST="To Base64,From Base64,SHA2,Gunzip"   # exactly these, overrides the mode
CYBERCHEF_TOOL_SURFACE=all                                      # everything, the pre-v2.1.0 behaviour
CYBERCHEF_EXPOSE_ALL_OPS=true                                   # historical alias for the above
```

> **Upgrading from v2.0.0?** The default changed. A client that hard-codes a tool name outside the
> index — `cyberchef_to_morse_code`, say — will no longer find it in `tools/list`. Set
> `CYBERCHEF_TOOL_SURFACE=all` to restore the old surface, or call the operation through
> `cyberchef_bake`, which never stopped working.

---

## Using the tools

### The three you will use most

| Tool | For |
|---|---|
| `cyberchef_bake` | Running a recipe — one operation or twenty. Reaches all 504. |
| `cyberchef_search` | Finding an operation by keyword. |
| `cyberchef_describe_operation` | Getting an operation's exact argument names, types and defaults. |

### Recipes

A recipe is an ordered list; each operation's output feeds the next. Operation names are CyberChef's
**display names**, so a recipe copied from the web UI works unchanged.

```json
{
  "input": "chain me",
  "recipe": [
    { "op": "To Hex", "args": { "delimiter": "None" } },
    { "op": "To Upper case" },
    { "op": "To Base64" }
  ]
}
```

Positional argument arrays are also accepted, which is the format the web UI exports.

### Flow control

`Fork`, `Merge`, `Jump`, `Conditional Jump`, `Label`, `Register`, `Subsection`, `Comment`, `Return`
and `Magic` all work in recipes from v2.1.0 (before that they were advertised and always failed).

```json
{ "input": "a,b,c",
  "recipe": [
    { "op": "Fork", "args": { "split_delimiter": ",", "merge_delimiter": "-" } },
    { "op": "To Upper case" }
  ] }
```
→ `A-B-C`

### Three argument rules worth knowing

1. **Names come from the schema, not the UI label.** SHA2's "Size" is `size`.
2. **`Input` is exposed as `input_arg`.** 31 operations — every symmetric cipher — have an argument
   named `Input` meaning the input *format*. It is renamed to avoid colliding with `input`, the
   data itself.
3. **Keys and IVs carry an encoding.** `"key": "00ff"` uses the default encoding;
   `"key": { "string": "hunter2", "option": "UTF8" }` is explicit. Getting this wrong fails later,
   as a decryption error.

### Saved recipes and batches

- `cyberchef_recipe_create` / `_get` / `_list` / `_update` / `_delete` / `_execute` / `_export` /
  `_import` / `_validate` / `_test` — recipes persisted to `CYBERCHEF_RECIPE_STORAGE`.
- `cyberchef_batch` — many calls in one request, `parallel` or `sequential`, with per-item failures
  reported rather than the batch abandoned.

Worked examples of all of this live in [`examples/`](../../examples/) and are executed by CI.

---

## Transports: stdio and HTTP

**stdio** is the default and suits one client per process. Diagnostics go to stderr and JSON-RPC to
stdout, so piping stdout is safe.

**Streamable HTTP** serves many clients, each with its own session:

```bash
docker run --rm -p 3000:3000 \
  -e CYBERCHEF_TRANSPORT=http \
  -e CYBERCHEF_HTTP_HOST=0.0.0.0 \
  -e CYBERCHEF_ALLOWED_HOSTS=localhost:3000,127.0.0.1:3000 \
  cyberchef-mcp
```

DNS-rebinding protection is **on by default** and permits the loopback names. Binding a
non-loopback address means naming the hosts you will reach it by — see
[the HTTP transport guide](http-transport.md), which explains why loopback is not an exemption.

Browser-based clients additionally need `CYBERCHEF_ALLOWED_ORIGINS`.

---

## Environment variables

### Tool surface

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_TOOL_SURFACE` | `index` | `index`, `curated` or `all`. |
| `CYBERCHEF_TOOL_ALLOWLIST` | *(unset)* | Comma-separated operation names; overrides the mode. |
| `CYBERCHEF_EXPOSE_ALL_OPS` | *(unset)* | `true` = `all`, `false` = `curated`. Historical alias. |
| `CYBERCHEF_MAX_TOOL_DESCRIPTION` | `240` | Characters of description carried per tool. |

### Limits and execution

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_MAX_INPUT_SIZE` | `104857600` | Maximum input, in bytes (100 MB). |
| `CYBERCHEF_OPERATION_TIMEOUT` | `30000` | Per-operation timeout, in ms. |
| `CYBERCHEF_MAX_REGEX_LENGTH` | `1000` | ReDoS screen: longest accepted regex pattern. |
| `CYBERCHEF_ENABLE_STREAMING` | `true` | Progress notifications for large inputs. |
| `CYBERCHEF_STREAMING_THRESHOLD` | `10485760` | Input size at which streaming engages (10 MB). |

### Workers

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_ENABLE_WORKERS` | `false` | Route CPU-heavy operations to a worker pool. |
| `CYBERCHEF_WORKER_MIN_THREADS` | `1` | Minimum pool threads. |
| `CYBERCHEF_WORKER_MAX_THREADS` | `4` | Maximum pool threads. |
| `CYBERCHEF_WORKER_IDLE_TIMEOUT` | `30000` | Idle thread timeout, in ms. |
| `CYBERCHEF_WORKER_MIN_INPUT_SIZE` | `1024` | Smallest input worth handing to a worker. |

### Caching, quotas and telemetry

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_CACHE_ENABLED` | `true` | Cache operation results. |
| `CYBERCHEF_CACHE_MAX_SIZE` | `104857600` | Cache size cap, in bytes. |
| `CYBERCHEF_CACHE_MAX_ITEMS` | `1000` | Cache entry cap. |
| `CYBERCHEF_BATCH_ENABLED` | `true` | Enable `cyberchef_batch`. |
| `CYBERCHEF_BATCH_MAX_SIZE` | `100` | Maximum operations per batch. |
| `CYBERCHEF_TELEMETRY_ENABLED` | `false` | Collect timing/usage statistics. |
| `CYBERCHEF_RATE_LIMIT_ENABLED` | `false` | Enable request rate limiting. |
| `CYBERCHEF_RATE_LIMIT_REQUESTS` | `100` | Requests allowed per window. |
| `CYBERCHEF_RATE_LIMIT_WINDOW` | `60000` | Rate-limit window, in ms. |
| `CYBERCHEF_MAX_CONCURRENT_OPS` | `10` | Concurrent operations allowed. |

### Retries

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_MAX_RETRIES` | `3` | Attempts before giving up on a retryable failure. |
| `CYBERCHEF_INITIAL_BACKOFF` | `1000` | First retry delay, in ms. |
| `CYBERCHEF_MAX_BACKOFF` | `10000` | Longest retry delay, in ms. |
| `CYBERCHEF_BACKOFF_MULTIPLIER` | `2` | Growth factor between retries. |

### Streaming internals

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_STREAM_CHUNK_SIZE` | `1048576` | Bytes per streamed chunk. |
| `CYBERCHEF_STREAM_MAX_CHUNKS` | `1000` | Maximum chunks per operation. |
| `CYBERCHEF_STREAM_PROGRESS_INTERVAL` | `100` | Minimum ms between progress notifications. |

### Recipes

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_RECIPE_STORAGE` | `./recipes.json` | Where saved recipes live. |
| `CYBERCHEF_RECIPE_MAX_COUNT` | `10000` | Maximum stored recipes. |
| `CYBERCHEF_RECIPE_BACKUP` | `true` | Keep a backup on write. |
| `CYBERCHEF_RECIPE_MAX_OPERATIONS` | `100` | Maximum operations in one stored recipe. |
| `CYBERCHEF_RECIPE_MAX_DEPTH` | `10` | Maximum nesting depth when validating a recipe. |

### HTTP transport

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_TRANSPORT` | `stdio` | `stdio` or `http`. |
| `CYBERCHEF_HTTP_HOST` | `127.0.0.1` | Bind address. |
| `CYBERCHEF_HTTP_PORT` | `3000` | Port. |
| `CYBERCHEF_HTTP_PATH` | `/mcp` | Endpoint path. Anything else gets a plain 404. |
| `CYBERCHEF_ALLOWED_HOSTS` | *(loopback names)* | Host allowlist. DNS-rebinding protection is on by default; `*` disables it. |
| `CYBERCHEF_ALLOWED_ORIGINS` | *(unset)* | Origin allowlist; enables CORS. Browser clients need it. |
| `CYBERCHEF_MAX_SESSIONS` | `100` | Concurrent session cap. |
| `CYBERCHEF_SESSION_TIMEOUT` | `1800000` | Idle-session reap threshold (30 min). |
| `CYBERCHEF_HTTP_MAX_BODY` | `4194304` | Maximum request body (4 MiB). |

### Logging

| Variable | Default | Meaning |
|---|---|---|
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error`, `fatal`. |

### Deprecations

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_SUPPRESS_DEPRECATIONS` | `false` | Silence deprecation notices. |
| `V2_COMPATIBILITY_MODE` | `false` | Preview which calls v2 changes, without changing behaviour. |

---

## Performance and tuning

**Start-up** is about 1.3 seconds — building 504 operation schemas. With `CYBERCHEF_TOOL_SURFACE`
at its default the schema build is far smaller, so start-up and the per-request payload are both
cheaper than exposing everything.

**Shutdown is prompt.** The server exits within ~20 ms of finishing its work. (Before v2.1.0 two
leaked timers held the process open for a further 60 seconds after every request — a
`Promise.race` timeout that was never cleared, and a context-cleanup timer that was never
unref'd.)

**Caching** is on by default and keyed on operation plus arguments plus input. `cyberchef_cache_stats`
reports hit rate; `cyberchef_cache_clear` empties it.

**Workers** (`CYBERCHEF_ENABLE_WORKERS=true`) move CPU-heavy operations — AES, bcrypt, scrypt, Argon2, PBKDF2
— onto a thread pool, so a long operation does not block the event loop. Worth enabling if you run
key derivation at any volume; unnecessary otherwise.

**Large inputs** stream progress notifications above `CYBERCHEF_STREAMING_THRESHOLD`, so a client
can show progress rather than appearing to hang.

---

## Security

### Non-root execution

The container runs as the unprivileged `node` user, UID **65532** — Chainguard's `nonroot` identity:

```bash
docker run --rm --entrypoint id cyberchef-mcp
# uid=65532(node) gid=65532(node) groups=65532(node)
```

`--entrypoint id` is needed because the image's entrypoint is `node`; a bare `docker run … id`
would pass `id` to node as a script path.

### Hardened invocation

```bash
docker run -i --rm \
  --read-only \
  --tmpfs /tmp:size=100M \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  cyberchef-mcp
```

### What the server does for you

- **ReDoS screening** on every user-supplied regular expression, *before* it executes. This matters
  because catastrophic backtracking blocks the event loop, so no timeout — including
  `CYBERCHEF_OPERATION_TIMEOUT` — can interrupt it once started.
- **DNS-rebinding protection** on by default for the HTTP transport.
- **Session caps and body limits** on HTTP, so an unauthenticated client cannot exhaust the process.
- **Input size limits**, and per-request resource quotas.
- Digest-pinned base images, an SBOM and Trivy scan attached to every release.

Report vulnerabilities per [SECURITY.md](../../SECURITY.md).

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Container exits immediately | Missing `-i`. The stdio transport needs stdin. |
| `ERR_MODULE_NOT_FOUND` for a Config file | Run `npx grunt configTests`. |
| A tool you expect is not in `tools/list` | The default surface is `index`. Use `cyberchef_bake`, or set `CYBERCHEF_TOOL_SURFACE=all`. |
| `Input must be one of the following: Raw, Hex` | The argument is `input_arg`, not `input`. |
| `Cannot read properties of undefined (reading 'option')` | A key/IV needs `{ string, option }`, or a plain string. |
| `Generate all hashes` returns the input unchanged | Node is missing `--openssl-legacy-provider`. |
| `Invalid Host header` over HTTP | Set `CYBERCHEF_ALLOWED_HOSTS` for a non-loopback bind. |
| Browser client fails its preflight | Set `CYBERCHEF_ALLOWED_ORIGINS`. |
| `SlowBuffer is not defined` in local tests | Apply the `avsc` substitution — see the README. |

### Getting diagnostics

```bash
LOG_LEVEL=debug npm run mcp 2>server.log
```

Logs go to **stderr**, so redirecting them never corrupts the protocol stream on stdout.

---

## See also

- **[Tutorial](tutorial.md)** — a guided first hour
- **[`examples/`](../../examples/)** — eight runnable, CI-tested scripts
- **[Tool reference](commands.md)** — every tool's contract
- **[HTTP transport](http-transport.md)** — multi-client, CORS, DNS rebinding
- **[Recipe management](recipe_management.md)** — the saved-recipe subsystem
- **[Architecture](../architecture/architecture.md)** — how it fits together
