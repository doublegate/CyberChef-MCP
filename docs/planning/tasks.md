# Specific Tasks

## Setup
- [x] Run `npm install @modelcontextprotocol/sdk zod`
- [x] Add `"type": "module"` to `package.json` if not present (Already implicit/handled via .mjs and flags).

## Implementation: `src/node/mcp-server.mjs`
- [x] **Imports:** Set up imports for SDK, `index.mjs` (CyberChef API), and Config.
- [x] **Helper: `sanitizeToolName(name)`:** Function to convert "AES Decrypt" to `cyberchef_aes_decrypt`.
- [x] **Helper: `mapArgs(args)`:** Function to convert CyberChef arg types (`option`, `string`, `number`, `boolean`) to Zod types.
- [x] **Server Setup:** Initialize `new Server(...)`.
- [x] **`listTools` Handler:**
    - [x] Define `cyberchef_bake`.
    - [x] Loop through `OperationConfig`:
        - [x] Skip invalid/UI-only ops if necessary.
        - [x] Create tool definition using helpers.
- [x] **`callTool` Handler:**
    - [x] Case `cyberchef_bake`: Call `bake(input, recipe)`.
    - [x] Case `cyberchef_*`:
        - [x] Parse op name from tool name.
        - [x] Construct recipe `[{ op: opName, args: request.arguments }]`.
        - [x] Call `bake(input, recipe)`.
- [x] **Error Handling:** Wrap calls in try/catch and return MCP compliant errors.

## Docker
- [x] Create `Dockerfile.mcp` with `node:22-alpine` base.
- [x] Ensure `src/` structure is copied correctly.

## CI/CD
- [x] Create GitHub Action workflow (`.github/workflows/mcp-docker-build.yml`) to build and test the Docker image on push.

## Verification
- [x] Test "To Base64".
- [x] Test "Gunzip" (Implicitly via bake or tool availability).
- [x] Test a multi-step bake via `cyberchef_bake`.
