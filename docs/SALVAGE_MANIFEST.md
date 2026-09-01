# Salvage manifest

Records of files rescued from `/tmp` into this repository. `/tmp` is wiped on reboot, so anything
here was one restart away from being lost.

---

## 2026-09-01 — v2.4.0 measurement harnesses

**Source:** `/tmp/claude-1000/-home-parobek-Code-OSS-Public-Projects-CyberChef/9ec29099-.../scratchpad`
**Destination:** `docs/internal/measurements/`
**Method:** curated manual copy, not `salvage.py --execute`.

### Why not the automated plan

The dry run found **2,028 candidates across 1.6 GB**, almost all of which should not be in a
repository. The skill's own guidance says the dry run is a starting point rather than a verdict,
and this was a clear case:

| Rejected | Size | Reason |
|---|---|---|
| `consumer*/`, `sdk2/`, `replay/`, `packtest/` | ~1.5 GB | `node_modules`-heavy test trees, regenerable |
| `up1140/` | 22 MB | **An upstream CyberChef v11.4.0 checkout.** Vendoring upstream source into this fork is the hygiene failure `patches/fork/` exists to prevent; it is also Apache-2.0 code freely available from GCHQ |
| 152 × `agy*.md` | small | Pull-request reply drafts, already posted and permanent on PR #100 |
| 4 × `/tmp/*.patch` | 200 KB | Working diffs of files committed since — superseded by git history |

### Salvaged — 15 scripts, 60 KB

`xor-proto.mjs` · `rule-eval.mjs` · `corpora.mjs` · `rsa-proto.mjs` · `rsa-tool-check.mjs` ·
`hash-check.mjs` · `hashprobe.mjs` · `cyclic-check.mjs` · `client-check.mjs` · `shapes.mjs` ·
`mkpatch.mjs` · `mkpatch09.mjs` · `mkpatch10.mjs` · `strip-test.mjs` · `verify-recipes.mjs`

These produced the numbers cited in `docs/internal/*-findings-log.md`. A measurement nobody can
re-run is an assertion with a number in it, which is the opposite of this project's stated
discipline — see `docs/internal/measurements/README.md` for what each one established.

**Modified on salvage:** six hard-coded an absolute home directory in their imports and would not
have run for anyone else. Rewritten to paths relative to the repository root, and each verified to
execute afterwards.

**Verified not to disturb any gate:** `docs/` is outside the ESLint targets, outside the coverage
include list, and outside the npm `files` allowlist, so none of this is linted, measured or shipped.

### Lost, and not recoverable

The **400-sample matrix harness** behind F-21 (the `DIVISOR_MARGIN` sweep) was written to the
repository root and deleted with `rm -f` rather than written to the scratch directory. It was not in
`/tmp` and could not be salvaged. Its results survive in the F-21 entry and in a comment beside the
constant; the script that produced them does not.

That loss is the reason this directory now exists.
