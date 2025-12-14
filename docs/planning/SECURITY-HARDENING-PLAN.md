# Security Hardening Plan

**Version:** 1.0.0
**Last Updated:** December 2025
**Target Release:** v1.2.0 (initial), ongoing through v2.0.0

## Executive Summary

This document outlines the comprehensive security hardening strategy for the CyberChef MCP Server. The goal is to achieve production-ready security posture with near-zero known vulnerabilities, following industry best practices for container security, supply chain integrity, and runtime protection.

## Current Security Status

### v1.1.0 Security Metrics

| Metric | Current Value | Target |
|--------|---------------|--------|
| Total CVEs in container | ~16 | <10 (v1.2.0), 0 (v2.0.0) |
| Critical/High CVEs | 3 | 0 |
| Runtime user | root | non-root (UID 1001) |
| Filesystem | read-write | read-only with tmpfs |
| SBOM generation | No | Yes |
| Security scanning in CI | Partial | Full Trivy integration |

### Fixed in v1.1.0

- 11 vulnerabilities addressed (code scanning + dependencies)
- NIST SP 800-132 compliant password hashing
- XSS prevention in UI components
- Dependency updates (MCP SDK, Babel, ESLint)

## Security Architecture

### Defense in Depth Layers

```
Layer 1 - Supply Chain:
+----------------------------+
| SBOM Generation            |
| Signed Artifacts           |
| SLSA Level 3 Compliance    |
+----------------------------+

Layer 2 - Container Image:
+----------------------------+
| Docker Hardened Images     |
| Minimal Base (distroless)  |
| Non-Root User              |
+----------------------------+

Layer 3 - Runtime:
+----------------------------+
| Read-Only Filesystem       |
| Resource Limits            |
| Network Isolation          |
+----------------------------+

Layer 4 - Application:
+----------------------------+
| Input Validation           |
| Output Sanitization        |
| Error Handling             |
+----------------------------+
```

## Phase 1: Container Hardening (v1.2.0)

### 1. Docker Hardened Images Migration

Docker launched Hardened Images (DHI) in May 2025, providing distroless-based images with automatic patching and near-zero CVEs.

**Current Dockerfile:**
```dockerfile
FROM node:22-alpine

WORKDIR /app
COPY . .
RUN npm ci
CMD ["node", "src/node/mcp-server.mjs"]
```

**Hardened Dockerfile:**
```dockerfile
# Use Docker Hardened Image
FROM docker.io/library/node:22-dhi

# Create non-root user
RUN addgroup -g 1001 -S cyberchef && \
    adduser -u 1001 -S cyberchef -G cyberchef

WORKDIR /app

# Change ownership to non-root user
COPY --chown=cyberchef:cyberchef package*.json ./
RUN npm ci --only=production

COPY --chown=cyberchef:cyberchef . .

# Apply Node 22 compatibility patches
RUN sed -i 's/new SlowBuffer/Buffer.alloc/g' node_modules/avsc/lib/types.js && \
    sed -i 's/SlowBuffer/Buffer/g' node_modules/buffer-equal-constant-time/index.js

# Generate config
RUN npx grunt configTests

# Switch to non-root user
USER cyberchef

# Expose no ports (stdio-based)
EXPOSE 0

CMD ["node", "src/node/mcp-server.mjs"]
```

**Benefits:**
- Up to 95% reduction in vulnerabilities
- 98% reduction in installed packages
- Non-root by default
- Automatic security patching (7-day SLA for critical/high)
- SLSA Level 3 compliance

**Fallback (if DHI unavailable):**
```dockerfile
# Alternative: Google Distroless
FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && npx grunt configTests

FROM gcr.io/distroless/nodejs22-debian12
COPY --from=builder /app /app
WORKDIR /app
USER nonroot
CMD ["src/node/mcp-server.mjs"]
```

### 2. Non-Root Execution

**Rationale:**
- Principle of least privilege
- Prevents privilege escalation attacks
- Required for many enterprise deployments
- Best practice per CIS Docker Benchmark

**Implementation:**
```dockerfile
# Create dedicated user with specific UID/GID
RUN addgroup -g 1001 -S cyberchef && \
    adduser -u 1001 -S cyberchef -G cyberchef

# Set file ownership
COPY --chown=cyberchef:cyberchef . .

# Switch before running
USER cyberchef
```

**Verification:**
```bash
# Check running user
docker run --rm cyberchef-mcp id
# Expected: uid=1001(cyberchef) gid=1001(cyberchef)

# Verify via inspect
docker inspect --format='{{.Config.User}}' cyberchef-mcp
# Expected: 1001
```

### 3. Read-Only Filesystem

**Configuration:**
```yaml
# docker-compose.yml
services:
  cyberchef-mcp:
    image: ghcr.io/doublegate/cyberchef-mcp_v1:v1.2.0
    read_only: true
    tmpfs:
      - /tmp:size=100M,mode=1777
    security_opt:
      - no-new-privileges:true
```

**Allowed Writable Paths:**
| Path | Purpose | Size Limit |
|------|---------|------------|
| /tmp | Temporary operation files | 100MB |

### 4. Security Scanning in CI/CD

**GitHub Actions Integration:**
```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
  schedule:
    - cron: '0 0 * * 0'  # Weekly

jobs:
  container-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Build image
        run: docker build -f Dockerfile.mcp -t cyberchef-mcp:scan .

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'cyberchef-mcp:scan'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH,MEDIUM'
          exit-code: '1'
          ignore-unfixed: true

      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'

  dependency-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run npm audit
        run: npm audit --audit-level=high

      - name: Run Snyk to check for vulnerabilities
        uses: snyk/actions/node@master
        continue-on-error: true
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

**Scan Thresholds:**
| Severity | Action | Notes |
|----------|--------|-------|
| Critical | Block release | Must fix before release |
| High | Block release | Must fix before release |
| Medium | Warning | Fix in next release |
| Low | Informational | Track and monitor |

### 5. SBOM Generation

**Implementation:**
```yaml
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with:
    image: cyberchef-mcp:${{ github.sha }}
    format: cyclonedx-json
    output-file: sbom.json

- name: Attach SBOM to release
  uses: softprops/action-gh-release@v1
  if: startsWith(github.ref, 'refs/tags/')
  with:
    files: sbom.json
```

**SBOM Contents:**
- All npm dependencies with versions
- System packages in container
- License information
- Vulnerability mappings

## Phase 2: Runtime Security (v1.3.0 - v1.4.0)

### 1. Input Validation

**Current State:**
Input validation via Zod schemas for MCP tool arguments.

**Enhancements:**
```javascript
// Enhanced input validation
const inputSchema = z.object({
  input: z.string()
    .max(100_000_000, 'Input exceeds 100MB limit')
    .refine(
      (val) => !containsMaliciousPatterns(val),
      'Input contains suspicious patterns'
    ),
  // ... other fields
});

function containsMaliciousPatterns(input) {
  const patterns = [
    /\x00/,  // Null bytes
    /<script/i,  // Script injection
    /javascript:/i,  // JS protocol
  ];
  return patterns.some(p => p.test(input));
}
```

### 2. Resource Limits

**Docker Runtime Limits:**
```yaml
services:
  cyberchef-mcp:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 128M
```

**Application-Level Limits:**
```javascript
// Configure resource limits
const limits = {
  maxInputSize: 100_000_000,  // 100MB
  maxOperationTime: 30_000,   // 30 seconds
  maxMemoryUsage: 512_000_000, // 512MB
  maxConcurrentOps: 10
};
```

### 3. Timeout Handling

```javascript
async function executeWithTimeout(operation, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await Promise.race([
      operation({ signal: controller.signal }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
      )
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
```

## Phase 3: Supply Chain Security (v1.4.0 - v2.0.0)

### 1. Signed Container Images

```yaml
# Sign images with cosign
- name: Sign container image
  run: |
    cosign sign --key env://COSIGN_PRIVATE_KEY \
      ghcr.io/doublegate/cyberchef-mcp_v1:${{ github.sha }}
```

### 2. Provenance Attestation

```yaml
- name: Generate provenance
  uses: slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@v1
  with:
    image: ghcr.io/doublegate/cyberchef-mcp_v1
    digest: ${{ steps.build.outputs.digest }}
```

### 3. Dependency Pinning

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.24.3",
    "zod": "4.1.12"
  },
  "overrides": {
    "ws": ">=5.2.4",
    "js-yaml": ">=4.1.1"
  }
}
```

## Security Policies

### Vulnerability Disclosure

See `.github/SECURITY.md` for responsible disclosure policy.

### Patching SLA

| Severity | Response Time | Patch Time |
|----------|---------------|------------|
| Critical | 24 hours | 72 hours |
| High | 48 hours | 7 days |
| Medium | 7 days | 30 days |
| Low | 30 days | Next release |

### Security Review Checklist

For each release:
- [ ] Run Trivy container scan
- [ ] Run npm audit
- [ ] Review CodeQL findings
- [ ] Check OWASP dependency scan
- [ ] Verify non-root execution
- [ ] Test read-only filesystem
- [ ] Update SBOM
- [ ] Review and update SECURITY.md

## Compliance

### Standards Alignment

| Standard | Status | Notes |
|----------|--------|-------|
| CIS Docker Benchmark | Partial | Full by v1.2.0 |
| OWASP Container Security | Partial | Full by v1.4.0 |
| NIST SP 800-190 | Planned | Target v2.0.0 |
| SLSA Level 3 | Planned | Target v2.0.0 |

### Required Documentation

- [ ] Security policy (SECURITY.md)
- [ ] Vulnerability disclosure process
- [ ] Security hardening guide
- [ ] Incident response procedure
- [ ] SBOM for each release

## Monitoring and Alerting

### Security Metrics

Track in CI/CD:
- CVE count over time
- Time to patch critical issues
- Security scan pass rate
- Dependency freshness

### Alerting

| Event | Priority | Channel |
|-------|----------|---------|
| Critical CVE detected | P0 | Email + Slack |
| High CVE detected | P1 | GitHub Issue |
| Scan failure | P1 | GitHub Issue |
| Dependency update available | P3 | Renovate PR |

## Implementation Timeline

### v1.2.0 (January 2026)
- [ ] Migrate to Docker Hardened Images
- [ ] Implement non-root user
- [ ] Add Trivy scanning in CI
- [ ] Generate SBOM
- [ ] Configure read-only filesystem

### v1.3.0 (February 2026)
- [ ] Enhanced input validation
- [ ] Resource limit enforcement
- [ ] Security documentation

### v1.4.0 (March 2026)
- [ ] Signed container images
- [ ] SLSA provenance
- [ ] Complete security audit

### v2.0.0 (September 2026)
- [ ] Full NIST SP 800-190 compliance
- [ ] SLSA Level 3 certification
- [ ] Enterprise security documentation

## Risk Assessment

### Remaining Risks After v1.2.0

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Zero-day in Node.js | Low | High | Quick patching, monitoring |
| Supply chain attack | Low | Critical | SBOM, signed images, SLSA |
| Malicious input | Medium | Medium | Input validation, sandboxing |
| Resource exhaustion | Medium | Low | Limits, monitoring |

## Related Documents

- [v1.2.0 Release Plan](./release-v1.2.0.md)
- [Phase 1: Foundation](./phase-1-foundation.md)
- [Security Audit](../security/audit.md)
- [SECURITY.md](../../.github/SECURITY.md)
- [ROADMAP](../ROADMAP.md)

## References

- [Docker Hardened Images](https://www.docker.com/products/hardened-images/)
- [Docker Hardened Images Documentation](https://docs.docker.com/dhi/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [NIST SP 800-190](https://csrc.nist.gov/publications/detail/sp/800-190/final)
- [SLSA Framework](https://slsa.dev/)
- [Node.js Security Best Practices](https://nodejs.org/en/learn/getting-started/security-best-practices)
- [Trivy Documentation](https://aquasecurity.github.io/trivy/)

---

**Document Status:** Draft
**Last Review:** December 2025
**Next Review:** After v1.2.0 implementation
