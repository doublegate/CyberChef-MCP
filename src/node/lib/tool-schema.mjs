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
 * Names the tool schema reserves for itself, which an operation argument may not take.
 *
 * Only `input` today: every generated tool takes the data to process under that name.
 */
const RESERVED_ARG_NAMES = new Set(["input"]);

/**
 * The property name a CyberChef argument is exposed under in a tool's inputSchema.
 *
 * THE ONE FUNCTION, used by the schema builder, the per-operation dispatch path, and the recipe
 * converter. They each had their own copy of this sanitisation, and the copies were ALREADY
 * subtly different -- `[^a-z0-9]+ -> _` in one, `/ / -> _` in another -- which is how a rule that
 * has to agree in three places goes wrong quietly.
 *
 * The collision handling is the part that matters. 31 operations declare an argument literally
 * named "Input" -- AES, DES, Blowfish, ChaCha, RC2, RC6, SM4, PRESENT, Ascon, Rabbit and the rest
 * of the symmetric ciphers -- meaning the input FORMAT (Raw or Hex). Sanitised naively it becomes
 * `input`, which the schema then overwrites with the data parameter. The operation consequently
 * received the message text where it expected "Raw" or "Hex" and answered
 *
 *     Input must be one of the following: Raw, Hex.
 *
 * on every call. AES Encrypt and AES Decrypt, among the most obvious reasons to run this server,
 * could not be invoked successfully at all. A colliding name is now suffixed rather than lost.
 *
 * @param {string} argName - The argument's name from OperationConfig.
 * @returns {string} The property name to use in the tool schema.
 */
function toolArgName(argName) {
    const sanitised = String(argName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return RESERVED_ARG_NAMES.has(sanitised) ? `${sanitised}_arg` : sanitised;
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
        const name = toolArgName(arg.name);
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
            case "toggleString":
                // A "toggleString" is a value PLUS the encoding it is written in -- a key given as
                // Hex, UTF8, Base64 and so on. 63 operations use one, including AES Encrypt/Decrypt,
                // and the operation receives `{option, string}`.
                //
                // It used to fall through to `default: z.string()`, so the schema advertised a bare
                // string and the operation then did `key.option` on it. Every one of those 63 tools
                // failed the same way -- `Cannot read properties of undefined (reading 'option')` --
                // whether an argument was supplied or not. Measured by calling all 524 tools.
                //
                // Both forms are accepted, because both are reasonable things for a caller to send:
                //   { key: "6f6d0bab" }                         -> option defaults to the first
                //   { key: { string: "hunter2", option: "UTF8" } }
                zodType = z.union([
                    z.string(),
                    z.object({
                        string: z.string(),
                        option: (Array.isArray(arg.toggleValues) && arg.toggleValues.length) ?
                            z.enum([arg.toggleValues[0], ...arg.toggleValues.slice(1)]).optional() :
                            z.string().optional()
                    })
                ]);
                if (Array.isArray(arg.toggleValues) && arg.toggleValues.length) {
                    // Kept: a caller cannot infer the default option from the schema alone, and
                    // getting it wrong decodes the key with the wrong scheme.
                    description = `string, or {string, option}; option one of ` +
                        `${arg.toggleValues.join("/")} (default ${arg.toggleValues[0]})`;
                }
                break;
            case "editableOption":
                // String, but we will try to match option names in execution
                zodType = z.string();
                if (Array.isArray(arg.value) && arg.value.length > 0) {
                    // editableOption accepts free text as well as the listed values, so the list
                    // is NOT expressible as an enum and this prose is the only place it appears.
                    const options = arg.value.map(v => (typeof v === "string" ? v : v.name)).join(", ");
                    description = `free text, or one of: ${options}`;
                }
                break;
            default:
                zodType = z.string();
        }

        // An argument description is emitted only when it ADDS something. It used to be seeded
        // with the raw type name -- "option", "toggleString", "number" -- which the JSON Schema
        // already states in `type`/`enum`, and then had the full option list appended, duplicating
        // `enum` verbatim. Across 524 tools that redundancy came to roughly 42 KB, paid on every
        // `tools/list` and carrying no information a client could not already read.
        const informative = description && description !== (arg.type || "");
        zodType = informative ? zodType.optional().describe(description) : zodType.optional();
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
    // toggleString is resolved first and separately, because BOTH its default and its supplied
    // form have to become `{option, string}` -- the shape the operation destructures. The generic
    // default handling below returns `argDef.value`, which for a toggleString is a bare string
    // (usually ""), and that is exactly what produced
    // `Cannot read properties of undefined (reading 'option')` across all 63 of these operations.
    if (argDef.type === "toggleString") {
        const options = Array.isArray(argDef.toggleValues) ? argDef.toggleValues : [];
        const defaultOption = options[0] ?? "UTF8";

        if (userValue === undefined || userValue === null) {
            return { option: defaultOption, string: typeof argDef.value === "string" ? argDef.value : "" };
        }
        if (typeof userValue === "string") {
            assertSafeRegexArg(argDef, userValue);
            return { option: defaultOption, string: userValue };
        }
        if (typeof userValue === "object") {
            const str = typeof userValue.string === "string" ? userValue.string : "";
            assertSafeRegexArg(argDef, str);
            // An unrecognised option is corrected to the default rather than passed through: the
            // operation would otherwise decode the key with a scheme it does not know, and a
            // wrongly-decoded key fails as "bad decrypt" a long way from the actual mistake.
            const option = (typeof userValue.option === "string" && options.includes(userValue.option)) ?
                userValue.option : defaultOption;
            return { option, string: str };
        }
        return { option: defaultOption, string: String(userValue) };
    }

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

export { sanitizeToolName, mapArgsToZod, resolveArgValue, validateInputSize, toolArgName };
