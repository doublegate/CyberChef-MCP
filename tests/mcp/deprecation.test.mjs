/**
 * Test suite for CyberChef MCP Deprecation Warning System
 *
 * Tests for:
 * - Deprecation code definitions
 * - Warning emission and suppression
 * - Session tracking
 * - V2 compatibility mode
 * - Recipe compatibility analysis
 * - Recipe transformation
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
    DEPRECATION_CODES,
    emitDeprecation,
    emitToolNamingDeprecation,
    emitMetaToolDeprecation,
    emitRecipeFormatDeprecation,
    getDeprecationStats,
    resetDeprecations,
    getAllDeprecationCodes,
    hasWarned,
    getWarningCount,
    getToolName,
    stripToolPrefix,
    analyzeRecipeCompatibility,
    transformRecipeToV2,
    areSuppressed,
    isV2CompatibilityMode
} from "../../src/node/deprecation.mjs";

describe("Deprecation Warning System", () => {
    let originalSuppressEnv;
    let originalV2ModeEnv;

    beforeEach(() => {
        // Save original env values
        originalSuppressEnv = process.env.CYBERCHEF_SUPPRESS_DEPRECATIONS;
        originalV2ModeEnv = process.env.V2_COMPATIBILITY_MODE;

        // Clear env vars for clean tests
        delete process.env.CYBERCHEF_SUPPRESS_DEPRECATIONS;
        delete process.env.V2_COMPATIBILITY_MODE;

        // Reset deprecations before each test
        resetDeprecations();
    });

    afterEach(() => {
        // Restore original env values
        if (originalSuppressEnv === undefined) {
            delete process.env.CYBERCHEF_SUPPRESS_DEPRECATIONS;
        } else {
            process.env.CYBERCHEF_SUPPRESS_DEPRECATIONS = originalSuppressEnv;
        }

        if (originalV2ModeEnv === undefined) {
            delete process.env.V2_COMPATIBILITY_MODE;
        } else {
            process.env.V2_COMPATIBILITY_MODE = originalV2ModeEnv;
        }
    });

    describe("DEPRECATION_CODES", () => {
        it("should have all required deprecation codes defined", () => {
            expect(DEPRECATION_CODES).toHaveProperty("DEP001");
            expect(DEPRECATION_CODES).toHaveProperty("DEP002");
            expect(DEPRECATION_CODES).toHaveProperty("DEP003");
            expect(DEPRECATION_CODES).toHaveProperty("DEP004");
            expect(DEPRECATION_CODES).toHaveProperty("DEP005");
            expect(DEPRECATION_CODES).toHaveProperty("DEP006");
            expect(DEPRECATION_CODES).toHaveProperty("DEP007");
            expect(DEPRECATION_CODES).toHaveProperty("DEP008");
        });

        it("should have consistent structure for all codes", () => {
            Object.entries(DEPRECATION_CODES).forEach(([key, value]) => {
                expect(value).toHaveProperty("code");
                expect(value.code).toBe(key);
                expect(value).toHaveProperty("feature");
                expect(value).toHaveProperty("description");
                expect(value).toHaveProperty("alternative");
                expect(value).toHaveProperty("removalVersion");
                expect(value.removalVersion).toBe("2.0.0");
            });
        });

        it("should have 8 deprecation codes for v1.8.0", () => {
            expect(Object.keys(DEPRECATION_CODES).length).toBe(8);
        });
    });

    describe("emitDeprecation", () => {
        it("should emit warning for valid deprecation code", () => {
            const result = emitDeprecation("DEP001");
            expect(result).toBe(true);
            expect(hasWarned("DEP001")).toBe(true);
        });

        it("should emit warning only once per code", () => {
            const first = emitDeprecation("DEP001");
            const second = emitDeprecation("DEP001");

            expect(first).toBe(true);
            expect(second).toBe(false);
            expect(getWarningCount()).toBe(1);
        });

        it("should emit different warnings for different codes", () => {
            emitDeprecation("DEP001");
            emitDeprecation("DEP002");
            emitDeprecation("DEP003");

            expect(getWarningCount()).toBe(3);
            expect(hasWarned("DEP001")).toBe(true);
            expect(hasWarned("DEP002")).toBe(true);
            expect(hasWarned("DEP003")).toBe(true);
        });

        it("should return false for unknown deprecation code", () => {
            const result = emitDeprecation("DEP999");
            expect(result).toBe(false);
            expect(getWarningCount()).toBe(0);
        });

        it("should include context when provided", () => {
            const result = emitDeprecation("DEP001", "Test context");
            expect(result).toBe(true);
        });

        it("should not emit when suppressed", () => {
            process.env.CYBERCHEF_SUPPRESS_DEPRECATIONS = "true";

            const result = emitDeprecation("DEP001");
            expect(result).toBe(false);
            expect(getWarningCount()).toBe(0);
        });
    });

    describe("Suppression", () => {
        it("should report suppression status correctly", () => {
            expect(areSuppressed()).toBe(false);

            process.env.CYBERCHEF_SUPPRESS_DEPRECATIONS = "true";
            expect(areSuppressed()).toBe(true);

            process.env.CYBERCHEF_SUPPRESS_DEPRECATIONS = "false";
            expect(areSuppressed()).toBe(false);
        });

        it("should suppress all warnings when enabled", () => {
            process.env.CYBERCHEF_SUPPRESS_DEPRECATIONS = "true";

            emitDeprecation("DEP001");
            emitDeprecation("DEP002");
            emitDeprecation("DEP003");

            const stats = getDeprecationStats();
            expect(stats.suppressed).toBe(true);
            expect(stats.total).toBe(0);
        });
    });

    describe("V2 Compatibility Mode", () => {
        it("should report v2 mode status correctly", () => {
            expect(isV2CompatibilityMode()).toBe(false);

            process.env.V2_COMPATIBILITY_MODE = "true";
            expect(isV2CompatibilityMode()).toBe(true);

            process.env.V2_COMPATIBILITY_MODE = "false";
            expect(isV2CompatibilityMode()).toBe(false);
        });

        it("should still emit warnings in v2 mode (as errors)", () => {
            process.env.V2_COMPATIBILITY_MODE = "true";

            const result = emitDeprecation("DEP001");
            expect(result).toBe(true);
            expect(getWarningCount()).toBe(1);
        });
    });

    describe("emitToolNamingDeprecation", () => {
        it("should emit warning for cyberchef_ prefixed tools", () => {
            const result = emitToolNamingDeprecation("cyberchef_to_base64");
            expect(result).toBe(true);
            expect(hasWarned("DEP001")).toBe(true);
        });

        it("should not emit warning for non-prefixed tools", () => {
            const result = emitToolNamingDeprecation("to_base64");
            expect(result).toBe(false);
            expect(hasWarned("DEP001")).toBe(false);
        });
    });

    describe("emitMetaToolDeprecation", () => {
        it("should emit warning for cyberchef_bake", () => {
            const result = emitMetaToolDeprecation("cyberchef_bake");
            expect(result).toBe(true);
            expect(hasWarned("DEP007")).toBe(true);
        });

        it("should emit warning for cyberchef_search", () => {
            const result = emitMetaToolDeprecation("cyberchef_search");
            expect(result).toBe(true);
            expect(hasWarned("DEP008")).toBe(true);
        });

        it("should not emit warning for other tools", () => {
            const result = emitMetaToolDeprecation("cyberchef_to_base64");
            expect(result).toBe(false);
        });
    });

    describe("emitRecipeFormatDeprecation", () => {
        it("should emit warning for recipes with array args", () => {
            const recipe = [
                { op: "To Base64", args: ["A-Za-z0-9+/="] }
            ];
            const result = emitRecipeFormatDeprecation(recipe);
            expect(result).toBe(true);
            expect(hasWarned("DEP005")).toBe(true);
        });

        it("should not emit warning for recipes with object args", () => {
            const recipe = [
                { op: "To Base64", args: { alphabet: "A-Za-z0-9+/=" } }
            ];
            const result = emitRecipeFormatDeprecation(recipe);
            expect(result).toBe(false);
        });
    });

    describe("getDeprecationStats", () => {
        it("should return complete statistics", () => {
            emitDeprecation("DEP001");
            emitDeprecation("DEP002");

            const stats = getDeprecationStats();

            expect(stats.warned).toEqual(["DEP001", "DEP002"]);
            expect(stats.total).toBe(2);
            expect(stats.suppressed).toBe(false);
            expect(stats.v2CompatibilityMode).toBe(false);
            expect(stats.availableCodes).toContain("DEP001");
            expect(stats.sessionDuration).toBeGreaterThanOrEqual(0);
            expect(stats.warnedDetails).toHaveLength(2);
        });

        it("should include detailed warning info", () => {
            emitDeprecation("DEP001");

            const stats = getDeprecationStats();
            const detail = stats.warnedDetails[0];

            expect(detail.code).toBe("DEP001");
            expect(detail.feature).toBe("Tool naming convention");
            expect(detail.removalVersion).toBe("2.0.0");
        });
    });

    describe("resetDeprecations", () => {
        it("should clear all warnings", () => {
            emitDeprecation("DEP001");
            emitDeprecation("DEP002");
            expect(getWarningCount()).toBe(2);

            resetDeprecations();

            expect(getWarningCount()).toBe(0);
            expect(hasWarned("DEP001")).toBe(false);
        });

        it("should allow re-emission of warnings", () => {
            emitDeprecation("DEP001");
            resetDeprecations();
            const result = emitDeprecation("DEP001");

            expect(result).toBe(true);
        });
    });

    describe("getAllDeprecationCodes", () => {
        it("should return all codes", () => {
            const codes = getAllDeprecationCodes();

            expect(Object.keys(codes).length).toBe(8);
            expect(codes.DEP001).toBeDefined();
        });

        it("should return a copy (not the original)", () => {
            const codes = getAllDeprecationCodes();
            codes.DEP999 = { feature: "Test" };

            expect(DEPRECATION_CODES.DEP999).toBeUndefined();
        });
    });

    describe("getToolName", () => {
        it("should return prefixed name in v1 mode", () => {
            expect(getToolName("to_base64")).toBe("cyberchef_to_base64");
        });

        it("should return unprefixed name in v2 mode", () => {
            process.env.V2_COMPATIBILITY_MODE = "true";
            expect(getToolName("to_base64")).toBe("to_base64");
        });

        it("should respect forV2 override", () => {
            expect(getToolName("to_base64", true)).toBe("to_base64");
            expect(getToolName("to_base64", false)).toBe("cyberchef_to_base64");
        });
    });

    describe("stripToolPrefix", () => {
        it("should strip cyberchef_ prefix", () => {
            expect(stripToolPrefix("cyberchef_to_base64")).toBe("to_base64");
        });

        it("should return unchanged if no prefix", () => {
            expect(stripToolPrefix("to_base64")).toBe("to_base64");
        });
    });

    describe("analyzeRecipeCompatibility", () => {
        it("should return compatible for valid v2 recipes", () => {
            const recipe = {
                name: "Test Recipe",
                operations: [
                    { op: "To Base64", args: { alphabet: "standard" } }
                ]
            };

            const result = analyzeRecipeCompatibility(recipe);

            expect(result.compatible).toBe(true);
            expect(result.issueCount).toBe(0);
        });

        it("should detect positional array arguments", () => {
            const recipe = {
                name: "Test Recipe",
                operations: [
                    { op: "To Base64", args: ["A-Za-z0-9+/="] }
                ]
            };

            const result = analyzeRecipeCompatibility(recipe);

            expect(result.issues.some(i => i.code === "DEP005")).toBe(true);
            expect(result.warningCount).toBeGreaterThan(0);
        });

        it("should detect missing op field", () => {
            const recipe = {
                name: "Test Recipe",
                operations: [
                    { args: { alphabet: "standard" } }
                ]
            };

            const result = analyzeRecipeCompatibility(recipe);

            expect(result.issues.some(i => i.code === "DEP006")).toBe(true);
        });

        it("should handle array format recipes", () => {
            const recipe = [
                { op: "To Base64", args: ["A-Za-z0-9+/="] }
            ];

            const result = analyzeRecipeCompatibility(recipe);

            expect(result.issues.some(i => i.code === "DEP006")).toBe(true);
        });

        it("should return breaking for invalid recipes", () => {
            const result = analyzeRecipeCompatibility(null);

            expect(result.compatible).toBe(false);
            expect(result.issues.some(i => i.severity === "breaking")).toBe(true);
        });
    });

    describe("transformRecipeToV2", () => {
        it("should transform array format to object format", () => {
            const legacy = [
                { op: "To Base64", args: ["A-Za-z0-9+/="] }
            ];

            const result = transformRecipeToV2(legacy);

            expect(result.name).toBeDefined();
            expect(result.operations).toHaveLength(1);
            expect(result.metadata.originalFormat).toBe("array");
        });

        it("should convert array args to object args", () => {
            const recipe = {
                name: "Test",
                operations: [
                    { op: "To Base64", args: ["value1", "value2"] }
                ]
            };

            const result = transformRecipeToV2(recipe);
            const transformedOp = result.operations[0];

            expect(Array.isArray(transformedOp.args)).toBe(false);
            expect(transformedOp.args.arg0).toBe("value1");
            expect(transformedOp.args.arg1).toBe("value2");
            expect(transformedOp._legacyArgsConverted).toBe(true);
        });

        it("should preserve object args", () => {
            const recipe = {
                name: "Test",
                operations: [
                    { op: "To Base64", args: { alphabet: "standard" } }
                ]
            };

            const result = transformRecipeToV2(recipe);

            expect(result.operations[0].args).toEqual({ alphabet: "standard" });
            expect(result.operations[0]._legacyArgsConverted).toBeUndefined();
        });

        it("should add transformation metadata", () => {
            const recipe = { name: "Test", operations: [] };

            const result = transformRecipeToV2(recipe);

            expect(result.metadata.transformedAt).toBeDefined();
            expect(result.metadata.v2Compatible).toBe(true);
        });

        it("should handle non-object input gracefully", () => {
            const result = transformRecipeToV2("not a recipe");
            expect(result).toBe("not a recipe");
        });
    });
});
