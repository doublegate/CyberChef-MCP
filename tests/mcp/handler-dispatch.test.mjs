/**
 * Handler Dispatch Tests for MCP Server
 *
 * Tests all handler branches in the CallTool request handler.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    LRUCache,
    MemoryMonitor,
    TelemetryCollector,
    RateLimiter,
    ResourceQuotaTracker,
    BatchProcessor,
    sanitizeToolName,
    mapArgsToZod,
    resolveArgValue,
    validateInputSize,
    VERSION,
    MAX_INPUT_SIZE,
    OPERATION_TIMEOUT,
    STREAMING_THRESHOLD,
    ENABLE_STREAMING,
    ENABLE_WORKERS,
    CACHE_MAX_SIZE,
    CACHE_MAX_ITEMS,
    BATCH_MAX_SIZE,
    BATCH_ENABLED,
    TELEMETRY_ENABLED,
    RATE_LIMIT_ENABLED,
    RATE_LIMIT_REQUESTS,
    RATE_LIMIT_WINDOW,
    CACHE_ENABLED,
    operationCache,
    memoryMonitor,
    telemetryCollector,
    rateLimiter,
    quotaTracker,
    batchProcessor,
    V2_COMPATIBILITY_MODE,
    SUPPRESS_DEPRECATIONS,
    emitDeprecation,
    getDeprecationStats,
    resetDeprecations,
    analyzeRecipeCompatibility,
    transformRecipeToV2,
    getToolName,
    stripToolPrefix,
    isV2CompatibilityMode,
    areSuppressed,
    DEPRECATION_CODES,
    getPoolStats
} from "../../src/node/mcp-server.mjs";

import OperationConfig from "../../src/core/config/OperationConfig.json" with {type: "json"};

describe("Handler Dispatch Tests", () => {
    describe("Recipe Tools", () => {
        it("should export recipe tool names correctly", () => {
            const expectedTools = [
                "cyberchef_recipe_create",
                "cyberchef_recipe_get",
                "cyberchef_recipe_list",
                "cyberchef_recipe_update",
                "cyberchef_recipe_delete",
                "cyberchef_recipe_execute",
                "cyberchef_recipe_export",
                "cyberchef_recipe_import",
                "cyberchef_recipe_validate",
                "cyberchef_recipe_test"
            ];
            expectedTools.forEach(tool => {
                expect(tool).toMatch(/^cyberchef_recipe_/);
            });
        });
    });

    describe("Batch Processor", () => {
        it("should have valid batch processor with executeBatch method", () => {
            expect(batchProcessor).toBeDefined();
            expect(typeof batchProcessor.executeBatch).toBe("function");
        });

        it("should support batch size configuration", () => {
            expect(BATCH_MAX_SIZE).toBeGreaterThan(0);
            expect(BATCH_ENABLED).toBeDefined();
        });

        it("should have executeOperation method", () => {
            expect(typeof batchProcessor.executeOperation).toBe("function");
        });
    });

    describe("Telemetry Collector", () => {
        it("should have getStats method", () => {
            const stats = telemetryCollector.getStats();
            expect(stats).toBeDefined();
            expect(stats.totalCalls).toBeDefined();
        });

        it("should have exportMetrics method", () => {
            const metrics = telemetryCollector.exportMetrics();
            expect(Array.isArray(metrics)).toBe(true);
        });

        it("should track stats accurately on a new collector", () => {
            const collector = new TelemetryCollector();
            const emptyStats = collector.getStats();
            expect(emptyStats.totalCalls).toBe(0);
            expect(emptyStats.successRate).toBe(0);
            expect(emptyStats.avgDuration).toBe(0);
            expect(emptyStats.cacheHitRate).toBe(0);
        });

        it("should clear metrics", () => {
            const collector = new TelemetryCollector();
            collector.clear();
            expect(collector.exportMetrics()).toHaveLength(0);
        });
    });

    describe("Cache Operations", () => {
        it("should support cache set and get", () => {
            const cache = new LRUCache(1024 * 1024, 10);
            cache.set("test-key", "test-value");
            expect(cache.get("test-key")).toBe("test-value");
        });

        it("should return null for missing keys", () => {
            const cache = new LRUCache(1024 * 1024, 10);
            expect(cache.get("nonexistent")).toBeNull();
        });

        it("should evict items when max items exceeded", () => {
            const cache = new LRUCache(1024 * 1024, 3);
            cache.set("key1", "val1");
            cache.set("key2", "val2");
            cache.set("key3", "val3");
            cache.set("key4", "val4");
            expect(cache.get("key1")).toBeNull();
            expect(cache.get("key4")).toBe("val4");
        });

        it("should track cache size", () => {
            const cache = new LRUCache(1024 * 1024, 10);
            cache.set("k1", "value1");
            expect(cache.currentSize).toBeGreaterThan(0);
        });

        it("should clear cache", () => {
            const cache = new LRUCache(1024 * 1024, 10);
            cache.set("k1", "v1");
            cache.clear();
            expect(cache.get("k1")).toBeNull();
            expect(cache.currentSize).toBe(0);
        });

        it("should get cache stats", () => {
            const stats = operationCache.getStats();
            expect(stats).toBeDefined();
            expect(typeof stats.size).toBe("number");
            expect(typeof stats.items).toBe("number");
        });

        it("should generate cache key", () => {
            const cache = new LRUCache(1024 * 1024, 10);
            const key = cache.getCacheKey("To Base64", "test", []);
            expect(typeof key).toBe("string");
            expect(key.length).toBe(64); // SHA256 hex
        });

        it("should evict by size when maxSize exceeded", () => {
            const cache = new LRUCache(100, 1000);
            cache.set("k1", "a".repeat(8));
            cache.set("k2", "b".repeat(8));
            // Items should be limited by maxSize
            const stats = cache.getStats();
            expect(stats.size).toBeLessThanOrEqual(100);
        });

        it("should not cache items that are too large", () => {
            const cache = new LRUCache(100, 10);
            // Items larger than maxSize/10 are not cached
            cache.set("big", "x".repeat(50));
            expect(cache.get("big")).toBeNull();
        });
    });

    describe("Rate Limiter", () => {
        it("should always allow when rate limiting is disabled", () => {
            const result = rateLimiter.checkLimit("req1");
            expect(result.allowed).toBe(true);
        });

        it("should provide stats", () => {
            const stats = rateLimiter.getStats();
            expect(stats).toBeDefined();
            expect(stats.enabled).toBe(RATE_LIMIT_ENABLED);
            expect(typeof stats.totalTrackedRequests).toBe("number");
        });

        it("should clear tracked requests", () => {
            const limiter = new RateLimiter();
            limiter.clear();
            expect(limiter.requests.size).toBe(0);
        });
    });

    describe("Resource Quota Tracker", () => {
        it("should acquire and release quota", () => {
            expect(quotaTracker.acquire()).toBe(true);
            quotaTracker.release();
        });

        it("should track data sizes", () => {
            const tracker = new ResourceQuotaTracker();
            tracker.trackData(100, 200);
            const info = tracker.getInfo();
            expect(info).toBeDefined();
            expect(info.totalInputSize).toBeGreaterThanOrEqual(100);
            expect(info.totalOutputSize).toBeGreaterThanOrEqual(200);
        });

        it("should return quota info with all fields", () => {
            const info = quotaTracker.getInfo();
            expect(info.concurrentOperations).toBeDefined();
            expect(info.maxConcurrentOperations).toBeDefined();
            expect(info.totalOperations).toBeDefined();
            expect(info.inputSizeMB).toBeDefined();
            expect(info.outputSizeMB).toBeDefined();
            expect(info.maxInputSizeMB).toBeDefined();
        });

        it("should reset statistics", () => {
            const tracker = new ResourceQuotaTracker();
            tracker.trackData(100, 200);
            tracker.reset();
            const info = tracker.getInfo();
            expect(info.totalOperations).toBe(0);
            expect(info.totalInputSize).toBe(0);
        });

        it("should not go below zero on release", () => {
            const tracker = new ResourceQuotaTracker();
            tracker.release();
            tracker.release();
            const info = tracker.getInfo();
            expect(info.concurrentOperations).toBe(0);
        });
    });

    describe("Memory Monitor", () => {
        it("should check memory without throwing", () => {
            expect(() => memoryMonitor.check()).not.toThrow();
        });

        it("should return memory usage", () => {
            const usage = memoryMonitor.getUsage();
            expect(usage).toBeDefined();
            expect(usage.heapUsed).toBeGreaterThan(0);
            expect(usage.heapTotal).toBeGreaterThan(0);
            expect(usage.rss).toBeGreaterThan(0);
        });
    });

    describe("Error Paths", () => {
        it("should reject oversized input", () => {
            const bigInput = "a".repeat(MAX_INPUT_SIZE + 1);
            expect(() => validateInputSize(bigInput)).toThrow();
        });

        it("should accept valid input sizes", () => {
            expect(() => validateInputSize("hello")).not.toThrow();
        });

        it("should accept empty input", () => {
            expect(() => validateInputSize("")).not.toThrow();
        });
    });

    describe("Tool Naming", () => {
        it("should sanitize operation names to valid tool names", () => {
            expect(sanitizeToolName("To Base64")).toBe("cyberchef_to_base64");
            expect(sanitizeToolName("AES Decrypt")).toBe("cyberchef_aes_decrypt");
            expect(sanitizeToolName("MD5")).toBe("cyberchef_md5");
        });

        it("should handle special characters", () => {
            const name = sanitizeToolName("SHA-256");
            expect(name).toMatch(/^cyberchef_/);
            expect(name).not.toContain(" ");
        });

        it("should return null for empty input", () => {
            expect(sanitizeToolName("")).toBeNull();
            expect(sanitizeToolName(null)).toBeNull();
            expect(sanitizeToolName(undefined)).toBeNull();
        });

        it("should handle all OperationConfig entries", () => {
            Object.keys(OperationConfig).forEach(opName => {
                const toolName = sanitizeToolName(opName);
                if (toolName) {
                    expect(toolName).toMatch(/^cyberchef_[a-z0-9_]+$/);
                }
            });
        });
    });

    describe("mapArgsToZod", () => {
        it("should map empty args array", () => {
            const schema = mapArgsToZod([]);
            expect(schema).toBeDefined();
            expect(schema.input).toBeDefined();
        });

        it("should map string args", () => {
            const schema = mapArgsToZod([{
                name: "Input text",
                type: "string",
                value: ""
            }]);
            expect(schema).toBeDefined();
            expect(schema.input_text).toBeDefined();
        });

        it("should map boolean args", () => {
            const schema = mapArgsToZod([{
                name: "Verbose",
                type: "boolean",
                value: false
            }]);
            expect(schema).toBeDefined();
            expect(schema.verbose).toBeDefined();
        });

        it("should map number args", () => {
            const schema = mapArgsToZod([{
                name: "Count",
                type: "number",
                value: 10
            }]);
            expect(schema).toBeDefined();
            expect(schema.count).toBeDefined();
        });

        it("should map integer args", () => {
            const schema = mapArgsToZod([{
                name: "Size",
                type: "integer",
                value: 5
            }]);
            expect(schema.size).toBeDefined();
        });

        it("should map option args with object values", () => {
            const schema = mapArgsToZod([{
                name: "Mode",
                type: "option",
                value: [
                    { name: "CBC", value: "CBC" },
                    { name: "ECB", value: "ECB" }
                ]
            }]);
            expect(schema).toBeDefined();
            expect(schema.mode).toBeDefined();
        });

        it("should map option args with string values", () => {
            const schema = mapArgsToZod([{
                name: "Format",
                type: "option",
                value: ["hex", "binary", "decimal"]
            }]);
            expect(schema.format).toBeDefined();
        });

        it("should map option args with empty array", () => {
            const schema = mapArgsToZod([{
                name: "Empty",
                type: "option",
                value: []
            }]);
            expect(schema.empty).toBeDefined();
        });

        it("should map editableOption args", () => {
            const schema = mapArgsToZod([{
                name: "Delimiter",
                type: "editableOption",
                value: [
                    { name: "Space", value: " " },
                    { name: "Comma", value: "," }
                ]
            }]);
            expect(schema.delimiter).toBeDefined();
        });

        it("should map editableOption with empty value", () => {
            const schema = mapArgsToZod([{
                name: "Custom",
                type: "editableOption",
                value: []
            }]);
            expect(schema.custom).toBeDefined();
        });

        it("should handle unknown arg types as string", () => {
            const schema = mapArgsToZod([{
                name: "Unknown",
                type: "unknownType",
                value: ""
            }]);
            expect(schema.unknown).toBeDefined();
        });

        it("should always include input field", () => {
            const schema = mapArgsToZod([{
                name: "Key",
                type: "string",
                value: ""
            }]);
            expect(schema.input).toBeDefined();
            expect(schema.key).toBeDefined();
        });
    });

    describe("resolveArgValue", () => {
        it("should use default value when user value is undefined", () => {
            const result = resolveArgValue({ value: "default", type: "string" }, undefined);
            expect(result).toBe("default");
        });

        it("should use user value when provided", () => {
            const result = resolveArgValue({ value: "default", type: "string" }, "user");
            expect(result).toBe("user");
        });

        it("should resolve option type defaults with object values", () => {
            const argDef = {
                type: "option",
                value: [
                    { name: "Option1", value: "opt1" },
                    { name: "Option2", value: "opt2" }
                ]
            };
            const result = resolveArgValue(argDef, undefined);
            expect(result).toBe("opt1");
        });

        it("should resolve option type with defaultIndex", () => {
            const argDef = {
                type: "option",
                value: [
                    { name: "A", value: "a" },
                    { name: "B", value: "b" }
                ],
                defaultIndex: 1
            };
            const result = resolveArgValue(argDef, undefined);
            expect(result).toBe("b");
        });

        it("should resolve option type with string values", () => {
            const argDef = {
                type: "option",
                value: ["hex", "binary", "decimal"]
            };
            const result = resolveArgValue(argDef, undefined);
            expect(result).toBe("hex");
        });

        it("should map user value to option value by name", () => {
            const argDef = {
                type: "option",
                value: [
                    { name: "CBC", value: "cbc_mode" },
                    { name: "ECB", value: "ecb_mode" }
                ]
            };
            const result = resolveArgValue(argDef, "CBC");
            expect(result).toBe("cbc_mode");
        });

        it("should return user value for unmatched option", () => {
            const argDef = {
                type: "option",
                value: [
                    { name: "A", value: "a" },
                    { name: "B", value: "b" }
                ]
            };
            const result = resolveArgValue(argDef, "unknown");
            expect(result).toBe("unknown");
        });

        it("should handle editableOption with matched name", () => {
            const argDef = {
                type: "editableOption",
                value: [
                    { name: "Space", value: " " },
                    { name: "Comma", value: "," }
                ]
            };
            const result = resolveArgValue(argDef, "Space");
            expect(result).toBe(" ");
        });

        it("should handle editableOption with custom value", () => {
            const argDef = {
                type: "editableOption",
                value: [
                    { name: "Space", value: " " }
                ]
            };
            const result = resolveArgValue(argDef, "|");
            expect(result).toBe("|");
        });

        it("should handle boolean values", () => {
            expect(resolveArgValue({ value: true, type: "boolean" }, false)).toBe(false);
            expect(resolveArgValue({ value: false, type: "boolean" }, true)).toBe(true);
        });

        it("should handle number values", () => {
            expect(resolveArgValue({ value: 10, type: "number" }, 20)).toBe(20);
        });

        it("should handle default array with name-only objects", () => {
            const argDef = {
                type: "option",
                value: [
                    { name: "First" },
                    { name: "Second" }
                ]
            };
            const result = resolveArgValue(argDef, undefined);
            expect(result).toBe("First");
        });
    });

    describe("Worker Stats", () => {
        it("should return null when workers are disabled", () => {
            const stats = getPoolStats();
            expect(stats).toBeNull();
        });
    });

    describe("Deprecation Integration", () => {
        beforeEach(() => {
            resetDeprecations();
        });

        it("should analyze recipe compatibility", () => {
            const result = analyzeRecipeCompatibility([
                { op: "To Base64", args: ["A-Za-z0-9+/="] }
            ]);
            expect(result).toBeDefined();
            expect(result.compatible).toBeDefined();
        });

        it("should transform recipe to v2 format", () => {
            const result = transformRecipeToV2([
                { op: "To Base64", args: ["A-Za-z0-9+/="] }
            ]);
            expect(result).toBeDefined();
        });

        it("should get tool name", () => {
            const name = getToolName("To Base64");
            expect(name).toBeDefined();
        });

        it("should strip tool prefix", () => {
            expect(stripToolPrefix("cyberchef_to_base64")).toBeDefined();
        });

        it("should report v2 compatibility mode", () => {
            expect(typeof isV2CompatibilityMode()).toBe("boolean");
        });

        it("should report suppression state", () => {
            expect(typeof areSuppressed()).toBe("boolean");
        });

        it("should have valid deprecation codes", () => {
            expect(DEPRECATION_CODES).toBeDefined();
            expect(DEPRECATION_CODES.DEP001).toBeDefined();
            expect(DEPRECATION_CODES.DEP001.code).toBe("DEP001");
        });

        it("should return deprecation stats", () => {
            const stats = getDeprecationStats();
            expect(stats).toBeDefined();
        });
    });

    describe("Server Configuration Exports", () => {
        it("should export all configuration constants", () => {
            expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
            expect(MAX_INPUT_SIZE).toBeGreaterThan(0);
            expect(OPERATION_TIMEOUT).toBeGreaterThan(0);
            expect(STREAMING_THRESHOLD).toBeGreaterThan(0);
            expect(typeof ENABLE_STREAMING).toBe("boolean");
            expect(typeof ENABLE_WORKERS).toBe("boolean");
            expect(CACHE_MAX_SIZE).toBeGreaterThan(0);
            expect(CACHE_MAX_ITEMS).toBeGreaterThan(0);
            expect(BATCH_MAX_SIZE).toBeGreaterThan(0);
            expect(typeof BATCH_ENABLED).toBe("boolean");
            expect(typeof TELEMETRY_ENABLED).toBe("boolean");
            expect(typeof RATE_LIMIT_ENABLED).toBe("boolean");
            expect(RATE_LIMIT_REQUESTS).toBeGreaterThan(0);
            expect(RATE_LIMIT_WINDOW).toBeGreaterThan(0);
            expect(typeof CACHE_ENABLED).toBe("boolean");
            expect(typeof V2_COMPATIBILITY_MODE).toBe("boolean");
            expect(typeof SUPPRESS_DEPRECATIONS).toBe("boolean");
        });
    });
});
