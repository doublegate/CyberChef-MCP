# Fork & Upstream

This is a fork of [gchq/CyberChef](https://github.com/gchq/CyberChef), currently tracking
**v11.4.0**. Understanding the split matters if you intend to change anything under `src/core/`.

## What belongs to whom

| | Owner |
|---|---|
| `src/core/**` | **Upstream.** Mirrored verbatim |
| `src/node/{api,apiUtils,File,NodeDish,NodeRecipe,repl}.mjs` | **Upstream.** Six files, mirrored verbatim |
| Everything else in `src/node/` | This fork |
| `tests/mcp/`, workflows, `docs/`, `patches/` | This fork |

**Never hand-edit an upstream-owned file.** To change one, either adopt upstream's version (if they
already have the change) or add a patch under `patches/fork/`, which the sync re-applies.

## Why patches, and why that is not bureaucracy

A patch that stops applying **fails the sync**. That alarm is the entire point, and it exists
because of a specific incident.

`SafeRegex.mjs` was added in v1.4.1 to resolve 11 ReDoS alerts, by importing `createSafeRegExp`
into the affected operations. A later sync mirrored `src/core/operations/*.mjs` verbatim from
upstream and **silently reverted every call site**. The module survived — it lived in
`src/core/lib/`, which the narrow allowlist never touched — so nothing looked broken. The
mitigation was gone for four releases while three documents asserted it was active.

Full account:
[the SafeRegex incident](https://github.com/doublegate/CyberChef-MCP/blob/master/docs/security/2026-08-30-saferegex-reverted-by-upstream-sync.md).

A file-level carve-out would not have fixed it either, and that was measured: upstream edits the
same files this fork patches, so protecting `src/core/Utils.mjs` wholesale keeps our escaping fix
and **discards upstream's new `_validatePrettyRecipe`**. Patches keep both.

## The nine patches

`patches/fork/` holds 01 and 03–10. The substantial ones:

| | |
|---|---|
| `07` | `Generate all hashes` — one algorithm's failure no longer discards the other twenty digests |
| `08` | Repoints seven importers at the vendored `crypto-api` |
| `09` | **17 image operations returned Node's shared buffer pool instead of the image.** A `Buffer` is a view, so `.buffer` is the pool: a 129-byte PNG came back as a 65,599-byte `ArrayBuffer`, and the surplus was whatever the process had recently allocated |
| `10` | `Add Text To Image` — vendored bitmap fonts, loaded from disk. It had never worked in this fork |

## Vendored dependencies

| | Why |
|---|---|
| `src/vendor/crypto-api/` (MIT) | The published package **cannot be loaded**: its tarball has no `main` file and its ESM imports are extensionless |
| `src/vendor/bmfonts/` (Apache-2.0) | Bitmap fonts for `Add Text To Image` |

Both are lint- and coverage-exempt and carry a README explaining when they can be deleted.

## The sync is one-way, permanently

Pull only. As of v2.0.0 the combined work is **GPL-3.0-or-later**, so MCP-layer changes cannot be
contributed back to an Apache-2.0 upstream.

The licence is uniquely determined rather than chosen: `katana` is GPLv3+, which rules out GPLv2;
and Apache-2.0 is one-way compatible into GPLv3 only. Upstream files keep their Apache-2.0 headers
— it is the combined derivative work that is GPLv3.

## Reporting upstream bugs

Anything under `src/core/` is theirs. This fork has reported both kinds:

- **Publicly:** [gchq/CyberChef#2746](https://github.com/gchq/CyberChef/issues/2746) — correctness
  items including two operations that declare the same name, so one silently overwrites the other
  in `OperationConfig` and becomes unreachable.
- **Privately:** GHSA-hj7h-fgw7-x6w8 — the pooled-buffer disclosure, reported through their private
  channel because their policy forbids a public issue for a vulnerability.

## Keeping up

`upstream-monitor.yml` checks weekly for new upstream releases and opens a tracking issue.
`upstream-sync.yml` performs the mirror, re-applies the patches, regenerates the config and
baseline, and fails loudly if a patch no longer applies.
