# MCP threats that apply to this server

**Sources**, retrieved 2026-09-03:
[OWASP: MCP tool poisoning](https://owasp.org/www-community/attacks/MCP_Tool_Poisoning) ·
[Unicode TAG-block concealment in tool metadata](https://arxiv.org/pdf/2607.05744) ·
[MCP threat modelling and tool poisoning](https://arxiv.org/pdf/2603.22489)

**Why this file:** the evidence base for the v3.x supply-chain charter. Scoped to what applies
*here* — most published MCP threat material is addressed to clients, and this is a server.

## Tool poisoning, and why this server has an unusual exposure

The attack is instructions hidden in tool **metadata**: a description the model reads as if it were
guidance from the operator. Related work demonstrates concealing those payloads in Unicode TAG-block
characters, invisible in an approval dialog — an "approval-view fidelity gap" reproduced across three
independent server implementations.

The reason it is worth writing down here rather than filing under general caution: **this server's
tool descriptions are not written by this project**. They come from
`src/core/config/OperationConfig.json`, generated from `src/core/**`, which is mirrored verbatim from
GCHQ CyberChef on every upstream sync. So there is a path from an upstream commit to text a model
reads as instruction, and the sync is automated.

Measured across all 504 operations on 2026-09-03:

```text
Unicode TAG-block characters   0
control characters             0
bidi override characters       0
non-ASCII (accents, benign)   27
```

No defect. Also no guard — nothing would fail if that changed.

## What already holds

- **Runtime mutation is not possible.** Tools come from a generated config and an explicit import
  list; there is no loader, no directory scan, no path from configuration (ADR 0002).
- **Enforcement is server-side.** Scope checks run at dispatch, not in a prompt. Since v3.0.0 the
  advertised list is filtered too, but the list is advice and dispatch is the boundary.
- **Least privilege is expressible.** Three scopes, derived from annotations, and since v3.0.0 a
  recipe is priced by what it actually contains rather than by worst case.
- **Network reach is explicit.** Exactly 2 of 504 operations leave the process, and
  `CYBERCHEF_OFFLINE` refuses them — a posture, not a sandbox, and documented as such.

## What does not apply

Most published guidance is client-side: vet servers, allowlist them, require human approval for
destructive actions. Correct, and not this project's to implement. What this project owes that
guidance is **honest annotations** — `readOnlyHint`, `destructiveHint`, `openWorldHint` — since a
client's approval decision is only as good as what the server declares.
