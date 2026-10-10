# Upstream Drift Analysis - DOU-82

## Executive Summary

The detected "drift" against v11.4.0 is a combination of **intentional patches** (25 operations) and **cherry-picked fixes from v11.5.0** (7 operations). The repository is in an inconsistent state where:

1. `package.json` declares the upstream base as `11.4.0`
2. Some fixes from `v11.5.0` were cherry-picked (commit 2fddf748)
3. The monitor compares against v11.4.0, so it detects these v11.5.0 changes as drift

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

**Total: 24-25 operations** (SM3 was not mentioned in the patches README but is modified by patch 08)

### Category 2: Cherry-picked from v11.5.0 (7 operations)

These modifications came from commit `2fddf748` which claimed to "sync upstream v11.5.0" but:
- Did NOT update `cyberchefUpstreamVersion` in package.json (still says 11.4.0)
- Only partially synced changes from v11.5.0

Modified files from that commit affecting operations:
1. **CSSSelector.mjs** - Changed `Error` → `OperationError`
2. **DisassembleX86.mjs** - Added hexadecimal address parsing function
3. **LMHash.mjs** - Fix for uppercase expansion crash (from upstream commit 4855e6a4)
4. **LuhnChecksum.mjs** - Changed `Error` → `OperationError`
5. **MOD.mjs** - Changed `Error` → `OperationError` + added import
6. **PEMToJWK.mjs** - Added RFC 7638 thumbprint feature
7. **RenderMarkdown.mjs** - Fix for anchor tag target attribute (from upstream commit ed31d45a)

Additionally:
8. **RSAVerify.mjs** - Was later disabled by commit 89cc60b9 due to CVE-2026-85393

## Root Cause

The repository is in an **inconsistent state**:
- Claims to be on v11.4.0 (`cyberchefUpstreamVersion: "11.4.0"`)
- Has changes from v11.5.0 cherry-picked in
- The upstream monitor correctly detects this as drift

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

### Option 1: Complete the v11.5.0 Sync (Recommended)

**Pros:**
- Gets latest security fixes
- Resolves the inconsistent state
- Aligns with what commit 2fddf748 claimed to do

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
