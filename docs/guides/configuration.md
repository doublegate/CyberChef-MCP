# Configuration

Every setting can be given two ways: in `cyberchef.config.json`, or as an environment variable.

```text
environment variable  >  config file  >  built-in default
```

Nothing is required. A deployment with no file behaves exactly as it always has.

## The file

```json
{
  "server":   { "maxInputSize": 10485760, "operationTimeout": 30000 },
  "security": { "offline": true },
  "tools":    { "surface": "curated" }
}
```

Read from the working directory, or from wherever `CYBERCHEF_CONFIG_FILE` points. A `$schema`
key is permitted and ignored, so an editor can be pointed at a schema for completions.

## It fails closed

Malformed JSON, an unknown section, an unknown setting, or a value that is not a string, number,
boolean or array **stops the server** with a message naming the mistake and, where it can, the name
you probably meant:

```text
cyberchef.config.json: unknown setting "security.offlien" (did you mean "offline"?).
Known settings in "security": auditEnabled, maxRegexLength, offline

The server did not start. Fix the file, or remove it to use environment variables only.
```

This file sets the offline switch, the regex-length cap and the operation allowlist. Starting on
defaults an operator did not choose, and does not know they have, is the worse failure.

## What applied

The startup log names the file, how many settings it applied, and anything the environment
overrode -- so a file and an environment variable never disagree silently:

```text
Config file: /app/cyberchef.config.json (2 settings applied, 1 overridden by environment: tools.surface)
```

## Every setting

### `server`

| Setting | Environment variable |
|---|---|
| `server.binaryOutput` | `CYBERCHEF_BINARY_OUTPUT` |
| `server.drainDelayMs` | `CYBERCHEF_DRAIN_DELAY_MS` |
| `server.drainTimeoutMs` | `CYBERCHEF_DRAIN_TIMEOUT_MS` |
| `server.maxConcurrentOps` | `CYBERCHEF_MAX_CONCURRENT_OPS` |
| `server.maxInputSize` | `CYBERCHEF_MAX_INPUT_SIZE` |
| `server.maxToolDescription` | `CYBERCHEF_MAX_TOOL_DESCRIPTION` |
| `server.operationTimeout` | `CYBERCHEF_OPERATION_TIMEOUT` |
| `server.transport` | `CYBERCHEF_TRANSPORT` |

### `cache`

| Setting | Environment variable |
|---|---|
| `cache.enabled` | `CYBERCHEF_CACHE_ENABLED` |
| `cache.maxItems` | `CYBERCHEF_CACHE_MAX_ITEMS` |
| `cache.maxSize` | `CYBERCHEF_CACHE_MAX_SIZE` |

### `batch`

| Setting | Environment variable |
|---|---|
| `batch.enabled` | `CYBERCHEF_BATCH_ENABLED` |
| `batch.maxSize` | `CYBERCHEF_BATCH_MAX_SIZE` |

### `streaming`

| Setting | Environment variable |
|---|---|
| `streaming.enabled` | `CYBERCHEF_ENABLE_STREAMING` |
| `streaming.threshold` | `CYBERCHEF_STREAMING_THRESHOLD` |
| `streaming.chunkSize` | `CYBERCHEF_STREAM_CHUNK_SIZE` |
| `streaming.maxChunks` | `CYBERCHEF_STREAM_MAX_CHUNKS` |
| `streaming.progressInterval` | `CYBERCHEF_STREAM_PROGRESS_INTERVAL` |

### `workers`

| Setting | Environment variable |
|---|---|
| `workers.enabled` | `CYBERCHEF_ENABLE_WORKERS` |
| `workers.idleTimeout` | `CYBERCHEF_WORKER_IDLE_TIMEOUT` |
| `workers.maxThreads` | `CYBERCHEF_WORKER_MAX_THREADS` |
| `workers.minInputSize` | `CYBERCHEF_WORKER_MIN_INPUT_SIZE` |
| `workers.minThreads` | `CYBERCHEF_WORKER_MIN_THREADS` |

### `retry`

| Setting | Environment variable |
|---|---|
| `retry.backoffMultiplier` | `CYBERCHEF_BACKOFF_MULTIPLIER` |
| `retry.initialBackoff` | `CYBERCHEF_INITIAL_BACKOFF` |
| `retry.maxBackoff` | `CYBERCHEF_MAX_BACKOFF` |
| `retry.maxRetries` | `CYBERCHEF_MAX_RETRIES` |

### `rateLimit`

| Setting | Environment variable |
|---|---|
| `rateLimit.enabled` | `CYBERCHEF_RATE_LIMIT_ENABLED` |
| `rateLimit.requests` | `CYBERCHEF_RATE_LIMIT_REQUESTS` |
| `rateLimit.window` | `CYBERCHEF_RATE_LIMIT_WINDOW` |

### `recipes`

| Setting | Environment variable |
|---|---|
| `recipes.backup` | `CYBERCHEF_RECIPE_BACKUP` |
| `recipes.maxCount` | `CYBERCHEF_RECIPE_MAX_COUNT` |
| `recipes.maxDepth` | `CYBERCHEF_RECIPE_MAX_DEPTH` |
| `recipes.maxOperations` | `CYBERCHEF_RECIPE_MAX_OPERATIONS` |
| `recipes.storage` | `CYBERCHEF_RECIPE_STORAGE` |

### `http`

| Setting | Environment variable |
|---|---|
| `http.allowedHosts` | `CYBERCHEF_ALLOWED_HOSTS` |
| `http.allowedOrigins` | `CYBERCHEF_ALLOWED_ORIGINS` |
| `http.host` | `CYBERCHEF_HTTP_HOST` |
| `http.maxBody` | `CYBERCHEF_HTTP_MAX_BODY` |
| `http.maxSessions` | `CYBERCHEF_MAX_SESSIONS` |
| `http.path` | `CYBERCHEF_HTTP_PATH` |
| `http.port` | `CYBERCHEF_HTTP_PORT` |
| `http.sessionTimeout` | `CYBERCHEF_SESSION_TIMEOUT` |

### `socket`

| Setting | Environment variable |
|---|---|
| `socket.allowRemote` | `CYBERCHEF_SOCKET_ALLOW_REMOTE` |
| `socket.host` | `CYBERCHEF_SOCKET_HOST` |
| `socket.maxConnections` | `CYBERCHEF_SOCKET_MAX_CONNECTIONS` |
| `socket.path` | `CYBERCHEF_SOCKET_PATH` |
| `socket.port` | `CYBERCHEF_SOCKET_PORT` |

### `auth`

| Setting | Environment variable |
|---|---|
| `auth.audience` | `CYBERCHEF_AUTH_AUDIENCE` |
| `auth.issuer` | `CYBERCHEF_AUTH_ISSUER` |
| `auth.jwksUri` | `CYBERCHEF_AUTH_JWKS_URI` |
| `auth.requiredScopes` | `CYBERCHEF_AUTH_REQUIRED_SCOPES` |
| `auth.resource` | `CYBERCHEF_AUTH_RESOURCE` |
| `auth.tenantClaim` | `CYBERCHEF_TENANT_CLAIM` |

### `tools`

| Setting | Environment variable |
|---|---|
| `tools.allowlist` | `CYBERCHEF_TOOL_ALLOWLIST` |
| `tools.exposeAllOps` | `CYBERCHEF_EXPOSE_ALL_OPS` |
| `tools.surface` | `CYBERCHEF_TOOL_SURFACE` |

### `security`

| Setting | Environment variable |
|---|---|
| `security.auditEnabled` | `CYBERCHEF_AUDIT_ENABLED` |
| `security.maxRegexLength` | `CYBERCHEF_MAX_REGEX_LENGTH` |
| `security.offline` | `CYBERCHEF_OFFLINE` |

### `observability`

| Setting | Environment variable |
|---|---|
| `observability.metricsEnabled` | `CYBERCHEF_METRICS_ENABLED` |
| `observability.telemetryEnabled` | `CYBERCHEF_TELEMETRY_ENABLED` |

### `compatibility`

| Setting | Environment variable |
|---|---|
| `compatibility.suppressDeprecations` | `CYBERCHEF_SUPPRESS_DEPRECATIONS` |
| `compatibility.v2CompatibilityMode` | `V2_COMPATIBILITY_MODE` |

64 settings in 15 sections.

This table is generated from `src/node/lib/config-file.mjs` and asserted against it by
`tests/mcp/config-file.test.mjs`, so a setting cannot be added without appearing here.
