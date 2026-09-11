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
 *     all       545 tools   426,706 bytes   416 KB
 *     curated   120 tools   109,548 bytes   107 KB
 *     index      23 tools    15,620 bytes    15 KB
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
 *     tools/list                      23 tools, 15 KB   <- always loaded
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
 * time. Measured, that trade is the index plus one operation schema -- 17,398 bytes against
 * 426,706, or **24.5x cheaper** than `all`. (This line read "42,415 bytes ... 9.5x" until v3.8.0,
 * which is a figure SMALLER than the index alone and therefore impossible on its face -- the byte
 * column above was re-measured and this sentence was not. It was caught in review, not by a gate:
 * `check:versions` covers operation counts and does not cover tool-surface counts.) That
 * multiplier was 18.2x in v3.2.0, fell to 9.1x by v3.11.0, and is now 24.5x -- higher than it has
 * ever been. The round trip is worth recording rather than quietly restating, because the fall and
 * the recovery have the same cause. Twelve registry tools were added in v3.3.0, and a registry
 * tool then had no navigation path: `describe_operation` refused it and pointed at `tools/list`,
 * so the listing was its ONLY schema path and an unlisted tool could not be called at all. They
 * were therefore on every surface, and by v3.11.0 nineteen of them were 30,683 of the index's
 * 44,968 bytes -- 68% of the surface whose whole purpose is being small.
 *
 * v4.1.0 removed the dependency rather than the tools. `describe_operation` now serves their
 * schemas, `categories` lists them, and `cyberchef_analyse` dispatches to them by name, so they
 * are reachable without being listed. The index dropped to 23 tools and 15,620 bytes, and the
 * growth curve is flat: a twentieth or a hundredth registry tool leaves it unchanged.
 *
 * The tool COUNT matters as much as the bytes, and is the half this design did not originally
 * argue. Anthropic documents that tool-selection accuracy "degrades once you exceed 30-50
 * available tools"; at 41 the index was inside that band, so the surface was not merely expensive
 * but measurably worse at being chosen from. At 23 it is below it. For a client that wants
 * everything in one shot, `CYBERCHEF_TOOL_SURFACE=all` is still there and still lists every
 * registry tool outright.
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
 * @param {Array<Object>} [analysisTools] - Registry tools, as `{name, exposedName, title}`. They
 *   are NOT operations and are listed separately for that reason; before v4.1.0 they appeared in
 *   no category at all, so a caller walking the hierarchy down could not reach them.
 * @returns {Object} The index.
 */
export function categoryIndex(analysisTools = []) {
    const categories = Categories
        .filter(c => !HIDDEN_CATEGORIES.has(c.name) && c.ops.length > 0)
        .map(c => ({
            category: c.name,
            operations: c.ops.length,
            examples: c.ops.slice(0, 3)
        }));

    const index = {
        categories,
        totalOperations: Object.keys(OperationConfig).length,
        usage: "Call cyberchef_list_operations with a category to see its operations, " +
            "cyberchef_describe_operation for full argument schemas, or cyberchef_search to " +
            "search by keyword. Any operation can then be run with cyberchef_bake."
    };

    // A SEPARATE key, deliberately not a sixteenth entry in `categories`.
    //
    // Every member of `categories` is a CyberChef operation category whose contents `bake` can
    // run and `list_operations` can enumerate. An analysis tool is neither: it has no
    // OperationConfig entry, cannot appear in a recipe, and `list_operations` would throw on its
    // name. Folding it in would have made the two navigation tools below it lie about what they
    // accept, which is the shape of bug this whole index exists to avoid.
    if (analysisTools.length) {
        index.analysisTools = {
            count: analysisTools.length,
            description: "Analyses an operation cannot express -- a loop with a decision inside " +
                "it, a statistic computed across several inputs, or a primitive CyberChef lacks.",
            tools: analysisTools.map(t => ({ tool: t.name, title: t.title })),
            usage: "These are NOT operations and cannot be used in a cyberchef_bake recipe. Get " +
                "a schema with cyberchef_describe_operation, then run it with cyberchef_analyse."
        };
    }

    return index;
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
            // Was "Analysis tools are called directly; their schemas are already in tools/list."
            // Both halves became false in v4.1.0: they are not in `tools/list` on the default
            // surface, and a direct call is not available there either. Advice that names the
            // wrong route is worse than no advice, because the caller follows it.
            "Analysis tools are not operations: run one with cyberchef_analyse, or call it " +
            "directly on CYBERCHEF_TOOL_SURFACE=curated|all where it is listed." :
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
 * @param {Function} [registryLookup] - `(exposedName) => descriptor|undefined` for the registry.
 *   A LOOKUP rather than a name set, because this now answers with the tool's schema instead
 *   of redirecting to `tools/list` -- which is what allows registry tools to be unlisted.
 * @returns {Object} The detail.
 */
export function describeOperations(operations, argNameFor, registryLookup) {
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
            const registryTool = registryLookup?.(exposed);
            if (registryTool) {
                // SERVES the schema rather than redirecting to `tools/list`.
                //
                // Until v4.1.0 this returned an error whose hint was "its full schema is already
                // in `tools/list`; call it directly". That hint was true, and it was the reason
                // every registry tool HAD to be listed: the only schema path went through the
                // listing, so a tool absent from the listing had no schema path at all. Nineteen
                // tools were therefore 68% of the default surface to keep one redirect honest.
                //
                // Answering here inverts that. The schema is available whether or not the tool is
                // listed, which is what lets the index drop them -- and it is strictly more useful
                // even for a caller on `curated` or `all`, because it returns one tool's schema
                // instead of requiring a re-read of the whole list.
                return {
                    operation: exposed,
                    kind: "analysis_tool",
                    description: registryTool.description,
                    inputSchema: registryTool.inputSchema,
                    annotations: registryTool.annotations,
                    // Both routes are given because both work and they are not interchangeable: a
                    // caller on `curated`/`all` can invoke the tool by name, one on `index` cannot
                    // and must go through the dispatcher. Naming only the direct call would be
                    // advice that fails on the default surface.
                    usage: `Run it with cyberchef_analyse({tool: "${registryTool.name}", ` +
                        "arguments: {...}}), or call `" + exposed + "` directly when it is listed " +
                        "(CYBERCHEF_TOOL_SURFACE=curated|all).",
                    note: "An analysis tool, not a CyberChef operation: it has no OperationConfig " +
                        "entry and cannot appear inside a `cyberchef_bake` recipe."
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
