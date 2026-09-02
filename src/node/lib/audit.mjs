/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Audit logging: who did what, when, and whether it was allowed.
 *
 * Distinct from the existing telemetry, and the distinction is the point. Telemetry answers "how
 * is the server performing" — it is aggregate, sampled, off by default for privacy, and nobody
 * minds if an entry is dropped. An audit record answers "who ran this", is per-event, and is
 * worthless if it is incomplete: a log with gaps cannot establish that something did *not* happen.
 *
 * Three rules follow from that, and they are the whole design:
 *
 *   1. **A denied call is logged as loudly as a permitted one.** The refusals are the interesting
 *      records — an access-control log that only records successes cannot show an attempt.
 *   2. **The record is written whatever the outcome**, including when the tool throws. A failure
 *      after authorisation still means the caller reached the tool.
 *   3. **No secrets, no payloads, no subject identifiers.** Arguments can contain the very data
 *      someone is analysing — a key, a password hash, a document. Sizes and names are enough to
 *      reconstruct who did what, and writing the rest turns an audit trail into a second copy of
 *      the sensitive material it was meant to govern.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { getLogger } from "../logger.mjs";
import { currentTenant } from "./tenancy.mjs";

/** Outcomes an audited call can have. */
export const OUTCOME = Object.freeze({
    ALLOWED: "allowed",
    DENIED: "denied",
    ERROR: "error",
    UNAUTHENTICATED: "unauthenticated"
});

/**
 * Whether audit logging is on.
 *
 * On automatically whenever authorization is enabled: a deployment that bothered to configure an
 * issuer is one where "who called this" has an answer worth recording. Independently forcible for
 * a deployment that wants the trail without the tokens.
 *
 * @param {Object} [env] - Environment (defaults to `process.env`).
 * @param {boolean} [authEnabled] - Whether authorization is configured.
 * @returns {boolean} Whether to emit audit records.
 */
export function auditEnabled(env = process.env, authEnabled = false) {
    const explicit = env.CYBERCHEF_AUDIT_ENABLED;
    if (explicit === "true") return true;
    if (explicit === "false") return false;
    return authEnabled;
}

/**
 * Write one audit record.
 *
 * Emitted at `info` on the shared logger, which on stdio goes to stderr and never to the protocol
 * stream. Every record carries `audit: true` so a collector can select them without pattern
 * matching on message text.
 *
 * @param {Object} entry - The record.
 * @param {string} entry.outcome - One of `OUTCOME`.
 * @param {string} entry.tool - Tool name.
 * @param {string} [entry.subject] - Digest of the caller, never the raw subject.
 * @param {string} [entry.tenant] - Tenant; defaults to the current request's.
 * @param {string[]} [entry.scopes] - Scopes the token carried.
 * @param {string[]} [entry.required] - Scopes the call needed.
 * @param {string} [entry.sessionId] - Transport session, when there is one.
 * @param {string} [entry.requestId] - Correlates with the request log.
 * @param {number} [entry.inputSize] - Bytes in, never the bytes themselves.
 * @param {number} [entry.durationMs] - How long it took.
 * @param {string} [entry.reason] - Why a denial happened.
 */
export function audit(entry) {
    const record = {
        audit: true,
        ts: new Date().toISOString(),
        outcome: entry.outcome,
        tool: entry.tool,
        subject: entry.subject || "anonymous",
        // Read from the request context rather than required from each call site. An audit record
        // that omits the tenant because one of a dozen call sites forgot to pass it is precisely
        // the gap rule 1 exists to prevent -- and the missing records would be the denials, which
        // are written from the fewest places. Unconditional, like `subject`: uniform records are
        // queryable, and "default" is the truthful answer in a single-tenant deployment.
        tenant: entry.tenant || currentTenant(),
        ...(entry.scopes?.length ? { scopes: entry.scopes } : {}),
        ...(entry.required?.length ? { required: entry.required } : {}),
        ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
        ...(entry.requestId ? { requestId: entry.requestId } : {}),
        ...(Number.isFinite(entry.inputSize) ? { inputSize: entry.inputSize } : {}),
        ...(Number.isFinite(entry.durationMs) ? { durationMs: entry.durationMs } : {}),
        ...(entry.reason ? { reason: entry.reason } : {})
    };
    // Denials at `warn` so a deployment filtering on level still sees them. A refused call is the
    // record most likely to matter and the one least likely to be looked for deliberately.
    if (record.outcome === OUTCOME.DENIED || record.outcome === OUTCOME.UNAUTHENTICATED) {
        getLogger().warn(record, `audit: ${record.outcome} ${record.tool}`);
    } else {
        getLogger().info(record, `audit: ${record.outcome} ${record.tool}`);
    }
}

/**
 * Wrap a call so it is audited whichever way it ends.
 *
 * @param {Object} context - Fields common to the record.
 * @param {Function} fn - The call.
 * @returns {Promise<*>} Whatever `fn` returns.
 */
export async function audited(context, fn) {
    const started = Date.now();
    try {
        const result = await fn();
        audit({ ...context, outcome: OUTCOME.ALLOWED, durationMs: Date.now() - started });
        return result;
    } catch (err) {
        // The error's MESSAGE is deliberately not recorded. It can quote the input -- a malformed
        // key, a fragment of a document -- and rule 3 above says that does not belong in an audit
        // trail. The code identifies the failure; the request log carries the detail.
        audit({
            ...context,
            outcome: OUTCOME.ERROR,
            durationMs: Date.now() - started,
            reason: err?.code || err?.constructor?.name || "error"
        });
        throw err;
    }
}
