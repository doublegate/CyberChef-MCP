/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Progressive disclosure: a small index, with detail fetched on demand.
 *
 * THE PROBLEM
 * -----------
 * `tools/list` is sent to the model on every request. Measured on this server:
 *
 *     all       524 tools   345 KB   ~86,000 tokens
 *     curated    99 tools    66 KB   ~16,600 tokens
 *
 * Both pay up front for schemas the session may never use. `curated` is cheaper only because it
 * guesses which 79 operations matter, and it is wrong for anyone whose work is the other 425.
 *
 * THE SHAPE OF THE FIX
 * --------------------
 * Make `tools/list` an INDEX rather than a catalogue. The model is handed a handful of navigation
 * tools plus the executor, and walks down to detail only where it needs it:
 *
 *     tools/list                  ~15 tools, a few KB     <- always loaded
 *       cyberchef_categories       17 categories + counts  <- one call, ~1 KB
 *       cyberchef_list_operations  names + one-liners for one category
 *       cyberchef_describe         the FULL schema for the 1-5 operations actually chosen
 *       cyberchef_search           keyword search across all 504
 *       cyberchef_bake             runs any of the 504, by name
 *
 * The parent index is `tools/list`; the child listings are ordinary tool calls returning data.
 * That works on every MCP client, needs no `listChanged` support, and keeps the schema for an
 * operation off the wire until something asks for it.
 *
 * WHY THIS BEATS BOTH PRESETS
 * ---------------------------
 * Cheaper than `curated` -- the index is a fraction of 99 pre-loaded schemas -- while reaching
 * everything `all` reaches. The cost moves from "every request, for every operation" to "once, for
 * the operations this task uses". A session that decodes one base64 string pays for the index and
 * one schema instead of 504.
 *
 * The trade is honest and worth stating: reaching an operation costs an extra round trip the first
 * time. For a session doing real work that is one call against tens of thousands of saved tokens;
 * for a client that wants everything in one shot, `CYBERCHEF_TOOL_SURFACE=all` is still there.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import Categories from "../../core/config/Categories.json" with {type: "json"};
import OperationConfig from "../../core/config/OperationConfig.json" with {type: "json"};

/**
 * Categories that carry no operations for an MCP caller.
 *
 * "Favourites" is a browser-UI notion -- it is empty in the shipped config and means nothing
 * without a user's local storage. Listing it would invite a call that returns nothing.
 */
const HIDDEN_CATEGORIES = new Set(["Favourites"]);

/**
 * Strip CyberChef's browser markup and shorten, for listings.
 *
 * @param {string} text - Raw description.
 * @param {number} max - Maximum length.
 * @returns {string} Plain text.
 */
function summarise(text, max) {
    if (typeof text !== "string" || !text.length) return "";
    const plain = text
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
    if (plain.length <= max) return plain;
    const cut = plain.slice(0, max);
    const stop = cut.lastIndexOf(". ");
    return stop > max / 3 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}...`;
}

/**
 * The category index: every category, its operation count, and a sample of what is in it.
 *
 * The samples matter. A bare list of names and counts makes the model guess what "Data format"
 * covers; three example operations make the choice obvious, and they cost a few dozen bytes.
 *
 * @returns {Object} The index.
 */
export function categoryIndex() {
    const categories = Categories
        .filter(c => !HIDDEN_CATEGORIES.has(c.name) && c.ops.length > 0)
        .map(c => ({
            category: c.name,
            operations: c.ops.length,
            examples: c.ops.slice(0, 3)
        }));

    return {
        categories,
        totalOperations: Object.keys(OperationConfig).length,
        usage: "Call cyberchef_list_operations with a category to see its operations, " +
            "cyberchef_describe_operation for full argument schemas, or cyberchef_search to " +
            "search by keyword. Any operation can then be run with cyberchef_bake."
    };
}

/**
 * The operations in one category, with one-line summaries.
 *
 * @param {string} category - Category name; matched case-insensitively.
 * @returns {Object} The listing.
 * @throws {Error} If the category is unknown.
 */
export function listOperations(category) {
    const wanted = String(category ?? "").trim().toLowerCase();
    const found = Categories.find(c => c.name.toLowerCase() === wanted);

    if (!found) {
        const names = Categories
            .filter(c => !HIDDEN_CATEGORIES.has(c.name) && c.ops.length > 0)
            .map(c => c.name);
        const err = new Error(
            `Unknown category "${category}". Available: ${names.join(", ")}`
        );
        err.knownCategories = names;
        throw err;
    }

    return {
        category: found.name,
        operations: found.ops
            // A category may name an operation excluded from this build; listing one that cannot
            // be run would be worse than omitting it.
            .filter(op => Object.prototype.hasOwnProperty.call(OperationConfig, op))
            .map(op => ({
                operation: op,
                summary: summarise(OperationConfig[op].description, 120),
                args: (OperationConfig[op].args || []).length
            })),
        next: "Use cyberchef_describe_operation for argument schemas, then cyberchef_bake to run."
    };
}

/**
 * Full detail for one or more operations: description, arguments, defaults.
 *
 * This is the leaf of the hierarchy and the only place the full argument schema is paid for. It
 * accepts several names at once so a model that has chosen three operations spends one round trip
 * rather than three.
 *
 * @param {string|string[]} operations - Operation name(s).
 * @param {Function} argNameFor - Maps a CyberChef argument name to its tool-schema property name.
 * @returns {Object} The detail.
 */
export function describeOperations(operations, argNameFor) {
    const names = Array.isArray(operations) ? operations : [operations];

    const described = names.map(raw => {
        const name = String(raw ?? "").trim();
        const canonical = Object.prototype.hasOwnProperty.call(OperationConfig, name) ?
            name :
            Object.keys(OperationConfig).find(k => k.toLowerCase() === name.toLowerCase());

        if (!canonical) {
            return {
                operation: name,
                error: "No such operation. Use cyberchef_search to find the exact name."
            };
        }

        const op = OperationConfig[canonical];
        return {
            operation: canonical,
            description: summarise(op.description, 600),
            inputType: op.inputType,
            outputType: op.outputType,
            flowControl: Boolean(op.flowControl),
            args: (op.args || []).map(a => {
                const arg = {
                    name: argNameFor(a.name),
                    type: a.type,
                    default: a.value
                };
                // Only the fields that tell a caller something. `toggleValues` is the set of
                // encodings a key may be written in; `value` on an option arg is the choice list.
                if (Array.isArray(a.toggleValues) && a.toggleValues.length) {
                    arg.options = a.toggleValues;
                    arg.shape = "string, or {string, option}";
                    arg.default = { option: a.toggleValues[0], string: a.value ?? "" };
                } else if (Array.isArray(a.value)) {
                    arg.options = a.value.map(v => (typeof v === "string" ? v : v.name));
                    arg.default = arg.options[a.defaultIndex ?? 0];
                }
                return arg;
            }),
            run: `cyberchef_bake with recipe: [{ "op": ${JSON.stringify(canonical)}, "args": { ... } }]`
        };
    });

    return { operations: described };
}
