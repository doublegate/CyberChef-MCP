# Security Policy

## CyberChef MCP Server Security

This document covers security for the **CyberChef MCP Server** fork. For the original CyberChef web application, see the [upstream repository](https://github.com/gchq/CyberChef).

## Supported Versions

| Version | Supported          | Notes                                                                 |
| ------- | ------------------ | --------------------------------------------------------------------- |
| 2.3.x   | :white_check_mark: | Current release. Fixes land here.                                     |
| 2.2.x   | :white_check_mark: | Security fixes only, until the next minor.                            |
| 1.9.x   | :white_check_mark: | Security fixes only, until ~March 2027. Published to `cyberchef-mcp_v1`, and it stays **Apache-2.0** — the GPL-3.0-or-later relicensing applies from v2.0.0 forward. |
| < 1.9   | :x:                | Upgrade. Note that v2.0.0 has breaking changes; see [the migration guide](docs/v2.0.0-breaking-changes.md). |

Updating this table is a release-checklist item, not something done when someone notices. It had
previously drifted five releases behind — naming 1.2.x as current while 1.9.0 was shipping — which
is how a support promise quietly becomes false.

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue:

### For MCP server issues — use private reporting

**Please do not open a public issue for a vulnerability.**

[**Report a vulnerability privately**](https://github.com/doublegate/CyberChef-MCP/security/advisories/new) —
GitHub private vulnerability reporting is **enabled** on this repository, so you do not need a
mail round-trip or any prior contact. The same button is on the repository's **Security** tab under
*Report a vulnerability*. The report is visible only to you and the maintainers, it carries a
private discussion thread, and it can become a published advisory with a CVE and credit to you if
that is what it turns out to be.

If for any reason that form is unavailable to you, contact [@doublegate](https://github.com/doublegate)
on GitHub and say only that you have a security report — no details in a public channel.

**What is in scope here:** the MCP layer this fork owns — `src/node/**` (the server, transports,
recipe storage, tool schemas), `Dockerfile.mcp` and the published images, the release workflows, and
the fork's own patches under `patches/fork/`.

### For issues in CyberChef itself

Anything in `src/core/**` is upstream code, mirrored verbatim from
[gchq/CyberChef](https://github.com/gchq/CyberChef). Report it to them, and note that **their policy
forbids a public issue for a vulnerability**:

> If you discover a vulnerability in CyberChef, please do not publicly disclose it, and do not
> create a GitHub issue. Instead, send an email as soon as possible to
> [CyberChefSecurity@gchq.gov.uk](mailto:CyberChefSecurity@gchq.gov.uk).

Private vulnerability reporting is also enabled on `gchq/CyberChef`, which satisfies that policy
without email. *(An earlier version of this file told readers to raise a public issue upstream for
disclosure. That was wrong, and directly contrary to upstream's stated policy.)*

If you are unsure which side a finding belongs to, report it here and we will route it — getting it
to the wrong maintainer privately is much better than guessing publicly.

### What to expect

This project is maintained by one person, so these are honest intentions rather than a service
commitment:

- **Acknowledgement:** usually within a few days.
- **Assessment:** a severity and a plan once the report is understood; we will tell you what we
  think it is and why, including if we think it is not a vulnerability.
- **Fix:** critical issues take priority over everything else, including a release in progress.
- **Disclosure:** coordinated with you. We will not publish before a fix is available unless you ask
  us to, and we will credit you unless you would rather we did not.

If you do not hear back within a week, please chase — a missed notification is far more likely than
a decision to ignore you.

## Security Measures

Describes the **current** posture (2.3.x), not a historical snapshot. It previously carried a
`(v1.3.0)` stamp that was never updated, so a reader could not tell whether it described the
shipped image or a state six releases old. Verified against the published
`ghcr.io/doublegate/cyberchef-mcp_v2:2.3.0` image rather than against the Dockerfile.

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
- **CodeQL**: Automated code analysis on push, on pull requests, and weekly. `src/vendor/**` is
  excluded — vendored third-party source we do not modify — while `src/core/vendor/**` stays
  analysed, because its alerts have been individually dispositioned and hiding them would lose that
  record. See [`.github/codeql/codeql-config.yml`](.github/codeql/codeql-config.yml).
- **Weekly Scans**: Scheduled scans catch newly discovered vulnerabilities

Results are uploaded to the GitHub Security tab automatically.

### Repository security settings

What is switched on, so you know what protects this project and what does not:

| Feature | State |
|---|---|
| Private vulnerability reporting | **Enabled** — the reporting route above |
| Dependabot alerts and security updates | **Enabled** |
| Secret scanning | **Enabled** |
| Secret scanning push protection | **Enabled** |
| Code scanning (CodeQL) | **Enabled** — push, PR, and weekly |
| Secret scanning: non-provider patterns | Not available (requires GitHub Advanced Security) |
| Secret scanning: validity checks | Not available (requires GitHub Advanced Security) |

The last two are listed rather than omitted: they are off because the plan this repository is on
does not offer them, not because they were considered and declined.

### Security Audits

- **v2.3.0 (2026-08-31)**: Fixed a pooled-buffer defect in 17 image operations — the surplus bytes
  were adjacent heap, which on a multi-caller server can be another caller's data — and reported it
  and two related findings privately to upstream (GHSA-hj7h-fgw7-x6w8). Closed a `umask` window
  before the Unix socket's `chmod` (CWE-732), and a CodeQL `js/insecure-temporary-file` in the test
  suite. Coverage gate raised from 75/70/90/75 to 95/88/96/96.
- **v2.1.1 (2026-08-31)**: 55 open alerts dispositioned — fixed, suppressed with a written
  justification, or dismissed with a reason.
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
