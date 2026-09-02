/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * OAuth 2.1 Resource Server behaviour.
 *
 * The end-to-end cases mint a real RSA key, serve a real JWKS and a real authorization-server
 * metadata document from a throwaway HTTP server, and sign real tokens. Nothing is mocked, because
 * the failure modes worth catching here are all in the parts a mock would replace: audience
 * binding, key selection by `kid`, signature verification, and the exact `WWW-Authenticate` text a
 * client parses to find the metadata document.
 *
 * A test that stubs `verifyToken` proves the server calls a function. That is not the property
 * anybody needs.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateKeyPairSync } from "crypto";
import http from "http";
import jwt from "jsonwebtoken";
import {
    loadAuthConfig, canonicalResourceUri, protectedResourceMetadata, unauthorizedChallenge,
    insufficientScopeChallenge, metadataUrl, verifyToken, scopesOf, satisfies, bearerFrom,
    subjectDigest, SCOPES, _resetJwksCache
} from "../../src/node/lib/auth.mjs";
import { requiredScopes, authorise, visibleTools } from "../../src/node/lib/rbac.mjs";
import { auditEnabled, OUTCOME } from "../../src/node/lib/audit.mjs";

describe("canonical resource URI", () => {
    it("normalises scheme and host, and drops a bare trailing slash", () => {
        // Not cosmetic: this value is compared against the token's `aud`, so a stray trailing
        // slash rejects every otherwise-valid token.
        expect(canonicalResourceUri("HTTPS://MCP.Example.COM")).toBe("https://mcp.example.com");
        expect(canonicalResourceUri("https://mcp.example.com/")).toBe("https://mcp.example.com");
        expect(canonicalResourceUri("https://mcp.example.com/mcp"))
            .toBe("https://mcp.example.com/mcp");
    });

    it("refuses the two forms RFC 8707 calls invalid", () => {
        expect(() => canonicalResourceUri("mcp.example.com")).toThrow(/not an absolute URI/);
        expect(() => canonicalResourceUri("https://mcp.example.com#frag")).toThrow(/fragment/);
    });

    it("is empty when unset, which is what leaves authorization off", () => {
        expect(canonicalResourceUri("")).toBe("");
        expect(loadAuthConfig({}).enabled).toBe(false);
    });
});

describe("scope hierarchy", () => {
    it("lets a broader scope satisfy a narrower one", () => {
        // The spec requires this: "Servers MUST account for scope hierarchies, where a broader
        // scope implies narrower ones."
        expect(satisfies([SCOPES.WRITE], [SCOPES.READ])).toBe(true);
        expect(satisfies([SCOPES.NETWORK], [SCOPES.READ])).toBe(true);
        expect(satisfies([SCOPES.READ], [SCOPES.WRITE])).toBe(false);
        expect(satisfies([SCOPES.WRITE], [SCOPES.NETWORK])).toBe(false);
    });

    it("treats no requirement as satisfied, and no grant as insufficient", () => {
        expect(satisfies([], [])).toBe(true);
        expect(satisfies([], [SCOPES.READ])).toBe(false);
    });

    it("reads both claim shapes authorization servers actually emit", () => {
        expect(scopesOf({ scope: "cyberchef:read cyberchef:write" }))
            .toEqual(["cyberchef:read", "cyberchef:write"]);
        // Entra and others use an array under `scp`.
        expect(scopesOf({ scp: ["cyberchef:read"] })).toEqual(["cyberchef:read"]);
        expect(scopesOf({})).toEqual([]);
    });
});

describe("RBAC derived from annotations", () => {
    it("maps the three annotation shapes to the three scopes", () => {
        expect(requiredScopes({ readOnlyHint: true })).toEqual([SCOPES.READ]);
        expect(requiredScopes({ readOnlyHint: false })).toEqual([SCOPES.WRITE]);
        expect(requiredScopes({ readOnlyHint: false, openWorldHint: true }))
            .toEqual([SCOPES.NETWORK]);
    });

    it("treats network access as stronger than write, not as a kind of it", () => {
        // A token granted for local mutation must not drive outbound requests. If this ever
        // returned WRITE for an openWorld tool, `cyberchef:write` would silently buy the network.
        const out = authorise({
            granted: [SCOPES.WRITE],
            annotations: { readOnlyHint: false, openWorldHint: true }
        });
        expect(out.allowed).toBe(false);
        expect(out.required).toEqual([SCOPES.NETWORK]);
    });

    it("hides what a caller cannot invoke, without that being the enforcement", () => {
        const tools = [
            { name: "a", annotations: { readOnlyHint: true } },
            { name: "b", annotations: { readOnlyHint: false } },
            { name: "c", annotations: { readOnlyHint: false, openWorldHint: true } }
        ];
        expect(visibleTools(tools, [SCOPES.READ]).map(t => t.name)).toEqual(["a"]);
        expect(visibleTools(tools, [SCOPES.WRITE]).map(t => t.name)).toEqual(["a", "b"]);
        expect(visibleTools(tools, [SCOPES.WRITE, SCOPES.NETWORK]).map(t => t.name))
            .toEqual(["a", "b", "c"]);
    });

    it("classifies every real tool without a hand-maintained table", async () => {
        // The property that makes deriving from annotations worth it: a tool added upstream is
        // classified the moment it is annotated, with nothing to forget to update.
        const { annotationsForOperation } = await import("../../src/node/lib/tool-annotations.mjs");
        const { default: OperationConfig } =
            await import("../../src/core/config/OperationConfig.json", { with: { type: "json" } });
        const names = Object.keys(OperationConfig);
        expect(names.length).toBeGreaterThan(500);
        for (const name of names) {
            const scopes = requiredScopes(annotationsForOperation(name, OperationConfig[name]));
            expect(scopes, `no scope derived for ${name}`).toHaveLength(1);
            expect(Object.values(SCOPES)).toContain(scopes[0]);
        }
    }, 60000);
});

describe("challenges and metadata", () => {
    const config = loadAuthConfig({
        CYBERCHEF_AUTH_ISSUER: "https://issuer.example.com",
        CYBERCHEF_AUTH_RESOURCE: "https://mcp.example.com/mcp"
    });

    it("puts the well-known segment before the resource path, as RFC 9728 requires", () => {
        expect(metadataUrl(config))
            .toBe("https://mcp.example.com/.well-known/oauth-protected-resource/mcp");
    });

    it("advertises the authorization server and the minimal scope set", () => {
        const doc = protectedResourceMetadata(config);
        expect(doc.resource).toBe("https://mcp.example.com/mcp");
        expect(doc.authorization_servers).toEqual(["https://issuer.example.com"]);
        expect(doc.scopes_supported).toEqual(Object.values(SCOPES));
        expect(doc.bearer_methods_supported).toEqual(["header"]);
    });

    it("emits a 401 challenge a client can parse to find the metadata", () => {
        const header = unauthorizedChallenge(config);
        expect(header).toMatch(/^Bearer resource_metadata="https:\/\/mcp\.example\.com\/\.well-known\/oauth-protected-resource\/mcp"$/);
        expect(unauthorizedChallenge(config, [SCOPES.READ]))
            .toMatch(/scope="cyberchef:read"/);
    });

    it("distinguishes insufficient scope from unauthenticated", () => {
        // 401 means "authenticate"; 403 + insufficient_scope means "you did, and it was not
        // enough". Collapsing them sends a client back through a login it already completed.
        const header = insufficientScopeChallenge(config, [SCOPES.WRITE], "needs write");
        expect(header).toMatch(/error="insufficient_scope"/);
        expect(header).toMatch(/scope="cyberchef:write"/);
        expect(header).toMatch(/resource_metadata=/);
        expect(header).toMatch(/error_description="needs write"/);
    });
});

describe("token verification against a real JWKS", () => {
    let asServer;
    let issuer;
    let privateKey;
    let config;
    const KID = "test-key-1";
    const RESOURCE = "https://mcp.example.com/mcp";

    beforeAll(async () => {
        const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
        privateKey = pair.privateKey.export({ type: "pkcs1", format: "pem" });
        const jwk = pair.publicKey.export({ format: "jwk" });

        asServer = http.createServer((req, res) => {
            const send = (obj) => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(obj));
            };
            if (req.url.startsWith("/.well-known/oauth-authorization-server")) {
                send({ issuer, "jwks_uri": `${issuer}/jwks` });
            } else if (req.url.startsWith("/jwks")) {
                send({ keys: [{ ...jwk, kid: KID, use: "sig", alg: "RS256" }] });
            } else {
                res.writeHead(404);
                res.end();
            }
        });
        await new Promise(resolve => asServer.listen(0, "127.0.0.1", resolve));
        issuer = `http://127.0.0.1:${asServer.address().port}`;
        config = loadAuthConfig({
            CYBERCHEF_AUTH_ISSUER: issuer,
            CYBERCHEF_AUTH_RESOURCE: RESOURCE
        });
        _resetJwksCache();
    }, 30000);

    afterAll(async () => {
        if (asServer) await new Promise(resolve => asServer.close(resolve));
    });

    /** @returns {string} A signed token, with overridable claims. */
    const mint = (over = {}) => jwt.sign(
        { scope: SCOPES.READ, ...over },
        privateKey,
        {
            algorithm: "RS256", keyid: KID, expiresIn: "5m",
            issuer, audience: RESOURCE, subject: "user-1", ...(over._sign || {})
        });

    it("accepts a correctly issued token and returns its scopes", async () => {
        const out = await verifyToken(mint(), config);
        expect(out.ok).toBe(true);
        expect(out.scopes).toEqual([SCOPES.READ]);
        expect(out.claims.sub).toBe("user-1");
    }, 30000);

    it("REJECTS a token minted for a different audience", async () => {
        // The spec's central MUST, and the one that stops a token for another service being
        // replayed here. Everything else about this token is valid.
        const other = jwt.sign({ scope: SCOPES.READ }, privateKey, {
            algorithm: "RS256", keyid: KID, expiresIn: "5m",
            issuer, audience: "https://other.example.com", subject: "user-1"
        });
        const out = await verifyToken(other, config);
        expect(out.ok).toBe(false);
        expect(out.reason).toMatch(/audience/i);
    }, 30000);

    it("rejects a token from a different issuer", async () => {
        const foreign = jwt.sign({ scope: SCOPES.READ }, privateKey, {
            algorithm: "RS256", keyid: KID, expiresIn: "5m",
            issuer: "https://evil.example.com", audience: RESOURCE, subject: "user-1"
        });
        const out = await verifyToken(foreign, config);
        expect(out.ok).toBe(false);
        expect(out.reason).toMatch(/issuer/i);
    }, 30000);

    it("rejects an expired token", async () => {
        const expired = jwt.sign({ scope: SCOPES.READ }, privateKey, {
            algorithm: "RS256", keyid: KID, expiresIn: "-10m",
            issuer, audience: RESOURCE, subject: "user-1"
        });
        const out = await verifyToken(expired, config);
        expect(out.ok).toBe(false);
        expect(out.reason).toMatch(/expired/i);
    }, 30000);

    it("rejects a token signed by a key the issuer does not publish", async () => {
        const rogue = generateKeyPairSync("rsa", { modulusLength: 2048 });
        const forged = jwt.sign({ scope: SCOPES.READ },
            rogue.privateKey.export({ type: "pkcs1", format: "pem" }),
            {
                algorithm: "RS256", keyid: KID, expiresIn: "5m",
                issuer, audience: RESOURCE, subject: "user-1"
            });
        const out = await verifyToken(forged, config);
        expect(out.ok).toBe(false);
    }, 30000);

    it("rejects the alg=none forgery outright", async () => {
        // The classic JWT attack. It must fail because `none` is absent from the allowed
        // algorithms, not because the signature happens not to verify.
        const none = jwt.sign({ scope: SCOPES.READ, iss: issuer, aud: RESOURCE, sub: "user-1" },
            "", { algorithm: "none" });
        const out = await verifyToken(none, config);
        expect(out.ok).toBe(false);
    }, 30000);

    it("returns no token and missing key without throwing", async () => {
        // A rejected token is an ordinary 401, not an exceptional condition. Throwing here would
        // put attacker-controlled text on the error path.
        expect((await verifyToken("", config)).ok).toBe(false);
        expect((await verifyToken("not.a.jwt", config)).ok).toBe(false);
    }, 30000);
});

describe("audit records", () => {
    it("follows authorization unless overridden", () => {
        expect(auditEnabled({}, false)).toBe(false);
        expect(auditEnabled({}, true)).toBe(true);
        expect(auditEnabled({ CYBERCHEF_AUDIT_ENABLED: "true" }, false)).toBe(true);
        expect(auditEnabled({ CYBERCHEF_AUDIT_ENABLED: "false" }, true)).toBe(false);
    });

    it("names an outcome for each of the four cases a call can end in", () => {
        expect(Object.values(OUTCOME).sort())
            .toEqual(["allowed", "denied", "error", "unauthenticated"]);
    });
});

describe("subject digests", () => {
    it("does not put a raw subject in the audit trail", () => {
        // `sub` is often an email address or a directory GUID. Correlation does not need either,
        // and writing them turns a debugging aid into personal data with a retention question.
        const claims = { iss: "https://issuer.example.com", sub: "alice@example.com" };
        const digest = subjectDigest(claims);
        expect(digest).not.toContain("alice");
        expect(digest).toMatch(/^[0-9a-f]{16}$/);
        // Stable, so records from one subject correlate across a session.
        expect(subjectDigest(claims)).toBe(digest);
        // And distinct per issuer, so the same local-part at two issuers is two subjects.
        expect(subjectDigest({ ...claims, iss: "https://other.example.com" })).not.toBe(digest);
    });

    it("says anonymous when there is no subject", () => {
        expect(subjectDigest({})).toBe("anonymous");
        expect(subjectDigest(null)).toBe("anonymous");
    });
});

describe("bearer extraction", () => {
    it("accepts the documented form and rejects the rest", () => {
        expect(bearerFrom({ authorization: "Bearer abc.def.ghi" })).toBe("abc.def.ghi");
        expect(bearerFrom({ authorization: "bearer abc" })).toBe("abc");
        expect(bearerFrom({ authorization: "Basic abc" })).toBe(null);
        expect(bearerFrom({})).toBe(null);
        expect(bearerFrom(null)).toBe(null);
    });
});

describe("the HTTP transport with authorization enabled", () => {
    let asServer;
    let issuer;
    let privateKey;
    let handle;
    let port;
    const KID = "http-key-1";

    beforeAll(async () => {
        const { Server } = await import("@modelcontextprotocol/server");
        const { createTransport } = await import("../../src/node/transports.mjs");

        const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
        privateKey = pair.privateKey.export({ type: "pkcs1", format: "pem" });
        const jwk = pair.publicKey.export({ format: "jwk" });

        asServer = http.createServer((req, res) => {
            const send = (obj) => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(obj));
            };
            if (req.url.startsWith("/.well-known/oauth-authorization-server")) {
                send({ issuer, "jwks_uri": `${issuer}/jwks` });
            } else if (req.url.startsWith("/jwks")) {
                send({ keys: [{ ...jwk, kid: KID, use: "sig", alg: "RS256" }] });
            } else {
                res.writeHead(404);
                res.end();
            }
        });
        await new Promise(resolve => asServer.listen(0, "127.0.0.1", resolve));
        issuer = `http://127.0.0.1:${asServer.address().port}`;
        _resetJwksCache();

        const makeServer = () => {
            const s = new Server({ name: "auth-test", version: "0.0.0" },
                { capabilities: { tools: {} } });
            s.setRequestHandler("tools/list", async () => ({ tools: [] }));
            return s;
        };

        handle = await createTransport({
            type: "http", port: 0, createServer: makeServer,
            auth: loadAuthConfig({
                CYBERCHEF_AUTH_ISSUER: issuer,
                CYBERCHEF_AUTH_RESOURCE: "http://127.0.0.1/mcp"
            })
        });
        await new Promise((resolve) => {
            if (handle.httpServer.listening) return resolve();
            handle.httpServer.once("listening", resolve);
        });
        port = handle.httpServer.address().port;
    }, 60000);

    afterAll(async () => {
        if (handle?.closeAll) await handle.closeAll();
        else if (handle?.httpServer) await new Promise(r => handle.httpServer.close(r));
        if (asServer) await new Promise(r => asServer.close(r));
    });

    /** @returns {Promise<Response>} A POST to the MCP endpoint. */
    const post = (token) => fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        // `initialize` rather than `tools/list`: the latter is not valid as a first message and
        // the MCP layer answers 400 for it, which would make the happy-path assertion below pass
        // or fail for a reason that has nothing to do with the token.
        body: JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "initialize",
            params: {
                protocolVersion: "2025-11-25",
                capabilities: {},
                clientInfo: { name: "auth-test", version: "0.0.0" }
            }
        })
    });

    it("challenges an unauthenticated request with a parseable 401", async () => {
        const res = await post(null);
        expect(res.status).toBe(401);
        const header = res.headers.get("www-authenticate");
        // The header is the whole discovery mechanism: a client that cannot parse
        // `resource_metadata` out of it has no way to find the authorization server.
        expect(header).toMatch(/^Bearer /);
        expect(header).toMatch(/resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource/);
    }, 30000);

    it("serves the RFC 9728 metadata WITHOUT a token", async () => {
        // Discovery cannot require the thing it is used to obtain.
        const res = await fetch(
            `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`);
        expect(res.status).toBe(200);
        const doc = await res.json();
        expect(doc.authorization_servers).toEqual([issuer]);
        expect(doc.scopes_supported).toContain(SCOPES.READ);
    }, 30000);

    it("rejects a token for the wrong audience at the transport, not just in the unit", async () => {
        const wrong = jwt.sign({ scope: SCOPES.READ }, privateKey, {
            algorithm: "RS256", keyid: KID, expiresIn: "5m",
            issuer, audience: "https://elsewhere.example.com", subject: "u"
        });
        expect((await post(wrong)).status).toBe(401);
    }, 30000);

    it("lets a correctly issued token through", async () => {
        const good = jwt.sign({ scope: SCOPES.READ }, privateKey, {
            algorithm: "RS256", keyid: KID, expiresIn: "5m",
            issuer, audience: "http://127.0.0.1/mcp", subject: "u"
        });
        const res = await post(good);
        expect(res.status).toBe(200);
        // And explicitly not challenged, which is the property this test exists for: a 200 could
        // in principle be reached without the gate ever having run.
        expect(res.headers.get("www-authenticate")).toBe(null);
    }, 30000);

    it("does not challenge a CORS preflight", async () => {
        // A preflight carries no Authorization header by definition. Challenging it makes the
        // browser abandon the request before the real one is ever sent.
        const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "OPTIONS" });
        expect(res.status).toBe(204);
    }, 30000);

    it("still 404s an unrelated path rather than revealing a protected endpoint", async () => {
        const res = await fetch(`http://127.0.0.1:${port}/nope`);
        expect(res.status).toBe(404);
    }, 30000);
});

describe("audit records: what actually gets written", () => {
    let entries;
    let restore;

    beforeAll(async () => {
        const loggerMod = await import("../../src/node/logger.mjs");
        const real = loggerMod.getLogger();
        entries = [];
        const capture = (level) => (rec, msg) => entries.push({ level, rec, msg });
        restore = { warn: real.warn, info: real.info };
        real.warn = capture("warn");
        real.info = capture("info");
    });

    afterAll(async () => {
        const real = (await import("../../src/node/logger.mjs")).getLogger();
        Object.assign(real, restore);
    });

    it("writes a denial at warn, so a level filter still shows refusals", async () => {
        const { audit } = await import("../../src/node/lib/audit.mjs");
        entries.length = 0;
        audit({ outcome: OUTCOME.DENIED, tool: "cyberchef_bake", subject: "abc",
            scopes: [SCOPES.READ], required: [SCOPES.WRITE], reason: "scope" });
        expect(entries).toHaveLength(1);
        // A refused call is the record most likely to matter and least likely to be sought out.
        expect(entries[0].level).toBe("warn");
        expect(entries[0].rec.audit).toBe(true);
        expect(entries[0].rec.required).toEqual([SCOPES.WRITE]);
    });

    it("writes an allowed call at info", async () => {
        const { audit } = await import("../../src/node/lib/audit.mjs");
        entries.length = 0;
        audit({ outcome: OUTCOME.ALLOWED, tool: "cyberchef_to_base64", inputSize: 12,
            durationMs: 3, requestId: "r1", sessionId: "s1" });
        expect(entries[0].level).toBe("info");
        expect(entries[0].rec).toMatchObject({
            tool: "cyberchef_to_base64", inputSize: 12, durationMs: 3,
            requestId: "r1", sessionId: "s1", subject: "anonymous"
        });
        expect(entries[0].rec.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("omits absent fields rather than writing nulls", async () => {
        const { audit } = await import("../../src/node/lib/audit.mjs");
        entries.length = 0;
        audit({ outcome: OUTCOME.ALLOWED, tool: "t" });
        const rec = entries[0].rec;
        for (const key of ["scopes", "required", "sessionId", "requestId", "inputSize",
                           "durationMs", "reason"]) {
            expect(rec, `${key} should be absent, not null`).not.toHaveProperty(key);
        }
    });

    it("audits a throwing call, and records the CODE rather than the message", async () => {
        const { audited } = await import("../../src/node/lib/audit.mjs");
        entries.length = 0;
        const err = new Error("secret key 0xdeadbeef was malformed");
        err.code = "INVALID_INPUT";
        await expect(audited({ tool: "t", subject: "abc" }, async () => {
            throw err;
        })).rejects.toThrow(/malformed/);
        expect(entries[0].rec.outcome).toBe(OUTCOME.ERROR);
        expect(entries[0].rec.reason).toBe("INVALID_INPUT");
        // The message can quote the input -- a key, a document fragment. It must not reach the
        // audit trail, which would make the log a second copy of the sensitive material.
        expect(JSON.stringify(entries[0].rec)).not.toMatch(/deadbeef/);
    });

    it("audits a successful call through the wrapper and returns its value", async () => {
        const { audited } = await import("../../src/node/lib/audit.mjs");
        entries.length = 0;
        const out = await audited({ tool: "t" }, async () => "result");
        expect(out).toBe("result");
        expect(entries[0].rec.outcome).toBe(OUTCOME.ALLOWED);
        expect(entries[0].rec.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("falls back to a constructor name when an error carries no code", async () => {
        const { audited } = await import("../../src/node/lib/audit.mjs");
        entries.length = 0;
        await expect(audited({ tool: "t" }, async () => {
            throw new TypeError("boom");
        })).rejects.toThrow(TypeError);
        expect(entries[0].rec.reason).toBe("TypeError");
    });

    it("still records something when what was thrown is not an Error at all", async () => {
        const { audited } = await import("../../src/node/lib/audit.mjs");
        entries.length = 0;
        // `throw null` has no code and no constructor. The audit record must not be the thing
        // that fails here -- an audit trail with a hole in it cannot show that nothing happened.
        await expect(audited({ tool: "t" }, async () => {
            throw null;
        })).rejects.toBeNull();
        expect(entries[0].rec.outcome).toBe(OUTCOME.ERROR);
        expect(entries[0].rec.reason).toBe("error");
    });
});

describe("discovery failures are the server's problem, not the caller's", () => {
    let badServer;
    let base;

    beforeAll(async () => {
        badServer = http.createServer((req, res) => {
            if (req.url.startsWith("/.well-known/oauth-authorization-server")) {
                res.writeHead(500);
                res.end();
            } else if (req.url.startsWith("/.well-known/openid-configuration")) {
                // Advertises a DIFFERENT issuer: the document is not describing this server.
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ issuer: "https://somewhere.else", "jwks_uri": "x" }));
            } else {
                res.writeHead(404);
                res.end();
            }
        });
        await new Promise(r => badServer.listen(0, "127.0.0.1", r));
        base = `http://127.0.0.1:${badServer.address().port}`;
        _resetJwksCache();
    }, 30000);

    afterAll(async () => {
        if (badServer) await new Promise(r => badServer.close(r));
    });

    it("reports a server error rather than an invalid token when keys cannot be found", async () => {
        // Answering 401 here would send a client to re-authenticate against an authorization
        // server that is behaving correctly -- the fault is at this end.
        const config = loadAuthConfig({
            CYBERCHEF_AUTH_ISSUER: base,
            CYBERCHEF_AUTH_RESOURCE: "https://mcp.example.com/mcp"
        });
        const out = await verifyToken("a.b.c", config);
        expect(out.ok).toBe(false);
        expect(out.serverError).toBe(true);
    }, 30000);

    it("names every endpoint it tried, so the failure is diagnosable", async () => {
        const { discoverJwksUri } = await import("../../src/node/lib/auth.mjs");
        await expect(discoverJwksUri({ issuer: base, jwksUri: "" }))
            .rejects.toThrow(/oauth-authorization-server.*openid-configuration/s);
    }, 30000);

    it("rejects metadata whose issuer does not match the configured one", async () => {
        const { discoverJwksUri } = await import("../../src/node/lib/auth.mjs");
        await expect(discoverJwksUri({ issuer: base, jwksUri: "" }))
            .rejects.toThrow(/issuer mismatch/);
    }, 30000);

    it("skips discovery entirely when a jwks_uri is configured", async () => {
        const { discoverJwksUri } = await import("../../src/node/lib/auth.mjs");
        await expect(discoverJwksUri({ issuer: base, jwksUri: "https://example.com/keys" }))
            .resolves.toBe("https://example.com/keys");
    }, 30000);
});

describe("the awkward corners", () => {
    it("falls back to a relative metadata path when no resource is configured", () => {
        // Reachable: an operator sets an issuer and forgets CYBERCHEF_AUTH_RESOURCE. The challenge
        // must still name SOMETHING a client can fetch rather than emitting an empty URL.
        expect(metadataUrl({ resource: "" })).toBe("/.well-known/oauth-protected-resource");
        expect(metadataUrl({ resource: "not a url" }))
            .toBe("/.well-known/oauth-protected-resource");
    });

    it("skips an unusable JWKS key instead of failing the whole key set", async () => {
        // One malformed entry in a JWKS must not take down verification for every other key --
        // authorization servers do publish keys in formats Node cannot import.
        const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
        const good = pair.publicKey.export({ format: "jwk" });
        const server = http.createServer((req, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            if (req.url.startsWith("/.well-known/oauth-authorization-server")) {
                res.end(JSON.stringify({
                    issuer: `http://127.0.0.1:${server.address().port}`,
                    "jwks_uri": `http://127.0.0.1:${server.address().port}/jwks`
                }));
            } else {
                res.end(JSON.stringify({
                    keys: [
                        // `n: "!!!"` is NOT enough -- Node imports that happily. A JWK
                        // missing its required parameters is what actually throws.
                        { kty: "RSA", kid: "broken" },
                        { ...good, kid: "usable", use: "sig", alg: "RS256" }
                    ]
                }));
            }
        });
        await new Promise(r => server.listen(0, "127.0.0.1", r));
        const issuer = `http://127.0.0.1:${server.address().port}`;
        _resetJwksCache();
        try {
            const config = loadAuthConfig({
                CYBERCHEF_AUTH_ISSUER: issuer,
                CYBERCHEF_AUTH_RESOURCE: "https://mcp.example.com/mcp"
            });
            const token = jwt.sign({ scope: SCOPES.READ },
                pair.privateKey.export({ type: "pkcs1", format: "pem" }),
                {
                    algorithm: "RS256", keyid: "usable", expiresIn: "5m",
                    issuer, audience: "https://mcp.example.com/mcp", subject: "u"
                });
            const out = await verifyToken(token, config);
            expect(out.ok).toBe(true);
        } finally {
            await new Promise(r => server.close(r));
        }
    }, 30000);

    it("reports metadata that parses but carries no jwks_uri", async () => {
        const { discoverJwksUri } = await import("../../src/node/lib/auth.mjs");
        const server = http.createServer((req, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ issuer: `http://127.0.0.1:${server.address().port}` }));
        });
        await new Promise(r => server.listen(0, "127.0.0.1", r));
        try {
            await expect(discoverJwksUri({
                issuer: `http://127.0.0.1:${server.address().port}`, jwksUri: ""
            })).rejects.toThrow(/no jwks_uri/);
        } finally {
            await new Promise(r => server.close(r));
        }
    }, 30000);

    it("reports a transport failure against an unreachable issuer", async () => {
        const { discoverJwksUri } = await import("../../src/node/lib/auth.mjs");
        // Port 1 on loopback: nothing listens, so this exercises the fetch-throws branch rather
        // than an HTTP status branch.
        await expect(discoverJwksUri({ issuer: "http://127.0.0.1:1", jwksUri: "" }))
            .rejects.toThrow(/Could not discover jwks_uri/);
    }, 30000);

    it("treats a missing granted-scope list as granting nothing", () => {
        // `authorise` is called with whatever the token produced, which is undefined when there
        // was no token at all. That must deny, not throw.
        expect(authorise({ granted: undefined, annotations: { readOnlyHint: true } }).allowed)
            .toBe(false);
    });
});

describe("every error path in the token pipeline", () => {
    const RESOURCE = "https://mcp.example.com/mcp";

    /** Spin up a JWKS endpoint returning whatever the test wants, and verify against it. */
    const withJwks = async (handler, fn) => {
        const server = http.createServer(handler);
        await new Promise(r => server.listen(0, "127.0.0.1", r));
        const issuer = `http://127.0.0.1:${server.address().port}`;
        _resetJwksCache();
        try {
            return await fn({
                issuer,
                config: loadAuthConfig({
                    CYBERCHEF_AUTH_ISSUER: issuer,
                    CYBERCHEF_AUTH_JWKS_URI: `${issuer}/jwks`,
                    CYBERCHEF_AUTH_RESOURCE: RESOURCE
                })
            });
        } finally {
            await new Promise(r => server.close(r));
        }
    };

    const json = (res, obj) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
    };

    it("treats a non-200 JWKS as a server problem", async () => {
        await withJwks((req, res) => {
            res.writeHead(503);
            res.end();
        }, async ({ config }) => {
            const out = await verifyToken("a.b.c", config);
            expect(out.ok).toBe(false);
            expect(out.serverError).toBe(true);
        });
    }, 30000);

    it("treats a JWKS with no keys array as a server problem", async () => {
        await withJwks((req, res) => json(res, {}), async ({ config }) => {
            expect((await verifyToken("a.b.c", config)).serverError).toBe(true);
        });
    }, 30000);

    it("ignores a key with no kid, and fails when that leaves none", async () => {
        // A JWKS entry without `kid` cannot be selected by a token header, so it is skipped
        // rather than used as a silent default.
        const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
        await withJwks((req, res) => json(res, {
            keys: [pair.publicKey.export({ format: "jwk" })]
        }), async ({ config }) => {
            expect((await verifyToken("a.b.c", config)).serverError).toBe(true);
        });
    }, 30000);

    it("refuses a JWKS document larger than the cap", async () => {
        // An unbounded read from a third party is a memory-exhaustion vector, and the issuer is
        // exactly a third party here.
        await withJwks((req, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ keys: [], pad: "x".repeat(1024 * 1024 + 64) }));
        }, async ({ config }) => {
            expect((await verifyToken("a.b.c", config)).serverError).toBe(true);
        });
    }, 30000);

    it("says which key id was unknown, so a rotation problem is diagnosable", async () => {
        const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
        await withJwks((req, res) => json(res, {
            keys: [{ ...pair.publicKey.export({ format: "jwk" }), kid: "current" }]
        }), async ({ issuer, config }) => {
            const stale = jwt.sign({ scope: SCOPES.READ },
                pair.privateKey.export({ type: "pkcs1", format: "pem" }),
                {
                    algorithm: "RS256", keyid: "retired", expiresIn: "5m",
                    issuer, audience: RESOURCE, subject: "u"
                });
            const out = await verifyToken(stale, config);
            expect(out.ok).toBe(false);
            expect(out.reason).toMatch(/unknown key id retired/);
        });
    }, 30000);

    it("uses the only key when a token carries no kid at all", async () => {
        const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
        await withJwks((req, res) => json(res, {
            keys: [{ ...pair.publicKey.export({ format: "jwk" }), kid: "only" }]
        }), async ({ issuer, config }) => {
            const noKid = jwt.sign({ scope: SCOPES.READ },
                pair.privateKey.export({ type: "pkcs1", format: "pem" }),
                {
                    algorithm: "RS256", expiresIn: "5m",
                    issuer, audience: RESOURCE, subject: "u"
                });
            expect((await verifyToken(noKid, config)).ok).toBe(true);
        });
    }, 30000);
});

describe("small shapes that are easy to get wrong", () => {
    it("omits error_description when there is nothing to say", () => {
        const config = loadAuthConfig({
            CYBERCHEF_AUTH_ISSUER: "https://i.example.com",
            CYBERCHEF_AUTH_RESOURCE: "https://mcp.example.com/mcp"
        });
        expect(insufficientScopeChallenge(config, [SCOPES.WRITE]))
            .not.toMatch(/error_description/);
    });

    it("does not append a path segment for a root-level resource", () => {
        // RFC 9728 puts the well-known segment before the resource path; with no path there is
        // nothing to append, and emitting a trailing slash would change the URL.
        expect(metadataUrl({ resource: "https://mcp.example.com" }))
            .toBe("https://mcp.example.com/.well-known/oauth-protected-resource");
    });

    it("digests a subject even when the token carries no issuer claim", () => {
        expect(subjectDigest({ sub: "u" })).toMatch(/^[0-9a-f]{16}$/);
    });
});

describe("the auth context contract", () => {
    it("is absent when authorization is off, which is what keeps the default deployment working", async () => {
        const { currentAuth, withAuthContext } = await import("../../src/node/lib/auth.mjs");
        // Outside any context.
        expect(currentAuth()).toBe(null);
        // And explicitly null inside one, which is how the transport signals "unauthenticated
        // deployment" as distinct from "authenticated caller who happens to hold no scopes".
        await withAuthContext(null, async () => {
            expect(currentAuth()).toBe(null);
        });
    });

    it("distinguishes an unauthenticated deployment from a caller with no scopes", async () => {
        const { currentAuth, withAuthContext } = await import("../../src/node/lib/auth.mjs");
        // This is the distinction that broke the HTTP examples: installing `{scopes: []}` for a
        // deployment with no issuer made the dispatch guard fail closed against scopes nobody had
        // configured. A PRESENT context means "hold this caller to their scopes".
        await withAuthContext({ claims: {}, scopes: [], subject: "abc" }, async () => {
            expect(currentAuth()).not.toBe(null);
            expect(currentAuth().scopes).toEqual([]);
        });
    });

    it("keeps two overlapping requests from seeing each other's caller", async () => {
        const { currentAuth, withAuthContext } = await import("../../src/node/lib/auth.mjs");
        // The reason this is AsyncLocalStorage and not a module-level variable. Two concurrent
        // requests is the normal case for an HTTP server, and a shared variable would leak one
        // caller's scopes into the other's authorisation decision.
        const seen = await Promise.all([
            withAuthContext({ subject: "alice", scopes: [SCOPES.READ] }, async () => {
                await new Promise(r => setTimeout(r, 20));
                return currentAuth().subject;
            }),
            withAuthContext({ subject: "bob", scopes: [SCOPES.WRITE] }, async () => {
                await new Promise(r => setTimeout(r, 5));
                return currentAuth().subject;
            })
        ]);
        expect(seen).toEqual(["alice", "bob"]);
    });
});

describe("per-tool authorisation at dispatch, against the real server", () => {
    let asServer;
    let issuer;
    let privateKey;
    let handle;
    let port;
    const KID = "dispatch-key";
    const RESOURCE = "http://127.0.0.1/mcp";

    beforeAll(async () => {
        const { createTransport } = await import("../../src/node/transports.mjs");
        const { createMcpServer } = await import("../../src/node/mcp-server.mjs");

        const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
        privateKey = pair.privateKey.export({ type: "pkcs1", format: "pem" });
        const jwk = pair.publicKey.export({ format: "jwk" });

        asServer = http.createServer((req, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            if (req.url.startsWith("/.well-known/")) {
                res.end(JSON.stringify({ issuer, "jwks_uri": `${issuer}/jwks` }));
            } else {
                res.end(JSON.stringify({ keys: [{ ...jwk, kid: KID, use: "sig", alg: "RS256" }] }));
            }
        });
        await new Promise(r => asServer.listen(0, "127.0.0.1", r));
        issuer = `http://127.0.0.1:${asServer.address().port}`;
        _resetJwksCache();

        handle = await createTransport({
            type: "http", port: 0, createServer: createMcpServer,
            auth: loadAuthConfig({
                CYBERCHEF_AUTH_ISSUER: issuer, CYBERCHEF_AUTH_RESOURCE: RESOURCE
            })
        });
        await new Promise((resolve) => {
            if (handle.httpServer.listening) return resolve();
            handle.httpServer.once("listening", resolve);
        });
        port = handle.httpServer.address().port;
    }, 120000);

    afterAll(async () => {
        if (handle?.closeAll) await handle.closeAll();
        else if (handle?.httpServer) await new Promise(r => handle.httpServer.close(r));
        if (asServer) await new Promise(r => asServer.close(r));
    });

    const mint = (scope) => jwt.sign({ scope }, privateKey, {
        algorithm: "RS256", keyid: KID, expiresIn: "5m",
        issuer, audience: RESOURCE, subject: "u"
    });

    /** Open a session with the given token and call one tool. @returns {Promise<Object>} */
    const callTool = async (token, name, args) => {
        const base = `http://127.0.0.1:${port}/mcp`;
        const headers = {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            authorization: `Bearer ${token}`
        };
        const init = await fetch(base, {
            method: "POST", headers,
            body: JSON.stringify({
                jsonrpc: "2.0", id: 1, method: "initialize",
                params: {
                    protocolVersion: "2025-11-25", capabilities: {},
                    clientInfo: { name: "rbac-test", version: "0.0.0" }
                }
            })
        });
        const sid = init.headers.get("mcp-session-id");
        const res = await fetch(base, {
            method: "POST",
            headers: { ...headers, "mcp-session-id": sid },
            body: JSON.stringify({
                jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args }
            })
        });
        const text = await res.text();
        return { status: res.status, text };
    };

    it("lets a read-scoped token run a pure operation", async () => {
        const out = await callTool(mint(SCOPES.READ), "cyberchef_to_base64", { input: "hi" });
        expect(out.status).toBe(200);
        expect(out.text).toContain("aGk=");
    }, 120000);

    it("REFUSES a read-scoped token a tool that needs write", async () => {
        // `cyberchef_bake` runs a caller-supplied recipe, which may contain any operation, so it
        // is not read-only. This is the check that makes the scope mean something at the tool
        // level rather than only at the door.
        const out = await callTool(mint(SCOPES.READ), "cyberchef_bake",
            { input: "hi", recipe: [{ op: "To Base64" }] });
        expect(out.text).toMatch(/requires scope/);
        expect(out.text).toMatch(/cyberchef:write|cyberchef:network/);
    }, 120000);

    it("carries the challenge in the error, for a transport without headers", async () => {
        const out = await callTool(mint(SCOPES.READ), "cyberchef_recipe_create",
            { name: "x", operations: [{ op: "To Base64" }] });
        expect(out.text).toMatch(/insufficient_scope/);
    }, 120000);

    it("lets a write-scoped token through the same tool", async () => {
        const out = await callTool(mint(`${SCOPES.WRITE} ${SCOPES.NETWORK}`), "cyberchef_bake",
            { input: "hi", recipe: [{ op: "To Base64" }] });
        expect(out.status).toBe(200);
        expect(out.text).toContain("aGk=");
    }, 120000);
});
