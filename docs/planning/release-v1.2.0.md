# Release Plan: v1.2.0 - Security Hardening

**Release Date:** January 2026 (Target: Week of Jan 27)
**Theme:** Security Hardening & CI/CD Enhancement
**Phase:** Phase 1 - Foundation
**Effort:** L (2 weeks)
**Risk Level:** Medium

## Overview

Establish production-ready security posture by migrating to Docker Hardened Images (DHI), implementing non-root execution, adding comprehensive security scanning, and enhancing CI/CD pipelines. This release addresses the critical security gaps preventing production deployment.

## Goals

1. **Primary Goal**: Reduce container vulnerabilities by 90%+ through DHI migration
2. **Secondary Goal**: Implement automated security scanning in CI/CD
3. **Tertiary Goal**: Achieve security best practices compliance (CIS Docker Benchmark)

## Success Criteria

- [ ] Container image has <10 known CVEs (target: 0)
- [ ] Security scan passes in CI/CD pipeline
- [ ] Container runs as non-root user
- [ ] Read-only filesystem where possible
- [ ] All security tests pass
- [ ] Documentation updated with security best practices

## Features & Improvements

### 1. Docker Hardened Images (DHI) Migration
**Priority:** P0 (Critical)
**Effort:** M (5 days)

Migrate from `node:22-alpine` to Docker's official Hardened Node.js image, reducing vulnerabilities by up to 95%.

**Implementation:**
```dockerfile
# Before
FROM node:22-alpine

# After
FROM docker.io/library/node:22-hardened
```

**Tasks:**
- Research Docker DHI availability for Node.js 22
- Update Dockerfile.mcp with DHI base image
- Test all operations still function correctly
- Update documentation with DHI benefits
- Benchmark image size changes

**Acceptance Criteria:**
- Image builds successfully
- All 300+ operations pass tests
- Vulnerability count reduced by 90%+
- Image size remains reasonable (<500MB)

**GitHub Issue Template:**
```markdown
## Feature: Migrate to Docker Hardened Images

### Description
Migrate Dockerfile.mcp from node:22-alpine to Docker Hardened Images (DHI) to reduce container vulnerabilities by 95%.

### Background
Docker launched DHI in June 2025, providing distroless-based images with automatic patching. Internal testing shows 98% reduction in installed packages and elimination of known CVEs.

### Tasks
- [ ] Research DHI availability for Node.js 22
- [ ] Update Dockerfile.mcp with DHI base
- [ ] Run full test suite on new image
- [ ] Benchmark vulnerability count (before/after)
- [ ] Document migration in release notes

### Success Criteria
- Container has <10 CVEs (target: 0)
- All tests pass
- Image builds in CI/CD

### References
- https://www.infoq.com/news/2025/06/docker-hardened-images/
```

---

### 2. Non-Root User Execution
**Priority:** P0 (Critical)
**Effort:** S (2 days)

Run MCP server as dedicated non-root user following principle of least privilege.

**Implementation:**
```dockerfile
# Create dedicated user
RUN addgroup -g 1001 -S cyberchef && \
    adduser -u 1001 -S cyberchef -G cyberchef

# Switch to non-root user
USER cyberchef
```

**Tasks:**
- Create dedicated user/group in Dockerfile
- Update file permissions for app directory
- Test server functionality as non-root
- Verify no permission errors in logs
- Document security rationale

**Acceptance Criteria:**
- Server runs as UID 1001 (not root)
- All operations function correctly
- No permission errors in runtime
- Security scan confirms non-root execution

**GitHub Issue Template:**
```markdown
## Security: Implement Non-Root User Execution

### Description
Configure Docker container to run MCP server as non-root user (UID 1001) following security best practices.

### Rationale
Running as root increases risk if attacker achieves command injection or container escape. Non-root execution limits potential damage.

### Implementation
1. Add user/group creation to Dockerfile
2. Set file ownership to new user
3. Add USER directive before ENTRYPOINT
4. Test all operations

### Verification
- `docker inspect` shows User=1001
- No permission errors in logs
- Security scan passes

### References
- OWASP NodeJS Docker Cheat Sheet
```

---

### 3. Security Scanning in CI/CD
**Priority:** P0 (Critical)
**Effort:** M (4 days)

Integrate automated security scanning (Trivy) into GitHub Actions workflows to catch vulnerabilities before release.

**Implementation:**
```yaml
- name: Security Scan with Trivy
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: 'cyberchef-mcp:latest'
    format: 'sarif'
    severity: 'CRITICAL,HIGH'
    exit-code: '1'  # Fail build on findings
```

**Tasks:**
- Add Trivy scan step to mcp-docker-build.yml
- Configure severity thresholds (CRITICAL, HIGH fail build)
- Upload results to GitHub Security tab (SARIF format)
- Add badge to README showing scan status
- Create workflow for scheduled scans (weekly)

**Acceptance Criteria:**
- Trivy scan runs on every PR and merge
- Build fails if CRITICAL/HIGH vulnerabilities found
- Results visible in GitHub Security tab
- Weekly scheduled scans configured
- Documentation includes scan badge

**GitHub Issue Template:**
```markdown
## CI/CD: Add Security Scanning with Trivy

### Description
Integrate Trivy security scanner into CI/CD pipeline to automatically detect container vulnerabilities.

### Tasks
- [ ] Add Trivy action to mcp-docker-build.yml
- [ ] Configure severity thresholds (CRITICAL, HIGH)
- [ ] Upload SARIF results to Security tab
- [ ] Add scan badge to README
- [ ] Create scheduled scan workflow (weekly)

### Success Criteria
- Scan runs on all PRs
- Build fails on CRITICAL/HIGH findings
- Results in GitHub Security tab
- Badge visible in README

### References
- https://github.com/aquasecurity/trivy-action
```

---

### 4. Read-Only Filesystem
**Priority:** P1 (High)
**Effort:** S (3 days)

Configure container with read-only filesystem where possible, allowing writes only to explicit temp directories.

**Implementation:**
```yaml
# docker-compose.yml example
services:
  cyberchef-mcp:
    read_only: true
    tmpfs:
      - /tmp:size=100M
```

**Tasks:**
- Identify required writable paths (temp files)
- Configure read-only filesystem in runtime
- Add tmpfs mounts for temporary operations
- Test all operations requiring file I/O
- Document filesystem restrictions

**Acceptance Criteria:**
- Container runs with read_only: true
- File-based operations still work (using tmpfs)
- No unexpected write errors
- Documentation explains tmpfs usage

---

### 5. SBOM (Software Bill of Materials) Generation
**Priority:** P2 (Medium)
**Effort:** S (2 days)

Generate SBOM for transparency and compliance tracking.

**Implementation:**
```yaml
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with:
    image: cyberchef-mcp:latest
    format: cyclonedx-json
```

**Tasks:**
- Add SBOM generation to CI/CD
- Attach SBOM to GitHub releases
- Document SBOM location and format
- Consider SBOM signing for integrity

**Acceptance Criteria:**
- SBOM generated on every release
- Attached to GitHub release assets
- Format is CycloneDX JSON
- Documentation explains SBOM usage

---

## Breaking Changes

None. This release is fully backward compatible.

## Dependencies

- Docker Hardened Images availability for Node.js 22
- Trivy GitHub Action (aquasecurity/trivy-action@master)
- SBOM Action (anchore/sbom-action@v0)

## Testing Requirements

### Security Testing
- [ ] Trivy scan shows <10 CVEs
- [ ] Docker Bench for Security passes
- [ ] CIS Docker Benchmark compliance check
- [ ] Non-root user execution verified
- [ ] Read-only filesystem tested

### Functional Testing
- [ ] All 300+ operations tested on hardened image
- [ ] MCP protocol communication unchanged
- [ ] File-based operations work (if applicable)
- [ ] Memory usage within bounds
- [ ] Startup time acceptable

### Integration Testing
- [ ] CI/CD pipeline runs successfully
- [ ] Security scans complete in reasonable time
- [ ] GitHub Security tab shows results
- [ ] Scheduled scans trigger correctly

## Documentation Updates

- [ ] Update Dockerfile.mcp with security comments
- [ ] Add SECURITY.md with security policy
- [ ] Update user_guide.md with security best practices
- [ ] Add security scan badge to README
- [ ] Document non-root user requirements
- [ ] Update architecture.md with security architecture

## Migration Guide

No migration required. Docker image update is transparent to users.

**Recommended Actions for Users:**
1. Pull latest image: `docker pull ghcr.io/doublegate/cyberchef-mcp_v1:v1.2.0`
2. Review security documentation: `docs/security/`
3. Consider running with read_only flag (see user_guide.md)

## Rollback Plan

If critical issues found:
1. Revert to v1.1.0 Docker image
2. Pin to `node:22-alpine` temporarily
3. Investigate issues in separate branch
4. Re-release as v1.2.1 with fixes

## Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| Week 1 | DHI migration, non-root user | Updated Dockerfile, basic security tests |
| Week 2 | Security scanning, SBOM | CI/CD integration, documentation |
| Week 3 | Testing, documentation | Release candidate, final testing |
| Week 4 | Release | v1.2.0 published to GHCR |

## Related Documents

- [Security Hardening Plan](./SECURITY-HARDENING-PLAN.md)
- [Phase 1: Foundation](./phase-1-foundation.md)
- [v1.3.0 Release Plan](./release-v1.3.0.md)

## GitHub Milestone

Create milestone: `v1.2.0 - Security Hardening`

**Issues to Create:**
1. Migrate to Docker Hardened Images (P0, L)
2. Implement Non-Root User Execution (P0, S)
3. Add Security Scanning with Trivy (P0, M)
4. Configure Read-Only Filesystem (P1, S)
5. Generate SBOM (P2, S)
6. Update Security Documentation (P1, S)
7. Add Security Scan Badge to README (P2, XS)

---

**Last Updated:** December 2025
**Status:** Planning
**Next Review:** Weekly during development
