# CyberChef-server Reference Documentation

## Overview

### Project Description

**CyberChef-server** is an HTTP REST API server that wraps the CyberChef Node.js API, enabling programmatic access to CyberChef's 300+ data manipulation operations from any language or platform that can communicate over HTTP. This project is part of the GCHQ CyberChef ecosystem.

| Property | Details |
|----------|---------|
| Project Name | CyberChef-server |
| Version | 1.1.0 |
| Repository | https://github.com/gchq/CyberChef-server |
| Author | d98762625 <d98762625@gmail.com> |
| Organization | GCHQ (Government Communications Headquarters, UK) |
| License | Apache License 2.0 |
| Copyright | Crown Copyright 2020 |

### Purpose and Motivation

CyberChef provides a powerful Node.js API for data transformation operations, but JavaScript-only access limits cross-language integration. CyberChef-server solves this by:

1. **Language Agnostic** - Any language that can make HTTP requests can use CyberChef operations
2. **Headless Deployment** - Run CyberChef operations without a browser or UI
3. **API-Driven Automation** - Integrate CyberChef into automated workflows, CI/CD pipelines, and batch processing systems
4. **Microservices Architecture** - Deploy CyberChef as a standalone service in containerized environments

### API Design Philosophy

The CyberChef-server REST API is designed with the following principles:

1. **Recipe Compatibility** - Accepts recipes exported directly from the CyberChef web UI (save as "clean JSON")
2. **Flexible Arguments** - Supports default arguments, named arguments, and positional arguments
3. **Simple HTTP** - Standard POST requests with JSON payloads
4. **Type Flexibility** - Automatic type handling with optional output type conversion
5. **Batch Processing** - Native support for processing multiple inputs with a single recipe

## Technical Architecture

### Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | 18.x, 20.x |
| Framework | Express.js | 4.19.2 |
| CyberChef Core | CyberChef (npm package) | Installed via postinstall |
| Container | Docker | Node 18 Alpine |
| API Documentation | Swagger/OpenAPI | 3.0.0 |

### Core Dependencies

```json
{
  "express": "^4.19.2",           // Web framework
  "cors": "^2.8.5",               // Cross-origin support
  "helmet": "^8.0.0",             // Security headers
  "pino-http": "^10.3.0",         // HTTP logging
  "cookie-parser": "~1.4.4",      // Cookie parsing
  "swagger-ui-express": "^5.0.1", // API documentation UI
  "yaml": "^2.5.0",               // Swagger YAML parsing
  "terser": "^5.31.1"             // JS minification
}
```

### Project Structure

```
CyberChef-server/
├── index.mjs                 # Entry point (starts Express server on port 3000)
├── src/
│   ├── app.mjs              # Express app configuration and middleware
│   ├── lib/
│   │   └── errorHandler.mjs # Centralized error handling
│   ├── routes/
│   │   ├── bake.mjs         # POST /bake - single recipe execution
│   │   ├── batchBake.mjs    # POST /batch/bake - batch processing
│   │   ├── magic.mjs        # POST /magic - automatic detection
│   │   └── health.mjs       # GET /health - server healthcheck
│   └── test/
│       ├── bake.mjs
│       ├── batchBake.mjs
│       ├── magic.mjs
│       └── health.mjs
├── swagger.yml              # OpenAPI 3.0 specification
├── Dockerfile               # Node 18 Alpine container
├── postinstall.js           # Custom CyberChef installation script
└── package.json
```

### Middleware Stack

The Express app uses the following middleware chain (in order):

1. **CORS** - Allows cross-origin requests (`origin: "*"`)
2. **Helmet** - Security headers (production only)
3. **Pino-HTTP** - Request/response logging (error-level in production, info-level in dev)
4. **express.json()** - JSON body parsing
5. **express.urlencoded()** - URL-encoded form parsing
6. **cookieParser()** - Cookie parsing
7. **Route handlers** - API endpoints
8. **errorHandler** - Centralized error handling

### Installation Quirks

CyberChef-server uses a custom postinstall process due to upstream CyberChef's postinstall script not working when installed as a dependency:

```javascript
// package.json
"postinstall": "npm install cyberchef --no-save --ignore-scripts && node ./postinstall.js"
```

This approach can cause issues with updates. Recommended practice:
```bash
rm -rf node_modules package-lock.json
npm install  # Fresh install
```

## REST API Endpoints

### 1. GET /health

Server healthcheck endpoint.

**Response:**
```json
{
  "uptime": 1138.00,
  "message": "OK",
  "timestamp": "Thu Dec 17 2025 19:23:54 GMT+0000"
}
```

**Status Codes:**
- `200` - Server is healthy
- `503` - Server error

### 2. POST /bake

Execute a CyberChef recipe on a single input.

**Request Body:**
```json
{
  "input": "string",              // Required: input data
  "recipe": "string|object|array", // Required: operation(s)
  "outputType": "string"           // Optional: output data type
}
```

**Recipe Formats:**

#### Single Operation (Default Arguments)
```json
{
  "input": "One, two, three, four.",
  "recipe": "to decimal"
}
```

#### Single Operation (Named Arguments)
```json
{
  "input": "One, two, three, four.",
  "recipe": {
    "op": "to decimal",
    "args": {
      "delimiter": "Colon"
    }
  }
}
```

#### Single Operation (Positional Arguments)
```json
{
  "input": "One, two, three, four.",
  "recipe": {
    "op": "to decimal",
    "args": ["Colon"]
  }
}
```

#### Multi-Operation Chain
```json
{
  "input": "One, two, three, four.",
  "recipe": [
    {
      "op": "to decimal",
      "args": {
        "delimiter": "CRLF"
      }
    },
    {
      "op": "swap endianness",
      "args": ["Raw"]
    },
    "MD4"
  ]
}
```

**Response:**
```json
{
  "value": "79 110 101 44 32 116 119 111 44 32 116 104 114 101 101 44 32 102 111 117 114 46",
  "type": "string"
}
```

**Status Codes:**
- `200` - Bake successful
- `400` - Bad request (invalid recipe or input)

### 3. POST /batch/bake

Execute a CyberChef recipe on multiple inputs (batch processing).

**Request Body:**
```json
{
  "input": ["array", "of", "strings"],  // Required: array of inputs
  "recipe": "string|object|array",       // Required: operation(s)
  "outputType": "string"                 // Optional: output data type
}
```

**Example:**
```json
{
  "input": ["One", "two", "three", "four"],
  "recipe": {
    "op": "to decimal",
    "args": {
      "delimiter": "Colon"
    }
  }
}
```

**Response:**
```json
[
  {
    "success": true,
    "value": "79:110:101",
    "type": "string"
  },
  {
    "success": true,
    "value": "116:119:111",
    "type": "string"
  },
  {
    "success": true,
    "value": "116:104:114:101:101",
    "type": "string"
  },
  {
    "success": true,
    "value": "102:111:117:114",
    "type": "string"
  }
]
```

**Error Handling:**
- Individual items can fail without breaking the batch
- Recipe errors (TypeError) cause entire batch to fail
- Each result includes `success` field

**Status Codes:**
- `200` - Batch processed (individual items may have failed)
- `400` - Bad request (invalid recipe)

### 4. POST /magic

Automatic encoding/obfuscation detection using CyberChef's Magic operation.

**Request Body:**
```json
{
  "input": "string",      // Required: data to analyze
  "args": "object|array"  // Optional: Magic operation arguments
}
```

**Example:**
```json
{
  "input": "4f 6e 65 2c 20 74 77 6f 2c 20 74 68 72 65 65 2c 20 66 6f 75 72 2e",
  "args": {
    "depth": 1
  }
}
```

**Response:**
```json
{
  "type": 6,
  "value": [
    {
      "recipe": [
        { "op": "From Hex", "args": ["Space"] }
      ],
      "data": "One, two, three, four.",
      "languageScores": [
        { "lang": "en", "score": 442.77940826119266, "probability": 2.8158586573567845e-12 }
      ],
      "fileType": null,
      "isUTF8": true,
      "entropy": 3.5383105956150076,
      "matchingOps": [],
      "useful": false,
      "matchesCrib": null
    }
  ]
}
```

**Note:** Magic cannot be combined with other operations in the `/bake` endpoint.

## Docker Support

### Building the Image

```bash
git clone https://github.com/gchq/CyberChef-server
cd CyberChef-server
docker build -t cyberchef-server .
```

### Dockerfile Details

```dockerfile
FROM node:18.20.4-alpine
LABEL author="Wes Lambert, wlambertts@gmail.com"
LABEL description="Dockerised version of Cyberchef server"
LABEL copyright="Crown Copyright 2020"
LABEL license="Apache-2.0"
COPY . /CyberChef-server
WORKDIR /CyberChef-server
RUN npm cache clean --force && npm install
ENTRYPOINT ["npm", "--prefix", "/CyberChef-server", "run", "prod"]
```

### Running the Container

```bash
docker run -it --rm --name=cyberchef-server -p 3000:3000 cyberchef-server
```

The server will be available at `http://localhost:3000`.

### Production Deployment

Set `NODE_ENV=production` to enable:
- Helmet security headers
- Error-level logging (vs info-level)
- Production optimizations

```bash
docker run -it --rm \
  -e NODE_ENV=production \
  -p 3000:3000 \
  cyberchef-server
```

## Performance Characteristics

### Batch Processing

The `/batch/bake` endpoint processes each input sequentially using `Array.map()`:

```javascript
const retArr = req.body.input.map((input) => {
  try {
    const dish = bake(input, req.body.recipe);
    // ... handle result
  } catch (err) {
    // ... handle error
  }
});
```

**Performance Considerations:**
- Each item is baked independently
- Recipe errors cause immediate batch failure
- Individual item errors are caught and returned
- No parallel processing (sequential execution)
- No built-in rate limiting

### Scalability

For high-throughput scenarios, consider:
1. Load balancing across multiple container instances
2. Reverse proxy with rate limiting (nginx, Caddy)
3. Caching layer for repeated recipes
4. Async/parallel batch processing (requires modification)

## Integration Guidance for CyberChef-MCP

### Architectural Comparison

| Aspect | CyberChef-server (REST) | CyberChef-MCP (MCP Protocol) |
|--------|------------------------|------------------------------|
| **Protocol** | HTTP/REST | JSON-RPC over stdio |
| **Client Integration** | Any HTTP client | MCP-compatible clients (Claude, IDEs) |
| **Tool Discovery** | Swagger documentation | MCP `tools/list` |
| **Operation Exposure** | 4 endpoints (bake, batch, magic, health) | 300+ individual tools + meta-tools |
| **Recipe Format** | CyberChef JSON recipes | Individual tool calls or `cyberchef_bake` |
| **Batch Processing** | Native `/batch/bake` endpoint | Client-side orchestration |
| **Error Handling** | HTTP status codes | JSON-RPC error responses |
| **Documentation** | Swagger UI at root | Tool schemas in `tools/list` |
| **Deployment** | Standalone HTTP server | Embedded in MCP client |
| **Network** | Requires network access | Local stdio communication |
| **Statefulness** | Stateless HTTP | Persistent session |

### REST API Approach (CyberChef-server)

**Advantages:**
- Language-agnostic HTTP interface
- Standard REST patterns familiar to developers
- Easy integration with existing HTTP infrastructure
- Swagger UI for interactive testing
- Supports any HTTP client (curl, Postman, programming languages)
- Native batch processing endpoint
- Stateless design scales horizontally

**Limitations:**
- Network dependency (latency, security)
- No built-in tool discovery beyond Swagger
- Recipe format requires understanding CyberChef conventions
- All 300+ operations accessed through 1 endpoint (less granular)
- No type safety in API calls
- Manual error parsing from HTTP responses

### MCP Protocol Approach (CyberChef-MCP)

**Advantages:**
- Direct integration with AI assistants (Claude, etc.)
- 300+ operations exposed as individual tools with schemas
- Rich tool descriptions guide AI usage
- Type-safe JSON-RPC protocol
- Local stdio communication (no network required)
- Built-in tool discovery via `tools/list`
- `cyberchef_search` for operation lookup
- Persistent session state
- Streaming support via MCP

**Limitations:**
- Requires MCP-compatible client
- More complex deployment (stdio vs HTTP)
- No native batch processing (must be orchestrated)
- Limited to MCP ecosystem

### Lessons Learned from CyberChef-server

1. **Recipe Format Flexibility** - Supporting string, object, and array recipe formats reduces friction
2. **Batch Processing Value** - Native batch endpoint is essential for real-world use
3. **Error Handling Granularity** - Distinguish between recipe errors (fail entire batch) and item errors (continue processing)
4. **Type Conversion** - Optional `outputType` parameter provides flexibility
5. **Documentation First** - Swagger UI at root path makes API immediately discoverable
6. **Postinstall Complexity** - CyberChef's dependency structure requires custom installation logic

### Hybrid Deployment Scenarios

Both CyberChef-server and CyberChef-MCP can coexist:

#### Scenario 1: MCP for AI, REST for Services
```
┌─────────────┐
│ Claude/IDE  │──MCP──> CyberChef-MCP (stdio)
└─────────────┘

┌─────────────┐
│ CI/CD Jobs  │──HTTP──> CyberChef-server:3000
└─────────────┘
```

#### Scenario 2: MCP Server Wrapping REST API
```
MCP Client ──stdio──> MCP Adapter ──HTTP──> CyberChef-server
                       (converts MCP to REST)
```

#### Scenario 3: REST Gateway for MCP
```
HTTP Clients ──REST──> REST Adapter ──stdio──> CyberChef-MCP
                       (converts REST to MCP)
```

### Implementation Insights

#### What CyberChef-MCP Improves

1. **Granular Tool Exposure** - Each operation is a separate tool with its own schema
   - CyberChef-server: All ops via `/bake` endpoint
   - CyberChef-MCP: 300+ tools like `cyberchef_to_base64`, `cyberchef_aes_decrypt`

2. **AI Integration** - MCP protocol designed for AI assistants
   - CyberChef-server: Generic HTTP API
   - CyberChef-MCP: Tool schemas guide AI tool selection

3. **Type Safety** - JSON-RPC with schemas
   - CyberChef-server: JSON payloads without validation
   - CyberChef-MCP: Tool arguments validated against schemas

4. **Local Execution** - No network required
   - CyberChef-server: HTTP server (network dependency)
   - CyberChef-MCP: stdio communication (local process)

5. **Tool Discovery** - Built-in search
   - CyberChef-server: Swagger docs (manual browsing)
   - CyberChef-MCP: `cyberchef_search` tool (programmatic)

#### What CyberChef-server Does Better

1. **Batch Processing** - Native `/batch/bake` endpoint
   - CyberChef-server: Single request for multiple inputs
   - CyberChef-MCP: Multiple tool calls (client orchestration)

2. **Cross-Language Access** - Any HTTP client
   - CyberChef-server: curl, Python requests, Go http, etc.
   - CyberChef-MCP: Requires MCP client implementation

3. **Stateless Scaling** - Horizontal scaling
   - CyberChef-server: Load balance across instances
   - CyberChef-MCP: One process per session

4. **Recipe Chains** - Multi-operation recipes in single call
   - CyberChef-server: Native recipe array support
   - CyberChef-MCP: Use `cyberchef_bake` meta-tool

## Use Cases

### 1. Headless CyberChef Deployments

**Scenario:** Run CyberChef operations in server environments without a browser.

**Example - Data Forensics Pipeline:**
```bash
# Decode base64-encoded evidence
curl -X POST http://cyberchef:3000/bake \
  -H "Content-Type: application/json" \
  -d '{
    "input": "SGVsbG8gV29ybGQ=",
    "recipe": "from base64"
  }'
```

**Example - Log Analysis:**
```python
import requests

def decode_hex_logs(hex_data):
    response = requests.post('http://cyberchef-server:3000/bake', json={
        'input': hex_data,
        'recipe': {
            'op': 'From Hex',
            'args': {'delimiter': 'Space'}
        }
    })
    return response.json()['value']
```

### 2. API-Driven Automation

**Scenario:** Integrate CyberChef operations into automated workflows.

**Example - ETL Pipeline:**
```javascript
const axios = require('axios');

async function transformData(rawData) {
  const { data } = await axios.post('http://cyberchef-server:3000/bake', {
    input: rawData,
    recipe: [
      'from base64',
      { op: 'gunzip', args: [] },
      { op: 'parse json', args: [] }
    ]
  });
  return data.value;
}
```

### 3. CI/CD Pipeline Integration

**Scenario:** Validate encoded configurations during deployment.

**Example - GitHub Actions Workflow:**
```yaml
name: Validate Config
on: [push]
jobs:
  validate:
    runs-on: ubuntu-latest
    services:
      cyberchef:
        image: cyberchef-server:latest
        ports:
          - 3000:3000
    steps:
      - name: Decode and Validate
        run: |
          CONFIG=$(curl -X POST http://localhost:3000/bake \
            -H "Content-Type: application/json" \
            -d '{
              "input": "${{ secrets.ENCODED_CONFIG }}",
              "recipe": ["from base64", "gunzip"]
            }' | jq -r '.value')
          echo "$CONFIG" | jq . # Validate JSON
```

**Example - Jenkins Pipeline:**
```groovy
pipeline {
  agent any
  stages {
    stage('Decrypt Credentials') {
      steps {
        script {
          def response = httpRequest(
            url: 'http://cyberchef-server:3000/bake',
            httpMode: 'POST',
            contentType: 'APPLICATION_JSON',
            requestBody: """
              {
                "input": "${env.ENCRYPTED_CREDS}",
                "recipe": [
                  {"op": "AES Decrypt", "args": ["CBC", "${env.AES_KEY}", "..."]}
                ]
              }
            """
          )
          env.DECRYPTED_CREDS = readJSON(text: response.content).value
        }
      }
    }
  }
}
```

### 4. Batch Processing Services

**Scenario:** Process large datasets with consistent transformations.

**Example - Bulk Log Decoding:**
```python
import requests

def batch_decode_logs(encoded_logs):
    """Decode 1000+ hex-encoded log entries in one request."""
    response = requests.post('http://cyberchef-server:3000/batch/bake', json={
        'input': encoded_logs,  # List of 1000+ strings
        'recipe': [
            {'op': 'From Hex', 'args': {'delimiter': 'Space'}},
            {'op': 'Parse JSON', 'args': []}
        ]
    })

    results = response.json()
    successful = [r['value'] for r in results if r['success']]
    failed = [r for r in results if not r['success']]

    return successful, failed
```

**Example - Data Migration:**
```go
package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

type BatchRequest struct {
    Input  []string    `json:"input"`
    Recipe interface{} `json:"recipe"`
}

func migrateEncodedData(data []string) ([]string, error) {
    req := BatchRequest{
        Input:  data,
        Recipe: []string{"from base64", "to hex"},
    }

    body, _ := json.Marshal(req)
    resp, err := http.Post(
        "http://cyberchef-server:3000/batch/bake",
        "application/json",
        bytes.NewBuffer(body),
    )
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var results []struct {
        Success bool   `json:"success"`
        Value   string `json:"value"`
    }
    json.NewDecoder(resp.Body).Decode(&results)

    var migrated []string
    for _, r := range results {
        if r.Success {
            migrated = append(migrated, r.Value)
        }
    }
    return migrated, nil
}
```

### 5. Security Analysis Workflows

**Scenario:** Decode and analyze malicious payloads in isolated environments.

**Example - Malware Analysis:**
```bash
#!/bin/bash
# Analyze base64-encoded obfuscated script

ENCODED_PAYLOAD="SGVsbG8gV29ybGQhCg=="

# Use Magic to auto-detect encoding
MAGIC_RESULT=$(curl -s -X POST http://cyberchef:3000/magic \
  -H "Content-Type: application/json" \
  -d "{\"input\": \"$ENCODED_PAYLOAD\"}")

echo "Auto-detected recipe:"
echo "$MAGIC_RESULT" | jq '.value[0].recipe'

echo "Decoded payload:"
echo "$MAGIC_RESULT" | jq -r '.value[0].data'
```

### 6. Microservices Data Transformation

**Scenario:** Dedicated transformation service in microservices architecture.

**Example - Docker Compose:**
```yaml
version: '3.8'
services:
  cyberchef:
    image: cyberchef-server:latest
    restart: always
    environment:
      - NODE_ENV=production
    networks:
      - internal
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  api-gateway:
    image: nginx:alpine
    depends_on:
      - cyberchef
    networks:
      - internal
      - external
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2025-02-26 | Batch baking, improved Swagger spec |
| 1.0.0 | 2024-10-04 | ESM modules, Node 18+, code reorganization |

## References

- **CyberChef-server Repository:** https://github.com/gchq/CyberChef-server
- **CyberChef Main Project:** https://github.com/gchq/CyberChef
- **CyberChef Node API Docs:** https://github.com/gchq/CyberChef/wiki/Node-API
- **CyberChef Magic Operation:** https://github.com/gchq/CyberChef/wiki/Automatic-detection-of-encoded-data-using-CyberChef-Magic
- **MCP Protocol Specification:** https://modelcontextprotocol.io/
- **CyberChef-MCP Implementation:** /home/parobek/Code/CyberChef (this project)

## Conclusion

CyberChef-server demonstrates the value of exposing CyberChef's capabilities through a standard HTTP REST API, enabling cross-language integration and headless deployments. The CyberChef-MCP project builds on these lessons by providing:

- **Granular tool exposure** for AI assistant integration
- **Type-safe JSON-RPC protocol** for reliable communication
- **Local execution model** without network dependencies
- **Rich tool discovery** via MCP protocol

Both approaches serve complementary use cases: CyberChef-server excels at traditional HTTP-based automation and batch processing, while CyberChef-MCP provides AI-native integration with modern development tools.
