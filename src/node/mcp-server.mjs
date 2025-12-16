/**
 * MCP Server entry point.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { bake, help } from "./index.mjs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import OperationConfig from "../core/config/OperationConfig.json" with {type: "json"};
import { createHash } from "crypto";

// New v1.5.0 imports
import {
    CyberChefMCPError,
    createInputError,
    createOperationNotFoundError
} from "./errors.mjs";
import {
    initLogger,
    getLogger,
    logRequestStart,
    logRequestComplete,
    logRequestError,
    logCache,
    logMemory,
    logStreaming,
    logServerStart
} from "./logger.mjs";
import {
    determineStreamingStrategy
} from "./streaming.mjs";
import {
    executeWithTimeoutAndRetry,
    RetryConfig
} from "./retry.mjs";

// New v1.6.0 imports
import { recipeManager } from "./recipe-manager.mjs";

// Performance configuration (configurable via environment variables)
const VERSION = "1.6.0";
const MAX_INPUT_SIZE = parseInt(process.env.CYBERCHEF_MAX_INPUT_SIZE, 10) || 100 * 1024 * 1024; // 100MB default
const OPERATION_TIMEOUT = parseInt(process.env.CYBERCHEF_OPERATION_TIMEOUT, 10) || 30000; // 30s default
const STREAMING_THRESHOLD = parseInt(process.env.CYBERCHEF_STREAMING_THRESHOLD, 10) || 10 * 1024 * 1024; // 10MB default
const ENABLE_STREAMING = process.env.CYBERCHEF_ENABLE_STREAMING !== "false"; // Enabled by default
const ENABLE_WORKERS = process.env.CYBERCHEF_ENABLE_WORKERS !== "false"; // Enabled by default
const CACHE_MAX_SIZE = parseInt(process.env.CYBERCHEF_CACHE_MAX_SIZE, 10) || 100 * 1024 * 1024; // 100MB default
const CACHE_MAX_ITEMS = parseInt(process.env.CYBERCHEF_CACHE_MAX_ITEMS, 10) || 1000;

/**
 * Simple LRU Cache for operation results.
 */
class LRUCache {
    /**
     * Create a new LRU cache.
     *
     * @param {number} maxSize - Maximum total size in bytes.
     * @param {number} maxItems - Maximum number of items.
     */
    constructor(maxSize = CACHE_MAX_SIZE, maxItems = CACHE_MAX_ITEMS) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.maxItems = maxItems;
        this.currentSize = 0;
    }

    /**
     * Generate a cache key from operation parameters.
     *
     * @param {string} operation - Operation name.
     * @param {string} input - Input data.
     * @param {Array} args - Operation arguments.
     * @returns {string} SHA256 hash of the parameters.
     */
    getCacheKey(operation, input, args) {
        const hash = createHash("sha256");
        hash.update(operation);
        hash.update(input.substring(0, 1000)); // Use first 1KB for hash
        hash.update(JSON.stringify(args));
        return hash.digest("hex");
    }

    /**
     * Get a value from the cache.
     *
     * @param {string} key - Cache key.
     * @returns {any} Cached value or null if not found.
     */
    get(key) {
        if (!this.cache.has(key)) return null;
        const item = this.cache.get(key);
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.value;
    }

    /**
     * Store a value in the cache.
     *
     * @param {string} key - Cache key.
     * @param {any} value - Value to cache.
     */
    set(key, value) {
        const size = Buffer.byteLength(JSON.stringify(value));

        // Don't cache if value is too large
        if (size > this.maxSize / 10) return;

        // Evict oldest items if needed
        while (this.cache.size >= this.maxItems || this.currentSize + size > this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            const oldItem = this.cache.get(oldestKey);
            this.currentSize -= oldItem.size;
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, { value, size });
        this.currentSize += size;
    }

    /**
     * Clear the cache.
     */
    clear() {
        this.cache.clear();
        this.currentSize = 0;
    }

    /**
     * Get cache statistics.
     *
     * @returns {Object} Cache statistics including items, size, maxSize, maxItems.
     */
    getStats() {
        return {
            items: this.cache.size,
            size: this.currentSize,
            maxSize: this.maxSize,
            maxItems: this.maxItems
        };
    }
}

/**
 * Simple Buffer Pool for memory optimization.
 * Reserved for future use - currently commented out to avoid unused code warnings.
 */
// class BufferPool {
//     /**
//      * Create a new buffer pool.
//      */
//     constructor() {
//         this.pools = new Map(); // size -> buffer array
//     }
//
//     /**
//      * Acquire a buffer from the pool.
//      *
//      * @param {number} size - Buffer size in bytes.
//      * @returns {Buffer} A buffer of the requested size.
//      */
//     acquire(size) {
//         const pool = this.pools.get(size);
//         if (pool && pool.length > 0) {
//             return pool.pop();
//         }
//         return Buffer.allocUnsafe(size);
//     }
//
//     /**
//      * Release a buffer back to the pool.
//      *
//      * @param {Buffer} buffer - Buffer to release.
//      */
//     release(buffer) {
//         if (!buffer) return;
//         buffer.fill(0); // Clear before reuse
//         const size = buffer.length;
//         if (!this.pools.has(size)) {
//             this.pools.set(size, []);
//         }
//         const pool = this.pools.get(size);
//         // Limit pool size to prevent memory bloat
//         if (pool.length < 10) {
//             pool.push(buffer);
//         }
//     }
//
//     /**
//      * Clear the buffer pool.
//      */
//     clear() {
//         this.pools.clear();
//     }
// }

/**
 * Memory monitor for resource tracking.
 */
class MemoryMonitor {
    /**
     * Create a new memory monitor.
     */
    constructor() {
        this.lastCheck = Date.now();
        this.checkInterval = 5000; // Check every 5 seconds
    }

    /**
     * Check memory usage and log if interval elapsed.
     *
     * @returns {Object|undefined} Memory usage object or undefined if not checked.
     */
    check() {
        const now = Date.now();
        if (now - this.lastCheck < this.checkInterval) return;

        this.lastCheck = now;
        const usage = process.memoryUsage();

        // Log memory usage with structured logging
        logMemory(usage);

        return usage;
    }

    /**
     * Get current memory usage.
     *
     * @returns {Object} Memory usage object.
     */
    getUsage() {
        return process.memoryUsage();
    }
}

// Global instances
const operationCache = new LRUCache();
// const bufferPool = new BufferPool(); // Reserved for future use
const memoryMonitor = new MemoryMonitor();

// CPU-intensive operations that benefit from worker threads (reserved for future use)
// const CPU_INTENSIVE_OPERATIONS = new Set([
//     "AES Decrypt", "AES Encrypt",
//     "DES Decrypt", "DES Encrypt",
//     "Triple DES Decrypt", "Triple DES Encrypt",
//     "RSA Decrypt", "RSA Encrypt", "RSA Sign", "RSA Verify",
//     "Bcrypt", "Scrypt",
//     "Gzip", "Gunzip", "Bzip2 Decompress", "Bzip2 Compress",
//     "SHA1", "SHA2", "SHA3", "MD2", "MD4", "MD5", "MD6",
//     "Whirlpool", "BLAKE2b", "BLAKE2s",
//     "Generate RSA Key Pair", "Generate PGP Key Pair"
// ]);

// Note: STREAMING_OPERATIONS is now imported from streaming.mjs

const server = new Server(
    {
        name: "cyberchef-mcp",
        version: VERSION,
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * Sanitize tool name to be MCP compatible.
 *
 * @param {string} name - The original operation name.
 * @returns {string|null} The sanitized name or null if invalid.
 */
function sanitizeToolName(name) {
    if (!name) return null;
    const sanitized = "cyberchef_" + name.toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
    if (sanitized === "cyberchef_") return null;
    return sanitized;
}

/**
 * Map CyberChef arguments to Zod schema.
 *
 * @param {Array} args - The arguments from OperationConfig.
 * @returns {Object} The Zod schema object.
 */
function mapArgsToZod(args) {
    const schema = {};
    args.forEach((arg) => {
        const name = arg.name.toLowerCase().replace(/ /g, "_");
        let zodType;
        let description = arg.type || "";

        switch (arg.type) {
            case "boolean":
                zodType = z.boolean();
                break;
            case "number":
            case "integer":
                zodType = z.number();
                break;
            case "option":
                // Strict enum
                if (Array.isArray(arg.value) && arg.value.length > 0) {
                    const options = arg.value.map(v => {
                        if (typeof v === "string") return v;
                        return v.name || String(v);
                    });
                    zodType = z.enum([options[0], ...options.slice(1)]);
                } else {
                    zodType = z.string();
                }
                break;
            case "editableOption":
                // String, but we will try to match option names in execution
                zodType = z.string();
                if (Array.isArray(arg.value) && arg.value.length > 0) {
                    const options = arg.value.map(v => (typeof v === "string" ? v : v.name)).join(", ");
                    description += ` (Options: ${options})`;
                }
                break;
            default:
                zodType = z.string();
        }

        zodType = zodType.optional().describe(description);
        schema[name] = zodType;
    });

    schema.input = z.string().describe("The input data to process");
    return schema;
}

/**
 * Resolve argument value handling defaults and options.
 *
 * @param {Object} argDef - The argument definition.
 * @param {any} userValue - The user provided value.
 * @returns {any} The resolved value.
 */
function resolveArgValue(argDef, userValue) {
    // 1. Handle Defaults if userValue is undefined
    if (userValue === undefined) {
        const defaultVal = argDef.value; // Fallback

        if (Array.isArray(argDef.value)) {
            const idx = argDef.defaultIndex !== undefined ? argDef.defaultIndex : 0;
            if (argDef.value[idx] !== undefined) {
                const opt = argDef.value[idx];
                // Use .value if present, else .name/string
                return (typeof opt === "object" && opt.value !== undefined) ? opt.value : (opt.name || opt);
            }
        }
        return defaultVal;
    }

    // 2. Handle User Provided Value
    // If it's an option/editableOption, we might need to map name -> value
    if ((argDef.type === "option" || argDef.type === "editableOption") && Array.isArray(argDef.value)) {
        // Try to find a match by Name
        const match = argDef.value.find(v => {
            const optName = (typeof v === "string") ? v : v.name;
            return optName === userValue;
        });

        if (match) {
            return (typeof match === "object" && match.value !== undefined) ? match.value : (match.name || match);
        }

        // If not found
        if (argDef.type === "option") {
            // For strict option, if it's not in the list, we still return userValue
            // (zod validation passed, so it matches one of the names, so it SHOULD have been found above).
            return userValue;
        }

        // For editableOption, if not found, treat as custom value
        return userValue;
    }

    return userValue;
}

/**
 * Check if input exceeds maximum allowed size.
 *
 * @param {string} input - The input data.
 * @throws {CyberChefMCPError} If input is too large.
 */
function validateInputSize(input) {
    const size = Buffer.byteLength(input, "utf8");
    if (size > MAX_INPUT_SIZE) {
        throw createInputError(
            `Input size (${Math.round(size / 1024 / 1024)}MB) exceeds maximum allowed size (${Math.round(MAX_INPUT_SIZE / 1024 / 1024)}MB)`,
            {
                inputSize: size,
                maxSize: MAX_INPUT_SIZE
            }
        );
    }
}

// Note: withTimeout and executeWithStreaming have been replaced by:
// - executeWithTimeoutAndRetry in retry.mjs
// - executeWithStreamingStrategy in streaming.mjs

server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
        {
            name: "cyberchef_bake",
            description: "Execute a CyberChef recipe. Use this for complex chains of operations.",
            inputSchema: zodToJsonSchema(z.object({
                input: z.string().describe("The input data"),
                recipe: z.array(z.object({
                    op: z.string().describe("Operation name"),
                    args: z.array(z.any()).optional().describe("Arguments for the operation")
                })).describe("List of operations to perform")
            }))
        },
        {
            name: "cyberchef_search",
            description: "Search for available CyberChef operations.",
            inputSchema: zodToJsonSchema(z.object({
                query: z.string().describe("Search query")
            }))
        },
        // Recipe management tools (v1.6.0)
        {
            name: "cyberchef_recipe_create",
            description: "Create a new recipe with multiple operations.",
            inputSchema: zodToJsonSchema(z.object({
                name: z.string().describe("Recipe name"),
                description: z.string().optional().describe("Recipe description"),
                operations: z.array(z.object({
                    op: z.string().optional().describe("Operation name"),
                    args: z.record(z.any()).optional().describe("Operation arguments"),
                    recipe: z.string().optional().describe("Reference to another recipe ID")
                })).describe("List of operations"),
                tags: z.array(z.string()).optional().describe("Recipe tags"),
                author: z.string().optional().describe("Author email"),
                metadata: z.object({
                    complexity: z.string().optional(),
                    estimatedTime: z.string().optional(),
                    category: z.string().optional()
                }).optional()
            }))
        },
        {
            name: "cyberchef_recipe_get",
            description: "Get a recipe by ID.",
            inputSchema: zodToJsonSchema(z.object({
                id: z.string().uuid().describe("Recipe UUID")
            }))
        },
        {
            name: "cyberchef_recipe_list",
            description: "List all recipes with optional filtering.",
            inputSchema: zodToJsonSchema(z.object({
                tag: z.string().optional().describe("Filter by tag"),
                category: z.string().optional().describe("Filter by category"),
                search: z.string().optional().describe("Search in name/description"),
                limit: z.number().optional().describe("Maximum results"),
                offset: z.number().optional().describe("Pagination offset")
            }))
        },
        {
            name: "cyberchef_recipe_update",
            description: "Update an existing recipe.",
            inputSchema: zodToJsonSchema(z.object({
                id: z.string().uuid().describe("Recipe UUID"),
                name: z.string().optional().describe("New recipe name"),
                description: z.string().optional().describe("New description"),
                operations: z.array(z.object({
                    op: z.string().optional(),
                    args: z.record(z.any()).optional(),
                    recipe: z.string().optional()
                })).optional().describe("New operations"),
                tags: z.array(z.string()).optional().describe("New tags"),
                metadata: z.object({
                    complexity: z.string().optional(),
                    estimatedTime: z.string().optional(),
                    category: z.string().optional()
                }).optional()
            }))
        },
        {
            name: "cyberchef_recipe_delete",
            description: "Delete a recipe by ID.",
            inputSchema: zodToJsonSchema(z.object({
                id: z.string().uuid().describe("Recipe UUID")
            }))
        },
        {
            name: "cyberchef_recipe_execute",
            description: "Execute a saved recipe with input data.",
            inputSchema: zodToJsonSchema(z.object({
                id: z.string().uuid().describe("Recipe UUID"),
                input: z.string().describe("Input data to process")
            }))
        },
        {
            name: "cyberchef_recipe_export",
            description: "Export a recipe to various formats (json, yaml, url, cyberchef).",
            inputSchema: zodToJsonSchema(z.object({
                id: z.string().uuid().describe("Recipe UUID"),
                format: z.enum(["json", "yaml", "url", "cyberchef"]).describe("Export format")
            }))
        },
        {
            name: "cyberchef_recipe_import",
            description: "Import a recipe from various formats.",
            inputSchema: zodToJsonSchema(z.object({
                data: z.string().describe("Recipe data to import"),
                format: z.enum(["json", "yaml", "url", "cyberchef"]).describe("Import format")
            }))
        },
        {
            name: "cyberchef_recipe_validate",
            description: "Validate a recipe without saving it.",
            inputSchema: zodToJsonSchema(z.object({
                recipe: z.object({
                    name: z.string(),
                    operations: z.array(z.object({
                        op: z.string().optional(),
                        args: z.record(z.any()).optional(),
                        recipe: z.string().optional()
                    }))
                }).describe("Recipe to validate")
            }))
        },
        {
            name: "cyberchef_recipe_test",
            description: "Test a recipe with sample inputs.",
            inputSchema: zodToJsonSchema(z.object({
                recipe: z.object({
                    name: z.string(),
                    operations: z.array(z.object({
                        op: z.string().optional(),
                        args: z.record(z.any()).optional(),
                        recipe: z.string().optional()
                    }))
                }).describe("Recipe to test"),
                testInputs: z.array(z.string()).describe("Array of test inputs")
            }))
        }
    ];

    Object.keys(OperationConfig).forEach(opName => {
        const op = OperationConfig[opName];
        const toolName = sanitizeToolName(opName);
        if (!toolName) return;

        try {
            const argsSchema = mapArgsToZod(op.args || []);
            tools.push({
                name: toolName,
                description: op.description || opName,
                inputSchema: zodToJsonSchema(z.object(argsSchema))
            });
        } catch (e) {
            // Log schema generation failures for debugging
            const logger = getLogger();
            logger.warn({
                operation: opName,
                toolName,
                argCount: (op.args || []).length,
                error: e.message,
                event: "schema_generation_failed"
            }, `Schema generation failed for operation: ${opName}`);
            // Skip this operation and continue with others
        }
    });

    return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Start request tracking
    const requestId = logRequestStart(name, args);

    try {
        // Check memory periodically
        memoryMonitor.check();

        // Handle meta-tools
        if (name === "cyberchef_bake") {
            // Validate input size
            validateInputSize(args.input);

            // Execute with timeout and retry
            const result = await executeWithTimeoutAndRetry(
                () => bake(args.input, args.recipe),
                OPERATION_TIMEOUT,
                { requestId, maxRetries: RetryConfig.MAX_RETRIES, context: { tool: name } }
            );

            const output = typeof result.value === "string" ? result.value : JSON.stringify(result.value);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        if (name === "cyberchef_search") {
            const results = help(args.query);
            const output = JSON.stringify(results, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        // Handle recipe management tools (v1.6.0)
        if (name === "cyberchef_recipe_create") {
            const recipe = await recipeManager.createRecipe(args);
            const output = JSON.stringify(recipe, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        if (name === "cyberchef_recipe_get") {
            const recipe = await recipeManager.getRecipe(args.id);
            const output = JSON.stringify(recipe, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        if (name === "cyberchef_recipe_list") {
            const recipes = await recipeManager.listRecipes(args);
            const output = JSON.stringify(recipes, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        if (name === "cyberchef_recipe_update") {
            const { id, ...updates } = args;
            const recipe = await recipeManager.updateRecipe(id, updates);
            const output = JSON.stringify(recipe, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        if (name === "cyberchef_recipe_delete") {
            await recipeManager.deleteRecipe(args.id);
            const output = JSON.stringify({ success: true, id: args.id }, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        if (name === "cyberchef_recipe_execute") {
            validateInputSize(args.input);
            const result = await recipeManager.executeRecipe(args.id, args.input);
            const output = typeof result.result === "string" ? result.result : JSON.stringify(result);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        if (name === "cyberchef_recipe_export") {
            const exported = await recipeManager.exportRecipe(args.id, args.format);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(exported, "utf8") });

            return {
                content: [{ type: "text", text: exported }]
            };
        }

        if (name === "cyberchef_recipe_import") {
            const recipe = await recipeManager.importRecipe(args.data, args.format);
            const output = JSON.stringify(recipe, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        if (name === "cyberchef_recipe_validate") {
            const result = await recipeManager.validateRecipe(args.recipe);
            const output = JSON.stringify(result, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        if (name === "cyberchef_recipe_test") {
            const result = await recipeManager.testRecipe(args.recipe, args.testInputs);
            const output = JSON.stringify(result, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        // Handle operation tools
        if (name.startsWith("cyberchef_")) {
            const opName = Object.keys(OperationConfig).find(k => sanitizeToolName(k) === name);

            if (!opName) {
                throw createOperationNotFoundError(name, { requestId });
            }

            // Validate input size
            validateInputSize(args.input);

            const opConfig = OperationConfig[opName];
            const recipeArgs = [];

            if (opConfig.args) {
                opConfig.args.forEach(argDef => {
                    const argName = argDef.name.toLowerCase().replace(/ /g, "_");
                    const userVal = args[argName];
                    recipeArgs.push(resolveArgValue(argDef, userVal));
                });
            }

            // Check cache
            const cacheKey = operationCache.getCacheKey(opName, args.input, recipeArgs);
            const cached = operationCache.get(cacheKey);
            if (cached) {
                logCache("hit", { operation: opName, requestId });
                const output = typeof cached === "string" ? cached : JSON.stringify(cached);
                logRequestComplete(requestId, {
                    outputSize: Buffer.byteLength(output, "utf8"),
                    cached: true
                });

                return {
                    content: [{ type: "text", text: output }]
                };
            }

            logCache("miss", { operation: opName, requestId });

            const recipe = [{
                op: opName,
                args: recipeArgs
            }];

            // Determine streaming strategy
            const inputSize = Buffer.byteLength(args.input, "utf8");
            const strategy = ENABLE_STREAMING ?
                determineStreamingStrategy(opName, inputSize, STREAMING_THRESHOLD) :
                { type: "none", reason: "Streaming disabled" };

            let result;
            let streamed = false;

            if (strategy.type !== "none") {
                // Use streaming with progress reporting
                logStreaming(opName, { inputSize, strategy: strategy.type, reason: strategy.reason });

                // Note: MCP streaming would be implemented here if the SDK supports it
                // For now, we execute with timeout and retry
                result = await executeWithTimeoutAndRetry(
                    () => bake(args.input, recipe),
                    OPERATION_TIMEOUT * 2, // Double timeout for large operations
                    {
                        requestId,
                        maxRetries: RetryConfig.MAX_RETRIES,
                        context: { tool: name, operation: opName, inputSize }
                    }
                );
                streamed = true;
            } else {
                // Standard execution with timeout and retry
                result = await executeWithTimeoutAndRetry(
                    () => bake(args.input, recipe),
                    OPERATION_TIMEOUT,
                    {
                        requestId,
                        maxRetries: RetryConfig.MAX_RETRIES,
                        context: { tool: name, operation: opName }
                    }
                );
            }

            // Cache result
            operationCache.set(cacheKey, result.value);
            logCache("set", { operation: opName, requestId });

            const output = typeof result.value === "string" ? result.value : JSON.stringify(result.value);
            logRequestComplete(requestId, {
                outputSize: Buffer.byteLength(output, "utf8"),
                cached: false,
                streamed
            });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        throw createOperationNotFoundError(name, { requestId });

    } catch (error) {
        // Convert generic errors to CyberChefMCPError
        const mcpError = error instanceof CyberChefMCPError ?
            error :
            CyberChefMCPError.fromError(error, { requestId, tool: name });

        // Log error
        logRequestError(requestId, mcpError, { tool: name });

        // Return formatted error
        return mcpError.toMCPError();
    }
});

/**
 * Start the MCP Server.
 */
async function runServer() {
    // Initialize logger
    initLogger({ version: VERSION });

    // Initialize recipe manager (v1.6.0)
    await recipeManager.initialize();

    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Log server startup with configuration
    logServerStart({
        version: VERSION,
        maxInputSize: MAX_INPUT_SIZE,
        operationTimeout: OPERATION_TIMEOUT,
        streamingThreshold: STREAMING_THRESHOLD,
        streamingEnabled: ENABLE_STREAMING,
        workerThreadsEnabled: ENABLE_WORKERS,
        cacheMaxSize: CACHE_MAX_SIZE,
        cacheMaxItems: CACHE_MAX_ITEMS,
        maxRetries: RetryConfig.MAX_RETRIES,
        logLevel: process.env.LOG_LEVEL || "info"
    });

    // Also output to stderr for compatibility (can be disabled with LOG_LEVEL=error)
    const logger = getLogger();
    logger.info("=== CyberChef MCP Server v" + VERSION + " ===");
    logger.info("Running on stdio");
    logger.info(`Max input size: ${Math.round(MAX_INPUT_SIZE / 1024 / 1024)}MB`);
    logger.info(`Operation timeout: ${OPERATION_TIMEOUT}ms`);
    logger.info(`Streaming threshold: ${Math.round(STREAMING_THRESHOLD / 1024 / 1024)}MB`);
    logger.info(`Streaming: ${ENABLE_STREAMING ? "enabled" : "disabled"}`);
    logger.info(`Worker threads: ${ENABLE_WORKERS ? "enabled" : "disabled"}`);
    logger.info(`Cache size: ${Math.round(CACHE_MAX_SIZE / 1024 / 1024)}MB (${CACHE_MAX_ITEMS} items max)`);
    logger.info(`Max retries: ${RetryConfig.MAX_RETRIES}`);
    logger.info(`Log level: ${process.env.LOG_LEVEL || "info"}`);
    logger.info("=====================================");
}

runServer().catch((error) => {
    const logger = getLogger();
    logger.fatal({
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        },
        event: "server_fatal_error"
    }, "Fatal error running server");
    process.exit(1);
});
