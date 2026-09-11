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

// `help` is NOT imported eagerly. src/node/index.mjs pulls all every operation implementation
// and costs ~1150 ms -- 88% of this server's startup -- for a function used by exactly one
// tool. See lib/node-api.mjs for the measurement.
// FIRST, and it must stay first. Settings are read at module load into constants, so
// `cyberchef.config.json` has to reach `process.env` before any module that reads one is
// evaluated. ES imports run depth-first in source order, which is the entire mechanism.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { configFileResult } from "./lib/bootstrap-config.mjs";
import { loadNodeApi } from "./lib/node-api.mjs";
import { Server } from "@modelcontextprotocol/server";
import { z } from "zod";
import Utils from "../core/Utils.mjs";
import OperationConfig from "../core/config/OperationConfig.json" with {type: "json"};
import { toContentBlocks } from "./lib/content-blocks.mjs";
import { annotationsForOperation, annotationsForMetaTool } from "./lib/tool-annotations.mjs";
import { currentAuth, insufficientScopeChallenge, loadAuthConfig } from "./lib/auth.mjs";
import {
    authorise, visibleTools, requiredScopesForRecipe, requiredScopes, RECIPE_SCOPED_TOOLS
} from "./lib/rbac.mjs";
import { serverCacheHints } from "./lib/cache-hints.mjs";

/**
 * Cache hints for the list results, resolved once.
 *
 * Auth is a process-wide setting, so whether `tools/list` is shareable is decidable here rather
 * than per request. Validated by the SDK at construction, so a bad value fails startup.
 */
const CACHE_HINTS = serverCacheHints(loadAuthConfig().enabled);
import { audit, OUTCOME } from "./lib/audit.mjs";
import { currentTenant, callerKey } from "./lib/tenancy.mjs";
import { listPrompts, getPrompt } from "./lib/prompts.mjs";
import { listResources, readResource, listResourceTemplates } from "./lib/resources.mjs";
import { bakeOnCore, toCoreRecipe } from "./lib/core-recipe.mjs";
import { assertOfflineAllowed } from "./lib/offline.mjs";
import { runMagic, renderMagicReport } from "./lib/magic.mjs";
import { isExposed, describeSurface, removedAliasWarning, surfaceMode } from "./lib/tool-surface.mjs";
import {
    categoryIndex, listOperations, describeOperations, summariseSearch
} from "./lib/tool-catalog.mjs";
import { installWasmFetch } from "./lib/wasm-fetch.mjs";
import { buildRegistry, ToolRegistry } from "./tools/index.mjs";

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
import { withServerSpan, ATTR, parentContextFrom } from "./lib/otel.mjs";
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

// Extracted subsystems. These were inline classes and helpers in this file until the
// v2.0.0 decomposition. Behaviour is unchanged, and they are re-exported unchanged at
// the bottom of this file so the existing test surface keeps working untouched.
import {
    VERSION, MAX_INPUT_SIZE, OPERATION_TIMEOUT, STREAMING_THRESHOLD, ENABLE_STREAMING,
    ENABLE_WORKERS, CACHE_MAX_SIZE, CACHE_MAX_ITEMS, BATCH_MAX_SIZE, BATCH_ENABLED,
    TELEMETRY_ENABLED, RATE_LIMIT_ENABLED, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW,
    CACHE_ENABLED
} from "./lib/config.mjs";
import { LRUCache } from "./lib/cache.mjs";
import { MemoryMonitor } from "./lib/memory.mjs";
import { TelemetryCollector, OVERFLOW_TOOL } from "./lib/telemetry.mjs";
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

/*
 * WHY `tasks` AND `extensions` ARE NOT HERE (assessed for v3.0.0, decided against)
 *
 * 2026-07-28 moves long-running work into an official extension,
 * `io.modelcontextprotocol/tasks` -- `tasks/get` polling, `tasks/update` for client input -- and
 * adds an `extensions` field to `ServerCapabilities`. Both were considered and neither is declared.
 *
 * 1. The problem is already solved differently here. `streaming.mjs` plus progress notifications
 *    cover long operations, and the worker pool keeps them off the event loop. CyberChef
 *    operations run in seconds; a polling model buys nothing for work that finishes before a
 *    client could poll twice.
 *
 * 2. There is nowhere to put the state. Tasks need state outliving the request, and this server
 *    deliberately has none: HTTP builds a Server per session and stdio pins one per connection.
 *    Adding a process-wide store re-opens the cross-client isolation issue #36 was filed for and
 *    the tenant partitioning in recipe-storage.
 *
 * 3. The rule immediately above forbids it. A capability listed here MUST have a handler, and
 *    tasks is a subsystem -- a store, a retention policy, three methods -- not a declaration.
 *
 * An empty `extensions: {}` is likewise omitted rather than added for completeness: it advertises
 * nothing and would read to the next person as an intent that does not exist.
 *
 * `tests/mcp/prompts-resources.test.mjs` asserts both are absent. That is a tripwire, not
 * pedantry: `@modelcontextprotocol/server` is pinned `^2.0.0`, and a 2.x minor that began
 * auto-declaring either would otherwise ship silently and promise handlers that are not here.
 */

const server = new Server(
    {
        name: "cyberchef-mcp",
        version: VERSION,
    },
    { capabilities: SERVER_CAPABILITIES, cacheHints: CACHE_HINTS }
);


// Note: withTimeout and executeWithStreaming have been replaced by:
// - executeWithTimeoutAndRetry in retry.mjs
// - executeWithStreamingStrategy in streaming.mjs

/**
 * The meta-tools: everything not derived from OperationConfig and not from the registry.
 *
 * Lifted to module scope so the names are ADDRESSABLE. The registry needs them as reserved
 * names -- a registry tool must never be able to shadow `cyberchef_bake` -- and a hand-listed
 * copy would be a second source of truth, which is always the one that goes stale.
 *
 * A static literal: nothing here reads configuration or the operation set, which is what makes
 * lifting it safe.
 */
const META_TOOLS = [
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
        name: "cyberchef_analyse",
        description: "Run one of this server's analysis tools -- analyses a CyberChef operation " +
            "cannot express, such as recovering an XOR key length, breaking a classical cipher, " +
            "identifying a hash, validating an X.509 chain or identifying a post-quantum key. " +
            "List them with cyberchef_categories, get a schema with cyberchef_describe_operation, " +
            "then run it here. These are NOT operations and cannot be used in a cyberchef_bake " +
            "recipe.",
        inputSchema: toInputSchema(z.object({
            tool: z.string().describe(
                "Analysis tool name, without the `cyberchef_` prefix, e.g. \"hash_identify\", " +
                "\"xor_key_length\", \"pqc_identify\". Either form is accepted."),
            // `.passthrough()` rather than a closed object: the real schema belongs to the tool
            // being dispatched to, and it is validated against that schema below. Declaring a
            // closed shape here would reject every argument any tool actually takes.
            arguments: z.object({}).passthrough().optional().describe(
                "Arguments for the tool, matching the schema cyberchef_describe_operation returns " +
                "for it.")
        }))
        // NO `outputSchema`, deliberately, and for the reason the meta-tools next to this one
        // give: it is declared only where THIS SERVER defines the shape. What `analyse` returns is
        // whatever the dispatched registry tool returns -- nineteen different shapes today and
        // more later -- so any schema here would be a claim rather than a contract. An empty
        // passthrough object would be the emptiest possible claim while still making the SDK
        // validate against it.
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
        description:
            "Search for available CyberChef operations. Returns names and one-line summaries; " +
            "follow up with cyberchef_describe_operation for argument schemas.",
        inputSchema: toInputSchema(z.object({
            query: z.string().describe("Search query"),
            detailed: z.boolean().optional().describe(
                "Return the full operation entries instead of summaries. Costs roughly 8x the " +
                "bytes; prefer cyberchef_describe_operation for the few operations you want.")
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
    // v1.9.0 tools - Worker Thread Pool
    {
        name: "cyberchef_worker_stats",
        description: "Get worker thread pool statistics including thread count, utilization, and completed tasks. Only available when ENABLE_WORKERS=true.",
        inputSchema: toInputSchema(z.object({}))
    }
];

/** @returns {string[]} Every meta-tool name, for collision checks. */
function metaToolNames() {
    return META_TOOLS.map(t => t.name);
}

/**
 * Tools that are not CyberChef operations.
 *
 * Built at startup, from an explicit manifest -- nothing is loaded from disk. See
 * `src/node/tools/registry.mjs` and ADR 0002 for why there is no plugin loader.
 *
 * The reserved-name set is every tool name that already exists: all 504 operation tools plus the
 * meta-tools. Passing it in means a registry tool that would shadow one fails HERE, at startup,
 * rather than silently winning or losing a race at call time depending on import order.
 */
/**
 * The MCP annotations for any tool name, whichever of the three kinds it is.
 *
 * Authorisation reads annotations, and annotations are produced in three different places --
 * registry tools carry their own, meta-tools derive theirs from a name, operations derive theirs
 * from `OperationConfig`. Resolving that in one function keeps the access-control decision from
 * depending on which branch of `tools/list` happened to build the entry.
 *
 * **Fails closed.** An unknown name returns the most restrictive annotations rather than an empty
 * object: `{}` would read as "not read-only, not open-world" and be authorised by `cyberchef:write`.
 * A name nobody recognises should need the strongest scope, not a middling one.
 *
 * @param {string} name - The exposed tool name.
 * @returns {Object} MCP annotations.
 */
function annotationsForToolName(name) {
    const registryTool = toolRegistry.getByExposedName(name);
    if (registryTool) return registryTool.annotations || { readOnlyHint: false, openWorldHint: true };
    if (metaToolNames().includes(name)) return annotationsForMetaTool(name, metaToolTitle(name));
    const opName = OPERATION_BY_TOOL_NAME.get(name);
    if (opName) return annotationsForOperation(opName);
    return { readOnlyHint: false, openWorldHint: true };
}

const toolRegistry = buildRegistry({
    reservedNames: new Set([
        ...Object.keys(OperationConfig).map(sanitizeToolName).filter(Boolean),
        // Derived from the tool list rather than hand-listed: a hardcoded copy is a second source
        // of truth, and the one that goes stale is always the copy. `handleListTools` builds the
        // meta-tools before the registry's are appended, so calling it here would recurse -- the
        // names come from `metaToolNames()` instead, which reads the same literal array.
        ...metaToolNames()
    ])
});

/**
 * Exposed name -> everything `cyberchef_describe_operation` needs to answer about a registry tool.
 *
 * Built once at startup, the same way `REGISTRY_SEARCH_INDEX` is: the registry is fixed at
 * construction and `toInputSchema` is a pure conversion, so there is nothing for this to go stale
 * against. Doing it per call would re-run the Zod-to-JSON-Schema conversion for every describe.
 *
 * This is what replaced the redirect. Until v4.1.0 `describe_operation` answered "its full schema
 * is already in `tools/list`" -- true, and the reason every registry tool HAD to be listed, since
 * the listing was the only schema path. Serving the schema here is what lets the index drop them.
 */
const REGISTRY_DESCRIBE = new Map(toolRegistry.list().map(tool => [
    ToolRegistry.exposedName(tool.name),
    {
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: toInputSchema(tool.inputSchema),
        annotations: tool.annotations ?? annotationsForMetaTool(
            ToolRegistry.exposedName(tool.name), tool.title)
    }
]));

/**
 * Accept a registry tool name with or without the `cyberchef_` prefix.
 *
 * `cyberchef_describe_operation` answers with the EXPOSED name (`cyberchef_pqc_identify`) while
 * `cyberchef_categories` lists the bare one (`pqc_identify`), so a caller walking the hierarchy
 * meets both spellings before reaching the dispatcher. Rejecting either would be a trap laid by
 * this server's own navigation output.
 *
 * @param {*} tool - Whatever the caller passed as `tool`.
 * @returns {string} The exposed name to look up; `""` when there is nothing usable.
 */
function analyseExposedName(tool) {
    const raw = String(tool ?? "").trim();
    if (!raw) return "";
    return raw.startsWith("cyberchef_") ? raw : ToolRegistry.exposedName(raw);
}

/** The registry tools in the shape `categoryIndex` lists them in. */
const REGISTRY_CATEGORY = toolRegistry.list().map(tool => ({
    name: tool.name,
    exposedName: ToolRegistry.exposedName(tool.name),
    title: tool.title
}));

/**
 * The registry tools in the shape `summariseSearch` needs.
 *
 * `help()` searches `OperationConfig`, which registry tools are deliberately not in -- so without
 * this, searching for "vigenere" returned the two operations that require a key and not the tool
 * that recovers one.
 */
const REGISTRY_SEARCH_INDEX = toolRegistry.list().map(tool => ({
    name: tool.name,
    exposedName: ToolRegistry.exposedName(tool.name),
    title: tool.title,
    description: tool.description
}));

/**
 * Sanitized operation tool name -> the `OperationConfig` key it came from.
 *
 * Built once. The mapping is derived from `OperationConfig`, which is a generated file loaded at
 * startup and never mutated, so there is nothing for a cached index to go stale against -- and
 * `buildRegistry` above already derives exactly these names for its reserved set.
 *
 * It replaces two linear scans that each sanitized all 504 keys on every `tools/call`: one in
 * `toolDimension` and one in the dispatch below. Measured at **223 microseconds** per unresolved
 * lookup, and `toolDimension` runs twice per request -- so roughly half a millisecond of string
 * processing per call, all of it recomputing a constant.
 *
 * The worst case was the one that mattered. An unknown name scans the WHOLE catalogue before
 * failing, so the cardinality defence added CPU amplification on precisely the attack path it
 * exists to blunt. A Map lookup is O(1) whether the name resolves or not.
 */
const OPERATION_BY_TOOL_NAME = new Map(
    Object.keys(OperationConfig)
        .map(key => [sanitizeToolName(key), key])
        .filter(([toolName]) => toolName)
);

/**
 * A tool name safe to use as a telemetry dimension.
 *
 * Returns the name when it resolves to something this server actually dispatches, and
 * `__other__` when it does not.
 *
 * WHY THIS EXISTS
 * ---------------
 * `request.params.name` is caller-controlled and reaches instrumentation BEFORE the unknown-tool
 * check: any `cyberchef_*` name enters the operation branch, acquires quota, fails to resolve, and
 * is recorded as a failure. So an unresolved name would otherwise become a Prometheus label and an
 * OpenTelemetry span attribute.
 *
 * Unbounded, that is a cardinality denial of service against the MONITORING system rather than
 * against this process: each distinct label set is a new time series that persists for the whole
 * retention period, taking out dashboards for every other service sharing that Prometheus. Found
 * in the very first scrape of a running server:
 *
 *     cyberchef_mcp_tool_calls_total{tool="cyberchef_definitely_not_a_tool"} 1
 *
 * A cap alone is not enough, and that is the subtle part. Capping distinct names still lets an
 * attacker fill every slot before real traffic arrives, after which LEGITIMATE tools collapse into
 * the overflow bucket -- the attack degrades exactly the metrics the cap was meant to protect.
 * Resolving against the catalogue removes that, because an unknown name never occupies a slot.
 *
 * Resolution covers all three kinds this server dispatches -- registry tools, meta-tools and
 * operations -- deliberately mirroring `annotationsForToolName`, because a dimension that
 * disagreed with the authorisation decision about what a name IS would be its own bug.
 *
 * The raw name is untouched everywhere the caller can see it: the error response still says which
 * tool was not found, and the audit trail still records what was asked for.
 *
 * @param {string} name - The caller-supplied tool name.
 * @returns {string} The name, or `__other__`.
 */
function toolDimension(name) {
    if (typeof name !== "string" || !name) return OVERFLOW_TOOL;
    if (toolRegistry.getByExposedName(name)) return name;
    if (metaToolNames().includes(name)) return name;
    if (OPERATION_BY_TOOL_NAME.has(name)) return name;
    return OVERFLOW_TOOL;
}

const handleListTools = async () => {
    // A fresh copy each call: annotations are attached below, and mutating the module-level
    // constant would accumulate them across calls.
    const tools = META_TOOLS.map(t => ({ ...t }));

    // Annotations for the meta-tools, applied in one pass rather than repeated across 24 literals
    // -- where they would drift, and where a missing one is invisible.
    for (const tool of tools) {
        tool.annotations = annotationsForMetaTool(tool.name, metaToolTitle(tool.name));
    }

    // Registry tools: analyses that are not CyberChef operations.
    //
    // LISTED ON `curated` AND `all`, NOT ON `index`, since v4.1.0.
    //
    // They were on every surface until then, and the comment here said `CYBERCHEF_TOOL_SURFACE`
    // "exists to keep 504 operation schemas out of the default payload, and there are a handful of
    // these". Nineteen is not a handful: measured, they were 30,683 of the index's 44,968 bytes --
    // 68% of the surface whose entire purpose is being small -- and the tool programme in
    // `docs/planning/ext-proj-int/` scopes 80-120 more.
    //
    // What kept them listed was not stubbornness but a real dependency: `describe_operation`
    // refused them and pointed at `tools/list`, so the listing was the ONLY schema path, and a
    // tool absent from it could not be called at all. v4.1.0 removed that dependency first --
    // `describe_operation` serves their schemas, `categories` lists them, and `cyberchef_analyse`
    // dispatches to them by name. Only then was this safe, and the ordering was the whole risk.
    //
    // NOT a capability boundary. Every one stays callable on every surface through the dispatcher,
    // and `curated`/`all` still list them outright for callers who want schemas up front.
    // `index-growth.test.mjs` asserts both directions, because a gate that only checked the
    // removal could be satisfied by deleting the tools.
    const registryTools = [];
    for (const tool of surfaceMode() === "index" ? [] : toolRegistry.list()) {
        registryTools.push({
            name: ToolRegistry.exposedName(tool.name),
            description: tool.description,
            inputSchema: toInputSchema(tool.inputSchema),
            annotations: tool.annotations ?? annotationsForMetaTool(
                ToolRegistry.exposedName(tool.name), tool.title)
        });
    }

    const operationTools = [];
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
            const argsSchema = mapArgsToZod(op.args || [], opName);
            operationTools.push({
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

    // Deterministic order, which the 2026-07-28 spec asks for so clients can cache a list and so
    // an unchanged prefix keeps hitting an LLM's prompt cache.
    //
    // THREE TIERS, EACH SORTED, THEN CONCATENATED -- not one flat sort. The front of the list is
    // what a model reads first, and the meta-tools are the navigation surface: on the default
    // `index` surface they are nearly the whole list, and burying `cyberchef_bake` among 504
    // alphabetically-earlier operation names would make the catalogue harder to enter, not easier.
    // Tier order is itself part of the contract.
    //
    // `byName` compares CODE UNITS, deliberately not `localeCompare`: that is locale- and
    // ICU-dependent, so the same server would order its tools differently on two hosts -- which is
    // precisely the non-determinism this is meant to remove.
    const ordered = [...tools.sort(byName), ...registryTools.sort(byName), ...operationTools.sort(byName)];

    // Scope filtering, finally wired.
    //
    // `visibleTools` has existed since v2.5.0 with a unit test asserting it works, and nothing
    // called it -- so a token was listed tools it would be refused at dispatch. Tested-but-unwired
    // is a worse state than absent: the green test says the capability is there.
    //
    // BUILD, then SORT, then FILTER. `isExposed` above is a SURFACE decision (which schemas are
    // worth pre-loading); this is an AUTHORISATION decision on the finished list, where the
    // annotations are already attached. The two are orthogonal and stay that way.
    //
    // `currentAuth()` is null on stdio and whenever authorization is disabled -- the default -- so
    // this changes nothing for a deployment that has not asked for scopes.
    const caller = currentAuth();
    return { tools: caller ? visibleTools(ordered, caller.scopes) : ordered };
};

/**
 * The scopes this specific call needs, when they come from a recipe rather than a tool name.
 *
 * Returns `undefined` for everything else, which leaves `authorise` on its annotation-derived
 * path -- so this can only ever refine the two tools in `RECIPE_SCOPED_TOOLS`, never widen the
 * check. `cyberchef_recipe_execute` also carries a recipe and is deliberately not one of them;
 * `rbac.mjs` records why.
 *
 * @param {string} name - The tool being called.
 * @param {Object} args - The call arguments.
 * @returns {string[]|undefined} Required scopes, or undefined to use the annotations.
 */
function recipeScopesFor(name, args) {
    if (!RECIPE_SCOPED_TOOLS.has(name)) return undefined;

    let operationNames = [];
    if (name === "cyberchef_bake") {
        operationNames = toCoreRecipe(args?.recipe).map(step => step.op);
    } else if (name === "cyberchef_analyse") {
        // Priced by the SELECTION, not by the dispatcher. `requiredScopes` reads a tool's own
        // annotations, so authorising `analyse` as itself would run the check against a wrapper
        // while the work runs against whatever the caller named -- and every registry tool sits
        // behind it. This is the `bake` precedent applied to a different kind of argument.
        //
        // Resolution is a Map lookup against a registry fixed at construction, so the check stays
        // where it is: FIRST, before any dispatch. That is the distinction from
        // `cyberchef_recipe_execute`, which carries an id and would need a storage read.
        //
        // An UNRESOLVABLE name returns undefined, which falls back to the dispatcher's own
        // annotations rather than silently authorising. The bad name is then reported by the
        // dispatcher, which is the right place for it -- scope checking is not where a typo
        // should be diagnosed, and this is the same division `cyberchef_batch` uses.
        const selected = toolRegistry.getByExposedName(analyseExposedName(args?.tool));
        return selected ? requiredScopes(selected.annotations ?? {}) : undefined;
    } else if (name === "cyberchef_batch") {
        // A batch names TOOLS, not operations, so each is resolved through the same map dispatch
        // uses. An unresolvable name contributes nothing here and is rejected later by the
        // dispatcher -- scope checking is not the right place to report a bad tool name.
        operationNames = (args?.operations ?? [])
            .map(o => OPERATION_BY_TOOL_NAME.get(o?.tool))
            .filter(Boolean);
    }
    return requiredScopesForRecipe(operationNames, annotationsForOperation);
}

/**
 * Order two tools by name, by code unit.
 *
 * @param {Object} a - A tool.
 * @param {Object} b - Another tool.
 * @returns {number} Negative, zero or positive.
 */
function byName(a, b) {
    if (a.name === b.name) return 0;
    return a.name < b.name ? -1 : 1;
}

/**
 * `tools/call`, wrapped in an OpenTelemetry server span.
 *
 * A thin wrapper rather than instrumentation threaded through the body below, for two reasons.
 * The body has a dozen early returns -- rate limit, quota, authorisation, each meta-tool -- and
 * a span opened per branch would miss some of them the first time anyone adds a branch. And
 * `context.with` makes the span ACTIVE for everything inside, so `traceFields()` in the logger
 * correlates every log line the call produces without a single call site being changed.
 *
 * When no OpenTelemetry SDK is registered this costs approximately 0.08 microseconds, measured
 * over 100,000 cycles. See lib/otel.mjs for why the SDK is not a dependency.
 *
 * @param {Object} request - The MCP request.
 * @param {Object} extra - SDK-supplied request context.
 * @param {Object} [ownerServer] - The Server instance handling this session.
 * @returns {Promise<Object>} The MCP result.
 */
const handleCallTool = async (request, extra, ownerServer = server) => {
    // The DIMENSION, not the raw name: `request.params.name` is caller-controlled and reaches
    // here before the unknown-tool check. See toolDimension() for why a cap alone is not enough.
    const toolName = toolDimension(request?.params?.name);
    return withServerSpan({
        method: "tools/call",
        tool: toolName,
        transport: getTransportType(),
        // Sizes, never content. The arguments to a CyberChef tool are the sensitive material --
        // a key, a password hash, the document being decoded -- so recording them would copy
        // exactly what the caller is analysing into a backend with different retention and
        // different access control. The convention marks those attributes Opt-In; this server
        // does not opt in.
        attributes: typeof request?.params?.arguments?.input === "string" ?
            { [ATTR.INPUT_BYTES]: Buffer.byteLength(request.params.arguments.input, "utf8") } :
            {},
        // The caller's trace, when they sent one. Without this every span here is a ROOT --
        // correct in isolation and useless for answering "what did that agent's call actually
        // do", because the client's span and the server's span sit in two unconnected trees.
        // Reads `_meta` only; `params.arguments` is never touched.
        parent: parentContextFrom(request?.params?._meta)
    }, () => handleCallToolInner(request, extra, ownerServer));
};

const handleCallToolInner = async (request, extra, ownerServer = server) => {
    // `arguments` is OPTIONAL in the MCP schema, so a client may legally omit it entirely -- and
    // forty `args.something` reads below assumed it never would. Omitting it produced a TypeError
    // that surfaced to the caller as
    // `OPERATION_FAILED: Cannot read properties of undefined (reading 'operations')`: an internal
    // message leaked as a tool result, from the very guard added in this release to stop a tool
    // answering unhelpfully.
    //
    // Defaulting here rather than at each of the forty sites, because the next one added would
    // have the same hole. `null` never reaches this line: the SDK rejects it against the schema
    // first, with -32602. Both inputs are pinned by tests.
    const { name, arguments: args = {} } = request.params;

    // Start request tracking
    const requestId = logRequestStart(name, args);

    try {
        // Check memory periodically
        memoryMonitor.check();

        // Per-tool authorisation, BEFORE any dispatch.
        //
        // Position is the whole correctness argument here. This guard first sat further down,
        // just above the quota acquire -- which put it AFTER the meta-tool branches, so
        // `cyberchef_bake` and all ten recipe tools skipped it entirely. That is an
        // authorisation bypass on the most powerful tool in the server: bake runs a
        // caller-supplied recipe containing any operation, including `HTTP request`.
        //
        // Found by the end-to-end test in tests/mcp/auth.test.mjs, which called bake with a
        // read-only token and watched it succeed. Every unit test passed throughout: the
        // annotations were right, the scope maths was right, and the check was simply never
        // reached. A guard in the wrong place is indistinguishable from no guard.
        //
        // `currentAuth()` is null on stdio and whenever authorization is disabled, so this costs
        // nothing for the default deployment.
        const caller = currentAuth();
        if (caller) {
            const annotations = annotationsForToolName(name);
            // A recipe-carrying tool is priced by the recipe it carries, not by its own name, so
            // `bake([To Base64])` costs exactly what `cyberchef_to_base64` costs -- `read` -- and
            // `bake([HTTP request])` costs `network`. Without this the same work was priced
            // differently depending on which door it came through, and the cheaper door was the
            // one exposing 504 separate tools. Same granularity the offline guard settled on.
            const decision = authorise({
                granted: caller.scopes,
                annotations,
                required: recipeScopesFor(name, args)
            });
            if (!decision.allowed) {
                audit({
                    outcome: OUTCOME.DENIED, tool: name, subject: caller.subject,
                    scopes: caller.scopes, required: decision.required, requestId,
                    reason: "tool scope"
                });
                const error = createInputError(
                    `Forbidden: ${name} requires scope ${decision.required.join(" ")}. ` +
                    `This token carries ${caller.scopes.join(" ") || "no scopes"}.`,
                    {
                        required: decision.required,
                        granted: caller.scopes,
                        // The same value the HTTP layer puts in WWW-Authenticate, carried in the
                        // error so a client on a transport without headers can still discover
                        // what to ask for.
                        challenge: insufficientScopeChallenge(loadAuthConfig(), decision.required)
                    }
                );
                logRequestError(requestId, error, { tool: name });
                return error.toMCPError();
            }
            audit({
                outcome: OUTCOME.ALLOWED, tool: name, subject: caller.subject,
                scopes: caller.scopes, requestId
            });
        }

        // Handle meta-tools
        if (name === "cyberchef_bake") {
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
            // CHANGED IN v3.2.0: summarised by default, full entries behind `detailed`.
            //
            // This returned raw `help()` output -- the whole `OperationConfig` entry per match,
            // HTML description and every argument included. Measured on this catalogue before the
            // change: "base64" 14 matches / 27,060 bytes, "aes" 21 matches / 35,642 bytes, more
            // than `cyberchef_describe_operation` returns for the same operations.
            //
            // That is the index surface paid twice. Search is the DISCOVERY step: names and
            // one-liners, then `describe_operation` for the two the caller actually wants. The
            // rest of the hierarchy already works that way and search sat outside it.
            //
            // `detailed: true` keeps the old payload for anyone parsing it, rather than a silent
            // shape change -- and it is opt-in rather than default because the default is what
            // every model pays.
            const { help } = await loadNodeApi();
            const results = help(args.query);
            const output = JSON.stringify(
                args.detailed ? results : summariseSearch(args.query, results, REGISTRY_SEARCH_INDEX), null, 2);
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
            const result = structuredResult(categoryIndex(REGISTRY_CATEGORY));
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
            // `operations` is REQUIRED in the schema, and nothing enforced it. A call that omitted
            // it -- or used the singular `operation`, which is the name a model guesses, and the
            // name this very file uses in prose two hundred lines above -- reached
            // `describeOperations(undefined)`, which stringifies to `""` and answers:
            //
            //     {"operations":[{"operation":"","error":"No such operation. Use cyberchef_search
            //      to find the exact name."}]}
            //
            // Every part of that is unhelpful. The caller is told the operation it did not name
            // does not exist, is pointed at a search tool it does not need, and is not told which
            // argument was missing. v2.2.0 made unknown arguments an error rather than a silent
            // default; this is the same defect from the other side -- a missing REQUIRED argument
            // silently defaulted -- and it was found by writing the surface benchmark, whose first
            // run measured a 197-byte "schema" that was this error. See v3.1.0 findings log F-05.
            //
            // The neighbouring `cyberchef_list_operations` already answers this shape correctly;
            // this now matches it.
            if (args.operations === undefined || args.operations === null) {
                const error = createInputError(
                    "cyberchef_describe_operation requires `operations`: one operation name, or " +
                    "an array of them.",
                    { expected: "operations", received: Object.keys(args ?? {}) });
                logRequestError(requestId, error, { tool: name });
                return error.toMCPError();
            }
            const output = JSON.stringify(
                describeOperations(args.operations, toolArgName,
                    exposed => REGISTRY_DESCRIBE.get(exposed)), null, 2);
            logRequestComplete(requestId, { outputSize: Buffer.byteLength(output, "utf8") });
            return { content: [{ type: "text", text: output }] };
        }

        // Handle v1.7.0 tools
        if (name === "cyberchef_batch") {
            // Check rate limit
            // Keyed by the CALLER, not the request. `requestId` is a fresh randomUUID per
            // request, so every call looked like a first-time caller and nothing was ever
            // limited -- measured at 0 denials in 1000 requests against a limit of 5.
            const limitCheck = rateLimiter.checkLimit(callerKey());
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
                    tool: toolDimension(name),
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
                    tool: toolDimension(name),
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
            // Keyed by the CALLER, not the request. `requestId` is a fresh randomUUID per
            // request, so every call looked like a first-time caller and nothing was ever
            // limited -- measured at 0 denials in 1000 requests against a limit of 5.
            const limitCheck = rateLimiter.checkLimit(callerKey());
            if (!limitCheck.allowed) {
                const error = createInputError(
                    `Rate limit exceeded. Retry after ${limitCheck.retryAfter} seconds.`,
                    { retryAfter: limitCheck.retryAfter }
                );
                logRequestError(requestId, error, { tool: name });
                return error.toMCPError();
            }

            // Check quota.
            //
            // Resolved ONCE and reused for the matching release below. `currentTenant()` is stable
            // within a request, so calling it twice would agree today -- but a slot acquired for
            // one tenant and released against another would corrupt both counts permanently, and
            // that is not a failure mode worth leaving open to a later refactor.
            const quotaTenant = currentTenant();
            if (!quotaTracker.acquire(quotaTenant)) {
                const error = createInputError(
                    `Resource quota exceeded. Maximum concurrent operations: ${quotaTracker.maxConcurrentOps}`,
                    { maxConcurrentOps: quotaTracker.maxConcurrentOps }
                );
                logRequestError(requestId, error, { tool: name });
                return error.toMCPError();
            }

            const startTime = Date.now();
            try {
                // Registry tools first. They are checked BEFORE the operation lookup only because
                // the registry guarantees the two sets are disjoint -- registration throws on a
                // collision with an operation name -- so the order cannot change an answer. It is
                // inside the rate limit and quota block because these tools do real work: this one
                // scores forty candidate key lengths and then calls the engine.
                //
                // TWO DOORS, ONE PATH. `name` is the tool when a caller invokes it directly
                // (possible on `curated`/`all`, where registry tools are listed); `cyberchef_analyse`
                // carries the name in its arguments, which is the only route on the default `index`
                // surface since v4.1.0 stopped listing them.
                //
                // They RESOLVE differently and then execute the same statements. That is the whole
                // design: the charter's rule is that a call through the dispatcher must validate
                // and behave identically to a direct call, and the only way to be sure of that is
                // for there to be one body rather than two that are meant to match.
                let registryTool = toolRegistry.getByExposedName(name);
                let registryArgs = args;
                let registryLabel = name;
                if (!registryTool && name === "cyberchef_analyse") {
                    const wanted = analyseExposedName(args?.tool);
                    registryTool = wanted ? toolRegistry.getByExposedName(wanted) : undefined;
                    if (!registryTool) {
                        // Reported HERE rather than at the scope check, which deliberately falls
                        // back to the dispatcher's own annotations for an unresolvable name. A bad
                        // tool name is a caller error, not an authorisation decision, and
                        // diagnosing it during authorisation would make the error depend on
                        // whether auth happens to be enabled.
                        const known = [...REGISTRY_DESCRIBE.values()].map(t => t.name);
                        throw createInputError(
                            `Unknown analysis tool: ${JSON.stringify(args?.tool ?? null)}. ` +
                            `This server has ${known.length}: ${known.join(", ")}.`,
                            {
                                tool: "cyberchef_analyse",
                                field: "tool",
                                received: args?.tool ?? null,
                                available: known,
                                hint: "Use cyberchef_categories to list them, or " +
                                    "cyberchef_describe_operation for one tool's schema."
                            });
                    }
                    registryArgs = args?.arguments ?? {};
                    // The SELECTED tool's exposed name, so every error and log line below names
                    // the tool that ran rather than the dispatcher. Reporting `cyberchef_analyse`
                    // in an argument error would hand the caller a schema complaint about a tool
                    // whose schema was not the one violated.
                    registryLabel = ToolRegistry.exposedName(registryTool.name);
                }
                if (registryTool) {
                    const parsed = registryTool.inputSchema.safeParse(registryArgs ?? {});
                    if (!parsed.success) {
                        throw createInputError(
                            `Invalid arguments for ${registryLabel}: ${parsed.error.issues.map(i =>
                                `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`,
                            { tool: registryLabel, issues: parsed.error.issues });
                    }
                    // The tool receives capabilities, never the engine itself. Today that is one
                    // function; keeping it a named object is what makes "what can a tool reach"
                    // answerable by reading one line rather than by auditing every tool.
                    //
                    // Held to the SAME timeout as an operation. Without this the registry path was
                    // the one tool path with no time bound at all, which an analysis tool needs
                    // more than a transformation does: its cost comes from the input's shape
                    // rather than its size, so it cannot be predicted from a byte count the way
                    // `validateInputSize` predicts an operation's.
                    //
                    // `maxRetries: 0` deliberately. Retrying a timed-out analysis repeats the
                    // expensive work that caused the timeout -- for an idempotent, purely
                    // CPU-bound tool a retry can only ever make the same call cost twice as much.
                    const result = await executeWithTimeoutAndRetry(
                        () => registryTool.run(parsed.data, { bake: bakeOnCore }),
                        OPERATION_TIMEOUT,
                        { requestId, maxRetries: 0, context: { tool: registryLabel } }
                    );
                    // Every registry tool returns an object; `JSON.stringify` of a bare string
                    // would wrap it in quotes, so a string branch here would be a silent
                    // corruption rather than a convenience. If a tool ever needs to return text it
                    // returns a field containing it.
                    const output = JSON.stringify(result, null, 2);
                    // `contentSize` takes an array of content BLOCKS, not a raw string -- passing
                    // the argument straight in threw `content.reduce is not a function` and turned
                    // a working analysis into a failed tool call. The input here is a plain string.
                    logRequestComplete(requestId, {
                        tool: name,
                        // The whole argument object, not `args.input`. Half the registry tools have
                        // no field called `input` -- `rsa_attack` takes `modulus`, `cyclic_pattern`
                        // takes `fragment` -- so keying on that name logged 0 for them, and a
                        // telemetry figure that is silently zero is worse than an absent one.
                        inputSize: Buffer.byteLength(JSON.stringify(args ?? {}), "utf8"),
                        outputSize: Buffer.byteLength(output, "utf8"),
                        duration: Date.now() - startTime, cached: false, streamed: false
                    });
                    return { content: [{ type: "text", text: output }] };
                }

                const opName = OPERATION_BY_TOOL_NAME.get(name);

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
                        // Both spellings, because `assertKnownArgs` ACCEPTS both. Reading only the
                        // sanitised key meant a raw CyberChef label -- `{"Alphabet": "..."}` --
                        // passed validation and then resolved to `undefined`, so the operation ran
                        // on its default. That is the same silently-wrong-answer failure the
                        // unknown-argument check was added to stop, surviving in the other path.
                        // `core-recipe.mjs` already does it this way.
                        const sanitised = args[toolArgName(argDef.name)];
                        const userVal = sanitised !== undefined ? sanitised : args[argDef.name];
                        recipeArgs.push(resolveArgValue(argDef, userVal));
                    });
                }

                // Offline gate for the direct-operation path.
                //
                // ABOVE THE CACHE, which is the whole point and where the first version had it
                // wrong. It sat below, just before the worker/streaming split -- correct for both
                // execution legs and useless against a cache hit, because the hit returns from the
                // branch below without ever reaching it. Reproduced before fixing: warm the cache
                // with an `HTTP request` while online, set CYBERCHEF_OFFLINE=true, and the cached
                // response is served as though nothing had changed.
                //
                // That is worse than an ordinary bypass. The value returned is a REAL RESPONSE
                // FROM THE NETWORK, handed to a caller who has been told this deployment does not
                // reach one -- so an air-gapped operator sees evidence that it does.
                //
                // The lesson generalises: "above the split" was the wrong ceiling. The guard
                // belongs above EVERY path that can answer the request, and a cache is one of
                // those paths even though it executes nothing.
                assertOfflineAllowed([{ op: opName }], { tool: name });

                // Magic is answered by a renderer, not by the operation.
                //
                // It is the operation an assistant reaches for first on an unknown blob, and the
                // one whose output an assistant could least act on: `presentType: "html"` means
                // Chef applies `present()` regardless of `outputType`, so what reached the client
                // was the web app's results TABLE with its markup stripped -- headers, run-together
                // fields, and the literal string "Recipe (click to load)", a UI affordance with no
                // meaning over MCP. Worse, the recipe in that table is the pretty form, which
                // `bake` REJECTS ("Couldn't find an operation with name 'From_Base64(...)'"), so
                // the single most actionable field was the one field a caller could not use.
                //
                // ABOVE THE CACHE, deliberately, and for a sharper reason than the offline guard:
                // the cache stores `result.value`, a STRING. A structured result cannot round-trip
                // through it, so a cached Magic would come back shaped differently from a fresh
                // one -- exactly the defect that made `cyberchef_generate_qr_code` return an image
                // on the first call and text on every one after it.
                if (opName === "Magic") {
                    const [depth, intensive, extLang, crib] = recipeArgs;

                    // Bounded by the same timeout as every other operation.
                    //
                    // The first version of this branch awaited `runMagic` directly and returned
                    // before the timeout/retry wrapper below, which silently REMOVED a bound that
                    // Magic previously had -- and Magic is the most expensive operation in the
                    // catalogue, since `depth` and `intensive` both multiply the work. Taking the
                    // bound off the one operation most able to run long is the wrong direction,
                    // and it held a quota slot for as long as it took.
                    //
                    // Retries are left at the default: `speculativeExecution` is deterministic
                    // over its input, so a retry after a genuine timeout re-runs identical work.
                    const shaped = await executeWithTimeoutAndRetry(
                        () => runMagic(args.input, { depth, intensive, extLang, crib }),
                        OPERATION_TIMEOUT,
                        { requestId, maxRetries: 0, context: { tool: name } }
                    );
                    const report = renderMagicReport(shaped);
                    const duration = Date.now() - startTime;
                    const magicInputSize = Buffer.byteLength(args.input, "utf8");

                    quotaTracker.trackData(magicInputSize, report.length);
                    telemetryCollector.record({
                        tool: toolDimension(name),
                        duration,
                        inputSize: magicInputSize,
                        outputSize: report.length,
                        success: true,
                        cached: false
                    });
                    logRequestComplete(requestId, {
                        outputSize: report.length, cached: false, streamed: false, duration
                    });

                    // Both halves, built from one value. The text is the readable report a person
                    // is shown; the structured half is the same facts for a client that reads
                    // them. `structuredResult` is not used here because its text half is the JSON,
                    // and a JSON dump is the thing this branch exists to stop sending.
                    return { content: [{ type: "text", text: report }], structuredContent: shaped };
                }

                // Check cache (only if caching is enabled)
                const inputSize = Buffer.byteLength(args.input, "utf8");
                let cacheKey, cached;
                if (CACHE_ENABLED) {
                    cacheKey = operationCache.getCacheKey(
                        opName, args.input, recipeArgs, currentTenant());
                    cached = operationCache.get(cacheKey);
                    if (cached) {
                        logCache("hit", { operation: opName, requestId });
                        // Rendered through `toContentBlocks`, exactly as a cache MISS is. The
                        // cache stores `result.value`, and returning that as a text block meant
                        // the first call to `cyberchef_generate_qr_code` produced an `image`
                        // block and every subsequent call produced text -- so the multi-modal fix
                        // silently stopped applying the moment a result was cached.
                        const content = toContentBlocks({ value: cached }, opConfig.outputType);
                        const outputSize = contentSize(content);

                        // Track quota.
                        //
                        // NO release here. The `finally` below already releases on every exit
                        // from this block, including this one, so releasing again returns a slot
                        // that was never held twice.
                        //
                        // This was latent before the quota became per-tenant: the old global
                        // counter clamped at zero (`Math.max(0, ...)`), so a double release
                        // under-counted and could not go negative. A per-tenant count has no such
                        // floor -- the second release decrements, and at one in-flight DELETES,
                        // the entry belonging to whatever else that tenant is running. Measured:
                        //
                        //   acquire A, acquire B      -> in flight 2
                        //   B releases twice          -> entry GONE, while A is still running
                        //   A releases, then acquire  -> 10 further slots granted against a
                        //                                limit of 10, so 11 concurrent
                        quotaTracker.trackData(inputSize, outputSize);

                        // Record telemetry
                        const duration = Date.now() - startTime;
                        telemetryCollector.record({
                            tool: toolDimension(name),
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

                        return { content };
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
                    tool: toolDimension(name),
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
                    tool: toolDimension(name),
                    duration,
                    inputSize,
                    outputSize: 0,
                    success: false,
                    cached: false
                });
                throw opError;
            } finally {
                // Always release quota
                quotaTracker.release(quotaTenant);
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
        { capabilities: SERVER_CAPABILITIES, cacheHints: CACHE_HINTS }
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
    instance.setRequestHandler("tools/list", handleListTools);
    // The instance is bound in as the notification FALLBACK. `extra.sendNotification` remains the
    // primary path -- it is the SDK's documented per-request routing and is correct by
    // construction -- but if a future SDK reshapes `extra`, the fallback must not quietly become
    // "the module singleton", which for an HTTP session is precisely the bug this PR fixes,
    // returning silently. Bound this way it degrades to *this session's* server instead.
    instance.setRequestHandler("tools/call", (req, extra) => handleCallTool(req, extra, instance));

    // Prompts: the entry points for someone who does not yet know which of 504 operations
    // they need. See lib/prompts.mjs.
    instance.setRequestHandler("prompts/list", () => listPrompts());
    instance.setRequestHandler("prompts/get", (req) =>
        getPrompt(req.params.name, req.params.arguments || {}));

    // Resources: saved recipes, browsable without spending a tool call. See lib/resources.mjs.
    instance.setRequestHandler("resources/list", () => listResources(recipeManager));
    instance.setRequestHandler("resources/templates/list", () => listResourceTemplates());
    instance.setRequestHandler("resources/read", (req) =>
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
    const { transport, closeAll, drain } = await createTransport({
        createServer: createMcpServer,
        // The live collectors, for the Prometheus endpoint. Passed by reference so /metrics
        // reports the instances this process is actually using -- a metrics endpoint that keeps
        // its own counters is a second source of truth that drifts from the first one silently.
        metricsSources: { quotaTracker, rateLimiter, operationCache, telemetryCollector }
    });
    if (transport) {
        await server.connect(transport);
    }

    // NO warm-up here, and that is a measured decision rather than an omission.
    //
    // Pre-importing the Node API in the background looked obviously right -- it is the v2.6.0
    // plan's "warm pool" idea, in-process. It made cold start WORSE, because the work is the same
    // either way and doing it eagerly puts it in front of the request already queued behind it:
    //
    //     lazy, no warm-up      186 ms   <- launch to first tools/list response
    //     lazy + background warm  1300 ms
    //     eager (before v2.6.0)   1300 ms
    //
    // The import blocks the event loop for ~1.1 s whenever it runs, so "in the background" is not
    // a thing module loading can be. Left lazy: the operations load when something actually needs
    // them, and the caller that needs them is the one waiting.

    // Shut down cleanly on a signal. Without this, SIGTERM (which is what `docker stop` sends)
    // killed the process with sessions still open and the listener still bound: clients saw a
    // dropped connection rather than a closed session, and the container took the full stop
    // timeout to exit because keep-alive sockets held the loop open.
    //
    // Registered only when there is something to close, so stdio -- where the process ending IS
    // the teardown -- keeps its current behaviour and its default signal handling.
    /* v8 ignore start -- signal wiring: the handlers end in process.exit(), so exercising them
       in-process would kill the test runner. Covering them would mean mocking process.exit and
       process.once, which asserts that the mocks were called rather than that the server shuts
       down -- a number, not a guarantee. What is testable IS tested: transports.mjs's closeAll,
       which is the part that actually closes sessions and severs sockets, has its own tests. */
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
            // Not "HTTP sessions": the socket transport has a `closeAll` too, and naming the wrong
            // transport in a shutdown line is how an operator ends up debugging the wrong thing.
            // Drain when the transport offers one (HTTP), close immediately otherwise. The
            // difference matters only behind a load balancer: draining fails readiness first and
            // keeps serving briefly, so traffic routed during the endpoint-removal window is
            // answered rather than dropped. stdio and the socket transport have no such window.
            const stop = typeof drain === "function" ? drain : closeAll;
            logger.info(`${signal} received: ${stop === drain ? "draining" : "closing"} connections and listener`);
            stop()
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
    /* v8 ignore stop */

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
    // Which settings came from a file, and which the environment overrode. Reported because the
    // defect this replaced was a configuration file being applied to nothing with no way to tell:
    // "it loaded" has to be visible, and so does "your file said X and the environment said Y".
    if (configFileResult.path) {
        logger.info(`Config file: ${configFileResult.path} ` +
            `(${configFileResult.applied.length} setting${configFileResult.applied.length === 1 ? "" : "s"} applied` +
            `${configFileResult.deferredToEnv.length ?
                `, ${configFileResult.deferredToEnv.length} overridden by environment: ${configFileResult.deferredToEnv.join(", ")}` :
                ""})`);
    }
    const allOps = Object.keys(OperationConfig);
    logger.info(describeSurface(allOps.filter(isExposed).length, allOps.length));
    // A removed setting that is still set is worth a WARNING, not silence: the operator's
    // deployment just changed behaviour and nothing else would tell them why.
    /* v8 ignore start -- startup banner: it runs once, at boot, so in-process coverage cannot see
       it. Both directions ARE tested, from a child process, in `tests/mcp/entry-point.test.mjs`
       ("the startup banner reports a removed setting that is still set") -- which is the only way
       to observe boot-time behaviour once the worker has already imported the module. The message
       itself is unit-tested in `lib-internals.test.mjs`; this marker covers the WIRING, and the
       distinction matters: a correct warning nothing calls is the same as no warning. */
    const removedAlias = removedAliasWarning();
    if (removedAlias) logger.warn(removedAlias);
    /* v8 ignore stop */
    logger.info("=====================================");
}

/**
 * Was this module executed, or merely imported?
 *
 * WHY THIS GUARD EXISTS. `runServer()` used to be called unconditionally at module scope, so
 * IMPORTING this file started a real stdio server -- in all 23 test files that import it -- and
 * armed the `process.exit(1)` below inside each of them. During v3.9.0 that took down `mcp-test`
 * on both Node versions: four test files repoint `CYBERCHEF_RECIPE_STORAGE` at a temp directory
 * and delete it in `afterAll`, a save landed after the delete, and the resulting ENOENT reached
 * this catch and killed the vitest worker mid-file. That release shipped with those four
 * directories deliberately leaked as a workaround. See F-13 in its findings log.
 *
 * REALPATH, not a string compare, and the reason is `package.json`'s `bin`. npm installs
 * `cyberchef-mcp` as a SYMLINK into `node_modules/.bin/`, so for every `npx cyberchef-mcp` user
 * `process.argv[1]` is the link while `import.meta.filename` is the target. Comparing them
 * directly would report "not main" and start nothing -- a container that exits instantly with no
 * error, which is a worse failure than the one being fixed. `tests/mcp/entry-point.test.mjs`
 * covers the symlink case for exactly this reason.
 *
 * It also resolves the Docker `CMD ["src/node/mcp-server.mjs"]` form, where argv[1] is RELATIVE to
 * WORKDIR rather than absolute.
 *
 * @returns {boolean} True when this file is the process entry point.
 */
function isEntryPoint() {
    const entry = process.argv[1];
    if (!entry) return false;
    try {
        return realpathSync(resolve(entry)) === realpathSync(import.meta.filename);
    } catch {
        // A missing or unreadable argv[1] means this cannot be the entry point. Failing closed here
        // is safe: the cost is not auto-starting, and every real entry path resolves.
        return false;
    }
}

/* v8 ignore start -- the process entry point. `tests/mcp/entry-point.test.mjs` exercises both
   branches of this (started via `node <file>`, via an npm-style bin symlink, and NOT started on a
   bare import) but it does so in CHILD PROCESSES, which is the only way to observe a module's
   import-time behaviour once this worker has already imported it. v8 coverage instruments the
   vitest worker only, so those child runs are invisible to it.

   Worth stating plainly: before the guard existed, `runServer()` ran on EVERY test import as a side
   effect of the defect, and all of this counted as covered. About 0.6% of this project's line
   coverage was the bug executing itself. Removing the defect removed the inflation. */
if (isEntryPoint()) {
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
}
/* v8 ignore stop */

// Export for testing
export {
    isEntryPoint,
    LRUCache,
    MemoryMonitor,
    TelemetryCollector,
    RateLimiter,
    ResourceQuotaTracker,
    BatchProcessor,
    sanitizeToolName,
    // Exported for the cardinality tests: the bound has to be asserted against the REAL catalogue,
    // and a test that rebuilt its own copy would be asserting against a fixture instead.
    toolDimension,
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
    createMcpServer,
    // The stdio singleton, exported so a test can read the capabilities it ACTUALLY declares.
    // Comparing two factory instances would pass through the exact drift worth catching: the two
    // construction sites disagreeing.
    server
};
