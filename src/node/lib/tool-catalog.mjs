/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Progressive disclosure: a small index, with detail fetched on demand.
 *
 * THE PROBLEM
 * -----------
 * `tools/list` is sent to the model on every request. Measured on this server -- and these
 * numbers now come from `npm run measure:surfaces`, which drives a real client and counts the
 * exact bytes of the result, rather than from a comment:
 *
 *     all       543 tools   421,041 bytes   411 KB
 *     curated   118 tools   103,883 bytes   101 KB
 *     index      40 tools    40,637 bytes    39 KB
 *
 * Both presets pay up front for schemas the session may never use. `curated` is cheaper only
 * because it guesses which operations matter, and it is wrong for anyone whose work is the rest.
 *
 * Every figure in this header was wrong by v3.1.0 -- the index, the surface this whole design
 * rests on, was documented at ~10 KB and measured at 20 KB. The argument held by a wide margin
 * throughout, which is exactly why nobody noticed: a claim that stays directionally true is the
 * hardest kind to keep numerically true. Hence the script, and hence bytes rather than tokens --
 * no tokenizer has ever been in this repository, and every "~N tokens" figure it ever published
 * was bytes divided by four.
 *
 * THE SHAPE OF THE FIX
 * --------------------
 * Make `tools/list` an INDEX rather than a catalogue. The model is handed a handful of navigation
 * tools plus the executor, and walks down to detail only where it needs it:
 *
 *     tools/list                      ~24 tools, ~10 KB   <- always loaded
 *       cyberchef_categories          16 categories + counts + examples   (~2 KB)
 *       cyberchef_list_operations     names + one-liners for one category (~8 KB for 50)
 *       cyberchef_describe_operation  the FULL schema for the operations actually chosen
 *       cyberchef_search              keyword search across all 504
 *       cyberchef_bake                runs any of the 504, by name
 *       cyberchef_magic               kept in every surface: the entry point for unknown data
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
 * time. Measured, that trade is the index plus one operation schema -- 42,415 bytes against
 * 421,041, or **9.9x cheaper** than `all`. That multiplier fell from 18.2x in v3.2.0, and the
 * reason is worth recording rather than quietly restating: twelve registry tools were added in
 * v3.3.0 and a registry tool has no navigation path, so one that is not listed cannot be called at
 * all. They are all in the index, and the index is twice the size it was. For a client that wants
 * everything in one shot, `CYBERCHEF_TOOL_SURFACE=all` is still there.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import Categories from "../../core/config/Categories.json" with {type: "json"};
import OperationConfig from "../../core/config/OperationConfig.json" with {type: "json"};
import Utils from "../../core/Utils.mjs";

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
    // Upstream's pair, not a hand-rolled one -- see the note on `summariseDescription` in
    // mcp-server.mjs. Two copies of a regex-based HTML stripper is one copy too many, and CodeQL
    // flagged both for incomplete multi-character sanitisation and double-escaping.
    const plain = Utils.unescapeHtml(Utils.stripHtmlTags(text, true))
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
 * Search results in the same shape the rest of the index hierarchy uses.
 *
 * WHY THIS EXISTS
 * ---------------
 * `cyberchef_search` returned the raw `help()` output: the FULL `OperationConfig` entry for every
 * match -- module, HTML description, infoURL, input and output types, and every argument with its
 * defaults. Measured on this catalogue:
 *
 *     query "base64"   14 matches   27,060 bytes
 *     query "aes"      21 matches   35,642 bytes
 *
 * That is the whole point of the index surface paid twice. `cyberchef_list_operations` returns
 * names and one-line summaries for exactly this reason, and `cyberchef_describe_operation` is the
 * one place a full argument schema is paid for. Search sat outside that design and handed back
 * more than `describe_operation` would for the same operations.
 *
 * A discovery tool's job is to narrow. The caller reads names, picks one or two, and asks for the
 * detail it actually needs.
 *
 * @param {string} query - What was searched for.
 * @param {Array<Object>} results - Raw `help()` output.
 * @param {Array<{name: string, exposedName: string, title?: string, description?: string}>}
 *   [registryTools] - The registry tools, which `help()` cannot see because they are not in
 *   `OperationConfig`.
 * @returns {Object} `{query, matches, operations, analysis_tools?, next}`.
 */
export function summariseSearch(query, results, registryTools) {
    // `help()` returns **null**, not an empty array, when nothing matches -- and for an empty or
    // absent query too. The old code path serialised that straight through, so a caller searching
    // for a term with no hits received the four characters `null`. Passing it to `.length` here
    // would have turned that into a server error instead, which is worse; caught in review before
    // it shipped, and it existed because no test searched for something absent.
    //
    // A search that found nothing is a successful search. It answers in the same shape as one that
    // found something, so a caller parses one path rather than three.
    const found = Array.isArray(results) ? results : [];

    // Registry tools are searched too, and they have to be: `help()` reads `OperationConfig`, which
    // they are deliberately not in, so a caller searching "vigenere" was shown the two operations
    // that need a key and not the tool that finds one. The index surface's whole design rests on
    // search being how a caller finds things, and a search that structurally cannot return sixteen
    // of the tools on offer is a hole in it.
    const term = String(query ?? "").trim().toLowerCase();
    const registryHits = term ? (registryTools ?? []).filter(tool =>
        tool.name.toLowerCase().includes(term) ||
        tool.exposedName.toLowerCase().includes(term) ||
        (tool.title ?? "").toLowerCase().includes(term) ||
        (tool.description ?? "").toLowerCase().includes(term)) : [];

    return {
        query,
        matches: found.length,
        operations: found.map(op => ({
            operation: op.name,
            summary: summarise(op.description, 120),
            args: (op.args || []).length
        })),
        ...(registryHits.length ? {
            "analysis_tools": registryHits.map(tool => ({
                tool: tool.exposedName,
                summary: summarise(tool.description, 160),
                note: "Not an operation: call it directly rather than putting it in a recipe."
            }))
        } : {}),
        next: found.length || registryHits.length ?
            "Use cyberchef_describe_operation for argument schemas, then cyberchef_bake to run. " +
            "Analysis tools are called directly; their schemas are already in tools/list." :
            "No match. Try cyberchef_categories to browse, or a shorter or more general keyword."
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
 * @param {Set<string>} [registryNames] - Exposed names of the registry tools, so a caller who asks
 *   about one is told what it is rather than that it does not exist.
 * @returns {Object} The detail.
 */
export function describeOperations(operations, argNameFor, registryNames) {
    const names = Array.isArray(operations) ? operations : [operations];

    const described = names.map(raw => {
        const name = String(raw ?? "").trim();
        const canonical = Object.prototype.hasOwnProperty.call(OperationConfig, name) ?
            name :
            Object.keys(OperationConfig).find(k => k.toLowerCase() === name.toLowerCase());

        if (!canonical) {
            // A registry tool is not an operation, and answering "no such operation, use
            // cyberchef_search" for one is advice that points away from the fix twice over: search
            // reads OperationConfig and will not find it either, and the tool is already in
            // `tools/list` with its complete schema. A caller who saw the name there and asked
            // about it here deserves to be told where to look, not that it does not exist.
            const exposed = name.startsWith("cyberchef_") ? name : `cyberchef_${name}`;
            if (registryNames?.has(exposed)) {
                return {
                    operation: name,
                    error: `\`${exposed}\` is a registry tool, not an operation, so it has no ` +
                        "OperationConfig entry and cannot be used inside a recipe.",
                    hint: `Its full schema is already in \`tools/list\`; call \`${exposed}\` directly.`
                };
            }
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
