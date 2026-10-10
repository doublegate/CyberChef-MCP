# Action Plan: Complete v11.5.0 Sync

## Summary

The current repository state is inconsistent:
- **Claims to be on**: v11.4.0 (per package.json)
- **Actually has**: v11.4.0 + cherry-picked fixes from v11.5.0
- **Monitor detects**: 32 modified operations (25 expected patches + 7 from partial v11.5.0 sync)

## Recommended Action: Complete v11.5.0 Sync

This resolves the inconsistency and gets the latest upstream fixes.

## Step-by-Step Plan

### 1. Update Version Declaration

Update `package.json`:
```json
"cyberchefUpstreamVersion": "11.5.0"
```

### 2. Verify All Patches Still Apply

Run through each patch in `patches/fork/`:
```bash
cd /workspace
for patch in patches/fork/*.patch; do
    echo "Testing $patch"
    git apply --check "$patch" 2>&1 || echo "FAILED: $patch"
done
```

Expected: All 10 patches should still apply cleanly since the v11.5.0 changes don't conflict with our patches.

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

### 5. Review Remaining Differences

After accounting for our 10 patches, check if there are any other differences that need attention:
```bash
# This would show operations that differ but aren't covered by our patches
# These would be the cherry-picked changes that are already in place
```

### 6. Update Documentation

Files to update:
- `package.json` - cyberchefUpstreamVersion
- `AGENTS.md` - Update "Upstream base" row
- `CHANGELOG.md` - Add entry for v11.5.0 sync
- Any other references to v11.4.0 as the upstream base

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

- Branch name: `chore/complete-v11.5.0-sync`
- Title: "chore(upstream): complete v11.5.0 sync and resolve version inconsistency"
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
- The issue DOU-82 should be closed as "completed"
- Update the ref-proj to v11.5.0 tag
- Next monitor run should show:
  - Latest upstream: v11.5.0
  - Fork base: v11.5.0
  - Modified operations: 25 (just the patches)
  - Status: Clean (expected drift from patches)

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
