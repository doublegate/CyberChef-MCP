/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Offline mode.
 *
 * The point of this suite is COVERAGE OF PATHS, not of lines. There is no single choke point into
 * the engine -- `bakeOnCore`, `executeInWorker` and the Node API's `bake` are three separate
 * entries -- so a guard verified on the obvious one proves nothing about the other two.
 *
 * That is not hypothetical here. In v2.5.0 the authorisation check sat below the meta-tool
 * branches, so `cyberchef_bake` skipped it entirely: every unit test passed, the annotations were
 * right, the scope maths was right, and the guard was simply never reached. A guard in the wrong
 * place is indistinguishable from no guard.
 *
 * So each test below names the path it walks.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
    offlineMode, networkOperationsIn, assertOfflineAllowed
} from "../../src/node/lib/offline.mjs";
import { NETWORK_OPERATIONS } from "../../src/node/lib/tool-annotations.mjs";
import { bakeOnCore } from "../../src/node/lib/core-recipe.mjs";

/** Turn offline mode on for one test. */
function offline() {
    process.env.CYBERCHEF_OFFLINE = "true";
}

beforeEach(() => {
    delete process.env.CYBERCHEF_OFFLINE;
});
afterEach(() => {
    delete process.env.CYBERCHEF_OFFLINE;
});

describe("the switch", () => {
    it("is off unless the value is exactly \"true\"", () => {
        expect(offlineMode({})).toBe(false);
        expect(offlineMode({ CYBERCHEF_OFFLINE: "false" })).toBe(false);
        expect(offlineMode({ CYBERCHEF_OFFLINE: "1" })).toBe(false);
        expect(offlineMode({ CYBERCHEF_OFFLINE: "TRUE" })).toBe(false);
        expect(offlineMode({ CYBERCHEF_OFFLINE: "true" })).toBe(true);
    });

    it("is read per call, not captured at import", () => {
        // So a deployment cannot end up with a stale copy of its own configuration, and so a test
        // does not have to reset the module graph to change it.
        expect(offlineMode()).toBe(false);
        offline();
        expect(offlineMode()).toBe(true);
    });
});

describe("detecting network operations in a recipe", () => {
    it("finds them in every recipe shape the server accepts", () => {
        expect(networkOperationsIn([{ op: "HTTP request" }])).toEqual(["HTTP request"]);
        expect(networkOperationsIn({ op: "DNS over HTTPS" })).toEqual(["DNS over HTTPS"]);
        expect(networkOperationsIn("HTTP request")).toEqual(["HTTP request"]);
        expect(networkOperationsIn([{ operation: "HTTP request" }])).toEqual(["HTTP request"]);
        expect(networkOperationsIn([{ name: "HTTP request" }])).toEqual(["HTTP request"]);
    });

    it("finds one buried among ordinary operations", () => {
        // The realistic case. A recipe is a pipeline, so the network step is rarely first.
        const recipe = [
            { op: "From Base64" },
            { op: "HTTP request" },
            { op: "To Hex" }
        ];
        expect(networkOperationsIn(recipe)).toEqual(["HTTP request"]);
    });

    it("returns nothing for a recipe that stays in-process", () => {
        expect(networkOperationsIn([{ op: "To Base64" }, { op: "MD5" }])).toEqual([]);
        expect(networkOperationsIn([])).toEqual([]);
        expect(networkOperationsIn(null)).toEqual([]);
        expect(networkOperationsIn(undefined)).toEqual([]);
    });

    it("reads the same set the annotations advertise", () => {
        // One source of truth. An offline switch refusing a different list from the one
        // `openWorldHint` advertises would tell clients one thing and do another.
        expect([...NETWORK_OPERATIONS].sort()).toEqual(["DNS over HTTPS", "HTTP request"]);
        for (const op of NETWORK_OPERATIONS) {
            expect(networkOperationsIn([{ op }])).toEqual([op]);
        }
    });
});

describe("the assertion", () => {
    it("does nothing at all when offline mode is off", () => {
        // The default. A network operation is perfectly legal on a connected deployment.
        expect(() => assertOfflineAllowed([{ op: "HTTP request" }])).not.toThrow();
    });

    it("refuses a network operation when offline mode is on", () => {
        offline();
        expect(() => assertOfflineAllowed([{ op: "HTTP request" }]))
            .toThrow(/offline mode is enabled/i);
    });

    it("allows an ordinary recipe when offline mode is on", () => {
        // The claim the whole feature rests on: 502 of 504 operations are unaffected.
        offline();
        expect(() => assertOfflineAllowed([{ op: "To Base64" }, { op: "MD5" }])).not.toThrow();
    });

    it("names the offending operations and nothing else", () => {
        offline();
        try {
            assertOfflineAllowed([{ op: "HTTP request", args: { url: "https://secret.internal/x" } }]);
            throw new Error("should have refused");
        } catch (err) {
            expect(err.context.offlineOperations).toEqual(["HTTP request"]);
            // The arguments are NOT in the error. A refused `HTTP request` carries the caller's
            // URL, and an error message is a place data leaks into logs -- the same rule the audit
            // trail and the OpenTelemetry attributes follow.
            const serialised = JSON.stringify(err.context) + err.message;
            expect(serialised).not.toContain("secret.internal");
        }
    });

    it("carries a structured code, not a bare Error", () => {
        offline();
        try {
            assertOfflineAllowed([{ op: "DNS over HTTPS" }]);
            throw new Error("should have refused");
        } catch (err) {
            expect(err.code).toBe("INVALID_INPUT");
        }
    });
});

describe("every engine entry is guarded", () => {
    // ONE test per path. The list came from tracing the call graph, not from guessing:
    //   1. bakeOnCore      -- cyberchef_bake, cyberchef_batch, registry tools, streaming
    //   2. the direct-operation branch in mcp-server -- guarded above the worker/streaming split
    //   3. the Node API `bake` in recipe-manager -- saved-recipe execute AND test

    it("PATH 1: bakeOnCore refuses a recipe carrying a network operation", async () => {
        offline();
        await expect(bakeOnCore("x", [{ op: "HTTP request" }]))
            .rejects.toThrow(/offline mode is enabled/i);
    });

    it("PATH 1: bakeOnCore still runs an ordinary recipe while offline", async () => {
        // The gate must be invisible to the 502. A false positive here breaks every air-gapped
        // deployment for no benefit.
        offline();
        const out = await bakeOnCore("Hello", [{ op: "To Base64" }]);
        expect(String(out)).toContain("SGVsbG8=");
    });

    it("PATH 1: catches a network operation buried mid-recipe", async () => {
        // A check that only looked at the first step would pass this and make the call anyway.
        offline();
        await expect(bakeOnCore("x", [{ op: "To Base64" }, { op: "HTTP request" }]))
            .rejects.toThrow(/offline mode is enabled/i);
    });

    it("PATH 2 + 3: the guard is present at every entry the call graph reaches", async () => {
        // Asserted structurally rather than by driving a worker pool and a recipe store, because
        // what actually failed in v2.5.0 was a guard MISSING from a branch -- and that is a
        // property of where the calls are, which this can check exhaustively and cheaply.
        const { readFileSync } = await import("node:fs");
        const guarded = {
            "src/node/lib/core-recipe.mjs": 1,   // bakeOnCore
            "src/node/mcp-server.mjs": 1,        // direct-operation branch
            "src/node/recipe-manager.mjs": 2     // execute AND test
        };
        for (const [file, expected] of Object.entries(guarded)) {
            const src = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
            const calls = (src.match(/assertOfflineAllowed\(/g) || []).length;
            expect(calls, `${file} lost an offline guard`).toBe(expected);
        }
    });

    it("PATH 2: the direct-operation guard sits above the CACHE, not just the worker split", async () => {
        // Position is the correctness argument, exactly as it was for the v2.5.0 scope check --
        // and the first version of this test asserted the WRONG CEILING.
        //
        // It required the guard to precede the worker/streaming split, which it did, and that
        // proved nothing: a cache hit returns from a branch ABOVE the split, so a cached
        // `HTTP request` was served with offline mode on. The ceiling is not "before execution",
        // it is "before anything that can answer the request" -- and a cache answers without
        // executing.
        const { readFileSync } = await import("node:fs");
        const src = readFileSync(new URL("../../src/node/mcp-server.mjs", import.meta.url), "utf8");
        const guard = src.indexOf("assertOfflineAllowed([{ op: opName }], { tool: name })");
        const cacheRead = src.indexOf("cached = operationCache.get(cacheKey)");
        const workerSplit = src.indexOf("if (ENABLE_WORKERS && shouldUseWorker(");
        expect(guard).toBeGreaterThan(-1);
        expect(cacheRead).toBeGreaterThan(-1);
        expect(workerSplit).toBeGreaterThan(-1);
        expect(guard, "guard must precede the cache read").toBeLessThan(cacheRead);
        expect(guard, "guard must precede the worker split").toBeLessThan(workerSplit);
    });

    it("PATH 2: the cache is never consulted for a refused network operation", async () => {
        // The RUNTIME regression for the cache bypass, and the SECOND attempt at it.
        //
        // The first version warmed the cache with a hand-built key and asserted the refusal. It
        // passed with the bug deliberately reintroduced -- because the key it built did not match
        // the one the handler computes (the real `recipeArgs` for `HTTP request` are its resolved
        // defaults, not `[]`), so there was never a cache hit to bypass. It asserted a refusal
        // that came from the guard on the ordinary miss path: a test for cache ordering that never
        // involved the cache.
        //
        // Asserting the ORDERING directly removes the guesswork. If the guard precedes the cache
        // read, `operationCache.get` cannot have been called -- true regardless of how the key is
        // constructed, which is precisely the detail that made the first attempt useless.
        const { createMcpServer, operationCache } =
            await import("../../src/node/mcp-server.mjs");

        const getSpy = vi.spyOn(operationCache, "get");
        offline();

        const server = createMcpServer();
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "offline-test", version: "1.0.0" }, { capabilities: {} });
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        try {
            const res = await client.callTool({
                name: "cyberchef_http_request",
                arguments: { input: "https://example.test/" }
            });
            expect(JSON.stringify(res)).toMatch(/offline mode is enabled/i);

            // The decisive assertion. A cached `HTTP request` body is a REAL RESPONSE FROM THE
            // NETWORK; serving one to a caller told this deployment cannot reach a network is
            // worse than an ordinary bypass, because it is evidence that it can.
            expect(getSpy, "the cache was read before the offline guard refused")
                .not.toHaveBeenCalled();
        } finally {
            getSpy.mockRestore();
            await client.close();
            await server.close();
            operationCache.clear();
        }
    });
});

describe("what offline mode does not claim", () => {
    it("is a posture, not a sandbox", () => {
        // Stated as a test so the limitation is part of the record rather than only a comment.
        // It refuses operations this server KNOWS to be networked; it cannot stop a process from
        // opening a socket. Enforcement belongs in the network namespace -- a NetworkPolicy, or a
        // container with no route out.
        offline();
        // An operation the server does not know about is not refused, by construction.
        expect(() => assertOfflineAllowed([{ op: "To Base64" }])).not.toThrow();
        expect(NETWORK_OPERATIONS.size).toBe(2);
    });
});
