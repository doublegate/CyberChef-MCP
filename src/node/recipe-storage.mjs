/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Recipe storage module for CyberChef MCP Server.
 * Provides JSON file-based storage with atomic writes and in-memory caching.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { promises as fs } from "fs";
import { dirname, basename, join } from "path";
import { randomUUID, randomBytes } from "crypto";
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
     * Remove stale staging files left by a save that never completed.
     *
     * Randomising the temp name closed a symlink/pre-creation hole, but it also removed a property
     * the old fixed `<path>.tmp` had for free: a leaked file was overwritten by the next save, so
     * leaks self-healed. A unique name cannot be overwritten, so a process killed between the
     * write and the rename now leaves an orphan that stays forever.
     *
     * The catch in save() already unlinks on any error it can observe; this covers the case it
     * cannot -- SIGKILL, a crash, a container stopped mid-write.
     *
     * Best-effort throughout: a failure here must never fail a save. The one-hour floor is well
     * beyond any live write (saves complete in milliseconds), so a concurrent save's staging file
     * is never a candidate.
     *
     * @returns {Promise<void>} Always resolves.
     */
    async cleanupStaleTempFiles() {
        const STALE_AFTER_MS = 60 * 60 * 1000;
        const dir = dirname(this.filePath);
        const prefix = `${basename(this.filePath)}.`;
        const cutoff = Date.now() - STALE_AFTER_MS;
        let handle;
        try {
            // opendir rather than readdir: this directory is caller-supplied via
            // CYBERCHEF_RECIPE_STORAGE and may be somewhere large (a home directory, say).
            // Streaming entries keeps a sweep from materialising an arbitrary listing in memory
            // just to find at most a handful of `.tmp` siblings.
            handle = await fs.opendir(dir);
            for await (const entry of handle) {
                const name = entry.name;
                if (!name.startsWith(prefix) || !name.endsWith(".tmp")) continue;
                const candidate = join(dir, name);
                try {
                    const { mtimeMs } = await fs.stat(candidate);
                    if (mtimeMs < cutoff) await fs.unlink(candidate);
                } catch (error) {
                    // Not swallowed: logged. A vanished file (ENOENT) is the ordinary case -- a
                    // concurrent sweep or the owning process cleaning up -- and is expected rather
                    // than notable, so it is debug. Anything else is a genuine surprise about a
                    // path we were about to delete, so it is warn.
                    const level = error.code === "ENOENT" ? "debug" : "warn";
                    this.logger[level]({
                        error: error.message,
                        code: error.code,
                        candidate
                    }, "Could not remove stale recipe-storage temp file");
                }
            }
        } catch (error) {
            // Best-effort by design: a sweep failure must never fail the save that just succeeded.
            // But it is logged rather than discarded -- an unreadable storage directory is worth
            // knowing about even when nothing depends on this sweep.
            this.logger.warn({
                error: error.message,
                code: error.code,
                dir
            }, "Could not sweep stale recipe-storage temp files");
        }
    }

    /**
     * Save recipes to file with atomic write.
     *
     * @param {Object} storage - Storage object to save.
     * @returns {Promise<void>}
     */
    async save(storage) {
        // Random suffix, not a fixed `.tmp` sibling.
        //
        // `${this.filePath}.tmp` is predictable, so anything that can write to the storage
        // directory can pre-create it -- or symlink it elsewhere -- and the write below follows
        // the link. That matters because CYBERCHEF_RECIPE_STORAGE is caller-supplied and may point
        // at a shared directory; the default `./recipes.json` is not, but a default is not a
        // guarantee. Paired with the `wx` flag on the write, which fails rather than truncating
        // when the path already exists, so a pre-created file loses the race instead of winning it.
        const tempFile = `${this.filePath}.${randomBytes(8).toString("hex")}.tmp`;

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
            await fs.writeFile(tempFile, JSON.stringify(storage, null, 2), {
                encoding: "utf8",
                // Exclusive create: fail if the path exists rather than following it.
                flag: "wx",
                // Owner-only. The default 0666-minus-umask can leave saved recipes
                // world-readable, and a recipe can carry keys and IVs.
                mode: 0o600
            });

            // Atomic rename
            await fs.rename(tempFile, this.filePath);

            // Sweep orphans from earlier interrupted saves. AFTER the rename, so a failure here
            // cannot affect the save that just succeeded.
            await this.cleanupStaleTempFiles();

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
