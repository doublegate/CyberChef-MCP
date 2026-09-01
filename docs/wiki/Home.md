# CyberChef MCP Server — Wiki

A Model Context Protocol server wrapping [GCHQ CyberChef](https://github.com/gchq/CyberChef):
**504 operations** — encryption, encoding, compression, forensics — as tools an AI assistant can
call directly.

## Where things live

This project has two documentation surfaces, and they are deliberately different:

| | |
|---|---|
| **[Documentation site](https://doublegate.github.io/CyberChef-MCP/)** | The authoritative reference. Generated from `docs/` and from the server's own `OperationConfig`, so it cannot disagree with the code. Versioned with the repository. |
| **This wiki** | The practical layer — client setup, troubleshooting, worked recipes. Editable without a pull request, which is the point: it is where the answer to "how do I actually do X" belongs. |

If the two ever disagree, **the documentation site is right** and this wiki needs fixing.

## Start here

- **[Client Setup](Client-Setup)** — Claude Code, Claude Desktop, LM Studio, Cursor, MCP Inspector
- **[Troubleshooting](Troubleshooting)** — the failures people actually hit, and what causes them
- **[FAQ](FAQ)** — including the one everybody asks: *why do I only see 24 tools?*
- **[Recipes](Recipes)** — worked multi-step examples for triage, CTF, steganography and forensics

## The one-line version

```bash
docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

The `-i` is not optional. Without it the container exits immediately and your client reports the
server as failed — see [Troubleshooting](Troubleshooting).

## Reporting problems

- **Bugs and questions:** [open an issue](https://github.com/doublegate/CyberChef-MCP/issues)
- **Security:** [report privately](https://github.com/doublegate/CyberChef-MCP/security/advisories/new) —
  please do not open a public issue for a vulnerability. Private vulnerability reporting is enabled
  on this repository.
- **Something in CyberChef itself** (anything under `src/core/`): that is upstream code. Report it
  to [gchq/CyberChef](https://github.com/gchq/CyberChef), and note that **their policy forbids a
  public issue for a vulnerability** — use their private reporting or
  `CyberChefSecurity@gchq.gov.uk`.
