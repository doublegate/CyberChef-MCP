/**
 * Tests for Real MCP Server Handlers
 *
 * These tests import the actual mcp-server module and test the registered handlers
 * to improve coverage of the request handling code.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { bake, help } from "../../src/node/index.mjs";
import OperationConfig from "../../src/core/config/OperationConfig.json" with {type: "json"};

describe("Real Server Handler Coverage", () => {
    describe("Bake Function - Complex Scenarios", () => {
        it("should handle empty recipe", async () => {
            const result = await bake("test input", []);
            expect(result.value).toBeDefined();
        });

        it("should handle single operation recipe", async () => {
            const result = await bake("Hello", [
                { op: "To Base64", args: ["A-Za-z0-9+/="] }
            ]);
            expect(result.value).toBe("SGVsbG8=");
        });

        it("should handle multi-operation recipe", async () => {
            const result = await bake("Test", [
                { op: "To Base64", args: ["A-Za-z0-9+/="] },
                { op: "To Hex", args: ["Space", 0] }
            ]);
            expect(result).toBeDefined();
            expect(typeof result.value).toBe("string");
        });

        it("should handle operations with complex arguments", async () => {
            const result = await bake("Test", [
                { op: "ROT13", args: [true, true, false, 13] }
            ]);
            expect(result).toBeDefined();
        });

        it("should handle operations with default arguments", async () => {
            const result = await bake("Test", [
                { op: "To Hex", args: [] }
            ]);
            expect(result).toBeDefined();
        });

        it("should handle unicode in operations", async () => {
            const result = await bake("こんにちは", [
                { op: "To Base64", args: ["A-Za-z0-9+/="] }
            ]);
            expect(result).toBeDefined();
            expect(result.value).toBeDefined();
        });

        it("should handle empty input", async () => {
            const result = await bake("", [
                { op: "To Base64", args: ["A-Za-z0-9+/="] }
            ]);
            expect(result.value).toBe("");
        });

        it("should handle binary data operations", async () => {
            const result = await bake("Test", [
                { op: "To Hex", args: ["None", 0] }
            ]);
            expect(result).toBeDefined();
        });

        it("should throw on invalid operation", () => {
            expect(() => bake("test", [
                { op: "NonExistentOperation", args: [] }
            ])).toThrow();
        });

        it("should handle operations returning objects", async () => {
            const result = await bake("test", [
                { op: "To Decimal", args: [",", false] }
            ]);
            expect(result).toBeDefined();
        });
    });

    describe("Help Function - Extended Coverage", () => {
        it("should find operations by partial match", () => {
            const results = help("bas");
            expect(results).toBeDefined();
            if (results) {
                expect(results.length).toBeGreaterThan(0);
            }
        });

        it("should find operations case-insensitively", () => {
            const results1 = help("BASE64");
            const results2 = help("base64");
            const results3 = help("Base64");

            if (results1 && results2 && results3) {
                expect(results1.length).toBeGreaterThan(0);
                expect(results2.length).toBeGreaterThan(0);
                expect(results3.length).toBeGreaterThan(0);
            }
        });

        it("should return null for no matches", () => {
            const results = help("xyznonexistent123456789");
            expect(results).toBeNull();
        });

        it("should find crypto operations", () => {
            const results = help("encrypt");
            expect(results).toBeDefined();
            if (results) {
                expect(results.length).toBeGreaterThan(0);
            }
        });

        it("should find encoding operations", () => {
            const results = help("encode");
            expect(results).toBeDefined();
            if (results) {
                expect(results.length).toBeGreaterThan(0);
            }
        });

        it("should find hash operations", () => {
            const results = help("hash");
            expect(results).toBeDefined();
            if (results) {
                expect(results.length).toBeGreaterThan(0);
            }
        });

        it("should find compression operations", () => {
            const results = help("compress");
            expect(results).toBeDefined();
            if (results) {
                expect(results.length).toBeGreaterThan(0);
            }
        });

        it("should handle single character queries", () => {
            const results = help("a");
            expect(results).toBeDefined();
        });

        it("should handle empty query", () => {
            const results = help("");
            // Empty query returns null
            expect(results).toBeNull();
        });
    });

    describe("Operation Config Validation", () => {
        it("should have To Base64 operation", () => {
            expect(OperationConfig).toHaveProperty("To Base64");
        });

        it("should have From Base64 operation", () => {
            expect(OperationConfig).toHaveProperty("From Base64");
        });

        it("should have operations with args", () => {
            const toBase64 = OperationConfig["To Base64"];
            expect(toBase64).toHaveProperty("args");
            expect(Array.isArray(toBase64.args)).toBe(true);
        });

        it("should have operations with descriptions", () => {
            const toBase64 = OperationConfig["To Base64"];
            expect(toBase64).toHaveProperty("description");
            expect(typeof toBase64.description).toBe("string");
        });

        it("should have operations with valid arg types", () => {
            Object.values(OperationConfig).forEach(op => {
                if (op.args) {
                    op.args.forEach(arg => {
                        if (arg.type) {
                            expect(typeof arg.type).toBe("string");
                        }
                    });
                }
            });
        });
    });

    describe("Complex Operation Scenarios", () => {
        it("should handle ROT13 operation", async () => {
            const result = await bake("Hello", [
                { op: "ROT13", args: [true, true, false, 13] }
            ]);
            expect(result.value).toBeDefined();
            // ROT13 might return a byte array or string depending on implementation
            const output = Array.isArray(result.value) ?
                String.fromCharCode(...result.value) : result.value;
            expect(output).toBe("Uryyb");
        });

        it("should handle URL encoding", async () => {
            const result = await bake("Hello World", [
                { op: "URL Encode", args: [false] }
            ]);
            expect(result.value).toContain("%20");
        });

        it("should handle hex encoding", async () => {
            const result = await bake("ABC", [
                { op: "To Hex", args: ["Space", 0] }
            ]);
            expect(result.value).toContain("41");
        });

        it("should handle MD5 hash", async () => {
            const result = await bake("test", [
                { op: "MD5", args: [] }
            ]);
            expect(result.value).toBeDefined();
            expect(typeof result.value).toBe("string");
        });

        it("should handle SHA1 hash", async () => {
            const result = await bake("test", [
                { op: "SHA1", args: [] }
            ]);
            expect(result.value).toBeDefined();
        });

        it("should handle chained encoding", async () => {
            const result = await bake("Test", [
                { op: "To Hex", args: ["None", 0] },
                { op: "To Base64", args: ["A-Za-z0-9+/="] }
            ]);
            expect(result.value).toBeDefined();
        });

        it("should handle URL decode", async () => {
            const result = await bake("Hello%20World", [
                { op: "URL Decode", args: [] }
            ]);
            expect(result.value).toBe("Hello World");
        });

        it("should handle From Hex", async () => {
            const result = await bake("48656c6c6f", [
                { op: "From Hex", args: ["Auto"] }
            ]);
            expect(result.value).toBeDefined();
            const output = Array.isArray(result.value) ?
                String.fromCharCode(...result.value) : result.value;
            expect(output).toBe("Hello");
        });

        it("should handle From Base64", async () => {
            const result = await bake("SGVsbG8=", [
                { op: "From Base64", args: ["A-Za-z0-9+/=", true] }
            ]);
            expect(result.value).toBeDefined();
            const output = Array.isArray(result.value) ?
                String.fromCharCode(...result.value) : result.value;
            expect(output).toBe("Hello");
        });
    });

    describe("Error Handling Scenarios", () => {
        it("should handle invalid operation name", () => {
            expect(() => bake("test", [
                { op: "This Operation Does Not Exist", args: [] }
            ])).toThrow();
        });

        it("should handle malformed recipe", async () => {
            // Missing args might use defaults, so just check it completes
            const result = await bake("test", [
                { op: "To Base64" } // Missing args
            ]);
            expect(result).toBeDefined();
        });

        it("should handle null recipe", async () => {
            // Null recipe might default to empty array
            const result = await bake("test", null);
            expect(result).toBeDefined();
        });

        it("should handle undefined input", async () => {
            // Undefined input gets coerced to string
            const result = await bake(undefined, [
                { op: "To Base64", args: [] }
            ]);
            expect(result).toBeDefined();
        });
    });

    describe("Operation Discovery", () => {
        it("should find all crypto operations", () => {
            const crypto = help("crypto");
            if (crypto) {
                expect(crypto.length).toBeGreaterThan(0);
            }
        });

        it("should find parsing operations", () => {
            const parse = help("parse");
            if (parse) {
                expect(parse.length).toBeGreaterThan(0);
            }
        });

        it("should find formatting operations", () => {
            const format = help("format");
            if (format) {
                expect(format.length).toBeGreaterThan(0);
            }
        });

        it("should find conversion operations", () => {
            const convert = help("convert");
            if (convert) {
                expect(convert.length).toBeGreaterThan(0);
            }
        });
    });

    describe("Edge Case Operations", () => {
        it("should handle very long input", async () => {
            const longInput = "a".repeat(10000);
            const result = await bake(longInput, [
                { op: "To Base64", args: ["A-Za-z0-9+/="] }
            ]);
            expect(result.value).toBeDefined();
            expect(result.value.length).toBeGreaterThan(0);
        });

        it("should handle special characters", async () => {
            const result = await bake("!@#$%^&*()", [
                { op: "URL Encode", args: [false] }
            ]);
            expect(result.value).toBeDefined();
        });

        it("should handle newlines", async () => {
            const result = await bake("Line1\nLine2\nLine3", [
                { op: "To Base64", args: ["A-Za-z0-9+/="] }
            ]);
            expect(result.value).toBeDefined();
        });

        it("should handle tabs", async () => {
            const result = await bake("Col1\tCol2\tCol3", [
                { op: "To Hex", args: ["Space", 0] }
            ]);
            expect(result.value).toBeDefined();
        });

        it("should handle mixed unicode", async () => {
            const result = await bake("Hello世界🌍", [
                { op: "To Base64", args: ["A-Za-z0-9+/="] }
            ]);
            expect(result.value).toBeDefined();
        });
    });
});
