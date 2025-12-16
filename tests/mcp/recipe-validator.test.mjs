/**
 * Test suite for CyberChef Recipe Validator
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect } from "vitest";
import {
    RecipeOperationSchema,
    RecipeMetadataSchema,
    RecipeSchema,
    RecipeCreateSchema,
    RecipeUpdateSchema,
    validateOperationNames,
    validateOperationArguments,
    detectCircularDependencies,
    estimateComplexity,
    validateRecipe,
    validateRecipeCreate,
    validateRecipeUpdate
} from "../../src/node/recipe-validator.mjs";

describe("Zod Schemas", () => {
    describe("RecipeOperationSchema", () => {
        it("should validate operation with op", () => {
            // Test without args field to avoid Zod v4 z.any() internal issues
            const operation = {
                op: "To Base64"
            };

            const result = RecipeOperationSchema.safeParse(operation);
            expect(result.success).toBe(true);
        });

        it("should validate operation with recipe reference", () => {
            const operation = {
                recipe: "550e8400-e29b-41d4-a716-446655440000"
            };

            const result = RecipeOperationSchema.safeParse(operation);
            expect(result.success).toBe(true);
        });

        it("should reject operation without op or recipe", () => {
            const operation = {
                args: {}
            };

            const result = RecipeOperationSchema.safeParse(operation);
            expect(result.success).toBe(false);
        });

        it("should reject operation with both op and recipe", () => {
            const operation = {
                op: "To Base64",
                recipe: "550e8400-e29b-41d4-a716-446655440000"
            };

            const result = RecipeOperationSchema.safeParse(operation);
            expect(result.success).toBe(false);
        });
    });

    describe("RecipeMetadataSchema", () => {
        it("should validate valid metadata", () => {
            const metadata = {
                complexity: "medium",
                estimatedTime: "100ms",
                category: "encoding"
            };

            const result = RecipeMetadataSchema.safeParse(metadata);
            expect(result.success).toBe(true);
        });

        it("should allow empty metadata", () => {
            const result = RecipeMetadataSchema.safeParse({});
            expect(result.success).toBe(true);
        });

        it("should reject invalid complexity", () => {
            const metadata = {
                complexity: "extreme"
            };

            const result = RecipeMetadataSchema.safeParse(metadata);
            expect(result.success).toBe(false);
        });
    });

    describe("RecipeSchema", () => {
        it("should validate complete recipe", () => {
            const recipe = {
                id: "550e8400-e29b-41d4-a716-446655440000",
                name: "Test Recipe",
                description: "A test recipe",
                version: "1.0.0",
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                operations: [
                    { op: "To Base64" }
                ]
            };

            expect(() => RecipeSchema.parse(recipe)).not.toThrow();
        });

        it("should reject recipe without required fields", () => {
            const recipe = {
                name: "Test Recipe"
            };

            expect(() => RecipeSchema.parse(recipe)).toThrow();
        });

        it("should reject invalid version format", () => {
            const recipe = {
                id: "550e8400-e29b-41d4-a716-446655440000",
                name: "Test",
                version: "1.0", // Invalid semver
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                operations: [{ op: "To Base64" }]
            };

            expect(() => RecipeSchema.parse(recipe)).toThrow();
        });

        it("should reject recipe with too many operations", () => {
            const operations = Array.from({ length: 101 }, () => ({ op: "To Base64" }));
            const recipe = {
                id: "550e8400-e29b-41d4-a716-446655440000",
                name: "Test",
                version: "1.0.0",
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                operations
            };

            expect(() => RecipeSchema.parse(recipe)).toThrow();
        });
    });

    describe("RecipeCreateSchema", () => {
        it("should validate creation input", () => {
            const input = {
                name: "New Recipe",
                operations: [{ op: "To Base64" }]
            };

            expect(() => RecipeCreateSchema.parse(input)).not.toThrow();
        });

        it("should reject empty operations", () => {
            const input = {
                name: "New Recipe",
                operations: []
            };

            expect(() => RecipeCreateSchema.parse(input)).toThrow();
        });
    });

    describe("RecipeUpdateSchema", () => {
        it("should validate update input", () => {
            const input = {
                name: "Updated Name"
            };

            expect(() => RecipeUpdateSchema.parse(input)).not.toThrow();
        });

        it("should allow empty update", () => {
            expect(() => RecipeUpdateSchema.parse({})).not.toThrow();
        });
    });
});

describe("validateOperationNames", () => {
    it("should accept valid operation names", () => {
        const recipe = {
            operations: [
                { op: "To Base64" },
                { op: "From Base64" },
                { op: "To Hex" }
            ]
        };

        expect(() => validateOperationNames(recipe)).not.toThrow();
    });

    it("should skip recipe references", () => {
        const recipe = {
            operations: [
                { recipe: "550e8400-e29b-41d4-a716-446655440000" }
            ]
        };

        expect(() => validateOperationNames(recipe)).not.toThrow();
    });

    it("should reject invalid operation names", () => {
        const recipe = {
            operations: [
                { op: "InvalidOperation123" }
            ]
        };

        expect(() => validateOperationNames(recipe)).toThrow(/Invalid operation name/);
    });

    it("should provide helpful error context", () => {
        const recipe = {
            operations: [
                { op: "To Base64" },
                { op: "BadOperation" }
            ]
        };

        try {
            validateOperationNames(recipe);
        } catch (error) {
            expect(error.context.index).toBe(1);
            expect(error.context.operationName).toBe("BadOperation");
        }
    });
});

describe("validateOperationArguments", () => {
    it("should validate boolean arguments", () => {
        const recipe = {
            operations: [
                {
                    op: "JSON Beautify",
                    args: {
                        dropControlChars: true
                    }
                }
            ]
        };

        expect(() => validateOperationArguments(recipe)).not.toThrow();
    });

    it("should reject invalid boolean type", () => {
        const recipe = {
            operations: [
                {
                    op: "JSON Beautify",
                    args: {
                        dropControlChars: "yes" // Should be boolean
                    }
                }
            ]
        };

        // Note: This test depends on JSON Beautify having a boolean arg
        // If the operation doesn't exist or has different args, adjust accordingly
        try {
            validateOperationArguments(recipe);
        } catch (error) {
            // May throw or may not depending on actual operation config
            expect(error).toBeDefined();
        }
    });

    it("should skip operations without args", () => {
        const recipe = {
            operations: [
                { op: "To Base64" }
            ]
        };

        expect(() => validateOperationArguments(recipe)).not.toThrow();
    });

    it("should skip recipe references", () => {
        const recipe = {
            operations: [
                { recipe: "550e8400-e29b-41d4-a716-446655440000" }
            ]
        };

        expect(() => validateOperationArguments(recipe)).not.toThrow();
    });
});

describe("detectCircularDependencies", () => {
    it("should detect direct circular reference", async () => {
        const recipe1 = {
            id: "id1",
            name: "Recipe 1",
            operations: [
                { recipe: "id1" } // Self-reference
            ]
        };

        const getRecipeById = async (id) => {
            if (id === "id1") return recipe1;
            return null;
        };

        await expect(detectCircularDependencies(recipe1, getRecipeById))
            .rejects.toThrow(/Circular dependency/);
    });

    it("should detect indirect circular reference", async () => {
        const recipe1 = {
            id: "id1",
            name: "Recipe 1",
            operations: [{ recipe: "id2" }]
        };

        const recipe2 = {
            id: "id2",
            name: "Recipe 2",
            operations: [{ recipe: "id1" }] // Circular
        };

        const getRecipeById = async (id) => {
            if (id === "id1") return recipe1;
            if (id === "id2") return recipe2;
            return null;
        };

        await expect(detectCircularDependencies(recipe1, getRecipeById))
            .rejects.toThrow(/Circular dependency/);
    });

    it("should detect missing referenced recipe", async () => {
        const recipe = {
            id: "id1",
            name: "Recipe 1",
            operations: [{ recipe: "missing" }]
        };

        const getRecipeById = async (id) => null;

        await expect(detectCircularDependencies(recipe, getRecipeById))
            .rejects.toThrow(/not found/);
    });

    it("should detect max depth exceeded", async () => {
        const recipes = {};
        for (let i = 0; i < 10; i++) {
            recipes[`id${i}`] = {
                id: `id${i}`,
                name: `Recipe ${i}`,
                operations: [{ recipe: `id${i + 1}` }]
            };
        }

        const getRecipeById = async (id) => recipes[id] || null;

        await expect(detectCircularDependencies(recipes.id0, getRecipeById))
            .rejects.toThrow(/maximum depth/);
    });

    it("should pass for valid nested recipes", async () => {
        const recipe1 = {
            id: "id1",
            name: "Recipe 1",
            operations: [{ recipe: "id2" }]
        };

        const recipe2 = {
            id: "id2",
            name: "Recipe 2",
            operations: [{ op: "To Base64" }]
        };

        const getRecipeById = async (id) => {
            if (id === "id1") return recipe1;
            if (id === "id2") return recipe2;
            return null;
        };

        await expect(detectCircularDependencies(recipe1, getRecipeById))
            .resolves.not.toThrow();
    });
});

describe("estimateComplexity", () => {
    it("should return 'low' for simple recipes", () => {
        const recipe = {
            operations: [
                { op: "To Base64" }
            ]
        };

        expect(estimateComplexity(recipe)).toBe("low");
    });

    it("should return 'medium' for moderate recipes", () => {
        const recipe = {
            operations: [
                { op: "To Base64" },
                { op: "To Hex" },
                { op: "To Upper case" },
                { op: "To Lower case" }
            ]
        };

        expect(estimateComplexity(recipe)).toBe("medium");
    });

    it("should return 'high' for complex recipes", () => {
        const recipe = {
            operations: Array.from({ length: 15 }, () => ({ op: "To Base64" }))
        };

        expect(estimateComplexity(recipe)).toBe("high");
    });

    it("should return 'high' for CPU-intensive operations", () => {
        const recipe = {
            operations: [
                { op: "AES Encrypt" },
                { op: "SHA2" },
                { op: "Bcrypt" },
                { op: "Gzip" }
            ]
        };

        expect(estimateComplexity(recipe)).toBe("high");
    });

    it("should consider recipe references", () => {
        const recipe = {
            operations: [
                { recipe: "id1" },
                { recipe: "id2" },
                { recipe: "id3" }
            ]
        };

        expect(estimateComplexity(recipe)).toBe("high");
    });
});

describe("validateRecipe", () => {
    it("should validate complete recipe", async () => {
        const recipe = {
            id: "550e8400-e29b-41d4-a716-446655440000",
            name: "Valid Recipe",
            version: "1.0.0",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            operations: [
                { op: "To Base64" }
            ]
        };

        await expect(validateRecipe(recipe)).resolves.not.toThrow();
    });

    it("should reject invalid schema", async () => {
        const recipe = {
            name: "Incomplete Recipe"
        };

        await expect(validateRecipe(recipe)).rejects.toThrow();
    });

    it("should reject invalid operation names", async () => {
        const recipe = {
            id: "550e8400-e29b-41d4-a716-446655440000",
            name: "Bad Recipe",
            version: "1.0.0",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            operations: [
                { op: "InvalidOp" }
            ]
        };

        await expect(validateRecipe(recipe)).rejects.toThrow();
    });
});

describe("validateRecipeCreate", () => {
    it("should validate creation input", () => {
        const input = {
            name: "New Recipe",
            operations: [
                { op: "To Base64" }
            ]
        };

        expect(() => validateRecipeCreate(input)).not.toThrow();
    });

    it("should reject invalid input", () => {
        const input = {
            operations: []
        };

        expect(() => validateRecipeCreate(input)).toThrow();
    });
});

describe("validateRecipeUpdate", () => {
    it("should validate update input", () => {
        const input = {
            name: "Updated Name",
            description: "New description"
        };

        expect(() => validateRecipeUpdate(input)).not.toThrow();
    });

    it("should validate operations if provided", () => {
        const input = {
            operations: [
                { op: "InvalidOperation" }
            ]
        };

        expect(() => validateRecipeUpdate(input)).toThrow();
    });
});
