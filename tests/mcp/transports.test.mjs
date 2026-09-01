/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Transport factory: the stdio entry, and the era it serves.
 *
 * These assertions changed shape in v2.3.0 and the reason is the point of the file. The stdio
 * branch used to hand back a constructed `StdioServerTransport` for `runServer()` to
 * `server.connect()`. Measured against SDK v2.0.0, that arrangement serves the **2025 era only**:
 * a client pinning protocol revision 2026-07-28 fails negotiation outright with
 * `ERA_NEGOTIATION_FAILED`, because nothing answers its `server/discover` probe. The era decision
 * lives in the `serveStdio` entry, not in the transport.
 *
 * So the factory now owns the connection, exactly as the HTTP branch already did for issue #36,
 * and returns `transport: null` for the same reason: there is nothing left for a caller to
 * `connect()`, and doing so would bypass the entry that makes the modern era reachable.
 *
 * The tests drive it through an injected in-memory transport rather than the process's own
 * stdin/stdout — a test runner must not hand its stdio to the server under test.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, afterEach } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/server";
import {
    TransportType,
    getTransportType,
    createTransport
} from "../../src/node/transports.mjs";

/** A minimal server, so these tests exercise the entry rather than the CyberChef tool surface. */
function makeServer() {
    const s = new Server({ name: "transport-test", version: "0.0.0" }, { capabilities: { tools: {} } });
    s.setRequestHandler("tools/list", async () => ({
        tools: [{
            name: "ping",
            description: "Returns pong",
            inputSchema: { type: "object", properties: {} }
        }]
    }));
    return s;
}

const opened = [];
afterEach(async () => {
    while (opened.length) {
        const closeAll = opened.pop();
        try {
            await closeAll();
        } catch { /* teardown is best-effort; a closed handle closing twice is not a failure */ }
    }
});

describe("Transport Factory", () => {
    describe("TransportType", () => {
        it("should define STDIO transport type", () => {
            expect(TransportType.STDIO).toBe("stdio");
        });

        it("should define HTTP transport type", () => {
            expect(TransportType.HTTP).toBe("http");
        });
    });

    describe("getTransportType", () => {
        it("should default to stdio when no env var set", () => {
            const original = process.env.CYBERCHEF_TRANSPORT;
            delete process.env.CYBERCHEF_TRANSPORT;
            const type = getTransportType();
            expect(type).toBe("stdio");
            if (original) process.env.CYBERCHEF_TRANSPORT = original;
        });
    });

    describe("createTransport (stdio)", () => {
        it("owns the connection and hands back no transport to connect", async () => {
            const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
            const result = await createTransport({
                type: "stdio", createServer: makeServer, transport: serverEnd
            });
            opened.push(result.closeAll);

            // Nothing for runServer() to connect: that is the contract change.
            expect(result.transport).toBeNull();
            expect(result.httpServer).toBeNull();
            expect(typeof result.closeAll).toBe("function");

            // And it is genuinely serving -- a client on the other end completes a round trip.
            const client = new Client({ name: "probe", version: "1.0.0" }, { capabilities: {} });
            await client.connect(clientEnd);
            expect((await client.listTools()).tools.map(t => t.name)).toEqual(["ping"]);
            await client.close();
        });

        it("requires a server factory, because the entry pins one instance per connection", async () => {
            await expect(createTransport({ type: "stdio" })).rejects.toThrow(/createServer factory/);
        });

        it("defaults to stdio when no type and no env var are given", async () => {
            const original = process.env.CYBERCHEF_TRANSPORT;
            delete process.env.CYBERCHEF_TRANSPORT;
            try {
                const [, serverEnd] = InMemoryTransport.createLinkedPair();
                const result = await createTransport({ createServer: makeServer, transport: serverEnd });
                opened.push(result.closeAll);
                expect(result.transport).toBeNull();
                expect(result.httpServer).toBeNull();
            } finally {
                if (original) process.env.CYBERCHEF_TRANSPORT = original;
            }
        });
    });
});
