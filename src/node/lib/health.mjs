/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Liveness, readiness and startup endpoints for the HTTP transport.
 *
 * These exist for one purpose: to let a load balancer or orchestrator know whether to send this
 * process traffic. Everything below follows from that, and two of the decisions are ones that are
 * commonly made backwards.
 *
 * **Liveness and readiness answer different questions, and conflating them breaks deployments.**
 *
 *   - `/health/live` -- "is this process working?" A failure here means *restart me*.
 *   - `/health/ready` -- "should I get traffic?" A failure here means *route around me*.
 *   - `/health/startup` -- "have I finished starting?" Lets an orchestrator hold off the other two
 *     during a slow start instead of killing a process that is merely still booting.
 *
 * The classic mistake is making liveness fail while draining. During a graceful shutdown the
 * server is deliberately refusing new traffic but is still perfectly alive and finishing in-flight
 * work; a liveness probe that fails then causes the kubelet to **kill the pod mid-drain**, which
 * is the exact opposite of what the drain was for. So `live` stays 200 until the process exits,
 * and only `ready` flips.
 *
 * **They are unauthenticated, and that is deliberate.** A kubelet probe carries no bearer token,
 * so requiring one would make the endpoints useless to the only caller they exist for -- the same
 * reasoning that makes RFC 9728 discovery unauthenticated. Because they are unauthenticated they
 * are also deliberately uninformative: a status string and nothing else. No version, no
 * configuration, no counts, no tenant names. An unauthenticated endpoint that reports internal
 * state is a reconnaissance surface, and "it is only health data" is how that gets shipped.
 *
 * HTTP transport only. On stdio there is no listener to probe and no load balancer to inform.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

/** The probe paths, fixed rather than configurable so a chart and a server cannot disagree. */
export const HEALTH_PATHS = Object.freeze({
    LIVE: "/health/live",
    READY: "/health/ready",
    STARTUP: "/health/startup"
});

/**
 * Lifecycle states, in the order they occur.
 *
 * `DRAINING` is not a failure. It is the state in which the server is still answering requests it
 * already has -- and, briefly, new ones -- while telling the load balancer to stop sending more.
 */
export const LIFECYCLE = Object.freeze({
    STARTING: "starting",
    SERVING: "serving",
    DRAINING: "draining"
});

let state = LIFECYCLE.STARTING;

/** @returns {string} The current lifecycle state. */
export function lifecycleState() {
    return state;
}

/**
 * Mark the server as started and able to serve.
 *
 * Called once the transport is listening, not when the process begins: a readiness probe that
 * passes before the listener is bound invites traffic into a connection refusal.
 *
 * @returns {void}
 */
export function markServing() {
    state = LIFECYCLE.SERVING;
}

/**
 * Enter draining: readiness starts failing, liveness does not.
 *
 * @returns {void}
 */
export function markDraining() {
    state = LIFECYCLE.DRAINING;
}

/** Test seam: return to the initial state. */
export function _resetHealthForTest() {
    state = LIFECYCLE.STARTING;
}

/** @param {string} path - A normalised request path. @returns {boolean} Whether it is a probe. */
export function isHealthPath(path) {
    return path === HEALTH_PATHS.LIVE ||
        path === HEALTH_PATHS.READY ||
        path === HEALTH_PATHS.STARTUP;
}

/**
 * The status and body for a probe.
 *
 * @param {string} path - One of `HEALTH_PATHS`.
 * @returns {{status: number, body: Object}} What to send.
 */
export function healthResponse(path) {
    switch (path) {
        case HEALTH_PATHS.LIVE:
            // 200 in every state including DRAINING. Reaching this handler at all is the proof
            // the event loop is turning, which is the entire question liveness asks.
            return { status: 200, body: { status: "ok" } };

        case HEALTH_PATHS.READY:
            // The only endpoint that changes with state, and the one a deployment depends on.
            if (state === LIFECYCLE.SERVING) return { status: 200, body: { status: "ready" } };
            return { status: 503, body: { status: state } };

        case HEALTH_PATHS.STARTUP:
            if (state === LIFECYCLE.STARTING) return { status: 503, body: { status: "starting" } };
            return { status: 200, body: { status: "started" } };

        default:
            // Unreachable through `isHealthPath`, and a 404 rather than a throw so a future caller
            // that forgets the guard degrades into an ordinary not-found instead of a 500.
            return { status: 404, body: { status: "not found" } };
    }
}
