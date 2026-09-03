/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Both protocol eras, against the real server process.
 *
 * v2.3.0 moved this server from `@modelcontextprotocol/sdk` 1.30.0 to the v2 packages. The point
 * of that migration is a protocol revision, so it has to be asserted as one — a green suite
 * proves only that nothing broke, not that anything was gained.
 *
 * Two things are pinned here, and they are in tension by design:
 *
 *   1. **Modern.** A client pinning revision 2026-07-28 negotiates it, and gets the `_meta`
 *      envelope on results. Before the migration this failed outright with
 *      `ERA_NEGOTIATION_FAILED` — no `server/discover` answer existed. It still would if the
 *      stdio branch went back to a bare transport plus `server.connect()`: the era decision lives
 *      in the `serveStdio` entry, not in the transport, which is measured behaviour and not an
 *      assumption.
 *   2. **Legacy.** A client from the v1 SDK — the generation every currently deployed integration
 *      speaks — still connects, still gets a populated `inputSchema`, and still gets a correct
 *      answer. The migration is an upgrade, not a cutover, and this is what makes that claim
 *      testable rather than asserted.
 *
 * Both run against the same spawned binary and the same handler registrations, so the two eras
 * cannot drift apart without one of these failing.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport as LegacyStdio } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client as ModernClient } from "@modelcontextprotocol/client";
import { StdioClientTransport as ModernStdio } from "@modelcontextprotocol/client/stdio";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, "../../src/node/mcp-server.mjs");

/** The revision the v2 SDK calls the modern era. Legacy negotiation tops out at 2025-11-25. */
const MODERN = "2026-07-28";

// Booting the real server builds the tool surface, so this is generous on purpose: a timeout
// here should mean "broken", not "busy CI runner".
const BOOT_TIMEOUT_MS = 120_000;

/** Child-process spawn parameters shared by both eras, so neither gets a friendlier server. */
const SPAWN = {
    command: process.execPath,
    args: [SERVER],
    // `index` is the default surface and is enough here: this suite is about the wire, and
    // stdio-client-contract.test.mjs is what exercises all 504 schemas.
    env: {
        ...process.env, CYBERCHEF_TRANSPORT: "stdio", CYBERCHEF_LOG_LEVEL: "error",
    }
};

describe("protocol eras", () => {
    it("gives the modern era cache hints on every list result", async () => {
        // SEP-2549. The SDK fills these from the `cacheHints` constructor option; the values are
        // this server's judgement about how long each answer stays true.
        const client = new ModernClient(
            { name: "cache-hint-probe", version: "0.0.0" },
            { capabilities: {}, versionNegotiation: { mode: { pin: MODERN } } }
        );
        await client.connect(new ModernStdio(SPAWN));
        try {
            const tools = await client.listTools();
            expect(tools.ttlMs).toBe(600_000);
            // Shareable only because auth is off in this fixture: under scope filtering the answer
            // varies by token and the hint becomes private. See lib/cache-hints.mjs.
            expect(tools.cacheScope).toBe("public");

            const prompts = await client.listPrompts();
            expect(prompts.ttlMs).toBe(3_600_000);

            // The volatile one. Saved recipes change on any caller's write and are partitioned by
            // tenant, and this server emits no list-changed notification -- so there is no
            // invalidation signal other than the TTL, and the only honest TTL is zero.
            const resources = await client.listResources();
            expect(resources.ttlMs).toBe(0);
            expect(resources.cacheScope).toBe("private");
        } finally {
            await client.close();
        }
    }, BOOT_TIMEOUT_MS);

    it("does NOT put cache hints on the 2025 wire", async () => {
        // The reason these go through the constructor option rather than being returned by the
        // handlers: the legacy codec passes a result through unchanged, so a handler-returned
        // ttlMs would reach every deployed v1-SDK client as an unrecognised field.
        const client = new LegacyClient({ name: "legacy-cache-probe", version: "0.0.0" },
            { capabilities: {} });
        await client.connect(new LegacyStdio(SPAWN));
        try {
            const tools = await client.listTools();
            expect(tools.ttlMs).toBeUndefined();
            expect(tools.cacheScope).toBeUndefined();
        } finally {
            await client.close();
        }
    }, BOOT_TIMEOUT_MS);

    it("serves the modern era to a client that pins 2026-07-28", async () => {
        const client = new ModernClient(
            { name: "modern-probe", version: "0.0.0" },
            { capabilities: {}, versionNegotiation: { mode: { pin: MODERN } } }
        );
        await client.connect(new ModernStdio(SPAWN));
        try {
            expect(client.getNegotiatedProtocolVersion()).toBe(MODERN);

            const { tools } = await client.listTools();
            expect(tools.some(t => t.name === "cyberchef_bake")).toBe(true);

            const result = await client.callTool({
                name: "cyberchef_bake",
                arguments: { input: "abc", recipe: [{ op: "MD5" }] }
            });
            expect(result.content[0].text).toBe("900150983cd24fb0d6963f7d28e17f72");

            // The envelope is the visible difference between the eras, so assert it rather than
            // trusting the negotiated string alone.
            expect(result._meta?.["io.modelcontextprotocol/serverInfo"]).toMatchObject({
                name: "cyberchef-mcp"
            });
        } finally {
            await client.close();
        }
    }, BOOT_TIMEOUT_MS);

    it("still serves a v1-SDK client, which is what deployed integrations speak", async () => {
        const client = new LegacyClient({ name: "legacy-probe", version: "0.0.0" }, { capabilities: {} });
        await client.connect(new LegacyStdio(SPAWN));
        try {
            // The v1 client validates every response against the 2025-era schema; connecting and
            // listing IS the assertion.
            const { tools } = await client.listTools();
            const bake = tools.find(t => t.name === "cyberchef_bake");
            expect(bake).toBeDefined();
            // Not an empty schema: that regression shipped in three releases and is what
            // stdio-client-contract.test.mjs exists for. Re-checked here because a SDK swap is
            // exactly the kind of change that could reintroduce it.
            expect(bake.inputSchema.type).toBe("object");
            expect(Object.keys(bake.inputSchema.properties ?? {})).toContain("recipe");

            const result = await client.callTool({
                name: "cyberchef_bake",
                arguments: { input: "abc", recipe: [{ op: "MD5" }] }
            });
            expect(result.content[0].text).toBe("900150983cd24fb0d6963f7d28e17f72");
        } finally {
            await client.close();
        }
    }, BOOT_TIMEOUT_MS);
});
