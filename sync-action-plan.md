# Action Plan: Complete v11.5.0 Sync

## Summary

> **Status:** Completed by PR #156. This document serves as the historical record of the v11.5.0 sync formalization and validation.

The pre-sync repository state was inconsistent:
- **Claimed to be on**: v11.4.0 (per package.json)
- **Actually had**: v11.4.0 + full upstream v11.5.0 sync from commit 2fddf748
- **Monitor detected**: 33 modified operations against v11.4.0 (25 expected fork patches + RSAVerify + 7 upstream changes)

## Completed Action: Complete v11.5.0 Sync

Formalized the v11.5.0 sync, updated all version declarations, reconciled fork patch inventory, and updated documentation.

## Step-by-Step Plan

### 1. Update Version Declaration

**Status: Completed.**

Update `package.json`:
```json
"cyberchefUpstreamVersion": "11.5.0"
```

### 2. Verify All Patches Still Apply

**Status: Completed.**

*Note on patch validation:* Working tree patches in `src/core/operations/` are already applied to the fork codebase. Running `git apply --check` directly in the fork working tree tests applying already-applied patches and produces false errors.

To test applying patches cleanly against pristine upstream source:
```bash
# Test applying patches against pristine upstream v11.5.0 reference clone:
for patch in patches/fork/*.patch; do
    echo "Testing $patch against upstream v11.5.0"
    git -C ref-proj/CyberChef apply --check --directory=src/core "../../$patch" 2>&1 || { echo "FAILED: $patch"; exit 1; }
done
```

All 10 patches apply cleanly against upstream v11.5.0.

### 3. Check for New Operations in v11.5.0

```bash
cd ref-proj/CyberChef
git checkout v11.5.0
cd ../..
# Compare operation counts
echo "Upstream v11.5.0 operations:"
find ref-proj/CyberChef/src/core/operations -name '*.mjs' | wc -l
echo "Fork operations:"
find src/core/operations -name '*.mjs' | wc -l
```

### 4. Identify Any Missing Upstream Changes

Compare all operation files:
```bash
for op in ref-proj/CyberChef/src/core/operations/*.mjs; do
    basename_op=$(basename "$op")
    fork_op="src/core/operations/$basename_op"
    if [ ! -f "$fork_op" ]; then
        echo "NEW in upstream: $basename_op"
    fi
done
```

### 5. Review Content Differences for Matching Operations

Compare operation files present in both upstream v11.5.0 and the fork:
```bash
# Compare matching operation implementations between upstream and fork
for fork_op in src/core/operations/*.mjs; do
    basename_op=$(basename "$fork_op")
    upstream_op="ref-proj/CyberChef/src/core/operations/$basename_op"
    if [ -f "$upstream_op" ]; then
        if ! diff -u "$upstream_op" "$fork_op" > /dev/null 2>&1; then
            echo "MODIFIED: $basename_op"
        fi
    fi
done
```

Differences break down into:
- 25 operation files modified by documented fork patches (`patches/fork/`)
- 1 operation file (`RSAVerify.mjs`) disabled in fork due to CVE-2026-85393
- Total: exactly 26 modified operations against v11.5.0

### 6. Update Documentation

Files to update:
- `package.json` - cyberchefUpstreamVersion
- `AGENTS.md` - Update "Upstream base" row
- `CHANGELOG.md` - Add entry for v11.5.0 sync
- `docs/guides/upstream-sync-guide.md` - Update current state to v11.5.0
- `docs/planning/ROADMAP.md` - Update upstream base to v11.5.0
- `docs/wiki/FAQ.md` - Qualify upstream base description

### 7. Run Full Test Suite

```bash
npm install
npx grunt configTests
npm run lint
npm test
npm run test:mcp
npm run conformance
```

### 8. Verify Operation Count

```bash
npm run check:versions
```

This should pass with 505 operations.

### 9. Create PR

**Status: Completed by PR #156.**

- Branch name: `cursor/complete-v11.5.0-sync-28f3`
- Title: "Complete v11.5.0 sync and resolve version inconsistency (resolves DOU-82)"
- Description: Explain the inconsistent state and how this PR resolves it

## Alternative: Stay on v11.4.0

If the decision is to stay on v11.4.0:

1. Revert the cherry-picked changes from commit 2fddf748:
   ```bash
   # Revert the specific operation changes
   git checkout v11.4.0-base -- src/core/operations/CSSSelector.mjs
   git checkout v11.4.0-base -- src/core/operations/DisassembleX86.mjs
   # ... etc for all 7 files
   ```

2. Then re-apply all fork patches

3. This would lose the useful fixes:
   - LMHash crash fix
   - RenderMarkdown anchor tag fix
   - Error type improvements

## What About the Issue Monitor?

After completing the sync to v11.5.0:
- Issue DOU-82 is resolved.
- Retain `master` branch for `ref-proj/CyberChef` reference clone (submodule tracks upstream `master` rather than pinning a release tag, adhering to the monitor's persistence model in `upstream-monitor.yml` line 331).
- Note on monitor behavior: Against upstream v11.5.0, the monitor detects 26 modified operations (25 fork patches + RSAVerify). Because `upstream-monitor.yml` flags any modified operation with `needs_update=true`, teaching the monitor to ignore documented fork patches and disabled RSAVerify is required for fully clean automated runs without manual triage.

## Risk Assessment

**Low Risk**: 
- The cherry-picked changes are already in the codebase and working
- We're just formalizing what's already there
- All patches are documented and tested

**Medium Risk**:
- Need to verify patches still apply (expected to be fine)
- Need to check for any other v11.5.0 changes we missed

**Testing Required**:
- Full test suite must pass
- Conformance tests must pass
- All 505 operations must work correctly
