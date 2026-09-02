/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * OAuth 2.1 Resource Server support for the HTTP transport.
 *
 * The MCP authorization specification (revision 2026-07-28) makes the server a **resource
 * server**, never an authorization server: it validates tokens issued elsewhere and advertises
 * where they come from. Login, consent and token issuance are explicitly out of scope, and nothing
 * here mints a token.
 *
 * Three normative points shape this file, quoted because getting them wrong is the difference
 * between authentication and the appearance of it:
 *
 *   - *"Implementations using an STDIO transport **SHOULD NOT** follow this specification, and
 *     instead retrieve credentials from the environment."* So this applies to HTTP only. stdio --
 *     the default, and how every editor launches the server -- is untouched, because there the
 *     client already owns the process and a bearer token would protect nothing.
 *   - *"MCP servers **MUST** implement OAuth 2.0 Protected Resource Metadata (RFC9728)."* Served at
 *     `/.well-known/oauth-protected-resource`, unauthenticated by definition -- a client cannot
 *     discover how to authenticate if discovery requires authentication.
 *   - *"MCP servers **MUST** validate that access tokens were issued specifically for them as the
 *     intended audience, according to RFC 8707."* This is the requirement that stops a token
 *     minted for another service being replayed here, and it is checked before anything else the
 *     token claims is believed.
 *
 * **Off by default.** With no issuer configured the HTTP transport behaves exactly as it did
 * before, which keeps every existing deployment working and makes enabling authentication a
 * deliberate act rather than an upgrade side effect.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { AsyncLocalStorage } from "async_hooks";
import { createPublicKey, createHash } from "crypto";
import jwt from "jsonwebtoken";
import { createInputError } from "../errors.mjs";
import { getLogger } from "../logger.mjs";

/** How long a fetched JWKS is reused before being refetched, in milliseconds. */
const JWKS_TTL_MS = 300000;

/** Cap on a fetched metadata or JWKS document, so a hostile issuer cannot exhaust memory. */
const MAX_METADATA_BYTES = 1024 * 1024;

/** Algorithms accepted for token signatures. */
const ALLOWED_ALGORITHMS = ["RS256", "RS384", "RS512", "ES256", "ES384", "PS256", "PS384", "PS512"];

/**
 * The scopes this server understands, most permissive last.
 *
 * Deliberately few. A scope per tool would be 531 scopes and an authorization server nobody can
 * configure; these three describe what a caller can *do to the world*, which is the distinction a
 * person granting access actually reasons about.
 */
export const SCOPES = Object.freeze({
    READ: "cyberchef:read",
    WRITE: "cyberchef:write",
    NETWORK: "cyberchef:network"
});

/** Scope implication: a broader scope satisfies a narrower one. */
const IMPLIES = Object.freeze({
    [SCOPES.WRITE]: [SCOPES.READ],
    [SCOPES.NETWORK]: [SCOPES.READ]
});

/**
 * Read the authorization configuration from the environment.
 *
 * @param {Object} [env] - Environment to read (defaults to `process.env`).
 * @returns {Object} `{enabled, issuer, resource, audience, jwksUri, requiredScopes}`.
 */
export function loadAuthConfig(env = process.env) {
    const issuer = (env.CYBERCHEF_AUTH_ISSUER || "").trim();
    const enabled = Boolean(issuer);
    const resource = canonicalResourceUri(env.CYBERCHEF_AUTH_RESOURCE || "");
    return {
        enabled,
        issuer,
        resource,
        // RFC 8707 binds the token to the resource, so the audience defaults to the canonical
        // resource URI. Overridable because some authorization servers issue a fixed audience
        // string that is not a URI, and refusing to interoperate with them helps nobody.
        audience: (env.CYBERCHEF_AUTH_AUDIENCE || "").trim() || resource,
        jwksUri: (env.CYBERCHEF_AUTH_JWKS_URI || "").trim(),
        requiredScopes: csvScopes(env.CYBERCHEF_AUTH_REQUIRED_SCOPES)
    };
}

/**
 * Normalise a resource identifier to the canonical form RFC 8707 and RFC 9728 expect.
 *
 * The spec is specific: lowercase scheme and host, no fragment, and no trailing slash unless it is
 * semantically significant. A mismatch here is not cosmetic -- the audience check compares this
 * value against the token's `aud`, so a stray trailing slash rejects every valid token.
 *
 * @param {string} value - A resource URI.
 * @returns {string} The canonical form, or "" if absent.
 */
export function canonicalResourceUri(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    let url;
    try {
        url = new URL(raw);
    } catch {
        throw createInputError(
            `CYBERCHEF_AUTH_RESOURCE is not an absolute URI: ${raw.slice(0, 80)}. ` +
            "RFC 8707 requires a scheme, so \"mcp.example.com\" is not valid; use " +
            "\"https://mcp.example.com/mcp\".",
            { value: raw.slice(0, 80) });
    }
    if (url.hash) {
        throw createInputError(
            "CYBERCHEF_AUTH_RESOURCE must not contain a fragment; RFC 8707 forbids it.",
            { value: raw.slice(0, 80) });
    }
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.search = "";
    let out = url.toString();
    if (out.endsWith("/") && url.pathname === "/") out = out.slice(0, -1);
    return out;
}

/** @returns {string[]} Scopes parsed from a comma- or space-separated string. */
function csvScopes(value) {
    return String(value || "").split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

/**
 * The RFC 9728 Protected Resource Metadata document.
 *
 * @param {Object} config - From `loadAuthConfig`.
 * @returns {Object} The metadata document.
 */
export function protectedResourceMetadata(config) {
    return {
        resource: config.resource,
        "authorization_servers": [config.issuer],
        // Advertised as the MINIMAL set for basic functionality, which is what the spec says this
        // field means -- not everything the server can ever require. Anything beyond read is
        // challenged for at the point of use through an insufficient_scope response.
        "scopes_supported": [SCOPES.READ, SCOPES.WRITE, SCOPES.NETWORK],
        "bearer_methods_supported": ["header"],
        "resource_documentation": "https://github.com/doublegate/CyberChef-MCP/wiki/Security"
    };
}

/**
 * The `WWW-Authenticate` value for a 401.
 *
 * @param {Object} config - From `loadAuthConfig`.
 * @param {string[]} [scopes] - Scopes required for the attempted operation.
 * @returns {string} The header value.
 */
export function unauthorizedChallenge(config, scopes = []) {
    const parts = [`Bearer resource_metadata="${metadataUrl(config)}"`];
    if (scopes.length) parts.push(`scope="${scopes.join(" ")}"`);
    return parts.join(", ");
}

/**
 * The `WWW-Authenticate` value for a 403 caused by missing scope.
 *
 * Separate from the 401 form because the spec distinguishes them: 401 means "authenticate", 403
 * with `insufficient_scope` means "you did authenticate, and it was not enough". Collapsing the two
 * sends a client back through a login it has already completed.
 *
 * @param {Object} config - From `loadAuthConfig`.
 * @param {string[]} scopes - Scopes required for the attempted operation.
 * @param {string} [description] - Human-readable detail.
 * @returns {string} The header value.
 */
export function insufficientScopeChallenge(config, scopes, description) {
    const parts = [
        "Bearer error=\"insufficient_scope\"",
        `scope="${scopes.join(" ")}"`,
        `resource_metadata="${metadataUrl(config)}"`
    ];
    if (description) parts.push(`error_description="${String(description).replace(/"/g, "'")}"`);
    return parts.join(", ");
}

/** @returns {string} The URL of this server's Protected Resource Metadata document. */
export function metadataUrl(config) {
    const base = config.resource || "";
    try {
        const url = new URL(base);
        // RFC 9728 inserts the well-known segment after the host and BEFORE any path, so a server
        // at https://host/mcp advertises https://host/.well-known/oauth-protected-resource/mcp.
        const suffix = url.pathname === "/" ? "" : url.pathname;
        return `${url.origin}/.well-known/oauth-protected-resource${suffix}`;
    } catch {
        return "/.well-known/oauth-protected-resource";
    }
}

/** Cached JWKS keyed by URI. */
const jwksCache = new Map();

/**
 * Fetch and cache an authorization server's JWKS.
 *
 * @param {string} uri - The `jwks_uri`.
 * @returns {Promise<Map<string, Object>>} Keys by `kid`.
 */
async function fetchJwks(uri) {
    const cached = jwksCache.get(uri);
    if (cached && Date.now() - cached.at < JWKS_TTL_MS) return cached.keys;

    const res = await fetch(uri, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`JWKS fetch failed: HTTP ${res.status}`);
    const text = await readCapped(res, MAX_METADATA_BYTES);
    const doc = JSON.parse(text);
    const keys = new Map();
    for (const jwk of doc.keys || []) {
        if (!jwk.kid) continue;
        try {
            // Node imports a JWK directly, so verifying RS256/ES256 needs no JOSE library. That
            // matters more than convenience here: an authentication path is the last place to add
            // a dependency that is not already being audited for this project.
            keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
        } catch (err) {
            getLogger().warn({ kid: jwk.kid, err: err.message }, "auth: unusable JWKS key, skipped");
        }
    }
    if (!keys.size) throw new Error("JWKS contained no usable keys");
    jwksCache.set(uri, { at: Date.now(), keys });
    return keys;
}

/** @returns {Promise<string>} The response body, refusing anything over `limit` bytes. */
async function readCapped(res, limit) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > limit) throw new Error(`document exceeds ${limit} bytes`);
    return buf.toString("utf8");
}

/**
 * Discover the authorization server's `jwks_uri`.
 *
 * Tries RFC 8414 first, then OpenID Connect Discovery, which is the order the spec requires a
 * client to try and the same two documents a resource server needs.
 *
 * @param {Object} config - From `loadAuthConfig`.
 * @returns {Promise<string>} The `jwks_uri`.
 */
export async function discoverJwksUri(config) {
    if (config.jwksUri) return config.jwksUri;
    const issuer = config.issuer.replace(/\/$/, "");
    const candidates = [
        `${issuer}/.well-known/oauth-authorization-server`,
        `${issuer}/.well-known/openid-configuration`
    ];
    const failures = [];
    for (const url of candidates) {
        try {
            const res = await fetch(url, { headers: { accept: "application/json" } });
            if (!res.ok) {
                failures.push(`${url} -> HTTP ${res.status}`);
                continue;
            }
            const doc = JSON.parse(await readCapped(res, MAX_METADATA_BYTES));
            // The issuer in the metadata must match the configured one, or the document is not
            // describing the server we think it is.
            if (doc.issuer && doc.issuer.replace(/\/$/, "") !== issuer) {
                failures.push(`${url} -> issuer mismatch (${doc.issuer})`);
                continue;
            }
            if (doc.jwks_uri) return doc.jwks_uri;
            failures.push(`${url} -> no jwks_uri`);
        } catch (err) {
            failures.push(`${url} -> ${err.message}`);
        }
    }
    throw new Error(
        `Could not discover jwks_uri for issuer ${issuer}. Tried: ${failures.join("; ")}. ` +
        "Set CYBERCHEF_AUTH_JWKS_URI to skip discovery.");
}

/**
 * Validate a bearer token.
 *
 * @param {string} token - The raw token.
 * @param {Object} config - From `loadAuthConfig`.
 * @returns {Promise<{ok: true, claims: Object, scopes: string[]}|{ok: false, reason: string}>}
 *   The outcome. Never throws for an invalid token: a rejected token is an ordinary 401, not an
 *   exceptional condition, and treating it as one puts attacker-controlled text on the error path.
 */
export async function verifyToken(token, config) {
    if (!token) return { ok: false, reason: "no token" };
    let keys;
    try {
        keys = await fetchJwks(await discoverJwksUri(config));
    } catch (err) {
        // A discovery or JWKS failure is the SERVER's problem, not the caller's, and must not be
        // reported as a bad token -- that would send a client to re-authenticate against an
        // authorization server that is answering correctly.
        getLogger().error({ err: err.message }, "auth: key discovery failed");
        return { ok: false, reason: "key discovery failed", serverError: true };
    }

    const decoded = jwt.decode(token, { complete: true });
    const kid = decoded?.header?.kid;
    const key = kid ? keys.get(kid) : [...keys.values()][0];
    if (!key) return { ok: false, reason: kid ? `unknown key id ${kid}` : "no key" };

    try {
        const claims = jwt.verify(token, key, {
            algorithms: ALLOWED_ALGORITHMS,
            issuer: config.issuer,
            // RFC 8707 audience binding. This is the check that stops a token minted for a
            // different service being replayed here, and the spec makes it a MUST.
            audience: config.audience,
            clockTolerance: 60
        });
        return { ok: true, claims, scopes: scopesOf(claims) };
    } catch (err) {
        return { ok: false, reason: err.message };
    }
}

/**
 * Scopes carried by a token.
 *
 * Accepts both shapes in the wild: `scope` as a space-separated string (RFC 8693 and most
 * authorization servers) and `scp` as an array (Microsoft Entra, some others).
 *
 * @param {Object} claims - Verified claims.
 * @returns {string[]} The granted scopes.
 */
export function scopesOf(claims) {
    if (Array.isArray(claims?.scp)) return claims.scp.map(String);
    return String(claims?.scope || "").split(/\s+/).filter(Boolean);
}

/**
 * Whether a granted scope set satisfies a required one.
 *
 * The spec requires this: *"Servers MUST account for scope hierarchies, where a broader scope
 * implies narrower ones, when deciding whether a token is sufficient for an operation."*
 *
 * @param {string[]} granted - Scopes from the token.
 * @param {string[]} required - Scopes the operation needs.
 * @returns {boolean} Whether every required scope is satisfied.
 */
export function satisfies(granted, required) {
    if (!required.length) return true;
    const effective = new Set();
    for (const scope of granted) {
        effective.add(scope);
        for (const implied of IMPLIES[scope] || []) effective.add(implied);
    }
    return required.every(scope => effective.has(scope));
}

/** @returns {string|null} The bearer token from an Authorization header, or null. */
export function bearerFrom(headers) {
    const raw = headers?.authorization || headers?.Authorization;
    if (typeof raw !== "string") return null;
    const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
    return match ? match[1].trim() : null;
}

/**
 * A stable, non-reversible identifier for a subject, for audit records.
 *
 * The `sub` claim is often an email address or a directory GUID. An audit log that is useful for
 * correlation does not need either, and writing them to disk turns a debugging aid into personal
 * data with a retention question attached.
 *
 * @param {Object} claims - Verified claims.
 * @returns {string} A short digest of issuer plus subject.
 */
export function subjectDigest(claims) {
    if (!claims?.sub) return "anonymous";
    return createHash("sha256").update(`${claims.iss || ""} ${claims.sub}`)
        .digest("hex").slice(0, 16);
}

/**
 * The authenticated caller, for the duration of one request.
 *
 * `AsyncLocalStorage` rather than a parameter, because the two HTTP legs both build their MCP
 * `Server` from the same zero-argument factory -- the modern leg's `createMcpHandler` calls it
 * itself -- so there is no signature to thread a context through without changing the SDK's. The
 * alternative, a module-level "current request" variable, is wrong the moment two requests
 * overlap, which is the normal case for an HTTP server.
 *
 * Empty on stdio, where the specification says authorization does not apply and the client already
 * owns the process.
 */
const authContext = new AsyncLocalStorage();

/**
 * Run `fn` with an authenticated caller attached to the async context.
 *
 * @param {Object} auth - `{claims, scopes, subject}`.
 * @param {Function} fn - The work.
 * @returns {*} Whatever `fn` returns.
 */
export function withAuthContext(auth, fn) {
    return authContext.run(auth, fn);
}

/**
 * The authenticated caller for the current request.
 *
 * @returns {Object|null} `{claims, scopes, subject}`, or null when unauthenticated or on stdio.
 */
export function currentAuth() {
    return authContext.getStore() || null;
}

/** Test seam: drop cached JWKS so a test can control discovery. */
export function _resetJwksCache() {
    jwksCache.clear();
}
