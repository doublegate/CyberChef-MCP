/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Role-based access control, derived from the annotations the server already computes.
 *
 * The obvious design is a table mapping every tool to a scope. This is not that, and the reason is
 * the failure mode rather than the effort: with 531 tools, a hand-maintained table is wrong the
 * day an operation is added, and it is wrong *silently* -- a tool missing from it either denies
 * everything or, far worse, defaults to permitted. Upstream adds operations in most releases.
 *
 * Instead the required scope falls out of `tool-annotations.mjs`, which already classifies every
 * tool for the `readOnlyHint` / `destructiveHint` / `openWorldHint` a client uses to decide whether
 * to prompt. Those annotations were determined by audit -- the network set was established by
 * checking which operations actually make requests, not by reading names -- so this inherits that
 * work rather than repeating it, and a new tool is classified the moment it is annotated.
 *
 * The mapping, in one line each:
 *
 *   openWorldHint  -> cyberchef:network   reaches outside this process
 *   not readOnly   -> cyberchef:write     changes state that outlives the call
 *   otherwise      -> cyberchef:read      pure computation over the input
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { SCOPES, satisfies } from "./auth.mjs";

/**
 * The scopes a tool call requires.
 *
 * @param {Object} annotations - The tool's MCP annotations.
 * @returns {string[]} Required scopes, usually one.
 */
export function requiredScopes(annotations) {
    // Network access is the strongest claim and is checked first: an operation that reaches the
    // internet is not adequately described as "write", and conflating them would let a token
    // granted for local mutation drive outbound requests.
    if (annotations?.openWorldHint) return [SCOPES.NETWORK];
    if (annotations?.readOnlyHint === false) return [SCOPES.WRITE];
    return [SCOPES.READ];
}

/**
 * Decide whether a call is permitted.
 *
 * @param {Object} params - Parameters.
 * @param {string[]} params.granted - Scopes carried by the token.
 * @param {Object} params.annotations - The target tool's annotations.
 * @param {string[]} [params.required] - Scopes this specific call needs, when the caller has
 *   worked them out from context the annotations cannot express -- a recipe, say. Overrides the
 *   annotation-derived value.
 * @param {boolean} [params.recipeScoped] - Treat an `openWorldHint` tool at its non-network floor,
 *   because whether it reaches the network depends on the recipe rather than on the tool. Used for
 *   `tools/list`, where there is no recipe to inspect. See `RECIPE_SCOPED_TOOLS`.
 * @returns {{allowed: boolean, required: string[]}} The decision and what it needed.
 */
export function authorise({ granted, annotations, required, recipeScoped = false }) {
    const needed = required ?? (recipeScoped ?
        // The floor is what the CHEAPEST recipe actually costs at dispatch, which is `read` --
        // 502 of the 504 operations require only that, and `requiredScopesForRecipe` prices a
        // recipe of them accordingly.
        //
        // Not the tool's own `readOnlyHint`. That would list `bake` at `write` while dispatch
        // admitted the same call at `read`, so a read token would be HIDDEN a tool it could
        // successfully invoke -- the exact inversion of why the list is filtered at all. List and
        // dispatch have to agree about the floor or the filtering misinforms.
        [SCOPES.READ] :
        requiredScopes(annotations));
    return { allowed: satisfies(granted || [], needed), required: needed };
}

/**
 * Which tools a scope set can reach, for `tools/list` filtering.
 *
 * Filtering the advertised list is a deliberate choice and not merely cosmetic. A model shown a
 * tool it cannot call will call it, get a 403, and try again -- burning a round trip and, worse,
 * concluding the server is broken. Hiding what is unusable is kinder to the model than explaining
 * it afterwards.
 *
 * It is NOT a security boundary on its own: every call is still authorised at dispatch. A tool
 * omitted here and invoked by name is refused there. Both checks exist because the list is advice
 * and the dispatch check is enforcement, and only one of them can be trusted.
 *
 * @param {Array<Object>} tools - Tools with `annotations`.
 * @param {string[]} granted - Scopes carried by the token.
 * @returns {Array<Object>} The subset the caller may invoke.
 */
export function visibleTools(tools, granted) {
    return tools.filter(tool => authorise({
        granted,
        annotations: tool.annotations,
        // A recipe-carrying tool is listed at its FLOOR. See `RECIPE_SCOPED_TOOLS`.
        recipeScoped: RECIPE_SCOPED_TOOLS.has(tool.name)
    }).allowed);
}

/**
 * Tools whose real scope requirement comes from the recipe they carry, not from their own name.
 *
 * WHY THESE ARE SPECIAL
 * ---------------------
 * All three are annotated `openWorldHint: true`, because a recipe *may* contain `HTTP request`.
 * `requiredScopes` checks that hint first, so all three demanded `cyberchef:network` for every
 * call -- including a recipe that never leaves the process.
 *
 * That produced an incoherence worth stating plainly, because it is the argument for this code
 * existing. Measured across the catalogue:
 *
 *     502 of 504 operation tools require only cyberchef:read
 *       2 of 504 require cyberchef:network  (HTTP request, DNS over HTTPS)
 *
 * So `cyberchef_to_base64` needed `read`, while `cyberchef_bake` running that same operation
 * needed `network`. The same work through a different door, priced differently -- and the door
 * with the *lower* price is the one that exposes 504 separate tools.
 *
 * This is the same granularity error the offline guard was fixed for in v2.8.0, where the rule is
 * recorded as: the guard is on the RECIPE, not the tool name. `networkOperationsIn()` in
 * `offline.mjs` already evaluates recipes at exactly this granularity; this reuses that idea for
 * scopes instead of duplicating it.
 *
 * LIST versus DISPATCH
 * --------------------
 * Listing is advice; dispatch is enforcement. So these are LISTED at their floor -- the scope the
 * most benign recipe needs -- and ENFORCED at dispatch against the recipe actually submitted. A
 * `read` token sees `cyberchef_bake` and is refused only when it submits a recipe that reaches
 * the network.
 */
export const RECIPE_SCOPED_TOOLS = new Set([
    "cyberchef_bake",
    "cyberchef_batch"
]);

/**
 * `cyberchef_recipe_execute` is deliberately NOT in that set.
 *
 * It carries only a recipe id, so what it will run cannot be known at the authorisation point --
 * and the authorisation point is FIRST on purpose. It sat below the meta-tool branches until
 * v2.5.0, where `cyberchef_bake` and ten recipe tools bypassed it entirely, so moving the check
 * after a storage read to learn the recipe would walk back into that shape.
 *
 * It therefore keeps its worst-case `cyberchef:network` requirement, listed and enforced alike.
 * That is conservative rather than wrong: a saved recipe is opaque until loaded, and a token that
 * may execute arbitrary stored recipes is closer to network-capable than to read-only. Revisit
 * only with a design that resolves the recipe without moving the guard.
 */

/**
 * The scopes a specific recipe actually needs.
 *
 * Derived per operation from the same annotations the individual operation tools carry, so
 * `bake([{op: "To Base64"}])` costs exactly what `cyberchef_to_base64` costs.
 *
 * @param {string[]} operationNames - Canonical operation names in the recipe.
 * @param {Function} annotationsFor - `annotationsForOperation`, injected to avoid a module cycle.
 * @returns {string[]} The scopes required, strongest first.
 */
export function requiredScopesForRecipe(operationNames, annotationsFor) {
    const needed = new Set();
    for (const name of operationNames ?? []) {
        for (const scope of requiredScopes(annotationsFor(name))) needed.add(scope);
    }
    // An empty or unrecognised recipe is refused by the engine, not by the scope check. Charging
    // it the floor keeps this function from being the thing that rejects it, which would report a
    // permission problem for what is actually a malformed request.
    if (needed.size === 0) return [SCOPES.READ];
    // Strongest wins: a recipe with one networked operation needs network, whatever else is in it.
    if (needed.has(SCOPES.NETWORK)) return [SCOPES.NETWORK];
    if (needed.has(SCOPES.WRITE)) return [SCOPES.WRITE];
    return [SCOPES.READ];
}
