# Codecov Integration Verification Guide

This guide provides step-by-step verification commands to confirm the Codecov integration is working correctly.

## Prerequisites

Ensure you have completed the following:
- [x] Node.js 22+ installed
- [x] npm dependencies installed (`npm install`)
- [x] @vitest/coverage-v8 installed
- [x] Project configuration files in place

## Local Verification

### Step 1: Validate Configuration Files

**Validate codecov.yml:**
```bash
curl -X POST --data-binary @codecov.yml https://codecov.io/validate
```
Expected output: `Valid!`

**Validate GitHub workflow:**
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/core-ci.yml')); print('Valid YAML')"
```
Expected output: `Valid YAML`

### Step 2: Generate Coverage Reports

**Run tests with coverage:**
```bash
npm run test:coverage
```

Expected behavior:
- Tests execute successfully
- Coverage summary displayed in console
- Coverage reports generated in `coverage/` directory
- Test results generated in `test-results/` directory

**Verify generated files:**
```bash
# Check coverage directory
ls -lah coverage/
# Expected files:
# - lcov.info (LCOV format for Codecov)
# - coverage-final.json (JSON format)
# - index.html (HTML report)
# - lcov-report/ (detailed HTML reports)

# Check test results directory
ls -lah test-results/
# Expected files:
# - junit.xml (JUnit XML for Test Analytics)
```

### Step 3: Verify Coverage Report Formats

**Verify LCOV format:**
```bash
head -20 coverage/lcov.info
```
Expected output: Lines starting with `TN:`, `SF:`, `FN:`, `DA:`

**Verify JUnit XML format:**
```bash
head -30 test-results/junit.xml
```
Expected output: Valid XML with `<testsuites>`, `<testsuite>`, `<testcase>` elements

### Step 4: View Coverage Reports

**Open HTML coverage report:**
```bash
# Linux
xdg-open coverage/index.html

# macOS
open coverage/index.html

# Windows
start coverage/index.html
```

Expected behavior: Browser opens with interactive coverage report showing:
- Overall coverage percentages
- File-by-file coverage breakdown
- Line-by-line coverage highlighting

### Step 5: Test Bundle Analysis (Local)

**Build production bundle:**
```bash
npm run build
```

Expected behavior:
- Webpack builds successfully
- Bundle Analyzer Report generated
- Codecov plugin runs in dry-run mode (no upload without token)

**View bundle analysis report:**
```bash
# Linux
xdg-open build/prod/BundleAnalyzerReport.html

# macOS
open build/prod/BundleAnalyzerReport.html

# Windows
start build/prod/BundleAnalyzerReport.html
```

Expected behavior: Browser shows interactive bundle visualization

## CI/CD Verification

### Step 1: Verify GitHub Secrets

**Check that CODECOV_TOKEN is configured:**
1. Go to repository Settings > Secrets > Actions
2. Verify `CODECOV_TOKEN` exists

Expected: Secret is present (value is hidden)

### Step 2: Trigger Workflow

**Push to master or create PR:**
```bash
git add .
git commit -m "chore: add Codecov integration"
git push origin master
```

**Or manually trigger workflow:**
1. Go to Actions tab in GitHub
2. Select "Core Logic CI" workflow
3. Click "Run workflow"

### Step 3: Monitor Workflow Execution

**Check workflow logs:**
1. Go to Actions tab
2. Click on latest workflow run
3. Expand each step to view logs

Expected successful steps:
- [x] Install dependencies
- [x] Lint
- [x] Config Tests
- [x] Unit Tests
- [x] MCP Tests with Coverage
- [x] Upload Coverage to Codecov
- [x] Upload Test Results to Codecov
- [x] Build Production Bundle

### Step 4: Verify Codecov Uploads

**Check coverage upload logs:**
Look for output like:
```
[info] Uploading...
[info] {"status":"success","resultURL":"https://codecov.io/..."}
```

**Check test results upload logs:**
Look for output like:
```
Uploading test results...
Upload successful
```

**Check bundle analysis logs:**
Look for output from webpack build:
```
Codecov Bundle Analysis Plugin
Uploading bundle stats...
```

## Codecov Dashboard Verification

### Step 1: Access Codecov Dashboard

**Visit Codecov:**
https://codecov.io/gh/doublegate/CyberChef-MCP

Expected: Dashboard loads showing repository overview

### Step 2: Verify Coverage Analytics

**Check coverage metrics:**
1. View overall coverage percentage
2. Check coverage trend graph
3. Verify flags (mcp-tests, core-tests, node-api)
4. Check component coverage (mcp-server, core-operations, node-api)

Expected: Coverage data is present and matches local reports

### Step 3: Verify Bundle Analysis

**Check bundle data:**
1. Navigate to "Bundle Analysis" tab
2. View bundle size over time
3. Check bundle composition

Expected: Bundle size data is present for recent builds

### Step 4: Verify Test Analytics

**Check test results:**
1. Navigate to "Test Analytics" tab
2. View test execution results
3. Check test performance metrics

Expected: Test results are present with execution times

### Step 5: Verify PR Comments

**Create a test PR:**
1. Create a branch with changes
2. Open a pull request
3. Wait for CI to complete

Expected: Codecov bot comments on PR with:
- Coverage comparison (base vs. head)
- Patch coverage
- Files with coverage changes
- Bundle size changes (if applicable)

## Troubleshooting

### Issue: Coverage reports not generated

**Symptoms:**
- `coverage/` directory is empty or missing
- `test-results/` directory is empty or missing

**Solutions:**
1. Verify @vitest/coverage-v8 is installed:
   ```bash
   npm list @vitest/coverage-v8
   ```
2. Reinstall if missing:
   ```bash
   npm install @vitest/coverage-v8 --save-dev
   ```
3. Run tests again:
   ```bash
   npm run test:coverage
   ```

### Issue: Codecov upload fails in CI

**Symptoms:**
- Workflow step "Upload Coverage to Codecov" fails
- Error: "Missing repository token"

**Solutions:**
1. Verify CODECOV_TOKEN is set in GitHub Secrets
2. Check token permissions in Codecov dashboard
3. Regenerate token if necessary

### Issue: Coverage thresholds failing

**Symptoms:**
- Tests pass but coverage command exits with error
- Error: "Coverage for X does not meet threshold Y"

**Solutions:**
1. This is expected if coverage is below thresholds
2. Add tests to increase coverage
3. Temporarily adjust thresholds in `vitest.config.mjs` (not recommended)

### Issue: Bundle analysis not appearing in Codecov

**Symptoms:**
- Bundle Analysis tab is empty in Codecov
- No bundle size data in PR comments

**Solutions:**
1. Verify CODECOV_TOKEN is available during build step in workflow
2. Check webpack build logs for plugin errors
3. Ensure production build completes successfully

### Issue: Test Analytics not populated

**Symptoms:**
- Test Analytics tab is empty
- No test results in Codecov

**Solutions:**
1. Verify junit.xml is generated in test-results/
2. Check test results upload step in workflow logs
3. Ensure `codecov/test-results-action@v1` is used

## Success Checklist

Use this checklist to verify complete integration:

### Local Verification
- [ ] codecov.yml validates successfully
- [ ] GitHub workflow YAML is valid
- [ ] `npm run test:coverage` executes without errors
- [ ] coverage/lcov.info is generated
- [ ] test-results/junit.xml is generated
- [ ] HTML coverage report opens in browser
- [ ] Bundle Analyzer Report is generated

### CI/CD Verification
- [ ] CODECOV_TOKEN secret is configured
- [ ] Workflow runs without errors
- [ ] Coverage upload step succeeds
- [ ] Test results upload step succeeds
- [ ] Bundle analysis upload succeeds

### Codecov Dashboard Verification
- [ ] Coverage data appears in dashboard
- [ ] Coverage trends are visible
- [ ] Flags are populated (mcp-tests, etc.)
- [ ] Components are tracked
- [ ] Bundle analysis data is present
- [ ] Test analytics are populated
- [ ] PR comments include coverage diff

## Additional Resources

- [Codecov Integration Guide](docs/guides/codecov-integration.md)
- [Codecov Documentation](https://docs.codecov.com)
- [GitHub Actions Workflow](.github/workflows/core-ci.yml)
- [Configuration Files](codecov.yml, vitest.config.mjs)

## Support

If you encounter issues not covered in this guide:
1. Check the [troubleshooting section](docs/guides/codecov-integration.md#troubleshooting)
2. Review [Codecov support docs](https://docs.codecov.com/docs/support)
3. Check GitHub Actions workflow logs
4. Verify configuration files are valid
