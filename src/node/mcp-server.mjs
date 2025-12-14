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

const server = new Server(
    {
        name: "cyberchef-mcp",
        version: "1.3.0",
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
            // Ignore schema errors
        }
    });

    return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === "cyberchef_bake") {
            const result = await bake(args.input, args.recipe);
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
                const opConfig = OperationConfig[opName];
                const recipeArgs = [];

                if (opConfig.args) {
                    opConfig.args.forEach(argDef => {
                        const argName = argDef.name.toLowerCase().replace(/ /g, "_");
                        const userVal = args[argName];
                        recipeArgs.push(resolveArgValue(argDef, userVal));
                    });
                }

                const recipe = [{
                    op: opName,
                    args: recipeArgs
                }];

                const result = await bake(args.input, recipe);
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
    console.error("CyberChef MCP Server running on stdio");
}

runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
