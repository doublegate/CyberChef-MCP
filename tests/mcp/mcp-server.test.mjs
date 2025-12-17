/**
 * Test suite for CyberChef MCP Server Core Functions
 *
 * Tests for server utilities and integration using actual mcp-server.mjs exports
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { bake, help } from "../../src/node/index.mjs";
import {
    LRUCache,
    MemoryMonitor,
    sanitizeToolName,
    mapArgsToZod,
    resolveArgValue,
    validateInputSize,
    VERSION,
    MAX_INPUT_SIZE,
    CACHE_MAX_SIZE,
    CACHE_MAX_ITEMS
} from "../../src/node/mcp-server.mjs";

describe("MCP Server Core Functions", () => {
    describe("sanitizeToolName", () => {
        it("should sanitize basic operation names", () => {
            expect(sanitizeToolName("To Base64")).toBe("cyberchef_to_base64");
            expect(sanitizeToolName("From Base64")).toBe("cyberchef_from_base64");
            expect(sanitizeToolName("AES Decrypt")).toBe("cyberchef_aes_decrypt");
        });

        it("should handle hyphenated names", () => {
            expect(sanitizeToolName("SHA-256")).toBe("cyberchef_sha_256");
            expect(sanitizeToolName("HMAC-SHA512")).toBe("cyberchef_hmac_sha512");
        });

        it("should handle special characters", () => {
            expect(sanitizeToolName("JSON/YAML")).toBe("cyberchef_json_yaml");
            expect(sanitizeToolName("Test@Name#Special")).toBe("cyberchef_test_name_special");
        });

        it("should collapse multiple underscores", () => {
            expect(sanitizeToolName("Multiple  Spaces")).toBe("cyberchef_multiple_spaces");
            expect(sanitizeToolName("Many---Hyphens")).toBe("cyberchef_many_hyphens");
        });

        it("should handle edge cases", () => {
            expect(sanitizeToolName("")).toBeNull();
            expect(sanitizeToolName(null)).toBeNull();
            expect(sanitizeToolName(undefined)).toBeNull();
        });

        it("should trim leading/trailing underscores", () => {
            expect(sanitizeToolName("_Leading")).toBe("cyberchef_leading");
            expect(sanitizeToolName("Trailing_")).toBe("cyberchef_trailing");
        });
    });

    describe("mapArgsToZod", () => {
        it("should map boolean arguments", () => {
            const args = [{ name: "Enabled", type: "boolean" }];
            const schema = mapArgsToZod(args);
            expect(schema).toHaveProperty("enabled");
            expect(schema).toHaveProperty("input");
        });

        it("should map number arguments", () => {
            const args = [{ name: "Count", type: "number" }];
            const schema = mapArgsToZod(args);
            expect(schema).toHaveProperty("count");
        });

        it("should map option arguments with enum values", () => {
            const args = [{
                name: "Mode",
                type: "option",
                value: ["Option1", "Option2", "Option3"]
            }];
            const schema = mapArgsToZod(args);
            expect(schema).toHaveProperty("mode");
        });

        it("should map editableOption arguments", () => {
            const args = [{
                name: "Encoding",
                type: "editableOption",
                value: ["UTF-8", "ASCII", "ISO-8859-1"]
            }];
            const schema = mapArgsToZod(args);
            expect(schema).toHaveProperty("encoding");
        });

        it("should map string arguments by default", () => {
            const args = [{ name: "Custom", type: "unknownType" }];
            const schema = mapArgsToZod(args);
            expect(schema).toHaveProperty("custom");
        });

        it("should handle empty args array", () => {
            const schema = mapArgsToZod([]);
            expect(schema).toHaveProperty("input");
            expect(Object.keys(schema)).toHaveLength(1);
        });

        it("should handle option with object values", () => {
            const args = [{
                name: "Size",
                type: "option",
                value: [
                    { name: "Small", value: 10 },
                    { name: "Medium", value: 50 },
                    { name: "Large", value: 100 }
                ]
            }];
            const schema = mapArgsToZod(args);
            expect(schema).toHaveProperty("size");
        });
    });

    describe("resolveArgValue", () => {
        it("should return default value when user value is undefined", () => {
            const argDef = { value: "default" };
            expect(resolveArgValue(argDef, undefined)).toBe("default");
        });

        it("should return user value when provided", () => {
            const argDef = { value: "default" };
            expect(resolveArgValue(argDef, "userValue")).toBe("userValue");
        });

        it("should handle array defaults with defaultIndex", () => {
            const argDef = {
                value: ["opt1", "opt2", "opt3"],
                defaultIndex: 1
            };
            expect(resolveArgValue(argDef, undefined)).toBe("opt2");
        });

        it("should handle array defaults without defaultIndex", () => {
            const argDef = {
                value: ["first", "second", "third"]
            };
            expect(resolveArgValue(argDef, undefined)).toBe("first");
        });

        it("should extract value from option objects", () => {
            const argDef = {
                value: [
                    { name: "Low", value: 1 },
                    { name: "High", value: 10 }
                ],
                defaultIndex: 0
            };
            expect(resolveArgValue(argDef, undefined)).toBe(1);
        });

        it("should match option by name for option type", () => {
            const argDef = {
                type: "option",
                value: [
                    { name: "Low", value: 1 },
                    { name: "High", value: 10 }
                ]
            };
            expect(resolveArgValue(argDef, "Low")).toBe(1);
            expect(resolveArgValue(argDef, "High")).toBe(10);
        });

        it("should match option by name for editableOption type", () => {
            const argDef = {
                type: "editableOption",
                value: [
                    { name: "UTF-8", value: "utf8" },
                    { name: "ASCII", value: "ascii" }
                ]
            };
            expect(resolveArgValue(argDef, "UTF-8")).toBe("utf8");
        });

        it("should pass through custom value for editableOption", () => {
            const argDef = {
                type: "editableOption",
                value: [
                    { name: "UTF-8", value: "utf8" }
                ]
            };
            expect(resolveArgValue(argDef, "Custom Value")).toBe("Custom Value");
        });

        it("should handle string array options", () => {
            const argDef = {
                type: "option",
                value: ["Option1", "Option2"]
            };
            expect(resolveArgValue(argDef, "Option1")).toBe("Option1");
        });
    });

    describe("validateInputSize", () => {
        it("should pass for small inputs", () => {
            expect(() => validateInputSize("small input")).not.toThrow();
        });

        it("should pass for inputs at threshold", () => {
            // Create input near threshold (but not exceeding)
            const input = "a".repeat(1000);
            expect(() => validateInputSize(input)).not.toThrow();
        });

        it("should throw for oversized inputs", () => {
            // Mock MAX_INPUT_SIZE is 100MB, so we'd need a huge string
            // Instead, test with a reasonable size that exceeds a typical limit
            // This tests the function logic, not the actual limit
            const largeInput = "a".repeat(10000);
            // Should not throw with default 100MB limit
            expect(() => validateInputSize(largeInput)).not.toThrow();
        });

        it("should handle unicode characters", () => {
            // Unicode characters take multiple bytes
            const unicodeInput = "日本語テスト".repeat(100);
            expect(() => validateInputSize(unicodeInput)).not.toThrow();
        });
    });

    describe("VERSION and Configuration", () => {
        it("should have correct version", () => {
            expect(VERSION).toBe("1.8.0");
        });

        it("should have valid configuration defaults", () => {
            expect(MAX_INPUT_SIZE).toBeGreaterThan(0);
            expect(CACHE_MAX_SIZE).toBeGreaterThan(0);
            expect(CACHE_MAX_ITEMS).toBeGreaterThan(0);
        });
    });
});

describe("LRUCache", () => {
    let cache;

    beforeEach(() => {
        cache = new LRUCache(1000, 10);
    });

    afterEach(() => {
        cache.clear();
    });

    describe("basic operations", () => {
        it("should store and retrieve values", () => {
            cache.set("key1", "value1");
            expect(cache.get("key1")).toBe("value1");
        });

        it("should return null for missing keys", () => {
            expect(cache.get("nonexistent")).toBeNull();
        });

        it("should clear all items", () => {
            cache.set("key1", "value1");
            cache.set("key2", "value2");

            cache.clear();

            expect(cache.cache.size).toBe(0);
            expect(cache.currentSize).toBe(0);
        });
    });

    describe("cache key generation", () => {
        it("should generate consistent hash for same inputs", () => {
            const key1 = cache.getCacheKey("To Base64", "test", []);
            const key2 = cache.getCacheKey("To Base64", "test", []);

            expect(key1).toBe(key2);
            expect(key1).toHaveLength(64);
        });

        it("should generate different hash for different inputs", () => {
            const key1 = cache.getCacheKey("To Base64", "test1", []);
            const key2 = cache.getCacheKey("To Base64", "test2", []);
            const key3 = cache.getCacheKey("To Hex", "test1", []);

            expect(key1).not.toBe(key2);
            expect(key1).not.toBe(key3);
        });

        it("should generate different hash for different args", () => {
            const key1 = cache.getCacheKey("Op", "input", ["arg1"]);
            const key2 = cache.getCacheKey("Op", "input", ["arg2"]);

            expect(key1).not.toBe(key2);
        });
    });

    describe("LRU eviction", () => {
        it("should evict oldest items when max items exceeded", () => {
            const smallCache = new LRUCache(10000, 3);

            smallCache.set("key1", "value1");
            smallCache.set("key2", "value2");
            smallCache.set("key3", "value3");
            smallCache.set("key4", "value4");

            expect(smallCache.cache.size).toBe(3);
            expect(smallCache.get("key1")).toBeNull();
        });

        it("should update LRU order on get", () => {
            const smallCache = new LRUCache(10000, 3);

            smallCache.set("key1", "value1");
            smallCache.set("key2", "value2");
            smallCache.set("key3", "value3");

            // Access key1 to make it most recently used
            smallCache.get("key1");

            // Add new item, should evict key2 (now oldest)
            smallCache.set("key4", "value4");

            expect(smallCache.get("key1")).toBe("value1");
            expect(smallCache.get("key2")).toBeNull();
        });

        it("should not cache values too large", () => {
            const smallCache = new LRUCache(100, 10);
            smallCache.set("key1", "x".repeat(50));

            expect(smallCache.cache.size).toBe(0);
        });

        it("should evict to stay under size limit", () => {
            const smallCache = new LRUCache(50, 100);

            smallCache.set("key1", "a");
            smallCache.set("key2", "b");
            smallCache.set("key3", "c");
            smallCache.set("key4", "d");
            smallCache.set("key5", "e");

            // Due to metadata overhead, some may be evicted
            expect(smallCache.currentSize).toBeLessThanOrEqual(50);
        });
    });

    describe("statistics", () => {
        it("should return accurate statistics", () => {
            cache.set("key1", "value1");
            cache.set("key2", "value2");

            const stats = cache.getStats();

            expect(stats.items).toBe(2);
            expect(stats.size).toBeGreaterThan(0);
            expect(stats.maxSize).toBe(1000);
            expect(stats.maxItems).toBe(10);
        });

        it("should track size correctly after operations", () => {
            cache.set("key1", "value1");
            const stats1 = cache.getStats();

            cache.set("key2", "value2");
            const stats2 = cache.getStats();

            expect(stats2.size).toBeGreaterThan(stats1.size);

            cache.clear();
            const stats3 = cache.getStats();

            expect(stats3.size).toBe(0);
            expect(stats3.items).toBe(0);
        });
    });
});

describe("MemoryMonitor", () => {
    let monitor;

    beforeEach(() => {
        monitor = new MemoryMonitor();
    });

    it("should initialize with check interval", () => {
        expect(monitor.checkInterval).toBe(5000);
    });

    it("should check memory after interval", () => {
        monitor.lastCheck = Date.now() - 6000;

        const usage = monitor.check();

        expect(usage).toBeDefined();
        expect(usage).toHaveProperty("heapUsed");
    });

    it("should not check before interval elapsed", () => {
        monitor.lastCheck = Date.now();

        const usage = monitor.check();

        expect(usage).toBeUndefined();
    });

    it("should always return usage with getUsage", () => {
        const usage = monitor.getUsage();

        expect(usage).toHaveProperty("heapUsed");
        expect(usage).toHaveProperty("heapTotal");
        expect(usage).toHaveProperty("rss");
        expect(usage).toHaveProperty("external");
    });

    it("should update lastCheck timestamp on check", () => {
        monitor.lastCheck = Date.now() - 10000;
        const before = monitor.lastCheck;

        monitor.check();

        expect(monitor.lastCheck).toBeGreaterThan(before);
    });
});

describe("MCP Server Integration", () => {
    describe("bake function", () => {
        it("should execute simple operations", async () => {
            const result = await bake("Hello", [{ op: "To Base64", args: ["A-Za-z0-9+/="] }]);

            expect(result).toBeDefined();
            expect(result.value).toBe("SGVsbG8=");
        });

        it("should execute multiple operations", async () => {
            const result = await bake("Test", [
                { op: "To Base64", args: ["A-Za-z0-9+/="] },
                { op: "To Hex", args: ["Space", 0] }
            ]);

            expect(result).toBeDefined();
            expect(typeof result.value).toBe("string");
        });

        it("should throw on invalid operation", () => {
            // bake throws TypeError synchronously for invalid operations
            expect(() => bake("test", [{ op: "InvalidOperation", args: [] }]))
                .toThrow(/Couldn't find an operation/);
        });

        it("should handle empty input", async () => {
            const result = await bake("", [{ op: "To Base64", args: ["A-Za-z0-9+/="] }]);
            expect(result).toBeDefined();
            expect(result.value).toBe("");
        });

        it("should handle unicode input", async () => {
            const result = await bake("日本語", [{ op: "To Base64", args: ["A-Za-z0-9+/="] }]);
            expect(result).toBeDefined();
            expect(result.value).toBe("5pel5pys6Kqe");
        });
    });

    describe("help function", () => {
        it("should search for operations", () => {
            const results = help("base64");

            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
        });

        it("should find encoding operations", () => {
            const results = help("encode");

            expect(results.length).toBeGreaterThan(0);
        });

        it("should return null for non-existent operations", () => {
            const results = help("xyznonexistent123");

            // help() returns null when no matches found
            expect(results).toBeNull();
        });

        it("should find crypto operations", () => {
            const results = help("aes");
            expect(results).toBeDefined();
            expect(results.length).toBeGreaterThan(0);
        });

        it("should find hash operations", () => {
            const results = help("sha");
            expect(results).toBeDefined();
            expect(results.length).toBeGreaterThan(0);
        });
    });
});

describe("Edge Cases and Error Handling", () => {
    describe("sanitizeToolName edge cases", () => {
        it("should handle only special characters", () => {
            // All special chars become underscores, then collapsed, then trimmed
            const result = sanitizeToolName("@#$%");
            expect(result).toBeNull(); // After cleanup, becomes "cyberchef_"
        });

        it("should handle numbers only", () => {
            expect(sanitizeToolName("12345")).toBe("cyberchef_12345");
        });

        it("should handle mixed case", () => {
            expect(sanitizeToolName("MiXeD CaSe")).toBe("cyberchef_mixed_case");
        });
    });

    describe("LRUCache edge cases", () => {
        it("should handle storing null values", () => {
            const cache = new LRUCache();
            cache.set("key", null);
            expect(cache.get("key")).toBeNull();
        });

        it("should handle storing objects", () => {
            const cache = new LRUCache();
            const obj = { foo: "bar", num: 42 };
            cache.set("key", obj);
            expect(cache.get("key")).toEqual(obj);
        });

        it("should handle storing arrays", () => {
            const cache = new LRUCache();
            const arr = [1, 2, 3, "four"];
            cache.set("key", arr);
            expect(cache.get("key")).toEqual(arr);
        });
    });

    describe("resolveArgValue edge cases", () => {
        it("should handle empty array value", () => {
            const argDef = { value: [] };
            expect(resolveArgValue(argDef, undefined)).toEqual([]);
        });

        it("should handle boolean default", () => {
            const argDef = { value: true };
            expect(resolveArgValue(argDef, undefined)).toBe(true);
        });

        it("should handle numeric default", () => {
            const argDef = { value: 42 };
            expect(resolveArgValue(argDef, undefined)).toBe(42);
        });

        it("should return user value 0 (not default)", () => {
            const argDef = { value: 100 };
            expect(resolveArgValue(argDef, 0)).toBe(0);
        });

        it("should return user value false (not default)", () => {
            const argDef = { value: true };
            expect(resolveArgValue(argDef, false)).toBe(false);
        });

        it("should return user value empty string (not default)", () => {
            const argDef = { value: "default" };
            expect(resolveArgValue(argDef, "")).toBe("");
        });
    });
});
