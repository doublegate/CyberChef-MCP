# Security Policy

## CyberChef MCP Server Security

This document covers security for the **CyberChef MCP Server** fork. For the original CyberChef web application, see the [upstream repository](https://github.com/gchq/CyberChef).

## Supported Versions

| Version | Supported          | Notes                                    |
| ------- | ------------------ | ---------------------------------------- |
| 1.2.x   | :white_check_mark: | Current release - Security Hardening     |
| 1.1.x   | :white_check_mark: | Security fixes backported                |
| 1.0.x   | :x:                | Upgrade to 1.1.x or later                |
| < 1.0   | :x:                | Not supported                            |

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

## Security Measures (v1.2.5)

### Container Security

#### Non-Root Execution
The container runs as a dedicated `cyberchef` user (UID 1001):
```bash
# Verify non-root execution
docker run --rm cyberchef-mcp id
# Output: uid=1001(cyberchef) gid=1001(cyberchef)
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

- **v1.2.5**: 5 GitHub Security alerts resolved, Argon2 OWASP 2024-2025 hardening, CVE-2025-64756 fixed
- **v1.2.0**: Non-root execution, Trivy integration, SBOM generation
- **v1.1.0**: 11 vulnerabilities fixed (76% reduction), NIST-compliant password hashing

See [docs/security/audit.md](docs/security/audit.md) for detailed audit reports.

## Docker Hardened Images (DHI)

Docker Hardened Images for Node.js 22 are available via Docker Hub subscription. This open-source project uses `node:22-alpine` with manual hardening. Enterprise deployments may consider DHI for additional security.

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
