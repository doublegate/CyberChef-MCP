/**
 * MCP Server entry point.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { bake, help } from "./index.mjs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
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
    determineStreamingStrategy,
    executeWithStreamingProgress
} from "./streaming.mjs";
import { createTransport, getTransportType } from "./transports.mjs";
import {
    initWorkerPool,
    shouldUseWorker,
    executeInWorker,
    getPoolStats,
    destroyWorkerPool
} from "./worker-pool.mjs";
import {
    executeWithTimeoutAndRetry,
    RetryConfig
} from "./retry.mjs";

// New v1.6.0 imports
import { recipeManager } from "./recipe-manager.mjs";

// v1.8.0 imports - Deprecation Warning System
import {
    emitDeprecation,
    emitToolNamingDeprecation,
    emitMetaToolDeprecation,
    emitRecipeFormatDeprecation,
    getDeprecationStats,
    resetDeprecations,
    analyzeRecipeCompatibility,
    transformRecipeToV2,
    getToolName,
    stripToolPrefix,
    isV2CompatibilityMode,
    areSuppressed,
    DEPRECATION_CODES
} from "./deprecation.mjs";

// Performance configuration (configurable via environment variables)
const VERSION = "1.8.0";
const MAX_INPUT_SIZE = parseInt(process.env.CYBERCHEF_MAX_INPUT_SIZE, 10) || 100 * 1024 * 1024; // 100MB default
const OPERATION_TIMEOUT = parseInt(process.env.CYBERCHEF_OPERATION_TIMEOUT, 10) || 30000; // 30s default
const STREAMING_THRESHOLD = parseInt(process.env.CYBERCHEF_STREAMING_THRESHOLD, 10) || 10 * 1024 * 1024; // 10MB default
const ENABLE_STREAMING = process.env.CYBERCHEF_ENABLE_STREAMING !== "false"; // Enabled by default
const ENABLE_WORKERS = process.env.CYBERCHEF_ENABLE_WORKERS === "true"; // Disabled by default (workers not yet implemented)
const CACHE_MAX_SIZE = parseInt(process.env.CYBERCHEF_CACHE_MAX_SIZE, 10) || 100 * 1024 * 1024; // 100MB default
const CACHE_MAX_ITEMS = parseInt(process.env.CYBERCHEF_CACHE_MAX_ITEMS, 10) || 1000;

// v1.7.0 configuration
const BATCH_MAX_SIZE = parseInt(process.env.CYBERCHEF_BATCH_MAX_SIZE, 10) || 100;
const BATCH_ENABLED = process.env.CYBERCHEF_BATCH_ENABLED !== "false"; // Enabled by default
const TELEMETRY_ENABLED = process.env.CYBERCHEF_TELEMETRY_ENABLED === "true"; // Disabled by default (privacy-first)
const RATE_LIMIT_ENABLED = process.env.CYBERCHEF_RATE_LIMIT_ENABLED === "true"; // Disabled by default
const RATE_LIMIT_REQUESTS = parseInt(process.env.CYBERCHEF_RATE_LIMIT_REQUESTS, 10) || 100;
const RATE_LIMIT_WINDOW = parseInt(process.env.CYBERCHEF_RATE_LIMIT_WINDOW, 10) || 60000; // 60 seconds
const CACHE_ENABLED = process.env.CYBERCHEF_CACHE_ENABLED !== "false"; // Enabled by default

// v1.8.0 configuration
const V2_COMPATIBILITY_MODE = process.env.V2_COMPATIBILITY_MODE === "true"; // Disabled by default
const SUPPRESS_DEPRECATIONS = process.env.CYBERCHEF_SUPPRESS_DEPRECATIONS === "true"; // Disabled by default

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

/**
 * Telemetry collector for usage analytics (v1.7.0).
 * Privacy-first: no input/output data is captured.
 */
class TelemetryCollector {
    /**
     * Create a new telemetry collector.
     */
    constructor() {
        this.metrics = [];
        this.maxMetrics = 10000; // Keep last 10k metrics
    }

    /**
     * Record a tool execution metric.
     *
     * @param {Object} metric - Metric object.
     */
    record(metric) {
        if (!TELEMETRY_ENABLED) return;

        this.metrics.push({
            tool: metric.tool,
            duration: metric.duration,
            inputSize: metric.inputSize,
            outputSize: metric.outputSize,
            success: metric.success,
            cached: metric.cached || false,
            timestamp: Date.now()
        });

        // Limit metrics array size
        if (this.metrics.length > this.maxMetrics) {
            this.metrics.shift();
        }
    }

    /**
     * Export all collected metrics.
     *
     * @returns {Array} Array of metric objects.
     */
    exportMetrics() {
        return [...this.metrics];
    }

    /**
     * Get telemetry statistics.
     *
     * @returns {Object} Statistics object.
     */
    getStats() {
        if (this.metrics.length === 0) {
            return {
                totalCalls: 0,
                successRate: 0,
                avgDuration: 0,
                cacheHitRate: 0
            };
        }

        const successCount = this.metrics.filter(m => m.success).length;
        const cachedCount = this.metrics.filter(m => m.cached).length;
        const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);

        return {
            totalCalls: this.metrics.length,
            successRate: (successCount / this.metrics.length * 100).toFixed(2) + "%",
            avgDuration: Math.round(totalDuration / this.metrics.length) + "ms",
            cacheHitRate: (cachedCount / this.metrics.length * 100).toFixed(2) + "%"
        };
    }

    /**
     * Clear all metrics.
     */
    clear() {
        this.metrics = [];
    }
}

/**
 * Rate limiter using sliding window algorithm (v1.7.0).
 */
class RateLimiter {
    /**
     * Create a new rate limiter.
     *
     * @param {number} maxRequests - Maximum requests per window.
     * @param {number} windowMs - Window size in milliseconds.
     */
    constructor(maxRequests = RATE_LIMIT_REQUESTS, windowMs = RATE_LIMIT_WINDOW) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = new Map(); // connectionId -> [timestamps]
    }

    /**
     * Check if request is allowed.
     *
     * @param {string} connectionId - Connection identifier.
     * @returns {Object} Result with allowed flag and retry-after time.
     */
    checkLimit(connectionId = "default") {
        if (!RATE_LIMIT_ENABLED) {
            return { allowed: true, retryAfter: 0 };
        }

        const now = Date.now();
        const timestamps = this.requests.get(connectionId) || [];

        // Remove old timestamps outside the window
        const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);

        if (validTimestamps.length >= this.maxRequests) {
            const oldestTimestamp = validTimestamps[0];
            const retryAfter = Math.ceil((oldestTimestamp + this.windowMs - now) / 1000);
            return { allowed: false, retryAfter };
        }

        // Add current timestamp
        validTimestamps.push(now);
        this.requests.set(connectionId, validTimestamps);

        return { allowed: true, retryAfter: 0 };
    }

    /**
     * Get rate limit statistics.
     *
     * @returns {Object} Statistics object.
     */
    getStats() {
        const connections = this.requests.size;
        let totalRequests = 0;
        for (const timestamps of this.requests.values()) {
            totalRequests += timestamps.length;
        }

        return {
            enabled: RATE_LIMIT_ENABLED,
            maxRequests: this.maxRequests,
            windowMs: this.windowMs,
            activeConnections: connections,
            totalTrackedRequests: totalRequests
        };
    }

    /**
     * Clear all tracked requests.
     */
    clear() {
        this.requests.clear();
    }
}

/**
 * Resource quota tracker (v1.7.0).
 */
class ResourceQuotaTracker {
    /**
     * Create a new resource quota tracker.
     */
    constructor() {
        this.concurrentOps = 0;
        this.maxConcurrentOps = parseInt(process.env.CYBERCHEF_MAX_CONCURRENT_OPS, 10) || 10;
        this.totalOps = 0;
        this.totalInputSize = 0;
        this.totalOutputSize = 0;
    }

    /**
     * Acquire a quota slot.
     *
     * @returns {boolean} True if slot acquired, false if quota exceeded.
     */
    acquire() {
        if (this.concurrentOps >= this.maxConcurrentOps) {
            return false;
        }
        this.concurrentOps++;
        this.totalOps++;
        return true;
    }

    /**
     * Release a quota slot.
     */
    release() {
        this.concurrentOps = Math.max(0, this.concurrentOps - 1);
    }

    /**
     * Track data sizes.
     *
     * @param {number} inputSize - Input data size in bytes.
     * @param {number} outputSize - Output data size in bytes.
     */
    trackData(inputSize, outputSize) {
        this.totalInputSize += inputSize;
        this.totalOutputSize += outputSize;
    }

    /**
     * Get quota information.
     *
     * @returns {Object} Quota information.
     */
    getInfo() {
        return {
            concurrentOperations: this.concurrentOps,
            maxConcurrentOperations: this.maxConcurrentOps,
            totalOperations: this.totalOps,
            totalInputSize: this.totalInputSize,
            totalOutputSize: this.totalOutputSize,
            inputSizeMB: (this.totalInputSize / 1024 / 1024).toFixed(2),
            outputSizeMB: (this.totalOutputSize / 1024 / 1024).toFixed(2),
            maxInputSizeMB: (MAX_INPUT_SIZE / 1024 / 1024).toFixed(2)
        };
    }

    /**
     * Reset statistics.
     */
    reset() {
        this.totalOps = 0;
        this.totalInputSize = 0;
        this.totalOutputSize = 0;
    }
}

/**
 * Batch processor for executing multiple operations (v1.7.0).
 */
class BatchProcessor {
    /**
     * Execute a batch of operations.
     *
     * @param {Array} operations - Array of operation objects.
     * @param {string} mode - Execution mode: "parallel" or "sequential".
     * @param {Object} context - Execution context.
     * @returns {Promise<Object>} Batch results.
     */
    async executeBatch(operations, mode = "parallel", context = {}) {
        if (!BATCH_ENABLED) {
            throw createInputError("Batch processing is disabled", { batchSize: operations.length });
        }

        if (!Array.isArray(operations) || operations.length === 0) {
            throw createInputError("Operations must be a non-empty array", { received: typeof operations });
        }

        if (operations.length > BATCH_MAX_SIZE) {
            throw createInputError(
                `Batch size (${operations.length}) exceeds maximum allowed size (${BATCH_MAX_SIZE})`,
                { batchSize: operations.length, maxBatchSize: BATCH_MAX_SIZE }
            );
        }

        const results = [];
        const errors = [];
        let successCount = 0;

        if (mode === "parallel") {
            // Execute all operations in parallel
            const promises = operations.map(async (op, index) => {
                try {
                    const result = await this.executeOperation(op, { ...context, index });
                    return { index, success: true, result };
                } catch (error) {
                    return { index, success: false, error: error.message || String(error) };
                }
            });

            const outcomes = await Promise.all(promises);

            outcomes.forEach(outcome => {
                if (outcome.success) {
                    results.push({ index: outcome.index, result: outcome.result });
                    successCount++;
                } else {
                    errors.push({ index: outcome.index, error: outcome.error });
                }
            });

        } else if (mode === "sequential") {
            // Execute operations one by one
            for (let i = 0; i < operations.length; i++) {
                try {
                    const result = await this.executeOperation(operations[i], { ...context, index: i });
                    results.push({ index: i, result });
                    successCount++;
                } catch (error) {
                    errors.push({ index: i, error: error.message || String(error) });
                    // Continue with next operation (partial success)
                }
            }
        } else {
            throw createInputError(`Invalid mode: ${mode}. Must be "parallel" or "sequential"`, { mode });
        }

        return {
            total: operations.length,
            successful: successCount,
            failed: errors.length,
            results,
            errors,
            mode
        };
    }

    /**
     * Execute a single operation from batch.
     *
     * @param {Object} op - Operation object.
     * @param {Object} context - Execution context.
     * @returns {Promise<any>} Operation result.
     */
    async executeOperation(op, context) {
        if (!op.tool || !op.tool.startsWith("cyberchef_")) {
            throw new Error(`Invalid tool name: ${op.tool}`);
        }

        if (!op.arguments || typeof op.arguments !== "object") {
            throw new Error("Operation arguments must be an object");
        }

        // Validate input if present
        if (op.arguments.input) {
            validateInputSize(op.arguments.input);
        }

        // Extract operation name
        const toolName = op.tool;

        // Handle bake operation
        if (toolName === "cyberchef_bake") {
            const result = await executeWithTimeoutAndRetry(
                () => bake(op.arguments.input, op.arguments.recipe),
                OPERATION_TIMEOUT,
                { ...context, maxRetries: RetryConfig.MAX_RETRIES }
            );
            return typeof result.value === "string" ? result.value : JSON.stringify(result.value);
        }

        // Handle search operation
        if (toolName === "cyberchef_search") {
            const results = help(op.arguments.query);
            return JSON.stringify(results, null, 2);
        }

        // Handle standard operations
        const opName = Object.keys(OperationConfig).find(k => sanitizeToolName(k) === toolName);
        if (!opName) {
            throw new Error(`Operation not found: ${toolName}`);
        }

        const opConfig = OperationConfig[opName];
        const recipeArgs = [];

        if (opConfig.args) {
            opConfig.args.forEach(argDef => {
                const argName = argDef.name.toLowerCase().replace(/ /g, "_");
                const userVal = op.arguments[argName];
                recipeArgs.push(resolveArgValue(argDef, userVal));
            });
        }

        const recipe = [{ op: opName, args: recipeArgs }];
        const result = await executeWithTimeoutAndRetry(
            () => bake(op.arguments.input, recipe),
            OPERATION_TIMEOUT,
            { ...context, maxRetries: RetryConfig.MAX_RETRIES }
        );

        return typeof result.value === "string" ? result.value : JSON.stringify(result.value);
    }
}

// Global instances
const operationCache = new LRUCache();
const memoryMonitor = new MemoryMonitor();
const telemetryCollector = new TelemetryCollector();
const rateLimiter = new RateLimiter();
const quotaTracker = new ResourceQuotaTracker();
const batchProcessor = new BatchProcessor();

// Note: CPU_INTENSIVE_OPERATIONS moved to worker-pool.mjs
// Note: STREAMING_OPERATIONS is imported from streaming.mjs

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
        },
        // v1.7.0 tools
        {
            name: "cyberchef_batch",
            description: "Execute multiple CyberChef operations in batch (parallel or sequential mode). Supports partial success.",
            inputSchema: zodToJsonSchema(z.object({
                operations: z.array(z.object({
                    tool: z.string().describe("Tool name (e.g., cyberchef_to_base64)"),
                    arguments: z.record(z.any()).describe("Tool arguments")
                })).describe("Array of operations to execute"),
                mode: z.enum(["parallel", "sequential"]).default("parallel").describe("Execution mode")
            }))
        },
        {
            name: "cyberchef_telemetry_export",
            description: "Export collected telemetry metrics. Returns anonymized usage statistics.",
            inputSchema: zodToJsonSchema(z.object({
                format: z.enum(["json", "summary"]).default("json").describe("Export format")
            }))
        },
        {
            name: "cyberchef_cache_stats",
            description: "Get cache statistics including hits, misses, size, and items.",
            inputSchema: zodToJsonSchema(z.object({}))
        },
        {
            name: "cyberchef_cache_clear",
            description: "Clear the operation result cache.",
            inputSchema: zodToJsonSchema(z.object({}))
        },
        {
            name: "cyberchef_quota_info",
            description: "Get current resource quota information including concurrent operations and data sizes.",
            inputSchema: zodToJsonSchema(z.object({}))
        },
        // v1.8.0 tools - Breaking Changes Preparation
        {
            name: "cyberchef_migration_preview",
            description: "Analyze recipes and configurations for v2.0.0 compatibility. Returns compatibility issues and optionally transforms recipes to v2.0.0 format.",
            inputSchema: zodToJsonSchema(z.object({
                recipe: z.any().describe("Recipe object or array to analyze"),
                mode: z.enum(["analyze", "transform"]).default("analyze").describe("analyze: check compatibility, transform: convert to v2.0.0 format")
            }))
        },
        {
            name: "cyberchef_deprecation_stats",
            description: "Get statistics on deprecated API usage in current session. Shows which deprecation warnings have been triggered and v2.0.0 preparation status.",
            inputSchema: zodToJsonSchema(z.object({}))
        },
        // v1.9.0 tools - Worker Thread Pool
        {
            name: "cyberchef_worker_stats",
            description: "Get worker thread pool statistics including thread count, utilization, and completed tasks. Only available when ENABLE_WORKERS=true.",
            inputSchema: zodToJsonSchema(z.object({}))
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
            // Emit deprecation warnings for v2.0.0 (meta-tool rename)
            emitMetaToolDeprecation(name);

            // Check recipe format and emit warning if using legacy format
            if (args.recipe) {
                emitRecipeFormatDeprecation(args.recipe);
            }

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
            // Emit deprecation warning for v2.0.0 (meta-tool rename)
            emitMetaToolDeprecation(name);

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

        // Handle v1.7.0 tools
        if (name === "cyberchef_batch") {
            // Check rate limit
            const limitCheck = rateLimiter.checkLimit(requestId);
            if (!limitCheck.allowed) {
                const error = createInputError(
                    `Rate limit exceeded. Retry after ${limitCheck.retryAfter} seconds.`,
                    { retryAfter: limitCheck.retryAfter }
                );
                logRequestError(requestId, error, { tool: name });
                return error.toMCPError();
            }

            const startTime = Date.now();
            try {
                const result = await batchProcessor.executeBatch(
                    args.operations,
                    args.mode || "parallel",
                    { requestId, tool: name }
                );
                const duration = Date.now() - startTime;

                // Record telemetry
                telemetryCollector.record({
                    tool: name,
                    duration,
                    inputSize: JSON.stringify(args.operations).length,
                    outputSize: JSON.stringify(result).length,
                    success: true,
                    cached: false
                });

                const output = JSON.stringify(result, null, 2);
                logRequestComplete(requestId, {
                    outputSize: Buffer.byteLength(output, "utf8"),
                    duration,
                    batchSize: args.operations.length,
                    mode: args.mode || "parallel"
                });

                return {
                    content: [{ type: "text", text: output }]
                };
            } catch (error) {
                const duration = Date.now() - startTime;
                telemetryCollector.record({
                    tool: name,
                    duration,
                    inputSize: JSON.stringify(args.operations).length,
                    outputSize: 0,
                    success: false,
                    cached: false
                });
                throw error;
            }
        }

        if (name === "cyberchef_telemetry_export") {
            const format = args.format || "json";
            let output;

            if (format === "summary") {
                const stats = telemetryCollector.getStats();
                output = JSON.stringify(stats, null, 2);
            } else {
                const metrics = telemetryCollector.exportMetrics();
                output = JSON.stringify(metrics, null, 2);
            }

            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        if (name === "cyberchef_cache_stats") {
            const stats = operationCache.getStats();
            const output = JSON.stringify(stats, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        if (name === "cyberchef_cache_clear") {
            operationCache.clear();
            const output = JSON.stringify({ success: true, message: "Cache cleared" }, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        if (name === "cyberchef_quota_info") {
            const quotaInfo = quotaTracker.getInfo();
            const rateLimitStats = rateLimiter.getStats();
            const combined = {
                quota: quotaInfo,
                rateLimit: rateLimitStats
            };
            const output = JSON.stringify(combined, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        // Handle v1.8.0 tools
        if (name === "cyberchef_migration_preview") {
            const mode = args.mode || "analyze";
            let result;

            if (mode === "analyze") {
                result = analyzeRecipeCompatibility(args.recipe);
            } else if (mode === "transform") {
                const analysis = analyzeRecipeCompatibility(args.recipe);
                const transformed = transformRecipeToV2(args.recipe);
                result = {
                    ...analysis,
                    transformed
                };
            } else {
                throw createInputError(`Invalid mode: ${mode}. Must be "analyze" or "transform"`, { mode });
            }

            const output = JSON.stringify(result, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        if (name === "cyberchef_deprecation_stats") {
            const stats = getDeprecationStats();
            const output = JSON.stringify(stats, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        // Handle v1.9.0 tools
        if (name === "cyberchef_worker_stats") {
            const stats = getPoolStats();
            const result = stats
                ? { enabled: true, ...stats }
                : { enabled: false, message: "Worker pool is not enabled. Set ENABLE_WORKERS=true to enable." };
            const output = JSON.stringify(result, null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });

            return {
                content: [{ type: "text", text: output }]
            };
        }

        // Handle operation tools
        if (name.startsWith("cyberchef_")) {
            // Check rate limit
            const limitCheck = rateLimiter.checkLimit(requestId);
            if (!limitCheck.allowed) {
                const error = createInputError(
                    `Rate limit exceeded. Retry after ${limitCheck.retryAfter} seconds.`,
                    { retryAfter: limitCheck.retryAfter }
                );
                logRequestError(requestId, error, { tool: name });
                return error.toMCPError();
            }

            // Check quota
            if (!quotaTracker.acquire()) {
                const error = createInputError(
                    `Resource quota exceeded. Maximum concurrent operations: ${quotaTracker.maxConcurrentOps}`,
                    { maxConcurrentOps: quotaTracker.maxConcurrentOps }
                );
                logRequestError(requestId, error, { tool: name });
                return error.toMCPError();
            }

            const startTime = Date.now();
            try {
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

                // Check cache (only if caching is enabled)
                const inputSize = Buffer.byteLength(args.input, "utf8");
                let cacheKey, cached;
                if (CACHE_ENABLED) {
                    cacheKey = operationCache.getCacheKey(opName, args.input, recipeArgs);
                    cached = operationCache.get(cacheKey);
                    if (cached) {
                        logCache("hit", { operation: opName, requestId });
                        const output = typeof cached === "string" ? cached : JSON.stringify(cached);
                        const outputSize = Buffer.byteLength(output, "utf8");

                        // Track quota
                        quotaTracker.trackData(inputSize, outputSize);
                        quotaTracker.release();

                        // Record telemetry
                        const duration = Date.now() - startTime;
                        telemetryCollector.record({
                            tool: name,
                            duration,
                            inputSize,
                            outputSize,
                            success: true,
                            cached: true
                        });

                        logRequestComplete(requestId, {
                            outputSize,
                            cached: true,
                            duration
                        });

                        return {
                            content: [{ type: "text", text: output }]
                        };
                    }

                    logCache("miss", { operation: opName, requestId });
                }

                const recipe = [{
                    op: opName,
                    args: recipeArgs
                }];

                let result;
                let streamed = false;

                // Route to worker thread if applicable
                if (ENABLE_WORKERS && shouldUseWorker(opName, inputSize)) {
                    result = await executeInWorker(args.input, recipe, OPERATION_TIMEOUT);
                } else {
                    // Extract progress token from MCP request metadata
                    const progressToken = request.params?._meta?.progressToken;

                    // Execute with streaming progress support
                    result = await executeWithStreamingProgress({
                        bakeFunction: bake,
                        operation: opName,
                        input: args.input,
                        recipeArgs,
                        recipe,
                        server,
                        progressToken,
                        streamingEnabled: ENABLE_STREAMING,
                        streamingThreshold: STREAMING_THRESHOLD,
                        timeout: OPERATION_TIMEOUT,
                        requestId
                    });
                    streamed = !!progressToken && ENABLE_STREAMING;
                }

                // Cache result (only if caching is enabled)
                if (CACHE_ENABLED) {
                    operationCache.set(cacheKey, result.value);
                    logCache("set", { operation: opName, requestId });
                }

                const output = typeof result.value === "string" ? result.value : JSON.stringify(result.value);
                const outputSize = Buffer.byteLength(output, "utf8");
                const duration = Date.now() - startTime;

                // Track quota
                quotaTracker.trackData(inputSize, outputSize);

                // Record telemetry
                telemetryCollector.record({
                    tool: name,
                    duration,
                    inputSize,
                    outputSize,
                    success: true,
                    cached: false
                });

                logRequestComplete(requestId, {
                    outputSize,
                    cached: false,
                    streamed,
                    duration
                });

                return {
                    content: [{ type: "text", text: output }]
                };
            } catch (opError) {
                // Record failed telemetry
                const duration = Date.now() - startTime;
                const inputSize = args.input ? Buffer.byteLength(args.input, "utf8") : 0;
                telemetryCollector.record({
                    tool: name,
                    duration,
                    inputSize,
                    outputSize: 0,
                    success: false,
                    cached: false
                });
                throw opError;
            } finally {
                // Always release quota
                quotaTracker.release();
            }
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

    // Initialize worker pool if enabled (v1.9.0)
    if (ENABLE_WORKERS) {
        await initWorkerPool();
    }

    const { transport, httpServer } = await createTransport();
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
        logLevel: process.env.LOG_LEVEL || "info",
        // v1.7.0 configuration
        batchMaxSize: BATCH_MAX_SIZE,
        batchEnabled: BATCH_ENABLED,
        telemetryEnabled: TELEMETRY_ENABLED,
        rateLimitEnabled: RATE_LIMIT_ENABLED,
        rateLimitRequests: RATE_LIMIT_REQUESTS,
        rateLimitWindow: RATE_LIMIT_WINDOW,
        cacheEnabled: CACHE_ENABLED,
        maxConcurrentOps: quotaTracker.maxConcurrentOps,
        // v1.8.0 configuration
        v2CompatibilityMode: V2_COMPATIBILITY_MODE,
        suppressDeprecations: SUPPRESS_DEPRECATIONS
    });

    // Also output to stderr for compatibility (can be disabled with LOG_LEVEL=error)
    const logger = getLogger();
    logger.info("=== CyberChef MCP Server v" + VERSION + " ===");
    logger.info(`Running on ${getTransportType()} transport`);
    logger.info(`Max input size: ${Math.round(MAX_INPUT_SIZE / 1024 / 1024)}MB`);
    logger.info(`Operation timeout: ${OPERATION_TIMEOUT}ms`);
    logger.info(`Streaming threshold: ${Math.round(STREAMING_THRESHOLD / 1024 / 1024)}MB`);
    logger.info(`Streaming: ${ENABLE_STREAMING ? "enabled" : "disabled"}`);
    logger.info(`Worker threads: ${ENABLE_WORKERS ? "enabled" : "disabled"}`);
    logger.info(`Cache: ${CACHE_ENABLED ? "enabled" : "disabled"} (${Math.round(CACHE_MAX_SIZE / 1024 / 1024)}MB, ${CACHE_MAX_ITEMS} items max)`);
    logger.info(`Max retries: ${RetryConfig.MAX_RETRIES}`);
    logger.info(`Batch processing: ${BATCH_ENABLED ? "enabled" : "disabled"} (max ${BATCH_MAX_SIZE} ops)`);
    logger.info(`Telemetry: ${TELEMETRY_ENABLED ? "enabled" : "disabled"}`);
    logger.info(`Rate limiting: ${RATE_LIMIT_ENABLED ? "enabled" : "disabled"} (${RATE_LIMIT_REQUESTS} req/${RATE_LIMIT_WINDOW}ms)`);
    logger.info(`Max concurrent ops: ${quotaTracker.maxConcurrentOps}`);
    logger.info(`Log level: ${process.env.LOG_LEVEL || "info"}`);
    // v1.8.0 configuration
    logger.info(`V2 compatibility mode: ${V2_COMPATIBILITY_MODE ? "enabled" : "disabled"}`);
    logger.info(`Deprecation warnings: ${SUPPRESS_DEPRECATIONS ? "suppressed" : "enabled"}`);
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

// Export for testing
export {
    LRUCache,
    MemoryMonitor,
    TelemetryCollector,
    RateLimiter,
    ResourceQuotaTracker,
    BatchProcessor,
    sanitizeToolName,
    mapArgsToZod,
    resolveArgValue,
    validateInputSize,
    VERSION,
    MAX_INPUT_SIZE,
    OPERATION_TIMEOUT,
    STREAMING_THRESHOLD,
    ENABLE_STREAMING,
    ENABLE_WORKERS,
    CACHE_MAX_SIZE,
    CACHE_MAX_ITEMS,
    BATCH_MAX_SIZE,
    BATCH_ENABLED,
    TELEMETRY_ENABLED,
    RATE_LIMIT_ENABLED,
    RATE_LIMIT_REQUESTS,
    RATE_LIMIT_WINDOW,
    CACHE_ENABLED,
    operationCache,
    memoryMonitor,
    telemetryCollector,
    rateLimiter,
    quotaTracker,
    batchProcessor,
    // v1.8.0 exports
    V2_COMPATIBILITY_MODE,
    SUPPRESS_DEPRECATIONS,
    // Re-export deprecation functions for testing
    emitDeprecation,
    emitToolNamingDeprecation,
    emitMetaToolDeprecation,
    emitRecipeFormatDeprecation,
    getDeprecationStats,
    resetDeprecations,
    analyzeRecipeCompatibility,
    transformRecipeToV2,
    getToolName,
    stripToolPrefix,
    isV2CompatibilityMode,
    areSuppressed,
    DEPRECATION_CODES,
    // v1.9.0 exports - re-export worker pool functions
    initWorkerPool,
    shouldUseWorker,
    executeInWorker,
    getPoolStats,
    destroyWorkerPool,
    // v1.9.0 exports - re-export streaming progress
    executeWithStreamingProgress,
    // v1.9.0 exports - re-export transport functions
    createTransport,
    getTransportType
};
