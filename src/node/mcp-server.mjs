#!/usr/bin/env node
// The shebang matters because this file is a `bin` entry. Without it npm still creates the
// symlink, and the shell tries to run the JavaScript AS A SHELL SCRIPT:
//     cyberchef-mcp: line 1: /bin: Is a directory
// Node strips a shebang before parsing, so it costs nothing on the `import` path.
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * MCP Server entry point.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { help } from "./index.mjs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
    CallToolRequestSchema, ListToolsRequestSchema,
    ListPromptsRequestSchema, GetPromptRequestSchema,
    ListResourcesRequestSchema, ReadResourceRequestSchema, ListResourceTemplatesRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import Utils from "../core/Utils.mjs";
import OperationConfig from "../core/config/OperationConfig.json" with {type: "json"};
import { toContentBlocks } from "./lib/content-blocks.mjs";
import { annotationsForOperation, annotationsForMetaTool } from "./lib/tool-annotations.mjs";
import { listPrompts, getPrompt } from "./lib/prompts.mjs";
import { listResources, readResource, listResourceTemplates } from "./lib/resources.mjs";
import { bakeOnCore } from "./lib/core-recipe.mjs";
import { isExposed, describeSurface } from "./lib/tool-surface.mjs";
import { categoryIndex, listOperations, describeOperations } from "./lib/tool-catalog.mjs";
import { installWasmFetch } from "./lib/wasm-fetch.mjs";

// Installed BEFORE any operation can run. `argon2-browser` fetches its .wasm by filesystem path,
// which Node's fetch rejects, and jq-web's Emscripten runtime turns that unhandled rejection into
// a process-wide abort() -- one tool call killing the server for every connected client.
installWasmFetch();

/**
 * Size of a batch payload, for telemetry, tolerating a missing or unserialisable value.
 *
 * `JSON.stringify(undefined)` returns `undefined`, not a string, so the previous
 * `JSON.stringify(args.operations).length` threw when `operations` was absent -- INSIDE the catch
 * block, which meant the caller received `Cannot read properties of undefined (reading 'length')`
 * instead of the structured "Operations must be a non-empty array" the guard had correctly
 * produced. An error handler that throws replaces a good diagnosis with a bad one.
 *
 * @param {*} operations - The batch operations, possibly missing.
 * @returns {number} Serialised length, or 0 when there is nothing to measure.
 */
function batchInputSize(operations) {
    try {
        const json = JSON.stringify(operations);
        return typeof json === "string" ? json.length : 0;
    } catch {
        return 0;
    }
}

/**
 * A human-readable title for one of this server's own tools.
 *
 * `cyberchef_recipe_create` reads poorly in a client's tool picker; "Recipe create" does. Derived
 * rather than tabulated, so a new meta-tool gets a reasonable title without anyone remembering to
 * add one.
 *
 * @param {string} toolName - The tool name, including the `cyberchef_` prefix.
 * @returns {string} The title.
 */
function metaToolTitle(toolName) {
    const words = toolName.replace(/^cyberchef_/, "").replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Byte size of a content-block array, for telemetry and quota accounting.
 *
 * Measures what is actually sent rather than only the text: an `image` block's payload is its
 * base64 `data`, and charging a QR code as 0 bytes would make the quota tracker lie about exactly
 * the results that are largest.
 *
 * @param {Array<Object>} content - MCP content blocks.
 * @returns {number} Total UTF-8 bytes of the payload fields.
 */
function contentSize(content) {
    return content.reduce((total, block) => {
        const payload = typeof block.text === "string" ? block.text : block.data;
        return total + (typeof payload === "string" ? Buffer.byteLength(payload, "utf8") : 0);
    }, 0);
}

/**
 * A tool result carrying BOTH a text rendering and the structured object.
 *
 * MCP's rule is strict and easy to get half-right: a tool that declares an `outputSchema` MUST
 * return `structuredContent` matching it, and `content` must still be present for clients that do
 * not read structured results. Building both from ONE value here means they cannot disagree --
 * which is the failure that would otherwise be invisible, since a client reading only `content`
 * would never notice the structured half drifting.
 *
 * @param {Object} value - The structured result.
 * @returns {{content: Array<Object>, structuredContent: Object}} The tool result.
 */
function structuredResult(value) {
    return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
        structuredContent: value
    };
}

/**
 * Longest operation description carried in `tools/list`.
 *
 * 240 characters comfortably holds the "what it does" sentence for essentially every operation
 * while cutting the reference material out of the always-loaded payload. Configurable because a
 * caller optimising hard for context may want it shorter, and one browsing interactively may not.
 */
const MAX_TOOL_DESCRIPTION = (() => {
    const parsed = parseInt(process.env.CYBERCHEF_MAX_TOOL_DESCRIPTION, 10);
    return Number.isNaN(parsed) || parsed < 40 ? 240 : parsed;
})();

/**
 * Convert a Zod schema to the JSON Schema an MCP `inputSchema` must carry.
 *
 * Replaces `zod-to-json-schema`, which targets Zod **v3** and FAILS SILENTLY against v4: given any
 * v4 schema it returns the bare envelope
 *
 *     {"$schema": "http://json-schema.org/draft-07/schema#"}
 *
 * with no `type`, no `properties` and no `required` -- no error, no warning. Zod 4 restructured
 * the internals the converter introspects, so it finds nothing and emits nothing. Every tool this
 * server advertised had an empty input schema from v1.8.0 (when Zod 4 landed) through v2.0.0, so a
 * spec-compliant client rejected `tools/list` outright, and a lenient one showed the model tools
 * whose arguments it could not see. Zod 4 has a native converter; this uses it.
 *
 * Options, each load-bearing:
 *   target "draft-7"       -- what the MCP tool schema and the LLM tool APIs expect, and what the
 *                             old (empty) output claimed to be, so nothing downstream shifts draft.
 *   io "input"             -- these ARE input schemas; it also omits `additionalProperties: false`,
 *                             which the "output" default would add.
 *   unrepresentable "any"  -- a type with no JSON Schema equivalent becomes `{}` instead of
 *                             THROWING. With 524 generated tools, one such argument in one
 *                             operation would otherwise take down the whole `tools/list`.
 *
 * @param {import("zod").ZodType} schema - The Zod schema to convert.
 * @returns {Object} A JSON Schema object with `type: "object"`.
 */
function toInputSchema(schema) {
    const json = z.toJSONSchema(schema, {
        target: "draft-7",
        io: "input",
        unrepresentable: "any"
    });

    // `$schema` is dropped. It is 41 bytes of identical boilerplate on every tool -- 21 KB across
    // 524 of them, paid on every `tools/list` -- and the MCP tool schema does not ask for it: a
    // client validates `inputSchema` as a JSON Schema object regardless. Verified against the
    // official SDK client, which accepts the tool list without it.
    delete json.$schema;
    return json;
}

/**
 * Shorten an operation description for the tool list.
 *
 * CyberChef descriptions are written for a browser pane: they carry `<br>`, `<code>` and `<a>`
 * markup, and the longest runs to 6,423 characters. Summed over 524 tools they were 141 KB --
 * 30% of the entire `tools/list` payload -- and the tail of a long description is reference
 * material a model does not need in order to CHOOSE a tool.
 *
 * The first sentence is kept, which is where CyberChef consistently puts what the operation does,
 * with markup converted to plain text. `cyberchef_search` returns the full description for a
 * caller that wants the detail, so nothing is lost -- only moved off the always-loaded path.
 *
 * @param {string} description - The raw description from OperationConfig.
 * @returns {string} A plain-text summary.
 */
function summariseDescription(description) {
    if (typeof description !== "string" || !description.length) return "";

    // `Utils.stripHtmlTags` + `Utils.unescapeHtml` rather than a hand-rolled pair of regexes.
    //
    // The first draft did roll its own -- `.replace(/<[^>]+>/g, "")` then a chain of entity
    // replacements -- and CodeQL was right to flag it twice: `js/incomplete-multi-character-
    // sanitization` (a `<scr<script>ipt>` construction survives a single pass) and
    // `js/double-escaping` (unescaping `&amp;` before `&lt;` turns `&amp;lt;` into `<`).
    //
    // Neither is reachable from here -- the input is CyberChef's own operation descriptions, which
    // are static, and the output goes into a JSON string rather than a DOM. That is an argument
    // for the finding being low severity, not for keeping a hand-rolled HTML sanitiser: this
    // module now uses the same pair the Node API itself uses in `DishHTML.toArrayBuffer()`, so
    // there is one implementation to be wrong rather than three.
    const plain = Utils.unescapeHtml(Utils.stripHtmlTags(description, true))
        .replace(/\s+/g, " ")
        .trim();

    if (plain.length <= MAX_TOOL_DESCRIPTION) return plain;

    // Prefer a sentence boundary, so the text does not stop mid-clause. Only accept one that is
    // not uselessly short -- truncating "e.g." to four characters would be worse than a hard cut.
    const cut = plain.slice(0, MAX_TOOL_DESCRIPTION);
    const stop = cut.lastIndexOf(". ");
    return (stop > MAX_TOOL_DESCRIPTION / 3) ? cut.slice(0, stop + 1) : `${cut.trimEnd()}...`;
}

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
import { sanitizeToolName, mapArgsToZod, resolveArgValue, validateInputSize, toolArgName, assertKnownArgs} from "./lib/tool-schema.mjs";

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

/**
 * What this server advertises it can do.
 *
 * ONE declaration, for the same reason `registerHandlers` is one registration site: there are two
 * places a server is constructed -- the module singleton that backs stdio, and the per-session
 * factory that backs HTTP -- and two capability lists drift. That is not hypothetical. Adding
 * prompts and resources updated the factory and left the singleton advertising `tools` only, so
 * every stdio client (which is most of them) would have been told this server has no prompts while
 * the handlers sat there answering.
 *
 * A capability listed here MUST have a handler in `registerHandlers`; advertising one without a
 * handler makes a client call something that answers "method not found".
 */
const SERVER_CAPABILITIES = {
    tools: {},
    prompts: {},
    resources: {}
};

const server = new Server(
    {
        name: "cyberchef-mcp",
        version: VERSION,
    },
    { capabilities: SERVER_CAPABILITIES }
);


// Note: withTimeout and executeWithStreaming have been replaced by:
// - executeWithTimeoutAndRetry in retry.mjs
// - executeWithStreamingStrategy in streaming.mjs

const handleListTools = async () => {
    const tools = [
        {
            name: "cyberchef_bake",
            description: "Execute a CyberChef recipe. Use this for complex chains of operations.",
            inputSchema: toInputSchema(z.object({
                input: z.string().describe("The input data"),
                recipe: z.array(z.object({
                    op: z.string().describe("Operation name"),
                    // BOTH forms, because both are supported and only one was advertised.
                    //
                    // This declared `z.array(z.any())` -- positional only -- while the
                    // implementation has accepted named arguments since DEP005, and named
                    // arguments are the entire reason a model can use these operations correctly.
                    // A client that validates outbound arguments against `inputSchema` therefore
                    // could not send the supported form at all, and `cyberchef_recipe_create`
                    // disagreed with it two tools away by declaring `z.record(z.any())`.
                    //
                    // Named is listed first so it reads as the primary form.
                    args: z.union([
                        z.record(z.string(), z.any()),
                        z.array(z.any())
                    ]).optional().describe(
                        "Operation arguments. Either named -- {\"key\": \"...\", \"iv\": \"...\"} " +
                        "-- or positional, as the CyberChef UI writes them. Use " +
                        "cyberchef_describe_operation for the argument names."
                    )
                })).describe("List of operations to perform")
            }))
        },
        {
            name: "cyberchef_categories",
            description: "List CyberChef's operation categories with counts and examples. " +
                "Start here to browse what this server can do, then use cyberchef_list_operations.",
            inputSchema: toInputSchema(z.object({})),
            // Declared only for the tools whose shape THIS SERVER defines. The 504 operations are
            // not given one: their output is whatever CyberChef returns, undocumented and varying
            // per operation, and inventing a schema for it would be a claim rather than a contract.
            outputSchema: toInputSchema(z.object({
                categories: z.array(z.object({
                    category: z.string(),
                    operations: z.number(),
                    examples: z.array(z.string())
                })),
                totalOperations: z.number(),
                usage: z.string()
            }))
        },
        {
            name: "cyberchef_list_operations",
            outputSchema: toInputSchema(z.object({
                category: z.string(),
                operations: z.array(z.object({
                    operation: z.string(),
                    summary: z.string(),
                    args: z.number()
                })),
                next: z.string()
            })),
            description: "List the operations in one category, with a one-line summary of each. " +
                "Use cyberchef_describe_operation for full argument schemas.",
            inputSchema: toInputSchema(z.object({
                category: z.string().describe(
                    "Category name, e.g. \"Encryption / Encoding\", \"Hashing\", \"Extractors\"")
            }))
        },
        {
            name: "cyberchef_describe_operation",
            description: "Full argument schema, defaults and types for one or more operations. " +
                "This is what you need before calling cyberchef_bake with a new operation.",
            inputSchema: toInputSchema(z.object({
                operations: z.union([z.string(), z.array(z.string())]).describe(
                    "One operation name, or several, e.g. \"AES Encrypt\" or [\"Gzip\", \"To Base64\"]")
            }))
        },
        {
            name: "cyberchef_search",
            description: "Search for available CyberChef operations.",
            inputSchema: toInputSchema(z.object({
                query: z.string().describe("Search query")
            }))
        },
        // Recipe management tools (v1.6.0)
        {
            name: "cyberchef_recipe_create",
            description: "Create a new recipe with multiple operations.",
            inputSchema: toInputSchema(z.object({
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
            inputSchema: toInputSchema(z.object({
                id: z.string().uuid().describe("Recipe UUID")
            }))
        },
        {
            name: "cyberchef_recipe_list",
            description: "List all recipes with optional filtering.",
            inputSchema: toInputSchema(z.object({
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
            inputSchema: toInputSchema(z.object({
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
            inputSchema: toInputSchema(z.object({
                id: z.string().uuid().describe("Recipe UUID")
            }))
        },
        {
            name: "cyberchef_recipe_execute",
            description: "Execute a saved recipe with input data.",
            inputSchema: toInputSchema(z.object({
                id: z.string().uuid().describe("Recipe UUID"),
                input: z.string().describe("Input data to process")
            }))
        },
        {
            name: "cyberchef_recipe_export",
            description: "Export a recipe to various formats (json, yaml, url, cyberchef).",
            inputSchema: toInputSchema(z.object({
                id: z.string().uuid().describe("Recipe UUID"),
                format: z.enum(["json", "yaml", "url", "cyberchef"]).describe("Export format")
            }))
        },
        {
            name: "cyberchef_recipe_import",
            description: "Import a recipe from various formats.",
            inputSchema: toInputSchema(z.object({
                data: z.string().describe("Recipe data to import"),
                format: z.enum(["json", "yaml", "url", "cyberchef"]).describe("Import format")
            }))
        },
        {
            name: "cyberchef_recipe_validate",
            description: "Validate a recipe without saving it.",
            inputSchema: toInputSchema(z.object({
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
            inputSchema: toInputSchema(z.object({
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
            inputSchema: toInputSchema(z.object({
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
            inputSchema: toInputSchema(z.object({
                format: z.enum(["json", "summary"]).default("json").describe("Export format")
            }))
        },
        {
            name: "cyberchef_cache_stats",
            description: "Get cache statistics including hits, misses, size, and items.",
            inputSchema: toInputSchema(z.object({}))
        },
        {
            name: "cyberchef_cache_clear",
            description: "Clear the operation result cache.",
            inputSchema: toInputSchema(z.object({}))
        },
        {
            name: "cyberchef_quota_info",
            description: "Get current resource quota information including concurrent operations and data sizes.",
            inputSchema: toInputSchema(z.object({}))
        },
        // v1.8.0 tools - Breaking Changes Preparation
        {
            name: "cyberchef_migration_preview",
            description: "Analyze recipes and configurations for v2.0.0 compatibility. Returns compatibility issues and optionally transforms recipes to v2.0.0 format.",
            inputSchema: toInputSchema(z.object({
                recipe: z.any().describe("Recipe object or array to analyze"),
                mode: z.enum(["analyze", "transform"]).default("analyze").describe("analyze: check compatibility, transform: convert to v2.0.0 format")
            }))
        },
        {
            name: "cyberchef_deprecation_stats",
            description: "Get statistics on deprecated API usage in current session. Shows which deprecation warnings have been triggered and v2.0.0 preparation status.",
            inputSchema: toInputSchema(z.object({}))
        },
        // v1.9.0 tools - Worker Thread Pool
        {
            name: "cyberchef_worker_stats",
            description: "Get worker thread pool statistics including thread count, utilization, and completed tasks. Only available when ENABLE_WORKERS=true.",
            inputSchema: toInputSchema(z.object({}))
        }
    ];

    // Annotations for the meta-tools, applied in one pass rather than repeated across 24 literals
    // -- where they would drift, and where a missing one is invisible.
    for (const tool of tools) {
        tool.annotations = annotationsForMetaTool(tool.name, metaToolTitle(tool.name));
    }

    Object.keys(OperationConfig).forEach(opName => {
        // The default surface is `index`, which pre-loads no ordinary operation tools at all;
        // `curated` and `all` pre-load progressively more, and CYBERCHEF_TOOL_ALLOWLIST overrides
        // the mode entirely. Nothing becomes unreachable under any of them -- cyberchef_bake runs
        // any operation by name, and the navigation tools find the name and its schema.
        if (!isExposed(opName)) return;

        const op = OperationConfig[opName];
        const toolName = sanitizeToolName(opName);
        if (!toolName) return;

        try {
            const argsSchema = mapArgsToZod(op.args || []);
            tools.push({
                name: toolName,
                description: summariseDescription(op.description) || opName,
                inputSchema: toInputSchema(z.object(argsSchema)),
                // Derived from the operation, not the tool name, because that is what the
                // read-only/idempotent/open-world facts are actually about.
                annotations: annotationsForOperation(opName)
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

const handleCallTool = async (request, extra, ownerServer = server) => {
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
                () => bakeOnCore(args.input, args.recipe),
                OPERATION_TIMEOUT,
                { requestId, maxRetries: RetryConfig.MAX_RETRIES, context: { tool: name } }
            );

            // An image-producing recipe returns an `image` block rather than the empty string
            // stripping its markup used to yield. See lib/content-blocks.mjs.
            const content = toContentBlocks(result);
            logRequestComplete(requestId, { outputSize: contentSize(content) });

            return { content };
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

        // Navigation tools -- the "index" tool surface. See lib/tool-catalog.mjs for why this
        // hierarchy exists: it keeps 504 operation schemas off the always-loaded payload while
        // leaving every one of them reachable.
        if (name === "cyberchef_categories") {
            const result = structuredResult(categoryIndex());
            logRequestComplete(requestId, { outputSize: contentSize(result.content) });
            return result;
        }

        if (name === "cyberchef_list_operations") {
            try {
                const result = structuredResult(listOperations(args.category));
                logRequestComplete(requestId, { outputSize: contentSize(result.content) });
                return result;
            } catch (err) {
                const error = createInputError(err.message, { category: args.category });
                logRequestError(requestId, error, { tool: name });
                return error.toMCPError();
            }
        }

        if (name === "cyberchef_describe_operation") {
            const output = JSON.stringify(
                describeOperations(args.operations, toolArgName), null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });
            return { content: [{ type: "text", text: output }] };
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
                    inputSize: batchInputSize(args.operations),
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
                    inputSize: batchInputSize(args.operations),
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
                    // Same guard as the recipe path: an argument name this operation does not have
                    // must be an error, not a silently-defaulted value. `input` is excluded because
                    // it is the data parameter this server adds, not one of the operation's own --
                    // which is exactly why a colliding argument is renamed to `input_arg`.
                    const opArgs = Object.fromEntries(
                        Object.entries(args).filter(([key]) => key !== "input")
                    );
                    assertKnownArgs(opName, opConfig.args, opArgs);

                    opConfig.args.forEach(argDef => {
                        const userVal = args[toolArgName(argDef.name)];
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
                    // Passed as a FUNCTION, not as a stand-in Server object. An earlier revision
                    // built `{ notification: ... }` here, which would break the moment
                    // executeWithStreamingProgress touched any other Server member; handing it the
                    // one capability it actually uses removes that coupling entirely.
                    //
                    // The fallback keeps the module server for callers that invoke the handler
                    // directly without an `extra` (the existing unit tests do exactly that).
                    const sendNotification = typeof extra?.sendNotification === "function" ?
                        extra.sendNotification :
                        (n => ownerServer.notification(n));

                    // Execute with streaming progress support
                    result = await executeWithStreamingProgress({
                        bakeFunction: bakeOnCore,
                        operation: opName,
                        input: args.input,
                        recipeArgs,
                        recipe,
                        sendNotification,
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

                // `opConfig.outputType` rather than the recipe's, because a direct operation tool
                // runs exactly one operation -- this is what makes `cyberchef_generate_qr_code`
                // return the picture instead of "".
                const content = toContentBlocks(result, opConfig.outputType);
                const outputSize = contentSize(content);
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

                return { content };
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
        { capabilities: SERVER_CAPABILITIES }
    );
    registerHandlers(instance);
    return instance;
}

/**
 * Attach every request handler to a server instance.
 *
 * ONE registration site, used by both the module singleton and every per-session instance. Listing
 * the handlers twice is how an HTTP session silently loses a capability that stdio has: the two
 * lists drift, nothing fails, and the only symptom is a method that works over one transport and
 * not the other. Adding a handler here reaches both by construction.
 *
 * @param {Server} instance - The server to attach handlers to.
 * @returns {Server} The same instance, for chaining.
 */
function registerHandlers(instance) {
    instance.setRequestHandler(ListToolsRequestSchema, handleListTools);
    // The instance is bound in as the notification FALLBACK. `extra.sendNotification` remains the
    // primary path -- it is the SDK's documented per-request routing and is correct by
    // construction -- but if a future SDK reshapes `extra`, the fallback must not quietly become
    // "the module singleton", which for an HTTP session is precisely the bug this PR fixes,
    // returning silently. Bound this way it degrades to *this session's* server instead.
    instance.setRequestHandler(CallToolRequestSchema, (req, extra) => handleCallTool(req, extra, instance));

    // Prompts: the entry points for someone who does not yet know which of 504 operations
    // they need. See lib/prompts.mjs.
    instance.setRequestHandler(ListPromptsRequestSchema, () => listPrompts());
    instance.setRequestHandler(GetPromptRequestSchema, (req) =>
        getPrompt(req.params.name, req.params.arguments || {}));

    // Resources: saved recipes, browsable without spending a tool call. See lib/resources.mjs.
    instance.setRequestHandler(ListResourcesRequestSchema, () => listResources(recipeManager));
    instance.setRequestHandler(ListResourceTemplatesRequestSchema, () => listResourceTemplates());
    instance.setRequestHandler(ReadResourceRequestSchema, (req) =>
        readResource(recipeManager, req.params.uri));

    return instance;
}

// The module-level instance backs stdio, which is single-connection by construction, and is what
// the existing test suite drives. HTTP builds its own per session.
registerHandlers(server);

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
    const { transport, closeAll } = await createTransport({ createServer: createMcpServer });
    if (transport) {
        await server.connect(transport);
    }

    // Shut down cleanly on a signal. Without this, SIGTERM (which is what `docker stop` sends)
    // killed the process with sessions still open and the listener still bound: clients saw a
    // dropped connection rather than a closed session, and the container took the full stop
    // timeout to exit because keep-alive sockets held the loop open.
    //
    // Registered only when there is something to close, so stdio -- where the process ending IS
    // the teardown -- keeps its current behaviour and its default signal handling.
    if (typeof closeAll === "function") {
        let shuttingDown = false;
        // POSIX exit status for a signal death: 128 + signum. Exiting 0 tells a supervisor the
        // process stopped of its own accord, which is not what happened -- systemd, Docker and
        // anything reading $? cannot then distinguish "asked to stop" from "finished".
        const SIGNAL_NUMBERS = { SIGINT: 2, SIGTERM: 15 };
        const shutdown = (signal) => {
            // Guard against a second signal arriving mid-teardown and re-entering closeAll.
            if (shuttingDown) return;
            shuttingDown = true;
            const logger = getLogger();
            logger.info(`${signal} received: closing HTTP sessions and listener`);
            closeAll()
                .catch(err => logger.error(`shutdown failed: ${err.message}`))
                .finally(() => process.exit(128 + (SIGNAL_NUMBERS[signal] ?? 0)));
        };
        // `once` per signal, AND the boolean. They cover different cases and neither is
        // redundant: `once` stops a repeated SIGINT from re-entering, the boolean stops a SIGINT
        // followed by a SIGTERM from doing so -- which is exactly what an impatient operator or a
        // supervisor escalating from TERM to INT produces.
        process.once("SIGINT", () => shutdown("SIGINT"));
        process.once("SIGTERM", () => shutdown("SIGTERM"));
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
    const allOps = Object.keys(OperationConfig);
    logger.info(describeSurface(allOps.filter(isExposed).length, allOps.length));
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
