# CyberChef MCP Server User Guide

This guide provides instructions for installing and using the CyberChef MCP server with various MCP-compliant clients.

## Prerequisites

*   **Docker:** Ensure Docker is installed and running on your system.
*   **Docker Image:** You need to have the `cyberchef-mcp` image available. Choose one of these options:

    **Option 1: Pull from GitHub Container Registry (Recommended)**
    ```bash
    docker pull ghcr.io/doublegate/cyberchef-mcp_v1:latest
    docker tag ghcr.io/doublegate/cyberchef-mcp_v1:latest cyberchef-mcp
    ```

    **Option 2: Download Pre-built Tarball (Offline Installation)**
    ```bash
    # Download from GitHub Releases (approximately 270MB compressed)
    wget https://github.com/doublegate/CyberChef-MCP/releases/download/v1.3.0/cyberchef-mcp-v1.3.0-docker-image.tar.gz

    # Load into Docker
    docker load < cyberchef-mcp-v1.3.0-docker-image.tar.gz

    # Tag for easier usage
    docker tag ghcr.io/doublegate/cyberchef-mcp_v1:v1.3.0 cyberchef-mcp
    ```

    **Option 3: Build from Source**
    ```bash
    docker build -f Dockerfile.mcp -t cyberchef-mcp .
    ```

## General Usage Concept

The CyberChef MCP server is designed to run as a Docker container that communicates via standard input/output (stdio). To use it with any client, you generally configure the client to run the following command:

```bash
docker run -i --rm cyberchef-mcp
```

*   `-i`: Keeps standard input open (required for the server to receive messages).
*   `--rm`: Automatically removes the container when the client disconnects.
*   `cyberchef-mcp`: The name of the image you built.

---

## Client Configuration

### 1. Cursor AI IDE

Cursor supports MCP servers to enhance its AI capabilities.

1.  Open **Cursor Settings** (Cmd/Ctrl + ,).
2.  Navigate to the **Features** > **MCP** section.
3.  Click **Add New MCP Server**.
4.  Fill in the details:
    *   **Name:** `CyberChef` (or any name you prefer)
    *   **Type:** `command` (or "stdio")
    *   **Command:** `docker`
    *   **Args:** `run -i --rm cyberchef-mcp`
5.  Click **Add**.

Once added, the "Green Light" indicator should show that Cursor has successfully connected to the server. You can now ask the AI questions like "Decode this base64 string" or "Calculate the MD5 hash of 'hello'".

### 2. Claude Code (CLI)

To use the server with Anthropic's `claude` CLI tool, you need to configure it in your Claude configuration file.

1.  Locate or create your configuration file (usually at `~/.claude/config.json` or similar, refer to Claude Code documentation).
2.  Add the CyberChef server to the `mcpServers` object:

```json
{
  "mcpServers": {
    "cyberchef": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "cyberchef-mcp"
      ]
    }
  }
}
```

3.  Restart the `claude` tool. It should now have access to CyberChef tools.

### 3. Gemini CLI (or similar generic MCP clients)

For command-line based MCP clients that accept a configuration file or command-line arguments to start servers:

**Configuration File (example `mcp_config.json`):**

```json
{
  "mcpServers": {
    "cyberchef": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "cyberchef-mcp"]
    }
  }
}
```

**Direct Invocation:**

If the client allows specifying the command directly:

```bash
mcp-client --server-command "docker run -i --rm cyberchef-mcp"
```

---

## Troubleshooting

*   **"Container not found" or "Image not found":** Ensure you have built the image using `docker build -f Dockerfile.mcp -t cyberchef-mcp .`.
*   **Permissions:** On Linux, you might need to add `sudo` before `docker` if your user isn't in the `docker` group. However, this can complicate configuration in GUI apps like Cursor. It is recommended to configure Docker for [rootless mode](https://docs.docker.com/engine/security/rootless/) or add your user to the docker group.
*   **Performance:** The first request might take a split second to start the container. Subsequent requests within the same session should be fast.
*   **Environment Variables:** If you need to pass environment variables to the server, add `-e VAR_NAME=value` to the `args` list in your configuration (e.g., `args: ["run", "-i", "--rm", "-e", "MY_VAR=foo", "cyberchef-mcp"]`).

## Security Best Practices

The CyberChef MCP server (v1.3.0) includes comprehensive security hardening features:

### Non-Root Execution
The container runs as a non-root user (`cyberchef`, UID 1001) by default:
```bash
# Verify non-root execution
docker run --rm cyberchef-mcp id
# Output: uid=1001(cyberchef) gid=1001(cyberchef)
```

### Read-Only Filesystem
For maximum security, run with a read-only root filesystem:
```bash
docker run -i --rm --read-only --tmpfs /tmp:size=100M cyberchef-mcp
```

### Recommended Security Options
For production deployments, use all available security options:
```bash
docker run -i --rm \
  --read-only \
  --tmpfs /tmp:size=100M \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  cyberchef-mcp
```

### Security Features
*   **Non-root execution**: Prevents privilege escalation
*   **Read-only filesystem**: Immutable container state
*   **Capability dropping**: Minimal kernel capabilities
*   **No new privileges**: Prevents gaining additional privileges
*   **Health checks**: Built-in monitoring for orchestration

### Vulnerability Scanning
Each release includes:
*   Trivy vulnerability scan results
*   SBOM (Software Bill of Materials) in CycloneDX format
*   Automated weekly security scans

For more information, see the [Security Policy](../SECURITY.md).

---

## Examples of Prompts

Once connected, you can try prompts like these with your AI assistant:

*   "Decode this Base64 string: `SGVsbG8gV29ybGQ=`"
*   "I have a hex string `48656c6c6f`. Convert it to text."
*   "Use CyberChef to gunzip this data."
*   "Analyze this string and tell me what kind of hash it might be."
*   "Convert the current time to a UNIX timestamp."


## Environment Variables

| Variable | Description | Default Value | Example |
|--------|-------------|--------------|--------|
| CYBERCHEF_CACHE_ENABLED | Enable or disable result caching | true | CYBERCHEF_CACHE_ENABLED=false |
| CYBERCHEF_MAX_INPUT_SIZE | Maximum input size in bytes | 100MB | CYBERCHEF_MAX_INPUT_SIZE=52428800 |
| CYBERCHEF_MEMORY_THRESHOLD | Memory usage threshold before cleanup | 512MB | CYBERCHEF_MEMORY_THRESHOLD=1024MB |
| CYBERCHEF_LOG_LEVEL | Controls logging verbosity | info | CYBERCHEF_LOG_LEVEL=debug |
| CYBERCHEF_WORKER_THREADS | Number of worker threads | 4 | CYBERCHEF_WORKER_THREADS=8 |
| CYBERCHEF_TIMEOUT | Operation timeout in milliseconds | 30000 | CYBERCHEF_TIMEOUT=60000 |
| CYBERCHEF_STREAM_CHUNK_SIZE | Size of data chunks used during streaming | 65536 | CYBERCHEF_STREAM_CHUNK_SIZE=131072 |
| CYBERCHEF_DISABLE_TELEMETRY | Disable anonymous usage telemetry | false | CYBERCHEF_DISABLE_TELEMETRY=true |

> Note: These environment variables are documented as referenced in the user guide
> and project issue. Some variables may map internally to newer configuration
> options in the server implementation.