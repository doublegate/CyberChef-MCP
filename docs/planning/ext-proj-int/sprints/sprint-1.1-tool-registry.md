# Sprint 1.1: Tool Registry Foundation

## Sprint Overview

| Field | Value |
|-------|-------|
| Sprint | 1.1 |
| Phase | 1 - Foundation |
| Duration | 2 weeks |
| Start | Week 1 |
| End | Week 2 |

## Objectives

1. Design and implement the tool registry system
2. Define the base tool interface
3. Create tool loading infrastructure
4. Integrate registry with existing MCP server

## User Stories

### US-1.1.1: Tool Registry Core

**As a** developer integrating external tools
**I want** a centralized registry for managing tools
**So that** I can register, discover, and invoke tools uniformly

**Acceptance Criteria:**
- [ ] ToolRegistry class with register/get/list methods
- [ ] Category-based organization
- [ ] Name collision detection
- [ ] Validation on registration

### US-1.1.2: Base Tool Interface

**As a** developer creating new tools
**I want** a standard interface for tool implementation
**So that** all tools have consistent structure

**Acceptance Criteria:**
- [ ] BaseTool class with execute method
- [ ] Standard input schema definition
- [ ] Result format standardization
- [ ] Error handling patterns

### US-1.1.3: Tool Loader

**As a** system administrator
**I want** automatic tool discovery and loading
**So that** new tools are available without code changes

**Acceptance Criteria:**
- [ ] Dynamic module loading
- [ ] Directory scanning for tool modules
- [ ] Graceful handling of load failures
- [ ] Load order management

### US-1.1.4: MCP Server Integration

**As an** MCP client
**I want** external tools visible alongside CyberChef operations
**So that** I can use all tools through the same interface

**Acceptance Criteria:**
- [ ] External tools appear in tools/list
- [ ] tools/call routes to correct handler
- [ ] Consistent error format
- [ ] Logging integration

## Tasks

### Design (Day 1-2)

| ID | Task | Estimate | Assignee |
|----|------|----------|----------|
| T-1.1.1 | Design ToolRegistry API | 4h | - |
| T-1.1.2 | Design BaseTool interface | 2h | - |
| T-1.1.3 | Design loader mechanism | 2h | - |
| T-1.1.4 | Document integration points | 2h | - |

### Implementation (Day 3-8)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-1.1.5 | Implement ToolRegistry class | 8h | T-1.1.1 |
| T-1.1.6 | Implement BaseTool class | 4h | T-1.1.2 |
| T-1.1.7 | Implement ToolLoader | 6h | T-1.1.3 |
| T-1.1.8 | Implement category indexing | 4h | T-1.1.5 |
| T-1.1.9 | Add alias support | 2h | T-1.1.5 |
| T-1.1.10 | MCP server integration | 8h | T-1.1.5, T-1.1.7 |

### Testing (Day 9-10)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-1.1.11 | Unit tests for ToolRegistry | 4h | T-1.1.5 |
| T-1.1.12 | Unit tests for BaseTool | 2h | T-1.1.6 |
| T-1.1.13 | Integration tests | 4h | T-1.1.10 |
| T-1.1.14 | Documentation | 4h | All |

## Deliverables

### Files to Create

```
src/node/tools/
├── registry.mjs          # ToolRegistry class
├── base-tool.mjs         # BaseTool abstract class
├── loader.mjs            # ToolLoader for dynamic loading
└── index.mjs             # Re-exports
```

### Code Specifications

#### ToolRegistry (registry.mjs)

```javascript
/**
 * Central registry for all MCP tools
 */
export class ToolRegistry {
    #tools = new Map();
    #categories = new Map();
    #aliases = new Map();

    /**
     * Register a tool with the registry
     * @param {BaseTool} tool - Tool instance to register
     * @throws {Error} If tool name conflicts or validation fails
     */
    register(tool) {
        this.validateTool(tool);

        if (this.#tools.has(tool.name)) {
            throw new Error(`Tool '${tool.name}' is already registered`);
        }

        this.#tools.set(tool.name, tool);
        this.#addToCategory(tool.category, tool);

        if (tool.aliases) {
            for (const alias of tool.aliases) {
                this.#aliases.set(alias, tool.name);
            }
        }
    }

    /**
     * Get a tool by name or alias
     * @param {string} name - Tool name or alias
     * @returns {BaseTool|undefined}
     */
    get(name) {
        const resolved = this.#aliases.get(name) || name;
        return this.#tools.get(resolved);
    }

    /**
     * List all tools, optionally filtered by category
     * @param {string} [category] - Optional category filter
     * @returns {BaseTool[]}
     */
    list(category = null) {
        if (category) {
            return [...(this.#categories.get(category)?.values() || [])];
        }
        return [...this.#tools.values()];
    }

    /**
     * Get tool definitions for MCP tools/list
     * @returns {MCPToolDefinition[]}
     */
    getToolDefinitions() {
        return this.list().map(tool => tool.toMCPDefinition());
    }

    /**
     * Validate tool before registration
     * @private
     */
    validateTool(tool) {
        if (!tool.name) {
            throw new Error('Tool must have a name');
        }
        if (!tool.name.startsWith('cyberchef_')) {
            throw new Error("Tool name must start with 'cyberchef_'");
        }
        if (!tool.execute || typeof tool.execute !== 'function') {
            throw new Error('Tool must have an execute method');
        }
        if (!tool.inputSchema) {
            throw new Error('Tool must define inputSchema');
        }
    }

    #addToCategory(category, tool) {
        if (!this.#categories.has(category)) {
            this.#categories.set(category, new Map());
        }
        this.#categories.get(category).set(tool.name, tool);
    }
}
```

#### BaseTool (base-tool.mjs)

```javascript
/**
 * Abstract base class for all external tools
 */
export class BaseTool {
    constructor(config) {
        this.name = config.name;
        this.description = config.description;
        this.category = config.category;
        this.inputSchema = config.inputSchema;
        this.aliases = config.aliases || [];
        this.timeout = config.timeout || 30000;
    }

    /**
     * Execute the tool with given arguments
     * @abstract
     * @param {object} args - Tool arguments
     * @returns {Promise<ToolResult>}
     */
    async execute(args) {
        throw new Error('Subclass must implement execute()');
    }

    /**
     * Convert to MCP tool definition
     * @returns {MCPToolDefinition}
     */
    toMCPDefinition() {
        return {
            name: this.name,
            description: this.description,
            inputSchema: this.inputSchema
        };
    }

    /**
     * Format a successful result
     * @protected
     */
    successResult(output, metadata = {}) {
        return {
            success: true,
            output,
            metadata: {
                tool: this.name,
                executionTime: metadata.executionTime,
                ...metadata
            }
        };
    }

    /**
     * Format an error result
     * @protected
     */
    errorResult(error, code = 'EXECUTION_ERROR') {
        return {
            success: false,
            error: {
                code,
                message: error.message || String(error),
                tool: this.name
            }
        };
    }
}
```

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Code reviewed and approved
- [ ] Unit test coverage > 80%
- [ ] Integration tests passing
- [ ] Documentation complete
- [ ] No ESLint errors
- [ ] Performance meets requirements (<100ms registration)

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Dynamic loading complexity | High | Medium | Start with static imports, add dynamic later |
| Name collision with existing ops | Medium | Low | Prefix validation, registry checks |
| Performance overhead | Medium | Low | Lazy loading, caching |

## Dependencies

### External

- None (uses only native Node.js features)

### Internal

- `src/node/mcp-server.mjs` - Integration point

## Notes

- This sprint establishes the foundation for all subsequent tool integrations
- Design decisions here affect all Phase 2-4 work
- Focus on extensibility and maintainability over features

---

**Sprint Version:** 1.0.0
**Created:** 2025-12-17
