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
import Utils from "../../core/Utils.mjs";
import OperationConfig from "../../core/config/OperationConfig.json" with {type: "json"};
import { resolveArgValue, toolArgName } from "./tool-schema.mjs";
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

    // `returnType: "string"` asks the engine for the presented form -- the same conversion the web
    // UI applies before rendering the output pane -- rather than the raw internal value.
    const baked = await new Chef().bake(input, recipe, { returnType: "string" });

    // 61 operations declare `html` output, and their presented form is markup meant for a browser
    // pane. `Magic` is the one that matters most: its answer is a table of candidate decodings,
    // and delivered as raw `<table class='table table-hover ...'>` it is close to unreadable for
    // an MCP client and expensive in tokens. Upstream reaches the same conclusion for non-browser
    // consumers -- `DishHTML.toArrayBuffer()` runs exactly this pair before handing bytes on -- so
    // this matches the Node API's own treatment of html rather than inventing one.
    const isHtml = recipe.length > 0 &&
        OperationConfig[recipe[recipe.length - 1].op]?.outputType === "html";
    const result = (isHtml && typeof baked.result === "string") ?
        Utils.unescapeHtml(Utils.stripHtmlTags(baked.result, true)) :
        baked.result;

    if (baked.error) {
        throw createInputError(baked.error.displayStr || String(baked.error), {
            recipe: recipe.map(s => s.op)
        });
    }

    return {
        value: result,
        /**
         * @returns {string} The presented result.
         */
        toString() {
            return typeof result === "string" ? result : JSON.stringify(result);
        }
    };
}
