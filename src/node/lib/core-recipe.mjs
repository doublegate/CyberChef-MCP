/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Running recipes on the CORE engine, so flow-control operations work.
 *
 * WHY THIS EXISTS
 * ---------------
 * `cyberchef_bake` used to call the Node API's `bake()`, which builds a `NodeRecipe`. That class
 * refuses flow control outright:
 *
 *     if (ing.flowControl) {
 *         throw new TypeError(`flowControl operations like ${ing.opName} are not currently
 *                              allowed in recipes for chef.bake in the Node API`);
 *     }
 *                                                     -- src/node/NodeRecipe.mjs:47
 *
 * That made **ten advertised tools permanently unusable** -- `cyberchef_magic`, `_fork`, `_merge`,
 * `_jump`, `_conditional_jump`, `_label`, `_register`, `_subsection`, `_comment`, `_return`. Each
 * appeared in `tools/list` with a full schema and failed on every call, which is worse than not
 * offering them: a model reaches for `Magic` first on an unknown blob, precisely when it is least
 * able to tell a broken tool from a hard problem.
 *
 * The restriction is not a property of the operations. `src/core/Recipe.mjs` executes flow control
 * properly (`Recipe.mjs:217`), packaging the state those operations need -- `opList`, `numJumps`,
 * `numRegisters`, `forkOffset` -- which `NodeRecipe` never assembles. So the engine the web UI
 * uses supports all ten; only the Node wrapper declines them. This module routes recipes to that
 * engine instead, and every one of the ten then behaves exactly as it does in the web UI
 * (verified: `Fork` splits and merges, `Return` halts the recipe, `Jump` skips operations,
 * `Register` substitutes `$R0`, `Subsection` applies its branch to matched regions only).
 *
 * THE ONE THING THAT HAS TO BE TRANSLATED
 * --------------------------------------
 * The core `Recipe` takes **positional** argument arrays, the format the web UI's recipe JSON
 * uses. This server's callers pass **named** arguments -- that was DEP005, and named arguments are
 * the reason a model can use these tools at all. So the conversion below maps names to positions
 * using `OperationConfig`, which is also where defaults, `option`/`argSelector` name-to-value
 * resolution, and the ReDoS screen already live in `resolveArgValue`. Positional arrays are still
 * accepted unchanged, so a recipe copied straight out of the web UI works.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import Chef from "../../core/Chef.mjs";
import Dish from "../../core/Dish.mjs";
import { assertOfflineAllowed } from "./offline.mjs";
import { mediaFromHtml } from "./content-blocks.mjs";
import Utils from "../../core/Utils.mjs";
import OperationConfig from "../../core/config/OperationConfig.json" with {type: "json"};
import { resolveArgValue, toolArgName, assertKnownArgs } from "./tool-schema.mjs";
import { createInputError } from "../errors.mjs";
import File from "../File.mjs";

// `src/core` reaches for a BARE GLOBAL `File`, and nothing in this process was putting one there.
//
// Five operations construct one -- `Unzip`, `Untar`, `Tar`, `Zip`, `Split Colour Channels` -- and
// not one of them imports it. In the browser it is the platform's. On Node the shim in
// `src/node/File.mjs` is meant to stand in for it, and the ONLY assignment is at
// `src/node/index.mjs:516` -- the generated bridge, which this server deliberately does not import
// eagerly (see the note at the top of `mcp-server.mjs`: it would pull all 504 operation
// implementations at startup).
//
// So the bridge's side effect went with it, and `new File(...)` in an operation resolved to
// Node's OWN global `File` -- a `Blob` subclass with no `.data`, whose bytes are reachable only
// through an async `arrayBuffer()`. The failure is quiet and specific: `Unzip` parsed the central
// directory correctly and returned members with the right NAMES and zero bytes each.
//
// It reproduces only through a real client, which is the whole reason this took as long as it did
// to find. Any in-process probe that imports the bridge first -- as every earlier one did -- puts
// the shim back and the bug disappears.
//
// Installed here rather than in `mcp-server.mjs` because this module is the one every bake path
// goes through, and the worker path already gets it from the bridge it does import.
if (globalThis.File !== File) globalThis.File = File;

/**
 * Does this string look like browser markup rather than a result?
 *
 * Deliberately narrow: an opening tag whose name starts with a letter. A result that merely
 * CONTAINS an angle bracket -- a diff, a shell snippet, XML the caller asked for verbatim -- must
 * not be mistaken for a presentation and swapped out from under them.
 */
const HTML_TAG = /<[a-z][a-z0-9]*(\s[^>]*)?>/i;

/**
 * Operation names, indexed case-insensitively so a caller need not match capitalisation exactly.
 *
 * Built once. `OperationConfig` has 504 entries and a recipe may name several, so rebuilding this
 * per call would make a long recipe quadratic for no reason.
 *
 * @type {Map<string, string>}
 */
const OP_NAMES_LOWER = new Map(
    Object.keys(OperationConfig).map(name => [name.toLowerCase(), name])
);

/**
 * Resolve a caller-supplied operation name to its canonical `OperationConfig` key.
 *
 * @param {string} name - The operation name as given.
 * @returns {string} The canonical name.
 * @throws {CyberChefMCPError} If no such operation exists.
 */
function canonicalOpName(name) {
    if (typeof name !== "string" || !name.length) {
        throw createInputError("Each recipe step needs an operation name", { received: typeof name });
    }
    if (Object.prototype.hasOwnProperty.call(OperationConfig, name)) return name;

    const found = OP_NAMES_LOWER.get(name.toLowerCase());
    if (found) return found;

    throw createInputError(`Unknown operation: ${name}`, {
        operation: name,
        hint: "Use cyberchef_search to find the exact operation name"
    });
}

/**
 * Convert one recipe step's arguments into the positional array the core engine expects.
 *
 * @param {string} opName - Canonical operation name.
 * @param {Object|Array|undefined} args - Named argument object, positional array, or nothing.
 * @returns {Array} Positional arguments.
 */
function toPositionalArgs(opName, args) {
    const argDefs = OperationConfig[opName].args || [];

    // Already positional -- a recipe pasted from the web UI. Passed through untouched rather than
    // reinterpreted: the caller has already said what goes where.
    if (Array.isArray(args)) return args;

    const named = (args && typeof args === "object") ? args : {};

    // Fail on an argument name the operation does not have, rather than dropping it and using the
    // default -- which turned a misspelling into a plausible wrong answer. See assertKnownArgs.
    assertKnownArgs(opName, argDefs, named);

    // Callers address arguments by the name in the tool's inputSchema, which is the sanitised form
    // ("Split delimiter" -> "split_delimiter"). Accept the raw config name too, since a recipe
    // written against the CyberChef UI labels should not silently lose its arguments.
    return argDefs.map(argDef => {
        const key = toolArgName(argDef.name);
        const given = named[key] !== undefined ? named[key] :
            (named[argDef.name] !== undefined ? named[argDef.name] : undefined);
        return resolveArgValue(argDef, given);
    });
}

/**
 * Normalise a recipe into the core engine's config format.
 *
 * @param {Array|Object|string} recipeConfig - The caller's recipe.
 * @returns {Array<{op: string, args: Array}>} A core-engine recipe.
 * @throws {CyberChefMCPError} If the recipe is not a recognised shape.
 */
export function toCoreRecipe(recipeConfig) {
    if (recipeConfig === undefined || recipeConfig === null) return [];

    // A bare operation name, or a single step object, is a recipe of one.
    const steps = Array.isArray(recipeConfig) ? recipeConfig : [recipeConfig];

    return steps.map(step => {
        if (typeof step === "string") {
            return { op: canonicalOpName(step), args: toPositionalArgs(canonicalOpName(step), undefined) };
        }
        if (!step || typeof step !== "object") {
            throw createInputError("A recipe step must be an operation name or an {op, args} object", {
                received: typeof step
            });
        }
        const opName = canonicalOpName(step.op ?? step.operation ?? step.name);
        return { op: opName, args: toPositionalArgs(opName, step.args) };
    });
}

/**
 * Execute a recipe on the core engine.
 *
 * Returns the same shape the rest of this server already handles -- an object with `value` and a
 * `toString()` that presents it -- so `dishToText` and every caller work unchanged.
 *
 * @param {*} input - The input data.
 * @param {Array|Object|string} recipeConfig - The recipe, named or positional.
 * @returns {Promise<{value: *, toString: Function}>} The baked result.
 */
export async function bakeOnCore(input, recipeConfig) {
    const recipe = toCoreRecipe(recipeConfig);

    // Offline gate, on the NORMALISED recipe.
    //
    // Placed here rather than on the tool name, because the tool name does not tell you whether a
    // call leaves the process: `cyberchef_bake` is not a network tool, and
    // `bake({recipe: [{op: "HTTP request"}]})` is a network call. Normalising first also means the
    // check sees canonical operation names, so an alias or a raw label cannot slip past it.
    //
    // This covers cyberchef_bake, cyberchef_batch, the registry tools and the streaming path --
    // every caller of this function. The other two engine entries guard themselves; see
    // lib/offline.mjs for why there is no single choke point.
    assertOfflineAllowed(recipe);

    // `returnType: "string"` asks the engine for the presented form -- the same conversion the web
    // UI applies before rendering the output pane -- rather than the raw internal value.
    const baked = await new Chef().bake(input, recipe, { returnType: "string" });

    if (baked.error) {
        throw createInputError(baked.error.displayStr || String(baked.error), {
            recipe: recipe.map(s => s.op)
        });
    }

    // The output type of the LAST operation is what the caller receives, and the content-block
    // layer needs it to decide between an image, base64 and text.
    //
    // The html->text conversion used to happen HERE, unconditionally, and that is what silently
    // deleted every image this server could produce: `Generate QR Code` emits
    // `<img src="data:image/png;base64,...">`, `stripHtmlTags` removes the tag, and the caller got
    // "". Stripping now lives in `toContentBlocks`, which strips only when the markup is not an
    // image -- so `Magic` stays readable plain text and the picture survives.
    const outputType = recipe.length > 0 ?
        OperationConfig[recipe[recipe.length - 1].op]?.outputType :
        undefined;

    // Prefer the UNPRESENTED value when the presentation is browser markup.
    //
    // `returnType: "string"` above asks for the presented form, which is right for the operations
    // whose presentation carries a picture -- `Generate QR Code` emits `<img src="data:...">` and
    // the bytes exist nowhere else. It is wrong for every other html-presenting operation, because
    // the presenter targets a browser and the markup does not survive being reduced to text.
    //
    // Measured. 44 operations declare a `presentType` that differs from their `outputType`, and
    // for the non-media ones the presented form is both larger and worse:
    //
    //   JSON Beautify              689 B of markup  ->  53 B of correctly indented JSON
    //   Text Encoding Brute Force  9,842 B table    ->  7,650 B of valid JSON
    //   Frequency distribution     15,669 B + chart ->  5,865 B of valid JSON
    //
    // `JSON Beautify` is the one that makes this a CORRECTNESS fix rather than a formatting one.
    // Its presenter renders a key as bare text inside `<li>name<span class="json-colon">:</span>`,
    // so the quotes around every key exist only as markup structure. Stripping tags therefore
    // returned `{name: "alice",age: 30}` -- not valid JSON, with the indentation the operation
    // exists to add also gone. A "beautify" that emits unparseable output is a silently wrong
    // answer, which is the failure mode this project treats as the expensive one.
    //
    // Chef hands back `dish` -- "a raw version of the dish, unpresented" -- from the same bake, so
    // this costs no second execution.
    //
    // Resolved HERE rather than in `toContentBlocks` on purpose: the cache stores `result.value`,
    // so a decision made downstream of the cache would apply to a miss and not to a hit. That is
    // exactly how `cyberchef_generate_qr_code` came to return an image on the first call and text
    // on every call after it.
    let value = baked.result;

    // `List<File>` is rendered HERE, not by the dish and not by the presenter.
    //
    // Two of the twelve Forensics operations output `List<File>` -- `Unzip` and `Extract Files` --
    // and BOTH were unusable through this server for the fork's whole life. They threw outright
    // until the `Utils.readFile` patch, and once that was fixed they returned the browser's
    // file-list markup: names, sizes and two button labels, with the file CONTENTS nowhere in it.
    //
    // The dish cannot supply them either, and that is deliberate upstream behaviour rather than a
    // second bug: `DishListFile.toArrayBuffer` leaves the value as an ARRAY of per-file arrays on
    // Node, and `tests/node/tests/NodeDish.mjs:225` asserts exactly that shape. Changing it makes
    // the STRING conversion work and breaks that test -- a behaviour change to shared,
    // upstream-owned code for what is really a rendering decision, and rendering is ours.
    //
    // So it is made here. A caller unzipping an archive wants what is IN it and wants to know
    // which member each part came from; neither the concatenated bytes nor the markup gives both.
    //
    // Keyed on the DISH's type, not on `outputType`. `OperationConfig` records the PRESENTED type,
    // so it says `html` for all three `List<File>` operations and would never match here -- which
    // it did not, on the first attempt.
    if (baked.dish?.type === Dish.LIST_FILE && Array.isArray(baked.dish.value)) {
        const rendered = baked.dish.value.map(file => {
            const bytes = Buffer.from(file.data ?? []);
            // Base64 for a member that is not text, rather than mojibake. The same choice the
            // content-block layer makes for a binary result, applied per member.
            //
            // A plain loop rather than `bytes.every(...)`, and the WHOLE buffer rather than a
            // prefix. Measured on 16 MB of printable bytes -- the worst case, since a non-printable
            // byte exits immediately either way:
            //
            //     bytes.every(callback)   112 ms
            //     this loop                19 ms
            //     toString("utf8")          9 ms   (the work that follows regardless)
            //
            // `every` was costing twelve times the encode it precedes, entirely in per-byte
            // callback dispatch. Sampling only a prefix would be faster still and is wrong: a
            // member that is text for its first few kilobytes and binary afterwards would be
            // decoded as UTF-8, which is the mojibake this branch exists to prevent.
            let printable = bytes.length > 0;
            for (let i = 0; i < bytes.length; i++) {
                const b = bytes[i];
                if (b !== 9 && b !== 10 && b !== 13 && (b < 32 || b >= 127)) {
                    printable = false;
                    break;
                }
            }
            const header = `=== ${file.name} (${bytes.length} bytes${printable ? "" : ", base64"}) ===`;
            return `${header}\n${printable ? bytes.toString("utf8") : bytes.toString("base64")}`;
        }).join("\n");
        return {
            value: rendered,
            outputType,
            /** @returns {string} The rendered listing. */
            toString() {
                return rendered;
            }
        };
    }

    if (typeof value === "string" && HTML_TAG.test(value) && !mediaFromHtml(value)) {
        try {
            const raw = await baked.dish.get(Dish.STRING);
            // Only when there is something there. An operation whose raw dish is empty but whose
            // presentation is not (a pure-visualisation op) must keep the presentation, or the
            // caller gets nothing at all.
            if (typeof raw === "string" && raw.length > 0) value = raw;
        } catch (e) {
            // A dish that will not convert to a string keeps the presented form. Falling back is
            // always safe here: it is the behaviour every release before this one had.
        }
    }

    return {
        value,
        outputType,
        /**
         * @returns {string} The presented result, with browser markup reduced to text.
         */
        toString() {
            if (outputType === "html" && typeof value === "string") {
                // Upstream's own pair, and its own conclusion for non-browser consumers:
                // `DishHTML.toArrayBuffer()` runs exactly this before handing bytes on.
                return Utils.unescapeHtml(Utils.stripHtmlTags(value, true));
            }
            return typeof value === "string" ? value : JSON.stringify(value);
        }
    };
}
