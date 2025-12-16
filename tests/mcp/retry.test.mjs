/**
 * Test suite for CyberChef MCP Retry Logic
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    RetryConfig,
    isRetryableError,
    calculateBackoff,
    sleep,
    executeWithRetry,
    executeWithTimeoutAndRetry,
    CircuitBreaker
} from "../../src/node/retry.mjs";
import { CyberChefMCPError, ErrorCodes } from "../../src/node/errors.mjs";

describe("RetryConfig", () => {
    it("should have default configuration", () => {
        expect(RetryConfig.MAX_RETRIES).toBeGreaterThan(0);
        expect(RetryConfig.INITIAL_BACKOFF).toBeGreaterThan(0);
        expect(RetryConfig.MAX_BACKOFF).toBeGreaterThan(0);
        expect(RetryConfig.BACKOFF_MULTIPLIER).toBeGreaterThan(1);
    });
});

describe("isRetryableError", () => {
    it("should identify retryable CyberChefMCPError", () => {
        const timeoutError = new CyberChefMCPError(ErrorCodes.TIMEOUT, "Timeout");
        expect(isRetryableError(timeoutError)).toBe(true);

        const memoryError = new CyberChefMCPError(ErrorCodes.OUT_OF_MEMORY, "OOM");
        expect(isRetryableError(memoryError)).toBe(true);

        const cacheError = new CyberChefMCPError(ErrorCodes.CACHE_ERROR, "Cache error");
        expect(isRetryableError(cacheError)).toBe(true);
    });

    it("should identify non-retryable CyberChefMCPError", () => {
        const inputError = new CyberChefMCPError(ErrorCodes.INVALID_INPUT, "Bad input");
        expect(isRetryableError(inputError)).toBe(false);

        const opError = new CyberChefMCPError(ErrorCodes.OPERATION_FAILED, "Failed");
        expect(isRetryableError(opError)).toBe(false);
    });

    it("should identify retryable generic errors by message", () => {
        expect(isRetryableError(new Error("Operation timed out"))).toBe(true);
        expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
        expect(isRetryableError(new Error("ETIMEDOUT"))).toBe(true);
        expect(isRetryableError(new Error("Network error"))).toBe(true);
        expect(isRetryableError(new Error("Out of memory"))).toBe(true);
    });

    it("should identify non-retryable generic errors", () => {
        expect(isRetryableError(new Error("Invalid syntax"))).toBe(false);
        expect(isRetryableError(new Error("Not found"))).toBe(false);
    });
});

describe("calculateBackoff", () => {
    it("should calculate exponential backoff", () => {
        const backoff0 = calculateBackoff(0);
        const backoff1 = calculateBackoff(1);
        const backoff2 = calculateBackoff(2);

        expect(backoff1).toBeGreaterThan(backoff0);
        expect(backoff2).toBeGreaterThan(backoff1);
    });

    it("should respect max backoff limit", () => {
        const backoff = calculateBackoff(100);
        expect(backoff).toBeLessThanOrEqual(RetryConfig.MAX_BACKOFF * 1.25); // Allow for jitter
    });

    it("should add jitter to prevent thundering herd", () => {
        const backoff1 = calculateBackoff(0);
        const backoff2 = calculateBackoff(0);

        // Due to jitter, values should differ (with very high probability)
        // Note: This could theoretically fail but is extremely unlikely
        expect(backoff1).not.toBe(backoff2);
    });

    it("should accept custom config", () => {
        const customConfig = {
            INITIAL_BACKOFF: 500,
            MAX_BACKOFF: 5000,
            BACKOFF_MULTIPLIER: 3
        };

        const backoff = calculateBackoff(0, customConfig);
        expect(backoff).toBeGreaterThan(0);
        expect(backoff).toBeLessThanOrEqual(customConfig.MAX_BACKOFF * 1.25);
    });
});

describe("sleep", () => {
    it("should sleep for specified duration", async () => {
        const start = Date.now();
        await sleep(50);
        const duration = Date.now() - start;

        expect(duration).toBeGreaterThanOrEqual(45); // Allow some margin
        expect(duration).toBeLessThan(100);
    });

    it("should return a promise", () => {
        const promise = sleep(1);
        expect(promise).toBeInstanceOf(Promise);
    });
});

describe("executeWithRetry", () => {
    it("should succeed on first try", async () => {
        const fn = vi.fn().mockResolvedValue("success");

        const result = await executeWithRetry(fn, { requestId: "test" });

        expect(result).toBe("success");
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on retryable error", async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new CyberChefMCPError(ErrorCodes.TIMEOUT, "Timeout"))
            .mockResolvedValue("success");

        const result = await executeWithRetry(fn, {
            requestId: "test",
            maxRetries: 3
        });

        expect(result).toBe("success");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should not retry on non-retryable error", async () => {
        const fn = vi.fn()
            .mockRejectedValue(new CyberChefMCPError(ErrorCodes.INVALID_INPUT, "Bad input"));

        await expect(executeWithRetry(fn, { requestId: "test" })).rejects.toThrow("Bad input");
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should exhaust retries and throw", async () => {
        const fn = vi.fn()
            .mockRejectedValue(new CyberChefMCPError(ErrorCodes.TIMEOUT, "Timeout"));

        await expect(executeWithRetry(fn, {
            requestId: "test",
            maxRetries: 2
        })).rejects.toThrow("Timeout");

        expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("should add retry context to error", async () => {
        const fn = vi.fn()
            .mockRejectedValue(new CyberChefMCPError(ErrorCodes.TIMEOUT, "Timeout"));

        try {
            await executeWithRetry(fn, {
                requestId: "test",
                maxRetries: 1,
                context: { tool: "test_tool" }
            });
        } catch (error) {
            expect(error.context.retries).toBe(1);
            expect(error.context.maxRetries).toBe(1);
            expect(error.context.tool).toBe("test_tool");
        }
    });

    it("should convert generic errors to CyberChefMCPError on retry exhaustion", async () => {
        // Use lowercase "timeout" to match the case-sensitive check in fromError
        const fn = vi.fn()
            .mockRejectedValue(new Error("Operation timed out"));

        try {
            await executeWithRetry(fn, {
                requestId: "test",
                maxRetries: 1
            });
        } catch (error) {
            expect(error).toBeInstanceOf(CyberChefMCPError);
            expect(error.code).toBe(ErrorCodes.TIMEOUT);
        }
    });
});

describe("executeWithTimeoutAndRetry", () => {
    it("should execute function successfully", async () => {
        const fn = vi.fn().mockResolvedValue("result");

        const result = await executeWithTimeoutAndRetry(fn, 1000, {
            requestId: "test"
        });

        expect(result).toBe("result");
    });

    it("should timeout if function takes too long", async () => {
        const fn = vi.fn(() => new Promise(resolve => setTimeout(() => resolve("late"), 200)));

        await expect(executeWithTimeoutAndRetry(fn, 50, {
            requestId: "test",
            maxRetries: 0
        })).rejects.toThrow(/timed out/);
    });

    it("should retry on timeout", async () => {
        let callCount = 0;
        const fn = vi.fn(() => {
            callCount++;
            if (callCount === 1) {
                return new Promise(resolve => setTimeout(() => resolve("late"), 200));
            }
            return Promise.resolve("success");
        });

        const result = await executeWithTimeoutAndRetry(fn, 50, {
            requestId: "test",
            maxRetries: 1
        });

        expect(result).toBe("success");
        expect(fn).toHaveBeenCalledTimes(2);
    });
});

describe("CircuitBreaker", () => {
    let breaker;

    beforeEach(() => {
        breaker = new CircuitBreaker({
            failureThreshold: 3,
            resetTimeout: 1000
        });
    });

    it("should initialize in CLOSED state", () => {
        expect(breaker.state).toBe("CLOSED");
        expect(breaker.isOpen()).toBe(false);
    });

    it("should execute function successfully", async () => {
        const fn = vi.fn().mockResolvedValue("success");

        const result = await breaker.execute(fn);

        expect(result).toBe("success");
        expect(breaker.failures).toBe(0);
        expect(breaker.state).toBe("CLOSED");
    });

    it("should record failures", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("Failed"));

        await expect(breaker.execute(fn)).rejects.toThrow("Failed");
        expect(breaker.failures).toBe(1);
    });

    it("should open circuit after threshold failures", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("Failed"));

        // Fail 3 times to reach threshold
        for (let i = 0; i < 3; i++) {
            try {
                await breaker.execute(fn);
            } catch (e) {
                // Expected
            }
        }

        expect(breaker.state).toBe("OPEN");
        expect(breaker.isOpen()).toBe(true);
    });

    it("should reject requests when circuit is open", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("Failed"));

        // Open the circuit
        for (let i = 0; i < 3; i++) {
            try {
                await breaker.execute(fn);
            } catch (e) {
                // Expected
            }
        }

        // Now circuit is open
        await expect(breaker.execute(fn)).rejects.toThrow(/Circuit breaker is OPEN/);
    });

    it("should transition to HALF_OPEN after reset timeout", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("Failed"));

        // Open the circuit
        for (let i = 0; i < 3; i++) {
            try {
                await breaker.execute(fn);
            } catch (e) {
                // Expected
            }
        }

        expect(breaker.state).toBe("OPEN");

        // Wait for reset timeout
        await sleep(1100);

        // Check if circuit transitions to HALF_OPEN
        expect(breaker.isOpen()).toBe(false);
        expect(breaker.state).toBe("HALF_OPEN");
    });

    it("should reset on successful execution", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("Failed"));

        // Record some failures
        for (let i = 0; i < 2; i++) {
            try {
                await breaker.execute(fn);
            } catch (e) {
                // Expected
            }
        }

        expect(breaker.failures).toBe(2);

        // Now succeed
        fn.mockResolvedValue("success");
        await breaker.execute(fn);

        expect(breaker.failures).toBe(0);
        expect(breaker.state).toBe("CLOSED");
    });

    it("should reset manually", () => {
        breaker.failures = 5;
        breaker.state = "OPEN";
        breaker.lastFailureTime = Date.now();

        breaker.reset();

        expect(breaker.failures).toBe(0);
        expect(breaker.state).toBe("CLOSED");
        expect(breaker.lastFailureTime).toBeNull();
    });

    it("should return status", () => {
        const status = breaker.getStatus();

        expect(status).toHaveProperty("state");
        expect(status).toHaveProperty("failures");
        expect(status).toHaveProperty("lastFailureTime");
        expect(status).toHaveProperty("threshold");
        expect(status).toHaveProperty("resetTimeout");
    });
});
