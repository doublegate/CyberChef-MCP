/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Tool-name sanitisation, argument schema mapping, and input validation.
 *
 * Extracted verbatim from mcp-server.mjs during the v2.0.0 decomposition. Behaviour is
 * unchanged; the only edits are the import and export lines needed to stand alone.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { MAX_INPUT_SIZE } from "./config.mjs";
import { createInputError } from "../errors.mjs";
import { assertSafeRegexArg } from "./safe-regex.mjs";

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
            case "argSelector":
                // Added for upstream v11.4.0, where 19 operations use it -- including AES Encrypt
                // and AES Decrypt, so falling through to the `default: z.string()` branch would
                // have offered a free-text field where only a fixed set of modes is valid, and
                // pushed the failure to `validateIngredients` at execution time.
                //
                // Shape is `[{name, on?: number[], off?: number[]}]`. The `on`/`off` arrays name
                // which OTHER argument indices the web UI shows or hides for each choice; they
                // carry no meaning over MCP. The value the operation receives is just the name,
                // so this behaves exactly like `option` and shares its handling below.
                // falls through
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
    if ((argDef.type === "option" || argDef.type === "editableOption" ||
         argDef.type === "argSelector") && Array.isArray(argDef.value)) {
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
        assertSafeRegexArg(argDef, userValue);
        return userValue;
    }

    // ReDoS screening. This is the single point every user-supplied argument passes through on
    // its way into a recipe -- single-operation tools, `cyberchef_bake`, and batch execution all
    // funnel here -- so one hook covers every path. Screening BEFORE the value is handed to an
    // operation is the whole point: once a catastrophic pattern starts executing, it blocks the
    // event loop and no timeout in this process can stop it.
    assertSafeRegexArg(argDef, userValue);
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

export { sanitizeToolName, mapArgsToZod, resolveArgValue, validateInputSize };
