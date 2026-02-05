/**
 * Test suite for CyberChef MCP Streaming
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect, vi } from "vitest";
import {
    StreamingConfig,
    STREAMABLE_OPERATIONS,
    PROGRESS_OPERATIONS,
    supportsStreaming,
    supportsProgress,
    chunkInput,
    calculateProgress,
    streamOperation,
    streamOperationWithProgress,
    determineStreamingStrategy,
    executeWithStreamingStrategy,
    executeWithStreamingProgress
} from "../../src/node/streaming.mjs";

describe("StreamingConfig", () => {
    it("should have default configuration", () => {
        expect(StreamingConfig.CHUNK_SIZE).toBeGreaterThan(0);
        expect(StreamingConfig.PROGRESS_INTERVAL).toBeGreaterThan(0);
        expect(StreamingConfig.MAX_CHUNKS_IN_MEMORY).toBeGreaterThan(0);
    });
});

describe("Operation Support", () => {
    describe("STREAMABLE_OPERATIONS", () => {
        it("should contain common streamable operations", () => {
            expect(STREAMABLE_OPERATIONS.has("To Base64")).toBe(true);
            expect(STREAMABLE_OPERATIONS.has("From Base64")).toBe(true);
            expect(STREAMABLE_OPERATIONS.has("To Hex")).toBe(true);
            expect(STREAMABLE_OPERATIONS.has("From Hex")).toBe(true);
        });
    });

    describe("PROGRESS_OPERATIONS", () => {
        it("should contain operations that support progress", () => {
            expect(PROGRESS_OPERATIONS.has("Gzip")).toBe(true);
            expect(PROGRESS_OPERATIONS.has("Gunzip")).toBe(true);
            expect(PROGRESS_OPERATIONS.has("AES Encrypt")).toBe(true);
            expect(PROGRESS_OPERATIONS.has("AES Decrypt")).toBe(true);
        });
    });

    describe("supportsStreaming", () => {
        it("should return true for streamable operations", () => {
            expect(supportsStreaming("To Base64")).toBe(true);
            expect(supportsStreaming("To Hex")).toBe(true);
        });

        it("should return false for non-streamable operations", () => {
            expect(supportsStreaming("Gzip")).toBe(false);
            expect(supportsStreaming("Unknown Operation")).toBe(false);
        });
    });

    describe("supportsProgress", () => {
        it("should return true for streamable operations", () => {
            expect(supportsProgress("To Base64")).toBe(true);
        });

        it("should return true for progress-only operations", () => {
            expect(supportsProgress("Gzip")).toBe(true);
            expect(supportsProgress("AES Encrypt")).toBe(true);
        });

        it("should return false for operations with no support", () => {
            expect(supportsProgress("Unknown Operation")).toBe(false);
        });
    });
});

describe("Utility Functions", () => {
    describe("chunkInput", () => {
        it("should split input into chunks", () => {
            const input = "a".repeat(100);
            const chunks = chunkInput(input, 25);

            expect(chunks).toHaveLength(4);
            expect(chunks[0]).toHaveLength(25);
            expect(chunks[3]).toHaveLength(25);
        });

        it("should handle input smaller than chunk size", () => {
            const input = "hello";
            const chunks = chunkInput(input, 100);

            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toBe("hello");
        });

        it("should handle uneven chunks", () => {
            const input = "a".repeat(27);
            const chunks = chunkInput(input, 10);

            expect(chunks).toHaveLength(3);
            expect(chunks[0]).toHaveLength(10);
            expect(chunks[1]).toHaveLength(10);
            expect(chunks[2]).toHaveLength(7);
        });

        it("should use default chunk size", () => {
            const input = "a".repeat(StreamingConfig.CHUNK_SIZE * 2);
            const chunks = chunkInput(input);

            expect(chunks.length).toBeGreaterThan(1);
        });
    });

    describe("calculateProgress", () => {
        it("should calculate progress percentage", () => {
            expect(calculateProgress(0, 100)).toBe(0);
            expect(calculateProgress(50, 100)).toBe(50);
            expect(calculateProgress(100, 100)).toBe(100);
        });

        it("should handle zero total", () => {
            expect(calculateProgress(0, 0)).toBe(100);
        });

        it("should cap at 100%", () => {
            expect(calculateProgress(150, 100)).toBe(100);
        });

        it("should round to nearest integer", () => {
            expect(calculateProgress(33, 100)).toBe(33);
            expect(calculateProgress(66, 100)).toBe(66);
        });
    });
});

describe("determineStreamingStrategy", () => {
    it("should return 'none' for small inputs", () => {
        const strategy = determineStreamingStrategy("To Base64", 1000, 10000);

        expect(strategy.type).toBe("none");
        expect(strategy.reason).toContain("below threshold");
    });

    it("should return 'chunked' for large streamable operations", () => {
        const strategy = determineStreamingStrategy("To Base64", 20000, 10000);

        expect(strategy.type).toBe("chunked");
        expect(strategy.reason).toContain("chunked streaming");
    });

    it("should return 'progress' for large progress operations", () => {
        const strategy = determineStreamingStrategy("Gzip", 20000, 10000);

        expect(strategy.type).toBe("progress");
        expect(strategy.reason).toContain("progress reporting");
    });

    it("should return 'none' for large non-streamable operations", () => {
        const strategy = determineStreamingStrategy("Unknown Op", 20000, 10000);

        expect(strategy.type).toBe("none");
        expect(strategy.reason).toContain("does not support");
    });
});

describe("streamOperation", () => {
    it("should stream operation in chunks", async () => {
        const mockBake = vi.fn((input, recipe) => {
            return Promise.resolve({ value: Buffer.from(input).toString("base64") });
        });

        const input = "a".repeat(100);
        const generator = streamOperation(mockBake, "To Base64", input, [], {
            chunkSize: 25,
            progressInterval: 50
        });

        const results = [];
        for await (const result of generator) {
            results.push(result);
        }

        // Should have initial status, progress updates, and final result
        expect(results.length).toBeGreaterThan(0);

        // First should be initial status
        const firstResult = results[0];
        expect(firstResult._meta?.progress).toBe(0);

        // Last should be final result
        const lastResult = results[results.length - 1];
        expect(lastResult._meta?.complete).toBe(true);
        expect(lastResult._meta?.progress).toBe(100);
        expect(lastResult.content[0].text).toBeDefined();
    });

    it("should handle errors gracefully", async () => {
        const mockBake = vi.fn(() => {
            return Promise.reject(new Error("Bake failed"));
        });

        const generator = streamOperation(mockBake, "To Base64", "test", []);

        await expect(async () => {
            // eslint-disable-next-line no-unused-vars
            for await (const _ of generator) {
                // Should throw before completing
            }
        }).rejects.toThrow();
    });
});

describe("streamOperationWithProgress", () => {
    it("should execute operation with progress updates", async () => {
        const mockBake = vi.fn((input, recipe) => {
            return Promise.resolve({ value: "result" });
        });

        const generator = streamOperationWithProgress(mockBake, "Gzip", "test data", []);

        const results = [];
        for await (const result of generator) {
            results.push(result);
        }

        expect(results.length).toBeGreaterThan(0);

        // First should be initial status
        const firstResult = results[0];
        expect(firstResult._meta?.progress).toBe(0);

        // Last should be final result
        const lastResult = results[results.length - 1];
        expect(lastResult._meta?.complete).toBe(true);
        expect(lastResult._meta?.progress).toBe(100);
    });

    it("should handle errors", async () => {
        // Create a mock that throws synchronously to avoid unhandled promise rejection
        const mockBake = vi.fn().mockImplementation(() => {
            throw new Error("Operation failed");
        });

        const generator = streamOperationWithProgress(mockBake, "Gzip", "test", []);

        // The generator should propagate the error
        let errorCaught = false;
        try {
            // eslint-disable-next-line no-unused-vars
            for await (const _ of generator) {
                // Will throw during execution
            }
        } catch (error) {
            errorCaught = true;
            // Verify error was caught
            expect(error.message).toContain("Operation failed");
        }

        expect(errorCaught).toBe(true);
    });
});

describe("executeWithStreamingStrategy", () => {
    it("should use chunked streaming for streamable operations", async () => {
        const mockBake = vi.fn((input, recipe) => {
            return Promise.resolve({ value: Buffer.from(input).toString("base64") });
        });

        const largeInput = "a".repeat(20000);
        const generator = executeWithStreamingStrategy(
            mockBake,
            "To Base64",
            largeInput,
            [],
            10000
        );

        const results = [];
        for await (const result of generator) {
            results.push(result);
        }

        expect(results.length).toBeGreaterThan(0);
    });

    it("should use progress streaming for progress operations", async () => {
        const mockBake = vi.fn((input, recipe) => {
            return Promise.resolve({ value: "compressed" });
        });

        const largeInput = "a".repeat(20000);
        const generator = executeWithStreamingStrategy(
            mockBake,
            "Gzip",
            largeInput,
            [],
            10000
        );

        const results = [];
        for await (const result of generator) {
            results.push(result);
        }

        expect(results.length).toBeGreaterThan(0);
    });

    it("should execute without streaming for small inputs", async () => {
        const mockBake = vi.fn((input, recipe) => {
            return Promise.resolve({ value: "result" });
        });

        const smallInput = "test";
        const generator = executeWithStreamingStrategy(
            mockBake,
            "To Base64",
            smallInput,
            [],
            10000
        );

        const results = [];
        for await (const result of generator) {
            results.push(result);
        }

        expect(results).toHaveLength(1);
        expect(results[0]._meta?.complete).toBe(true);
        expect(results[0]._meta?.streamed).toBe(false);
    });
});

describe("executeWithStreamingProgress", () => {
    it("should fall back to direct execution without progress token", async () => {
        const mockBake = vi.fn((input, recipe) => {
            return Promise.resolve({ value: "result123" });
        });

        const result = await executeWithStreamingProgress({
            bakeFunction: mockBake,
            operation: "To Base64",
            input: "test",
            recipeArgs: ["A-Za-z0-9+/="],
            recipe: [{ op: "To Base64", args: ["A-Za-z0-9+/="] }],
            server: null,
            progressToken: undefined,
            streamingEnabled: true,
            streamingThreshold: 10000,
            timeout: 5000,
            requestId: "test-1"
        });

        expect(result.value).toBe("result123");
        expect(mockBake).toHaveBeenCalled();
    });

    it("should fall back to direct execution when streaming is disabled", async () => {
        const mockBake = vi.fn((input, recipe) => {
            return Promise.resolve({ value: "disabled-stream" });
        });

        const result = await executeWithStreamingProgress({
            bakeFunction: mockBake,
            operation: "To Base64",
            input: "test",
            recipeArgs: [],
            recipe: [{ op: "To Base64", args: [] }],
            server: null,
            progressToken: "token-1",
            streamingEnabled: false,
            streamingThreshold: 10000,
            timeout: 5000,
            requestId: "test-2"
        });

        expect(result.value).toBe("disabled-stream");
    });

    it("should fall back when below streaming threshold", async () => {
        const mockBake = vi.fn((input, recipe) => {
            return Promise.resolve({ value: "small-result" });
        });

        const result = await executeWithStreamingProgress({
            bakeFunction: mockBake,
            operation: "To Base64",
            input: "tiny",
            recipeArgs: [],
            recipe: [{ op: "To Base64", args: [] }],
            server: { notification: vi.fn() },
            progressToken: "token-2",
            streamingEnabled: true,
            streamingThreshold: 10000,
            timeout: 5000,
            requestId: "test-3"
        });

        expect(result.value).toBe("small-result");
    });

    it("should send progress notifications for large streamable operations", async () => {
        const mockBake = vi.fn((input, recipe) => {
            return Promise.resolve({ value: Buffer.from(input).toString("base64") });
        });
        const mockServer = {
            notification: vi.fn().mockResolvedValue(undefined)
        };

        const largeInput = "a".repeat(20000);
        const result = await executeWithStreamingProgress({
            bakeFunction: mockBake,
            operation: "To Base64",
            input: largeInput,
            recipeArgs: [],
            recipe: [{ op: "To Base64", args: [] }],
            server: mockServer,
            progressToken: "progress-token-1",
            streamingEnabled: true,
            streamingThreshold: 10000,
            timeout: 30000,
            requestId: "test-4"
        });

        expect(result.value).toBeDefined();
        expect(result.value.length).toBeGreaterThan(0);
        // Should have sent progress notifications
        expect(mockServer.notification).toHaveBeenCalled();
        // First call should be initial progress (0)
        const firstCall = mockServer.notification.mock.calls[0][0];
        expect(firstCall.method).toBe("notifications/progress");
        expect(firstCall.params.progressToken).toBe("progress-token-1");
    });

    it("should handle progress notification failures gracefully", async () => {
        const mockBake = vi.fn((input, recipe) => {
            return Promise.resolve({ value: Buffer.from(input).toString("base64") });
        });
        const mockServer = {
            notification: vi.fn().mockRejectedValue(new Error("notification failed"))
        };

        const largeInput = "a".repeat(20000);
        // Should not throw even when notifications fail
        const result = await executeWithStreamingProgress({
            bakeFunction: mockBake,
            operation: "To Base64",
            input: largeInput,
            recipeArgs: [],
            recipe: [{ op: "To Base64", args: [] }],
            server: mockServer,
            progressToken: "token-fail",
            streamingEnabled: true,
            streamingThreshold: 10000,
            timeout: 30000,
            requestId: "test-5"
        });

        expect(result.value).toBeDefined();
    });

    it("should send progress for progress-only operations", async () => {
        const mockBake = vi.fn((input, recipe) => {
            return Promise.resolve({ value: "compressed" });
        });
        const mockServer = {
            notification: vi.fn().mockResolvedValue(undefined)
        };

        const largeInput = "b".repeat(20000);
        const result = await executeWithStreamingProgress({
            bakeFunction: mockBake,
            operation: "Gzip",
            input: largeInput,
            recipeArgs: [],
            recipe: [{ op: "Gzip", args: [] }],
            server: mockServer,
            progressToken: "progress-gzip",
            streamingEnabled: true,
            streamingThreshold: 10000,
            timeout: 30000,
            requestId: "test-6"
        });

        expect(result.value).toBeDefined();
        expect(mockServer.notification).toHaveBeenCalled();
    });
});
