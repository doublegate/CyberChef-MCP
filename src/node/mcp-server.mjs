/**
 * MCP Server entry point.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

/* eslint-disable no-console */

import { bake, help } from "./index.mjs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import OperationConfig from "../core/config/OperationConfig.json" with {type: "json"};
import { createHash } from "crypto";

// Performance configuration (configurable via environment variables)
const VERSION = "1.4.6";
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

        // Log memory usage (to stderr to not interfere with MCP protocol)
        console.error(`[Memory] Heap: ${Math.round(usage.heapUsed / 1024 / 1024)}MB / ${Math.round(usage.heapTotal / 1024 / 1024)}MB, RSS: ${Math.round(usage.rss / 1024 / 1024)}MB`);

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

// Operations that support streaming
const STREAMING_OPERATIONS = new Set([
    "To Base64", "From Base64",
    "To Hex", "From Hex",
    "Gzip", "Gunzip",
    "Bzip2 Compress", "Bzip2 Decompress",
    "SHA1", "SHA2", "SHA3", "MD5",
    "BLAKE2b", "BLAKE2s"
]);

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
 * @throws {Error} If input is too large.
 */
function validateInputSize(input) {
    const size = Buffer.byteLength(input, "utf8");
    if (size > MAX_INPUT_SIZE) {
        throw new Error(`Input size (${Math.round(size / 1024 / 1024)}MB) exceeds maximum allowed size (${Math.round(MAX_INPUT_SIZE / 1024 / 1024)}MB)`);
    }
}

/**
 * Execute operation with timeout.
 *
 * @param {Function} fn - The function to execute.
 * @param {number} timeout - Timeout in milliseconds.
 * @returns {Promise} Promise that resolves with function result or rejects on timeout.
 */
function withTimeout(fn, timeout) {
    return Promise.race([
        fn(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
        )
    ]);
}

/**
 * Execute operation with streaming for large inputs.
 *
 * @param {string} opName - The operation name.
 * @param {string} input - The input data.
 * @param {Array} args - Operation arguments.
 * @returns {Promise<Object>} The operation result.
 */
async function executeWithStreaming(opName, input, args) {
    // For now, implement basic chunking
    // Future: Use actual streaming operations when available
    const chunkSize = 1024 * 1024; // 1MB chunks
    const chunks = [];

    for (let i = 0; i < input.length; i += chunkSize) {
        const chunk = input.substring(i, i + chunkSize);
        const recipe = [{ op: opName, args }];
        const result = await bake(chunk, recipe);
        chunks.push(result.value);
    }

    return { value: chunks.join("") };
}

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
            // Log schema generation failures for debugging (P2 security hardening)
            console.error(`[MCP Server] Schema generation failed for operation: ${opName}`, {
                error: e.message,
                toolName,
                argCount: (op.args || []).length
            });
            // Skip this operation and continue with others
        }
    });

    return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        // Check memory periodically
        memoryMonitor.check();

        if (name === "cyberchef_bake") {
            // Validate input size
            validateInputSize(args.input);

            // Execute with timeout
            const result = await withTimeout(
                () => bake(args.input, args.recipe),
                OPERATION_TIMEOUT
            );

            return {
                content: [{ type: "text", text: typeof result.value === "string" ? result.value : JSON.stringify(result.value) }]
            };
        }

        if (name === "cyberchef_search") {
            const results = help(args.query);
            return {
                content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
            };
        }

        if (name.startsWith("cyberchef_")) {
            const opName = Object.keys(OperationConfig).find(k => sanitizeToolName(k) === name);

            if (opName) {
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
                    console.error(`[Cache] Hit for ${opName}`);
                    return {
                        content: [{ type: "text", text: typeof cached === "string" ? cached : JSON.stringify(cached) }]
                    };
                }

                const recipe = [{
                    op: opName,
                    args: recipeArgs
                }];

                let result;

                // Use streaming for large inputs if enabled and operation supports it
                const inputSize = Buffer.byteLength(args.input, "utf8");
                if (ENABLE_STREAMING && inputSize > STREAMING_THRESHOLD && STREAMING_OPERATIONS.has(opName)) {
                    console.error(`[Streaming] Using streaming for ${opName} (${Math.round(inputSize / 1024 / 1024)}MB)`);
                    result = await withTimeout(
                        () => executeWithStreaming(opName, args.input, recipeArgs),
                        OPERATION_TIMEOUT
                    );
                } else {
                    // Standard execution with timeout
                    result = await withTimeout(
                        () => bake(args.input, recipe),
                        OPERATION_TIMEOUT
                    );
                }

                // Cache result
                operationCache.set(cacheKey, result.value);

                return {
                    content: [{ type: "text", text: typeof result.value === "string" ? result.value : JSON.stringify(result.value) }]
                };
            }
        }

        throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
        return {
            isError: true,
            content: [{ type: "text", text: `Error: ${error.message}` }]
        };
    }
});

/**
 * Start the MCP Server.
 */
async function runServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("=== CyberChef MCP Server v" + VERSION + " ===");
    console.error("Running on stdio");
    console.error(`Max input size: ${Math.round(MAX_INPUT_SIZE / 1024 / 1024)}MB`);
    console.error(`Operation timeout: ${OPERATION_TIMEOUT}ms`);
    console.error(`Streaming threshold: ${Math.round(STREAMING_THRESHOLD / 1024 / 1024)}MB`);
    console.error(`Streaming: ${ENABLE_STREAMING ? "enabled" : "disabled"}`);
    console.error(`Worker threads: ${ENABLE_WORKERS ? "enabled" : "disabled"}`);
    console.error(`Cache size: ${Math.round(CACHE_MAX_SIZE / 1024 / 1024)}MB (${CACHE_MAX_ITEMS} items max)`);
    console.error("=====================================");
}

runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
