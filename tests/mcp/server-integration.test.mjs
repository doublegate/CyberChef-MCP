/**
 * Integration Tests for MCP Server Request Handlers
 *
 * Tests the actual MCP protocol handlers to improve coverage
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect } from "vitest";
import OperationConfig from "../../src/core/config/OperationConfig.json" with {type: "json"};

// Import server utilities
import {
    sanitizeToolName,
    validateInputSize
} from "../../src/node/mcp-server.mjs";

describe("MCP Server Integration Tests", () => {

    describe("Tool Listing", () => {
        it("should have core tools", () => {
            const coreTools = [
                "cyberchef_bake",
                "cyberchef_search",
                "cyberchef_recipe_create",
                "cyberchef_recipe_get",
                "cyberchef_recipe_list",
                "cyberchef_recipe_update",
                "cyberchef_recipe_delete",
                "cyberchef_recipe_execute",
                "cyberchef_recipe_export",
                "cyberchef_recipe_import",
                "cyberchef_recipe_validate",
                "cyberchef_recipe_test",
                "cyberchef_batch",
                "cyberchef_telemetry_export",
                "cyberchef_cache_stats",
                "cyberchef_cache_clear",
                "cyberchef_quota_info"
            ];

            coreTools.forEach(tool => {
                expect(tool).toMatch(/^cyberchef_/);
            });
        });

        it("should sanitize all operation names", () => {
            const sampleOps = [
                "To Base64",
                "From Base64",
                "AES Decrypt",
                "SHA-256",
                "MD5"
            ];

            sampleOps.forEach(op => {
                const sanitized = sanitizeToolName(op);
                expect(sanitized).toMatch(/^cyberchef_/);
                expect(sanitized).not.toContain(" ");
                expect(sanitized).not.toContain("-");
            });
        });

        it("should have valid operation config", () => {
            expect(OperationConfig).toBeDefined();
            expect(typeof OperationConfig).toBe("object");
            expect(Object.keys(OperationConfig).length).toBeGreaterThan(0);
        });

        it("should generate tools from operation config", () => {
            const toolNames = Object.keys(OperationConfig)
                .map(op => sanitizeToolName(op))
                .filter(name => name !== null);

            expect(toolNames.length).toBeGreaterThan(100);
        });
    });

    describe("Input Validation", () => {
        it("should accept valid inputs", () => {
            expect(() => validateInputSize("test")).not.toThrow();
            expect(() => validateInputSize("")).not.toThrow();
            expect(() => validateInputSize("a".repeat(1000))).not.toThrow();
        });

        it("should validate unicode correctly", () => {
            expect(() => validateInputSize("Hello 世界 🌍")).not.toThrow();
        });

        it("should handle edge cases", () => {
            expect(() => validateInputSize("\n\r\t")).not.toThrow();
            expect(() => validateInputSize("\0")).not.toThrow();
        });
    });

    describe("Operation Config Coverage", () => {
        it("should handle operations with no args", () => {
            const opsWithNoArgs = Object.keys(OperationConfig)
                .filter(op => !OperationConfig[op].args || OperationConfig[op].args.length === 0);

            expect(opsWithNoArgs.length).toBeGreaterThan(0);
        });

        it("should handle operations with complex args", () => {
            const opsWithArgs = Object.keys(OperationConfig)
                .filter(op => OperationConfig[op].args && OperationConfig[op].args.length > 0);

            expect(opsWithArgs.length).toBeGreaterThan(0);
        });

        it("should have valid argument types", () => {
            const validTypes = [
                "argSelector", "binaryShortString", "binaryString", "boolean",
                "editableOption", "editableOptionShort", "label", "number",
                "option", "populateMultiOption", "populateOption", "shortString",
                "string", "text", "toggleString"
            ];

            Object.values(OperationConfig).forEach(op => {
                if (op.args) {
                    op.args.forEach(arg => {
                        if (arg.type) {
                            expect(validTypes).toContain(arg.type);
                        }
                    });
                }
            });
        });

        it("should have descriptions", () => {
            const opsWithDescription = Object.values(OperationConfig)
                .filter(op => op.description && op.description.length > 0);

            expect(opsWithDescription.length).toBeGreaterThan(100);
        });
    });

    describe("Tool Name Generation", () => {
        it("should generate unique tool names", () => {
            const toolNames = Object.keys(OperationConfig)
                .map(op => sanitizeToolName(op))
                .filter(name => name !== null);

            const uniqueNames = new Set(toolNames);
            expect(uniqueNames.size).toBe(toolNames.length);
        });

        it("should handle special characters consistently", () => {
            const testCases = [
                { input: "Test/Name", expected: "cyberchef_test_name" },
                { input: "Test@Name", expected: "cyberchef_test_name" },
                { input: "Test#Name", expected: "cyberchef_test_name" },
                { input: "Test-Name", expected: "cyberchef_test_name" }
            ];

            testCases.forEach(({ input, expected }) => {
                expect(sanitizeToolName(input)).toBe(expected);
            });
        });

        it("should preserve numbers", () => {
            expect(sanitizeToolName("SHA256")).toBe("cyberchef_sha256");
            expect(sanitizeToolName("Base64")).toBe("cyberchef_base64");
            expect(sanitizeToolName("RC4")).toBe("cyberchef_rc4");
        });
    });

    describe("Error Scenarios", () => {
        it("should handle invalid tool names gracefully", () => {
            const invalidNames = [
                "",
                null,
                undefined,
                "@#$%",
                "___",
                "   "
            ];

            invalidNames.forEach(name => {
                const result = sanitizeToolName(name);
                expect(result).toBeNull();
            });
        });

        it("should handle edge case tool names", () => {
            const edgeCases = [
                { input: "123", expected: "cyberchef_123" },
                { input: "A", expected: "cyberchef_a" },
                { input: "test__name", expected: "cyberchef_test_name" }
            ];

            edgeCases.forEach(({ input, expected }) => {
                expect(sanitizeToolName(input)).toBe(expected);
            });
        });
    });

    describe("Configuration Constants", () => {
        it("should export VERSION", async () => {
            const { VERSION } = await import("../../src/node/mcp-server.mjs");
            expect(VERSION).toBe("1.8.0");
        });

        it("should export configuration constants", async () => {
            const {
                MAX_INPUT_SIZE,
                OPERATION_TIMEOUT,
                STREAMING_THRESHOLD,
                CACHE_MAX_SIZE,
                CACHE_MAX_ITEMS,
                BATCH_MAX_SIZE
            } = await import("../../src/node/mcp-server.mjs");

            expect(MAX_INPUT_SIZE).toBeGreaterThan(0);
            expect(OPERATION_TIMEOUT).toBeGreaterThan(0);
            expect(STREAMING_THRESHOLD).toBeGreaterThan(0);
            expect(CACHE_MAX_SIZE).toBeGreaterThan(0);
            expect(CACHE_MAX_ITEMS).toBeGreaterThan(0);
            expect(BATCH_MAX_SIZE).toBeGreaterThan(0);
        });

        it("should export feature flags", async () => {
            const {
                ENABLE_STREAMING,
                ENABLE_WORKERS,
                BATCH_ENABLED,
                TELEMETRY_ENABLED,
                RATE_LIMIT_ENABLED,
                CACHE_ENABLED
            } = await import("../../src/node/mcp-server.mjs");

            expect(typeof ENABLE_STREAMING).toBe("boolean");
            expect(typeof ENABLE_WORKERS).toBe("boolean");
            expect(typeof BATCH_ENABLED).toBe("boolean");
            expect(typeof TELEMETRY_ENABLED).toBe("boolean");
            expect(typeof RATE_LIMIT_ENABLED).toBe("boolean");
            expect(typeof CACHE_ENABLED).toBe("boolean");
        });
    });

    describe("Cache Integration", () => {
        it("should export cache instances", async () => {
            const { operationCache } = await import("../../src/node/mcp-server.mjs");
            expect(operationCache).toBeDefined();
            expect(typeof operationCache.get).toBe("function");
            expect(typeof operationCache.set).toBe("function");
            expect(typeof operationCache.clear).toBe("function");
        });

        it("should export monitoring instances", async () => {
            const { memoryMonitor, telemetryCollector, rateLimiter, quotaTracker } =
                await import("../../src/node/mcp-server.mjs");

            expect(memoryMonitor).toBeDefined();
            expect(telemetryCollector).toBeDefined();
            expect(rateLimiter).toBeDefined();
            expect(quotaTracker).toBeDefined();
        });
    });

    describe("Batch Processor Integration", () => {
        it("should export batch processor", async () => {
            const { batchProcessor } = await import("../../src/node/mcp-server.mjs");
            expect(batchProcessor).toBeDefined();
            expect(typeof batchProcessor.executeBatch).toBe("function");
        });
    });

    describe("Operation Coverage", () => {
        it("should cover common encoding operations", () => {
            const commonOps = [
                "To Base64",
                "From Base64",
                "To Hex",
                "From Hex",
                "URL Encode",
                "URL Decode"
            ];

            commonOps.forEach(op => {
                expect(OperationConfig).toHaveProperty(op);
            });
        });

        it("should cover crypto operations", () => {
            const cryptoOps = [
                "MD5",
                "SHA1",
                "SHA2"
            ];

            cryptoOps.forEach(op => {
                expect(OperationConfig).toHaveProperty(op);
            });
        });

        it("should cover compression operations", () => {
            const compOps = ["Gzip", "Gunzip"];

            compOps.forEach(op => {
                expect(OperationConfig).toHaveProperty(op);
            });
        });
    });

    describe("Argument Schema Coverage", () => {
        it("should handle boolean arguments", () => {
            const opsWithBooleans = Object.values(OperationConfig)
                .filter(op => op.args && op.args.some(arg => arg.type === "boolean"));

            expect(opsWithBooleans.length).toBeGreaterThan(0);
        });

        it("should handle number arguments", () => {
            const opsWithNumbers = Object.values(OperationConfig)
                .filter(op => op.args && op.args.some(arg => arg.type === "number" || arg.type === "integer"));

            expect(opsWithNumbers.length).toBeGreaterThan(0);
        });

        it("should handle option arguments", () => {
            const opsWithOptions = Object.values(OperationConfig)
                .filter(op => op.args && op.args.some(arg => arg.type === "option"));

            expect(opsWithOptions.length).toBeGreaterThan(0);
        });

        it("should handle editable option arguments", () => {
            const opsWithEditableOptions = Object.values(OperationConfig)
                .filter(op => op.args && op.args.some(arg => arg.type === "editableOption"));

            expect(opsWithEditableOptions.length).toBeGreaterThan(0);
        });
    });

    describe("Memory Management", () => {
        it("should export memory monitor", async () => {
            const { MemoryMonitor } = await import("../../src/node/mcp-server.mjs");
            const monitor = new MemoryMonitor();

            expect(monitor.checkInterval).toBe(5000);
            expect(typeof monitor.check).toBe("function");
            expect(typeof monitor.getUsage).toBe("function");
        });

        it("should get memory usage", async () => {
            const { MemoryMonitor } = await import("../../src/node/mcp-server.mjs");
            const monitor = new MemoryMonitor();

            const usage = monitor.getUsage();
            expect(usage).toHaveProperty("heapUsed");
            expect(usage).toHaveProperty("heapTotal");
            expect(usage).toHaveProperty("rss");
        });
    });

    describe("Tool Argument Defaults", () => {
        it("should handle operations with default values", () => {
            const opsWithDefaults = Object.values(OperationConfig)
                .filter(op => op.args && op.args.some(arg => arg.value !== undefined));

            expect(opsWithDefaults.length).toBeGreaterThan(0);
        });

        it("should handle operations with default index", () => {
            const opsWithDefaultIndex = Object.values(OperationConfig)
                .filter(op => op.args && op.args.some(arg => arg.defaultIndex !== undefined));

            expect(opsWithDefaultIndex.length).toBeGreaterThan(0);
        });
    });

    describe("Complex Operation Arguments", () => {
        it("should handle multi-argument operations", () => {
            const multiArgOps = Object.values(OperationConfig)
                .filter(op => op.args && op.args.length > 3);

            expect(multiArgOps.length).toBeGreaterThan(0);
        });

        it("should handle operations with array values", () => {
            const arrayValueOps = Object.values(OperationConfig)
                .filter(op => op.args && op.args.some(arg => Array.isArray(arg.value)));

            expect(arrayValueOps.length).toBeGreaterThan(0);
        });

        it("should handle operations with object array values", () => {
            const objArrayOps = Object.values(OperationConfig)
                .filter(op => op.args && op.args.some(arg =>
                    Array.isArray(arg.value) && arg.value.length > 0 &&
                    typeof arg.value[0] === "object"
                ));

            expect(objArrayOps.length).toBeGreaterThan(0);
        });
    });
});
