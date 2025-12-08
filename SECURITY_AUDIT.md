# Security Audit Report

**Date:** December 8, 2025  
**Project:** CyberChef-MCP  
**Version:** 10.19.4  

## Summary

This document details the security vulnerabilities addressed in this project and documents the remaining issues with their mitigation strategies.

### Initial State
- **Total Vulnerabilities:** 21 (3 low, 9 moderate, 5 high, 4 critical)

### Current State
- **Total Vulnerabilities:** 5 (1 moderate, 1 high, 3 critical)
- **Vulnerabilities Fixed:** 16 (76% reduction)

## Fixed Vulnerabilities

### Phase 1: Automatic Fixes (8 vulnerabilities)

#### 1. @babel/helpers - Moderate
- **Issue:** RegExp complexity in generated code with .replace
- **Advisory:** [GHSA-968p-4wvh-cqc8](https://github.com/advisories/GHSA-968p-4wvh-cqc8)
- **Fix:** Updated to 7.28.4

#### 2. @babel/runtime - Moderate
- **Issue:** RegExp complexity in generated code with .replace
- **Advisory:** [GHSA-968p-4wvh-cqc8](https://github.com/advisories/GHSA-968p-4wvh-cqc8)
- **Fix:** Updated to 7.28.4

#### 3. @eslint/plugin-kit - Low
- **Issue:** Regular Expression Denial of Service (ReDoS) through ConfigCommentParser
- **Advisory:** [GHSA-xffm-g5w8-qvg7](https://github.com/advisories/GHSA-xffm-g5w8-qvg7)
- **Fix:** Updated to 0.4.1

#### 4. eslint - Indirect
- **Issue:** Indirect fix via @eslint/plugin-kit update
- **Fix:** Updated to 9.39.1

#### 5. @modelcontextprotocol/sdk - High
- **Issue:** DNS rebinding protection not enabled by default
- **Advisory:** [GHSA-w48q-cv73-mx4w](https://github.com/advisories/GHSA-w48q-cv73-mx4w)
- **Fix:** Updated to 1.24.3
- **Impact:** Critical for MCP server security

#### 6. body-parser - Moderate
- **Issue:** Denial of service when URL encoding is used
- **Advisory:** [GHSA-wqch-xfxh-vrr4](https://github.com/advisories/GHSA-wqch-xfxh-vrr4)
- **Fix:** Updated to 2.2.1 (via @modelcontextprotocol/sdk)

#### 7. brace-expansion - Moderate
- **Issue:** Regular Expression Denial of Service vulnerability
- **Advisory:** [GHSA-v6h2-p8h4-qcjw](https://github.com/advisories/GHSA-v6h2-p8h4-qcjw)
- **Fix:** Updated to 1.1.12/2.0.2

#### 8. jws - High
- **Issue:** Improper HMAC signature verification
- **Advisory:** [GHSA-869p-cjfg-cm3x](https://github.com/advisories/GHSA-869p-cjfg-cm3x)
- **Fix:** Updated to 3.2.3

### Phase 2: Manual Updates and Overrides (8 vulnerabilities)

#### 9-10. crypto-js and fernet - Critical
- **Issue:** crypto-js PBKDF2 1,000x weaker than 1993 standard and insecure random numbers
- **Advisories:** 
  - [GHSA-xwcq-pm8m-c4vf](https://github.com/advisories/GHSA-xwcq-pm8m-c4vf)
  - [GHSA-3w3w-pxmm-2w2j](https://github.com/advisories/GHSA-3w3w-pxmm-2w2j)
- **Fix:** Downgraded fernet from 0.4.0 to 0.3.3 (uses crypto-js 4.2.0)

#### 11. ws - High
- **Issue:** DoS vulnerability when handling requests with many HTTP headers
- **Advisory:** [GHSA-3h5v-q93c-6h6q](https://github.com/advisories/GHSA-3h5v-q93c-6h6q)
- **Fix:** Applied npm override to enforce minimum version >=5.2.4 (updated to 8.18.3)
- **Path:** grunt-contrib-connect → node-http2 → websocket-stream → ws
- **Note:** The override ensures minimum security baseline; npm installed secure version 8.18.3

#### 12-13. js-yaml - Moderate
- **Issue:** Prototype pollution in merge (<<) operator
- **Advisory:** [GHSA-mh29-5h37-fv8m](https://github.com/advisories/GHSA-mh29-5h37-fv8m)
- **Fix:** Applied npm override to enforce minimum version >=4.1.1 (confirmed at 4.1.1)
- **Paths:** 
  - nightwatch → mocha → js-yaml
  - postcss-loader → cosmiconfig → js-yaml
- **Note:** The override ensures the secure version 4.1.1 is used consistently

#### 14-15. serialize-javascript - Moderate
- **Issue:** Cross-site Scripting (XSS) vulnerability
- **Advisory:** [GHSA-76p7-773f-r4q5](https://github.com/advisories/GHSA-76p7-773f-r4q5)
- **Fix:** Applied npm override to enforce minimum version >=6.0.2 (updated to 7.0.2)
- **Path:** nightwatch → mocha → serialize-javascript
- **Note:** The override ensures minimum security baseline; npm installed secure version 7.0.2

## Remaining Vulnerabilities

### 1. babel-traverse - Single Vulnerability Affecting 3 Packages

**Vulnerability:** GHSA-67hx-6x53-jw92  
**Issue:** Arbitrary code execution when compiling crafted malicious code  
**Advisory:** [GHSA-67hx-6x53-jw92](https://github.com/advisories/GHSA-67hx-6x53-jw92)  
**CVSS Score:** 9.4 (Critical)  
**Affected Packages:** babel-traverse, babel-template, babel-plugin-transform-builtin-extend

#### Why No Fix Available
- `babel-plugin-transform-builtin-extend` is a legacy Babel 6 plugin
- Package has not been maintained or updated to Babel 7+
- The vulnerable `babel-traverse` is a core dependency at the root of the chain

#### Dependency Chain
```
babel-plugin-transform-builtin-extend (1.1.2) [CRITICAL]
  └─ babel-template (*) [CRITICAL - transitive]
      └─ babel-traverse (*) [CRITICAL - source vulnerability]
```

**Note:** npm audit counts this as 3 separate critical findings (one per affected package in the chain), but it represents a single underlying vulnerability in babel-traverse that propagates through the dependency tree.

#### Usage in Project
- **Scope:** Development dependency only
- **Purpose:** Used in legacy Babel configuration
- **Runtime Impact:** None (not used in production MCP server)

#### Mitigation Strategy
1. **Limited Exposure:** The vulnerability requires compiling specifically crafted malicious code
2. **Development Only:** Package is only used during development builds
3. **Trusted Source Code:** All code compiled is from trusted sources in this repository
4. **No User Input:** The build process does not compile user-provided code
5. **Sandboxed Environment:** Build processes run in controlled CI/CD environments

#### Recommended Actions
- Monitor for package updates or replacement plugins
- Consider removing if not actively used in builds
- Evaluate migration to Babel 7+ configuration
- Review Gruntfile.js and webpack.config.js to confirm necessity

### 2. shelljs (1 high vulnerability with 2 CVEs)

**Package:** grunt-chmod  
**Severity:** High (reported as 1 vulnerability affecting shelljs package)  
**Issues:**
- Improper Privilege Management (CVE-2022-0144)
- Improper Privilege Management (CVE-2023-27282)

**Advisories:**
- [GHSA-64g7-mvw6-v9qj](https://github.com/advisories/GHSA-64g7-mvw6-v9qj)
- [GHSA-4rq4-32rv-6wp6](https://github.com/advisories/GHSA-4rq4-32rv-6wp6)

#### Why No Fix Available
- Latest version of `grunt-chmod` (1.1.1) still depends on vulnerable shelljs 0.5.3
- The shelljs vulnerability affects versions <=0.8.4
- Package maintainer has not updated dependency

#### Dependency Chain
```
grunt-chmod (1.1.1)
  └─ shelljs (0.5.3) [VULNERABLE]
```

#### Usage in Project
- **Scope:** Development dependency only
- **Purpose:** Sets file permissions (chmod 755) on build artifacts
- **Location:** Used in Gruntfile.js "prod" task
- **File:** Sets permissions on `build/**/*` directory

#### Mitigation Strategy
1. **Non-Production:** Only used during build process, never in production
2. **Limited Scope:** Only modifies permissions on local build artifacts
3. **No Network Exposure:** Does not involve network operations
4. **Controlled Environment:** Runs in trusted development/CI environments
5. **No Untrusted Input:** Does not process user-supplied paths or commands

#### Recommended Actions
- Consider replacing grunt-chmod with native Node.js `fs.chmod()` or shell commands
- The build task could use: `node -e "require('fs').chmodSync('build', '755')"`
- Alternative: Use npm scripts with platform-specific chmod commands
- Monitor grunt-chmod for dependency updates

## Security Best Practices Implemented

### 1. Dependency Pinning
- All direct dependencies use caret (^) ranges for minor/patch updates
- Critical security updates applied via package-lock.json

### 2. npm Overrides
Added to package.json to enforce secure versions of nested dependencies:
```json
"overrides": {
  "ws": ">=5.2.4",
  "js-yaml": ">=4.1.1",
  "serialize-javascript": ">=6.0.2"
}
```

### 3. Regular Audits
- Run `npm audit` regularly to identify new vulnerabilities
- Review and apply security patches promptly
- Document rationale for unfixed vulnerabilities

### 4. Build Security
- Use `--ignore-scripts` when appropriate to prevent malicious scripts
- Run postinstall scripts explicitly after verification
- Sandbox build environments

## Testing Performed

All fixes were validated with:
1. ✅ npm install --ignore-scripts (no errors)
2. ✅ npm run postinstall (crypto-api, snackbar, jimp fixes applied)
3. ✅ npx grunt configTests (config generation successful)
4. ✅ Build verification (all modules compiled successfully)

## Recommendations

### Short Term
1. ✅ Apply all available security updates (completed)
2. ✅ Document remaining vulnerabilities (this document)
3. ✅ Test build and runtime functionality (completed)

### Medium Term
1. Evaluate necessity of `babel-plugin-transform-builtin-extend`
2. Replace `grunt-chmod` with native Node.js solution
3. Consider upgrading to Babel 7+ configuration
4. Set up automated security scanning in CI/CD

### Long Term
1. Regular dependency audits (quarterly)
2. Establish security update policy
3. Monitor advisories for remaining vulnerabilities
4. Plan migration away from legacy build tools

## Conclusion

This security audit successfully addressed **76% of identified vulnerabilities** (16 out of 21), reducing the project from a high-risk state to a manageable security posture. The remaining 5 npm audit findings represent 2 distinct vulnerabilities:

1. **babel-traverse vulnerability (GHSA-67hx-6x53-jw92)** - 1 critical vulnerability affecting 3 packages:
   - babel-traverse (source)
   - babel-template (transitive)
   - babel-plugin-transform-builtin-extend (transitive)
   - **Mitigation:** Development only, controlled build environment, no untrusted code compilation

2. **shelljs vulnerabilities (2 CVEs)** - 1 high vulnerability with 2 CVEs affecting 2 packages:
   - shelljs (source, CVE-2022-0144 and CVE-2023-27282)
   - grunt-chmod (transitive, moderate)
   - **Mitigation:** Development only, limited scope, no network exposure

All remaining vulnerabilities are in development dependencies and do not affect the production MCP server runtime. The documented mitigation strategies provide adequate protection for the current risk profile.

**Risk Assessment:** Low (for production MCP server deployment)  
**Action Required:** Monitor for updates to affected packages

---

*For questions or concerns about this security audit, please open an issue on the GitHub repository.*
