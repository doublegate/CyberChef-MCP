# Code-scanning disposition — 55 alerts, 2026-08-31

Every open CodeQL alert on `master`, with what was done about it and why. Six were **fixed by
deleting dead code**, two were **fixed properly**, and 47 were **dismissed with reasons** recorded
here and referenced from each dismissal.

## Why these appeared after v2.0.0 claimed zero

The v2.0.0 release notes said "zero open code-scanning alerts", and that was true when it was
measured — immediately before the release merge, both alert APIs returned 0.

It stopped being true minutes later, and the reason is mechanical rather than mysterious: a
**pull-request** CodeQL run analyses the merge commit in a diff-informed mode, while the **push to
the default branch** runs a full analysis. v2.0.0 merged, CodeQL ran fully against `master` for the
first time in months, and surfaced 55 pre-existing findings in code the fork had been carrying all
along.

Two things follow, and both are recorded because the next person will hit them:

- **"Zero alerts" measured on a PR is not the same claim as "zero alerts on the default branch."**
  The v2.0.0 notes did not distinguish them, and now say so.
- **None of the 55 were introduced by v2.0.0.** They are older than the release that surfaced them.

## Summary

| Disposition | Count | What |
|---|---|---|
| **Fixed — dead code deleted** | 6 | `src/web/workers/**`, orphaned since v1.7.1 |
| **Fixed — real change** | 2 | `benchmarks/operation-benchmarks.mjs` unused fixtures |
| **Dismissed — upstream vendor** | 44 | `src/core/vendor/**` (GOST crypto, x86 disassembler) |
| **Dismissed — upstream, unreachable** | 1 | `src/core/ChefWorker.js` |
| **Dismissed — upstream, dev-only** | 1 | `src/core/config/scripts/newOperation.mjs` |
| **Dismissed — upstream operation** | 1 | `src/core/operations/FromBCD.mjs` |
| **Total** | **55** | |

Of the eight alerts carrying a **security severity**, seven are fixed by deletion and one is
dismissed as unreachable. No security-severity finding is suppressed while remaining live in the
shipped product.

---

## Fixed: `src/web/` deleted (6 alerts, 3 high + 3 medium)

| Alert | Rule | File |
|---|---|---|
| #472, #473 | `js/remote-property-injection` (high) | `src/web/workers/InputWorker.mjs` |
| #471 | `js/missing-origin-check` (medium) | `src/web/workers/InputWorker.mjs` |
| #470 | `js/missing-origin-check` (medium) | `src/web/workers/ZipWorker.mjs` |
| #469 | `js/missing-origin-check` (medium) | `src/web/workers/LoaderWorker.js` |
| #468 | `js/missing-origin-check` (medium) | `src/web/workers/DishWorker.mjs` |

These are browser Web Worker `postMessage` handlers. **They are also dead code**, and were shipping
in the runtime image.

The fork removed the CyberChef web application in **v1.7.1**, but eight files under `src/web/`
survived the cleanup. Established before deleting anything:

- **Nothing imports them.** `grep -rl` across `src/node/` and `src/core/` finds no reference.
- **The build they belong to cannot work.** `src/web/index.js` imports `./stylesheets/index.js`,
  which does not exist; nor do `src/web/html/index.html`, `src/web/static/ga.html` or
  `src/web/static/structuredData.json`. Confirmed by running it: `npx grunt prod` fails with **39
  webpack errors**, and has since v1.7.1.
- **They shipped anyway.** `find /app/src/web -type f` in the published v2.1.0 image returned all
  eight, because the Dockerfile's prune list never named `src/web`.

So the disposition is deletion, not suppression: dead browser code with three high-severity findings
was being copied into a server image nobody could reach it from.

Also removed, because they only served that build:

- the `dev` and `prod` Grunt tasks, replaced by a task that explains the web app is gone and points
  at `npm run mcp`. A task that cannot succeed is worse than an absent one — it invites someone to
  debug a build for a product this repository does not ship.
- the `eslint:web` target, which now matches nothing.

Deliberately **not** removed: the `webpack:web`, `copy:standalone`, `zip:standalone` and
`exec:calcDownloadHash` configuration blocks. They are inert now that no task references them, and
they share structure with the config `grunt configTests` depends on — untangling them risks breaking
the one Grunt path this project genuinely uses, for no security benefit.

The upstream sync already refuses to reintroduce `src/web/`
(`upstream-sync.yml` fails the run on it), so this cannot come back by accident.

## Fixed: benchmark fixtures (2 alerts, note)

| Alert | Rule | File |
|---|---|---|
| #486, #487 | `js/unused-local-variable` | `benchmarks/operation-benchmarks.mjs` |

`testData1MB` and `testData10MB` were declared and never used by any benchmark. Not merely a lint
tidy-up: `"A".repeat()` builds eagerly, so **every benchmark run allocated 11 MB and discarded it**.

Fixed while there: the file's header declared `@license Apache-2.0`, which has been wrong since the
v2.0.0 relicense. It is the only fork-owned file that still did — 62 others carry the correct
`SPDX-License-Identifier: GPL-3.0-or-later`.

## Dismissed: upstream-owned vendor code (44 alerts)

`src/core/vendor/gost/**` (a GOST cryptography library) and `src/core/vendor/DisassembleX86-64.mjs`.

Rules: `js/unused-local-variable` ×16, `js/trivial-conditional` ×6,
`js/automatic-semicolon-insertion` ×6, `js/unclear-operator-precedence` ×4,
`js/comparison-between-incompatible-types` ×3, and singles of
`js/shift-out-of-range`, `js/call-to-non-callable`, `js/useless-assignment-to-local`,
`js/redundant-operation`, `js/implicit-operand-conversion`, `js/inconsistent-use-of-new`,
`js/duplicate-variable-declaration`, `js/superfluous-trailing-arguments`.

**Every one is a code-quality rule. None carries a security severity.**

Two facts decide the disposition:

1. **These files are mirrored from upstream.** Seven of the eight flagged vendor files are
   byte-identical to GCHQ CyberChef v11.4.0. The eighth, `gostRandom.mjs`, differs only by
   `patches/fork/01` — and the alert in it (#490, line 46) is on an **upstream** line; our patch
   touches lines 114–129.
2. **A hand-edit would be silently reverted.** That is not hypothetical here: a ReDoS mitigation was
   hand-edited into `src/core/` and reverted by a sync, staying gone for four releases while three
   documents claimed it was active — see
   [`2026-08-30-saferegex-reverted-by-upstream-sync.md`](2026-08-30-saferegex-reverted-by-upstream-sync.md).

A fork change to an upstream file must be a `patches/fork/*.patch`, which the sync re-applies and
which fails the sync if it stops applying. Carrying 44 patches against a vendored library, to satisfy
quality rules with no security consequence, would be a permanent maintenance cost for no benefit —
and each one would have to be rebased on every upstream release.

**Collected for upstream report** in issue #73 instead, which already tracks defects found in
`gchq/CyberChef`. That is where a fix helps every CyberChef user rather than only this fork.

## Dismissed: `src/core/ChefWorker.js` (1 alert, medium)

#467, `js/missing-origin-check` at line 48 — a `postMessage` handler with no origin check.

- **Upstream-owned**, and the flagged line is upstream's: this fork's only change to the file is
  `patches/fork/03` (a scoped `loglevel` dependency) at line 9.
- **Unreachable in the shipped product.** It is the CyberChef web app's Web Worker entry point.
  Nothing under `src/node/` references it, and the web app was removed in v1.7.1.

Left in place rather than deleted because, unlike `src/web/`, this file **is** on the upstream sync
allowlist — deleting it would be reverted on the next sync, and would break patch 03 loudly in the
process.

## Dismissed: `src/core/config/scripts/newOperation.mjs` (1 alert, high)

#466, `js/file-system-race` at line 243 — a TOCTOU between an existence check and a write.

- **Byte-identical to upstream v11.4.0.**
- **Not in the runtime image.** `ls /app/src/core/config/scripts/` in the published image lists only
  the five generator scripts; `newOperation.mjs` is absent.
- It backs `npm run newop`, a scaffolding tool a developer runs on their own machine to create a new
  operation file. The race is between that developer and themselves.

High severity by rule, not by reachability: there is no request path to it, and no attacker on the
other side of it.

## Dismissed: `src/core/operations/FromBCD.mjs` (1 alert, warning)

#522, `js/loop-iteration-skipped-due-to-shifting` at line 98 — `splice` inside a loop without
adjusting the index.

Byte-identical to upstream v11.4.0. A genuine (if minor) correctness smell, and therefore worth
reporting upstream rather than patching here: added to issue #73.

---

## What would change these dispositions

- **Upstream fixes a flagged file.** The next sync brings the fix and the alert closes on its own.
  Nothing here needs revisiting.
- **A vendor alert gains a security severity** in a future CodeQL release. Then it stops being a
  quality rule and warrants a `patches/fork/` patch on its own merits.
- **The MCP layer starts reaching one of these paths.** `ChefWorker.js` and `newOperation.mjs` are
  dismissed on reachability, so a change that imports either invalidates the reasoning. Both are
  named here so a future reader can check.

## Verifying this record

```bash
# Open alerts, and their locations
gh api 'repos/doublegate/CyberChef-MCP/code-scanning/alerts?state=open&per_page=100' \
  --jq '.[]|"\(.number) \(.rule.id) \(.most_recent_instance.location.path)"'

# Is a flagged file still identical to upstream?
diff -q src/core/vendor/gost/gostSign.mjs ref-proj/CyberChef/src/core/vendor/gost/gostSign.mjs

# Is a dismissed path actually absent from the shipped image?
docker run --rm --entrypoint find ghcr.io/doublegate/cyberchef-mcp_v2:latest /app/src -name 'newOperation.mjs'
```

Note for whoever automates this next: `dismissed_comment` on the code-scanning API is capped at
**280 characters**, and an over-long comment fails the whole PATCH with an HTTP 422 that is easy to
swallow. The dismissal comments therefore carry a one-line summary and a pointer to this file.
