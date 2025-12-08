# Security Maintenance Guide

This document provides guidance for maintaining the security posture of the CyberChef-MCP project.

## Regular Security Audits

### Frequency
Run security audits at least:
- **Quarterly** for routine maintenance
- **Immediately** when new vulnerabilities are announced
- **Before each major release**

### Commands

```bash
# Check for vulnerabilities
npm audit

# Get detailed JSON report
npm audit --json

# Apply safe automatic fixes
npm audit fix

# See what force fixes would do (review before applying)
npm audit fix --force --dry-run
```

## NPM Overrides

The project uses npm overrides to enforce minimum secure versions for nested dependencies.

### Current Overrides

Located in `package.json`:

```json
"overrides": {
  "ws": ">=5.2.4",
  "js-yaml": ">=4.1.1", 
  "serialize-javascript": ">=6.0.2"
}
```

### When to Update Overrides

1. **New Vulnerability Discovered:** Update the minimum version to the first secure version
2. **Breaking Changes:** Test thoroughly before updating major version constraints
3. **Deprecated Package:** Consider replacing the entire dependency chain if possible

### How to Add New Override

```bash
# 1. Identify the vulnerable nested dependency
npm ls <package-name>

# 2. Find the first secure version
npm view <package-name> versions

# 3. Add to package.json overrides
"overrides": {
  "<package-name>": ">=<secure-version>"
}

# 4. Install and test
npm install
npm test
npx grunt configTests
```

## Development-Only Vulnerabilities

Some vulnerabilities cannot be fixed because:
- Package is unmaintained (e.g., babel-plugin-transform-builtin-extend)
- Latest version still has the issue (e.g., grunt-chmod with shelljs)
- Fixing would require major breaking changes

### Decision Criteria for Accepting Risk

Accept the risk if ALL of these are true:
- ✅ Affects development dependencies only
- ✅ Not used in production runtime
- ✅ Runs in controlled/sandboxed environment
- ✅ Does not process untrusted input
- ✅ Documented with mitigation strategy

### Tracking Unfixable Issues

Document in `SECURITY_AUDIT.md`:
1. Detailed vulnerability description
2. Why no fix is available
3. Mitigation strategies
4. Monitoring plan for updates

## Critical Security Updates

### High Priority Packages

These packages are critical for production MCP server security:

1. **@modelcontextprotocol/sdk** - Core MCP protocol implementation
2. **crypto-js** - Cryptographic operations
3. **jsonwebtoken** - Authentication tokens
4. **node-forge** - Cryptographic operations
5. **zod** - Input validation

### Update Process for Critical Packages

```bash
# 1. Check current version
npm ls <package-name>

# 2. Check for security advisories
npm audit | grep <package-name>

# 3. Check for updates
npm outdated <package-name>

# 4. Update to specific version
npm install <package-name>@<version>

# 5. Run comprehensive tests
npm run postinstall
npx grunt configTests
npm test
node src/node/mcp-server.mjs # Test MCP server starts

# 6. Document in SECURITY_AUDIT.md
```

## Dependency Update Strategy

### Patch Updates (x.y.Z)
- **Risk:** Very low
- **Frequency:** Apply immediately
- **Testing:** Basic smoke tests

### Minor Updates (x.Y.z)
- **Risk:** Low
- **Frequency:** Monthly review
- **Testing:** Full test suite

### Major Updates (X.y.z)
- **Risk:** High (breaking changes)
- **Frequency:** Per-release basis
- **Testing:** Comprehensive testing + manual verification

## Automated Security Scanning

### GitHub Dependabot

Dependabot automatically:
- Scans for vulnerabilities daily
- Creates PRs for security updates
- Provides vulnerability severity and details

**Configuration:** `.github/dependabot.yml` (if exists)

### npm audit in CI/CD

Add to GitHub Actions workflow:

```yaml
- name: Security Audit
  run: npm audit --audit-level=moderate
```

This will fail CI if moderate or higher vulnerabilities are found.

## Security Advisory Sources

Monitor these sources for security updates:

1. **GitHub Security Advisories**
   - https://github.com/advisories

2. **npm Security Advisories**
   - https://www.npmjs.com/advisories

3. **Snyk Vulnerability Database**
   - https://snyk.io/vuln/

4. **CVE Database**
   - https://cve.mitre.org/

## Emergency Response Plan

### Critical Vulnerability Discovered

1. **Assess Impact**
   - Is it in production dependencies?
   - Is it exploitable in our use case?
   - What's the CVSS score?

2. **Immediate Actions**
   - If HIGH or CRITICAL and exploitable:
     - Create hotfix branch
     - Apply security update
     - Deploy immediately
   
3. **Follow-up**
   - Update SECURITY_AUDIT.md
   - Add to override if needed
   - Notify team/users if necessary

## Testing Security Updates

### Minimum Test Requirements

```bash
# 1. Install dependencies
npm install --ignore-scripts
npm run postinstall

# 2. Build/Config generation
npx grunt configTests

# 3. Unit tests (if available)
npm test

# 4. MCP Server startup
timeout 5 node src/node/mcp-server.mjs
# Should print "CyberChef MCP Server running on stdio"

# 5. Check for new vulnerabilities
npm audit
```

### Extended Testing

For major updates:
- Test all MCP tools/operations
- Verify Docker build works
- Test integration with MCP clients
- Performance regression testing

## Documentation Updates

After any security update:

1. **Update SECURITY_AUDIT.md**
   - Add fixed vulnerabilities
   - Update current state summary
   - Update date

2. **Update this file if needed**
   - New overrides
   - Changed procedures
   - New critical packages

3. **Update CHANGELOG.md** (if exists)
   - Security fixes section
   - Breaking changes if any

## Quarterly Security Review Checklist

Use this checklist for regular maintenance:

- [ ] Run `npm outdated` to check for available updates
- [ ] Run `npm audit` to check for new vulnerabilities
- [ ] Review GitHub security alerts
- [ ] Check for updates to critical packages
- [ ] Review and update npm overrides if needed
- [ ] Test updates in development environment
- [ ] Update SECURITY_AUDIT.md
- [ ] Consider migrating away from unmaintained packages
- [ ] Review CI/CD security scanning configuration

## Best Practices

1. **Never ignore security warnings** without understanding and documenting them
2. **Test security updates** before deploying to production
3. **Pin versions** in package-lock.json, use ranges in package.json
4. **Document decisions** especially when accepting security risks
5. **Automate where possible** but always verify automated fixes
6. **Keep dependencies minimal** - fewer dependencies = smaller attack surface
7. **Monitor regularly** - security is an ongoing process

## Getting Help

If you need help with security issues:

1. **Check existing documentation**
   - SECURITY_AUDIT.md
   - This file
   - npm advisory details

2. **Research the vulnerability**
   - Read the GitHub advisory
   - Check if others have similar issues
   - Review package changelogs

3. **Ask for help**
   - Open a GitHub issue
   - Tag as `security`
   - Provide context and details

---

**Last Updated:** December 8, 2025  
**Next Review Due:** March 8, 2026  
**Maintained By:** Project maintainers
