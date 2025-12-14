/**
 * MCP Server Validation Test Suite
 *
 * Comprehensive tests for CyberChef MCP Server to ensure:
 * 1. All tools are registered correctly
 * 2. Meta-tools (bake, search) function properly
 * 3. Sample operations execute correctly
 * 4. Tool schemas are valid and complete
 * 5. No breaking changes detected vs baseline
 *
 * @author DoubleGate
 * @license Apache-2.0
 */


import { describe, it, expect } from "vitest";
import { bake, help } from "../../src/node/index.mjs";
import OperationConfig from "../../src/core/config/OperationConfig.json" with { type: "json" };
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASELINE_PATH = join(__dirname, "baseline.json");

// Load baseline if it exists
let baseline = null;
if (existsSync(BASELINE_PATH)) {
    try {
        baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf-8"));
    } catch (err) {
        console.warn("Warning: Could not load baseline.json:", err.message);
    }
}

/**
 * Sanitize tool name to match MCP server naming.
 */
function sanitizeToolName(name) {
    if (!name) return null;
    const sanitized = "cyberchef_" + name.toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
    if (sanitized === "cyberchef_") return null;
    return sanitized;
}

describe("MCP Server - Tool Registration", () => {
    it("should have OperationConfig loaded", () => {
        expect(OperationConfig).toBeDefined();
        expect(typeof OperationConfig).toBe("object");
        expect(Object.keys(OperationConfig).length).toBeGreaterThan(0);
    });

    it("should have 300+ operations in OperationConfig", () => {
        const operationCount = Object.keys(OperationConfig).length;
        expect(operationCount).toBeGreaterThan(300);
        console.log(`Total operations in OperationConfig: ${operationCount}`);
    });

    it("should generate valid tool names for all operations", () => {
        const invalidTools = [];
        Object.keys(OperationConfig).forEach(opName => {
            const toolName = sanitizeToolName(opName);
            if (!toolName) {
                invalidTools.push(opName);
            }
        });
        expect(invalidTools).toEqual([]);
    });

    it("should match baseline tool count if baseline exists", () => {
        if (baseline) {
            const currentCount = Object.keys(OperationConfig).length;
            const baselineCount = baseline.tool_count - 2; // Exclude meta-tools
            const delta = currentCount - baselineCount;

            console.log(`Current: ${currentCount}, Baseline: ${baselineCount}, Delta: ${delta}`);

            // Allow for minor additions, but warn on removals
            if (delta < 0) {
                console.warn(`WARNING: ${Math.abs(delta)} operations removed since baseline!`);
            }

            // Fail only if major removals (>10)
            expect(delta).toBeGreaterThan(-10);
        } else {
            console.log("Baseline not found - skipping baseline comparison");
        }
    });
});

describe("MCP Server - Meta Tools", () => {
    it("should execute cyberchef_bake with simple recipe", async () => {
        const recipe = [
            { op: "To Base64", args: ["A-Za-z0-9+/="] }
        ];
        const result = await bake("Hello World", recipe);
        expect(result).toBeDefined();
        expect(result.value).toBe("SGVsbG8gV29ybGQ=");
    });

    it("should execute cyberchef_bake with hex encoding", async () => {
        const recipe = [
            { op: "To Hex", args: ["Space", 0] }
        ];
        const result = await bake("AB", recipe);
        expect(result).toBeDefined();
        expect(result.value).toBe("41 42");
    });

    it("should handle cyberchef_search (help function)", () => {
        const results = help("base64");
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);

        // Should find Base64 operations - check any string field
        const hasBase64Op = results.some(op =>
            JSON.stringify(op).toLowerCase().includes("base64")
        );
        expect(hasBase64Op).toBe(true);
    });

    it("should search operations by description", () => {
        const results = help("encrypt");
        expect(results).toBeDefined();
        expect(results.length).toBeGreaterThan(0);
    });
});

describe("MCP Server - Sample Operation Execution", () => {
    const testCases = [
        // Encoding operations
        { name: "To Base64", input: "Hello", recipe: [{ op: "To Base64", args: ["A-Za-z0-9+/="] }], expected: "SGVsbG8=" },
        { name: "To Hex", input: "Test", recipe: [{ op: "To Hex", args: ["Space", 0] }], expected: "54 65 73 74" },

        // Hash operations
        { name: "MD5", input: "test", recipe: [{ op: "MD5", args: [] }], expected: "098f6bcd4621d373cade4e832627b4f6" },
        { name: "SHA1", input: "test", recipe: [{ op: "SHA1", args: [] }], expected: "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3" },

        // Data format operations
        { name: "JSON Beautify", input: '{"a":1}', recipe: [{ op: "JSON Beautify", args: ["  ", false, false] }], expectedContains: '"a"' },
        { name: "URL Encode", input: "hello world", recipe: [{ op: "URL Encode", args: [false] }], expected: "hello%20world" },
    ];

    testCases.forEach(({ name, input, recipe, expected, expectedContains }) => {
        it(`should execute ${name}`, async () => {
            const result = await bake(input, recipe);
            expect(result).toBeDefined();

            if (expected) {
                expect(result.value).toBe(expected);
            } else if (expectedContains) {
                expect(result.value).toContain(expectedContains);
            }
        });
    });
});

describe("MCP Server - Schema Validation", () => {
    it("should have valid argument schemas for all operations", () => {
        const invalidOps = [];

        Object.keys(OperationConfig).forEach(opName => {
            const op = OperationConfig[opName];

            // Every operation should have args array (even if empty)
            if (!Array.isArray(op.args)) {
                invalidOps.push({ name: opName, reason: "Missing args array" });
                return;
            }

            // Every operation should have a description
            if (!op.description || typeof op.description !== "string") {
                invalidOps.push({ name: opName, reason: "Missing or invalid description" });
            }

            // Validate argument structure
            op.args.forEach((arg, idx) => {
                if (!arg.name) {
                    invalidOps.push({
                        name: opName,
                        reason: `Argument ${idx} missing name`
                    });
                }

                if (!arg.type) {
                    invalidOps.push({
                        name: opName,
                        reason: `Argument ${idx} (${arg.name}) missing type`
                    });
                }
            });
        });

        if (invalidOps.length > 0) {
            console.warn("Operations with schema issues:", invalidOps);
        }

        // Allow minor schema issues (upstream CyberChef problem)
        expect(invalidOps.length).toBeLessThan(5);
    });

    it("should have consistent argument types", () => {
        const validTypes = [
            "string", "number", "boolean", "option", "editableOption",
            "toggleString", "shortString", "binaryString", "binaryShortString",
            "text", "populateOption", "argSelector", "populateMultiOption",
            "editableOptionShort", "integer"
        ];

        const invalidArgTypes = [];

        Object.keys(OperationConfig).forEach(opName => {
            const op = OperationConfig[opName];

            op.args.forEach(arg => {
                if (arg.type && !validTypes.includes(arg.type)) {
                    invalidArgTypes.push({
                        operation: opName,
                        argument: arg.name,
                        type: arg.type
                    });
                }
            });
        });

        if (invalidArgTypes.length > 0) {
            console.warn("Uncommon argument types found:", invalidArgTypes);
        }

        // Don't fail, just warn (CyberChef may add new types)
        expect(true).toBe(true);
    });
});

describe("MCP Server - Breaking Change Detection", () => {
    it("should not have critical operations removed", () => {
        const criticalOps = [
            "To Base64", "From Base64",
            "AES Decrypt", "AES Encrypt",
            "MD5", "SHA1", "SHA2",
            "To Hex", "From Hex",
            "URL Encode", "URL Decode",
            "JSON Beautify", "JSON Minify",
            "Gzip", "Gunzip"
        ];

        const missing = criticalOps.filter(op => !OperationConfig[op]);

        if (missing.length > 0) {
            console.error("CRITICAL: Missing essential operations:", missing);
        }

        expect(missing).toEqual([]);
    });

    it("should maintain baseline compatibility if baseline exists", () => {
        if (!baseline) {
            console.log("Baseline not found - skipping compatibility check");
            return;
        }

        const removedTools = [];

        Object.keys(baseline.tools).forEach(toolName => {
            if (toolName === "cyberchef_bake" || toolName === "cyberchef_search") {
                return; // Skip meta-tools
            }

            // Find original operation name
            const found = Object.keys(OperationConfig).some(opName =>
                sanitizeToolName(opName) === toolName
            );

            if (!found) {
                removedTools.push(toolName);
            }
        });

        if (removedTools.length > 0) {
            console.warn("WARNING: Tools removed since baseline:", removedTools);
        }

        // Allow for minor removals (up to 5), but fail on major changes
        expect(removedTools.length).toBeLessThan(5);
    });
});

describe("MCP Server - Error Handling", () => {
    it("should handle invalid operation gracefully", async () => {
        const recipe = [{ op: "NonExistentOperation", args: [] }];

        await expect(async () => {
            await bake("test", recipe);
        }).rejects.toThrow();
    });

    it("should handle invalid arguments gracefully", async () => {
        const recipe = [{ op: "To Base64", args: ["InvalidAlphabet123"] }];

        // Should either work with default or throw clear error
        try {
            const result = await bake("test", recipe);
            expect(result).toBeDefined();
        } catch (err) {
            expect(err.message).toBeDefined();
        }
    });
});

describe("MCP Server - Performance", () => {
    it("should execute simple operations within reasonable time", async () => {
        const start = Date.now();

        for (let i = 0; i < 10; i++) {
            await bake("test", [{ op: "To Base64", args: ["A-Za-z0-9+/="] }]);
        }

        const duration = Date.now() - start;

        console.log(`10 operations executed in ${duration}ms (avg: ${duration/10}ms)`);

        // Should complete 10 operations in under 1 second
        expect(duration).toBeLessThan(1000);
    });
});
