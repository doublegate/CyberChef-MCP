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

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
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
        expect(limiter.checkLimit("a").allowed).toBe(true);
        expect(limiter.checkLimit("b").allowed).toBe(true);

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
        // Buffer.byteLength on a string is what the guard measures, so stubbing it is enough to
        // cross the ceiling without allocating a real 100 MB buffer.
        const spy = vi.spyOn(Buffer, "byteLength").mockReturnValue(200 * 1024 * 1024);
        try {
            expect(() => validateInputSize("x")).toThrow(/exceeds maximum allowed size/);
            expect(() => validateInputSize("x")).toThrow(/100MB/);
        } finally {
            spy.mockRestore();
        }
    });

    it("suffixes an argument whose sanitised name would collide with the data parameter", () => {
        // The defect that made all 31 symmetric ciphers uncallable: an argument literally named
        // "Input" (the input FORMAT) sanitised to `input`, which the data parameter then overwrote.
        expect(toolArgName("Input")).toBe("input_arg");
        expect(toolArgName("Split delimiter")).toBe("split_delimiter");
    });
});

describe("wasm-fetch: the filesystem shim", () => {
    // `installWasmFetch` replaces `globalThis.fetch` for the whole worker. Vitest isolates by
    // file, so the blast radius is this file -- but a patched global that outlives the tests that
    // needed it is exactly the kind of leak that makes an unrelated suite fail confusingly later.
    // Saved and restored explicitly; the module's own `installed` flag is idempotent, so a later
    // caller still gets the wrapper it expects.
    // Scoped to the BLOCK, not to each test: `installWasmFetch` is idempotent by design, so a
    // per-test restore would leave the module's `installed` flag true with the wrapper gone, and
    // the next call could not put it back.
    let originalFetch;

    beforeAll(() => {
        originalFetch = globalThis.fetch;
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
    });

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

    it("accepts a URL object, not just a string", async () => {
        installWasmFetch();
        // The wrapper normalises a URL via `.href` before deciding; the predicate itself only ever
        // sees a string. Both halves are asserted, because the previous version of this test was
        // named for the URL case and only exercised the string one.
        expect(_servableWasmPathForTest("https://example.com/x.wasm")).toBeNull();
        await expect(fetch(new URL("https://127.0.0.1:0/x.wasm"))).rejects.toThrow();
    });
});

describe("tool-schema: rejecting argument names the operation does not have", () => {
    it("accepts the sanitised name and the raw CyberChef label", () => {
        const argDefs = [{ name: "Label name" }, { name: "Maximum jumps (if jumping backwards)" }];
        expect(() => assertKnownArgs("Jump", argDefs, { "label_name": "top" })).not.toThrow();
        expect(() => assertKnownArgs("Jump", argDefs, { "Label name": "top" })).not.toThrow();
        expect(() => assertKnownArgs("Jump", argDefs, {})).not.toThrow();
    });

    it("rejects a misspelling instead of silently using the default", () => {
        // The defect, stated as the thing that was actually wrong: `{label: "top"}` on `Jump`
        // resolved to `["", 10]`, so the jump never happened and a three-round decode silently
        // returned one round. A wrong answer that looks right is the worst outcome available.
        const argDefs = [{ name: "Label name" }, { name: "Maximum jumps (if jumping backwards)" }];
        expect(() => assertKnownArgs("Jump", argDefs, { "label": "top", "maximum_jumps": 2 }))
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

describe("telemetry: the disabled path and the ring buffer", () => {
    it("records nothing at all when telemetry is off", async () => {
        // The default. Recording into a collector nobody exports is pure cost, so the guard is the
        // first statement in `record` and this is the branch the running server always takes.
        //
        // The env var is unset and the module cache reset FIRST: `TELEMETRY_ENABLED` is evaluated
        // once when `config.mjs` loads, and a top-level import in this file can load it before
        // this test runs. A developer with CYBERCHEF_TELEMETRY_ENABLED=true in their environment
        // would otherwise see this fail for a reason that has nothing to do with the code.
        vi.resetModules();
        const prev = process.env.CYBERCHEF_TELEMETRY_ENABLED;
        delete process.env.CYBERCHEF_TELEMETRY_ENABLED;
        try {
            const { TelemetryCollector } = await import("../../src/node/lib/telemetry.mjs");
            const c = new TelemetryCollector();
            c.record({ tool: "x", duration: 1, success: true });
            expect(c.metrics).toHaveLength(0);
        } finally {
            if (prev !== undefined) process.env.CYBERCHEF_TELEMETRY_ENABLED = prev;
            vi.resetModules();
        }
    });

    it("defaults `cached` and evicts oldest-first once full", async () => {
        vi.resetModules();
        const prev = process.env.CYBERCHEF_TELEMETRY_ENABLED;
        process.env.CYBERCHEF_TELEMETRY_ENABLED = "true";
        try {
            const { TelemetryCollector } = await import("../../src/node/lib/telemetry.mjs");
            const c = new TelemetryCollector();
            c.maxMetrics = 2;
            // `cached` omitted: it must land as false rather than undefined, or an exported metric
            // set has a third state that no consumer expects.
            c.record({ tool: "a", duration: 1, success: true });
            expect(c.metrics[0].cached).toBe(false);
            c.record({ tool: "b", duration: 1, success: true, cached: true });
            c.record({ tool: "c", duration: 1, success: true });
            // Bounded, and it is the OLDEST that goes -- an unbounded array here is a slow leak in
            // a long-running server.
            expect(c.metrics).toHaveLength(2);
            expect(c.metrics.map(m => m.tool)).toEqual(["b", "c"]);
        } finally {
            if (prev === undefined) delete process.env.CYBERCHEF_TELEMETRY_ENABLED;
            else process.env.CYBERCHEF_TELEMETRY_ENABLED = prev;
            vi.resetModules();
        }
    });
});

describe("resources: shapes the recipe store might hand back", () => {
    /** @param {Array} list - Recipes to serve. @returns {Object} A stub manager. */
    const managerReturning = (list) => ({ listRecipes: async () => list });

    it("accepts both a bare array and a wrapped {recipes} object", async () => {
        const { listResources } = await import("../../src/node/lib/resources.mjs");
        const one = [{ id: "a", name: "A", description: "d", operations: [1, 2] }];

        const bare = await listResources(managerReturning(one));
        const wrapped = await listResources(managerReturning({ recipes: one }));
        // This module has no business knowing which shape `listRecipes` returns today, so both
        // work and neither is the "real" one.
        expect(bare).toEqual(wrapped);
        expect(bare.resources[0].uri).toBe("recipe://a");
    });

    it("falls back to an operation count when a recipe has no description", async () => {
        const { listResources } = await import("../../src/node/lib/resources.mjs");
        const res = await listResources(managerReturning([
            { id: "b", name: "B", operations: [1, 2, 3] },
            { id: "c", name: "C" }
        ]));
        expect(res.resources[0].description).toBe("3 operation(s)");
        // No `operations` key at all still has to produce a sentence, not "undefined operation(s)".
        expect(res.resources[1].description).toBe("0 operation(s)");
    });

    it("rejects a scheme-only URI, which names no recipe", async () => {
        const { readResource } = await import("../../src/node/lib/resources.mjs");
        await expect(readResource(managerReturning([]), "recipe://")).rejects.toThrow(/No recipe id/);
    });
});

describe("prompts: every prompt renders, including without its arguments", () => {
    it("renders all five with their arguments", async () => {
        const { listPrompts, getPrompt } = await import("../../src/node/lib/prompts.mjs");
        const { prompts } = listPrompts();
        expect(prompts.length).toBe(5);

        for (const p of prompts) {
            // Supply every declared argument, so each prompt's own `build` actually runs. Two of
            // them had never been rendered by any test.
            const args = Object.fromEntries((p.arguments || []).map(a => [a.name, "SAMPLE"]));
            const result = getPrompt(p.name, args);
            const text = result.messages[0].content.text;
            expect(text.length).toBeGreaterThan(50);
            if ((p.arguments || []).length) expect(text).toContain("SAMPLE");
        }
    });

    it("renders a prompt with its optional argument omitted", async () => {
        const { getPrompt } = await import("../../src/node/lib/prompts.mjs");
        // `decode-chain` is the only prompt with an optional argument (`hint`), and the earlier
        // test supplies every declared argument, so it never exercises the omitted path. Omitting
        // an optional argument must render, not throw and not print "undefined".
        const text = getPrompt("decode-chain", { data: "SGVsbG8=" }).messages[0].content.text;
        expect(text).toContain("SGVsbG8=");
        expect(text).not.toContain("undefined");
    });

    it("refuses a prompt whose required argument is missing or empty", async () => {
        const { getPrompt } = await import("../../src/node/lib/prompts.mjs");
        // Empty string counts as missing: a prompt rendered without its data asks the model to
        // analyse nothing, and that surfaces much later as a confusing answer.
        expect(() => getPrompt("analyse-unknown-data", {})).toThrow(/requires/);
        expect(() => getPrompt("analyse-unknown-data", { data: "" })).toThrow(/requires/);
    });
});

describe("tool-catalog: degenerate inputs", () => {
    it("summarises a missing or empty description as an empty string", async () => {
        const { describeOperations } = await import("../../src/node/lib/tool-catalog.mjs");
        // A single name rather than an array is accepted: callers pass both.
        const one = describeOperations("MD5", (n) => n);
        expect(one.operations).toHaveLength(1);
        expect(one.operations[0].operation).toBe("MD5");
    });

    it("reports an unknown operation instead of throwing", async () => {
        const { describeOperations } = await import("../../src/node/lib/tool-catalog.mjs");
        const res = describeOperations(["Definitely Not An Operation"], (n) => n);
        // Reported per operation rather than thrown, so one bad name in a batch does not discard
        // the descriptions of the good ones -- and the message names the way out.
        expect(res.operations[0].error).toMatch(/No such operation/);
        expect(res.operations[0].error).toMatch(/cyberchef_search/);
    });

    it("rejects an unknown category by name, listing the real ones", async () => {
        const { listOperations } = await import("../../src/node/lib/tool-catalog.mjs");
        expect(() => listOperations("Nonexistent")).toThrow(/Unknown category/);
        // No category at all is the same error, not a crash on `undefined.toLowerCase()`.
        expect(() => listOperations(undefined)).toThrow(/Unknown category/);
    });
});

describe("tool-schema: the argument types a schema has to describe", () => {
    /** @param {Object} arg - One CyberChef argument definition. @returns {Object} Its Zod shape. */
    const shapeFor = async (arg) => {
        const { mapArgsToZod } = await import("../../src/node/lib/tool-schema.mjs");
        return mapArgsToZod([arg]);
    };

    it("maps argSelector to a strict enum, not a free-text field", async () => {
        // 19 operations use argSelector, including AES Encrypt/Decrypt. Falling through to the
        // string default would offer free text where only a fixed set of modes is valid, and push
        // the failure all the way to validateIngredients at execution time.
        const named = await shapeFor({ name: "Mode", type: "argSelector", value: [{ name: "CBC" }, { name: "GCM" }] });
        expect(named.mode.safeParse("CBC").success).toBe(true);
        expect(named.mode.safeParse("Nope").success).toBe(false);

        // Plain strings are the other shape it comes in.
        const plain = await shapeFor({ name: "Mode", type: "argSelector", value: ["A", "B"] });
        expect(plain.mode.safeParse("B").success).toBe(true);

        // An empty selector cannot become an enum; it degrades to a string rather than throwing
        // while the tool list is being built.
        const empty = await shapeFor({ name: "Mode", type: "argSelector", value: [] });
        expect(empty.mode.safeParse("anything").success).toBe(true);
    });

    it("accepts both forms of a toggleString: a bare string and {string, option}", async () => {
        const s = await shapeFor({ name: "Key", type: "toggleString", value: "", toggleValues: ["Hex", "UTF8"] });
        expect(s.key.safeParse("6f6d0bab").success).toBe(true);
        expect(s.key.safeParse({ string: "hunter2", option: "UTF8" }).success).toBe(true);
        expect(s.key.safeParse({ string: "hunter2", option: "Klingon" }).success).toBe(false);

        // Without toggleValues the option cannot be enumerated, so it stays an open string.
        const open = await shapeFor({ name: "Key", type: "toggleString", value: "" });
        expect(open.key.safeParse({ string: "x", option: "whatever" }).success).toBe(true);
    });

    it("does not repeat the type as a description", async () => {
        // Across 524 tools, appending a description that only restates `type`/`enum` came to
        // roughly 42 KB paid on every tools/list, carrying nothing a client could not already read.
        const { mapArgsToZod } = await import("../../src/node/lib/tool-schema.mjs");
        const shape = mapArgsToZod([{ name: "Flag", type: "boolean" }]);
        expect(shape.flag.description).toBeUndefined();
    });
});

describe("tool-schema: resolving a toggleString the caller wrote in some other form", () => {
    /** @returns {Function} resolveArgValue */
    const resolver = async () => (await import("../../src/node/lib/tool-schema.mjs")).resolveArgValue;
    const KEY = { name: "Key", type: "toggleString", value: "seed", toggleValues: ["Hex", "UTF8"] };

    it("supplies the default option when the caller sent nothing", async () => {
        const resolveArgValue = await resolver();
        // The default used to be returned as a bare string, which is what produced
        // "Cannot read properties of undefined (reading 'option')" across all 63 of these
        // operations.
        expect(resolveArgValue(KEY, undefined)).toEqual({ option: "Hex", string: "seed" });
        expect(resolveArgValue(KEY, null)).toEqual({ option: "Hex", string: "seed" });
    });

    it("wraps a bare string in the default option", async () => {
        const resolveArgValue = await resolver();
        expect(resolveArgValue(KEY, "abc")).toEqual({ option: "Hex", string: "abc" });
    });

    it("corrects an unrecognised option rather than passing it through", async () => {
        const resolveArgValue = await resolver();
        // Passing it through would have the operation decode the key with a scheme it does not
        // know, and a wrongly-decoded key fails as "bad decrypt" a long way from the mistake.
        expect(resolveArgValue(KEY, { string: "abc", option: "Klingon" }))
            .toEqual({ option: "Hex", string: "abc" });
        expect(resolveArgValue(KEY, { string: "abc", option: "UTF8" }))
            .toEqual({ option: "UTF8", string: "abc" });
        // A missing `string` is an empty one, not undefined.
        expect(resolveArgValue(KEY, { option: "UTF8" })).toEqual({ option: "UTF8", string: "" });
    });

    it("falls back to UTF8 when the operation declares no toggle values", async () => {
        const resolveArgValue = await resolver();
        expect(resolveArgValue({ name: "Key", type: "toggleString", value: 0 }, undefined))
            .toEqual({ option: "UTF8", string: "" });
    });
});

describe("recipe-validator: argument types, checked before the engine sees them", () => {
    /** @returns {Function} validateOperationArguments */
    const validate = async () => (await import("../../src/node/recipe-validator.mjs")).validateOperationArguments;

    it("passes over steps it has no business checking", async () => {
        const validateOperationArguments = await validate();
        // A recipe reference, a step with no op, a step with no args, and an operation the config
        // does not know are all skipped rather than rejected: this function checks argument types,
        // and validateOperationNames is what rejects unknown operations.
        expect(() => validateOperationArguments({ operations: [
            { recipe: "other-recipe" },
            { args: { x: 1 } },
            { op: "MD5" },
            { op: "Definitely Not An Operation", args: { x: 1 } }
        ] })).not.toThrow();
    });

    it("rejects a wrong-typed boolean or number, naming both what it wanted and what it got", async () => {
        const validateOperationArguments = await validate();
        expect(() => validateOperationArguments({ operations: [
            { op: "To Base64", args: {} },
            { op: "Bit shift left", args: { amount: "three" } }
        ] })).toThrow(/expected number, got string/);
    });

    it("rejects an option outside the operation's own list", async () => {
        const validateOperationArguments = await validate();
        // A plain `option` argument (432 of them across the catalogue).
        expect(() => validateOperationArguments({
            operations: [{ op: "A1Z26 Cipher Decode", args: { delimiter: "Interpretive Dance" } }]
        })).toThrow(/not in allowed options/);
        expect(() => validateOperationArguments({
            operations: [{ op: "A1Z26 Cipher Decode", args: { delimiter: "Comma" } }]
        })).not.toThrow();

        // And an `argSelector`, which is also a closed set. It used to fall through to the
        // flexible default, so an invalid mode passed here and failed later inside the engine,
        // with an error pointing at the operation rather than at the argument.
        expect(() => validateOperationArguments({ operations: [{ op: "SHA2", args: { size: "999" } }] }))
            .toThrow(/not in allowed options/);
        expect(() => validateOperationArguments({ operations: [{ op: "SHA2", args: { size: "256" } }] }))
            .not.toThrow();
    });

    it("leaves an argument the caller omitted to the operation's default", async () => {
        const validateOperationArguments = await validate();
        expect(() => validateOperationArguments({ operations: [{ op: "SHA2", args: {} }] })).not.toThrow();
    });
});

describe("core-recipe: what the caller receives when the engine refuses", () => {
    it("turns an engine error into a structured input error naming the recipe", async () => {
        const { bakeOnCore } = await import("../../src/node/lib/core-recipe.mjs");
        await expect(bakeOnCore("not-hex", [{ op: "From Hex" }, { op: "Gunzip" }]))
            .rejects.toMatchObject({ code: "INVALID_INPUT" });
    });

    it("presents an html result as text, and a non-string result as JSON", async () => {
        const { bakeOnCore } = await import("../../src/node/lib/core-recipe.mjs");

        // `Magic` has outputType html. toString() must reduce the markup rather than hand a
        // caller a page of tags -- while `toContentBlocks` is what keeps an actual image.
        const magic = await bakeOnCore("aGVsbG8=", [{ op: "Magic" }]);
        expect(magic.outputType).toBe("html");
        expect(String(magic)).not.toMatch(/<table|<tr>/);

        // An empty recipe has no last operation, so there is no output type to read.
        const passthrough = await bakeOnCore("plain", []);
        expect(passthrough.outputType).toBeUndefined();
        expect(String(passthrough)).toBe("plain");
    });
});
