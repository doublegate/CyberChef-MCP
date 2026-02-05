/**
 * Transport Factory Tests
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect } from "vitest";
import {
    TransportType,
    getTransportType,
    createTransport
} from "../../src/node/transports.mjs";

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

    describe("createTransport", () => {
        it("should create stdio transport by default", async () => {
            const { transport, httpServer } = await createTransport({ type: "stdio" });
            expect(transport).toBeDefined();
            expect(httpServer).toBeNull();
        });

        it("should create stdio transport with no options", async () => {
            const original = process.env.CYBERCHEF_TRANSPORT;
            delete process.env.CYBERCHEF_TRANSPORT;
            const { transport, httpServer } = await createTransport();
            expect(transport).toBeDefined();
            expect(httpServer).toBeNull();
            if (original) process.env.CYBERCHEF_TRANSPORT = original;
        });
    });
});
