# Fork patches

Deliberate changes this fork makes to **upstream-owned** files, kept as patches and re-applied
after every upstream sync.

`src/core/**` and six files in `src/node/` are mirrored verbatim from GCHQ CyberChef. Anything
hand-edited there is overwritten by the next sync. That is not a hypothetical: a ReDoS mitigation
added in v1.4.1 worked by importing a helper into `src/core/operations/*.mjs`, a later sync
overwrote every one of those files, and the protection was silently gone for four releases while
three documents went on describing it. See
[`docs/security/2026-08-30-saferegex-reverted-by-upstream-sync.md`](../../docs/security/2026-08-30-saferegex-reverted-by-upstream-sync.md).

So: **never hand-edit an upstream-owned file.** Add a patch here instead.

## Why patches rather than a list of protected files

The obvious alternative — mark files as "fork-owned" and don't overwrite them — was measured against
v11.4.0 and rejected. Of the files this fork has modified:

| file | our change | upstream also changed the same file |
|---|---|---|
| `src/core/Utils.mjs` | escape backslashes before quotes | yes — added `_validatePrettyRecipe` |
| `src/core/Recipe.mjs` | (obsolete, dropped) | yes — added a try/catch around operation construction |

Protecting `Utils.mjs` wholesale would have kept our fix and **discarded upstream's**. Patches keep
both: upstream's file lands intact, then our change is re-applied on top.

The second reason matters more. A patch that no longer applies **fails the sync**. That is the alarm
the v1.4.1 mitigation never had — it disappeared without a single test going red. If upstream edits
the region a patch touches, the sync stops and a human decides.

## Contents

| patch | file | why it exists | still needed at v11.4.0 |
|---|---|---|---|
| `01-gost-secure-random.patch` | `src/core/vendor/gost/gostRandom.mjs` | Upstream falls back to `Math.floor(256 * Math.random())` for cryptographic randomness. This substitutes `crypto.randomBytes`, and throws rather than silently using a non-CSPRNG. | **Yes** — verified, upstream still ships `Math.random()` here. |
| `02-utils-escape-backslashes.patch` | `src/core/Utils.mjs` | `parsePrettyRecipe` escapes `"` but not `\`, so a backslash can escape the escaping. Upstream suppresses the finding with `// lgtm [js/incomplete-sanitization]` rather than fixing it. | **Yes** — verified, upstream still ships the suppressed version. |
| `03-chefworker-scoped-loglevel.patch` | `src/core/ChefWorker.js` | This fork depends on `@natlibfi/loglevel-message-prefix`, a maintained scoped fork, rather than upstream's unscoped `loglevel-message-prefix`. | **Yes** — a deliberate dependency substitution. |

Two earlier fork edits were **dropped as obsolete** rather than carried forward: `assert {type: "json"}`
→ `with {type: "json"}` in `Magic.mjs`, `Recipe.mjs`, `ChefWorker.js` and `api.mjs`. Upstream adopted
`with` in v11.x, so those resolve themselves on sync. Carrying them would have meant maintaining
patches that fight upstream for no benefit — and patch 03 initially failed to apply for exactly that
reason, which is how they were found.

## Rules

- **One patch per logical change**, named `NN-short-description.patch`, applied in filename order.
- Each patch is generated against the **upstream** file, not against our working tree, so it contains
  only what we change. Generate with:

  ```sh
  # after editing a checked-out pristine upstream file
  diff -u --label a/<path> --label b/<path> <pristine> <edited> > patches/fork/NN-name.patch
  ```

- Every patch must be listed in the table above with **why it exists** and **whether upstream has
  since fixed it**. A patch whose upstream cause is gone must be deleted, not left applying to
  nothing.
- Patches apply with `patch -p1` from the repository root.

## When a patch fails during a sync

This is the mechanism doing its job, not a breakage. Upstream changed the code the patch touches.

1. Read what upstream changed in that region.
2. If upstream **fixed the underlying problem**, delete the patch and note it in the sync PR.
3. If the problem remains, regenerate the patch against the new upstream file and re-verify.
4. Never `--force` or fuzz a patch through. A patch applied at the wrong offset is worse than one
   that failed, because it looks like it worked.
