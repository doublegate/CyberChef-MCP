# Troubleshooting

Failures people actually hit, with the cause rather than just the fix. Most of these were found the
hard way and are recorded in the release notes.

## The container exits immediately / the client says the server failed

**You are missing `-i`.** `docker run --rm <image>` gives the container no stdin, and an MCP stdio
server with no stdin has nothing to read, so it exits at once. The client sees a process that died
during startup.

```bash
docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

## `ERR_MODULE_NOT_FOUND` for `./index.mjs` or `OperationConfig`

Running from a checkout without generating the two files the server needs:

```bash
npx grunt configTests
```

`src/core/config/OperationConfig.json` and `src/node/index.mjs` are generated and deliberately not
committed — they are build output, and committing them would mean a stale copy shipping whenever
the operation set changed.

## I only see 28 tools, not 500

**Working as intended.** `tools/list` is an *index* by default: 28 tools and ~4,900 tokens,
rather than 531 tools and ~100,000. Nothing is unreachable — `cyberchef_bake` runs any of the 504
operations by name, and `cyberchef_categories` → `cyberchef_list_operations` →
`cyberchef_describe_operation` walks down to any of them with its full argument schema.

Pre-load more if you want to: `CYBERCHEF_TOOL_SURFACE=curated` (106 tools) or `=all` (all 531).
Full detail: **[The Tool Surface](Tool-Surface)**.
Be careful with `all` on a local model — published measurement puts tool-selection quality falling
off past roughly 50 tool definitions.

## `SlowBuffer is not defined` when running tests locally

`avsc@5.7.9` still references a Node API that was removed. The postinstall patcher handles it:

```bash
node scripts/patch-dependencies.mjs
```

## An operation returns `Invalid file type.` for a valid image

Fixed in **v2.3.0**. Seventeen image operations returned Node's shared `Buffer` pool instead of the
image — a 129-byte PNG came back as a 65,599-byte `ArrayBuffer` with the image at byte offset 840,
so nothing at offset 0 looked like an image. Upgrade to 2.3.0 or later.

## `Add Text To Image` fails with `Error preparing fonts`

Fixed in **v2.3.0**. The operation loaded its bitmap fonts through webpack-only imports under
`src/web/`, which this fork removed in v1.7.1 — so it had never worked here at all. The fonts are
now vendored and loaded from disk.

## A recipe hangs instead of returning an error

Fixed in **v2.3.0** for progress-capable operations: a failing operation left a promise that was
never settled, so the request waited until its timeout rather than reporting the error.

## `Unknown argument for "<operation>": <name>`

Deliberate, and it is protecting you. Before v2.2.0 an unrecognised argument name was silently
dropped and the operation ran with its default — a misspelling became a plausible wrong answer.
The error lists the arguments the operation does accept. Argument names are the sanitised form:
`Split delimiter` → `split_delimiter`.

## HTTP transport returns 403

DNS-rebinding protection is on by default and only permits loopback names. Binding a non-loopback
address means naming the hosts you will reach it by:

```bash
-e CYBERCHEF_ALLOWED_HOSTS=myhost:3000,127.0.0.1:3000
```

## The socket transport refuses to start

Three refusals, all deliberate — this transport has **no authentication**:

- *"refusing to bind 0.0.0.0:…"* — a non-loopback TCP bind needs
  `CYBERCHEF_SOCKET_ALLOW_REMOTE=true`, and you should put your own authentication in front of it.
- *"socket path is N bytes, and this platform allows 107"* — `sun_path` is a fixed 108-byte field
  (104 on macOS). The kernel reports this only as a bare `EINVAL`, which names the path but not the
  reason, so the server checks the length itself.
- *"… is already served by a running process"* or *"… is not a socket"* — a stale socket file is
  probed by connecting before it is removed, and a path that is not a socket is never deleted.

## Something else

Check the [release notes](https://doublegate.github.io/CyberChef-MCP/releases/) — they are written
to explain causes, not just list changes. If it is still wrong,
[open an issue](https://github.com/doublegate/CyberChef-MCP/issues) with the server version
(`initialize` reports it) and the exact tool call.
