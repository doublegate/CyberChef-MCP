# Docker Scout Attestations and Health Score Guide

## Overview

This guide explains how the CyberChef MCP Server implements supply chain attestations to achieve optimal Docker Scout health scores on Docker Hub.

## Background: Docker Scout Health Scores

Docker Scout health scores provide security grading (A-F) for container images on **Docker Hub only**. Images on other registries (GHCR, ECR, ACR, etc.) can be scanned with Docker Scout but do not receive letter-grade health scores.

### Health Score Weighting

Supply Chain Attestations account for **15 points out of 100** in the health score calculation - one of the highest-weighted policy categories. Missing attestations can drop a score from A to C grade or worse.

### Required Attestations

Docker Scout requires **both** of the following attestations for optimal health scores:

1. **SBOM (Software Bill of Materials)** - Documents all software packages and dependencies in the image
2. **Provenance (Build Attestation)** - Records build details, source repository, and build environment

Images lacking either attestation are marked as non-compliant with the "Supply Chain Attestations" policy.

## Implementation

### Workflow Configuration

The `mcp-release.yml` workflow implements dual-registry publishing with attestations:

#### 1. Multi-Registry Push

```yaml
# Push to both GHCR (for GitHub ecosystem) and Docker Hub (for health scores)
tags: |
  ${{ steps.meta-ghcr.outputs.tags }}
  ${{ steps.meta-dockerhub.outputs.tags }}
```

#### 2. Attestation Generation

```yaml
provenance: mode=max  # Max-level provenance for SLSA Build Level 3 compliance
sbom: true            # Generate and attach SBOM attestation (in-toto SPDX format)
```

**Key Configuration Details:**

- **`provenance: mode=max`**: Generates maximum-detail provenance attestations compliant with SLSA Build Level 3
  - Public repos: `mode=max` is default
  - Private repos: `mode=min` is default (must override to `mode=max` for best scores)
- **`sbom: true`**: Generates SBOM attestations using Syft in SPDX-JSON format
- **Automatic Attachment**: Attestations are automatically pushed with the image to both registries

#### 3. Required Permissions

```yaml
permissions:
  contents: write
  packages: write
  security-events: write
  attestations: write  # Required for attestation generation
  id-token: write      # Required for OIDC token generation (attestation signing)
```

The `attestations: write` and `id-token: write` permissions enable GitHub Actions to generate and sign attestations using OIDC tokens.

### Dual SBOM Strategy

The project uses a two-pronged approach to SBOMs:

1. **Docker Attestation SBOM** (in-toto format, attached to image manifest)
   - Purpose: Docker Scout health scores, `docker sbom` command, registry verification
   - Format: SPDX-JSON
   - Generator: Syft (via BuildKit)
   - Location: Attached to image in registry

2. **Trivy SBOM Artifact** (standalone file, released as asset)
   - Purpose: Offline audits, third-party tools, compliance documentation
   - Format: CycloneDX JSON
   - Generator: Trivy
   - Location: GitHub Release assets

This dual strategy ensures both automated registry-based validation and manual/offline verification capabilities.

## GitHub Repository Setup

### Required Secrets

Configure these secrets in your GitHub repository settings (Settings → Secrets and variables → Actions):

| Secret Name | Description | How to Obtain |
|-------------|-------------|---------------|
| `DOCKERHUB_USERNAME` | Your Docker Hub username | Your Docker Hub account username |
| `DOCKERHUB_TOKEN` | Docker Hub access token | [Create token](https://hub.docker.com/settings/security) with "Read, Write, Delete" scope |

**Creating a Docker Hub Access Token:**

1. Log in to [Docker Hub](https://hub.docker.com)
2. Navigate to [Account Settings → Security](https://hub.docker.com/settings/security)
3. Click "New Access Token"
4. Name it (e.g., "GitHub Actions - CyberChef MCP")
5. Select "Read, Write, Delete" permissions
6. Click "Generate" and copy the token
7. Add to GitHub repository secrets as `DOCKERHUB_TOKEN`

### Docker Hub Repository Setup

1. Create a repository on Docker Hub (e.g., `yourusername/cyberchef-mcp`)
2. Enable Docker Scout (automatically enabled for all repositories)
3. Configure the workflow environment variable:

```yaml
env:
  DOCKERHUB_IMAGE_NAME: ${{ secrets.DOCKERHUB_USERNAME }}/cyberchef-mcp
```

**Note:** The workflow automatically constructs the image name using `DOCKERHUB_USERNAME` to avoid hardcoding usernames.

## Verification Guide

### 1. Verify Attestations Are Attached

After a release, verify that attestations are attached to your Docker Hub image:

```bash
# Pull the image
docker pull yourusername/cyberchef-mcp:latest

# Inspect SBOM attestation
docker sbom yourusername/cyberchef-mcp:latest

# Inspect provenance attestation (requires Docker Buildx)
docker buildx imagetools inspect yourusername/cyberchef-mcp:latest --format '{{ json .Provenance }}'
```

### 2. Verify with Docker Scout

Scan the image and check policy compliance:

```bash
# Check health score policies
docker scout quickview yourusername/cyberchef-mcp:latest

# Detailed policy evaluation
docker scout cves yourusername/cyberchef-mcp:latest --only-policy

# Check specifically for supply chain attestations
docker scout policy yourusername/cyberchef-mcp:latest
```

Expected output for compliant images:

```
✓ Supply chain attestations [15/15 points]
  - SBOM attestation: Present
  - Provenance attestation: Present (mode=max)
```

### 3. Check Docker Hub Health Score

1. Go to your Docker Hub repository: `https://hub.docker.com/r/yourusername/cyberchef-mcp`
2. Click the "Tags" tab
3. Select your tag (e.g., `latest`, `1.5.0`)
4. View the health score badge (A-F grade)
5. Click "View policy results" to see detailed scoring

### 4. Verify Chainguard Base Image Provenance

The Chainguard distroless base image includes SLSA Build Level 3 provenance. Verify it's preserved:

```bash
# Inspect the base image provenance
docker buildx imagetools inspect cgr.dev/chainguard/node:latest --format '{{ json .Provenance }}'

# Compare with our final image provenance
docker buildx imagetools inspect yourusername/cyberchef-mcp:latest --format '{{ json .Provenance }}'
```

The final image provenance should include build information but won't directly "inherit" the base image provenance (each build generates its own provenance attestation).

## Troubleshooting

### Issue: "Missing supply chain attestation(s)" on Docker Hub

**Symptoms:**
- Docker Hub Scout shows "C" grade
- Policy evaluation shows: ❌ Supply Chain Attestations [0/15 points]

**Solution:**
1. Verify the workflow used `docker/build-push-action@v6` or later
2. Confirm `provenance: mode=max` and `sbom: true` are set
3. Ensure `push: true` is set (attestations don't work with `load: true`)
4. Check GitHub Actions permissions include `attestations: write` and `id-token: write`
5. Verify the image was pushed to Docker Hub (not just GHCR)

### Issue: Workflow fails with "attestations not supported"

**Cause:** Using `load: true` instead of `push: true`

**Solution:** Attestations require pushing to a registry. For local testing, use the `mcp-docker-build.yml` workflow which loads images locally (without attestations). The `mcp-release.yml` workflow handles attestations for releases.

### Issue: Private repository has lower provenance score

**Cause:** Private repositories default to `provenance: mode=min`

**Solution:** Explicitly set `provenance: mode=max` in your workflow (already configured in `mcp-release.yml`).

### Issue: SBOM is empty or incomplete

**Possible Causes:**
1. Base image uses distroless/scratch with no package manager metadata
2. Dependencies installed outside package manager tracking
3. Multi-stage build removed package metadata

**Mitigation:**
- Chainguard images include comprehensive metadata
- Use BuildKit's `--sbom-scan-context` to scan build context
- Keep package metadata in final image layer

## Best Practices

1. **Always Push to Registry**: Attestations only work when pushing to a registry (Docker Hub, GHCR, etc.), not when using `load: true`

2. **Use mode=max Provenance**: For best health scores, always use `provenance: mode=max`, especially for private repositories

3. **Verify After Each Release**: Check health scores and attestations after each release to catch issues early

4. **Monitor Scout Policies**: Docker Scout policies evolve - regularly review policy changes that might affect your score

5. **Document Base Image Choices**: Note why you chose specific base images (e.g., Chainguard for zero CVEs and SLSA Level 3 provenance)

6. **Test Locally Without Attestations**: Use separate workflows for local testing (with `load: true`) and releases (with `push: true` and attestations)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions Workflow                       │
│                     (mcp-release.yml)                            │
└───────────┬─────────────────────────────────────┬───────────────┘
            │                                     │
            │ docker/build-push-action@v6         │
            │ - provenance: mode=max              │
            │ - sbom: true                        │
            │ - push: true                        │
            │                                     │
            v                                     v
┌────────────────────────────┐      ┌────────────────────────────┐
│  GitHub Container Registry │      │       Docker Hub           │
│     (ghcr.io)              │      │    (docker.io)             │
│                            │      │                            │
│  doublegate/cyberchef-mcp  │      │  username/cyberchef-mcp    │
│                            │      │                            │
│  ✓ Image                   │      │  ✓ Image                   │
│  ✓ SBOM attestation        │      │  ✓ SBOM attestation        │
│  ✓ Provenance attestation  │      │  ✓ Provenance attestation  │
│  ❌ Health score (N/A)     │      │  ✓ Health score (A-F)      │
└────────────────────────────┘      └────────────────────────────┘
                                                 │
                                                 │
                                    ┌────────────v───────────────┐
                                    │   Docker Scout Analyzer    │
                                    │                            │
                                    │  - Evaluates SBOM          │
                                    │  - Validates provenance    │
                                    │  - Scans vulnerabilities   │
                                    │  - Calculates health score │
                                    │                            │
                                    │  Grade: A (85-100 points)  │
                                    │  ✓ Supply Chain: 15/15     │
                                    └────────────────────────────┘
```

## References

- [Docker Scout Policy Requirements](https://docs.docker.com/scout/policy/)
- [Docker Scout Health Scores](https://docs.docker.com/scout/policy/scores/)
- [GitHub Actions Attestations](https://docs.docker.com/build/ci/github-actions/attestations/)
- [SLSA Build Levels](https://slsa.dev/spec/v1.0/levels)
- [Chainguard Images Documentation](https://edu.chainguard.dev/chainguard/chainguard-images/)
- [Syft SBOM Generator](https://github.com/anchore/syft)

## Changelog

### 2025-12-15
- Initial implementation of dual-registry push (GHCR + Docker Hub)
- Added `provenance: mode=max` and `sbom: true` attestation configuration
- Documented setup, verification, and troubleshooting procedures
- Resolved "C" grade issue by enabling Docker Hub push with attestations
