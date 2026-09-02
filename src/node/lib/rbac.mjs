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
 * @returns {{allowed: boolean, required: string[]}} The decision and what it needed.
 */
export function authorise({ granted, annotations }) {
    const required = requiredScopes(annotations);
    return { allowed: satisfies(granted || [], required), required };
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
    return tools.filter(tool => authorise({ granted, annotations: tool.annotations }).allowed);
}
