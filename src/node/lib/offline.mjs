/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Offline mode: refuse the operations that leave this process.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not "making the server work offline". **502 of the 504 operations already do** — they are
 * pure functions over bytes and have never touched a network. The v2.8.0 plan's premise, that
 * offline capability had to be built, was measured and found already true; what it lists as network
 * dependencies is mostly wrong:
 *
 *   - "Plugin loading: NPM registry" -- there is no plugin loader (ADR 0002).
 *   - "Telemetry: OTLP export"       -- the server exports nothing; it depends on the OTel API
 *                                       only, and the operator supplies any SDK (v2.7.0).
 *   - "Auth validation: IdP"         -- already bounded by a 5s deadline and a circuit breaker
 *                                       (v2.6.0).
 *
 * Exactly two operations reach a host outside this process: `HTTP request` and `DNS over HTTPS`.
 *
 * WHAT IT IS
 * ----------
 * A fail-closed switch, for a deployment that is genuinely air-gapped. Without it those two do not
 * fail cleanly -- they hang until the OS gives up on a connection to a host that is not routable,
 * holding a quota slot and a request for as long as that takes. `CYBERCHEF_OFFLINE=true` turns an
 * unbounded hang into an immediate, structured refusal that names the operation.
 *
 * It is a POSTURE, not a sandbox. It refuses operations this server knows to be networked; it does
 * not and cannot stop a process from opening a socket. Anything that needs enforcement rather than
 * cooperation belongs in the network namespace -- a NetworkPolicy, or a container with no route
 * out. This is the honest boundary and the documentation says so in the same words.
 *
 * WHERE IT IS ENFORCED, AND WHY THAT LIST IS LONG
 * -----------------------------------------------
 * There is no single choke point. Three distinct entries reach the engine:
 *
 *   1. `bakeOnCore`      -- cyberchef_bake, cyberchef_batch, registry tools, the streaming path
 *   2. `executeInWorker` -- a direct operation tool, when the worker pool is enabled
 *   3. `bake` from the Node API -- saved-recipe execute and test, in recipe-manager
 *
 * A guard on the tool NAME alone would miss every one of them that carries a recipe:
 * `cyberchef_bake` is not a network tool, but `bake({recipe: [{op: "HTTP request"}]})` is a network
 * call. That is the same shape as the v2.5.0 authorisation bypass, where the scope check sat below
 * the meta-tool branches and `cyberchef_bake` skipped it entirely -- every unit test passed, and
 * the guard was simply never reached.
 *
 * So the check takes a RECIPE and is called at all three entries, and the test suite walks each of
 * them rather than the obvious one.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { NETWORK_OPERATIONS } from "./tool-annotations.mjs";
import { createInputError } from "../errors.mjs";

/**
 * Whether offline mode is on.
 *
 * Read per call rather than captured at import, so a test can toggle it without reloading the
 * module graph -- and so the value can never be a stale copy of the environment.
 *
 * @param {Object} [env] - Environment (defaults to `process.env`).
 * @returns {boolean} True when offline mode is enabled.
 */
export function offlineMode(env = process.env) {
    return env.CYBERCHEF_OFFLINE === "true";
}

/**
 * The network-reaching operation names in a recipe.
 *
 * Accepts the normalised core shape (`[{op, args}]`) and the looser forms a caller may send, so it
 * can be called before or after normalisation without the answer changing.
 *
 * @param {Array|Object|string} recipe - A recipe in any accepted shape.
 * @returns {string[]} Canonical names of the network operations found, in order.
 */
export function networkOperationsIn(recipe) {
    if (recipe === undefined || recipe === null) return [];
    const steps = Array.isArray(recipe) ? recipe : [recipe];
    const found = [];
    for (const step of steps) {
        const name = typeof step === "string" ?
            step :
            (step && typeof step === "object" ? (step.op ?? step.operation ?? step.name) : undefined);
        if (typeof name === "string" && NETWORK_OPERATIONS.has(name)) found.push(name);
    }
    return found;
}

/**
 * Refuse a recipe that would leave this process, when offline mode is on.
 *
 * A no-op when offline mode is off, which is the default -- so this costs one environment read on
 * the ordinary path.
 *
 * @param {Array|Object|string} recipe - The recipe about to be executed.
 * @param {Object} [context] - Extra context for the error (e.g. `{tool}`).
 * @returns {void}
 * @throws {CyberChefMCPError} `INVALID_INPUT`, naming the offending operations.
 */
export function assertOfflineAllowed(recipe, context = {}) {
    if (!offlineMode()) return;
    const offenders = networkOperationsIn(recipe);
    if (offenders.length === 0) return;

    throw createInputError(
        `Offline mode is enabled (CYBERCHEF_OFFLINE=true), so this server refuses operations that ` +
        `reach a host outside it: ${offenders.join(", ")}. ` +
        `Every other operation is unaffected -- 502 of 504 touch no network at all.`,
        {
            // The operation NAMES, which are a fixed enum, and never the arguments -- a refused
            // `HTTP request` carries the caller's URL, and an error is a place data leaks into
            // logs. Same rule as the audit trail and the OpenTelemetry attributes.
            offlineOperations: offenders,
            ...context
        }
    );
}
