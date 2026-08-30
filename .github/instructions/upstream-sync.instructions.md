---
applyTo: "src/core/**"
---

# Synced upstream code — do not hand-edit

Everything under `src/core/` is copied verbatim from
[gchq/CyberChef](https://github.com/gchq/CyberChef) by
`.github/workflows/upstream-sync.yml`. It is **not** this project's code.

- **Never suggest style, naming, formatting, or refactoring changes here.** They are reverted by
  the next sync and, until then, permanently fork this repo from upstream.
- A genuine bug in an operation belongs upstream, as a PR to `gchq/CyberChef`. A workaround, if one
  is needed before upstream lands the fix, belongs in the MCP layer under `src/node/`.
- The only legitimate change to these files is an upstream sync, which the PR title or body will
  say plainly.
- `src/core/config/OperationConfig.json` and `src/core/operations/index.mjs` are **generated** by
  `npx grunt configTests` and gitignored. Never edit or add them.

Operations here are keyed by their `this.name` display string. Two files declaring the same name
collide silently in `OperationConfig`, and one becomes unreachable — flag any new operation whose
name duplicates an existing one.
