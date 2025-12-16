/**
 * Test suite for CyberChef MCP Logging
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    initLogger,
    getLogger,
    getRequestContext,
    logRequestStart,
    logRequestComplete,
    logRequestError,
    logCache,
    logMemory,
    logStreaming,
    logRetry,
    logServerStart,
    logServerShutdown
} from "../../src/node/logger.mjs";
import { CyberChefMCPError, ErrorCodes } from "../../src/node/errors.mjs";

describe("Logger Initialization", () => {
    beforeEach(() => {
        // Reset logger
        initLogger({ version: "test" });
    });

    it("should initialize logger with options", () => {
        initLogger({ version: "1.0.0" });
        const logger = getLogger();

        expect(logger).toBeDefined();
        expect(typeof logger.info).toBe("function");
        expect(typeof logger.error).toBe("function");
        expect(typeof logger.warn).toBe("function");
        expect(typeof logger.debug).toBe("function");
    });

    it("should return same logger instance on subsequent calls", () => {
        const logger1 = getLogger();
        const logger2 = getLogger();

        expect(logger1).toBe(logger2);
    });

    it("should auto-initialize if not initialized", () => {
        const logger = getLogger();
        expect(logger).toBeDefined();
    });
});

describe("RequestContext", () => {
    beforeEach(() => {
        initLogger();
    });

    it("should create request context", () => {
        const ctx = getRequestContext();
        expect(ctx).toBeDefined();
    });

    it("should generate unique request IDs", () => {
        const ctx = getRequestContext();
        const id1 = ctx.generateRequestId();
        const id2 = ctx.generateRequestId();

        expect(id1).toBeDefined();
        expect(id2).toBeDefined();
        expect(id1).not.toBe(id2);
        expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it("should create context with tool name and args", () => {
        const ctx = getRequestContext();
        const context = ctx.createContext("test_tool", { input: "test" });

        expect(context.requestId).toBeDefined();
        expect(context.toolName).toBe("test_tool");
        expect(context.startTime).toBeDefined();
        expect(context.inputSize).toBeGreaterThan(0);
    });

    it("should calculate input size correctly", () => {
        const ctx = getRequestContext();
        const context = ctx.createContext("test", { input: "hello" });

        expect(context.inputSize).toBe(Buffer.byteLength("hello", "utf8"));
    });

    it("should handle missing input", () => {
        const ctx = getRequestContext();
        const context = ctx.createContext("test", {});

        expect(context.inputSize).toBe(0);
    });

    it("should retrieve context by ID", () => {
        const ctx = getRequestContext();
        const context = ctx.createContext("test", {});
        const retrieved = ctx.getContext(context.requestId);

        expect(retrieved).toEqual(context);
    });

    it("should return null for non-existent context", () => {
        const ctx = getRequestContext();
        const retrieved = ctx.getContext("non-existent-id");

        expect(retrieved).toBeNull();
    });

    it("should complete context and calculate duration", () => {
        const ctx = getRequestContext();
        const context = ctx.createContext("test", {});

        const completed = ctx.completeContext(context.requestId, { success: true });

        expect(completed.duration).toBeDefined();
        expect(completed.duration).toBeGreaterThanOrEqual(0);
        expect(completed.endTime).toBeDefined();
        expect(completed.success).toBe(true);
    });

    it("should return null when completing non-existent context", () => {
        const ctx = getRequestContext();
        const completed = ctx.completeContext("non-existent-id");

        expect(completed).toBeNull();
    });

    it("should clear all contexts", () => {
        const ctx = getRequestContext();
        ctx.createContext("test1", {});
        ctx.createContext("test2", {});

        ctx.clear();

        const retrieved = ctx.getContext("any-id");
        expect(retrieved).toBeNull();
    });
});

describe("Logging Functions", () => {
    let logger;
    let infoSpy;
    let errorSpy;
    let warnSpy;
    let debugSpy;

    beforeEach(() => {
        initLogger({ version: "test" });
        logger = getLogger();
        infoSpy = vi.spyOn(logger, "info");
        errorSpy = vi.spyOn(logger, "error");
        warnSpy = vi.spyOn(logger, "warn");
        debugSpy = vi.spyOn(logger, "debug");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("logRequestStart", () => {
        it("should log request start and return request ID", () => {
            const requestId = logRequestStart("test_tool", { input: "test" });

            expect(requestId).toBeDefined();
            expect(infoSpy).toHaveBeenCalled();
            expect(infoSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    requestId,
                    tool: "test_tool",
                    event: "request_start"
                }),
                expect.any(String)
            );
        });

        it("should handle empty args", () => {
            const requestId = logRequestStart("test_tool");

            expect(requestId).toBeDefined();
            expect(infoSpy).toHaveBeenCalled();
        });
    });

    describe("logRequestComplete", () => {
        it("should log request completion", () => {
            const requestId = logRequestStart("test_tool", { input: "test" });
            logRequestComplete(requestId, { outputSize: 100 });

            expect(infoSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    requestId,
                    event: "request_complete",
                    outputSize: 100
                }),
                expect.any(String)
            );
        });

        it("should warn when context not found", () => {
            logRequestComplete("non-existent-id", {});

            expect(warnSpy).toHaveBeenCalled();
        });

        it("should include duration in log", () => {
            const requestId = logRequestStart("test_tool", { input: "test" });
            logRequestComplete(requestId, {});

            expect(infoSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    duration: expect.any(Number)
                }),
                expect.any(String)
            );
        });
    });

    describe("logRequestError", () => {
        it("should log error with context", () => {
            const requestId = logRequestStart("test_tool", { input: "test" });
            const error = new CyberChefMCPError(ErrorCodes.TIMEOUT, "Timeout");

            logRequestError(requestId, error, { tool: "test_tool" });

            expect(errorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    requestId,
                    error: expect.objectContaining({
                        name: "CyberChefMCPError",
                        message: "Timeout",
                        code: ErrorCodes.TIMEOUT
                    }),
                    event: "request_error"
                }),
                expect.any(String)
            );
        });

        it("should handle generic errors", () => {
            const requestId = logRequestStart("test_tool");
            const error = new Error("Generic error");

            logRequestError(requestId, error, {});

            expect(errorSpy).toHaveBeenCalled();
        });

        it("should log error even without context", () => {
            const error = new CyberChefMCPError(ErrorCodes.INVALID_INPUT, "Bad input");

            logRequestError("fake-id", error, {});

            expect(errorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    requestId: "fake-id",
                    error: expect.any(Object)
                }),
                expect.any(String)
            );
        });
    });

    describe("logCache", () => {
        it("should log cache hit", () => {
            logCache("hit", { operation: "test" });

            expect(debugSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    cache: {
                        operation: "hit",
                        operation: "test"
                    },
                    event: "cache_operation"
                }),
                expect.any(String)
            );
        });

        it("should log cache miss", () => {
            logCache("miss", { operation: "test" });

            expect(debugSpy).toHaveBeenCalled();
        });

        it("should log cache set", () => {
            logCache("set", { key: "abc123" });

            expect(debugSpy).toHaveBeenCalled();
        });
    });

    describe("logMemory", () => {
        it("should log memory usage", () => {
            const usage = {
                heapUsed: 50 * 1024 * 1024,
                heapTotal: 100 * 1024 * 1024,
                rss: 150 * 1024 * 1024,
                external: 10 * 1024 * 1024
            };

            logMemory(usage);

            expect(debugSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    memory: expect.objectContaining({
                        heapUsed: 50,
                        heapTotal: 100,
                        rss: 150,
                        external: 10
                    }),
                    event: "memory_check"
                }),
                expect.any(String)
            );
        });
    });

    describe("logStreaming", () => {
        it("should log streaming operation", () => {
            logStreaming("To Base64", {
                inputSize: 10 * 1024 * 1024,
                strategy: "chunked"
            });

            expect(infoSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    streaming: expect.objectContaining({
                        operation: "To Base64",
                        inputSize: 10 * 1024 * 1024,
                        strategy: "chunked"
                    }),
                    event: "streaming_operation"
                }),
                expect.any(String)
            );
        });

        it("should handle unknown input size", () => {
            logStreaming("To Base64", {});

            expect(infoSpy).toHaveBeenCalled();
        });
    });

    describe("logRetry", () => {
        it("should log retry attempt", () => {
            logRetry("req-123", 1, 3, 1000);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    requestId: "req-123",
                    retry: {
                        attempt: 1,
                        maxRetries: 3,
                        delay: 1000
                    },
                    event: "retry_attempt"
                }),
                expect.any(String)
            );
        });
    });

    describe("logServerStart", () => {
        it("should log server startup with config", () => {
            const config = {
                version: "1.0.0",
                maxInputSize: 100 * 1024 * 1024,
                operationTimeout: 30000
            };

            logServerStart(config);

            expect(infoSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    config,
                    event: "server_start"
                }),
                expect.stringContaining("1.0.0")
            );
        });
    });

    describe("logServerShutdown", () => {
        it("should log server shutdown", () => {
            logServerShutdown();

            expect(infoSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: "server_shutdown"
                }),
                expect.any(String)
            );
        });
    });
});
