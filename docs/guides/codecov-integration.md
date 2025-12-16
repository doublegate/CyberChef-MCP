# Codecov Integration Guide

This guide explains the comprehensive Codecov integration for the CyberChef MCP Server project, including Coverage Analytics, Bundle Analysis, and Test Analytics.

## Overview

The CyberChef MCP Server uses Codecov for three main purposes:

1. **Coverage Analytics** - Track code coverage over time and enforce minimum thresholds
2. **Bundle Analysis** - Monitor bundle size changes and detect regressions
3. **Test Analytics** - Track test performance, flaky tests, and execution time

## Prerequisites

- GitHub repository with Actions enabled
- Codecov account connected to GitHub
- `CODECOV_TOKEN` configured in GitHub Secrets (Actions)

## Configuration Files

### 1. codecov.yml

The main Codecov configuration file defines coverage thresholds, status checks, and reporting options.

**Location:** `/codecov.yml`

**Key settings:**
- **Coverage precision:** 2 decimal places
- **Project coverage target:** 70% minimum
- **Patch coverage target:** 75% minimum (higher bar for new code)
- **Coverage range:** Red below 70%, yellow 70-90%, green above 90%
- **Threshold:** Allow 1% decrease without failing

**Flags:**
- `mcp-tests` - MCP server and library tests
- `core-tests` - Core operation tests
- `node-api` - Node.js API tests

**Components:**
- `mcp-server` - MCP server implementation
- `core-operations` - CyberChef operations
- `node-api` - Node.js API wrapper

**Path exclusions:**
- Web UI (`src/web/**`)
- Vendor code (`src/core/vendor/**`)
- Legacy operations (`src/core/operations/legacy/**`)
- Test files (`tests/**`, `**/*.test.mjs`)
- Configuration files (`**/*.config.{js,mjs}`)

### 2. vitest.config.mjs

Vitest test runner configuration for coverage generation and test reporting.

**Location:** `/vitest.config.mjs`

**Coverage settings:**
- **Provider:** V8 (fast, accurate)
- **Reporters:** text, lcov, json, html
- **Reports directory:** `./coverage`
- **Thresholds:** 70% lines, 70% functions, 65% branches, 70% statements

**Test reporting:**
- **Reporters:** default, junit
- **JUnit output:** `./test-results/junit.xml`

### 3. GitHub Actions Workflow

CI/CD workflow that uploads coverage and test results to Codecov.

**Location:** `.github/workflows/core-ci.yml`

**Codecov integration steps:**

1. **MCP Tests with Coverage** - Run tests and generate coverage reports
   ```bash
   npm run test:coverage
   ```

2. **Upload Coverage to Codecov** - Upload coverage data
   ```yaml
   - uses: codecov/codecov-action@v5
     with:
       token: ${{ secrets.CODECOV_TOKEN }}
       files: ./coverage/lcov.info
       flags: mcp-tests
       name: codecov-mcp-coverage
   ```

3. **Upload Test Results to Codecov** - Upload JUnit XML for Test Analytics
   ```yaml
   - uses: codecov/test-results-action@v1
     with:
       token: ${{ secrets.CODECOV_TOKEN }}
       files: ./test-results/junit.xml
       flags: mcp-tests
       name: codecov-test-results
   ```

4. **Build Production Bundle** - Trigger bundle analysis
   ```yaml
   - name: Build Production Bundle
     env:
       CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
     run: npm run build
   ```

### 4. Gruntfile.js

Webpack configuration with Codecov bundle analysis plugin.

**Location:** `/Gruntfile.js`

**Bundle analysis configuration:**
```javascript
codecovWebpackPlugin({
  enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
  bundleName: "cyberchef-mcp-bundle",
  uploadToken: process.env.CODECOV_TOKEN,
  gitService: "github",
  dryRun: process.env.CODECOV_TOKEN === undefined,
})
```

**Behavior:**
- Enabled only when `CODECOV_TOKEN` is set (CI environment)
- Dry run mode for local development
- Uploads bundle stats to Codecov automatically during production build

## Local Development

### Running Tests with Coverage

Generate coverage reports locally:

```bash
npm run test:coverage
```

**Outputs:**
- `coverage/lcov.info` - LCOV format for Codecov
- `coverage/coverage-final.json` - JSON format
- `coverage/index.html` - HTML report (open in browser)
- `test-results/junit.xml` - JUnit XML test results

### Viewing Coverage Reports

Open the HTML coverage report:

```bash
# Linux
xdg-open coverage/index.html

# macOS
open coverage/index.html

# Windows
start coverage/index.html
```

### Building with Bundle Analysis

Build production bundle (triggers bundle analysis in CI):

```bash
npm run build
```

**Local behavior:**
- Bundle analysis runs in dry-run mode (no upload)
- Webpack Bundle Analyzer generates `build/prod/BundleAnalyzerReport.html`

## CI/CD Workflow

### Automatic Uploads

Coverage, test results, and bundle analysis are automatically uploaded to Codecov when:

1. **Code is pushed to master** - Full CI run with all analytics
2. **Pull requests are created** - Coverage diff and bundle size comparison
3. **Tags are pushed** - Release builds include all metrics

### Status Checks

Codecov provides status checks on pull requests:

- **Project Coverage** - Overall project coverage vs. target (70%)
- **Patch Coverage** - Coverage of changed lines vs. target (75%)
- **Bundle Size** - Bundle size change vs. base branch

### PR Comments

Codecov automatically comments on pull requests with:

- Coverage summary (project and patch)
- Files with coverage changes
- Coverage trends
- Bundle size changes

## Codecov Dashboard

### Viewing Reports

Visit the Codecov dashboard for comprehensive analytics:

- **Coverage trends** - Historical coverage data
- **File browser** - Line-by-line coverage visualization
- **Pull requests** - Coverage impact of PRs
- **Flags** - Coverage by test type (mcp-tests, core-tests, node-api)
- **Components** - Coverage by component (mcp-server, core-operations, node-api)
- **Bundle analysis** - Bundle size trends and composition
- **Test analytics** - Test performance, flaky tests, slowest tests

### Understanding Coverage Metrics

- **Lines** - Percentage of executed lines
- **Functions** - Percentage of called functions
- **Branches** - Percentage of executed conditional branches
- **Statements** - Percentage of executed statements

## Troubleshooting

### Coverage Not Uploaded

**Problem:** Coverage reports not appearing in Codecov

**Solutions:**
1. Verify `CODECOV_TOKEN` is set in GitHub Secrets
2. Check workflow logs for upload errors
3. Verify coverage files exist (`coverage/lcov.info`)
4. Ensure workflow uses `codecov/codecov-action@v5`

### Coverage Thresholds Failing

**Problem:** CI fails due to coverage below thresholds

**Solutions:**
1. Add tests to increase coverage
2. Adjust thresholds in `vitest.config.mjs` (not recommended)
3. Exclude files from coverage in `vitest.config.mjs` (use sparingly)

### Bundle Analysis Not Working

**Problem:** Bundle size data not appearing in Codecov

**Solutions:**
1. Verify `CODECOV_TOKEN` is available during build step
2. Check Gruntfile.js for correct plugin configuration
3. Ensure production build is triggered in workflow
4. Verify webpack build completes successfully

### Test Analytics Missing

**Problem:** Test results not appearing in Codecov

**Solutions:**
1. Verify JUnit XML file is generated (`test-results/junit.xml`)
2. Check workflow uses `codecov/test-results-action@v1`
3. Ensure tests run before upload step
4. Verify `if: always()` condition on upload step

## Environment Variables

### CODECOV_TOKEN

**Purpose:** Authentication token for Codecov uploads

**Configuration:**
- **GitHub Actions:** Set in repository secrets (Settings → Secrets → Actions)
- **Local development:** Not required (dry-run mode)

**Security:**
- Never commit token to repository
- Never log token in CI output
- Rotate token if compromised

## Best Practices

### Coverage

1. **Write tests first** - TDD approach ensures high coverage
2. **Focus on critical paths** - Prioritize coverage of core functionality
3. **Avoid coverage gaming** - Don't write tests just to hit numbers
4. **Review uncovered lines** - Understand why code isn't tested

### Bundle Analysis

1. **Monitor trends** - Watch for unexpected size increases
2. **Review large changes** - Investigate PRs with significant bundle growth
3. **Optimize dependencies** - Remove unused or replace large dependencies
4. **Code splitting** - Split large bundles into smaller chunks

### Test Analytics

1. **Fix flaky tests** - Unstable tests reduce confidence
2. **Optimize slow tests** - Improve CI performance
3. **Track trends** - Monitor test suite health over time
4. **Investigate failures** - Understand test failure patterns

## Related Documentation

- [Codecov Documentation](https://docs.codecov.com)
- [Codecov YAML Reference](https://docs.codecov.com/docs/codecov-yaml)
- [GitHub Actions Integration](https://docs.codecov.com/docs/github-actions)
- [Bundle Analysis](https://docs.codecov.com/docs/javascript-bundle-analysis)
- [Test Analytics](https://docs.codecov.com/docs/test-analytics)

## Support

For issues with Codecov integration:

1. Check [Codecov Support](https://docs.codecov.com/docs/support)
2. Review [GitHub Actions logs](../../.github/workflows/core-ci.yml)
3. Verify configuration files are valid
4. Contact Codecov support for platform issues
