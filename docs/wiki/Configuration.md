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
