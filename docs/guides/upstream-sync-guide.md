# Upstream Sync Guide

## Overview

CyberChef-MCP maintains a fork relationship with GCHQ/CyberChef while removing web UI components and focusing on the MCP server implementation. This guide explains the selective sync model and automated workflows.

## Architecture

### Repository Structure

```
CyberChef-MCP/
├── src/
│   ├── core/
│   │   └── operations/     # Synced from upstream
│   ├── node/
│   │   └── mcp-server.mjs  # MCP-specific (not synced)
│   └── (no web/ directory - removed)
├── ref-proj/
│   └── CyberChef/          # Full upstream clone (reference)
├── tests/
│   └── mcp/                # MCP tests (not synced)
└── .github/workflows/      # Custom workflows (not synced)
```

### Sync Model

**Philosophy:** Selective file syncing, NOT git merge

- **Synced Files:** Only `src/core/operations/*.mjs`
- **Excluded Files:** `src/web/`, `tests/browser/`, config files
- **Preserved Files:** MCP-specific modifications (package.json, Gruntfile.js, etc.)
- **Reference Directory:** `ref-proj/CyberChef/` contains full upstream for comparison

## Workflows

### 1. upstream-monitor.yml

**Purpose:** Detect upstream changes and create tracking issues

**Trigger:**
- Scheduled: Every 6 hours
- Manual: `gh workflow run upstream-monitor.yml`

**Process:**
1. Update/clone upstream to `ref-proj/CyberChef/`
2. Compare operation files with main codebase
3. Identify new, modified, and deleted operations
4. Create issue if changes detected

**Output:**
- GitHub issue with:
  - Operation count comparison
  - List of new operations (first 20)
  - List of modified operations (first 20)
  - Link to upstream release notes
  - Instructions for triggering sync

**Example Issue:**
```markdown
## New Upstream Release Detected

**CyberChef Version**: v10.19.5
**Current Version**: v10.19.4
**Detected**: 2025-12-16 12:00:00 UTC

### Operation Changes
- Current Operations: 464
- Upstream Operations: 465
- New Operations: 1
- Modified Operations: 3

#### New Operations
```
NewCoolOperation.mjs
```

#### Modified Operations
```
AESDecrypt.mjs
Base64.mjs
SHA3.mjs
```
```

### 2. upstream-sync.yml

**Purpose:** Selectively sync operation files from upstream

**Trigger:**
- Manual: `gh workflow run upstream-sync.yml`
- Automatic: Add `upstream-sync-approved` label to monitor issue

**Process:**
1. Ensure `ref-proj/CyberChef/` is updated
2. Identify changed operations (new, modified, deleted)
3. Copy only changed operation files
4. Verify no excluded files copied
5. Regenerate `OperationConfig.json`
6. Run comprehensive tests (core + MCP + lint)
7. Update `baseline.json` for regression testing
8. Create PR with detailed changelog

**Safety Checks:**
- No `src/web/` directory
- No `tests/browser/` directory
- No `nightwatch.json`, `postcss.config.js`, `.devcontainer/`
- MCP-specific files unchanged (package.json, Gruntfile.js, etc.)

**Example PR:**
```markdown
## Upstream Sync: v10.19.5

Selective sync from CyberChef v10.19.5 (NOT full merge)

### Changes Summary
- New Operations: 1
- Modified Operations: 3
- Deleted Operations: 0 (kept in MCP)
- Total Operations: 465

### Sync Report
(Detailed file-by-file changes)

### Test Results
✅ All tests and linting passed

### Verification Checklist
- [x] Only operation files synced
- [x] No excluded files
- [x] MCP-specific files preserved
- [ ] Manual testing of new operations
```

### 3. rollback.yml

**Purpose:** Emergency rollback if sync causes issues

**Trigger:**
- Manual only: `gh workflow run rollback.yml -f reason="Issue description"`

**Process:**
1. Capture current state (operation count, ref-proj state)
2. Rollback to specified commit (or parent commit)
3. Regenerate configs and baseline
4. Run tests
5. Create PR with state comparison

**Important:** Does NOT automatically rollback `ref-proj/CyberChef/`
- You may need to manually rollback ref-proj if upstream changes caused the issue
- PR includes instructions for ref-proj rollback if needed

**Example PR:**
```markdown
## Emergency Rollback

**Reason:** Test failures after v10.19.5 sync

### State Comparison
| Metric | Before | After |
|--------|--------|-------|
| Operations | 465 | 464 |
| ref-proj tag | v10.19.5 | v10.19.4 |

### ref-proj/CyberChef State
The ref-proj directory was NOT automatically rolled back.
Current state: v10.19.5

(Instructions for manual rollback if needed)
```

## File Exclusion Rules

### Never Sync From Upstream

**Web UI (81 files):**
- `src/web/` - All web application code
- `src/web/static/images/` - Logos, icons, screenshots
- `src/web/static/fonts/` - Font files

**Browser Tests (4 files):**
- `tests/browser/` - Nightwatch.js tests

**Config Files (3 files):**
- `nightwatch.json` - Browser test configuration
- `postcss.config.js` - CSS processing for web UI
- `.devcontainer/` - VS Code dev container

### Sync Selectively

**Primary Sync Target:**
- `src/core/operations/*.mjs` - Individual operation implementations

**Review Carefully:**
- `src/core/lib/` - Shared library code (may need manual review)
- `src/core/config/modules/` - Operation module configs

### Never Overwrite (MCP-Specific)

**Core Files:**
- `package.json` - Has `mcpVersion` field and MCP dependencies
- `Gruntfile.js` - MCP-specific build tasks
- `src/node/mcp-server.mjs` - MCP server entry point
- `src/node/wrapper.js` - MCP wrapper
- `Dockerfile.mcp` - MCP Docker container

**Tests & CI:**
- `tests/mcp/` - MCP-specific tests
- `.github/workflows/` - Custom CI/CD workflows
- `vitest.config.mjs` - Vitest configuration

**Documentation:**
- `docs/` - MCP-specific documentation
- `CLAUDE.md` - Project guidance

## Common Scenarios

### Scenario 1: Routine Upstream Update

1. **Monitor detects new release** (automatic every 6 hours)
   - Issue created: "New CyberChef release v10.19.5 available"

2. **Review the issue**
   - Check upstream release notes
   - Review operation changes
   - Look for breaking changes

3. **Approve sync**
   ```bash
   gh issue edit <issue-number> --add-label upstream-sync-approved
   ```

4. **Sync workflow runs** (automatic)
   - Selectively copies changed operations
   - Runs tests
   - Creates PR

5. **Review and merge PR**
   - Verify test results
   - Manual testing if needed
   - Merge when ready

### Scenario 2: Manual Sync

**When to use:** Testing, urgent updates, or specific version

```bash
# Sync to latest
gh workflow run upstream-sync.yml

# Sync to specific version
gh workflow run upstream-sync.yml -f target_version=v10.19.5
```

### Scenario 3: Sync Causes Issues

**Problem:** Tests fail or operations broken after sync

```bash
# Trigger rollback
gh workflow run rollback.yml -f reason="Test failures after v10.19.5 sync"
```

**Rollback workflow will:**
1. Revert to previous commit
2. Regenerate configs
3. Run tests
4. Create PR for review

**If needed, manually rollback ref-proj:**
```bash
cd ref-proj/CyberChef
git checkout v10.19.4
cd ../..
git add ref-proj/CyberChef
git commit -m "chore: rollback ref-proj to match main codebase"
git push origin rollback-branch
```

### Scenario 4: Upstream Breaking Changes

**Problem:** Upstream introduces breaking changes we can't accept

**Options:**

1. **Skip this release**
   - Close the monitor issue without syncing
   - Document why we're skipping
   - Sync to next stable release

2. **Selective adoption**
   - Manually cherry-pick specific operations
   - Modify operations for MCP compatibility
   - Document modifications

3. **Compatibility layer**
   - Add adapter code in MCP server
   - Maintain upstream compatibility
   - Test thoroughly

## Testing Strategy

### Pre-Sync Validation

```bash
# Verify ref-proj is clean
cd ref-proj/CyberChef
git status  # Should be clean

# Verify upstream remote
git remote -v  # Should point to gchq/CyberChef

# Check current operation count
ls src/core/operations/*.mjs | wc -l
```

### During Sync

Automated checks in workflow:
- Operation count verification
- Excluded file detection
- MCP-specific file preservation
- OperationConfig.json regeneration

### Post-Sync Validation

Automated tests:
```bash
npm test              # Core operation tests
npm run test:mcp      # MCP validation (343 tests)
npm run lint          # ESLint (zero errors required)
```

Manual testing:
```bash
# Build Docker image
docker build -f Dockerfile.mcp -t cyberchef-mcp .

# Test critical operations
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | docker run -i --rm cyberchef-mcp
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"cyberchef_to_base64","arguments":{"input":"Hello"}}}' | docker run -i --rm cyberchef-mcp
```

## Metrics and Monitoring

### Key Metrics

**Baseline (v1.7.0):**
- Operations: 464
- MCP Tests: 343
- Test Coverage: 78.93% lines, 89.33% functions
- Excluded File Violations: 0 (strict requirement)

### Success Criteria

**For Sync PR Merge:**
- ✅ All operations synced correctly
- ✅ No excluded files in main codebase
- ✅ All tests passing (core + MCP)
- ✅ No MCP-specific files overwritten
- ✅ ESLint clean (0 errors)
- ✅ Docker build successful
- ✅ Manual smoke tests passed

### Monitoring

**GitHub Actions:**
- upstream-monitor: Every 6 hours
- Check workflow logs for errors
- Review created issues

**PR Reviews:**
- Verify sync report accuracy
- Check test results
- Review changed files list

## Troubleshooting

### Issue: Monitor creates duplicate issues

**Cause:** Issue already exists for this version

**Solution:** Workflow checks for existing issues before creating

### Issue: Sync workflow fails with "Excluded files found"

**Cause:** Upstream added files to excluded paths

**Solution:**
1. Review what files were added
2. Verify they should be excluded
3. Update exclusion rules if needed
4. Manual cleanup if necessary

### Issue: Tests fail after sync

**Cause:** Upstream changes incompatible with MCP

**Options:**
1. **Rollback:** Use rollback workflow
2. **Fix Forward:** Modify operations for compatibility
3. **Skip Operations:** Temporarily exclude problematic operations

### Issue: ref-proj directory missing

**Cause:** First run or directory deleted

**Solution:** Monitor workflow will clone automatically:
```bash
gh workflow run upstream-monitor.yml
```

### Issue: Operation count mismatch

**Cause:** Manual changes or partial sync

**Solution:**
1. Check git status for uncommitted changes
2. Verify ref-proj is updated
3. Re-run sync workflow

## Best Practices

### 1. Regular Monitoring

- Let scheduled workflow run (every 6 hours)
- Review issues promptly
- Don't let sync lag too far behind

### 2. Careful Review

- Always review upstream release notes
- Check for breaking changes
- Test new operations manually

### 3. Incremental Sync

- Sync one release at a time
- Don't skip multiple versions
- Document any manual modifications

### 4. Test Thoroughly

- Run full test suite
- Manual testing for critical operations
- Docker build verification

### 5. Document Changes

- Update CHANGELOG.md
- Note any manual modifications
- Document compatibility issues

## Workflow Diagrams

### Monitor → Sync → Merge Flow

```
┌─────────────────────┐
│  upstream-monitor   │  (Every 6 hours)
│  - Clone/update ref │
│  - Compare ops      │
│  - Create issue     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Review Issue      │  (Manual)
│  - Check changes    │
│  - Review notes     │
│  - Add label        │
└──────────┬──────────┘
           │
           │ upstream-sync-approved label
           ▼
┌─────────────────────┐
│   upstream-sync     │  (Automatic)
│  - Selective copy   │
│  - Regen configs    │
│  - Run tests        │
│  - Create PR        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Review PR        │  (Manual)
│  - Verify changes   │
│  - Test manually    │
│  - Merge            │
└─────────────────────┘
```

### Rollback Flow

```
┌─────────────────────┐
│   Issue Detected    │
│  - Tests fail       │
│  - Ops broken       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Trigger Rollback  │  (Manual)
│  gh workflow run    │
│  rollback.yml       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    rollback.yml     │  (Automatic)
│  - Revert commit    │
│  - Regen configs    │
│  - Run tests        │
│  - Create PR        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Review Rollback PR  │  (Manual)
│  - Verify fix       │
│  - Check ref-proj   │
│  - Merge            │
└─────────────────────┘
```

## References

- **Upstream Repository:** https://github.com/gchq/CyberChef
- **MCP Server Implementation:** `src/node/mcp-server.mjs`
- **Workflow Definitions:** `.github/workflows/upstream-*.yml`
- **Exclusion Rules:** See "File Exclusion Rules" section
- **Architecture Docs:** `docs/architecture/architecture.md`

## Version History

- **v1.7.0** (2025-12-16): Introduced selective sync model
- **v1.6.2** (2025-12-14): Removed web UI files (88 files)
- **v1.0.0** (Initial): Full merge model (deprecated)
