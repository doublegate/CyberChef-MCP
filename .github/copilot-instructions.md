# GitHub Copilot Custom Instructions for CyberChef MCP

## Project Overview
This repository hosts the **Model Context Protocol (MCP) Server** adaptation of CyberChef. The primary focus is to expose CyberChef's 300+ operations as executable tools for AI agents (Claude, Cursor AI, etc.) via the MCP protocol.

## Key Architecture Points

### Core Components
- **MCP Server Entry Point:** `src/node/mcp-server.mjs` - Initializes MCP server, loads operations, handles tool calls
- **CyberChef API Bridge:** `src/node/index.mjs` and `src/node/api.mjs` - Node.js interface to CyberChef operations
- **Operation Config:** `src/core/config/OperationConfig.json` - Generated metadata for all operations (auto-generated, don't edit directly)
- **Core Operations:** `src/core/operations/` - Individual CyberChef operation implementations

### Technology Stack
- **Runtime:** Node.js v22+ (Alpine Linux in Docker)
- **Protocol:** Model Context Protocol (MCP) via `@modelcontextprotocol/sdk`
- **Validation:** `zod` and `zod-to-json-schema` for input validation
- **Build System:** Grunt (legacy config generation) + NPM Scripts
- **Module System:** ES Modules (`.mjs` files)

## Critical Development Requirements

### Node.js v22+ Compatibility
- **ALWAYS** use `import ... with {type: "json"}` for JSON imports
- **NEVER** use `assert {type: "json"}` syntax (deprecated)
- **SlowBuffer Patches:** Dependencies `avsc` and `buffer-equal-constant-time` require patches in `Dockerfile.mcp` for Node v22+ compatibility

### Configuration Generation
Before running the server or tests, configuration files **must** be generated:
```bash
npx grunt configTests
```
This generates:
- `src/core/config/OperationConfig.json` - Operation metadata
- `src/node/index.mjs` - Node.js API exports

### NPM Scripts
- `npm run mcp` - Run MCP server locally
- `npm run build` - Production build
- `npm run test` - Run all tests (requires config generation first)
- `npm run lint` - Run ESLint
- `npm run lint:grammar` - Run cspell grammar check
- `npx grunt configTests` - Generate required config files

## Code Conventions

### Style Guidelines
- **Indentation:** 4 spaces per block
- **Identifiers:** CamelCase for objects/namespaces
- **Functions/Variables:** camelCase
- **Constants:** UNDERSCORE_UPPER_CASE
- **Encoding:** UTF-8 without BOM
- **Line Endings:** UNIX style (`\n`)
- **File Endings:** All source files must end with newline

### MCP Tool Naming
- Must be `snake_case`
- Prefix: `cyberchef_`
- Example: "To Base64" → `cyberchef_to_base64`

### Design Principles
1. **Client-side First:** Operations should be client-side when possible; avoid external API calls
2. **Minimize Latency:** Keep operation code client-side for performance
3. **Modular Dependencies:** Large libraries in separate modules to reduce bundle size
4. **Vanilla JS Preferred:** Avoid frameworks unless absolutely necessary

## Docker Build Process

### Production Docker Image
- **File:** `Dockerfile.mcp`
- **Base Image:** `node:22-alpine`
- **Key Steps:**
  1. Install dependencies with `npm ci --ignore-scripts`
  2. Apply SlowBuffer patches to `avsc` and `buffer-equal-constant-time`
  3. Run postinstall scripts
  4. Generate config with `npx grunt configTests`

### Building and Running
```bash
docker build -f Dockerfile.mcp -t cyberchef-mcp .
docker run -i --rm cyberchef-mcp
```
Note: The `-i` flag is critical to keep stdin open for MCP communication.

## Common Development Tasks

### Adding/Modifying MCP Tools
1. Modify the CyberChef operation in `src/core/operations/`
2. Regenerate config: `npx grunt configTests`
3. For tool mapping changes, edit `src/node/mcp-server.mjs`

### Testing Changes
```bash
# Generate config first
npx grunt configTests

# Run tests
npm run test

# Run linting
npm run lint
```

### Local Development
```bash
npm install
npx grunt configTests
npm run mcp  # Runs server on stdin/stdout
```

## Important Files Reference

- **README.md** - User-facing documentation
- **GEMINI.md** - Detailed project context for AI agents
- **docs/commands.md** - List of available MCP tools
- **docs/architecture.md** - Technical architecture documentation
- **src/node/mcp-server.mjs** - Main MCP server implementation
- **Dockerfile.mcp** - Production Docker build with Node v22 patches

## Troubleshooting Common Issues

### "SlowBuffer is not defined"
- Cause: Node modules haven't been patched for Node v22+
- Fix: See `Dockerfile.mcp` for required `sed` patches on `avsc` and `buffer-equal-constant-time`

### "Cannot find module .../OperationConfig.json"
- Cause: Configuration files not generated
- Fix: Run `npx grunt configTests`

### Container exits immediately
- Cause: Stdin not kept open
- Fix: Use `docker run -i --rm cyberchef-mcp` (note the `-i` flag)

### Import Assertion Errors
- Cause: Using deprecated `assert {type: "json"}` syntax
- Fix: Use `with {type: "json"}` instead for Node v22+ compatibility

## Contributing Guidelines

When reviewing or suggesting code changes:
1. Ensure Node.js v22+ compatibility (use `with` not `assert` for JSON imports)
2. Follow existing code style conventions (4 space indentation, camelCase)
3. Run `npx grunt configTests` after operation changes
4. Test with `npm run test` and `npm run lint`
5. For MCP changes, verify with local Docker build
6. Keep changes minimal and focused
7. Maintain client-side operation design when possible

## Security Considerations

- Never commit secrets or credentials
- Validate all MCP tool inputs using Zod schemas
- Follow CyberChef's principle of client-side operation when possible
- Review any new dependencies for vulnerabilities
- Test Docker patches don't introduce security issues

## Testing Strategy

- **Unit Tests:** Test individual operations
- **Integration Tests:** Test MCP server tool calls
- **Docker Build:** Verify production image builds and runs
- **CI/CD:** GitHub Actions validates builds on every push

## Documentation Standards

When updating documentation:
- Keep README.md user-focused (installation, usage)
- Keep GEMINI.md technical and comprehensive (architecture, troubleshooting)
- Update docs/commands.md when operations change
- Include code examples in markdown for clarity
