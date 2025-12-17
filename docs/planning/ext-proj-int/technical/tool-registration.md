# Tool Registration Technical Guide

## Overview

This guide documents the tool registration system for adding new MCP tools to CyberChef-MCP. The system provides a modular, extensible architecture for integrating external project functionality.

## Architecture

### Registration Flow

```
External Tool Module
        |
        v
   Tool Definition (name, schema, handler)
        |
        v
   ToolRegistry.register()
        |
        v
   Validation (naming, schema, conflicts)
        |
        v
   Category Index Update
        |
        v
   MCP Server Tool List Updated
```

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| ToolRegistry | `src/node/tools/registry.mjs` | Central tool registration and lookup |
| BaseTool | `src/node/tools/base-tool.mjs` | Base class for tool implementations |
| ToolLoader | `src/node/tools/loader.mjs` | Dynamic tool discovery and loading |
| MCP Integration | `src/node/mcp-server.mjs` | Exposes tools via MCP protocol |

## ToolRegistry Implementation

### Registry Class

```javascript
// src/node/tools/registry.mjs
import { log } from '../logging.mjs';

export class ToolRegistry {
    #tools = new Map();
    #categories = new Map();
    #aliases = new Map();

    /**
     * Register a new tool
     * @param {MCPTool} tool - Tool definition
     * @throws {Error} If validation fails
     */
    register(tool) {
        this.validateTool(tool);

        // Register main tool
        this.#tools.set(tool.name, tool);

        // Add to category index
        this.#addToCategory(tool);

        // Register aliases if present
        if (tool.aliases) {
            for (const alias of tool.aliases) {
                this.#aliases.set(alias, tool.name);
            }
        }

        log.info(`Registered tool: ${tool.name} (category: ${tool.category})`);
    }

    /**
     * Unregister a tool
     * @param {string} name - Tool name
     */
    unregister(name) {
        const tool = this.#tools.get(name);
        if (!tool) return;

        this.#tools.delete(name);
        this.#removeFromCategory(tool);

        // Remove aliases
        if (tool.aliases) {
            for (const alias of tool.aliases) {
                this.#aliases.delete(alias);
            }
        }

        log.info(`Unregistered tool: ${name}`);
    }

    /**
     * Get tool by name or alias
     * @param {string} name - Tool name or alias
     * @returns {MCPTool | undefined}
     */
    getTool(name) {
        // Check direct match
        if (this.#tools.has(name)) {
            return this.#tools.get(name);
        }

        // Check alias
        const actualName = this.#aliases.get(name);
        if (actualName) {
            return this.#tools.get(actualName);
        }

        return undefined;
    }

    /**
     * Get all registered tools
     * @returns {MCPTool[]}
     */
    getAllTools() {
        return [...this.#tools.values()];
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
     * Get all categories
     * @returns {string[]}
     */
    getCategories() {
        return [...this.#categories.keys()];
    }

    /**
     * Check if tool exists
     * @param {string} name
     * @returns {boolean}
     */
    hasTool(name) {
        return this.#tools.has(name) || this.#aliases.has(name);
    }

    /**
     * Get registry statistics
     * @returns {object}
     */
    getStats() {
        return {
            totalTools: this.#tools.size,
            categories: this.#categories.size,
            aliases: this.#aliases.size,
            byCategory: Object.fromEntries(
                [...this.#categories.entries()].map(([k, v]) => [k, v.length])
            )
        };
    }

    /**
     * Validate tool definition
     * @param {MCPTool} tool
     * @throws {Error} If validation fails
     */
    validateTool(tool) {
        // Required fields
        if (!tool.name) {
            throw new Error('Tool must have a name');
        }

        // Naming convention
        if (!tool.name.startsWith('cyberchef_')) {
            throw new Error(`Tool name must start with 'cyberchef_': ${tool.name}`);
        }

        // Name format (snake_case)
        if (!/^cyberchef_[a-z][a-z0-9_]*$/.test(tool.name)) {
            throw new Error(`Invalid tool name format: ${tool.name} (must be snake_case)`);
        }

        // Description required
        if (!tool.description) {
            throw new Error(`Tool ${tool.name} must have a description`);
        }

        // Execute method required
        if (!tool.execute || typeof tool.execute !== 'function') {
            throw new Error(`Tool ${tool.name} must have an execute method`);
        }

        // Input schema required
        if (!tool.inputSchema) {
            throw new Error(`Tool ${tool.name} must have an inputSchema`);
        }

        // Check for conflicts
        if (this.#tools.has(tool.name)) {
            throw new Error(`Tool ${tool.name} is already registered`);
        }

        // Check alias conflicts
        if (tool.aliases) {
            for (const alias of tool.aliases) {
                if (this.#aliases.has(alias) || this.#tools.has(alias)) {
                    throw new Error(`Alias ${alias} conflicts with existing tool/alias`);
                }
            }
        }
    }

    /**
     * Add tool to category index
     * @private
     */
    #addToCategory(tool) {
        const category = tool.category || 'general';
        if (!this.#categories.has(category)) {
            this.#categories.set(category, []);
        }
        this.#categories.get(category).push(tool);
    }

    /**
     * Remove tool from category index
     * @private
     */
    #removeFromCategory(tool) {
        const category = tool.category || 'general';
        const categoryTools = this.#categories.get(category);
        if (categoryTools) {
            const idx = categoryTools.findIndex(t => t.name === tool.name);
            if (idx >= 0) {
                categoryTools.splice(idx, 1);
            }
        }
    }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
```

## BaseTool Class

### Base Implementation

```javascript
// src/node/tools/base-tool.mjs

/**
 * Base class for MCP tools
 * All external tool integrations should extend this class
 */
export class BaseTool {
    /**
     * Create a new tool
     * @param {object} config - Tool configuration
     */
    constructor(config) {
        this.name = config.name;
        this.description = config.description;
        this.category = config.category || 'general';
        this.inputSchema = config.inputSchema || this.defaultInputSchema();
        this.timeout = config.timeout || 5000;
        this.version = config.version || '1.0.0';
        this.aliases = config.aliases || [];
    }

    /**
     * Default input schema (override in subclass)
     * @returns {object}
     */
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
     * Execute the tool (must override)
     * @param {object} args - Tool arguments
     * @returns {Promise<ToolResult>}
     */
    async execute(args) {
        throw new Error(`${this.name}: execute() must be implemented`);
    }

    /**
     * Validate input arguments
     * @param {object} args
     * @throws {Error} If validation fails
     */
    validateArgs(args) {
        // Check required fields from schema
        const required = this.inputSchema.required || [];
        for (const field of required) {
            if (args[field] === undefined) {
                throw new Error(`Missing required argument: ${field}`);
            }
        }

        // Type validation
        const properties = this.inputSchema.properties || {};
        for (const [key, spec] of Object.entries(properties)) {
            if (args[key] !== undefined) {
                this.validateType(key, args[key], spec);
            }
        }
    }

    /**
     * Validate argument type
     * @private
     */
    validateType(name, value, spec) {
        const type = spec.type;

        if (type === 'string' && typeof value !== 'string') {
            throw new Error(`Argument ${name} must be a string`);
        }
        if (type === 'integer' && !Number.isInteger(value)) {
            throw new Error(`Argument ${name} must be an integer`);
        }
        if (type === 'number' && typeof value !== 'number') {
            throw new Error(`Argument ${name} must be a number`);
        }
        if (type === 'boolean' && typeof value !== 'boolean') {
            throw new Error(`Argument ${name} must be a boolean`);
        }
        if (type === 'array' && !Array.isArray(value)) {
            throw new Error(`Argument ${name} must be an array`);
        }

        // Enum validation
        if (spec.enum && !spec.enum.includes(value)) {
            throw new Error(`Argument ${name} must be one of: ${spec.enum.join(', ')}`);
        }

        // Range validation
        if (spec.minimum !== undefined && value < spec.minimum) {
            throw new Error(`Argument ${name} must be >= ${spec.minimum}`);
        }
        if (spec.maximum !== undefined && value > spec.maximum) {
            throw new Error(`Argument ${name} must be <= ${spec.maximum}`);
        }
    }

    /**
     * Format successful result
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
                version: this.version,
                executionTime: metadata.executionTime || 0,
                ...metadata
            }
        };
    }

    /**
     * Format error result
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

    /**
     * Execute with timeout wrapper
     * @param {Function} fn - Function to execute
     * @param {number} timeout - Timeout in ms
     * @returns {Promise<any>}
     */
    async withTimeout(fn, timeout = this.timeout) {
        return Promise.race([
            fn(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Tool ${this.name} timed out after ${timeout}ms`)), timeout)
            )
        ]);
    }

    /**
     * Convert tool to MCP tool definition
     * @returns {object}
     */
    toMCPDefinition() {
        return {
            name: this.name,
            description: this.description,
            inputSchema: this.inputSchema
        };
    }
}
```

## Tool Loader

### Dynamic Loading

```javascript
// src/node/tools/loader.mjs
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { log } from '../logging.mjs';

/**
 * Load external tools from directory
 * @param {string} toolsDir - Directory containing tool modules
 * @returns {Promise<MCPTool[]>}
 */
export async function loadExternalTools(toolsDir = './src/node/tools') {
    const tools = [];
    const categories = ['pwntools', 'katana', 'cryptii', 'rsactftool', 'john', 'recipes'];

    for (const category of categories) {
        const categoryDir = path.join(toolsDir, category);

        if (!fs.existsSync(categoryDir)) {
            log.debug(`Tool category directory not found: ${categoryDir}`);
            continue;
        }

        try {
            // Load index.mjs from category directory
            const indexPath = path.join(categoryDir, 'index.mjs');

            if (fs.existsSync(indexPath)) {
                const moduleUrl = pathToFileURL(indexPath).href;
                const module = await import(moduleUrl);

                if (module.tools && Array.isArray(module.tools)) {
                    tools.push(...module.tools);
                    log.info(`Loaded ${module.tools.length} tools from ${category}`);
                }

                if (module.registerTools && typeof module.registerTools === 'function') {
                    const categoryTools = await module.registerTools();
                    tools.push(...categoryTools);
                    log.info(`Loaded ${categoryTools.length} tools via registerTools() from ${category}`);
                }
            }
        } catch (error) {
            log.error(`Failed to load tools from ${category}: ${error.message}`);
        }
    }

    return tools;
}

/**
 * Load a single tool module
 * @param {string} modulePath - Path to tool module
 * @returns {Promise<MCPTool | null>}
 */
export async function loadToolModule(modulePath) {
    try {
        const moduleUrl = pathToFileURL(modulePath).href;
        const module = await import(moduleUrl);

        if (module.default && module.default.name) {
            return module.default;
        }

        if (module.tool && module.tool.name) {
            return module.tool;
        }

        return null;
    } catch (error) {
        log.error(`Failed to load tool module ${modulePath}: ${error.message}`);
        return null;
    }
}
```

## MCP Server Integration

### Extending MCP Server

```javascript
// src/node/mcp-server.mjs (additions)
import { toolRegistry } from './tools/registry.mjs';
import { loadExternalTools } from './tools/loader.mjs';

// Initialize external tools on startup
async function initializeExternalTools() {
    const externalTools = await loadExternalTools();

    for (const tool of externalTools) {
        try {
            toolRegistry.register(tool);
        } catch (error) {
            log.warn(`Failed to register tool ${tool.name}: ${error.message}`);
        }
    }

    log.info(`External tools initialized: ${toolRegistry.getStats().totalTools} total`);
}

// Extended tools/list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Get CyberChef operation tools
    const cyberchefTools = generateCyberChefTools();

    // Get external tools
    const externalTools = toolRegistry.getAllTools().map(tool => tool.toMCPDefinition());

    return {
        tools: [...cyberchefTools, ...externalTools]
    };
});

// Extended tools/call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Check external tools first (allows overriding)
    const externalTool = toolRegistry.getTool(name);
    if (externalTool) {
        try {
            const startTime = Date.now();
            const result = await externalTool.execute(args);
            const executionTime = Date.now() - startTime;

            return formatMCPResponse({
                ...result,
                metadata: { ...result.metadata, executionTime }
            });
        } catch (error) {
            return formatMCPError(error, name);
        }
    }

    // Fall back to CyberChef tools
    return handleCyberChefTool(name, args);
});

// Initialize on startup
await initializeExternalTools();
```

## Creating New Tools

### Example: Complete Tool Implementation

```javascript
// src/node/tools/example/my-tool.mjs
import { BaseTool } from '../base-tool.mjs';

class MyTool extends BaseTool {
    constructor() {
        super({
            name: 'cyberchef_my_tool',
            description: 'Example tool demonstrating registration pattern',
            category: 'example',
            version: '1.0.0',
            inputSchema: {
                type: 'object',
                properties: {
                    input: {
                        type: 'string',
                        description: 'Input data to process'
                    },
                    option: {
                        type: 'string',
                        enum: ['a', 'b', 'c'],
                        default: 'a',
                        description: 'Processing option'
                    }
                },
                required: ['input']
            }
        });
    }

    async execute(args) {
        // Validate arguments
        this.validateArgs(args);

        try {
            // Process input
            const result = await this.withTimeout(async () => {
                return this.process(args.input, args.option || 'a');
            });

            return this.formatResult(result, {
                inputLength: args.input.length,
                option: args.option || 'a'
            });
        } catch (error) {
            return this.formatError(error);
        }
    }

    process(input, option) {
        // Implementation
        switch (option) {
            case 'a': return input.toUpperCase();
            case 'b': return input.toLowerCase();
            case 'c': return input.split('').reverse().join('');
            default: return input;
        }
    }
}

export default new MyTool();
```

### Category Index File

```javascript
// src/node/tools/example/index.mjs
import myTool from './my-tool.mjs';
import anotherTool from './another-tool.mjs';

// Export as array
export const tools = [myTool, anotherTool];

// Or export registration function
export async function registerTools() {
    return [myTool, anotherTool];
}
```

## Naming Conventions

### Tool Names

| Pattern | Example | Use Case |
|---------|---------|----------|
| `cyberchef_<category>_<action>` | `cyberchef_crypto_xor_brute` | Category-specific tools |
| `cyberchef_<action>_<target>` | `cyberchef_detect_encoding` | Detection tools |
| `cyberchef_<source>_<action>` | `cyberchef_pwntools_pack` | Source attribution |

### Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `crypto` | Cryptographic operations | RSA attacks, cipher detection |
| `encoding` | Encoding/decoding | Base variants, multi-layer |
| `binary` | Binary manipulation | Pack/unpack, hexdump |
| `analysis` | Data analysis | Entropy, frequency |
| `detection` | Auto-detection | Encoding, cipher, file type |
| `recipes` | Recipe management | List, search, run |

## Error Handling

### Standard Error Codes

| Code | Description | When to Use |
|------|-------------|-------------|
| `INVALID_INPUT` | Input validation failed | Missing/malformed arguments |
| `TIMEOUT` | Operation timed out | Long-running operations |
| `TOOL_ERROR` | General tool error | Implementation errors |
| `NOT_FOUND` | Resource not found | Recipe not found, etc. |
| `INCOMPATIBLE` | Incompatible operation | Node.js API limitations |

### Error Format

```javascript
{
    success: false,
    error: {
        code: 'INVALID_INPUT',
        message: 'Input must be a valid hex string',
        tool: 'cyberchef_from_hex',
        details: {
            field: 'input',
            received: 'invalid!@#',
            expected: 'hexadecimal string'
        }
    }
}
```

## Testing Tools

### Test Pattern

```javascript
// tests/tools/example/my-tool.test.mjs
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { toolRegistry } from '../../../src/node/tools/registry.mjs';
import myTool from '../../../src/node/tools/example/my-tool.mjs';

describe('MyTool', () => {
    beforeAll(() => {
        toolRegistry.register(myTool);
    });

    afterAll(() => {
        toolRegistry.unregister(myTool.name);
    });

    describe('registration', () => {
        it('should be registered in registry', () => {
            expect(toolRegistry.hasTool('cyberchef_my_tool')).toBe(true);
        });

        it('should have correct category', () => {
            const tool = toolRegistry.getTool('cyberchef_my_tool');
            expect(tool.category).toBe('example');
        });
    });

    describe('execute()', () => {
        it('should process input with default option', async () => {
            const result = await myTool.execute({ input: 'hello' });
            expect(result.success).toBe(true);
            expect(result.output).toBe('HELLO');
        });

        it('should handle option b', async () => {
            const result = await myTool.execute({ input: 'HELLO', option: 'b' });
            expect(result.output).toBe('hello');
        });

        it('should fail on missing input', async () => {
            const result = await myTool.execute({});
            expect(result.success).toBe(false);
            expect(result.error.code).toBe('TOOL_ERROR');
        });
    });
});
```

## Best Practices

### Do

1. Extend `BaseTool` for consistent behavior
2. Use `validateArgs()` for input validation
3. Use `withTimeout()` for potentially long operations
4. Return proper `formatResult()` or `formatError()` responses
5. Include meaningful metadata in results
6. Document inputSchema thoroughly
7. Add comprehensive tests

### Don't

1. Don't hardcode timeouts (use configurable values)
2. Don't swallow errors silently
3. Don't modify global state
4. Don't use blocking I/O without async
5. Don't exceed 100KB response size without pagination
6. Don't use non-standard dependencies without approval

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
