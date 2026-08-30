# SafeRegex was reverted by an upstream sync, and the docs did not notice

**Date:** 2026-08-30
**Status:** module removed; live documentation corrected
**Affects:** v1.4.1 through v1.9.0

This is a dated supplemental record. It does not rewrite the v1.4.1 release notes or the security
reports from that work — those describe what was true when written. It records what happened
afterwards, because several documents still asserted a protection that no longer existed.

## What happened

v1.4.1 added `src/core/lib/SafeRegex.mjs` (138 lines) to address ReDoS findings. The module was not
self-acting: it worked by having operations import `createSafeRegExp` in place of bare `RegExp`
construction. The security report lists the call sites it was wired into.

`upstream-sync.yml` copies `src/core/operations/*.mjs` **verbatim** from upstream. On a later sync it
overwrote every one of those operations, removing the imports. The module itself survived only
because it sits in `src/core/lib/`, which the sync's narrow allowlist never touched.

Nothing failed. No test broke, because there were no tests for it — the security report's own
follow-up list has "Add security-focused unit tests for SafeRegex" left unchecked. So the mitigation
disappeared silently and the documentation went on describing it for four minor releases.

## Verification

```
$ grep -rn "SafeRegex" src/ --include='*.mjs'
(no matches outside the module itself)

$ grep -n import src/core/operations/RAKE.mjs      # named as a fixed call site
7:import Operation from "../Operation.mjs";

$ diff src/core/operations/RAKE.mjs ref-proj/CyberChef/src/core/operations/RAKE.mjs
(identical — the file is byte-for-byte upstream)
```

## Scope, stated precisely

The **code** protection described in the docs does not exist and has not for some time. Whether the
original findings would re-fire today is a separate question and is **not** asserted here: no ReDoS
or regex-injection alert appears in the repository's current code-scanning data, open or closed.

## Resolution

`SafeRegex.mjs` is removed. Reviving it would mean re-adding imports to files that the next sync
overwrites again — the same failure with a longer delay. Any future regex hardening must live where
the sync cannot reach it (the MCP layer under `src/node/`), or be contributed upstream.

Live documentation corrected: `README.md` and `docs/reference/cyberchef-upstream.md`. Historical
reports keep their text and carry a pointer to this file.

## The general lesson, which is larger than this module

**A hand-edit inside `src/core/**` is not a fix. It is a fix with an expiry date set by the next
sync.** This is the concrete incident behind that rule.

It is also not the only instance. `src/core/Utils.mjs` carries a genuine fork fix — escaping
backslashes before double quotes, replacing upstream's `// lgtm [js/incomplete-sanitization]`
suppression — which upstream **still has not fixed as of v11.4.0**, and which a widened sync would
revert exactly as this one was. That file is on the fork-owned manifest for precisely this reason.
