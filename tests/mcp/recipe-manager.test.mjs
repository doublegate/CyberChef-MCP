/**
 * Test suite for CyberChef Recipe Manager
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RecipeManager } from "../../src/node/recipe-manager.mjs";
import { RecipeStorage } from "../../src/node/recipe-storage.mjs";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

describe("RecipeManager", () => {
    let manager;
    let storage;
    let testDir;
    let testFile;

    beforeEach(async () => {
        // Create temp storage for tests
        testDir = join(tmpdir(), `cyberchef-test-${randomUUID()}`);
        testFile = join(testDir, "recipes.json");
        await fs.mkdir(testDir, { recursive: true });

        storage = new RecipeStorage(testFile);
        manager = new RecipeManager(storage);
        await manager.initialize();
    });

    afterEach(async () => {
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore
        }
    });

    describe("initialize", () => {
        it("should initialize successfully", async () => {
            expect(manager.storage).toBe(storage);
        });
    });

    describe("createRecipe", () => {
        it("should create a new recipe", async () => {
            const recipe = await manager.createRecipe({
                name: "Test Recipe",
                operations: [{ op: "To Base64" }]
            });

            expect(recipe.id).toBeDefined();
            expect(recipe.name).toBe("Test Recipe");
            expect(recipe.metadata.complexity).toBeDefined();
        });

        it("should auto-estimate complexity", async () => {
            const recipe = await manager.createRecipe({
                name: "Simple Recipe",
                operations: [{ op: "To Base64" }]
            });

            expect(recipe.metadata.complexity).toBe("low");
        });

        it("should preserve provided complexity", async () => {
            const recipe = await manager.createRecipe({
                name: "Test",
                operations: [{ op: "To Base64" }],
                metadata: { complexity: "high" }
            });

            expect(recipe.metadata.complexity).toBe("high");
        });
    });

    describe("getRecipe", () => {
        it("should retrieve recipe by ID", async () => {
            const created = await manager.createRecipe({
                name: "Test",
                operations: [{ op: "To Base64" }]
            });

            const retrieved = await manager.getRecipe(created.id);

            expect(retrieved).toEqual(created);
        });

        it("should throw if recipe not found", async () => {
            await expect(manager.getRecipe("non-existent"))
                .rejects.toThrow(/not found/);
        });
    });

    describe("listRecipes", () => {
        it("should list all recipes", async () => {
            await manager.createRecipe({
                name: "Recipe 1",
                operations: [{ op: "To Base64" }]
            });
            await manager.createRecipe({
                name: "Recipe 2",
                operations: [{ op: "To Hex" }]
            });

            const recipes = await manager.listRecipes();

            expect(recipes).toHaveLength(2);
        });

        it("should apply filters", async () => {
            await manager.createRecipe({
                name: "Recipe 1",
                tags: ["encoding"],
                operations: [{ op: "To Base64" }]
            });

            const recipes = await manager.listRecipes({ tag: "encoding" });

            expect(recipes).toHaveLength(1);
        });
    });

    describe("updateRecipe", () => {
        it("should update recipe", async () => {
            const created = await manager.createRecipe({
                name: "Original",
                operations: [{ op: "To Base64" }]
            });

            const updated = await manager.updateRecipe(created.id, {
                name: "Updated"
            });

            expect(updated.name).toBe("Updated");
        });

        it("should re-estimate complexity when operations change", async () => {
            const created = await manager.createRecipe({
                name: "Test",
                operations: [{ op: "To Base64" }]
            });

            expect(created.metadata.complexity).toBe("low");

            const updated = await manager.updateRecipe(created.id, {
                operations: Array.from({ length: 15 }, () => ({ op: "To Base64" }))
            });

            expect(updated.metadata.complexity).toBe("high");
        });
    });

    describe("deleteRecipe", () => {
        it("should delete recipe", async () => {
            const created = await manager.createRecipe({
                name: "To Delete",
                operations: [{ op: "To Base64" }]
            });

            const deleted = await manager.deleteRecipe(created.id);

            expect(deleted).toBe(true);

            await expect(manager.getRecipe(created.id))
                .rejects.toThrow(/not found/);
        });
    });

    describe("executeRecipe", () => {
        it("should execute simple recipe", async () => {
            const recipe = await manager.createRecipe({
                name: "Encode",
                operations: [{ op: "To Base64", args: {} }]
            });

            const result = await manager.executeRecipe(recipe.id, "Hello");

            expect(result.recipeId).toBe(recipe.id);
            expect(result.recipeName).toBe("Encode");
            expect(result.result).toBeDefined();
        });

        it("should throw on invalid recipe", async () => {
            await expect(manager.executeRecipe("non-existent", "test"))
                .rejects.toThrow(/not found/);
        });
    });

    describe("resolveRecipeComposition", () => {
        it("should resolve flat recipe", async () => {
            const recipe = {
                id: "test",
                operations: [
                    { op: "To Base64" },
                    { op: "To Hex" }
                ]
            };

            const resolved = await manager.resolveRecipeComposition(recipe);

            expect(resolved).toHaveLength(2);
            expect(resolved[0].op).toBe("To Base64");
            expect(resolved[1].op).toBe("To Hex");
        });

        it("should resolve nested recipes", async () => {
            const nested = await manager.createRecipe({
                name: "Nested",
                operations: [{ op: "To Hex" }]
            });

            const parent = await manager.createRecipe({
                name: "Parent",
                operations: [
                    { op: "To Base64" },
                    { recipe: nested.id }
                ]
            });

            const resolved = await manager.resolveRecipeComposition(parent);

            expect(resolved).toHaveLength(2);
            expect(resolved[0].op).toBe("To Base64");
            expect(resolved[1].op).toBe("To Hex");
        });

        it("should detect circular dependencies", async () => {
            const recipe1 = await manager.createRecipe({
                name: "Recipe 1",
                operations: [{ op: "To Base64" }]
            });

            // Manually create circular reference (bypassing validation)
            const storage = manager.storage;
            await storage.update(recipe1.id, {
                operations: [{ recipe: recipe1.id }]
            });

            // Re-fetch the updated recipe from storage
            const updatedRecipe = await storage.getById(recipe1.id);

            await expect(manager.resolveRecipeComposition(updatedRecipe))
                .rejects.toThrow(/Circular dependency/);
        });

        it("should enforce max depth", async () => {
            let previousId = null;
            for (let i = 0; i < 10; i++) {
                const operations = previousId ?
                    [{ recipe: previousId }] :
                    [{ op: "To Base64" }];

                const recipe = await manager.createRecipe({
                    name: `Recipe ${i}`,
                    operations
                });

                previousId = recipe.id;
            }

            const deepRecipe = await manager.getRecipe(previousId);

            await expect(manager.resolveRecipeComposition(deepRecipe))
                .rejects.toThrow(/maximum depth/);
        });
    });

    describe("validateRecipe", () => {
        it("should validate valid recipe", async () => {
            const now = new Date().toISOString();
            const result = await manager.validateRecipe({
                id: "550e8400-e29b-41d4-a716-446655440003",
                name: "Valid",
                version: "1.0.0",
                created: now,
                updated: now,
                operations: [{ op: "To Base64" }]
            });

            expect(result.valid).toBe(true);
            expect(result.complexity).toBeDefined();
            expect(result.operationCount).toBe(1);
        });

        it("should reject invalid recipe", async () => {
            const now = new Date().toISOString();
            const result = await manager.validateRecipe({
                id: "550e8400-e29b-41d4-a716-446655440004",
                name: "Invalid",
                version: "1.0.0",
                created: now,
                updated: now,
                operations: [{ op: "NonExistentOp" }]
            });

            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe("testRecipe", () => {
        it("should test recipe with sample inputs", async () => {
            const now = new Date().toISOString();
            const result = await manager.testRecipe(
                {
                    id: "550e8400-e29b-41d4-a716-446655440001",
                    name: "Test",
                    version: "1.0.0",
                    created: now,
                    updated: now,
                    operations: [{ op: "To Base64" }]
                },
                ["Hello", "World"]
            );

            expect(result.totalTests).toBe(2);
            expect(result.passed).toBe(2);
            expect(result.failed).toBe(0);
            expect(result.results).toHaveLength(2);
        });

        it("should handle test failures", async () => {
            const now = new Date().toISOString();
            // The implementation validates operation names first, so invalid operations
            // cause a validation error rather than a test failure
            await expect(manager.testRecipe(
                {
                    id: "550e8400-e29b-41d4-a716-446655440002",
                    name: "Test",
                    version: "1.0.0",
                    created: now,
                    updated: now,
                    operations: [{ op: "InvalidOp" }]
                },
                ["test"]
            )).rejects.toThrow(/validation failed/);
        });
    });

    describe("exportRecipe", () => {
        it("should export as JSON", async () => {
            const recipe = await manager.createRecipe({
                name: "Export Test",
                operations: [{ op: "To Base64" }]
            });

            const exported = await manager.exportRecipe(recipe.id, "json");

            const parsed = JSON.parse(exported);
            expect(parsed.name).toBe("Export Test");
        });

        it("should export as YAML", async () => {
            const recipe = await manager.createRecipe({
                name: "Export Test",
                operations: [{ op: "To Base64" }]
            });

            const exported = await manager.exportRecipe(recipe.id, "yaml");

            expect(exported).toContain("name:");
            expect(exported).toContain("Export Test");
        });

        it("should export as URL", async () => {
            const recipe = await manager.createRecipe({
                name: "Export Test",
                operations: [{ op: "To Base64" }]
            });

            const exported = await manager.exportRecipe(recipe.id, "url");

            expect(exported).toMatch(/^cyberchef:\/\/recipe\?data=/);
        });

        it("should export as CyberChef format", async () => {
            const recipe = await manager.createRecipe({
                name: "Export Test",
                operations: [{ op: "To Base64", args: {} }]
            });

            const exported = await manager.exportRecipe(recipe.id, "cyberchef");

            const parsed = JSON.parse(exported);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed[0].op).toBe("To Base64");
        });

        it("should throw on unsupported format", async () => {
            const recipe = await manager.createRecipe({
                name: "Test",
                operations: [{ op: "To Base64" }]
            });

            await expect(manager.exportRecipe(recipe.id, "xml"))
                .rejects.toThrow(/Unsupported export format/);
        });
    });

    describe("importRecipe", () => {
        it("should import from JSON", async () => {
            const data = JSON.stringify({
                name: "Imported",
                operations: [{ op: "To Base64" }]
            });

            const recipe = await manager.importRecipe(data, "json");

            expect(recipe.name).toBe("Imported");
            expect(recipe.id).toBeDefined();
        });

        it("should import from YAML", async () => {
            const data = `
name: Imported
operations:
  - op: To Base64
`;

            const recipe = await manager.importRecipe(data, "yaml");

            expect(recipe.name).toBe("Imported");
        });

        it("should import from URL", async () => {
            const original = await manager.createRecipe({
                name: "Test",
                operations: [{ op: "To Base64" }]
            });

            const url = await manager.exportRecipe(original.id, "url");
            const recipe = await manager.importRecipe(url, "url");

            expect(recipe.name).toBe("Test");
        });

        it("should import from CyberChef format", async () => {
            const data = JSON.stringify([
                { op: "To Base64", args: [] }
            ]);

            const recipe = await manager.importRecipe(data, "cyberchef");

            expect(recipe.name).toContain("Imported");
            expect(recipe.operations).toHaveLength(1);
        });

        it("should throw on invalid format", async () => {
            await expect(manager.importRecipe("invalid json", "json"))
                .rejects.toThrow(/Failed to import/);
        });
    });

    describe("getStats", () => {
        it("should return storage statistics", async () => {
            await manager.createRecipe({
                name: "Recipe 1",
                operations: [{ op: "To Base64" }]
            });

            const stats = await manager.getStats();

            expect(stats.totalRecipes).toBe(1);
            expect(stats.maxRecipes).toBeGreaterThan(0);
        });
    });
});
