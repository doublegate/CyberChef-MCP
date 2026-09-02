/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Tenant isolation.
 *
 * Structured around what actually goes wrong. Validating `tenantOf` in isolation is necessary and
 * cheap, but it is not what protects anyone -- v2.5.0's F-02 was an authorisation bypass in which
 * every unit test passed because each module was individually correct and the wiring was not. So
 * the isolation properties here are asserted against the REAL storage, the REAL cache and the
 * REAL quota tracker, through the same async context the transport installs.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
    loadTenancyConfig, assertTenancyConfig, tenantOf, currentTenant, callerKey, DEFAULT_TENANT
} from "../../src/node/lib/tenancy.mjs";
import { withAuthContext } from "../../src/node/lib/auth.mjs";
import { LRUCache } from "../../src/node/lib/cache.mjs";
import { ResourceQuotaTracker } from "../../src/node/lib/quota.mjs";
import { RecipeStorage } from "../../src/node/recipe-storage.mjs";

/** Run `fn` as a caller belonging to `tenant`. */
function asTenant(tenant, fn) {
    return withAuthContext({ tenant, subject: `subject-of-${tenant}`, scopes: [] }, fn);
}

/** A minimal valid recipe body. */
function recipeNamed(name) {
    return { name, operations: [{ op: "To Base64", args: {} }] };
}

describe("tenancy configuration", () => {
    it("is off unless a claim is named", () => {
        expect(loadTenancyConfig({}).enabled).toBe(false);
        expect(loadTenancyConfig({ CYBERCHEF_TENANT_CLAIM: "tid" }).enabled).toBe(true);
    });

    it("refuses to start when tenancy is configured without authorization", () => {
        // The failure this prevents is silent: without a verified token there is no identity, so
        // every caller would share one tenant while the operator believed otherwise.
        expect(() => assertTenancyConfig(
            { enabled: true, claim: "tid" }, { enabled: false }
        )).toThrow(/CYBERCHEF_AUTH_ISSUER/);
    });

    it("allows authorization without tenancy, and neither without the other", () => {
        expect(() => assertTenancyConfig({ enabled: false }, { enabled: true })).not.toThrow();
        expect(() => assertTenancyConfig({ enabled: false }, { enabled: false })).not.toThrow();
        expect(() => assertTenancyConfig({ enabled: true }, { enabled: true })).not.toThrow();
    });
});

describe("tenantOf", () => {
    const config = { enabled: true, claim: "tid" };

    it("accepts the identifier shapes real authorization servers issue", () => {
        for (const value of [
            "6f9619ff-8b86-d011-b42d-00c04fc964ff",   // Entra tid
            "org_a1B2c3D4",                            // Auth0
            "tenant.example.com",                      // domain
            "urn:acme:eu-west",                        // URN-ish
            42                                         // numeric
        ]) {
            const result = tenantOf({ tid: value }, config);
            expect(result.ok, `${value} should be accepted`).toBe(true);
            expect(result.tenant).toBe(String(value));
        }
    });

    it("refuses a token it cannot place rather than defaulting it", () => {
        // Defaulting would drop an unplaceable caller into the same bucket as everyone else --
        // the exact cross-tenant access this module exists to prevent, reached by being helpful.
        expect(tenantOf({}, config)).toMatchObject({ ok: false });
        expect(tenantOf({ tid: "" }, config)).toMatchObject({ ok: false });
        expect(tenantOf({ tid: "   " }, config)).toMatchObject({ ok: false });
        expect(tenantOf({ tid: { nested: 1 } }, config)).toMatchObject({ ok: false });
        expect(tenantOf({ tid: ["a"] }, config)).toMatchObject({ ok: false });
        expect(tenantOf({ tid: true }, config)).toMatchObject({ ok: false });
    });

    it("rejects path traversal and separators, and does not sanitise them away", () => {
        // Sanitising would be worse than rejecting: rewriting "../../etc" to "etc" maps two
        // distinct tenants onto one key, which is the failure this is meant to prevent.
        for (const hostile of [
            "..", ".", "../../etc/passwd", "a/b", "a\\b", "a%2fb", "a\0b", "a b", "a\nb",
            "a\"b", "a'b", "<script>"
        ]) {
            expect(tenantOf({ tid: hostile }, config).ok, `${JSON.stringify(hostile)}`).toBe(false);
        }
    });

    it("rejects the reserved default tenant name", () => {
        // A token claiming it would land in the bucket every single-tenant deployment uses.
        expect(tenantOf({ tid: DEFAULT_TENANT }, config).ok).toBe(false);
    });

    it("caps length so a claim cannot inflate every key the server writes", () => {
        expect(tenantOf({ tid: "a".repeat(128) }, config).ok).toBe(true);
        expect(tenantOf({ tid: "a".repeat(129) }, config).ok).toBe(false);
    });

    it("returns the default tenant when tenancy is disabled", () => {
        expect(tenantOf({ tid: "acme" }, { enabled: false })).toEqual({
            ok: true, tenant: DEFAULT_TENANT
        });
    });
});

describe("request context", () => {
    it("is the default tenant outside any authenticated request", () => {
        // stdio, and every existing deployment.
        expect(currentTenant()).toBe(DEFAULT_TENANT);
        expect(callerKey()).toBe(DEFAULT_TENANT);
    });

    it("carries the tenant through async work", async () => {
        await asTenant("acme", async () => {
            await new Promise(resolve => setTimeout(resolve, 1));
            expect(currentTenant()).toBe("acme");
            expect(callerKey()).toBe("acme|subject-of-acme");
        });
    });

    it("keeps two overlapping requests separate", async () => {
        // The case a module-level "current tenant" variable gets wrong, and the reason this uses
        // AsyncLocalStorage: on an HTTP server, overlapping requests are the normal case.
        const seen = [];
        await Promise.all([
            asTenant("alpha", async () => {
                await new Promise(resolve => setTimeout(resolve, 5));
                seen.push(currentTenant());
            }),
            asTenant("beta", async () => {
                seen.push(currentTenant());
            })
        ]);
        expect(seen.sort()).toEqual(["alpha", "beta"]);
    });
});

describe("cache isolation", () => {
    it("gives different tenants different keys for identical work", () => {
        const cache = new LRUCache();
        const a = cache.getCacheKey("To Base64", "secret", [], "alpha");
        const b = cache.getCacheKey("To Base64", "secret", [], "beta");
        expect(a).not.toBe(b);
    });

    it("gives the same tenant the same key, so caching still works", () => {
        const cache = new LRUCache();
        expect(cache.getCacheKey("To Base64", "x", [], "alpha"))
            .toBe(cache.getCacheKey("To Base64", "x", [], "alpha"));
    });

    it("closes the timing side channel end to end", () => {
        // Not a key comparison: the property that matters is that one tenant's stored result is
        // not reachable by another, because a hit is fast and a miss is not.
        const cache = new LRUCache();
        const key = cache.getCacheKey("To Base64", "sample", [], "alpha");
        cache.set(key, "ANSWER-FOR-ALPHA");

        expect(cache.get(cache.getCacheKey("To Base64", "sample", [], "alpha")))
            .toBe("ANSWER-FOR-ALPHA");
        expect(cache.get(cache.getCacheKey("To Base64", "sample", [], "beta")))
            .toBeNull();
    });

    it("cannot be collided by splitting characters between tenant and operation", () => {
        // Length-prefixing the tenant is what makes this hold: without it, ("ab","cd") and
        // ("abc","d") concatenate identically.
        const cache = new LRUCache();
        expect(cache.getCacheKey("cd", "x", [], "ab"))
            .not.toBe(cache.getCacheKey("d", "x", [], "abc"));
    });

    it("defaults to the default tenant, preserving pre-v2.5.0 behaviour", () => {
        const cache = new LRUCache();
        expect(cache.getCacheKey("To Base64", "x", []))
            .toBe(cache.getCacheKey("To Base64", "x", [], DEFAULT_TENANT));
    });
});

describe("quota isolation", () => {
    it("does not let one tenant exhaust another's capacity", () => {
        const quota = new ResourceQuotaTracker();
        const limit = quota.maxConcurrentOps;

        for (let i = 0; i < limit; i++) {
            expect(quota.acquire("alpha"), `alpha slot ${i}`).toBe(true);
        }
        // alpha is full...
        expect(quota.acquire("alpha")).toBe(false);
        // ...and beta is entirely unaffected. Before this, the pool was shared, so one busy
        // tenant denied service to every other by ordinary use.
        expect(quota.acquire("beta")).toBe(true);
    });

    it("returns slots to the right tenant", () => {
        const quota = new ResourceQuotaTracker();
        const limit = quota.maxConcurrentOps;
        for (let i = 0; i < limit; i++) quota.acquire("alpha");
        expect(quota.acquire("alpha")).toBe(false);

        quota.release("alpha");
        expect(quota.acquire("alpha")).toBe(true);
    });

    it("forgets tenants once they are idle", () => {
        const quota = new ResourceQuotaTracker();
        quota.acquire("transient");
        expect(quota.getInfo().activeTenants).toBe(1);
        quota.release("transient");
        expect(quota.getInfo().activeTenants).toBe(0);
    });
});

describe("recipe isolation", () => {
    let dir, storage;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "cyberchef-tenancy-"));
        storage = new RecipeStorage(join(dir, "recipes.json"));
        await storage.initialize();
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("hides one tenant's recipes from another", async () => {
        const mine = await asTenant("alpha", () => storage.create(recipeNamed("alpha-secret")));

        const theirs = await asTenant("beta", () => storage.getAll());
        expect(theirs).toEqual([]);
        expect(await asTenant("beta", () => storage.getById(mine.id))).toBeNull();
        expect(await asTenant("beta", () => storage.exists(mine.id))).toBe(false);

        // ...and the owner still sees it.
        expect(await asTenant("alpha", () => storage.getAll())).toHaveLength(1);
    });

    it("reports another tenant's recipe as absent rather than forbidden", async () => {
        // "Forbidden" would confirm the id exists, turning lookup into an enumeration oracle.
        const mine = await asTenant("alpha", () => storage.create(recipeNamed("alpha-secret")));
        await expect(asTenant("beta", () => storage.update(mine.id, { name: "hijacked" })))
            .rejects.toThrow(/not found/i);
    });

    it("refuses cross-tenant deletion", async () => {
        const mine = await asTenant("alpha", () => storage.create(recipeNamed("alpha-secret")));
        expect(await asTenant("beta", () => storage.delete(mine.id))).toBe(false);
        // Still there, unmodified.
        expect(await asTenant("alpha", () => storage.getById(mine.id))).toMatchObject({
            name: "alpha-secret"
        });
    });

    it("does not let an update reassign ownership", async () => {
        const mine = await asTenant("alpha", () => storage.create(recipeNamed("alpha-secret")));
        await asTenant("alpha", () => storage.update(mine.id, { tenant: "beta" }));
        // The donation must not have happened: beta still cannot see it, alpha still can.
        expect(await asTenant("beta", () => storage.getById(mine.id))).toBeNull();
        expect(await asTenant("alpha", () => storage.getById(mine.id))).not.toBeNull();
    });

    it("scopes clear() to the caller, so it cannot destroy another tenant's work", async () => {
        await asTenant("alpha", () => storage.create(recipeNamed("alpha-keeps-this")));
        await asTenant("beta", () => storage.create(recipeNamed("beta-clears-this")));

        await asTenant("beta", () => storage.clear());

        expect(await asTenant("beta", () => storage.getAll())).toEqual([]);
        expect(await asTenant("alpha", () => storage.getAll())).toHaveLength(1);
    });

    it("does not leak tags and categories through getStats", async () => {
        // Tags are free text the user wrote -- client names, case numbers. The labels are content,
        // not just a count.
        await asTenant("alpha", () => storage.create({
            ...recipeNamed("alpha-case"),
            tags: ["operation-nightingale"],
            metadata: { category: "alpha-only" }
        }));

        const stats = await asTenant("beta", () => storage.getStats());
        expect(stats.totalRecipes).toBe(0);
        expect(stats.tags).toEqual([]);
        expect(stats.categories).toEqual([]);
    });

    it("counts the storage cap per tenant", async () => {
        // A shared cap lets the first tenant to fill it stop everyone else saving anything.
        const alphaStats = await asTenant("alpha", () => storage.getStats());
        expect(alphaStats.totalRecipes).toBe(0);
        await asTenant("alpha", () => storage.create(recipeNamed("one")));
        expect((await asTenant("beta", () => storage.getStats())).totalRecipes).toBe(0);
    });

    it("keeps recipes written before v2.5.0 visible to their owner", async () => {
        // The upgrade path. A pre-tenancy recipe has no `tenant` field; treating that as "owned by
        // nobody" would leave the file intact on disk and every list empty.
        const legacy = await storage.create(recipeNamed("written-before-tenancy"));
        expect(legacy.tenant).toBeUndefined();

        expect(await storage.getAll()).toHaveLength(1);
        expect(await storage.getById(legacy.id)).not.toBeNull();
        // ...and it is not visible to a named tenant.
        expect(await asTenant("beta", () => storage.getById(legacy.id))).toBeNull();
    });

    it("stamps ownership from the context, not from the caller's payload", async () => {
        // `create` must ignore a tenant supplied in the body.
        const planted = await asTenant("alpha", () => storage.create({
            ...recipeNamed("planted"), tenant: "beta"
        }));
        expect(planted.tenant).toBe("alpha");
        expect(await asTenant("beta", () => storage.getById(planted.id))).toBeNull();
    });

    it("ignores a caller-supplied tenant in SINGLE-TENANT mode too", async () => {
        // The case the test above missed, and the bug it hid. In single-tenant mode there is no
        // server value to stamp -- the record deliberately carries no `tenant` field -- so an
        // override applied "after the caller's fields" had nothing to override with, and the
        // payload's value survived.
        //
        // Measured before the fix: the recipe was stored with tenant "attacker" and was then
        // INVISIBLE TO ITS OWN CREATOR, because `ownedBy` compared "attacker" against "default".
        const planted = await storage.create({
            ...recipeNamed("planted-single-tenant"), tenant: "attacker"
        });
        expect(planted.tenant).toBeUndefined();
        expect(await storage.getAll()).toHaveLength(1);
        expect(await storage.getById(planted.id)).not.toBeNull();
    });

    it("ignores a caller-supplied tenant when updating a LEGACY recipe", async () => {
        // A legacy recipe has no `tenant` field, so "preserve the stored tenant" preserved
        // nothing and the caller's value went straight through.
        //
        // Measured before the fix: the recipe was reassigned to "attacker" and DISAPPEARED from
        // its owner's view -- any caller could make any legacy recipe vanish by updating it.
        const legacy = await storage.create(recipeNamed("legacy-no-tenant"));
        expect(legacy.tenant).toBeUndefined();

        const after = await storage.update(legacy.id, { tenant: "attacker", name: "renamed" });
        expect(after.tenant).toBeUndefined();
        expect(after.name).toBe("renamed");          // the legitimate part of the update applied
        expect(await storage.getById(legacy.id)).not.toBeNull();
    });
});
