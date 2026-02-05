/**
 * Test suite for CyberChef MCP Migration Preview Tool
 *
 * Tests for:
 * - Migration preview tool functionality
 * - Recipe compatibility analysis
 * - Recipe transformation
 * - v1.8.0 tool handlers
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    VERSION,
    analyzeRecipeCompatibility,
    transformRecipeToV2,
    getDeprecationStats,
    resetDeprecations,
    V2_COMPATIBILITY_MODE,
    SUPPRESS_DEPRECATIONS,
    getToolName,
    stripToolPrefix,
    DEPRECATION_CODES
} from "../../src/node/mcp-server.mjs";

describe("v1.8.0 Features - Migration Preview", () => {
    beforeEach(() => {
        resetDeprecations();
    });

    describe("VERSION", () => {
        it("should be 1.9.0", () => {
            expect(VERSION).toBe("1.9.0");
        });
    });

    describe("DEPRECATION_CODES", () => {
        it("should be exported from mcp-server", () => {
            expect(DEPRECATION_CODES).toBeDefined();
            expect(DEPRECATION_CODES.DEP001).toBeDefined();
            expect(DEPRECATION_CODES.DEP007).toBeDefined();
            expect(DEPRECATION_CODES.DEP008).toBeDefined();
        });
    });

    describe("analyzeRecipeCompatibility", () => {
        it("should return compatible for well-formed v2 recipes", () => {
            const recipe = {
                name: "Test Recipe",
                description: "A v2 compatible recipe",
                operations: [
                    { op: "To Base64", args: { alphabet: "standard" } },
                    { op: "MD5", args: {} }
                ]
            };

            const result = analyzeRecipeCompatibility(recipe);

            expect(result.compatible).toBe(true);
            expect(result.issueCount).toBe(0);
            expect(result.breakingCount).toBe(0);
            expect(result.warningCount).toBe(0);
        });

        it("should detect positional array arguments (DEP005)", () => {
            const recipe = {
                name: "Legacy Recipe",
                operations: [
                    { op: "To Base64", args: ["A-Za-z0-9+/=", true] }
                ]
            };

            const result = analyzeRecipeCompatibility(recipe);

            expect(result.compatible).toBe(true); // Warning, not breaking
            expect(result.issues).toContainEqual(expect.objectContaining({
                code: "DEP005",
                severity: "warning"
            }));
        });

        it("should detect missing op field (DEP006)", () => {
            const recipe = {
                name: "Incomplete Recipe",
                operations: [
                    { args: { key: "value" } } // Missing 'op'
                ]
            };

            const result = analyzeRecipeCompatibility(recipe);

            expect(result.issues).toContainEqual(expect.objectContaining({
                code: "DEP006",
                severity: "warning"
            }));
        });

        it("should detect array format recipes (DEP006)", () => {
            const recipe = [
                { op: "To Base64", args: [] }
            ];

            const result = analyzeRecipeCompatibility(recipe);

            expect(result.issues).toContainEqual(expect.objectContaining({
                code: "DEP006",
                message: expect.stringContaining("array")
            }));
        });

        it("should return breaking for null recipe", () => {
            const result = analyzeRecipeCompatibility(null);

            expect(result.compatible).toBe(false);
            expect(result.issues).toContainEqual(expect.objectContaining({
                code: "INVALID_RECIPE",
                severity: "breaking"
            }));
        });

        it("should return breaking for non-object recipe", () => {
            const result = analyzeRecipeCompatibility("not a recipe");

            expect(result.compatible).toBe(false);
        });

        it("should include fix suggestions for each issue", () => {
            const recipe = {
                name: "Test",
                operations: [
                    { op: "Test", args: [1, 2, 3] }
                ]
            };

            const result = analyzeRecipeCompatibility(recipe);

            result.issues.forEach(issue => {
                expect(issue.fix).toBeDefined();
                expect(typeof issue.fix).toBe("string");
            });
        });

        it("should include location for each issue", () => {
            const recipe = {
                name: "Test",
                operations: [
                    { op: "Op1", args: [1] },
                    { op: "Op2", args: [2] }
                ]
            };

            const result = analyzeRecipeCompatibility(recipe);

            result.issues.forEach(issue => {
                expect(issue.location).toBeDefined();
            });
        });
    });

    describe("transformRecipeToV2", () => {
        it("should wrap array recipes in object format", () => {
            const legacy = [
                { op: "To Base64", args: ["standard"] }
            ];

            const result = transformRecipeToV2(legacy);

            expect(result.name).toBeDefined();
            expect(result.operations).toBeInstanceOf(Array);
            expect(result.metadata.originalFormat).toBe("array");
        });

        it("should convert array args to named object args", () => {
            const recipe = {
                name: "Test",
                operations: [
                    { op: "Test Op", args: ["value1", "value2", "value3"] }
                ]
            };

            const result = transformRecipeToV2(recipe);

            expect(result.operations[0].args).toEqual({
                arg0: "value1",
                arg1: "value2",
                arg2: "value3"
            });
            expect(result.operations[0]._legacyArgsConverted).toBe(true);
        });

        it("should preserve object args unchanged", () => {
            const recipe = {
                name: "Modern Recipe",
                operations: [
                    { op: "Test", args: { key: "value", num: 42 } }
                ]
            };

            const result = transformRecipeToV2(recipe);

            expect(result.operations[0].args).toEqual({ key: "value", num: 42 });
            expect(result.operations[0]._legacyArgsConverted).toBeUndefined();
        });

        it("should add transformation metadata", () => {
            const recipe = {
                name: "Test",
                operations: []
            };

            const result = transformRecipeToV2(recipe);

            expect(result.metadata).toBeDefined();
            expect(result.metadata.transformedAt).toBeDefined();
            expect(result.metadata.v2Compatible).toBe(true);
        });

        it("should preserve existing metadata", () => {
            const recipe = {
                name: "Test",
                operations: [],
                metadata: {
                    author: "test",
                    version: "1.0"
                }
            };

            const result = transformRecipeToV2(recipe);

            expect(result.metadata.author).toBe("test");
            expect(result.metadata.version).toBe("1.0");
            expect(result.metadata.v2Compatible).toBe(true);
        });

        it("should handle non-transformable input gracefully", () => {
            expect(transformRecipeToV2(null)).toBe(null);
            expect(transformRecipeToV2(undefined)).toBe(undefined);
            expect(transformRecipeToV2("string")).toBe("string");
            expect(transformRecipeToV2(42)).toBe(42);
        });

        it("should transform nested operations", () => {
            const recipe = {
                name: "Complex Recipe",
                operations: [
                    { op: "Op1", args: ["a", "b"] },
                    { op: "Op2", args: { key: "value" } },
                    { op: "Op3", args: [1, 2, 3] }
                ]
            };

            const result = transformRecipeToV2(recipe);

            // First and third ops should be converted
            expect(result.operations[0]._legacyArgsConverted).toBe(true);
            expect(result.operations[1]._legacyArgsConverted).toBeUndefined();
            expect(result.operations[2]._legacyArgsConverted).toBe(true);
        });
    });

    describe("getDeprecationStats", () => {
        it("should return complete statistics structure", () => {
            const stats = getDeprecationStats();

            expect(stats).toHaveProperty("warned");
            expect(stats).toHaveProperty("warnedDetails");
            expect(stats).toHaveProperty("total");
            expect(stats).toHaveProperty("suppressed");
            expect(stats).toHaveProperty("v2CompatibilityMode");
            expect(stats).toHaveProperty("availableCodes");
            expect(stats).toHaveProperty("sessionDuration");
        });

        it("should list available deprecation codes", () => {
            const stats = getDeprecationStats();

            expect(stats.availableCodes).toContain("DEP001");
            expect(stats.availableCodes).toContain("DEP007");
            expect(stats.availableCodes).toContain("DEP008");
            expect(stats.availableCodes.length).toBe(8);
        });
    });

    describe("getToolName", () => {
        it("should add cyberchef_ prefix in v1 mode", () => {
            expect(getToolName("to_base64", false)).toBe("cyberchef_to_base64");
            expect(getToolName("md5", false)).toBe("cyberchef_md5");
        });

        it("should return unprefixed name in v2 mode", () => {
            expect(getToolName("to_base64", true)).toBe("to_base64");
            expect(getToolName("md5", true)).toBe("md5");
        });
    });

    describe("stripToolPrefix", () => {
        it("should remove cyberchef_ prefix", () => {
            expect(stripToolPrefix("cyberchef_to_base64")).toBe("to_base64");
            expect(stripToolPrefix("cyberchef_aes_encrypt")).toBe("aes_encrypt");
        });

        it("should leave unprefixed names unchanged", () => {
            expect(stripToolPrefix("to_base64")).toBe("to_base64");
            expect(stripToolPrefix("md5")).toBe("md5");
        });

        it("should handle empty and edge cases", () => {
            expect(stripToolPrefix("")).toBe("");
            expect(stripToolPrefix("cyberchef_")).toBe("");
        });
    });

    describe("Configuration Constants", () => {
        it("should export V2_COMPATIBILITY_MODE", () => {
            expect(typeof V2_COMPATIBILITY_MODE).toBe("boolean");
        });

        it("should export SUPPRESS_DEPRECATIONS", () => {
            expect(typeof SUPPRESS_DEPRECATIONS).toBe("boolean");
        });
    });
});

describe("Migration Preview - Complex Scenarios", () => {
    beforeEach(() => {
        resetDeprecations();
    });

    it("should analyze deeply nested recipe structures", () => {
        const recipe = {
            name: "Complex Pipeline",
            description: "Multi-stage processing",
            operations: [
                { op: "From Base64", args: ["standard"] },
                { op: "Gunzip", args: {} },
                { op: "JSON Beautify", args: { indent: 2 } },
                { op: "Find / Replace", args: ["old", "new", true] }
            ]
        };

        const result = analyzeRecipeCompatibility(recipe);

        // Should detect array args issues
        expect(result.issues.filter(i => i.code === "DEP005").length).toBeGreaterThan(0);
    });

    it("should transform complex recipes with mixed arg formats", () => {
        const recipe = {
            name: "Mixed Format Recipe",
            operations: [
                { op: "Op1", args: ["array", "args"] },
                { op: "Op2", args: { object: "args" } },
                { op: "Op3", args: [] },
                { op: "Op4" } // No args
            ]
        };

        const result = transformRecipeToV2(recipe);

        expect(result.operations[0]._legacyArgsConverted).toBe(true);
        expect(result.operations[1]._legacyArgsConverted).toBeUndefined();
        expect(result.operations[2]._legacyArgsConverted).toBe(true);
        expect(result.operations[3].args).toBeUndefined();
    });

    it("should handle empty operations array", () => {
        const recipe = {
            name: "Empty Recipe",
            operations: []
        };

        const analysis = analyzeRecipeCompatibility(recipe);
        const transformed = transformRecipeToV2(recipe);

        expect(analysis.compatible).toBe(true);
        expect(analysis.issueCount).toBe(0);
        expect(transformed.operations).toHaveLength(0);
    });
});
