/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Tenant isolation for multi-tenant HTTP deployments.
 *
 * The server has always had process-wide state shared by every caller: one operation cache, one
 * recipe store, one concurrency pool, one rate limiter. On stdio that is exactly right -- there is
 * one client and it owns the process. On a shared HTTP deployment it means four separate ways for
 * one caller's activity to reach another, and v2.4.1 was a fifth (GHSA-rmg9-8936-vx66, a cache key
 * that hashed only the first 1,000 characters of the input).
 *
 * What isolation means here, concretely:
 *
 *   - **Recipes** are scoped to their tenant. This is the only outright data exposure of the four:
 *     without it, any caller can list, read, modify and delete any other caller's saved recipes.
 *   - **The cache key** carries the tenant. Results are deterministic, so a shared cache does not
 *     hand over another tenant's *output* -- but a hit is fast and a miss is slow, so a shared
 *     cache does reveal whether some other tenant has already run a given input. That is a
 *     side channel, and it is the same shape of bug as the one v2.4.1 fixed.
 *   - **Concurrency slots and rate limits** are per tenant, so one tenant cannot consume the whole
 *     pool and deny service to the rest. Noisy-neighbour, not confidentiality, but it is the
 *     difference between a shared deployment being viable and not.
 *   - **Audit records** name the tenant, because an audit trail that cannot answer "whose?" does
 *     not answer the question anyone asks it.
 *
 * Two rules shape the whole module:
 *
 * **A tenant identity is only worth as much as its source.** The id comes from a claim on a token
 * this server has already verified -- signature, issuer, and RFC 8707 audience. Taking it from a
 * header, a query parameter, or an unverified token would let any caller choose their own tenant,
 * which is not isolation, it is the appearance of it. So tenancy requires authorization, and
 * configuring it without authorization is a startup error rather than a silent downgrade.
 *
 * **Off unless configured.** With `CYBERCHEF_TENANT_CLAIM` unset, everything runs in a single
 * tenant and behaves exactly as it did before this file existed. Existing deployments -- all of
 * which are single-tenant, and most of which are stdio -- are unaffected.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { createInputError } from "../errors.mjs";
import { currentAuth } from "./auth.mjs";
import { DEFAULT_TENANT } from "./config.mjs";

/**
 * The tenant everything belongs to when tenancy is disabled.
 *
 * A real name rather than `null` so every downstream key has the same shape whether or not
 * tenancy is on: the cache key, the recipe record and the quota bucket do not each need a
 * "tenancy might be off" branch, and a single-tenant deployment that later enables tenancy does
 * not find its existing records keyed on `undefined`.
 *
 * Defined in config.mjs and re-exported here: the leaf modules that key on it must not have to
 * import this module, which brings auth.mjs and jsonwebtoken with it.
 */
export { DEFAULT_TENANT };

/**
 * Longest accepted tenant identifier.
 *
 * Comfortably above every real identifier shape -- a GUID is 36, a domain rarely passes 60, a URN
 * a little more -- and low enough that a hostile issuer cannot use the claim to inflate every
 * cache key, quota bucket and audit record the server writes.
 */
const MAX_TENANT_LENGTH = 128;

/**
 * Characters permitted in a tenant identifier.
 *
 * An allowlist, not a denylist, because this value becomes a storage key and part of a recipe
 * record, and the interesting inputs are the ones nobody thought to forbid. The permitted set
 * covers the identifier shapes authorization servers actually issue -- GUIDs (Entra `tid`),
 * `org_...` strings (Auth0), domains, and URNs -- and excludes path separators, `%`, NUL, quotes,
 * whitespace and every control character.
 *
 * Rejecting rather than sanitising is deliberate: silently rewriting `../../etc` to `etc` maps two
 * distinct tenants onto one key, which is the very failure this module exists to prevent.
 */
const TENANT_PATTERN = /^[A-Za-z0-9._:@-]+$/;

/**
 * Read tenancy configuration from the environment.
 *
 * @param {Object} [env] - Environment to read (defaults to `process.env`).
 * @returns {Object} `{enabled, claim}`.
 */
export function loadTenancyConfig(env = process.env) {
    const claim = (env.CYBERCHEF_TENANT_CLAIM || "").trim();
    return { enabled: Boolean(claim), claim };
}

/**
 * Validate the configuration pair, failing closed on the combination that cannot work.
 *
 * Tenancy derives identity from a verified token, so tenancy without authorization has no source
 * of identity at all. Left unchecked it would not fail -- it would put every caller in the same
 * tenant while the operator believed they were separated, which is worse than an error because it
 * is invisible. So it is a startup error, raised where a person will read it.
 *
 * @param {Object} tenancyConfig - From `loadTenancyConfig`.
 * @param {Object} authConfig - From `loadAuthConfig`.
 * @throws {Error} When tenancy is configured without authorization.
 */
export function assertTenancyConfig(tenancyConfig, authConfig) {
    if (tenancyConfig.enabled && !authConfig.enabled) {
        throw createInputError(
            "CYBERCHEF_TENANT_CLAIM is set but CYBERCHEF_AUTH_ISSUER is not. Tenant identity is " +
            "read from a claim on a verified access token; without authorization there is no " +
            "verified token, so every caller would silently share one tenant. Set " +
            "CYBERCHEF_AUTH_ISSUER to enable authorization, or unset CYBERCHEF_TENANT_CLAIM to " +
            "run single-tenant.",
            { claim: tenancyConfig.claim });
    }
}

/**
 * The tenant a set of verified token claims belongs to.
 *
 * Returns `{ok: true, tenant}` or `{ok: false, reason}`. A result rather than a throw because the
 * caller answers a rejection with a 403 rather than a stack trace, and because "this token carries
 * no usable tenant" is an ordinary outcome on a misconfigured authorization server, not an
 * exceptional one.
 *
 * A missing or unusable claim is refused rather than defaulted. Falling back to the default tenant
 * would drop a caller the server cannot place into the same bucket as everyone else -- precisely
 * the cross-tenant access the module exists to prevent, arrived at by being helpful.
 *
 * @param {Object} claims - Verified token claims.
 * @param {Object} config - From `loadTenancyConfig`.
 * @returns {Object} `{ok, tenant}` or `{ok, reason}`.
 */
export function tenantOf(claims, config) {
    if (!config.enabled) return { ok: true, tenant: DEFAULT_TENANT };

    const raw = claims?.[config.claim];
    if (raw === undefined || raw === null || raw === "") {
        return { ok: false, reason: `token carries no "${config.claim}" claim` };
    }
    // A number is accepted and stringified: some authorization servers issue numeric tenant ids,
    // and refusing them would be pedantry. Anything else -- an object, an array, a boolean -- is a
    // claim shape this server should not be guessing at.
    if (typeof raw !== "string" && typeof raw !== "number") {
        return { ok: false, reason: `"${config.claim}" claim is not a string or number` };
    }

    const tenant = String(raw).trim();
    if (!tenant) {
        return { ok: false, reason: `"${config.claim}" claim is blank` };
    }
    if (tenant.length > MAX_TENANT_LENGTH) {
        return { ok: false, reason: `"${config.claim}" claim exceeds ${MAX_TENANT_LENGTH} characters` };
    }
    if (!TENANT_PATTERN.test(tenant)) {
        return { ok: false, reason: `"${config.claim}" claim contains unsupported characters` };
    }
    // `.` and `..` pass the character test but are path traversal in every filesystem, and this
    // value reaches a storage key. Checked explicitly so the pattern above can stay readable.
    if (tenant === "." || tenant === "..") {
        return { ok: false, reason: `"${config.claim}" claim is a reserved path segment` };
    }
    // The name reserved for single-tenant operation. A token claiming it would otherwise land in
    // the same bucket as every unauthenticated deployment's data.
    if (tenant === DEFAULT_TENANT) {
        return { ok: false, reason: `"${config.claim}" claim uses the reserved tenant name` };
    }

    return { ok: true, tenant };
}

/**
 * The tenant for the current request.
 *
 * Reads the async context established by the transport, so no layer between the transport and a
 * tool handler needs to grow a parameter. Returns the default tenant on stdio and whenever
 * tenancy is disabled, which is what makes every call site a plain key lookup rather than a
 * conditional.
 *
 * @returns {string} The current tenant identifier.
 */
export function currentTenant() {
    return currentAuth()?.tenant || DEFAULT_TENANT;
}

/**
 * A stable identifier for the caller of the current request, for rate limiting.
 *
 * "Stable" is the entire point, and it is what the previous key was not. The rate limiter was
 * called with the per-request id from `logRequestStart`, which is a fresh `randomUUID()` every
 * time -- so every request presented as a caller that had never been seen, the window was always
 * empty, and nothing was ever limited. Measured before fixing, at a limit of 5 per 60s:
 *
 *     keyed by requestId (as shipped):  1000 requests -> 0 denied, 1000 map entries
 *     keyed by a stable caller:         1000 requests -> 995 denied, 1 map entry
 *
 * Both halves of that were bugs: a rate limiter that permits everything, and a tracking Map that
 * gained an entry per request and never dropped one.
 *
 * Keyed by subject within tenant, not by tenant alone, so one busy user cannot spend their whole
 * organisation's allowance. Falls back to the tenant when there is no authenticated subject, and
 * to the default tenant on stdio -- where there is exactly one client, which is the honest answer
 * rather than a degenerate one.
 *
 * @returns {string} A stable key for the current caller.
 */
export function callerKey() {
    const auth = currentAuth();
    if (!auth) return DEFAULT_TENANT;
    return `${auth.tenant || DEFAULT_TENANT}|${auth.subject || "anonymous"}`;
}
