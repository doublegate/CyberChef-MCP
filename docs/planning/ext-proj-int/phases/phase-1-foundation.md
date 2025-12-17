# Phase 1: Foundation

## Overview

| Attribute | Value |
|-----------|-------|
| Phase Number | 1 |
| Title | Foundation Infrastructure |
| Duration | 3-4 weeks |
| Sprints | 3 (1.1, 1.2, 1.3) |
| Prerequisites | CyberChef-MCP v1.7.x operational |
| Deliverables | Tool registration system, testing framework, common utilities |

## Objectives

1. **Tool Registration System** - Extensible infrastructure for adding new MCP tools
2. **Testing Framework** - Comprehensive test patterns for external tool integrations
3. **Common Utilities** - Shared functions for encoding detection, validation, and formatting
4. **Documentation Standards** - Templates and guidelines for new tool documentation

## Sprint Breakdown

### Sprint 1.1: Tool Registration Infrastructure (1-1.5 weeks)

See [sprint-1.1-infrastructure.md](../sprints/sprint-1.1-infrastructure.md)

**Goal**: Create modular tool registration system

**Tasks**:
1. Design tool registry architecture
2. Implement ToolRegistry class
3. Create standard tool interface
4. Extend MCP server to load external tools
5. Add tool category management
6. Implement tool metadata system
7. Create tool loader mechanism

**Deliverables**:
- `src/node/tools/registry.mjs` - Tool registration system
- `src/node/tools/base-tool.mjs` - Base tool class
- Updated `src/node/mcp-server.mjs` with external tool support

### Sprint 1.2: Testing Framework Extensions (1 week)

See [sprint-1.2-testing.md](../sprints/sprint-1.2-testing.md)

**Goal**: Extend test infrastructure for external tools

**Tasks**:
1. Create test utilities for tool testing
2. Implement input/output validation helpers
3. Add performance benchmarking utilities
4. Create mock data generators
5. Set up integration test patterns
6. Define coverage requirements

**Deliverables**:
- `tests/tools/utils.mjs` - Test utilities
- `tests/tools/fixtures/` - Test fixtures
- `tests/tools/base-tool.test.mjs` - Base test patterns

### Sprint 1.3: Common Utilities (1 week)

See [sprint-1.3-utilities.md](../sprints/sprint-1.3-utilities.md)

**Goal**: Build shared utility functions

**Tasks**:
1. Implement encoding detection utility
2. Create input validation library
3. Build output formatting utilities
4. Add timeout management helpers
5. Create caching utilities
6. Implement error handling patterns

**Deliverables**:
- `src/node/tools/utils/encoding-detect.mjs`
- `src/node/tools/utils/validation.mjs`
- `src/node/tools/utils/formatting.mjs`
- `src/node/tools/utils/cache.mjs`

## Architecture Decisions

### Tool Registry Pattern

```javascript
// src/node/tools/registry.mjs
export class ToolRegistry {
    #tools = new Map();
    #categories = new Map();

    /**
     * Register a new tool
     * @param {MCPTool} tool - Tool to register
     */
    register(tool) {
        this.validateTool(tool);
        this.#tools.set(tool.name, tool);
        this.addToCategory(tool);
        log.info(`Registered tool: ${tool.name}`);
    }

    /**
     * Get all registered tools
     * @returns {MCPTool[]}
     */
    getAllTools() {
        return [...this.#tools.values()];
    }

    /**
     * Get tool by name
     * @param {string} name
     * @returns {MCPTool | undefined}
     */
    getTool(name) {
        return this.#tools.get(name);
    }

    /**
     * Get tools by category
     * @param {string} category
     * @returns {MCPTool[]}
     */
    getByCategory(category) {
        return this.#categories.get(category) || [];
    }

    /**
     * Validate tool definition
     * @param {MCPTool} tool
     */
    validateTool(tool) {
        if (!tool.name) throw new Error('Tool must have a name');
        if (!tool.name.startsWith('cyberchef_')) {
            throw new Error('Tool name must start with cyberchef_');
        }
        if (!tool.description) throw new Error('Tool must have a description');
        if (!tool.execute) throw new Error('Tool must have execute method');
        if (this.#tools.has(tool.name)) {
            throw new Error(`Tool ${tool.name} already registered`);
        }
    }

    #addToCategory(tool) {
        const category = tool.category || 'general';
        if (!this.#categories.has(category)) {
            this.#categories.set(category, []);
        }
        this.#categories.get(category).push(tool);
    }
}
```

### Base Tool Class

```javascript
// src/node/tools/base-tool.mjs
export class BaseTool {
    constructor(config) {
        this.name = config.name;
        this.description = config.description;
        this.category = config.category || 'general';
        this.inputSchema = config.inputSchema || this.defaultInputSchema();
        this.timeout = config.timeout || 5000;
    }

    defaultInputSchema() {
        return {
            type: 'object',
            properties: {
                input: {
                    type: 'string',
                    description: 'Input data'
                }
            },
            required: ['input']
        };
    }

    /**
     * Execute the tool
     * @param {object} args - Tool arguments
     * @returns {Promise<ToolResult>}
     */
    async execute(args) {
        throw new Error('execute() must be implemented');
    }

    /**
     * Validate input arguments
     * @param {object} args
     */
    validateArgs(args) {
        if (!args.input) {
            throw new Error('Input is required');
        }
    }

    /**
     * Format result
     * @param {any} output
     * @param {object} metadata
     * @returns {ToolResult}
     */
    formatResult(output, metadata = {}) {
        return {
            success: true,
            output,
            metadata: {
                tool: this.name,
                executionTime: metadata.executionTime || 0,
                ...metadata
            }
        };
    }

    /**
     * Format error
     * @param {Error} error
     * @returns {ToolResult}
     */
    formatError(error) {
        return {
            success: false,
            error: {
                code: error.code || 'TOOL_ERROR',
                message: error.message,
                tool: this.name
            }
        };
    }
}
```

### MCP Server Extension

```javascript
// src/node/mcp-server.mjs (additions)
import { ToolRegistry } from './tools/registry.mjs';
import { loadExternalTools } from './tools/loader.mjs';

// Initialize registry
const toolRegistry = new ToolRegistry();

// Load external tools
const externalTools = await loadExternalTools();
for (const tool of externalTools) {
    toolRegistry.register(tool);
}

// Extend tools/list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
    const cyberchefTools = generateCyberChefTools();
    const externalTools = toolRegistry.getAllTools().map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
    }));

    return {
        tools: [...cyberchefTools, ...externalTools]
    };
});

// Extend tools/call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Check external tools first
    const externalTool = toolRegistry.getTool(name);
    if (externalTool) {
        const result = await externalTool.execute(args);
        return formatMCPResponse(result);
    }

    // Fall back to CyberChef tools
    return handleCyberChefTool(name, args);
});
```

## Testing Strategy

### Unit Tests

```javascript
// tests/tools/registry.test.mjs
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../../src/node/tools/registry.mjs';

describe('ToolRegistry', () => {
    let registry;

    beforeEach(() => {
        registry = new ToolRegistry();
    });

    describe('register()', () => {
        it('should register a valid tool', () => {
            const tool = createMockTool('cyberchef_test_tool');
            registry.register(tool);
            expect(registry.getTool('cyberchef_test_tool')).toBe(tool);
        });

        it('should reject tools without cyberchef_ prefix', () => {
            const tool = createMockTool('invalid_tool');
            expect(() => registry.register(tool)).toThrow();
        });

        it('should reject duplicate tool names', () => {
            const tool = createMockTool('cyberchef_test_tool');
            registry.register(tool);
            expect(() => registry.register(tool)).toThrow();
        });
    });

    describe('getByCategory()', () => {
        it('should return tools by category', () => {
            const tool1 = createMockTool('cyberchef_test_1', 'crypto');
            const tool2 = createMockTool('cyberchef_test_2', 'crypto');
            const tool3 = createMockTool('cyberchef_test_3', 'encoding');

            registry.register(tool1);
            registry.register(tool2);
            registry.register(tool3);

            const cryptoTools = registry.getByCategory('crypto');
            expect(cryptoTools).toHaveLength(2);
        });
    });
});
```

### Integration Tests

```javascript
// tests/tools/integration.test.mjs
import { describe, it, expect } from 'vitest';
import { startMCPServer, callTool } from '../helpers/mcp-client.mjs';

describe('External Tool Integration', () => {
    let server;

    beforeAll(async () => {
        server = await startMCPServer();
    });

    afterAll(async () => {
        await server.close();
    });

    it('should list external tools via MCP', async () => {
        const tools = await server.listTools();
        const externalTools = tools.filter(t => t.name.includes('_auto_') ||
                                                t.name.includes('_xor_'));
        expect(externalTools.length).toBeGreaterThan(0);
    });

    it('should execute external tool via MCP', async () => {
        const result = await callTool('cyberchef_encoding_detect', {
            input: 'SGVsbG8gV29ybGQh'
        });
        expect(result.success).toBe(true);
        expect(result.output.detected).toBe('base64');
    });
});
```

## Dependencies

No new npm packages required for Phase 1.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking existing MCP functionality | Medium | High | Extensive regression tests |
| Performance degradation | Low | Medium | Benchmark before/after |
| Tool naming conflicts | Low | Low | Validation in registry |
| Memory leaks in registry | Low | Medium | Proper cleanup in tests |

## Success Criteria

1. Tool registry supports 100+ tools without degradation
2. All existing MCP tests pass
3. New test coverage > 90% for Phase 1 code
4. Documentation complete for all new modules
5. No breaking changes to existing API

## Acceptance Criteria

### Sprint 1.1
- [ ] ToolRegistry class implemented and tested
- [ ] BaseTool class implemented and tested
- [ ] MCP server extended with tool loading
- [ ] Tool loader mechanism working
- [ ] Unit tests passing (100%)

### Sprint 1.2
- [ ] Test utilities created
- [ ] Test fixtures available
- [ ] Integration test patterns documented
- [ ] Performance benchmarking setup
- [ ] Coverage reports generated

### Sprint 1.3
- [ ] Encoding detection utility working
- [ ] Input validation comprehensive
- [ ] Output formatting standardized
- [ ] Caching utilities tested
- [ ] Error handling patterns documented

## Timeline

```
Week 1: Sprint 1.1 (Infrastructure)
  - Days 1-2: Design and tool registry
  - Days 3-4: Base tool class and loader
  - Day 5: MCP server integration

Week 2: Sprint 1.2 (Testing)
  - Days 1-2: Test utilities
  - Days 3-4: Fixtures and patterns
  - Day 5: Coverage setup

Week 3: Sprint 1.3 (Utilities)
  - Days 1-2: Encoding detection
  - Days 3-4: Validation and formatting
  - Day 5: Caching and error handling

Week 4: Buffer/Polish
  - Integration testing
  - Documentation
  - Bug fixes
```

## Definition of Done

- All code reviewed and merged
- Unit tests passing with > 90% coverage
- Integration tests passing
- Documentation updated
- No known bugs
- Performance benchmarks established
- Ready for Phase 2

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Next Phase:** [Phase 2: JavaScript Native](phase-2-js-native.md)
