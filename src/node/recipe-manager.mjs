/**
 * Recipe manager module for CyberChef MCP Server.
 * Provides high-level recipe operations, import/export, and execution.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { bake } from "./index.mjs";
import { recipeStorage } from "./recipe-storage.mjs";
import {
    validateRecipe,
    validateRecipeCreate,
    validateRecipeUpdate,
    estimateComplexity
} from "./recipe-validator.mjs";
import { getLogger } from "./logger.mjs";
import { createInputError } from "./errors.mjs";
import yaml from "js-yaml";

/**
 * Recipe Manager class for high-level recipe operations.
 */
export class RecipeManager {
    /**
     * Create a new recipe manager.
     *
     * @param {Object} storage - Recipe storage instance.
     */
    constructor(storage = recipeStorage) {
        this.storage = storage;
        this.logger = getLogger();
    }

    /**
     * Initialize the recipe manager.
     *
     * @returns {Promise<void>}
     */
    async initialize() {
        await this.storage.initialize();
        this.logger.info("Recipe manager initialized");
    }

    /**
     * Create a new recipe.
     *
     * @param {Object} recipeData - Recipe creation data.
     * @returns {Promise<Object>} Created recipe.
     */
    async createRecipe(recipeData) {
        // Validate input
        validateRecipeCreate(recipeData);

        // Auto-estimate complexity if not provided
        if (!recipeData.metadata?.complexity) {
            const complexity = estimateComplexity(recipeData);
            recipeData.metadata = {
                ...recipeData.metadata,
                complexity
            };
        }

        // Create recipe
        const recipe = await this.storage.create(recipeData);

        this.logger.info({
            recipeId: recipe.id,
            recipeName: recipe.name,
            operationCount: recipe.operations.length
        }, "Created recipe");

        return recipe;
    }

    /**
     * Get a recipe by ID.
     *
     * @param {string} id - Recipe UUID.
     * @returns {Promise<Object>} Recipe object.
     */
    async getRecipe(id) {
        const recipe = await this.storage.getById(id);

        if (!recipe) {
            throw createInputError(
                `Recipe not found: ${id}`,
                { recipeId: id }
            );
        }

        return recipe;
    }

    /**
     * List recipes with optional filtering.
     *
     * @param {Object} filters - Filter options.
     * @returns {Promise<Array>} Array of recipes.
     */
    async listRecipes(filters = {}) {
        return await this.storage.getAll(filters);
    }

    /**
     * Update a recipe.
     *
     * @param {string} id - Recipe UUID.
     * @param {Object} updates - Fields to update.
     * @returns {Promise<Object>} Updated recipe.
     */
    async updateRecipe(id, updates) {
        // Validate update input
        validateRecipeUpdate(updates);

        // Get existing recipe
        const existingRecipe = await this.getRecipe(id);

        // Merge updates
        const mergedRecipe = {
            ...existingRecipe,
            ...updates
        };

        // Re-estimate complexity if operations changed
        if (updates.operations && !updates.metadata?.complexity) {
            const complexity = estimateComplexity(mergedRecipe);
            updates.metadata = {
                ...updates.metadata,
                complexity
            };
        }

        // Update recipe
        const recipe = await this.storage.update(id, updates);

        this.logger.info({
            recipeId: recipe.id,
            recipeName: recipe.name
        }, "Updated recipe");

        return recipe;
    }

    /**
     * Delete a recipe.
     *
     * @param {string} id - Recipe UUID.
     * @returns {Promise<boolean>} True if deleted.
     */
    async deleteRecipe(id) {
        const deleted = await this.storage.delete(id);

        if (!deleted) {
            throw createInputError(
                `Recipe not found: ${id}`,
                { recipeId: id }
            );
        }

        this.logger.info({
            recipeId: id
        }, "Deleted recipe");

        return true;
    }

    /**
     * Execute a saved recipe.
     *
     * @param {string} id - Recipe UUID.
     * @param {string} input - Input data.
     * @returns {Promise<Object>} Execution result.
     */
    async executeRecipe(id, input) {
        const recipe = await this.getRecipe(id);

        // Validate recipe before execution
        await validateRecipe(recipe, (id) => this.storage.getById(id));

        // Resolve recipe composition
        const resolvedOperations = await this.resolveRecipeComposition(recipe);

        // Convert to CyberChef bake format
        const bakeRecipe = resolvedOperations.map(op => ({
            op: op.op,
            args: this.convertArgsToArray(op.op, op.args || {})
        }));

        this.logger.info({
            recipeId: recipe.id,
            recipeName: recipe.name,
            operationCount: bakeRecipe.length,
            inputSize: Buffer.byteLength(input, "utf8")
        }, "Executing recipe");

        // Execute with CyberChef bake
        const result = await bake(input, bakeRecipe);

        return {
            recipeId: recipe.id,
            recipeName: recipe.name,
            result: result.value,
            type: result.type || "string"
        };
    }

    /**
     * Resolve recipe composition (expand nested recipes).
     *
     * @param {Object} recipe - Recipe with possible nested references.
     * @param {Set} visited - Set of visited recipe IDs (for recursion tracking).
     * @param {number} depth - Current recursion depth.
     * @returns {Promise<Array>} Flattened array of operations.
     */
    async resolveRecipeComposition(recipe, visited = new Set(), depth = 0) {
        const MAX_DEPTH = parseInt(process.env.CYBERCHEF_RECIPE_MAX_DEPTH, 10) || 5;

        if (depth > MAX_DEPTH) {
            throw createInputError(
                `Recipe nesting exceeds maximum depth of ${MAX_DEPTH}`,
                {
                    maxDepth: MAX_DEPTH,
                    currentDepth: depth,
                    recipeId: recipe.id
                }
            );
        }

        visited.add(recipe.id);
        const resolvedOps = [];

        for (const operation of recipe.operations) {
            if (operation.recipe) {
                // Check for circular dependency
                if (visited.has(operation.recipe)) {
                    throw createInputError(
                        `Circular dependency detected in recipe: ${recipe.id}`,
                        {
                            recipeId: recipe.id,
                            circularReference: operation.recipe
                        }
                    );
                }

                // Load and resolve nested recipe
                const nestedRecipe = await this.storage.getById(operation.recipe);
                if (!nestedRecipe) {
                    throw createInputError(
                        `Referenced recipe not found: ${operation.recipe}`,
                        {
                            recipeId: recipe.id,
                            missingReference: operation.recipe
                        }
                    );
                }

                const nestedOps = await this.resolveRecipeComposition(
                    nestedRecipe,
                    new Set(visited),
                    depth + 1
                );

                resolvedOps.push(...nestedOps);

            } else if (operation.op) {
                // Regular operation
                resolvedOps.push(operation);
            }
        }

        return resolvedOps;
    }

    /**
     * Convert operation arguments from object to array format (for CyberChef bake).
     *
     * @param {string} opName - Operation name.
     * @param {Object} argsObj - Arguments as key-value object.
     * @returns {Array} Arguments as array.
     */
    convertArgsToArray(opName, argsObj) {
        // For now, CyberChef bake expects args as an array
        // We'll convert the object back to array based on operation config
        // This is handled by the existing resolveArgValue logic in mcp-server.mjs
        // For simplicity, return empty array if no args
        return Object.values(argsObj);
    }

    /**
     * Validate a recipe without saving it.
     *
     * @param {Object} recipe - Recipe to validate.
     * @returns {Promise<Object>} Validation result.
     */
    async validateRecipe(recipe) {
        try {
            await validateRecipe(recipe, (id) => this.storage.getById(id));

            return {
                valid: true,
                complexity: estimateComplexity(recipe),
                operationCount: recipe.operations.length
            };

        } catch (error) {
            return {
                valid: false,
                error: error.message,
                details: error.context || {}
            };
        }
    }

    /**
     * Test a recipe with sample inputs.
     *
     * @param {Object} recipe - Recipe to test (not yet saved).
     * @param {Array} testInputs - Array of test inputs.
     * @returns {Promise<Object>} Test results.
     */
    async testRecipe(recipe, testInputs = []) {
        // Validate recipe structure
        const validation = await this.validateRecipe(recipe);
        if (!validation.valid) {
            throw createInputError(
                `Recipe validation failed: ${validation.error}`,
                validation.details
            );
        }

        // Run test cases
        const results = [];
        for (let i = 0; i < testInputs.length; i++) {
            const testInput = testInputs[i];

            try {
                // Create temporary recipe for execution
                const tempRecipe = {
                    id: "test-" + i,
                    ...recipe,
                    version: "1.0.0",
                    created: new Date().toISOString(),
                    updated: new Date().toISOString()
                };

                // Resolve operations
                const resolvedOps = await this.resolveRecipeComposition(tempRecipe);

                // Convert to bake format
                const bakeRecipe = resolvedOps.map(op => ({
                    op: op.op,
                    args: this.convertArgsToArray(op.op, op.args || {})
                }));

                // Execute
                const result = await bake(testInput, bakeRecipe);

                results.push({
                    input: testInput,
                    output: result.value,
                    success: true
                });

            } catch (error) {
                results.push({
                    input: testInput,
                    error: error.message,
                    success: false
                });
            }
        }

        return {
            totalTests: testInputs.length,
            passed: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };
    }

    /**
     * Export a recipe to various formats.
     *
     * @param {string} id - Recipe UUID.
     * @param {string} format - Export format: 'json', 'yaml', 'url', 'cyberchef'.
     * @returns {Promise<string>} Exported recipe data.
     */
    async exportRecipe(id, format = "json") {
        const recipe = await this.getRecipe(id);

        switch (format.toLowerCase()) {
            case "json":
                return JSON.stringify(recipe, null, 2);

            case "yaml":
                return yaml.dump(recipe, { indent: 2 });

            case "url": {
                // Base64-encode JSON for URL
                const json = JSON.stringify(recipe);
                const base64 = Buffer.from(json, "utf8").toString("base64url");
                return `cyberchef://recipe?data=${base64}`;
            }

            case "cyberchef": {
                // Convert to CyberChef's native recipe format
                const cyberchefRecipe = recipe.operations.map(op => ({
                    op: op.op,
                    args: this.convertArgsToArray(op.op, op.args || {})
                }));
                return JSON.stringify(cyberchefRecipe, null, 2);
            }

            default:
                throw createInputError(
                    `Unsupported export format: ${format}`,
                    {
                        supportedFormats: ["json", "yaml", "url", "cyberchef"]
                    }
                );
        }
    }

    /**
     * Import a recipe from various formats.
     *
     * @param {string} data - Recipe data to import.
     * @param {string} format - Import format: 'json', 'yaml', 'url', 'cyberchef'.
     * @returns {Promise<Object>} Imported and saved recipe.
     */
    async importRecipe(data, format = "json") {
        let recipeData;

        try {
            switch (format.toLowerCase()) {
                case "json":
                    recipeData = JSON.parse(data);
                    break;

                case "yaml":
                    recipeData = yaml.load(data);
                    break;

                case "url": {
                    // Extract base64 data from URL
                    const match = data.match(/data=([A-Za-z0-9_-]+)/);
                    if (!match) {
                        throw new Error("Invalid URL format");
                    }
                    const json = Buffer.from(match[1], "base64url").toString("utf8");
                    recipeData = JSON.parse(json);
                    break;
                }

                case "cyberchef": {
                    // Convert CyberChef format to our format
                    const operations = JSON.parse(data);
                    if (!Array.isArray(operations)) {
                        throw new Error("Invalid CyberChef recipe format");
                    }

                    // Convert args array to object
                    recipeData = {
                        name: "Imported CyberChef Recipe",
                        description: "Imported from CyberChef format",
                        operations: operations.map(op => ({
                            op: op.op,
                            args: this.convertArgsArrayToObject(op.op, op.args || [])
                        }))
                    };
                    break;
                }

                default:
                    throw createInputError(
                        `Unsupported import format: ${format}`,
                        {
                            supportedFormats: ["json", "yaml", "url", "cyberchef"]
                        }
                    );
            }

            // Remove id if present (will be regenerated)
            delete recipeData.id;
            delete recipeData.created;
            delete recipeData.updated;

            // Create recipe
            return await this.createRecipe(recipeData);

        } catch (error) {
            throw createInputError(
                `Failed to import recipe: ${error.message}`,
                {
                    format,
                    originalError: error.message
                }
            );
        }
    }

    /**
     * Convert operation arguments from array to object format.
     *
     * @param {string} opName - Operation name.
     * @param {Array} argsArray - Arguments as array.
     * @returns {Object} Arguments as key-value object.
     */
    convertArgsArrayToObject(opName, argsArray) {
        // This is a best-effort conversion
        // In practice, we'd need the operation config to map indices to names
        // For now, return empty object
        return {};
    }

    /**
     * Get storage statistics.
     *
     * @returns {Promise<Object>} Storage statistics.
     */
    async getStats() {
        return await this.storage.getStats();
    }
}

// Export singleton instance
export const recipeManager = new RecipeManager();
