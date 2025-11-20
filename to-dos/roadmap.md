# Project Roadmap

## Phase 1: Foundation & Core Tools
**Goal:** Get a basic MCP server running that exposes the `bake` capability.
- [x] Install MCP SDK dependencies.
- [x] Create `src/node/mcp-server.mjs`.
- [x] Implement `cyberchef_bake` tool (generic input/recipe execution).
- [x] Implement `cyberchef_search` tool (wrapping `help()` function).
- [x] Verify basic connectivity via stdio.

## Phase 2: Dynamic Tool Mapping
**Goal:** Expose specific CyberChef operations as individual tools.
- [x] Implement argument type mapping (CyberChef Args -> Zod Schema).
- [x] Dynamic registration loop in `listTools` handler.
- [x] Dynamic dispatch logic in `callTool` handler.
- [x] Handle edge cases (Option mapping, Defaults).

## Phase 3: Dockerization
**Goal:** specific container image for the MCP server.
- [x] Create `Dockerfile.mcp`.
- [x] Build and test the container locally (Tested code, Dockerfile created).

## Phase 4: Polish & Documentation
**Goal:** Ensure usability and stability.
- [x] Add comprehensive descriptions to tools (Used descriptions from Config).
- [x] Create `README_MCP.md` with usage instructions.
- [x] Clean up code and add comments.
- [x] Add `mcp` script to `package.json`.