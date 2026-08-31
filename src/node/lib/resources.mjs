/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Resources: saved recipes, readable without spending a tool call.
 *
 * WHY THIS EXISTS
 * ---------------
 * A saved recipe is reference material -- the caller wants to look at it, or attach it to a
 * conversation, far more often than they want the server to do something with it. MCP separates
 * those two things deliberately: tools are for actions with side effects, resources are for
 * content a client can browse, cache and attach on the user's behalf.
 *
 * This server only ever exposed recipes through tools, so reading one cost a `tools/call` that a
 * cautious client might prompt for, and the recipes were invisible to any client feature built on
 * resource browsing. `cyberchef_recipe_get` and `cyberchef_recipe_list` remain -- they are the
 * right shape for a model that wants a recipe mid-task -- but they are no longer the only way in.
 *
 * WHY THE URI IS THE ID, NOT THE NAME
 * -----------------------------------
 * `recipe://<uuid>`, not `recipe://<name>`. Recipe names are user-supplied and not unique: two
 * recipes may both be called "decode", and a name-keyed URI would make one of them unreachable and
 * silently return the other. The name is carried as the resource's display name instead, which is
 * what it is actually for.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { createInputError } from "../errors.mjs";

/** The scheme this server serves. */
const SCHEME = "recipe://";

/**
 * The resource templates, in the shape `resources/templates/list` returns.
 *
 * Advertised so a client can construct a URI for a recipe it has an id for, rather than having to
 * list every resource first.
 *
 * @returns {{resourceTemplates: Array<Object>}} The templates.
 */
export function listResourceTemplates() {
    return {
        resourceTemplates: [{
            uriTemplate: `${SCHEME}{id}`,
            name: "Saved recipe",
            description:
                "A saved CyberChef recipe, as JSON. The id is the recipe's UUID, which " +
                "cyberchef_recipe_list reports.",
            mimeType: "application/json"
        }]
    };
}

/**
 * Every saved recipe, as resources.
 *
 * @param {Object} manager - The recipe manager.
 * @returns {Promise<{resources: Array<Object>}>} The listing.
 */
export async function listResources(manager) {
    const recipes = await manager.listRecipes({});
    // `listRecipes` returns an array today; tolerate a wrapped shape rather than depending on
    // which, since this module has no business knowing that.
    const list = Array.isArray(recipes) ? recipes : (recipes?.recipes ?? []);

    return {
        resources: list.map(recipe => ({
            uri: `${SCHEME}${recipe.id}`,
            name: recipe.name,
            description: recipe.description ||
                `${recipe.operations?.length ?? 0} operation(s)`,
            mimeType: "application/json"
        }))
    };
}

/**
 * Read one recipe by URI.
 *
 * @param {Object} manager - The recipe manager.
 * @param {string} uri - The resource URI.
 * @returns {Promise<Object>} A `resources/read` result.
 * @throws {Error} If the URI is not a recipe URI, or names no recipe.
 */
export async function readResource(manager, uri) {
    if (typeof uri !== "string" || !uri.startsWith(SCHEME)) {
        // The scheme goes in the MESSAGE, not only in the context: the SDK turns a throw from a
        // resource handler into a JSON-RPC error carrying `message` alone, with `data` null, so
        // context reaches this server's logs and never reaches the caller.
        throw createInputError(
            `Unsupported resource URI: ${uri}. This server serves ${SCHEME}<id>.`, {
                uri,
                supported: `${SCHEME}<id>`,
                hint: "cyberchef_recipe_list reports the ids this server serves."
            });
    }

    const id = uri.slice(SCHEME.length);
    if (!id) {
        throw createInputError(`No recipe id in URI: ${uri}`, { uri, supported: `${SCHEME}<id>` });
    }

    // `getRecipe` throws a structured "Recipe not found" for an unknown id, which is the right
    // error and needs no translation here.
    const recipe = await manager.getRecipe(id);

    return {
        contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(recipe, null, 2)
        }]
    };
}
