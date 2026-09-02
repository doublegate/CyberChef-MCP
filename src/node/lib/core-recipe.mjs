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
import { assertOfflineAllowed } from "./offline.mjs";
import Utils from "../../core/Utils.mjs";
import OperationConfig from "../../core/config/OperationConfig.json" with {type: "json"};
import { resolveArgValue, toolArgName, assertKnownArgs } from "./tool-schema.mjs";
import { createInputError } from "../errors.mjs";

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

    return {
        value: baked.result,
        outputType,
        /**
         * @returns {string} The presented result, with browser markup reduced to text.
         */
        toString() {
            if (outputType === "html" && typeof baked.result === "string") {
                // Upstream's own pair, and its own conclusion for non-browser consumers:
                // `DishHTML.toArrayBuffer()` runs exactly this before handing bytes on.
                return Utils.unescapeHtml(Utils.stripHtmlTags(baked.result, true));
            }
            return typeof baked.result === "string" ? baked.result : JSON.stringify(baked.result);
        }
    };
}
