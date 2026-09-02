/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Startup cost: the Node API must stay off the launch path.
 *
 * `src/node/index.mjs` imports all 505 operation implementations and costs ~1.1 s to load. Before
 * v2.6.0 it was pulled in eagerly by three modules, so every launch paid it -- on stdio, which is
 * how every editor starts this server, before answering a single request.
 *
 * The guard here is structural rather than a timing assertion. A "startup must be under N ms" test
 * measures the machine it runs on and goes flaky on a loaded CI runner; asserting that the heavy
 * module *has not been loaded* is exact, fast, and fails for the right reason.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Run a snippet in a fresh Node process and return its stdout.
 *
 * A separate process per case is the point: module loading is per-process and cached, so two
 * assertions about "was this imported" cannot share one.
 *
 * @param {string} code - The snippet.
 * @returns {string} Trimmed stdout.
 */
function inFreshProcess(code) {
    return execFileSync(process.execPath, ["--input-type=module", "-e", code], {
        cwd: ROOT, encoding: "utf8", timeout: 120000,
        // The server logs to stderr; only stdout carries the answer.
        stdio: ["ignore", "pipe", "ignore"]
    }).trim();
}

describe("the Node API stays off the startup path", () => {
    it("is not loaded by importing the server", () => {
        // The regression guard. If someone adds `import { help } from "./index.mjs"` back to any
        // module in the server's graph, this fails -- which is what happened three times before
        // v2.6.0 (mcp-server.mjs, recipe-manager.mjs, and lib/batch.mjs, the last of which was
        // missed on the first attempt and kept cold start at 1.3 s while the other two were fixed).
        const out = inFreshProcess(`
            await import("./src/node/mcp-server.mjs");
            const { _nodeApiRequested } = await import("./src/node/lib/node-api.mjs");
            console.log(_nodeApiRequested() ? "LOADED" : "NOT_LOADED");
            process.exit(0);
        `);
        expect(out).toBe("NOT_LOADED");
    });

    it("costs far less to import the server than to import the Node API", () => {
        // A ratio, not a wall-clock budget: it holds on a slow runner and still fails loudly if
        // the eager import returns, because then the two numbers converge.
        const out = inFreshProcess(`
            let t = Date.now();
            await import("./src/node/mcp-server.mjs");
            const server = Date.now() - t;
            t = Date.now();
            await import("./src/node/index.mjs");
            const api = Date.now() - t;
            console.log(JSON.stringify({ server, api }));
            process.exit(0);
        `);
        const { server, api } = JSON.parse(out);
        // If the server had loaded the API eagerly, `api` would be ~0 (already cached) and this
        // would fail. Measured locally: server 145 ms, api 1120 ms.
        expect(api).toBeGreaterThan(server);
    });

    it("still answers tools/list without the Node API", () => {
        // The capability that makes deferring safe: the tool list is built from
        // OperationConfig.json and Categories.json, not from the implementations.
        const out = inFreshProcess(`
            const { categoryIndex, listOperations } = await import("./src/node/lib/tool-catalog.mjs");
            const { _nodeApiRequested } = await import("./src/node/lib/node-api.mjs");
            const index = categoryIndex();
            // Sum across every category rather than trusting one: the point is that the whole
            // catalogue is reachable from metadata alone.
            const total = index.categories.reduce((n, c) => n + c.operations, 0);
            // And prove a category's operations really do enumerate without the API.
            const first = listOperations(index.categories[0].category).operations;
            console.log(JSON.stringify({
                categories: index.categories.length,
                total,
                firstCategoryListed: Array.isArray(first) ? first.length : -1,
                apiLoaded: _nodeApiRequested()
            }));
            process.exit(0);
        `);
        const { categories, total, firstCategoryListed, apiLoaded } = JSON.parse(out);
        expect(categories).toBeGreaterThan(10);
        expect(total).toBeGreaterThan(400);
        expect(firstCategoryListed).toBeGreaterThan(0);
        expect(apiLoaded).toBe(false);
    });
});

describe("loadNodeApi", () => {
    it("memoises, so concurrent callers share one import", async () => {
        const { loadNodeApi } = await import("../../src/node/lib/node-api.mjs");
        const [a, b] = await Promise.all([loadNodeApi(), loadNodeApi()]);
        expect(a).toBe(b);
        expect(typeof a.help).toBe("function");
        expect(typeof a.bake).toBe("function");
    }, 60_000);
});
