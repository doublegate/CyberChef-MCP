# Security Policy

## CyberChef MCP Server Security

This document covers security for the **CyberChef MCP Server** fork. For the original CyberChef web application, see the [upstream repository](https://github.com/gchq/CyberChef).

## Supported Versions

| Version | Supported          | Notes                                                      |
| ------- | ------------------ | ---------------------------------------------------------- |
| 1.9.x   | :white_check_mark: | Current release                                            |
| 1.8.x   | :white_check_mark: | Security fixes only                                        |
| < 1.8   | :x:                | Upgrade to 1.9.x                                           |

This table had drifted five releases behind, still naming 1.2.x as current while 1.9.0 shipped in
February 2026. It is now a release-checklist item rather than something updated when noticed.

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue:

### For MCP Server Issues
1. **Do NOT** create a public GitHub issue for security vulnerabilities
2. Create a [private security advisory](https://github.com/doublegate/CyberChef-MCP/security/advisories/new)
3. Or contact [@doublegate](https://github.com/doublegate) via GitHub private messaging

### For Core CyberChef Issues
Report to the upstream project:
- [Raise an issue](https://github.com/gchq/CyberChef/issues/new/choose) for public disclosure
- Email [oss@gchq.gov.uk](mailto:oss@gchq.gov.uk) for private disclosure

### What to Expect
- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 7 days
- **Resolution**: Critical issues within 30 days
- **Disclosure**: Coordinated after fix is available

## Security Measures

Describes the **current** posture (1.9.x), not a historical snapshot. It previously carried a
`(v1.3.0)` stamp that was never updated, so a reader could not tell whether it described the
shipped image or a state six releases old.

### Container Security

#### Non-Root Execution
The container runs as the unprivileged `node` user (UID 65532), Chainguard's `nonroot` identity:
```bash
# Verify non-root execution
docker run --rm --entrypoint id cyberchef-mcp
# Output: uid=65532(node) gid=65532(node) groups=65532(node)
```

#### Read-Only Filesystem Support
```bash
docker run -i --rm --read-only --tmpfs /tmp:size=100M cyberchef-mcp
```

#### Recommended Security Options
```bash
docker run -i --rm \
  --read-only \
  --tmpfs /tmp:size=100M \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  cyberchef-mcp
```

### Automated Security Scanning

- **Trivy**: Container and dependency vulnerability scanning on every build
- **SBOM**: Software Bill of Materials (CycloneDX) generated for each release
- **CodeQL**: Automated code analysis for security issues
- **Weekly Scans**: Scheduled scans catch newly discovered vulnerabilities

Results are uploaded to the GitHub Security tab automatically.

### Security Audits

- **2026-08-31**: Full sweep of every open Dependabot and code-scanning alert — CVE-2026-42615 (XSS in `Show Base64 offsets`) fixed by adopting upstream's file, minimatch and uuid cleared at the root, Dockerfile pinned by digest and given an explicit non-root `USER`, one justified `.trivyignore` entry, three CodeQL alerts on upstream-identical code dismissed with reasons. See [docs/security/2026-08-31-open-alert-sweep.md](docs/security/2026-08-31-open-alert-sweep.md).
- **v1.3.0**: Upstream sync automation, comprehensive MCP validation testing, GitHub Actions security best practices
- **v1.2.6**: Web app Dockerfile nginx:alpine-slim optimization with non-root permission fixes
- **v1.2.5**: 5 GitHub Security alerts resolved, Argon2 OWASP 2024-2025 hardening, CVE-2025-64756 fixed
- **v1.2.0**: Non-root execution, Trivy integration, SBOM generation
- **v1.1.0**: 11 vulnerabilities fixed (76% reduction), NIST-compliant password hashing

Current disposition of every open finding: [docs/security/2026-08-31-open-alert-sweep.md](docs/security/2026-08-31-open-alert-sweep.md).
Historical reports: [docs/security/audit.md](docs/security/audit.md) (a December 2025 snapshot, superseded).

## Docker Hardened Images (DHI)

Docker Hardened Images are available via Docker Hub subscription. This project does not use them: `Dockerfile.mcp` builds on **Chainguard's distroless `cgr.dev/chainguard/node`**, pinned by digest, which already provides a minimal Wolfi-based runtime with no shell or package manager and daily rebuilds. (This paragraph previously claimed the project used `node:22-alpine`, which has not been true since the move to Chainguard.) Enterprise deployments with a Docker Hub subscription may still prefer DHI for its support terms.

See [Docker DHI Documentation](https://docs.docker.com/dhi/about/what/) for more information.

---

## Original CyberChef Security

The original CyberChef project is supported on a best endeavours basis. Patches
are applied to the latest version rather than retroactively. The official
[live demo](https://gchq.github.io/CyberChef/) is always up to date.

Disclosures of vulnerabilities in CyberChef are always welcomed. We recognise
this is an open source project relying on dozens of open source libraries. We
hope the community will continue to support us as we maintain and develop this
tool together.
