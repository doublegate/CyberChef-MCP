/**
 * Test suite for CyberChef MCP Error Handling
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect } from "vitest";
import {
    ErrorCodes,
    ErrorSuggestions,
    CyberChefMCPError,
    createInputError,
    createTimeoutError,
    createMemoryError,
    createOperationNotFoundError
} from "../../src/node/errors.mjs";

describe("ErrorCodes", () => {
    it("should export all error codes", () => {
        expect(ErrorCodes.INVALID_INPUT).toBe("INVALID_INPUT");
        expect(ErrorCodes.MISSING_ARGUMENT).toBe("MISSING_ARGUMENT");
        expect(ErrorCodes.OPERATION_FAILED).toBe("OPERATION_FAILED");
        expect(ErrorCodes.TIMEOUT).toBe("TIMEOUT");
        expect(ErrorCodes.OUT_OF_MEMORY).toBe("OUT_OF_MEMORY");
        expect(ErrorCodes.UNSUPPORTED_OPERATION).toBe("UNSUPPORTED_OPERATION");
        expect(ErrorCodes.CACHE_ERROR).toBe("CACHE_ERROR");
        expect(ErrorCodes.STREAMING_ERROR).toBe("STREAMING_ERROR");
    });
});

describe("ErrorSuggestions", () => {
    it("should provide suggestions for all error codes", () => {
        Object.values(ErrorCodes).forEach(code => {
            expect(ErrorSuggestions[code]).toBeDefined();
            expect(Array.isArray(ErrorSuggestions[code])).toBe(true);
            expect(ErrorSuggestions[code].length).toBeGreaterThan(0);
        });
    });

    it("should have meaningful suggestions", () => {
        expect(ErrorSuggestions[ErrorCodes.TIMEOUT]).toContain("Reduce input size and retry");
        expect(ErrorSuggestions[ErrorCodes.OUT_OF_MEMORY]).toContain("Reduce input size");
        expect(ErrorSuggestions[ErrorCodes.INVALID_INPUT]).toContain("Verify input data format and encoding");
    });
});

describe("CyberChefMCPError", () => {
    describe("constructor", () => {
        it("should create error with required fields", () => {
            const error = new CyberChefMCPError(
                ErrorCodes.INVALID_INPUT,
                "Test error message"
            );

            expect(error.name).toBe("CyberChefMCPError");
            expect(error.code).toBe(ErrorCodes.INVALID_INPUT);
            expect(error.message).toBe("Test error message");
            expect(error.context).toEqual({});
            expect(error.suggestions).toEqual(ErrorSuggestions[ErrorCodes.INVALID_INPUT]);
            expect(error.timestamp).toBeDefined();
            expect(error.isRetryable).toBeDefined();
        });

        it("should accept custom context", () => {
            const context = { foo: "bar", num: 42 };
            const error = new CyberChefMCPError(
                ErrorCodes.OPERATION_FAILED,
                "Operation failed",
                context
            );

            expect(error.context).toEqual(context);
        });

        it("should accept custom suggestions", () => {
            const suggestions = ["Try this", "Try that"];
            const error = new CyberChefMCPError(
                ErrorCodes.OPERATION_FAILED,
                "Operation failed",
                {},
                suggestions
            );

            expect(error.suggestions).toEqual(suggestions);
        });

        it("should use default suggestions when none provided", () => {
            const error = new CyberChefMCPError(
                ErrorCodes.TIMEOUT,
                "Timeout"
            );

            expect(error.suggestions).toEqual(ErrorSuggestions[ErrorCodes.TIMEOUT]);
        });
    });

    describe("determineRetryable", () => {
        it("should mark timeout errors as retryable", () => {
            const error = new CyberChefMCPError(ErrorCodes.TIMEOUT, "Timeout");
            expect(error.isRetryable).toBe(true);
        });

        it("should mark memory errors as retryable", () => {
            const error = new CyberChefMCPError(ErrorCodes.OUT_OF_MEMORY, "OOM");
            expect(error.isRetryable).toBe(true);
        });

        it("should mark cache errors as retryable", () => {
            const error = new CyberChefMCPError(ErrorCodes.CACHE_ERROR, "Cache error");
            expect(error.isRetryable).toBe(true);
        });

        it("should mark input errors as non-retryable", () => {
            const error = new CyberChefMCPError(ErrorCodes.INVALID_INPUT, "Bad input");
            expect(error.isRetryable).toBe(false);
        });

        it("should mark operation failures as non-retryable", () => {
            const error = new CyberChefMCPError(ErrorCodes.OPERATION_FAILED, "Failed");
            expect(error.isRetryable).toBe(false);
        });
    });

    describe("toMCPError", () => {
        it("should format error as MCP error response", () => {
            const error = new CyberChefMCPError(
                ErrorCodes.INVALID_INPUT,
                "Test error",
                { input: "bad" }
            );

            const mcpError = error.toMCPError();

            expect(mcpError.isError).toBe(true);
            expect(mcpError.content).toHaveLength(1);
            expect(mcpError.content[0].type).toBe("text");
            expect(mcpError.content[0].text).toContain("Error [INVALID_INPUT]: Test error");
        });

        it("should include context in MCP error", () => {
            const error = new CyberChefMCPError(
                ErrorCodes.TIMEOUT,
                "Timeout occurred",
                { timeout: 5000 }
            );

            const mcpError = error.toMCPError();
            expect(mcpError.content[0].text).toContain("Context:");
            expect(mcpError.content[0].text).toContain("timeout");
        });

        it("should include suggestions in MCP error", () => {
            const error = new CyberChefMCPError(
                ErrorCodes.TIMEOUT,
                "Timeout"
            );

            const mcpError = error.toMCPError();
            expect(mcpError.content[0].text).toContain("Suggestions:");
            expect(mcpError.content[0].text).toContain("Reduce input size and retry");
        });
    });

    describe("formatErrorMessage", () => {
        it("should format basic error message", () => {
            const error = new CyberChefMCPError(
                ErrorCodes.OPERATION_FAILED,
                "Failed to process"
            );

            const message = error.formatErrorMessage();

            expect(message).toContain("Error [OPERATION_FAILED]: Failed to process");
            expect(message).toContain("Timestamp:");
        });

        it("should include context in formatted message", () => {
            const error = new CyberChefMCPError(
                ErrorCodes.INVALID_INPUT,
                "Bad input",
                { field: "name", value: 123 }
            );

            const message = error.formatErrorMessage();

            expect(message).toContain("Context:");
            expect(message).toContain("field");
            expect(message).toContain("name");
        });

        it("should truncate long context values", () => {
            const longValue = "a".repeat(200);
            const error = new CyberChefMCPError(
                ErrorCodes.INVALID_INPUT,
                "Bad input",
                { data: longValue }
            );

            const message = error.formatErrorMessage();

            expect(message).toContain("...");
            expect(message.indexOf(longValue)).toBe(-1);
        });

        it("should include suggestions in formatted message", () => {
            const error = new CyberChefMCPError(
                ErrorCodes.TIMEOUT,
                "Timeout"
            );

            const message = error.formatErrorMessage();

            expect(message).toContain("Suggestions:");
            expect(message).toMatch(/\d+\./);
        });
    });

    describe("toLogObject", () => {
        it("should convert to structured log object", () => {
            const error = new CyberChefMCPError(
                ErrorCodes.TIMEOUT,
                "Timeout",
                { duration: 5000 }
            );

            const logObj = error.toLogObject();

            expect(logObj.error).toBeDefined();
            expect(logObj.error.name).toBe("CyberChefMCPError");
            expect(logObj.error.code).toBe(ErrorCodes.TIMEOUT);
            expect(logObj.error.message).toBe("Timeout");
            expect(logObj.error.context).toEqual({ duration: 5000 });
            expect(logObj.error.isRetryable).toBe(true);
            expect(logObj.error.stack).toBeDefined();
        });
    });

    describe("fromError", () => {
        it("should convert generic Error to CyberChefMCPError", () => {
            const genericError = new Error("Something went wrong");
            const mcpError = CyberChefMCPError.fromError(genericError);

            expect(mcpError).toBeInstanceOf(CyberChefMCPError);
            expect(mcpError.message).toBe("Something went wrong");
            expect(mcpError.code).toBe(ErrorCodes.OPERATION_FAILED);
        });

        it("should detect timeout errors from message", () => {
            const timeoutError = new Error("Operation timed out");
            const mcpError = CyberChefMCPError.fromError(timeoutError);

            expect(mcpError.code).toBe(ErrorCodes.TIMEOUT);
        });

        it("should detect memory errors from message", () => {
            const memError = new Error("Out of memory");
            const mcpError = CyberChefMCPError.fromError(memError);

            expect(mcpError.code).toBe(ErrorCodes.OUT_OF_MEMORY);
        });

        it("should detect invalid input from message", () => {
            const invalidError = new Error("invalid data format");
            const mcpError = CyberChefMCPError.fromError(invalidError);

            expect(mcpError.code).toBe(ErrorCodes.INVALID_INPUT);
        });

        it("should detect missing argument from message", () => {
            const missingError = new Error("missing required field");
            const mcpError = CyberChefMCPError.fromError(missingError);

            expect(mcpError.code).toBe(ErrorCodes.MISSING_ARGUMENT);
        });

        it("should preserve original stack trace", () => {
            const genericError = new Error("Test error");
            const mcpError = CyberChefMCPError.fromError(genericError);

            expect(mcpError.stack).toBeDefined();
            expect(mcpError.stack).toContain("Error: Test error");
        });

        it("should include context in converted error", () => {
            const genericError = new Error("Test");
            const context = { requestId: "123" };
            const mcpError = CyberChefMCPError.fromError(genericError, context);

            expect(mcpError.context.requestId).toBe("123");
            expect(mcpError.context.originalError).toBe("Error");
        });
    });
});

describe("Helper Functions", () => {
    describe("createInputError", () => {
        it("should create input validation error", () => {
            const error = createInputError("Invalid input", { field: "name" });

            expect(error).toBeInstanceOf(CyberChefMCPError);
            expect(error.code).toBe(ErrorCodes.INVALID_INPUT);
            expect(error.message).toBe("Invalid input");
            expect(error.context).toEqual({ field: "name" });
        });

        it("should work without context", () => {
            const error = createInputError("Invalid input");

            expect(error.context).toEqual({});
        });
    });

    describe("createTimeoutError", () => {
        it("should create timeout error", () => {
            const error = createTimeoutError(5000);

            expect(error).toBeInstanceOf(CyberChefMCPError);
            expect(error.code).toBe(ErrorCodes.TIMEOUT);
            expect(error.message).toContain("5000ms");
            expect(error.context.timeout).toBe(5000);
        });

        it("should include additional context", () => {
            const error = createTimeoutError(5000, { operation: "test" });

            expect(error.context.timeout).toBe(5000);
            expect(error.context.operation).toBe("test");
        });
    });

    describe("createMemoryError", () => {
        it("should create memory error", () => {
            const error = createMemoryError();

            expect(error).toBeInstanceOf(CyberChefMCPError);
            expect(error.code).toBe(ErrorCodes.OUT_OF_MEMORY);
            expect(error.message).toContain("memory");
        });

        it("should include context", () => {
            const error = createMemoryError({ heapUsed: 1000 });

            expect(error.context.heapUsed).toBe(1000);
        });
    });

    describe("createOperationNotFoundError", () => {
        it("should create operation not found error", () => {
            const error = createOperationNotFoundError("cyberchef_invalid");

            expect(error).toBeInstanceOf(CyberChefMCPError);
            expect(error.code).toBe(ErrorCodes.UNSUPPORTED_OPERATION);
            expect(error.message).toContain("cyberchef_invalid");
            expect(error.context.operation).toBe("cyberchef_invalid");
        });

        it("should include additional context", () => {
            const error = createOperationNotFoundError("test", { requestId: "123" });

            expect(error.context.operation).toBe("test");
            expect(error.context.requestId).toBe("123");
        });
    });
});
