# Security

## Reporting a vulnerability

**[Report privately](https://github.com/doublegate/CyberChef-MCP/security/advisories/new).** Private
vulnerability reporting is enabled on this repository. Please do not open a public issue for a
vulnerability.

If you have not heard back within a week, chase — a missed notification is far more likely than a
decision to ignore you.

### If the bug is in CyberChef itself

Anything under `src/core/` is **upstream code**, mirrored verbatim from
[gchq/CyberChef](https://github.com/gchq/CyberChef). Report it to them, and note that **their
policy forbids a public issue for a vulnerability** — use their private reporting or
`CyberChefSecurity@gchq.gov.uk`.

If you are unsure which side a bug falls on, report it here and it will be routed.

## What this server does and does not do

**It executes only code that is in the image.** There is no plugin loader, no directory scan, and
no path taken from configuration. Tools are registered by explicit import, in a reviewed pull
request.

That is a deliberate decision with a measurement behind it. `node:vm` is **not** a security
boundary:

```js
const ctx = vm.createContext({ bake });                        // the one capability a tool needs
vm.runInContext('bake.constructor("return process")()', ctx);  // -> the real process
```

A host function carries its own realm with it, and `Function.prototype.constructor` reaches that
realm's `Function`. Since every useful tool needs at least one capability, the "we will only pass a
narrow API" defence is unavailable by construction. A vm context with no capabilities is a sandbox
for code that can do nothing.

A real sandbox means **process isolation plus an explicit capability allowlist** — a child process
under Node's permission model or equivalent, a defined IPC surface, and a written decision about
what a plugin may read and reach. Not a worker thread: a worker bounds CPU, not authority, and
shares the process's filesystem, network and environment. Full reasoning:
[ADR 0002](https://github.com/doublegate/CyberChef-MCP/blob/master/docs/adr/0002-tool-registry-is-not-a-plugin-loader.md).

## The threat model, briefly

**The server trusts its client.** There is no authentication on any transport. Anything that can
reach the server can run any of the 504 operations. That is appropriate for the default deployment
— a subprocess launched by your own editor — and is why:

- HTTP binds `127.0.0.1` by default,
- a socket bind off loopback is **refused** unless `CYBERCHEF_SOCKET_ALLOW_REMOTE` is set,
- a Unix socket is created `0600`, with the umask tightened around `listen()` so there is no
  window at a laxer mode.

If you expose it beyond localhost, put authentication in front of it. See **[Transports](Transports)**.

**Two operations reach the network:** `HTTP request` and `DNS over HTTPS`. Every other operation is
pure computation. That was determined by audit, not assumption, and it is why nearly every tool
carries `openWorldHint: false` — which is what lets a client skip an approval prompt.

## Bounds

Inputs are bounded so that one call cannot monopolise the process:

| | |
|---|---|
| Input size | 100 MB (`CYBERCHEF_MAX_INPUT_SIZE`) |
| Per-call timeout | 30 s (`CYBERCHEF_OPERATION_TIMEOUT`), including the analysis tools |
| Concurrency | `CYBERCHEF_MAX_CONCURRENT_OPS` |
| Rate limit | optional, `CYBERCHEF_RATE_LIMIT_*` |
| Regex length | `CYBERCHEF_MAX_REGEX_LENGTH`, against ReDoS in regex-taking operations |

The [analysis tools](Analysis-Tools) carry their own bounds, because their cost comes from the
*shape* of the input rather than its size — a 64 KB hex "modulus" once blocked the event loop for
72 seconds, which no byte-count limit would have predicted.

## Container posture

Distroless Chainguard base, digest-pinned. Runs as **UID 65532 (`nonroot`)**. No shell. Provenance
and SBOM attestations are published with every release, and Trivy scans run on every push and
weekly.

## Supported versions

| Version | Supported |
|---|---|
| 2.4.x | Current release — fixes land here |
| 2.3.x | Security fixes only, until the next minor |
| 1.9.x | Security fixes only until ~March 2027, published to `cyberchef-mcp_v1`, and still **Apache-2.0** |
| < 1.9 | Upgrade — note v2.0.0 has breaking changes |

The full policy, including the audit history, is in
[SECURITY.md](https://github.com/doublegate/CyberChef-MCP/blob/master/SECURITY.md).
