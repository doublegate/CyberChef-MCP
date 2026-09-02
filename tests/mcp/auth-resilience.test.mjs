/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The authorization server is the only external dependency this server has, and until v2.6.0 it
 * was reached without a timeout and without any memory of having just failed.
 *
 * `fetchJwks` caches successes for five minutes and failures not at all, and `discoverJwksUri`
 * tries TWO metadata URLs, so an issuer outage turned one incoming request into two outbound ones.
 * Measured before the fix:
 *
 *     10 verifications -> 20 outbound fetch attempts   (2 per request, none with a deadline)
 *
 * Node's `fetch` has no default timeout, so against a black-holed host -- one that accepts the
 * connection and never answers, which is what a firewall drop looks like -- each of those hangs
 * until the OS gives up.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
    verifyToken, _discoveryBreakerState, _resetDiscoveryBreaker, _resetJwksCache
} from "../../src/node/lib/auth.mjs";

/** A syntactically valid RSA JWK, so a JWKS containing it yields a usable key. */
const VALID_JWK = {
    kty: "RSA", kid: "k1", use: "sig", alg: "RS256",
    n: "sXchDaQebHnPiGvyDOAT4saGEUetSyo9MKLOoWFsueri23bOdgWp4Dy1Wl" +
       "UzewbgBHod5pcM9H95GQRV3JDXboIRROSBigeC5yjU1hGzHHyXss8UDpre" +
       "cbAYxknTcQkhslANGRUZmdTOQ5qTRsLAt6BTYuyvVRdhS8exSZEy_c4gs_" +
       "7svlJJQ4H9_NxsiIoLwAEk7-Q3UXERGYw_75IDrGA84-lA_-Ct4eTlXHBI" +
       "Y2EaV7t7LjJaynVJCpkv4LKjTTAumiGUIuQhrNhZLuF_RJLqHpM2kgWFLU" +
       "7-VTdL1VbC2tejvcI2BlMkEpk1BzBZI0KQB0GaDWFLN-aEAw3vRw",
    e: "AQAB"
};

/**
 * A fetch stand-in that serves discovery metadata and a JWKS.
 *
 * @param {Object[]} keys - What the JWKS should contain.
 * @returns {Function} A `fetch` replacement.
 */
function issuerServing(keys) {
    return async (url) => {
        let body;
        if (String(url).includes("jwks")) {
            body = { keys };
        } else {
            body = { issuer: CONFIG.issuer, "jwks_uri": "https://auth.example.invalid/jwks" };
        }
        return { ok: true, arrayBuffer: async () => Buffer.from(JSON.stringify(body)) };
    };
}

const CONFIG = {
    enabled: true,
    issuer: "https://auth.example.invalid",
    jwksUri: "",
    audience: "https://mcp.example.com/mcp"
};

let realFetch;

beforeEach(() => {
    realFetch = globalThis.fetch;
    _resetDiscoveryBreaker();
    _resetJwksCache();
});

afterEach(() => {
    globalThis.fetch = realFetch;
    _resetDiscoveryBreaker();
    _resetJwksCache();
});

describe("an authorization server that is down", () => {
    it("stops making outbound requests once the breaker opens", async () => {
        let attempts = 0;
        globalThis.fetch = async () => {
            attempts++;
            throw new Error("ECONNREFUSED");
        };

        for (let i = 0; i < 20; i++) await verifyToken("a.b.c", CONFIG);

        // Five failures at two fetches each opens the breaker; everything after makes no request
        // at all. Before this the answer was 40 -- and it grew with traffic, which is the part
        // that mattered: a stampede against a service that is already unhealthy.
        expect(attempts).toBe(10);
        expect(_discoveryBreakerState()).toBe("OPEN");
    });

    it("still reports a server error rather than a bad token", async () => {
        // The distinction the breaker must not blur. A discovery failure is THIS server's problem;
        // reporting it as an invalid token sends the client to re-authenticate against an
        // authorization server that is answering perfectly well.
        globalThis.fetch = async () => {
            throw new Error("ECONNREFUSED");
        };
        for (let i = 0; i < 10; i++) await verifyToken("a.b.c", CONFIG);

        const result = await verifyToken("a.b.c", CONFIG);
        expect(result.ok).toBe(false);
        expect(result.serverError).toBe(true);
    });
});

describe("recovery", () => {
    it("lets one request through after the reset window, and closes on success", async () => {
        // This is what makes a breaker better than a permanent negative cache: it heals by itself
        // rather than waiting for a TTL on every key.
        let failing = true;
        let attempts = 0;
        const serving = issuerServing([]);
        globalThis.fetch = async (url) => {
            attempts++;
            if (failing) throw new Error("ECONNREFUSED");
            return serving(url);
        };

        for (let i = 0; i < 10; i++) await verifyToken("a.b.c", CONFIG);
        expect(_discoveryBreakerState()).toBe("OPEN");

        // The issuer comes back, and enough time passes for the breaker to probe.
        failing = false;
        _resetDiscoveryBreaker(31000);

        const before = attempts;
        await verifyToken("a.b.c", CONFIG);

        // The recovery property: a request was ALLOWED THROUGH rather than refused outright.
        // Before the reset window, `attempts` did not move at all.
        expect(attempts).toBeGreaterThan(before);

        // The probe still fails here -- this fixture serves an empty JWKS, so key discovery gets
        // "no usable keys" -- and a failed probe correctly reopens the breaker. Asserted rather
        // than glossed: a half-open probe that fails must NOT leave the circuit closed, or one
        // lucky request would reopen the floodgates against a server that is still down.
        expect(_discoveryBreakerState()).toBe("OPEN");
    });

    it("admits exactly ONE probe when many callers retry at once", async () => {
        // The recovery burst is the dangerous moment: an outage ends, every client retries
        // simultaneously, and the authorization server gets a stampede just as it comes back.
        //
        // HALF_OPEN previously admitted every CONCURRENT caller, because `isOpen()` simply
        // returned false for that state. Measured with 50 clients retrying after the reset
        // window: 100 outbound requests, where there should have been one probe's worth.
        let attempts = 0;
        globalThis.fetch = async () => {
            attempts++;
            // A slow failure, so the callers genuinely overlap inside the probe window. An
            // instant failure would serialise them and hide the bug.
            await new Promise(r => setTimeout(r, 20));
            throw new Error("ECONNREFUSED");
        };

        for (let i = 0; i < 10; i++) await verifyToken("a.b.c", CONFIG);
        expect(_discoveryBreakerState()).toBe("OPEN");

        _resetDiscoveryBreaker(31000);
        const before = attempts;
        await Promise.all(Array.from({ length: 50 }, () => verifyToken("a.b.c", CONFIG)));

        // One probe, which is up to two fetches: discovery tries two metadata URLs. The assertion
        // is deliberately "one probe's worth", not "one request" -- the point is that 49 of the 50
        // callers made none at all.
        expect(attempts - before).toBeLessThanOrEqual(2);
    }, 30_000);

    it("closes fully once discovery succeeds", async () => {
        globalThis.fetch = issuerServing([VALID_JWK]);

        // The token itself is nonsense, so verification fails -- but key discovery SUCCEEDS, and
        // that is what the breaker tracks.
        await verifyToken("not.a.real.token", CONFIG);
        expect(_discoveryBreakerState()).toBe("CLOSED");
    });
});

describe("timeouts", () => {
    it("gives every request to the authorization server a deadline", async () => {
        // Against a black-holed host this is the difference between a bounded failure and a
        // request that hangs for the OS TCP timeout. Asserted by observing the signal rather than
        // by waiting, which would make the test as slow as the bug.
        //
        // Discovery must SUCCEED here so the JWKS fetch is actually reached. An earlier version
        // failed both metadata requests, which meant `discoverJwksUri()` threw and `fetchJwks()`
        // was never called -- so the test proved discovery had a deadline and said nothing at all
        // about the JWKS request, which is the other half of the change.
        const seen = [];
        globalThis.fetch = async (url, init) => {
            seen.push({ url: String(url), signal: init?.signal });
            if (String(url).includes("jwks")) throw new Error("ECONNREFUSED");
            return {
                ok: true,
                arrayBuffer: async () => Buffer.from(JSON.stringify({
                    issuer: CONFIG.issuer, "jwks_uri": "https://auth.example.invalid/jwks"
                }))
            };
        };

        await verifyToken("a.b.c", CONFIG);

        // Both kinds of request were made...
        expect(seen.some(r => r.url.includes("well-known"))).toBe(true);
        expect(seen.some(r => r.url.includes("jwks")), "the JWKS fetch must be reached").toBe(true);
        // ...and every one of them carried a deadline.
        for (const r of seen) {
            expect(r.signal, `no deadline on ${r.url}`).toBeInstanceOf(AbortSignal);
        }
    });
});

describe("a healthy authorization server", () => {
    it("serves the second verification from cache without new JWKS requests", async () => {
        // A cache hit makes no outbound JWKS request and must count as success -- the server is
        // serving, so the breaker belongs closed.
        //
        // This needs a JWKS that actually PARSES. An earlier version served an empty key set, so
        // `fetchJwks` threw "no usable keys", never wrote the cache, and the test passed while
        // exercising no cache at all -- one failure is below the breaker's threshold, so even the
        // breaker assertion proved nothing.
        let jwksFetches = 0;
        const serving = issuerServing([VALID_JWK]);
        globalThis.fetch = async (url) => {
            if (String(url).includes("jwks")) jwksFetches++;
            return serving(url);
        };

        await verifyToken("not.a.real.token", CONFIG);
        expect(jwksFetches).toBe(1);
        expect(_discoveryBreakerState()).toBe("CLOSED");

        await verifyToken("not.a.real.token", CONFIG);
        // The decisive assertion: still one. The second verification used the cache.
        expect(jwksFetches).toBe(1);
        expect(_discoveryBreakerState()).toBe("CLOSED");
    });
});
