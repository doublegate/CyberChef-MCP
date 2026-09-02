/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The rate limiter, asserted where it is actually used.
 *
 * `lib-internals.test.mjs` already covers the sliding-window algorithm thoroughly, and every one
 * of those tests passed for the whole time the limiter did not work. They keyed the limiter on a
 * stable connection id, as any reasonable unit test would; the server keyed it on `requestId` --
 * a fresh `randomUUID()` per request from `logRequestStart`. So every call presented as a caller
 * never seen before, the window was always empty, and nothing was ever refused.
 *
 * Measured before the fix, at a limit of 5 per 60s:
 *
 *     keyed by requestId (as shipped):  1000 requests -> 0 denied, 1000 map entries
 *     keyed by a stable caller:         1000 requests -> 995 denied, 1 map entry
 *
 * The lesson is the same one v2.5.0's F-02 recorded: a correct module reached through wrong wiring
 * fails, and only a test that goes through the wiring can see it. So these run against a real
 * client and a real server over `InMemoryTransport`, not against a `RateLimiter` built in the test.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

/** The limit these tests run against -- small, so the test is fast and the arithmetic obvious. */
const LIMIT = 5;

let createMcpServer;
let storageDir;

beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "cyberchef-ratelimit-"));
    // Both are read into a `const` at module load, so they must be set before the import.
    process.env.CYBERCHEF_RECIPE_STORAGE = join(storageDir, "recipes.json");
    process.env.CYBERCHEF_RECIPE_BACKUP = "false";
    process.env.CYBERCHEF_RATE_LIMIT_ENABLED = "true";
    process.env.CYBERCHEF_RATE_LIMIT_REQUESTS = String(LIMIT);
    process.env.CYBERCHEF_RATE_LIMIT_WINDOW = "60000";
    ({ createMcpServer } = await import("../../src/node/mcp-server.mjs"));
});

afterAll(async () => {
    delete process.env.CYBERCHEF_RATE_LIMIT_ENABLED;
    delete process.env.CYBERCHEF_RATE_LIMIT_REQUESTS;
    delete process.env.CYBERCHEF_RATE_LIMIT_WINDOW;
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
});

/**
 * A connected client/server pair sharing this process.
 *
 * @returns {Promise<{client: Client, close: Function}>} The client and its teardown.
 */
async function connected() {
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "rate-limit-test", version: "1.0.0" }, { capabilities: {} });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return {
        client,
        /** @returns {Promise<void>} Closes both ends. */
        async close() {
            await client.close();
            await server.close();
        }
    };
}

describe("rate limiting through the real dispatch path", () => {
    it("actually refuses a caller past the limit", async () => {
        const { client, close } = await connected();
        try {
            const outcomes = [];
            // Comfortably more than the limit. Distinct inputs so a cache hit cannot be what
            // makes a later call cheap -- the question is whether it is REFUSED, not how fast it
            // is, and an identical input would short-circuit before the limiter mattered.
            for (let i = 0; i < LIMIT * 3; i++) {
                const res = await client.callTool({
                    name: "cyberchef_to_base64",
                    arguments: { input: `sample-${i}` }
                });
                outcomes.push(res.content?.[0]?.text ?? "");
            }

            const refused = outcomes.filter(t => /rate limit exceeded/i.test(t));

            // The assertion that would have failed before the fix, when the answer was zero.
            expect(refused.length).toBeGreaterThan(0);
            // And the limiter is not simply refusing everything: the first calls got through.
            expect(outcomes.length - refused.length).toBeGreaterThan(0);
        } finally {
            await close();
        }
    }, 60_000);

    it("permits the first calls and refuses only after the allowance is spent", async () => {
        const { client, close } = await connected();
        try {
            // A fresh server shares the module-level limiter with the test above, so this asserts
            // the SHAPE of the sequence -- allowed calls precede refused ones -- rather than an
            // exact count, which would depend on test order.
            const outcomes = [];
            for (let i = 0; i < LIMIT * 3; i++) {
                const res = await client.callTool({
                    name: "cyberchef_to_base64",
                    arguments: { input: `ordering-${i}` }
                });
                outcomes.push(/rate limit exceeded/i.test(res.content?.[0]?.text ?? ""));
            }
            const firstRefusal = outcomes.indexOf(true);
            // Asserted, not guarded. Written as `if (firstRefusal !== -1)` this test passed
            // against the unfixed server -- vacuously, because nothing was ever refused, which
            // is the very defect it exists to catch. A conditional assertion is not an assertion.
            expect(firstRefusal).not.toBe(-1);
            // Once refused, a caller inside one window stays refused: no allowed call may follow
            // a refused one.
            expect(outcomes.slice(firstRefusal).every(Boolean)).toBe(true);
        } finally {
            await close();
        }
    }, 60_000);

    it("reports a retry-after a client can act on", async () => {
        const { client, close } = await connected();
        try {
            let refusal = "";
            for (let i = 0; i < LIMIT * 3 && !refusal; i++) {
                const res = await client.callTool({
                    name: "cyberchef_to_base64",
                    arguments: { input: `retry-after-${i}` }
                });
                const text = res.content?.[0]?.text ?? "";
                if (/rate limit exceeded/i.test(text)) refusal = text;
            }
            expect(refusal).toMatch(/retry after \d+ seconds/i);
        } finally {
            await close();
        }
    }, 60_000);
});

describe("the tracking map does not grow without bound", () => {
    it("reclaims callers whose window has expired", async () => {
        // The second half of the same defect: `checkLimit` pruned timestamps inside a caller's
        // array but nothing ever removed the caller, so the Map gained an entry per distinct key
        // and kept it for the life of the process. With the keying bug that meant one entry per
        // request, forever.
        const { RateLimiter } = await import("../../src/node/lib/rate-limit.mjs");
        const limiter = new RateLimiter(1000, 1); // 1ms window, so entries expire immediately

        for (let i = 0; i < 2000; i++) limiter.checkLimit(`caller-${i}`);

        // Sweeping is amortised and only runs above its threshold, so the Map is bounded rather
        // than empty -- the property that matters is that it does NOT retain all 2000.
        expect(limiter.requests.size).toBeLessThan(2000);
    });

    it("keeps a currently-active caller while sweeping idle ones", async () => {
        const { RateLimiter } = await import("../../src/node/lib/rate-limit.mjs");
        const limiter = new RateLimiter(10_000, 60_000);

        limiter.checkLimit("active");
        for (let i = 0; i < 2000; i++) limiter.checkLimit(`caller-${i}`);
        limiter.checkLimit("active");

        // A long window means nothing has expired, so nothing may be dropped: sweeping must not
        // discard live state to keep the Map small.
        expect(limiter.requests.has("active")).toBe(true);
    });
});
