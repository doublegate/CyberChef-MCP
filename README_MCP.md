# CyberChef MCP Server

This is a Model Context Protocol (MCP) server interface for CyberChef.
It allows AI agents to perform data manipulation tasks using CyberChef's extensive library of operations.

## Features

-   **`cyberchef_bake`**: A general-purpose tool to run any CyberChef recipe.
-   **`cyberchef_<operation>`**: Over 300 individual tools for specific operations (e.g., `cyberchef_to_base64`, `cyberchef_aes_decrypt`).
-   **`cyberchef_search`**: Search for available operations.

## Usage

### Running Locally

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Generate configuration files (required):
    ```bash
    npx grunt configTests
    ```
3.  Run the server:
    ```bash
    npm run mcp
    ```

### Docker

1.  Build the image:
    ```bash
    docker build -f Dockerfile.mcp -t cyberchef-mcp .
    ```
2.  Run the container:
    ```bash
    docker run -i cyberchef-mcp
    ```

## Protocol

This server uses the `stdio` transport. It communicates via standard input/output.

## Configuration

The server exposes all operations defined in CyberChef's configuration.
Arguments are mapped from CyberChef's type system to JSON Schema.

### Example Usage (JSON-RPC)

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "cyberchef_to_base64",
    "arguments": {
      "input": "Hello World"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "SGVsbG8gV29ybGQ="
      }
    ]
  }
}
```
