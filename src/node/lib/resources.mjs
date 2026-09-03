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

import { ProtocolError, ProtocolErrorCode, ResourceNotFoundError } from "@modelcontextprotocol/server";
import { ErrorCodes } from "../errors.mjs";

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
    // WHY THESE THROW SDK ERRORS AND NOT `createInputError`
    //
    // `CyberChefMCPError.code` is a STRING (`"INVALID_INPUT"`). The SDK dispatcher keeps a thrown
    // error's code only when it is a safe integer and otherwise substitutes Internal Error, so
    // every failure here answered **-32603 Internal Error, with no `data`**. Measured through a
    // real client before fixing:
    //
    //     recipe://00000000-0000-4000-8000-000000000000   code=-32603 data=undefined
    //     file:///etc/passwd                              code=-32603 data=undefined
    //
    // A caller could not tell "that resource does not exist" from "the server broke", and the
    // 2026-07-28 spec is explicit that resource-not-found is -32602 (Invalid Params).
    //
    // The comment that used to sit here said context had to go in the MESSAGE because the SDK
    // carried `message` alone "with `data` null". That was true of the SDK this code was written
    // against; the modern codec carries `data`, so the workaround outlived its reason. Messages
    // stay self-sufficient anyway -- that costs nothing and survives the next SDK change.
    //
    // `ErrorCodes` are still correct everywhere else: they are CONTENT codes for `isError: true`
    // tool results, which is a different channel from a JSON-RPC error.
    //
    // EVERY branch carries `data.uri`, including these two. SEP-2164 makes the requested URI a
    // SHOULD on the error data for any resource failure, and v3.0.0 shipped it on the
    // missing-recipe path only -- deliberately, because its findings log wanted the two -32602s
    // "distinguishable by whether `data.uri` is present". That distinction survives without the
    // omission: `data.supported` is present on exactly these malformed-URI branches and absent on
    // the missing-recipe one, so a caller can still tell them apart, and the SHOULD is met.
    //
    // Found by `@modelcontextprotocol/conformance`'s `sep-2164-resource-not-found` scenario, not
    // by any of the 1,426 tests in this repository -- which could not have found it, because they
    // assert the shape this server was written to produce. See v3.1.0 findings log F-03.
    if (typeof uri !== "string" || !uri.startsWith(SCHEME)) {
        throw new ProtocolError(
            ProtocolErrorCode.InvalidParams,
            `Unsupported resource URI: ${uri}. This server serves ${SCHEME}<id>.`,
            {
                uri,
                supported: `${SCHEME}<id>`,
                hint: "cyberchef_recipe_list reports the ids this server serves."
            });
    }

    const id = uri.slice(SCHEME.length);
    if (!id) {
        throw new ProtocolError(
            ProtocolErrorCode.InvalidParams,
            `No recipe id in URI: ${uri}`,
            { uri, supported: `${SCHEME}<id>` });
    }

    // A MISSING resource is not a malformed request, and the two are distinguishable to a caller
    // only by `data.uri` -- which is the shape the SDK documents clients to recognise
    // resource-not-found by. `getRecipe` throws the string-coded error, which is right for
    // `cyberchef_recipe_get` (a tool result) and wrong on the wire, so it is translated HERE
    // rather than changed at the source.
    let recipe;
    try {
        recipe = await manager.getRecipe(id);
    } catch (error) {
        if (error?.code === ErrorCodes.INVALID_INPUT) throw new ResourceNotFoundError(uri);
        throw error;
    }

    return {
        contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(recipe, null, 2)
        }]
    };
}
