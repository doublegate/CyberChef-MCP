# Archive

Empty, deliberately, and this file records why rather than leaving a directory that looks unfinished.

## The rule

A dead plan is **annotated in place** unless nothing outside `docs/planning/` links to it. Only
then may it move here, with its dated banner intact. It is never deleted:
[`../v3/RE-MEASURE.md`](../v3/RE-MEASURE.md) states the reason — the reasoning in a spent plan is
the useful part, and a reader who finds no trace of a plan assumes it was never considered.

## Why nothing moved on 2026-09-03

The v3.0.0 corpus retirement intended to move the genuinely dead plans here. Measuring first
changed the answer: **every one of the 62 planning documents is referenced from at least two files
outside `docs/planning/`**, and the referrers are mostly `CHANGELOG.md`, `docs/releases/*.md` and
`docs-site/`.

Those are historical records and published URLs. Moving a file to satisfy a tidiness goal would
either break them or require editing release notes to describe a layout that did not exist when
they were written — which is rewriting history, and the one thing the retirement was told not to do.

So all 26 dead or superseded documents were annotated in place instead:

| Set | Files | Banner says |
|---|---|---|
| `future-releases/release-v1.2.0` … `v2.0.0` | 9 | Delivered; the release notes are authoritative |
| `future-releases/release-v2.1.0` … `v2.4.0` | 4 | Superseded — shipped one version later (pre-existing) |
| `future-releases/release-v2.6.0` … `v2.8.0` | 3 | Delivered, re-scoped during execution, with what changed |
| `future-releases/release-v2.9.0`, `v2.9.x`, `v3.0.0` | 3 | Superseded, naming the release that replaced each |
| `phases/phase-1` … `phase-6` | 6 | Complete; phases 4-6 additionally numbered a version behind |
| `strategies/*` | 5 | Delivered, or — for the plugin design — superseded by ADR 0002 |

A banner a reader meets at the top of the file they opened does the job the move was supposed to do.
The move was for the benefit of someone browsing the directory listing, which is not how anyone
arrives at these files.

## When to revisit

If `docs-site/` stops mirroring the planning corpus, or a document's only remaining referrers are
inside `docs/planning/`, that document becomes movable. Check before moving:

```bash
grep -rl --include='*.md' -F "$(basename "$FILE")" . \
  | grep -v '^./docs/planning/' | grep -v '^./node_modules'
```

Empty output means it can move here.
