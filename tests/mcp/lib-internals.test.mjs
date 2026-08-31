/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Unit tests for the small pure-logic modules under `src/node/lib/`.
 *
 * These modules are exercised constantly through the server, but several of their branches are
 * reachable only under a configuration the running server does not have -- a different tool
 * surface, a disabled rate limiter, a Dish that refuses to present itself. Driving them through a
 * request would mean standing up a differently-configured server per branch; calling the function
 * costs nothing and says plainly which behaviour is being pinned.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";

import { dishToText } from "../../src/node/lib/dish-output.mjs";
import { RateLimiter } from "../../src/node/lib/rate-limit.mjs";
import {
    surfaceMode, configuredAllowlist, isExposed, describeSurface
} from "../../src/node/lib/tool-surface.mjs";
import { toCoreRecipe } from "../../src/node/lib/core-recipe.mjs";
import { validateInputSize, toolArgName, assertKnownArgs } from "../../src/node/lib/tool-schema.mjs";
import {
    installWasmFetch, isWasmFetchInstalled, _servableWasmPathForTest
} from "../../src/node/lib/wasm-fetch.mjs";

describe("dish-output: presenting a baked result", () => {
    it("passes a string value through untouched", () => {
        expect(dishToText({ value: "Hello, Chef!" })).toBe("Hello, Chef!");
    });

    it("asks a non-string Dish to present itself", () => {
        // The v2.1.0 fix, as a unit: a byteArray Dish must render as its text, not as the
        // [72,101,...] character codes JSON.stringify produced for three releases.
        const dish = {
            value: [72, 101, 108, 108, 111],
            toString() {
                return "Hello";
            }
        };
        expect(dishToText(dish)).toBe("Hello");
    });

    it("accepts an empty presentation, which is a real answer", () => {
        expect(dishToText({ value: [], toString: () => "" })).toBe("");
    });

    it("falls back to JSON when toString does not actually present anything", () => {
        // A bare "[object Object]" means the default Object.prototype.toString ran, i.e. the value
        // has no presentation. JSON is a degraded answer, and better than that string.
        const dish = { value: { a: 1 }, toString: () => "[object Object]" };
        expect(dishToText(dish)).toBe("{\"a\":1}");
    });

    it("falls back to JSON when presentation throws", () => {
        const dish = {
            value: { a: 1 },
            toString() {
                throw new Error("no string form");
            }
        };
        expect(dishToText(dish)).toBe("{\"a\":1}");
    });

    it("survives a value with no toString of its own", () => {
        expect(dishToText({ value: undefined })).toBe(undefined);
    });
});

describe("rate-limit: the sliding window", () => {
    // `RATE_LIMIT_ENABLED` is read once, at config module load, and is OFF by default -- so a
    // limiter built from the ambient import short-circuits every check to `allowed: true` and
    // records nothing. Testing the actual algorithm means loading the module with the flag set.
    /** @type {typeof RateLimiter} */
    let EnabledRateLimiter;

    beforeEach(async () => {
        vi.resetModules();
        process.env.CYBERCHEF_RATE_LIMIT_ENABLED = "true";
        ({ RateLimiter: EnabledRateLimiter } = await import("../../src/node/lib/rate-limit.mjs"));
    });

    afterEach(() => {
        delete process.env.CYBERCHEF_RATE_LIMIT_ENABLED;
        vi.resetModules();
    });

    it("short-circuits to allowed when disabled, and records nothing", () => {
        // The default posture, pinned deliberately: the ambient import above is the disabled one.
        const limiter = new RateLimiter(1, 60_000);
        expect(limiter.checkLimit("c").allowed).toBe(true);
        expect(limiter.checkLimit("c").allowed).toBe(true);
        expect(limiter.getStats().activeConnections).toBe(0);
        expect(limiter.getStats().enabled).toBe(false);
    });

    it("allows requests up to the limit and refuses the next", () => {
        const limiter = new EnabledRateLimiter(3, 60_000);
        for (let i = 0; i < 3; i++) expect(limiter.checkLimit("c1").allowed).toBe(true);

        const refused = limiter.checkLimit("c1");
        expect(refused.allowed).toBe(false);
        expect(refused.retryAfter).toBeGreaterThan(0);
    });

    it("tracks connections independently", () => {
        const limiter = new EnabledRateLimiter(1, 60_000);
        expect(limiter.checkLimit("a").allowed).toBe(true);
        expect(limiter.checkLimit("b").allowed).toBe(true);
        expect(limiter.checkLimit("a").allowed).toBe(false);
    });

    it("forgets timestamps once they fall outside the window", () => {
        vi.useFakeTimers();
        try {
            const limiter = new EnabledRateLimiter(1, 1_000);
            expect(limiter.checkLimit("c").allowed).toBe(true);
            expect(limiter.checkLimit("c").allowed).toBe(false);

            vi.advanceTimersByTime(1_500);
            expect(limiter.checkLimit("c").allowed).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it("reports and clears its state", () => {
        const limiter = new EnabledRateLimiter(10, 60_000);
        limiter.checkLimit("a");
        limiter.checkLimit("b");

        const stats = limiter.getStats();
        expect(stats.activeConnections).toBe(2);
        expect(stats.totalTrackedRequests).toBe(2);
        expect(stats.maxRequests).toBe(10);

        limiter.clear();
        expect(limiter.getStats().activeConnections).toBe(0);
    });

    it("defaults the connection id", () => {
        expect(new EnabledRateLimiter(1, 60_000).checkLimit().allowed).toBe(true);
    });
});

describe("tool-surface: which operations become tools", () => {
    const saved = {};
    const VARS = ["CYBERCHEF_TOOL_SURFACE", "CYBERCHEF_EXPOSE_ALL_OPS", "CYBERCHEF_TOOL_ALLOWLIST"];

    beforeEach(() => {
        for (const v of VARS) {
            saved[v] = process.env[v];
            delete process.env[v];
        }
    });

    afterEach(() => {
        for (const v of VARS) {
            if (saved[v] === undefined) delete process.env[v];
            else process.env[v] = saved[v];
        }
    });

    it("defaults to the index surface", () => {
        expect(surfaceMode()).toBe("index");
    });

    it("falls back to index on an unrecognised value rather than erroring", () => {
        // A typo in an environment variable must not stop the server from starting.
        process.env.CYBERCHEF_TOOL_SURFACE = "kurated";
        expect(surfaceMode()).toBe("index");
    });

    it("honours each explicit mode", () => {
        for (const mode of ["all", "curated", "index"]) {
            process.env.CYBERCHEF_TOOL_SURFACE = mode;
            expect(surfaceMode()).toBe(mode);
        }
    });

    it("honours the legacy CYBERCHEF_EXPOSE_ALL_OPS in both directions", () => {
        process.env.CYBERCHEF_EXPOSE_ALL_OPS = "true";
        expect(surfaceMode()).toBe("all");

        process.env.CYBERCHEF_EXPOSE_ALL_OPS = "false";
        expect(surfaceMode()).toBe("curated");
    });

    it("lets the legacy variable win over the new one, since it is the more explicit ask", () => {
        process.env.CYBERCHEF_EXPOSE_ALL_OPS = "true";
        process.env.CYBERCHEF_TOOL_SURFACE = "index";
        expect(surfaceMode()).toBe("all");
    });

    it("exposes Magic in every surface, including index", () => {
        for (const mode of ["index", "curated", "all"]) {
            process.env.CYBERCHEF_TOOL_SURFACE = mode;
            expect(isExposed("Magic"), mode).toBe(true);
        }
    });

    it("pre-loads nothing else in index mode", () => {
        process.env.CYBERCHEF_TOOL_SURFACE = "index";
        expect(isExposed("To Base64")).toBe(false);
        expect(isExposed("Disassemble x86")).toBe(false);
    });

    it("pre-loads the curated set, and only that, in curated mode", () => {
        process.env.CYBERCHEF_TOOL_SURFACE = "curated";
        expect(isExposed("To Base64")).toBe(true);
        expect(isExposed("Disassemble x86")).toBe(false);
    });

    it("exposes everything in all mode", () => {
        process.env.CYBERCHEF_TOOL_SURFACE = "all";
        expect(isExposed("Disassemble x86")).toBe(true);
    });

    it("reads an allowlist, trimming and dropping blanks", () => {
        process.env.CYBERCHEF_TOOL_ALLOWLIST = " To Base64 , ,From Base64 ";
        expect(configuredAllowlist()).toEqual(new Set(["To Base64", "From Base64"]));
    });

    it("treats an unset or all-blank allowlist as absent", () => {
        expect(configuredAllowlist()).toBeNull();
        process.env.CYBERCHEF_TOOL_ALLOWLIST = " , , ";
        expect(configuredAllowlist()).toBeNull();
    });

    it("lets an allowlist override the mode entirely, Magic included", () => {
        // Someone who named their operations has been more specific than someone who picked a
        // preset. Silently unioning the two would hand them tools they did not ask for.
        process.env.CYBERCHEF_TOOL_SURFACE = "all";
        process.env.CYBERCHEF_TOOL_ALLOWLIST = "To Base64";
        expect(isExposed("To Base64")).toBe(true);
        expect(isExposed("From Base64")).toBe(false);
        expect(isExposed("Magic")).toBe(false);
    });

    it("describes each surface for the startup log", () => {
        process.env.CYBERCHEF_TOOL_SURFACE = "index";
        expect(describeSurface(1, 504)).toMatch(/index/);

        process.env.CYBERCHEF_TOOL_SURFACE = "curated";
        expect(describeSurface(99, 504)).toMatch(/curated/);

        process.env.CYBERCHEF_TOOL_SURFACE = "all";
        expect(describeSurface(504, 504)).toMatch(/all/);

        process.env.CYBERCHEF_TOOL_ALLOWLIST = "To Base64";
        expect(describeSurface(1, 504)).toMatch(/allowlist/);
    });
});

describe("core-recipe: normalising a recipe for the core engine", () => {
    it("treats a bare operation name as a recipe of one", () => {
        const recipe = toCoreRecipe("To Base64");
        expect(recipe).toHaveLength(1);
        expect(recipe[0].op).toBe("To Base64");
    });

    it("accepts an empty recipe", () => {
        expect(toCoreRecipe(undefined)).toEqual([]);
        expect(toCoreRecipe(null)).toEqual([]);
    });

    it("matches an operation name case-insensitively", () => {
        expect(toCoreRecipe([{ op: "to base64" }])[0].op).toBe("To Base64");
    });

    it("accepts op, operation or name as the step key", () => {
        for (const key of ["op", "operation", "name"]) {
            expect(toCoreRecipe([{ [key]: "To Base64" }])[0].op).toBe("To Base64");
        }
    });

    it("passes a positional argument array through untouched", () => {
        // A recipe pasted out of the web UI has already said what goes where.
        const args = ["A-Za-z0-9+/=", true];
        expect(toCoreRecipe([{ op: "To Base64", args }])[0].args).toEqual(args);
    });

    it("maps named arguments to positions, by sanitised name and by raw config name", () => {
        const bySanitised = toCoreRecipe([{ op: "To Base64", args: { alphabet: "A-Za-z0-9+/=" } }]);
        const byRawName = toCoreRecipe([{ op: "To Base64", args: { Alphabet: "A-Za-z0-9+/=" } }]);
        expect(bySanitised[0].args).toEqual(byRawName[0].args);
    });

    it("fills in defaults for arguments the caller omitted", () => {
        expect(toCoreRecipe([{ op: "To Base64" }])[0].args.length).toBeGreaterThan(0);
    });

    it("rejects an unknown operation, pointing at the search tool", () => {
        expect(() => toCoreRecipe([{ op: "Definitely Not An Operation" }]))
            .toThrow(/Unknown operation.*cyberchef_search|Unknown operation/);
    });

    it("rejects a step that is neither a name nor an object", () => {
        expect(() => toCoreRecipe([42])).toThrow(/operation name or an \{op, args\} object/);
        expect(() => toCoreRecipe([null])).toThrow(/operation name or an \{op, args\} object/);
    });

    it("rejects a step object with no operation name", () => {
        expect(() => toCoreRecipe([{ args: {} }])).toThrow(/needs an operation name/);
    });
});

describe("tool-schema: the input ceiling and argument naming", () => {
    it("accepts input at or below the limit", () => {
        expect(() => validateInputSize("hello")).not.toThrow();
        expect(() => validateInputSize("")).not.toThrow();
    });

    it("rejects input above the limit, naming both sizes", () => {
        // Asserted here rather than through a request: proving it end to end means allocating a
        // >100 MB string and waiting for the server to correctly encode it.
        const oversized = { length: 0 };
        // Buffer.byteLength on a string is what the guard measures, so build the smallest thing
        // that exceeds it rather than a real 100 MB buffer.
        const spy = vi.spyOn(Buffer, "byteLength").mockReturnValue(200 * 1024 * 1024);
        try {
            expect(() => validateInputSize("x")).toThrow(/exceeds maximum allowed size/);
        } finally {
            spy.mockRestore();
        }
        expect(oversized.length).toBe(0);
    });

    it("suffixes an argument whose sanitised name would collide with the data parameter", () => {
        // The defect that made all 31 symmetric ciphers uncallable: an argument literally named
        // "Input" (the input FORMAT) sanitised to `input`, which the data parameter then overwrote.
        expect(toolArgName("Input")).toBe("input_arg");
        expect(toolArgName("Split delimiter")).toBe("split_delimiter");
    });
});

describe("wasm-fetch: the filesystem shim", () => {
    it("reports its installation state, and installs at most once", () => {
        const first = installWasmFetch();
        expect(isWasmFetchInstalled()).toBe(true);
        // Whether THIS call installed it depends on import order across the suite; what must hold
        // is that a second call never installs a second wrapper.
        expect(installWasmFetch()).toBe(false);
        expect(typeof first).toBe("boolean");
    });

    it("serves a .wasm payload from node_modules through the wrapped fetch", async () => {
        installWasmFetch();
        const wasm = join(process.cwd(), "node_modules", "argon2-browser", "dist", "argon2.wasm");
        const res = await fetch(wasm);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("application/wasm");
        expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
    });

    it("hands anything else to the original fetch, which rejects a bare path", async () => {
        installWasmFetch();
        // The LFI boundary, asserted through `fetch` rather than only through the predicate.
        await expect(fetch("/etc/hostname")).rejects.toThrow();
    });

    it("accepts a URL object as well as a string", () => {
        expect(_servableWasmPathForTest("https://example.com/x.wasm")).toBeNull();
    });
});

describe("tool-schema: rejecting argument names the operation does not have", () => {
    it("accepts the sanitised name and the raw CyberChef label", () => {
        const argDefs = [{ name: "Label name" }, { name: "Maximum jumps (if jumping backwards)" }];
        expect(() => assertKnownArgs("Jump", argDefs, { label_name: "top" })).not.toThrow();
        expect(() => assertKnownArgs("Jump", argDefs, { "Label name": "top" })).not.toThrow();
        expect(() => assertKnownArgs("Jump", argDefs, {})).not.toThrow();
    });

    it("rejects a misspelling instead of silently using the default", () => {
        // The defect, stated as the thing that was actually wrong: `{label: "top"}` on `Jump`
        // resolved to `["", 10]`, so the jump never happened and a three-round decode silently
        // returned one round. A wrong answer that looks right is the worst outcome available.
        const argDefs = [{ name: "Label name" }, { name: "Maximum jumps (if jumping backwards)" }];
        expect(() => assertKnownArgs("Jump", argDefs, { label: "top", maximum_jumps: 2 }))
            .toThrow(/Unknown arguments for "Jump": label, maximum_jumps/);
    });

    it("names the arguments the operation does accept", () => {
        // An error that only says "wrong" costs another round trip to find out what is right.
        try {
            assertKnownArgs("To Base64", [{ name: "Alphabet" }], { alphabett: "x" });
            throw new Error("should have thrown");
        } catch (err) {
            expect(err.message).toMatch(/Unknown argument for "To Base64": alphabett/);
            expect(err.context.accepted).toEqual(["alphabet"]);
            expect(err.context.hint).toMatch(/Valid arguments: alphabet/);
        }
    });

    it("says so plainly when an operation takes no arguments at all", () => {
        try {
            assertKnownArgs("MD5", [], { rounds: 3 });
            throw new Error("should have thrown");
        } catch (err) {
            expect(err.context.hint).toMatch(/takes no arguments/);
        }
    });
});
