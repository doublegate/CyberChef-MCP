# CyberChef MCP Server

[GCHQ CyberChef](https://github.com/gchq/CyberChef) as tools an AI assistant can call: **504
operations** for encryption, encoding, compression and forensics, plus **four analysis tools** that
an operation cannot express.

```bash
docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v3:latest
```

The `-i` is not optional. Without it the container exits immediately and your client reports the
server as failed — see **[Troubleshooting](Troubleshooting)**.

## Where things live

Three documentation surfaces, deliberately different:

| | What it is | When to use it |
|---|---|---|
| **[Documentation site](https://doublegate.github.io/CyberChef-MCP/)** | The authoritative reference. Generated from `docs/` and from the server's own `OperationConfig`, so it cannot disagree with the code. | Looking up an operation, an argument name, or a type. |
| **This wiki** | The practical layer — setup, operations, worked examples, the reasoning behind decisions. | "How do I actually do X", and "why does it behave like that". |
| **[Repository docs](https://github.com/doublegate/CyberChef-MCP/tree/master/docs)** | ADRs, findings logs, release notes, planning. | Understanding why something is the way it is, in detail. |

If the site and this wiki ever disagree, **the site is right** and this wiki needs fixing.

## Start here

| | |
|---|---|
| **[Installation](Installation)** | Docker, npm, or from source |
| **[Client Setup](Client-Setup)** | Claude Code, Claude Desktop, LM Studio, Cursor, MCP Inspector |
| **[The Tool Surface](Tool-Surface)** | Why you see 28 tools and not 531 — the most common question |
| **[Analysis Tools](Analysis-Tools)** | XOR key length, cyclic patterns, hash identification, RSA attacks |
| **[Troubleshooting](Troubleshooting)** | The failures people actually hit, and what causes them |

## What makes this different from running CyberChef in a browser

- **The model calls it directly.** No copy-paste between a chat window and a web app.
- **`cyberchef_bake` runs whole recipes**, so a five-step decode is one call rather than five.
- **Analysis, not just transformation.** An operation is a pure `run(input, args)` over one input.
  The [analysis tools](Analysis-Tools) score forty candidate key lengths, factor a modulus four
  ways, or match a hash against a table of structures — none of which a recipe can express, because
  a recipe is a pipeline, not a loop.
- **Bounded and observable.** Timeouts, quotas, rate limits, caching, and optional telemetry, none
  of which a browser tab has.

## Reporting problems

- **Bugs and questions:** [open an issue](https://github.com/doublegate/CyberChef-MCP/issues)
- **Security:** [report privately](https://github.com/doublegate/CyberChef-MCP/security/advisories/new) —
  please do not open a public issue for a vulnerability. Private vulnerability reporting is enabled
  on this repository. See **[Security](Security)**.
- **Something in CyberChef itself** (anything under `src/core/`): that is upstream code. Report it
  to [gchq/CyberChef](https://github.com/gchq/CyberChef), and note that **their policy forbids a
  public issue for a vulnerability** — use their private reporting or `CyberChefSecurity@gchq.gov.uk`.
