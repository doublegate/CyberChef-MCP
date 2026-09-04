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
docker pull ghcr.io/doublegate/cyberchef-mcp_v3:latest
docker tag  ghcr.io/doublegate/cyberchef-mcp_v3:latest cyberchef-mcp
```

Docker Hub carries the same image as `parobek/cyberchef-mcp`. The GHCR package is
**major-versioned**: `_v3` for 3.x, `_v2` for 2.x, `_v1` for the frozen 1.9.x line.

Offline, from a release tarball:

```bash
wget https://github.com/doublegate/CyberChef-MCP/releases/download/v3.0.0/cyberchef-mcp-v3.0.0-docker-image.tar.gz
docker load < cyberchef-mcp-v3.0.0-docker-image.tar.gz
docker tag ghcr.io/doublegate/cyberchef-mcp_v3:3.0.0 cyberchef-mcp
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
      "args": ["/path/to/CyberChef/src/node/mcp-server.mjs"]
    }
  }
}
```

**No `--openssl-legacy-provider` is needed.** v2.1.0's guide said it was "not optional"; that was
wrong, and worse, it did not work. Most Node builds -- the Docker image included -- ship no legacy
provider module at all, so the flag printed `Unable to load legacy provider.` and changed nothing.
Exactly one operation reached OpenSSL for a legacy algorithm (`LM Hash`, via DES-ECB); as of v2.2.0
it computes that in pure JavaScript, so every operation works on a stock Node with no flags.

---

## The tool surface — how many tools you see, and why

`tools/list` is sent to the model on **every** request. Exposing everything costs roughly
**100,000 tokens** before the user has typed anything, and model tool-selection quality is known to
degrade well before that many definitions.

So the default is an **index**, not a catalogue. Measured on the serialised `tools/list` payload at
v2.4.0, not estimated:

| `CYBERCHEF_TOOL_SURFACE` | Tools in `tools/list` | Payload |
|---|---|---|
| **`index`** *(default)* | 40 | **40,637 bytes** |
| `curated` | 118 | 103,883 bytes |
| `all` | 543 | 421,041 bytes |

Bytes, measured on the serialised `tools/list` payload with `npm run measure:surfaces`, not
estimated. Earlier versions of this table gave token figures; this repository has never contained a
tokenizer and every one of those was bytes divided by four.

The index doubled at v3.3.0, from 28 tools and 20,297 bytes. Twelve registry tools were added, and
a registry tool has no navigation path — `cyberchef_bake` runs recipes of *operations* — so one
that is not listed cannot be called at all. The ratio between the three modes is what matters, and
the index plus one operation schema is still 9.9x cheaper than `all`.

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

**The sixteen analysis tools are in every surface too.** Four since v2.4.0 —
`cyberchef_xor_key_length`, `cyberchef_cyclic_pattern`, `cyberchef_hash_identify`,
`cyberchef_rsa_attack` — and twelve added in v3.3.0: `cyberchef_classical_cipher`,
`cyberchef_corpus_diff`, `cyberchef_crib_drag`, `cyberchef_entropy_scan`, `cyberchef_hash_crack`,
`cyberchef_hash_statistics`, `cyberchef_jwt_weakness`, `cyberchef_plaintext_check`,
`cyberchef_rsa_multi_key`, `cyberchef_substitution_break`, `cyberchef_timestamp_identify` and
`cyberchef_vigenere_break`.

Unlike an operation, none of them is reachable through `cyberchef_bake`: they are not in
`OperationConfig`, because each performs an analysis rather than a transformation. Hiding one
behind a surface setting would make it unreachable rather than merely inconvenient, and listing
must never be stricter than dispatch. That is why the index doubled in v3.3.0: the twelve new
tools account for roughly 20 KB of the 40,637-byte payload, and there is no honest way to avoid
paying it.

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

### Images, audio and binary results

Not every result is text, and since v2.2.0 the server stops pretending otherwise.

- **Image operations return an `image` content block.** `Generate QR Code`, `Render Image`,
  `Rotate Image` and the rest put their payload in a `data:` URI; before v2.2.0 the html-to-text
  conversion deleted it and you received an empty string. Read `content[0].data` (base64) and
  `content[0].mimeType`, not `content[0].text`.
- **`Play Media` returns an `audio` block**, the same way and for the same reason.
- **Video returns its `data:` URI as text.** MCP has no video content block, so the payload is
  handed over verbatim rather than stripped — unreadable, but recoverable.
- **Other binary stays as latin1 text by default**, one character per byte. It looks like mojibake
  and is byte-for-byte reversible: `str.charCodeAt(i)` is `bytes[i]`. Set
  `CYBERCHEF_BINARY_OUTPUT=base64` if you would rather have base64.

### Tool annotations

Every tool carries `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`, so a
client can decide whether to ask you before running it. Nearly all 504 operations are pure
functions: read-only, non-destructive, idempotent, closed-world.

Two things are worth knowing before you configure auto-approval:

- **`cyberchef_bake` is *not* read-only**, deliberately. It runs whatever recipe you hand it, and a
  recipe may contain `HTTP request` with a POST. If your client prompts on non-read-only tools it
  will prompt for `cyberchef_bake`. Calling operation tools directly avoids that — each is annotated
  from its own behaviour, so `cyberchef_to_base64` is read-only and idempotent.
- **`HTTP request` and `DNS over HTTPS` are the only two operations that reach the network**, and
  only `HTTP request` can write. They are the two to think hardest about.

---

## Prompts: where to start when you do not know

The tool list tells you what the server can do. It does not tell you what to do first, and with 504
operations that gap is wide. Prompts are five named workflows your client shows as slash commands or
menu entries:

| Prompt | Use it when |
|---|---|
| `analyse-unknown-data` | You have a blob and do not know what it is. |
| `extract-iocs` | You need URLs, IPs, emails and domains out of a document or script, defanged. |
| `deobfuscate-script` | You have obfuscated PowerShell, JavaScript, VBScript or PHP. |
| `identify-hash` | You have a hash and need to know which algorithm produced it. |
| `decode-chain` | You know roughly what was done to the data and want it unwrapped. |

Each encodes the order a practitioner would actually work in, not a restatement of the tool list —
`Magic` before guessing, entropy before assuming a decode will help, defang before an indicator
reaches a ticket.

## Resources: saved recipes without a tool call

Saved recipes are exposed as MCP resources at `recipe://<id>`, with a `recipe://{id}` template. A
client can browse, cache and attach them the way it attaches a file, which is usually what you want
from a saved recipe — reading one no longer costs a tool call your client might prompt for.

The URI is the recipe's **id**, not its name, because names are not unique: two recipes may both be
called "decode", and a name-keyed URI would silently return the wrong one. `cyberchef_recipe_list`
reports the ids.

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
| `CYBERCHEF_BINARY_OUTPUT` | `text` | `base64` returns non-image binary as base64 instead of the default latin1 text. See "Binary results" below. |

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
| `CYBERCHEF_TRANSPORT` | `stdio` | `stdio`, `http`, or `socket`. |
| `CYBERCHEF_HTTP_HOST` | `127.0.0.1` | Bind address. |
| `CYBERCHEF_HTTP_PORT` | `3000` | Port. |
| `CYBERCHEF_HTTP_PATH` | `/mcp` | Endpoint path. Anything else gets a plain 404. |
| `CYBERCHEF_ALLOWED_HOSTS` | *(loopback names)* | Host allowlist. DNS-rebinding protection is on by default; `*` disables it. |
| `CYBERCHEF_ALLOWED_ORIGINS` | *(unset)* | Origin allowlist; enables CORS. Browser clients need it. |
| `CYBERCHEF_MAX_SESSIONS` | `100` | Concurrent session cap. |
| `CYBERCHEF_SESSION_TIMEOUT` | `1800000` | Idle-session reap threshold (30 min). |
| `CYBERCHEF_HTTP_MAX_BODY` | `4194304` | Maximum request body (4 MiB). |

### Socket transport (`CYBERCHEF_TRANSPORT=socket`)

The stdio binding over a stream rather than a pipe: a Unix domain socket or a loopback TCP port.
Each connection is pinned to its own server instance, so two clients never share one — the socket
*is* the session, and there are no session ids to manage.

| Variable | Default | Meaning |
|---|---|---|
| `CYBERCHEF_SOCKET_PATH` | *(unset)* | Unix domain socket path. Mutually exclusive with the port. Created mode `0600`. |
| `CYBERCHEF_SOCKET_PORT` | *(unset)* | TCP port. Mutually exclusive with the path. |
| `CYBERCHEF_SOCKET_HOST` | `127.0.0.1` | TCP bind address. |
| `CYBERCHEF_SOCKET_MAX_CONNECTIONS` | `16` | Concurrent connection cap; further connections are dropped. |
| `CYBERCHEF_SOCKET_ALLOW_REMOTE` | `false` | Required to bind a non-loopback address. |

```bash
CYBERCHEF_TRANSPORT=socket CYBERCHEF_SOCKET_PATH=/run/cyberchef-mcp.sock npx cyberchef-mcp
```

**This transport has no authentication.** It is the stdio binding, whose security model is that the
peer already has access to your process. On a Unix socket that is enforced by file permissions —
hence `0600`, rather than whatever the umask would have produced. On TCP there is nothing enforcing
it at all, which is why a non-loopback bind is refused unless `CYBERCHEF_SOCKET_ALLOW_REMOTE=true`
is set. If you set it, put your own authentication in front.

A note on Unix socket paths: `sun_path` is a fixed 108-byte field (104 on macOS), and the kernel
rejects anything longer with a bare `EINVAL` that names the path but not the reason. The server
checks the length itself and says so plainly.

There is deliberately **no WebSocket transport**. MCP does not define one — the specification's
transports are stdio and Streamable HTTP — and no SDK ships one, so it would be a private extension
no client could speak. See `docs/planning/ROADMAP.md`.

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
| `Generate all hashes` fails with `error:0308010C` | You are on v2.1.0 or earlier. Upgrade; v2.2.0 removed the OpenSSL dependency. |
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
