# Technical Implementation Guide

This document details the steps required to convert the project into an MCP server.

## 1. Dependencies
We need to add the MCP SDK to the project.
```bash
npm install @modelcontextprotocol/sdk zod
```

## 2. New File: `src/node/mcp-server.mjs`

This file will contain the server logic.

### Key Implementation Details:
-   **Importing Core:**
    ```javascript
    import { bake, help } from "./index.mjs";
    import { Server } from "@modelcontextprotocol/sdk/server/index.js";
    import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
    import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
    import { z } from "zod";
    import OperationConfig from "../core/config/OperationConfig.json" assert {type: "json"};
    ```
-   **Tool Normalization:**
    Convert CyberChef operation names (which may contain spaces, special chars) to valid MCP tool names (regex `^[a-zA-Z0-9_-]+$`).
    -   Example: `AES Decrypt` -> `cyberchef_aes_decrypt`.
-   **Argument Mapping:**
    Write a helper function `mapArgsToZod(opArgs)` that converts CyberChef's argument definitions into a Zod schema for the MCP tool definition.
-   **Handling `bake`:**
    Implement the generic `cyberchef_bake` tool which takes a raw JSON recipe. This allows complex chaining without multiple round-trips.

## 3. Docker Configuration

Create a new file `Dockerfile.mcp` specifically for the server deployment.

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
# Install all dependencies including the new MCP SDK
RUN npm ci

COPY src/ ./src/
COPY babel.config.js .

# Environment variable to toggle "All Tools" mode vs "Bake Only" mode
# Default to ALL for full feature availability
ENV CYBERCHEF_MCP_MODE=ALL

CMD ["node", "src/node/mcp-server.mjs"]
```

## 4. Testing
-   Run the server locally using `node src/node/mcp-server.mjs`.
-   Use an MCP Inspector or a simple client script to verify `listTools` returns the expected list.
-   Test basic operations (Base64, Hex) and complex recipes via `bake`.

## 5. Integration
-   Add a script to `package.json`: `"mcp": "node src/node/mcp-server.mjs"`.
