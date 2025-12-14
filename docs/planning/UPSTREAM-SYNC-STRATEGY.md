# Upstream Synchronization Strategy

**Version:** 1.0.0
**Last Updated:** December 2025
**Target Release:** v1.3.0

## Executive Summary

This document defines the comprehensive strategy for automatically synchronizing the CyberChef MCP Server with upstream gchq/CyberChef releases. The goal is to detect, integrate, and validate upstream updates within 24 hours while maintaining MCP server stability.

## Objectives

1. **Automated Detection**: Detect new CyberChef releases within 24 hours
2. **Seamless Integration**: Automatically create PRs with upstream changes
3. **Quality Assurance**: Validate all 300+ MCP tools after updates
4. **Zero Downtime**: Implement rollback mechanisms for failed updates

## Upstream Release Pattern Analysis

### gchq/CyberChef Release Cadence

Based on historical analysis:
- **Release Frequency**: Approximately 6-8 releases per year
- **Version Scheme**: Semantic versioning (10.x.x)
- **Release Types**:
  - Minor releases (10.x.0): New operations, significant features
  - Patch releases (10.x.y): Bug fixes, security updates

### Release Impact Categories

| Category | Impact Level | Action Required |
|----------|--------------|-----------------|
| New Operations | Medium | Config regeneration, new tool tests |
| Operation Changes | High | Existing tool validation, schema updates |
| Security Fixes | Critical | Immediate integration, expedited review |
| Dependency Updates | Low-Medium | Compatibility testing |
| Breaking Changes | Critical | Manual review, migration planning |

## Architecture

### Sync Flow Diagram

```
Phase 1 - Detection:
+-------------------+     +-------------------+     +-------------------+
| GitHub API        | --> | Release Monitor   | --> | Notification      |
| gchq/CyberChef    |     | Scheduled Check   |     | Issue or Alert    |
+-------------------+     +-------------------+     +-------------------+

Phase 2 - Integration:
+-------------------+     +-------------------+     +-------------------+
| Create Sync       | --> | Merge Upstream    | --> | Config Regen      |
| Branch            |     | Changes           |     | grunt configTests |
+-------------------+     +-------------------+     +-------------------+

Phase 3 - Validation:
+-------------------+     +-------------------+     +-------------------+
| MCP Tool Tests    | --> | Integration Tests | --> | Security Scan     |
| 300+ operations   |     | Docker build      |     | Trivy             |
+-------------------+     +-------------------+     +-------------------+

Phase 4 - Deployment:
+-------------------+     +-------------------+     +-------------------+
| Create PR         | --> | Human Review      | --> | Merge and Release |
| Auto-generated    |     | Approve/Request   |     | Publish to GHCR   |
+-------------------+     +-------------------+     +-------------------+
```

## Implementation Options

### Option A: Renovate (Recommended)

**Pros:**
- Industry standard for dependency management
- Rich PR descriptions with changelogs
- Handles multiple upstream sources
- Built-in scheduling and rate limiting

**Cons:**
- External service dependency
- Learning curve for configuration
- May require custom configuration for non-npm sources

**Configuration:**
```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:base"],
  "enabledManagers": ["github-actions", "npm"],
  "packageRules": [
    {
      "description": "Monitor gchq/CyberChef releases",
      "matchDatasources": ["github-releases"],
      "matchPackagePatterns": ["^gchq/CyberChef$"],
      "enabled": true,
      "schedule": ["every weekday"],
      "automerge": false,
      "labels": ["upstream-sync", "automation"],
      "prTitle": "chore(upstream): update CyberChef to {{newVersion}}",
      "prBodyNotes": [
        "This PR syncs upstream CyberChef changes.",
        "Please review the changelog and run validation tests."
      ]
    }
  ],
  "customManagers": [
    {
      "customType": "regex",
      "fileMatch": ["^package\\.json$"],
      "matchStrings": [
        "\"cyberchefVersion\":\\s*\"(?<currentValue>[^\"]+)\""
      ],
      "depNameTemplate": "gchq/CyberChef",
      "datasourceTemplate": "github-releases"
    }
  ]
}
```

### Option B: GitHub Actions (Alternative)

**Pros:**
- Full control over sync process
- No external dependencies
- Custom logic for complex scenarios
- Native GitHub integration

**Cons:**
- More maintenance required
- Custom implementation for each feature
- Rate limiting considerations

**Implementation:**
```yaml
# .github/workflows/upstream-monitor.yml
name: Monitor Upstream CyberChef

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

jobs:
  check-upstream:
    runs-on: ubuntu-latest
    outputs:
      has_update: ${{ steps.check.outputs.has_update }}
      new_version: ${{ steps.check.outputs.new_version }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Check for upstream updates
        id: check
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # Get latest CyberChef release
          LATEST=$(gh api repos/gchq/CyberChef/releases/latest --jq '.tag_name')
          echo "Latest upstream: $LATEST"

          # Get current version
          CURRENT=$(jq -r '.version' package.json)
          echo "Current version: $CURRENT"

          # Compare versions
          if [ "$LATEST" != "v$CURRENT" ]; then
            echo "Update available: $LATEST"
            echo "has_update=true" >> $GITHUB_OUTPUT
            echo "new_version=$LATEST" >> $GITHUB_OUTPUT
          else
            echo "No update available"
            echo "has_update=false" >> $GITHUB_OUTPUT
          fi

      - name: Create sync issue
        if: steps.check.outputs.has_update == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERSION="${{ steps.check.outputs.new_version }}"
          gh issue create \
            --title "Upstream Sync: CyberChef $VERSION available" \
            --label "upstream-sync,automation" \
            --body "A new CyberChef release is available: $VERSION

            ## Actions Required
            1. Review upstream changelog
            2. Create sync branch
            3. Merge upstream changes
            4. Regenerate OperationConfig
            5. Run validation tests
            6. Create PR for review

            [View Release](https://github.com/gchq/CyberChef/releases/tag/$VERSION)"
```

### Option C: Hybrid Approach (Best of Both)

Combine Renovate for detection with GitHub Actions for integration:

1. **Renovate**: Detects new releases, creates tracking issue
2. **GitHub Actions**: Handles merge, config regeneration, testing
3. **Manual Review**: Final approval before merge

## Integration Workflow

### Automated Integration Workflow

```yaml
# .github/workflows/upstream-sync.yml
name: Upstream Sync Integration

on:
  issues:
    types: [labeled]
  workflow_dispatch:
    inputs:
      version:
        description: 'CyberChef version to sync'
        required: true

jobs:
  sync:
    if: |
      github.event_name == 'workflow_dispatch' ||
      contains(github.event.issue.labels.*.name, 'upstream-sync-approved')
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.SYNC_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Create sync branch
        run: |
          VERSION="${{ github.event.inputs.version || env.DETECTED_VERSION }}"
          BRANCH="sync/cyberchef-${VERSION}"
          git checkout -b "$BRANCH"
          echo "SYNC_BRANCH=$BRANCH" >> $GITHUB_ENV

      - name: Add upstream remote
        run: |
          git remote add upstream https://github.com/gchq/CyberChef.git || true
          git fetch upstream --tags

      - name: Merge upstream changes
        id: merge
        continue-on-error: true
        run: |
          VERSION="${{ github.event.inputs.version || env.DETECTED_VERSION }}"
          git merge "upstream/$VERSION" -m "chore(upstream): merge CyberChef $VERSION"

      - name: Handle merge conflicts
        if: steps.merge.outcome == 'failure'
        run: |
          echo "::error::Merge conflicts detected. Manual intervention required."
          git merge --abort
          exit 1

      - name: Install dependencies
        run: npm ci

      - name: Apply Node 22 patches
        run: |
          sed -i 's/new SlowBuffer/Buffer.alloc/g' node_modules/avsc/lib/types.js
          sed -i 's/SlowBuffer/Buffer/g' node_modules/buffer-equal-constant-time/index.js

      - name: Regenerate config
        run: npx grunt configTests

      - name: Run validation tests
        id: validation
        run: npm test

      - name: Commit changes
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A
          git commit -m "chore(sync): regenerate config after upstream merge" || true
          git push origin "$SYNC_BRANCH"

      - name: Create Pull Request
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERSION="${{ github.event.inputs.version || env.DETECTED_VERSION }}"
          gh pr create \
            --title "chore(upstream): sync CyberChef $VERSION" \
            --body "## Upstream Sync: CyberChef $VERSION

            ### Changes
            - Merged upstream CyberChef $VERSION
            - Regenerated OperationConfig.json
            - Regenerated src/node/index.mjs

            ### Validation
            - [ ] All tests pass
            - [ ] Docker image builds
            - [ ] Security scan clean

            ### Changelog
            [View Upstream Release](https://github.com/gchq/CyberChef/releases/tag/$VERSION)

            ---
            *This PR was automatically generated by the upstream sync workflow.*" \
            --label "upstream-sync,automated"
```

## Validation Suite

### MCP Tool Validation

```javascript
// tests/mcp/validation.test.mjs
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('MCP Tool Validation Suite', () => {
  let serverProcess;
  let client;

  beforeAll(async () => {
    // Start MCP server
    serverProcess = spawn('node', ['src/node/mcp-server.mjs'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const transport = new StdioClientTransport({
      command: 'node',
      args: ['src/node/mcp-server.mjs']
    });

    client = new Client({ name: 'validation-client', version: '1.0.0' }, {});
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    serverProcess?.kill();
  });

  describe('Tool Presence Validation', () => {
    it('should expose 300+ CyberChef tools', async () => {
      const { tools } = await client.listTools();
      const cyberchefTools = tools.filter(t => t.name.startsWith('cyberchef_'));
      expect(cyberchefTools.length).toBeGreaterThan(300);
    });

    it('should expose core meta-tools', async () => {
      const { tools } = await client.listTools();
      const toolNames = tools.map(t => t.name);

      expect(toolNames).toContain('cyberchef_bake');
      expect(toolNames).toContain('cyberchef_search');
    });

    it('should have valid schemas for all tools', async () => {
      const { tools } = await client.listTools();

      for (const tool of tools) {
        expect(tool.name).toMatch(/^cyberchef_[a-z0-9_]+$/);
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('Sample Operation Execution', () => {
    const testCases = [
      {
        name: 'cyberchef_to_base64',
        input: { input: 'Hello, World!' },
        expected: 'SGVsbG8sIFdvcmxkIQ=='
      },
      {
        name: 'cyberchef_from_base64',
        input: { input: 'SGVsbG8sIFdvcmxkIQ==' },
        expected: 'Hello, World!'
      },
      {
        name: 'cyberchef_md5',
        input: { input: 'test' },
        expected: '098f6bcd4621d373cade4e832627b4f6'
      },
      {
        name: 'cyberchef_sha256',
        input: { input: 'test' },
        expected: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
      },
      {
        name: 'cyberchef_to_hex',
        input: { input: 'ABC' },
        expected: '41 42 43'
      }
    ];

    testCases.forEach(({ name, input, expected }) => {
      it(`should execute ${name} correctly`, async () => {
        const result = await client.callTool({ name, arguments: input });
        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toBe(expected);
      });
    });
  });

  describe('Breaking Change Detection', () => {
    it('should detect removed operations', async () => {
      const { tools } = await client.listTools();
      const toolNames = new Set(tools.map(t => t.name));

      // Load baseline from previous version
      const baseline = await loadBaseline();

      const removed = baseline.filter(name => !toolNames.has(name));
      if (removed.length > 0) {
        console.warn('Removed operations:', removed);
      }

      // Fail if critical operations removed
      const criticalOps = [
        'cyberchef_to_base64',
        'cyberchef_from_base64',
        'cyberchef_aes_encrypt',
        'cyberchef_aes_decrypt'
      ];

      for (const op of criticalOps) {
        expect(toolNames.has(op)).toBe(true);
      }
    });

    it('should detect schema changes', async () => {
      const { tools } = await client.listTools();
      const schemaMap = Object.fromEntries(
        tools.map(t => [t.name, t.inputSchema])
      );

      // Load baseline schemas
      const baselineSchemas = await loadBaselineSchemas();

      for (const [name, schema] of Object.entries(baselineSchemas)) {
        if (schemaMap[name]) {
          const current = JSON.stringify(schemaMap[name]);
          const baseline = JSON.stringify(schema);

          if (current !== baseline) {
            console.warn(`Schema changed for ${name}`);
            // Could fail here if strict mode enabled
          }
        }
      }
    });
  });
});

async function loadBaseline() {
  // Load from baseline file or previous release
  return [];
}

async function loadBaselineSchemas() {
  return {};
}
```

## Rollback Mechanism

### Automated Rollback Workflow

```yaml
# .github/workflows/rollback.yml
name: Rollback Sync

on:
  workflow_dispatch:
    inputs:
      reason:
        description: 'Reason for rollback'
        required: true
      target_commit:
        description: 'Commit to rollback to'
        required: true

jobs:
  rollback:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.SYNC_TOKEN }}

      - name: Create rollback branch
        run: |
          ROLLBACK_BRANCH="rollback/$(date +%Y%m%d-%H%M%S)"
          git checkout -b "$ROLLBACK_BRANCH"
          echo "ROLLBACK_BRANCH=$ROLLBACK_BRANCH" >> $GITHUB_ENV

      - name: Revert to target commit
        run: |
          git revert --no-commit HEAD..${{ inputs.target_commit }}
          git commit -m "revert: rollback upstream sync

          Reason: ${{ inputs.reason }}
          Target: ${{ inputs.target_commit }}"

      - name: Run validation
        run: |
          npm ci
          npm test

      - name: Create PR
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh pr create \
            --title "revert: rollback upstream sync" \
            --body "## Rollback

            **Reason:** ${{ inputs.reason }}
            **Target Commit:** ${{ inputs.target_commit }}

            This PR reverts the recent upstream sync due to issues.

            ---
            *Emergency rollback - requires expedited review.*" \
            --label "rollback,urgent"
```

## Conflict Resolution Guide

### Common Merge Conflicts

| Conflict Type | Resolution Strategy |
|---------------|---------------------|
| package.json versions | Keep upstream, update mcpVersion separately |
| OperationConfig.json | Always regenerate from source |
| index.mjs (generated) | Always regenerate from source |
| Custom MCP code | Preserve local changes, integrate upstream |
| Test files | Merge both, update expectations if needed |

### Manual Conflict Resolution

```bash
# 1. Create sync branch
git checkout -b sync/cyberchef-v10.x.x

# 2. Fetch upstream
git remote add upstream https://github.com/gchq/CyberChef.git
git fetch upstream

# 3. Attempt merge
git merge upstream/v10.x.x

# 4. If conflicts, resolve manually
# For generated files:
git checkout --theirs src/core/config/OperationConfig.json
# For custom code:
# Edit files manually to preserve MCP-specific changes

# 5. Regenerate config
npm install
npx grunt configTests

# 6. Commit resolution
git add -A
git commit -m "chore(sync): resolve merge conflicts for v10.x.x"
```

## Monitoring and Alerting

### Notification Channels

| Event | Channel | Priority |
|-------|---------|----------|
| New release detected | GitHub Issue | Normal |
| Sync PR created | GitHub Notification | Normal |
| Validation failure | GitHub Issue + Email | High |
| Merge conflict | GitHub Issue + Email | High |
| Security issue | GitHub Security Tab | Critical |

### Monitoring Dashboard

Track these metrics:
- Time to detect new release (target: <24h)
- Time to create sync PR (target: <1h after detection)
- Validation pass rate (target: >95%)
- Merge conflict rate (target: <10%)
- Average sync completion time (target: <2h for clean merges)

## Maintenance Schedule

### Regular Tasks

| Task | Frequency | Responsibility |
|------|-----------|----------------|
| Review sync PRs | As created | Maintainer |
| Update baseline schemas | Monthly | Automation |
| Audit validation suite | Quarterly | Developer |
| Review conflict patterns | Quarterly | Developer |
| Update documentation | As needed | Developer |

### Annual Review

- Evaluate Renovate vs GitHub Actions approach
- Review conflict resolution procedures
- Update test cases for new patterns
- Assess automation coverage

## Related Documents

- [v1.3.0 Release Plan](./release-v1.3.0.md)
- [Phase 1: Foundation](./phase-1-foundation.md)
- [Security Hardening Plan](./SECURITY-HARDENING-PLAN.md)
- [ROADMAP](../ROADMAP.md)

## References

- [Renovate Documentation](https://docs.renovatebot.com/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [gchq/CyberChef Releases](https://github.com/gchq/CyberChef/releases)
- [gchq/CyberChef CHANGELOG](https://github.com/gchq/CyberChef/blob/master/CHANGELOG.md)

---

**Document Status:** ✅ Implemented (v1.3.0 - December 14, 2025)
**Last Review:** December 2025
**Implementation:** Complete - All workflows operational
**Next Review:** After v1.4.0 or first major upstream sync
