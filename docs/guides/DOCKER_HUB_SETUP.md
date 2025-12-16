# Docker Hub Setup - Quick Start Guide

This guide provides step-by-step instructions to configure Docker Hub publishing with supply chain attestations for optimal Docker Scout health scores.

## Prerequisites

- GitHub repository with CyberChef MCP Server code
- Docker Hub account

## Setup Steps

### 1. Create Docker Hub Access Token

1. Log in to [Docker Hub](https://hub.docker.com)
2. Go to [Account Settings → Security](https://hub.docker.com/settings/security)
3. Click **"New Access Token"**
4. Configure token:
   - **Name**: `GitHub Actions - CyberChef MCP`
   - **Permissions**: Select **"Read, Write, Delete"**
5. Click **"Generate"** and **copy the token** (you won't see it again)

### 2. Create Docker Hub Repository

1. Go to [Docker Hub Repositories](https://hub.docker.com/repositories)
2. Click **"Create Repository"**
3. Configure repository:
   - **Name**: `cyberchef-mcp` (or your preferred name)
   - **Visibility**: Public or Private (your choice)
   - **Description**: "CyberChef MCP Server - 300+ data manipulation operations for AI assistants"
4. Click **"Create"**

Your repository URL will be: `https://hub.docker.com/r/YOUR_USERNAME/cyberchef-mcp`

### 3. Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings → Secrets and variables → Actions**
3. Click **"New repository secret"**
4. Add two secrets:

**Secret 1: DOCKERHUB_USERNAME**
- Name: `DOCKERHUB_USERNAME`
- Value: Your Docker Hub username (e.g., `johndoe`)

**Secret 2: DOCKERHUB_TOKEN**
- Name: `DOCKERHUB_TOKEN`
- Value: The access token you created in Step 1

### 4. Verify Workflow Configuration

The workflow has been updated to automatically use your Docker Hub credentials. Verify the configuration in `.github/workflows/mcp-release.yml`:

```yaml
env:
  DOCKERHUB_IMAGE_NAME: ${{ secrets.DOCKERHUB_USERNAME }}/cyberchef-mcp
```

If your Docker Hub repository has a different name, update the image name accordingly.

### 5. Trigger a Release

Create a new release to trigger the workflow:

```bash
# Create and push a tag
git tag -a v1.5.1 -m "Release v1.5.1 - Docker Hub attestations"
git push origin v1.5.1
```

The workflow will:
1. Build the Docker image
2. Generate SBOM and provenance attestations
3. Push to both GHCR and Docker Hub
4. Attach attestations to both images

### 6. Verify Health Score

After the workflow completes (about 5-10 minutes):

1. Go to your Docker Hub repository
2. Click the **"Tags"** tab
3. Select your tag (e.g., `latest` or `1.5.1`)
4. View the **Health Score badge** (should show grade A-F)
5. Click **"View policy results"** for detailed breakdown

**Expected Result:**
- Health Score: **A** or **B** (depending on base image vulnerabilities)
- Supply Chain Attestations: **✓ 15/15 points**
  - SBOM attestation: **Present**
  - Provenance attestation: **Present (mode=max)**

## Verification Commands

### Check Attestations Locally

```bash
# Pull the image
docker pull YOUR_USERNAME/cyberchef-mcp:latest

# Inspect SBOM
docker sbom YOUR_USERNAME/cyberchef-mcp:latest

# Inspect provenance (requires Docker Buildx)
docker buildx imagetools inspect YOUR_USERNAME/cyberchef-mcp:latest --format '{{ json .Provenance }}'
```

### Scan with Docker Scout

```bash
# Quick health check
docker scout quickview YOUR_USERNAME/cyberchef-mcp:latest

# Detailed policy evaluation
docker scout policy YOUR_USERNAME/cyberchef-mcp:latest

# CVE scan
docker scout cves YOUR_USERNAME/cyberchef-mcp:latest
```

## Troubleshooting

### Issue: Workflow fails with "Login failed"

**Solution:** Verify GitHub secrets are correctly configured:
- `DOCKERHUB_USERNAME` is your Docker Hub username (not email)
- `DOCKERHUB_TOKEN` is a valid access token (not your password)

### Issue: Health score shows "C" grade

**Possible causes:**
1. Attestations not attached (check with `docker sbom` command)
2. Base image has vulnerabilities (check CVE scan)
3. Using default user (should be non-root)
4. Image not pushed to Docker Hub (check tags in Docker Hub)

**Solution:** Run the verification commands above and check the detailed policy results on Docker Hub.

### Issue: "Missing supply chain attestation(s)"

**Solution:** Ensure the workflow completed successfully and attestations were generated:
1. Check GitHub Actions workflow run logs
2. Look for "Build and push Docker image to both registries" step
3. Verify `provenance: mode=max` and `sbom: true` are in the logs
4. Confirm the image was pushed (not just loaded locally)

## What's Next?

### Update User Guide

Users can now pull from Docker Hub instead of GHCR:

```bash
# Option 1: Pull from Docker Hub (new)
docker pull YOUR_USERNAME/cyberchef-mcp:latest

# Option 2: Pull from GHCR (existing)
docker pull ghcr.io/doublegate/cyberchef-mcp_v1:latest
```

### Monitor Health Score

- Check health score after each release
- Review policy recommendations
- Update base image regularly (Chainguard updates daily)

### Improve Score Further

To achieve an **A+ grade**:
1. Keep base image updated (zero CVEs)
2. Ensure all dependencies are up-to-date
3. Follow security best practices (non-root user, read-only filesystem)
4. Add additional attestations (VEX, SLSA provenance level 4)

## References

- [Complete Attestations Guide](./docker-scout-attestations.md)
- [Docker Hub Documentation](https://docs.docker.com/docker-hub/)
- [Docker Scout Documentation](https://docs.docker.com/scout/)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)

## Support

If you encounter issues:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review [GitHub Actions workflow logs](https://github.com/YOUR_USERNAME/CyberChef-MCP/actions)
3. Consult the [Complete Attestations Guide](./docker-scout-attestations.md)
4. Open an issue on GitHub
