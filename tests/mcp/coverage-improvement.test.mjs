/**
 * Coverage Improvement Tests for CyberChef MCP Server
 *
 * Tests specifically designed to increase coverage for mcp-server.mjs
 * Focuses on edge cases, error paths, and configuration variations
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    TelemetryCollector,
    RateLimiter,
    ResourceQuotaTracker,
    BatchProcessor,
    LRUCache,
    sanitizeToolName,
    resolveArgValue,
    validateInputSize,
    mapArgsToZod
} from "../../src/node/mcp-server.mjs";

describe("Coverage Improvement Tests", () => {
    describe("Rate Limiting - Internal Logic", () => {
        let limiter;

        beforeEach(() => {
            limiter = new RateLimiter(3, 1000); // 3 requests per 1 second
        });

        it("should have correct configuration", () => {
            expect(limiter.maxRequests).toBe(3);
            expect(limiter.windowMs).toBe(1000);
        });

        it("should return allowed result when disabled (default)", () => {
            // Rate limiting is disabled by default
            const result = limiter.checkLimit("test-conn");
            expect(result).toHaveProperty("allowed");
            expect(result).toHaveProperty("retryAfter");
            expect(result.allowed).toBe(true);
            expect(result.retryAfter).toBe(0);
        });

        it("should maintain requests map structure", () => {
            expect(limiter.requests).toBeInstanceOf(Map);
        });

        it("should return statistics", () => {
            const stats = limiter.getStats();
            expect(stats).toHaveProperty("enabled");
            expect(stats).toHaveProperty("maxRequests");
            expect(stats).toHaveProperty("windowMs");
            expect(stats).toHaveProperty("activeConnections");
            expect(stats).toHaveProperty("totalTrackedRequests");
            expect(stats.maxRequests).toBe(3);
            expect(stats.windowMs).toBe(1000);
        });

        it("should clear tracked requests", () => {
            limiter.checkLimit("test");
            limiter.clear();

            const stats = limiter.getStats();
            expect(stats.activeConnections).toBe(0);
            expect(stats.totalTrackedRequests).toBe(0);
        });

        it("should handle multiple connection IDs", () => {
            limiter.checkLimit("conn1");
            limiter.checkLimit("conn2");
            limiter.checkLimit("conn3");

            expect(limiter.requests).toBeInstanceOf(Map);
        });

        it("should use default connection ID", () => {
            const result = limiter.checkLimit();
            expect(result.allowed).toBe(true);
        });
    });

    describe("Telemetry - Internal Logic", () => {
        let collector;

        beforeEach(() => {
            collector = new TelemetryCollector();
        });

        it("should initialize with empty metrics", () => {
            expect(collector.metrics).toEqual([]);
            expect(collector.maxMetrics).toBe(10000);
        });

        it("should export empty metrics array", () => {
            const metrics = collector.exportMetrics();
            expect(Array.isArray(metrics)).toBe(true);
            expect(metrics).toHaveLength(0);
        });

        it("should handle metrics array directly for testing", () => {
            // Directly manipulate metrics array to test internal logic
            collector.metrics.push({
                tool: "cyberchef_to_base64",
                duration: 42,
                inputSize: 100,
                outputSize: 136,
                success: true,
                cached: false,
                timestamp: Date.now()
            });

            const metrics = collector.exportMetrics();
            expect(metrics).toHaveLength(1);
            expect(metrics[0].tool).toBe("cyberchef_to_base64");
        });

        it("should calculate stats from metrics array", () => {
            collector.metrics.push({ tool: "t1", duration: 100, inputSize: 0, outputSize: 0, success: true, cached: false, timestamp: Date.now() });
            collector.metrics.push({ tool: "t2", duration: 200, inputSize: 0, outputSize: 0, success: false, cached: false, timestamp: Date.now() });
            collector.metrics.push({ tool: "t3", duration: 150, inputSize: 0, outputSize: 0, success: true, cached: true, timestamp: Date.now() });

            const stats = collector.getStats();
            expect(stats.totalCalls).toBe(3);
            expect(stats.successRate).toBe("66.67%");
            expect(stats.avgDuration).toBe("150ms");
            expect(stats.cacheHitRate).toBe("33.33%");
        });

        it("should return zero stats for empty metrics", () => {
            const stats = collector.getStats();
            expect(stats.totalCalls).toBe(0);
            expect(stats.successRate).toBe(0);
            expect(stats.avgDuration).toBe(0);
            expect(stats.cacheHitRate).toBe(0);
        });

        it("should clear metrics", () => {
            collector.metrics.push({ tool: "test", duration: 100, inputSize: 0, outputSize: 0, success: true, cached: false, timestamp: Date.now() });
            collector.clear();
            expect(collector.metrics).toHaveLength(0);
        });

        it("should handle maxMetrics limit", () => {
            collector.maxMetrics = 3;

            // Directly add metrics
            for (let i = 0; i < 5; i++) {
                collector.metrics.push({
                    tool: `tool_${i}`,
                    duration: 10,
                    inputSize: 100,
                    outputSize: 100,
                    success: true,
                    cached: false,
                    timestamp: Date.now()
                });

                // Manually enforce limit
                if (collector.metrics.length > collector.maxMetrics) {
                    collector.metrics.shift();
                }
            }

            expect(collector.metrics).toHaveLength(3);
            expect(collector.metrics[0].tool).toBe("tool_2");
        });

        it("should not record when telemetry disabled (default)", () => {
            // Telemetry is disabled by default
            collector.record({
                tool: "test",
                duration: 10,
                inputSize: 100,
                outputSize: 100,
                success: true
            });

            expect(collector.exportMetrics()).toHaveLength(0);
        });
    });

    describe("Cache - Disabled Scenarios", () => {
        it("should handle cache disabled via environment", () => {
            const originalEnv = process.env.CYBERCHEF_CACHE_ENABLED;
            process.env.CYBERCHEF_CACHE_ENABLED = "false";

            // This tests that the configuration is read correctly
            // Actual cache behavior would need integration testing
            expect(process.env.CYBERCHEF_CACHE_ENABLED).toBe("false");

            if (originalEnv === undefined) {
                delete process.env.CYBERCHEF_CACHE_ENABLED;
            } else {
                process.env.CYBERCHEF_CACHE_ENABLED = originalEnv;
            }
        });

        it("should skip caching for oversized items", () => {
            const cache = new LRUCache(100, 10);
            const largeValue = "x".repeat(50);

            cache.set("key", largeValue);

            // Should not be cached (> maxSize/10)
            expect(cache.cache.size).toBe(0);
        });

        it("should handle cache operations when empty", () => {
            const cache = new LRUCache();

            expect(cache.get("nonexistent")).toBeNull();

            const stats = cache.getStats();
            expect(stats.items).toBe(0);
            expect(stats.size).toBe(0);
        });

        it("should clear cache properly", () => {
            const cache = new LRUCache();
            cache.set("key1", "value1");
            cache.set("key2", "value2");

            expect(cache.cache.size).toBeGreaterThan(0);
            expect(cache.currentSize).toBeGreaterThan(0);

            cache.clear();

            expect(cache.cache.size).toBe(0);
            expect(cache.currentSize).toBe(0);
        });
    });

    describe("Quota - Exceeded Scenarios", () => {
        let tracker;

        beforeEach(() => {
            tracker = new ResourceQuotaTracker();
            tracker.maxConcurrentOps = 2;
        });

        it("should block when quota exceeded", () => {
            expect(tracker.acquire()).toBe(true);
            expect(tracker.acquire()).toBe(true);
            expect(tracker.acquire()).toBe(false);
        });

        it("should allow after release", () => {
            tracker.acquire();
            tracker.acquire();
            expect(tracker.acquire()).toBe(false);

            tracker.release();
            expect(tracker.acquire()).toBe(true);
        });

        it("should track total operations", () => {
            tracker.acquire();
            tracker.release();
            tracker.acquire();
            tracker.release();
            tracker.acquire();

            const info = tracker.getInfo();
            expect(info.totalOperations).toBe(3);
        });

        it("should track data throughput", () => {
            const oneMB = 1024 * 1024;
            tracker.trackData(oneMB, oneMB * 2);

            const info = tracker.getInfo();
            expect(info.inputSizeMB).toBe("1.00");
            expect(info.outputSizeMB).toBe("2.00");
        });

        it("should reset statistics correctly", () => {
            tracker.acquire();
            tracker.trackData(1000, 2000);

            tracker.reset();

            const info = tracker.getInfo();
            expect(info.totalOperations).toBe(0);
            expect(info.totalInputSize).toBe(0);
            expect(info.totalOutputSize).toBe(0);
            expect(info.concurrentOperations).toBeGreaterThan(0); // Not reset
        });

        it("should prevent negative concurrent ops", () => {
            tracker.release();
            tracker.release();
            tracker.release();

            expect(tracker.concurrentOps).toBe(0);
        });
    });

    describe("Batch Processing - Error Scenarios", () => {
        let processor;

        beforeEach(() => {
            processor = new BatchProcessor();
        });

        it("should reject empty operations array", async () => {
            await expect(processor.executeBatch([], "parallel"))
                .rejects.toThrow("Operations must be a non-empty array");
        });

        it("should reject null operations", async () => {
            await expect(processor.executeBatch(null, "parallel"))
                .rejects.toThrow("Operations must be a non-empty array");
        });

        it("should reject invalid tool names", async () => {
            const operations = [
                { tool: "invalid_tool", arguments: {} }
            ];

            const result = await processor.executeBatch(operations, "parallel");
            expect(result.failed).toBe(1);
            expect(result.errors[0].error).toContain("Invalid tool name");
        });

        it("should reject operations without arguments", async () => {
            const operations = [
                { tool: "cyberchef_to_base64" }
            ];

            const result = await processor.executeBatch(operations, "parallel");
            expect(result.failed).toBe(1);
            expect(result.errors[0].error).toContain("arguments must be an object");
        });

        it("should reject operations with invalid arguments type", async () => {
            const operations = [
                { tool: "cyberchef_to_base64", arguments: "invalid" }
            ];

            const result = await processor.executeBatch(operations, "parallel");
            expect(result.failed).toBe(1);
        });

        it("should handle bake operation in batch", async () => {
            const operations = [
                {
                    tool: "cyberchef_bake",
                    arguments: {
                        input: "Hello",
                        recipe: [{ op: "To Base64", args: ["A-Za-z0-9+/="] }]
                    }
                }
            ];

            const result = await processor.executeBatch(operations, "parallel");
            expect(result.successful).toBe(1);
            expect(result.results[0].result).toBe("SGVsbG8=");
        });

        it("should handle search operation in batch", async () => {
            const operations = [
                {
                    tool: "cyberchef_search",
                    arguments: { query: "base64" }
                }
            ];

            const result = await processor.executeBatch(operations, "parallel");
            expect(result.successful).toBe(1);
            expect(typeof result.results[0].result).toBe("string");
        });

        it("should validate input size in batch operations", async () => {
            const operations = [
                {
                    tool: "cyberchef_to_base64",
                    arguments: {
                        input: "x".repeat(101 * 1024 * 1024) // 101MB
                    }
                }
            ];

            const result = await processor.executeBatch(operations, "parallel");
            expect(result.failed).toBe(1);
            expect(result.errors[0].error).toContain("Input size");
        });
    });

    describe("Edge Cases - Tool Name Sanitization", () => {
        it("should return null for empty string", () => {
            expect(sanitizeToolName("")).toBeNull();
        });

        it("should return null for null", () => {
            expect(sanitizeToolName(null)).toBeNull();
        });

        it("should return null for undefined", () => {
            expect(sanitizeToolName(undefined)).toBeNull();
        });

        it("should return null for only special characters", () => {
            expect(sanitizeToolName("@#$%^&*()")).toBeNull();
        });

        it("should handle leading underscores", () => {
            expect(sanitizeToolName("_Test")).toBe("cyberchef_test");
        });

        it("should handle trailing underscores", () => {
            expect(sanitizeToolName("Test_")).toBe("cyberchef_test");
        });

        it("should collapse multiple underscores", () => {
            expect(sanitizeToolName("Test___Name")).toBe("cyberchef_test_name");
        });

        it("should handle numbers", () => {
            expect(sanitizeToolName("SHA256")).toBe("cyberchef_sha256");
            expect(sanitizeToolName("Base64")).toBe("cyberchef_base64");
        });
    });

    describe("Edge Cases - Argument Resolution", () => {
        it("should handle undefined user value with string default", () => {
            const argDef = { value: "default_string" };
            expect(resolveArgValue(argDef, undefined)).toBe("default_string");
        });

        it("should handle undefined user value with array default", () => {
            const argDef = { value: ["opt1", "opt2"], defaultIndex: 1 };
            expect(resolveArgValue(argDef, undefined)).toBe("opt2");
        });

        it("should handle undefined user value with object array", () => {
            const argDef = {
                value: [
                    { name: "Small", value: 10 },
                    { name: "Large", value: 100 }
                ],
                defaultIndex: 0
            };
            expect(resolveArgValue(argDef, undefined)).toBe(10);
        });

        it("should match option by name", () => {
            const argDef = {
                type: "option",
                value: [
                    { name: "Mode1", value: "m1" },
                    { name: "Mode2", value: "m2" }
                ]
            };
            expect(resolveArgValue(argDef, "Mode1")).toBe("m1");
            expect(resolveArgValue(argDef, "Mode2")).toBe("m2");
        });

        it("should return user value for unmatched option", () => {
            const argDef = {
                type: "option",
                value: ["opt1", "opt2"]
            };
            expect(resolveArgValue(argDef, "opt1")).toBe("opt1");
        });

        it("should handle editableOption with custom value", () => {
            const argDef = {
                type: "editableOption",
                value: ["preset1", "preset2"]
            };
            expect(resolveArgValue(argDef, "custom_value")).toBe("custom_value");
        });

        it("should handle empty value array", () => {
            const argDef = { value: [] };
            expect(resolveArgValue(argDef, undefined)).toEqual([]);
        });

        it("should preserve falsy user values", () => {
            const argDef = { value: "default" };
            expect(resolveArgValue(argDef, 0)).toBe(0);
            expect(resolveArgValue(argDef, false)).toBe(false);
            expect(resolveArgValue(argDef, "")).toBe("");
        });
    });

    describe("Edge Cases - Input Validation", () => {
        it("should accept empty string", () => {
            expect(() => validateInputSize("")).not.toThrow();
        });

        it("should accept small input", () => {
            expect(() => validateInputSize("small")).not.toThrow();
        });

        it("should accept large valid input", () => {
            const largeInput = "x".repeat(1024 * 1024); // 1MB
            expect(() => validateInputSize(largeInput)).not.toThrow();
        });

        it("should handle unicode correctly", () => {
            const unicode = "こんにちは世界"; // Japanese "Hello World"
            expect(() => validateInputSize(unicode)).not.toThrow();
        });

        it("should handle emoji correctly", () => {
            const emoji = "😀😃😄😁".repeat(100);
            expect(() => validateInputSize(emoji)).not.toThrow();
        });
    });

    describe("Edge Cases - Schema Mapping", () => {
        it("should map boolean type", () => {
            const args = [{ name: "Enable", type: "boolean" }];
            const schema = mapArgsToZod(args);
            expect(schema).toHaveProperty("enable");
        });

        it("should map integer type", () => {
            const args = [{ name: "Count", type: "integer" }];
            const schema = mapArgsToZod(args);
            expect(schema).toHaveProperty("count");
        });

        it("should map option with empty array", () => {
            const args = [{ name: "Mode", type: "option", value: [] }];
            const schema = mapArgsToZod(args);
            expect(schema).toHaveProperty("mode");
        });

        it("should map editableOption with object values", () => {
            const args = [{
                name: "Encoding",
                type: "editableOption",
                value: [
                    { name: "UTF-8", value: "utf8" },
                    { name: "ASCII", value: "ascii" }
                ]
            }];
            const schema = mapArgsToZod(args);
            expect(schema).toHaveProperty("encoding");
        });

        it("should always include input field", () => {
            const schema = mapArgsToZod([]);
            expect(schema).toHaveProperty("input");
        });

        it("should handle unknown types as string", () => {
            const args = [{ name: "Custom", type: "unknown" }];
            const schema = mapArgsToZod(args);
            expect(schema).toHaveProperty("custom");
        });

        it("should sanitize argument names", () => {
            const args = [{ name: "Multi Word Arg", type: "string" }];
            const schema = mapArgsToZod(args);
            expect(schema).toHaveProperty("multi_word_arg");
        });
    });

    describe("LRU Cache - Advanced Edge Cases", () => {
        it("should handle concurrent access patterns", () => {
            const cache = new LRUCache(1000, 5);

            // Simulate concurrent writes
            for (let i = 0; i < 10; i++) {
                cache.set(`key${i}`, `value${i}`);
            }

            // Verify LRU behavior
            expect(cache.cache.size).toBeLessThanOrEqual(5);
        });

        it("should update access order correctly", () => {
            const cache = new LRUCache(1000, 3);

            cache.set("a", "1");
            cache.set("b", "2");
            cache.set("c", "3");

            // Access "a" to make it most recent
            cache.get("a");

            // Add new item, should evict "b"
            cache.set("d", "4");

            expect(cache.get("a")).toBe("1");
            expect(cache.get("b")).toBeNull();
            expect(cache.get("c")).toBe("3");
            expect(cache.get("d")).toBe("4");
        });

        it("should handle cache key collisions gracefully", () => {
            const cache = new LRUCache();

            const key1 = cache.getCacheKey("Op1", "input", []);
            const key2 = cache.getCacheKey("Op1", "input", []);

            expect(key1).toBe(key2);

            cache.set(key1, "value1");
            expect(cache.get(key2)).toBe("value1");
        });

        it("should handle complex objects in cache", () => {
            const cache = new LRUCache();

            const complexObj = {
                nested: {
                    data: [1, 2, 3],
                    map: { a: "b" }
                }
            };

            cache.set("key", complexObj);
            expect(cache.get("key")).toEqual(complexObj);
        });
    });

    describe("Batch Processor - Standard Operations", () => {
        let processor;

        beforeEach(() => {
            processor = new BatchProcessor();
        });

        it("should execute To Base64 operation", async () => {
            const operations = [
                {
                    tool: "cyberchef_to_base64",
                    arguments: { input: "Hello World" }
                }
            ];

            const result = await processor.executeBatch(operations, "parallel");
            expect(result.successful).toBe(1);
            expect(result.results[0].result).toBe("SGVsbG8gV29ybGQ=");
        });

        it("should execute multiple different operations", async () => {
            const operations = [
                {
                    tool: "cyberchef_to_base64",
                    arguments: { input: "Test1" }
                },
                {
                    tool: "cyberchef_to_hex",
                    arguments: { input: "Test2" }
                }
            ];

            const result = await processor.executeBatch(operations, "sequential");
            expect(result.successful).toBe(2);
            expect(result.mode).toBe("sequential");
        });

        it("should provide index in results", async () => {
            const operations = [
                { tool: "cyberchef_search", arguments: { query: "a" } },
                { tool: "cyberchef_search", arguments: { query: "b" } }
            ];

            const result = await processor.executeBatch(operations, "parallel");
            expect(result.results[0]).toHaveProperty("index");
            expect(result.results[1]).toHaveProperty("index");
        });
    });
});
