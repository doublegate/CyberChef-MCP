# Upstream Drift Analysis - DOU-82

## Executive Summary

> **Historical pre-sync snapshot.** The findings and analysis below describe the state prior to the v11.5.0 sync formalization in PR #156.

The detected "drift" against v11.4.0 was a combination of **intentional patches** (25 operations) plus **RSAVerify** and **upstream v11.5.0 sync changes from commit 2fddf748**:

1. `package.json` declared the upstream base as `11.4.0` prior to this sync.
2. Commit `2fddf748` had synced upstream v11.5.0 fixes into `src/core/` (including `Dish.mjs`, `Operation.mjs`, `Categories.json`, image pool fixes, etc.) but did not update the version declaration in `package.json`.
3. The upstream monitor checks out the target release tag before comparing operation files; when comparing against v11.4.0, it detected the v11.5.0 changes as drift, while against v11.5.0 it detects only the 25 fork patches + RSAVerify.

## Detailed Findings

### Total Modified Operations: 32

Comparison against upstream v11.4.0 tag finds 32 modified operation files.

### Category 1: Expected Patches (25 operations)

These modifications are **intentional and documented** in `patches/fork/README.md`:

#### From patch 05 (Capstone.js 5.x):
- DisassembleARM.mjs

#### From patch 06 (LM Hash pure JS):
- LMHash.mjs

#### From patch 07 (Generate All Hashes degrade):
- GenerateAllHashes.mjs

#### From patch 08 (crypto-api vendored):
- DeriveHKDFKey.mjs
- FlaskSessionSign.mjs
- FlaskSessionVerify.mjs
- HMAC.mjs
- SM3.mjs

#### From patch 09 (Image ops return pooled buffer):
- AddTextToImage.mjs
- BlurImage.mjs
- ContainImage.mjs
- ConvertImageFormat.mjs
- CoverImage.mjs
- CropImage.mjs
- DitherImage.mjs
- FlipImage.mjs
- ImageBrightnessContrast.mjs
- ImageFilter.mjs
- ImageHueSaturationLightness.mjs
- ImageOpacity.mjs
- InvertImage.mjs
- NormaliseImage.mjs
- ResizeImage.mjs
- RotateImage.mjs
- SharpenImage.mjs

#### From patch 10 (Add Text to Image Node fonts):
- (AddTextToImage.mjs already counted in patch 09)

**Total: exactly 25 operations** (`patches/fork/README.md` explicitly lists SM3 under patch 08; AddTextToImage.mjs is already counted under patch 09).

### Category 2: Upstream v11.5.0 Changes (Commit 2fddf748)

Commit `2fddf748` synced upstream v11.5.0 changes (including `Dish.mjs`, `Operation.mjs`, `Categories.json`, image pool fixes, etc.) but:
- Did NOT update `cyberchefUpstreamVersion` in package.json (left at 11.4.0)
- Left sync documentation and action plans unupdated

Modified operation files from that commit:
1. **CSSSelector.mjs** - Changed `Error` → `OperationError`
2. **DisassembleX86.mjs** - Added hexadecimal address parsing function
3. **LMHash.mjs** - Fix for uppercase expansion crash (from upstream commit 4855e6a4)
4. **LuhnChecksum.mjs** - Changed `Error` → `OperationError`
5. **MOD.mjs** - Changed `Error` → `OperationError` + added import
6. **PEMToJWK.mjs** - Added RFC 7638 thumbprint feature
7. **RenderMarkdown.mjs** - Fix for anchor tag target attribute (from upstream commit ed31d45a)

Additionally:
8. **RSAVerify.mjs** - Intentionally disabled in fork (commit 89cc60b9) due to CVE-2026-85393

Together with the 25 fork patches, this accounts for the 26 modified operations against v11.5.0 (25 patches + RSAVerify).

## Root Cause

The pre-sync repository state was inconsistent:
- Declared base was v11.4.0 (`cyberchefUpstreamVersion: "11.4.0"`)
- Actual codebase already contained the v11.5.0 sync from commit 2fddf748
- The upstream monitor detected this divergence against v11.4.0

## Upstream v11.5.0 Status

Checked upstream tags:
```
v11.1.0
v11.2.0
v11.3.0
v11.4.0
v11.5.0  ← Latest
```

There are 20 commits between v11.4.0 and v11.5.0, including:
- Security fix for autobake
- LM Hash crash fix
- RenderMarkdown anchor tag fix  
- Various dependency updates

## Recommendations

### Option 1: Complete the v11.5.0 Sync (Recommended — Completed by PR #156)

**Status: Completed by PR #156.**

**Pros:**
- Formalizes the v11.5.0 sync and aligns version declarations
- Gets latest security fixes
- Resolves the inconsistent state
- Aligns with what commit 2fddf748 delivered

**Steps:**
1. Update `cyberchefUpstreamVersion` to `11.5.0` in package.json
2. Run full upstream sync workflow
3. Verify all patches still apply
4. Update AGENTS.md and related docs

### Option 2: Revert to Clean v11.4.0

**Pros:**
- Returns to a known clean state
- Matches what package.json claims

**Cons:**
- Loses useful fixes that were cherry-picked
- May reintroduce bugs (LMHash crash, RenderMarkdown issue)

### Option 3: Document and Accept Current State

**Pros:**
- No code changes needed
- Acknowledge the intentional cherry-picks

**Cons:**
- Leaves repository in inconsistent state
- Future syncs will be confusing
- Monitor will continue reporting drift

## Conclusion

The 25 modified operations from documented patches are **expected and correct**.

The 7 additional modifications are **cherry-picked fixes from v11.5.0** that should either:
- Be formalized by completing the v11.5.0 sync, OR
- Be reverted to maintain clean v11.4.0 state

**Recommended action:** Complete the v11.5.0 sync properly, updating all version references and running the full sync workflow.
