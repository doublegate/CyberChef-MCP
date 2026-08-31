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
| `03-chefworker-scoped-loglevel.patch` | `src/core/ChefWorker.js` | This fork depends on `@natlibfi/loglevel-message-prefix`, a maintained scoped fork, rather than upstream's unscoped `loglevel-message-prefix`. | **Yes** — a deliberate dependency substitution. |
| `05-capstone-js-5-module-factory.patch` | `src/core/operations/DisassembleARM.mjs` | `@alexaltea/capstone-js` 5.x is a WASM build whose default export is an Emscripten MODULARIZE **factory**, where 3.x default-exported the ready-made asm.js module. Upstream still pins `^3.0.5`, so it calls `cs.Capstone(...)` directly and every one of the 31 Disassemble ARM tests fails with `cs.Capstone is not a constructor` on the bumped dependency. This awaits the factory once, memoised, and resolves it inside `run()` rather than at module scope -- a top-level await would instantiate WASM merely because the operation module was imported, which happens for every operation when the tool list is built. | **Yes** — while this fork is ahead of upstream on capstone-js. Drop it when upstream takes 5.x. |
| `04-test-fixture-no-web-assets.patch` | `tests/node/tests/operations.mjs` | The "Scan for embedded files" test reads `src/web/static/images/cook_male-32x32.png`. This fork removed the web app in v1.7.1, so that asset does not exist. Repointed at `tests/node/sampleData/pic.jpg`, which the adjacent EXIF test already uses. The assertion only checks the output's prefix, so any binary file satisfies it. | **Yes** — while this fork ships no web assets. |
| `06-lmhash-pure-js-des.patch` | `src/core/operations/LMHash.mjs` | Upstream delegates to `ntlm@0.1.3`, whose `smbhash.lmhash` calls `crypto.createCipheriv("DES-ECB", ...)`. Single DES lives in OpenSSL 3's **legacy provider**, and the Chainguard runtime image carries no such module — a filesystem walk of the published image finds no `*legacy*.so` and Node prints "Unable to load legacy provider." at startup. So `LM Hash` threw `error:0308010C:digital envelope routines::unsupported` in the shipped container, and took `Generate all hashes` down with it. `--openssl-legacy-provider` does not help: it was already set in the image's `NODE_OPTIONS` and is inert with no module to load. Recomputed with `node-forge` (already a direct dependency) in pure JavaScript, so it works wherever Node runs. Verified against both canonical vectors: `LM("password") = E52CAC67419A9A224A3B108F3FA6CB6D`, `LM("") = AAD3B435B51404EEAAD3B435B51404EE`. | **Yes** — until upstream stops routing LM through OpenSSL. |
| `07-generate-all-hashes-degrade.patch` | `src/core/operations/GenerateAllHashes.mjs` | Every algorithm ran unguarded, so one throw propagated out of the operation and discarded **all twenty digests that had computed correctly**. For an operation whose purpose is "give me every hash of this", that is the worst available failure mode. Each algorithm is now computed independently and a failure is reported on its own line. Found via patch 06's trigger; worth keeping regardless, since it bounds the blast radius of any future algorithm becoming unavailable. | **Yes** — independent of 06. |

### Dropped: `02-utils-escape-backslashes`

Removed while landing v11.4.0, and the reason is the most useful lesson in this directory.

That patch escaped `\` before `"` in `Utils.parsePrettyRecipe`, because upstream escaped only `"`
and marked the gap `// lgtm [js/incomplete-sanitization]`. Upstream has now **fixed it properly**:
v11.4.0 added `Utils._validatePrettyRecipe()` and rewrote the parsing regex to handle escapes
(`'[^'\\]*(?:\\.[^'\\]*)*'`, and `([^\\]|(?:\\\\)+)'` for closing quotes). The `lgtm`
comment survives on the line above, but the logic around it is new.

**The patch still applied cleanly, and was still wrong.** Applying cleanly only means the
surrounding context is unchanged; it says nothing about whether the fix is still needed. Ours
double-escaped what upstream's regex now handles, and broke upstream's own new test —
`Utils: should parse escaped quotes and backslashes in pretty recipes` — with
`SyntaxError: Bad escaped character in JSON at position 3`.

So: **a clean apply is not a green light.** The sync's patch step catches context drift; only the
test suite catches a patch whose purpose has evaporated. Run the full suite after every sync, and
when a patch's upstream cause is fixed, delete the patch.

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
