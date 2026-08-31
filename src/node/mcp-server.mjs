/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * MCP Server entry point.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { bake, help } from "./index.mjs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import OperationConfig from "../core/config/OperationConfig.json" with {type: "json"};

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
    logServerStart
} from "./logger.mjs";
import {
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

// Extracted subsystems. These were inline classes and helpers in this file until the
// v2.0.0 decomposition. Behaviour is unchanged, and they are re-exported unchanged at
// the bottom of this file so the existing test surface keeps working untouched.
import {
    VERSION, MAX_INPUT_SIZE, OPERATION_TIMEOUT, STREAMING_THRESHOLD, ENABLE_STREAMING,
    ENABLE_WORKERS, CACHE_MAX_SIZE, CACHE_MAX_ITEMS, BATCH_MAX_SIZE, BATCH_ENABLED,
    TELEMETRY_ENABLED, RATE_LIMIT_ENABLED, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW,
    CACHE_ENABLED, V2_COMPATIBILITY_MODE, SUPPRESS_DEPRECATIONS
} from "./lib/config.mjs";
import { LRUCache } from "./lib/cache.mjs";
import { MemoryMonitor } from "./lib/memory.mjs";
import { TelemetryCollector } from "./lib/telemetry.mjs";
import { RateLimiter } from "./lib/rate-limit.mjs";
import { ResourceQuotaTracker } from "./lib/quota.mjs";
import { BatchProcessor } from "./lib/batch.mjs";
import { sanitizeToolName, mapArgsToZod, resolveArgValue, validateInputSize } from "./lib/tool-schema.mjs";

// Performance configuration (configurable via environment variables)

// v1.7.0 configuration

// v1.8.0 configuration


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


// Note: withTimeout and executeWithStreaming have been replaced by:
// - executeWithTimeoutAndRetry in retry.mjs
// - executeWithStreamingStrategy in streaming.mjs

const handleListTools = async () => {
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
};

const handleCallTool = async (request, extra) => {
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
            const result = stats ?
                { enabled: true, ...stats } :
                { enabled: false, message: "Worker pool is not enabled. Set ENABLE_WORKERS=true to enable." };
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

                    // Route progress notifications back to THE CONNECTION THAT ASKED, not to the
                    // module-level server.
                    //
                    // With one process-wide server that distinction did not exist. It does now:
                    // an HTTP session owns its own Server instance, so passing the singleton here
                    // would send this session's progress to a stdio server that is not connected
                    // at all -- silently, since sendProgress swallows its own errors. The SDK
                    // hands every request handler an `extra.sendNotification` bound to the right
                    // connection, which is the routing this needs.
                    //
                    // The fallback keeps the module server for callers that invoke the handler
                    // directly without an `extra` (the existing unit tests do exactly that).
                    const progressTarget = typeof extra?.sendNotification === "function" ?
                        { notification: (n) => extra.sendNotification(n) } :
                        server;

                    // Execute with streaming progress support
                    result = await executeWithStreamingProgress({
                        bakeFunction: bake,
                        operation: opName,
                        input: args.input,
                        recipeArgs,
                        recipe,
                        server: progressTarget,
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
};

/**
 * Build a fresh MCP `Server` with every request handler registered.
 *
 * WHY A FACTORY AND NOT THE MODULE SINGLETON
 * ------------------------------------------
 * A `Server` carries per-connection lifecycle state -- most importantly whether `initialize`
 * has already been negotiated. Sharing one across HTTP clients is what produced issue #36:
 * the first client's handshake marked the instance initialized, and every later client's
 * `initialize` was rejected with `Invalid Request: Server already initialized`.
 *
 * The SDK hardened the same class of bug in GHSA-345p-7cg4-v4c7 -- sharing server or transport
 * instances between clients leaks state across them -- so a per-session pair is the required
 * shape, not merely the tidier one.
 *
 * Everything a session should NOT own stays module-level and shared on purpose: the operation
 * cache, telemetry, rate limiter and quota tracker are process-wide resources, and giving each
 * session its own would silently defeat all four.
 *
 * @returns {Server} A new server instance with the tools handlers attached.
 */
function createMcpServer() {
    const instance = new Server(
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
    instance.setRequestHandler(ListToolsRequestSchema, handleListTools);
    instance.setRequestHandler(CallToolRequestSchema, handleCallTool);
    return instance;
}

// The module-level instance backs stdio, which is single-connection by construction, and is what
// the existing test suite drives. HTTP builds its own per session.
server.setRequestHandler(ListToolsRequestSchema, handleListTools);
server.setRequestHandler(CallToolRequestSchema, handleCallTool);

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

    // HTTP builds a Server per session inside createTransport (issue #36), so there is no
    // process-wide transport to connect and `transport` comes back null. Connecting the module
    // singleton here would recreate the shared-instance bug the factory exists to avoid.
    const { transport } = await createTransport({ createServer: createMcpServer });
    if (transport) {
        await server.connect(transport);
    }

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
    getTransportType,
    // v2.0.0 export - per-session server factory for the HTTP transport (issue #36)
    createMcpServer
};
