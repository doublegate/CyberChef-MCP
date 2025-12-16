/**
 * Recipe storage module for CyberChef MCP Server.
 * Provides JSON file-based storage with atomic writes and in-memory caching.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { promises as fs } from "fs";
import { dirname } from "path";
import { randomUUID } from "crypto";
import { getLogger } from "./logger.mjs";
import { createInputError } from "./errors.mjs";
import { RecipeSchema } from "./recipe-validator.mjs";

// Configuration
const STORAGE_FILE = process.env.CYBERCHEF_RECIPE_STORAGE || "./recipes.json";
const MAX_RECIPES = parseInt(process.env.CYBERCHEF_RECIPE_MAX_COUNT, 10) || 10000;
const BACKUP_ENABLED = process.env.CYBERCHEF_RECIPE_BACKUP !== "false"; // Enabled by default

/**
 * Storage schema version.
 */
const STORAGE_VERSION = "1.0.0";

/**
 * Create a fresh storage schema object.
 * @returns {Object} Fresh storage schema with empty recipes array.
 */
function createEmptyStorage() {
    return {
        version: STORAGE_VERSION,
        recipes: [],
        lastModified: new Date().toISOString()
    };
}

/**
 * Recipe storage class with JSON file backend.
 */
export class RecipeStorage {
    /**
     * Create a new recipe storage instance.
     *
     * @param {string} filePath - Path to the storage file.
     */
    constructor(filePath = STORAGE_FILE) {
        this.filePath = filePath;
        this.cache = null;
        this.lastLoadTime = null;
        this.logger = getLogger();
    }

    /**
     * Initialize storage (create file if not exists).
     *
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            await fs.access(this.filePath);
            // File exists, load it to validate
            await this.load();
        } catch (error) {
            if (error.code === "ENOENT") {
                // File doesn't exist, create it
                this.logger.info({ filePath: this.filePath }, "Creating new recipe storage file");
                await this.save(createEmptyStorage());
            } else {
                throw error;
            }
        }
    }

    /**
     * Load recipes from file.
     *
     * @returns {Promise<Object>} Storage object with recipes array.
     */
    async load() {
        try {
            const data = await fs.readFile(this.filePath, "utf8");
            const storage = JSON.parse(data);

            // Validate storage structure
            if (!storage.version || !Array.isArray(storage.recipes)) {
                throw new Error("Invalid storage file format");
            }

            // Update cache
            this.cache = storage;
            this.lastLoadTime = Date.now();

            this.logger.debug({
                recipeCount: storage.recipes.length,
                version: storage.version
            }, "Loaded recipes from storage");

            return storage;
        } catch (error) {
            if (error.code === "ENOENT") {
                // File doesn't exist yet
                return createEmptyStorage();
            }

            this.logger.error({
                error: error.message,
                filePath: this.filePath
            }, "Failed to load recipe storage");

            throw createInputError(
                `Failed to load recipe storage: ${error.message}`,
                { filePath: this.filePath }
            );
        }
    }

    /**
     * Save recipes to file with atomic write.
     *
     * @param {Object} storage - Storage object to save.
     * @returns {Promise<void>}
     */
    async save(storage) {
        const tempFile = `${this.filePath}.tmp`;

        try {
            // Ensure directory exists
            const dir = dirname(this.filePath);
            await fs.mkdir(dir, { recursive: true });

            // Create backup if enabled
            if (BACKUP_ENABLED) {
                try {
                    await fs.access(this.filePath);
                    await fs.copyFile(this.filePath, `${this.filePath}.backup`);
                } catch (error) {
                    // Ignore if file doesn't exist yet
                    if (error.code !== "ENOENT") {
                        this.logger.warn({
                            error: error.message
                        }, "Failed to create backup");
                    }
                }
            }

            // Update timestamp
            storage.lastModified = new Date().toISOString();

            // Write to temp file
            await fs.writeFile(tempFile, JSON.stringify(storage, null, 2), "utf8");

            // Atomic rename
            await fs.rename(tempFile, this.filePath);

            // Update cache
            this.cache = storage;
            this.lastLoadTime = Date.now();

            this.logger.debug({
                recipeCount: storage.recipes.length
            }, "Saved recipes to storage");

        } catch (error) {
            // Clean up temp file if it exists
            try {
                await fs.unlink(tempFile);
            } catch (unlinkError) {
                // Ignore
            }

            this.logger.error({
                error: error.message,
                filePath: this.filePath
            }, "Failed to save recipe storage");

            throw createInputError(
                `Failed to save recipe storage: ${error.message}`,
                { filePath: this.filePath }
            );
        }
    }

    /**
     * Get all recipes with optional filtering.
     *
     * @param {Object} options - Filter options.
     * @param {string} options.tag - Filter by tag.
     * @param {string} options.category - Filter by category.
     * @param {string} options.search - Search in name and description.
     * @param {number} options.limit - Maximum number of results.
     * @param {number} options.offset - Offset for pagination.
     * @returns {Promise<Array>} Array of recipes.
     */
    async getAll(options = {}) {
        const storage = this.cache || await this.load();
        let recipes = storage.recipes;

        // Apply filters
        if (options.tag) {
            recipes = recipes.filter(r =>
                r.tags && r.tags.includes(options.tag)
            );
        }

        if (options.category) {
            recipes = recipes.filter(r =>
                r.metadata && r.metadata.category === options.category
            );
        }

        if (options.search) {
            const searchLower = options.search.toLowerCase();
            recipes = recipes.filter(r => {
                const nameMatch = r.name.toLowerCase().includes(searchLower);
                const descMatch = r.description && r.description.toLowerCase().includes(searchLower);
                const tagMatch = r.tags && r.tags.some(tag => tag.toLowerCase().includes(searchLower));
                return nameMatch || descMatch || tagMatch;
            });
        }

        // Apply pagination
        const offset = options.offset || 0;
        const limit = options.limit || recipes.length;

        return recipes.slice(offset, offset + limit);
    }

    /**
     * Get a recipe by ID.
     *
     * @param {string} id - Recipe UUID.
     * @returns {Promise<Object|null>} Recipe object or null if not found.
     */
    async getById(id) {
        const storage = this.cache || await this.load();
        return storage.recipes.find(r => r.id === id) || null;
    }

    /**
     * Create a new recipe.
     *
     * @param {Object} recipeData - Recipe data (without id, created, updated).
     * @returns {Promise<Object>} Created recipe with generated fields.
     */
    async create(recipeData) {
        const storage = this.cache || await this.load();

        // Check recipe count limit
        if (storage.recipes.length >= MAX_RECIPES) {
            throw createInputError(
                `Recipe storage is full (maximum ${MAX_RECIPES} recipes)`,
                {
                    maxRecipes: MAX_RECIPES,
                    currentCount: storage.recipes.length
                }
            );
        }

        // Generate recipe
        const now = new Date().toISOString();
        const recipe = {
            id: randomUUID(),
            ...recipeData,
            version: recipeData.version || "1.0.0",
            created: now,
            updated: now
        };

        // Validate schema
        RecipeSchema.parse(recipe);

        // Add to storage
        storage.recipes.push(recipe);
        await this.save(storage);

        this.logger.info({
            recipeId: recipe.id,
            recipeName: recipe.name
        }, "Created new recipe");

        return recipe;
    }

    /**
     * Update an existing recipe.
     *
     * @param {string} id - Recipe UUID.
     * @param {Object} updates - Fields to update.
     * @returns {Promise<Object>} Updated recipe.
     */
    async update(id, updates) {
        const storage = this.cache || await this.load();
        const index = storage.recipes.findIndex(r => r.id === id);

        if (index === -1) {
            throw createInputError(
                `Recipe not found: ${id}`,
                { recipeId: id }
            );
        }

        const recipe = storage.recipes[index];

        // Apply updates
        const updatedRecipe = {
            ...recipe,
            ...updates,
            id: recipe.id, // Preserve ID
            created: recipe.created, // Preserve creation time
            updated: new Date().toISOString(),
            // Increment patch version
            version: incrementVersion(recipe.version)
        };

        // Validate schema
        RecipeSchema.parse(updatedRecipe);

        // Update storage
        storage.recipes[index] = updatedRecipe;
        await this.save(storage);

        this.logger.info({
            recipeId: updatedRecipe.id,
            recipeName: updatedRecipe.name,
            oldVersion: recipe.version,
            newVersion: updatedRecipe.version
        }, "Updated recipe");

        return updatedRecipe;
    }

    /**
     * Delete a recipe by ID.
     *
     * @param {string} id - Recipe UUID.
     * @returns {Promise<boolean>} True if deleted, false if not found.
     */
    async delete(id) {
        const storage = this.cache || await this.load();
        const initialLength = storage.recipes.length;

        storage.recipes = storage.recipes.filter(r => r.id !== id);

        if (storage.recipes.length === initialLength) {
            return false;
        }

        await this.save(storage);

        this.logger.info({
            recipeId: id
        }, "Deleted recipe");

        return true;
    }

    /**
     * Check if a recipe exists.
     *
     * @param {string} id - Recipe UUID.
     * @returns {Promise<boolean>} True if recipe exists.
     */
    async exists(id) {
        const recipe = await this.getById(id);
        return recipe !== null;
    }

    /**
     * Get storage statistics.
     *
     * @returns {Promise<Object>} Storage statistics.
     */
    async getStats() {
        const storage = this.cache || await this.load();

        return {
            totalRecipes: storage.recipes.length,
            maxRecipes: MAX_RECIPES,
            storageVersion: storage.version,
            lastModified: storage.lastModified,
            filePath: this.filePath,
            categories: [...new Set(storage.recipes
                .map(r => r.metadata?.category)
                .filter(Boolean)
            )],
            tags: [...new Set(storage.recipes
                .flatMap(r => r.tags || [])
            )]
        };
    }

    /**
     * Clear all recipes (dangerous operation).
     *
     * @returns {Promise<void>}
     */
    async clear() {
        this.logger.warn("Clearing all recipes from storage");
        await this.save(createEmptyStorage());
    }

    /**
     * Restore from backup.
     *
     * @returns {Promise<boolean>} True if restored successfully.
     */
    async restoreFromBackup() {
        const backupFile = `${this.filePath}.backup`;

        try {
            await fs.access(backupFile);
            await fs.copyFile(backupFile, this.filePath);

            // Reload cache
            this.cache = null;
            await this.load();

            this.logger.info("Restored recipes from backup");
            return true;

        } catch (error) {
            this.logger.error({
                error: error.message
            }, "Failed to restore from backup");
            return false;
        }
    }
}

/**
 * Increment semver version (patch level).
 *
 * @param {string} version - Current version (e.g., "1.0.0").
 * @returns {string} Incremented version (e.g., "1.0.1").
 */
function incrementVersion(version) {
    const parts = version.split(".");
    if (parts.length !== 3) {
        return "1.0.1";
    }

    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    const patch = parseInt(parts[2], 10);

    return `${major}.${minor}.${patch + 1}`;
}

// Export singleton instance
export const recipeStorage = new RecipeStorage();
