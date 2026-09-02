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
import { currentTenant, DEFAULT_TENANT } from "./lib/tenancy.mjs";

// Configuration
const STORAGE_FILE = process.env.CYBERCHEF_RECIPE_STORAGE || "./recipes.json";
const MAX_RECIPES = parseInt(process.env.CYBERCHEF_RECIPE_MAX_COUNT, 10) || 10000;
const BACKUP_ENABLED = process.env.CYBERCHEF_RECIPE_BACKUP !== "false"; // Enabled by default

/**
 * How old a staging file must be before a sweep will remove it.
 *
 * Well beyond any live write -- a save completes in milliseconds -- so a concurrent save's
 * staging file is never a candidate. Module scope rather than per-call: it is a constant.
 */
const STALE_TEMP_AFTER_MS = 60 * 60 * 1000; // 1 hour

/**
 * Storage schema version.
 */
const STORAGE_VERSION = "1.0.0";

/**
 * Whether a stored recipe belongs to a tenant.
 *
 * A recipe with no `tenant` field belongs to the default tenant. Every recipe written before
 * v2.5.0 is in that state, and treating the absent field as "owned by nobody" would hide a
 * user's entire existing library the moment they upgraded -- the file would still be on disk,
 * intact, and every list would come back empty.
 *
 * @param {Object} recipe - A stored recipe.
 * @param {string} tenant - The tenant to test against.
 * @returns {boolean} Whether the recipe belongs to that tenant.
 */
function ownedBy(recipe, tenant) {
    return (recipe.tenant || DEFAULT_TENANT) === tenant;
}

/**
 * Create a fresh storage schema object.
 * @returns {Object} Fresh storage schema with empty recipes array.
 */
function createEmptyStorage() {
    return {
        version: STORAGE_VERSION,
        recipes: [],
        lastModified: new Date().toISOString(),
        // Bumped on every save, and checked against the on-disk value before the rename. See
        // `save()` for what this detects and why it is not a lock.
        generation: 0
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
            // A file written before v2.6.0 has no generation; treat it as 0 so an upgrade does
            // not read as a conflict on the first save.
            this.loadedGeneration = storage.generation ?? 0;

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
     * The generation currently recorded in the storage file, read fresh from disk.
     *
     * Deliberately bypasses `this.cache`: the entire question is whether the file has moved on
     * without this process noticing, and a cached answer cannot tell you that.
     *
     * Returns `null` rather than throwing when the file is absent or unreadable. An absent file is
     * the ordinary first-save case, and a corrupt one is a problem for `load()` to report -- the
     * caller treats `null` as "no basis for a conflict", so a read failure here can never block a
     * save that would otherwise succeed.
     *
     * @returns {Promise<number|null>} The on-disk generation, or null if it cannot be determined.
     */
    async readGeneration() {
        try {
            const raw = await fs.readFile(this.filePath, "utf8");
            const parsed = JSON.parse(raw);
            // A file written before v2.6.0 has no generation. Treated as 0, matching `load()`.
            return typeof parsed.generation === "number" ? parsed.generation : 0;
        } catch {
            return null;
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
        const dir = dirname(this.filePath);
        const prefix = `${basename(this.filePath)}.`;
        const cutoff = Date.now() - STALE_TEMP_AFTER_MS;
        let handle;
        try {
            // opendir rather than readdir: this directory is caller-supplied via
            // CYBERCHEF_RECIPE_STORAGE and may be somewhere large (a home directory, say).
            // Streaming entries keeps a sweep from materialising an arbitrary listing in memory
            // just to find at most a handful of `.tmp` siblings.
            handle = await fs.opendir(dir);
            for await (const entry of handle) {
                // opendir yields Dirents, so the type is already known -- no extra syscall.
                // A DIRECTORY matching the pattern would otherwise reach unlink() and throw
                // EISDIR, which the catch below would then log as a genuine surprise. Skipping
                // non-files makes that impossible rather than merely handled.
                if (!entry.isFile()) continue;
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

            // Optimistic concurrency, for the multi-replica case.
            //
            // Recipe storage is a FILE, so it is local to one process unless deliberately placed
            // on a shared volume. Two replicas sharing one file both load, both modify, and both
            // save -- and without this the second rename silently discards the first one's work.
            // A user saves a recipe, it is accepted, and it is gone: the worst shape of bug,
            // because nothing reports it.
            //
            // This is NOT a lock, and is not sold as one. There is a window between the check
            // below and the rename, so a sufficiently unlucky interleaving still slips through.
            // Node has no portable advisory locking, and adding a lock daemon to a security
            // toolkit to coordinate a JSON file is the wrong trade. What this does buy is that
            // the ordinary case -- two replicas minutes apart, one stale -- is caught and
            // reported instead of losing data.
            const expectedGeneration = this.loadedGeneration ?? 0;
            storage.generation = expectedGeneration + 1;

            // Write to temp file
            await fs.writeFile(tempFile, JSON.stringify(storage, null, 2), {
                encoding: "utf8",
                // Exclusive create: fail if the path exists rather than following it.
                flag: "wx",
                // Owner-only. The default 0666-minus-umask can leave saved recipes
                // world-readable, and a recipe can carry keys and IVs.
                mode: 0o600
            });

            // Re-read the on-disk generation as late as possible before committing.
            const onDisk = await this.readGeneration();
            if (onDisk !== null && onDisk !== expectedGeneration) {
                await fs.unlink(tempFile).catch(() => {});
                throw createInputError(
                    "Recipe storage changed underneath this process: expected generation " +
                    `${expectedGeneration} but found ${onDisk}. Another process is writing the ` +
                    "same file. Recipe storage is node-local; with multiple replicas either give " +
                    "each one its own CYBERCHEF_RECIPE_STORAGE path or run a single replica.",
                    { expectedGeneration, onDiskGeneration: onDisk, filePath: this.filePath });
            }

            // Atomic rename
            await fs.rename(tempFile, this.filePath);

            // Sweep orphans from earlier interrupted saves. AFTER the rename, so a failure here
            // cannot affect the save that just succeeded.
            await this.cleanupStaleTempFiles();

            // Update cache
            this.cache = storage;
            this.lastLoadTime = Date.now();
            // What we just wrote is now what we believe is on disk, so the next save compares
            // against this rather than against whatever `load()` last saw.
            this.loadedGeneration = storage.generation ?? 0;

            this.logger.debug({
                recipeCount: storage.recipes.length,
                generation: storage.generation
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
        // Tenant scoping comes FIRST, before every other filter and before pagination.
        //
        // Order matters here in a way it does not for the filters below: paginating a
        // cross-tenant list and then scoping it would return short or empty pages whose length
        // reveals how many recipes other tenants hold. Scope, then filter, then paginate.
        let recipes = storage.recipes.filter(r => ownedBy(r, currentTenant()));

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
        // A recipe belonging to another tenant is reported as ABSENT, not as forbidden.
        //
        // The distinction is the whole point: "forbidden" confirms the id exists, which turns
        // this method into an oracle for enumerating other tenants' recipe ids. Recipe ids are
        // UUIDs and hard to guess, but "hard to guess" is not a reason to answer the question.
        const recipe = storage.recipes.find(r => r.id === id) || null;
        return recipe && ownedBy(recipe, currentTenant()) ? recipe : null;
    }

    /**
     * Create a new recipe.
     *
     * @param {Object} recipeData - Recipe data (without id, created, updated).
     * @returns {Promise<Object>} Created recipe with generated fields.
     */
    async create(recipeData) {
        const storage = this.cache || await this.load();
        const tenant = currentTenant();

        // Check recipe count limit, PER TENANT.
        //
        // The cap used to count every recipe in the store, which on a shared deployment means the
        // first tenant to reach it stops every other tenant from saving anything -- a denial of
        // service reachable by ordinary use, and the same noisy-neighbour problem the concurrency
        // quota has. In a single-tenant deployment every recipe is in the default tenant, so the
        // effective limit is unchanged.
        const owned = storage.recipes.reduce((n, r) => n + (ownedBy(r, tenant) ? 1 : 0), 0);
        if (owned >= MAX_RECIPES) {
            throw createInputError(
                `Recipe storage is full (maximum ${MAX_RECIPES} recipes)`,
                {
                    maxRecipes: MAX_RECIPES,
                    currentCount: owned
                }
            );
        }

        // Generate recipe.
        //
        // The caller's own `tenant` is DISCARDED before anything else happens. Stamping the
        // server's value afterwards is not enough on its own: in single-tenant mode there is no
        // value to stamp -- the record deliberately carries no `tenant` field so the on-disk shape
        // is unchanged from before v2.5.0 -- so a spread of `recipeData` would let the caller's
        // field through unopposed.
        //
        // Measured, on the first version of this code: creating a recipe with
        // `{tenant: "attacker"}` in single-tenant mode stored that value and made the recipe
        // INVISIBLE TO ITS OWN CREATOR, because `ownedBy` then compared "attacker" against
        // "default". It would also have belonged to "attacker" if tenancy were later enabled.
        const safeData = { ...recipeData };
        delete safeData.tenant;
        const now = new Date().toISOString();
        const recipe = {
            id: randomUUID(),
            ...safeData,
            version: safeData.version || "1.0.0",
            created: now,
            updated: now,
            // Written only when tenancy is active, so a single-tenant store keeps the exact record
            // shape it had before this release and enabling tenancy does not rewrite anyone's file.
            ...(tenant === DEFAULT_TENANT ? {} : { tenant })
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
        // Scoped to the caller's tenant, so another tenant's recipe is "not found" rather than
        // silently modified. Without this the id alone is authority to overwrite any recipe in
        // the store.
        const tenant = currentTenant();
        const index = storage.recipes.findIndex(r => r.id === id && ownedBy(r, tenant));

        if (index === -1) {
            throw createInputError(
                `Recipe not found: ${id}`,
                { recipeId: id }
            );
        }

        const recipe = storage.recipes[index];

        // Apply updates.
        //
        // The caller's `tenant` is DISCARDED, rather than overridden afterwards. Overriding only
        // works when the stored recipe has a tenant to restore: a LEGACY recipe (written before
        // v2.5.0) has no `tenant` field, so there was nothing to write back and the caller's value
        // survived.
        //
        // Measured, on the first version of this code: updating a legacy recipe with
        // `{tenant: "attacker"}` reassigned it and the recipe then DISAPPEARED from its owner's
        // view -- any caller could make any legacy recipe vanish by "updating" it. Discarding the
        // field instead means `...recipe` supplies the stored ownership, present or absent, and
        // there is no path by which a payload can set it.
        const safeUpdates = { ...updates };
        delete safeUpdates.tenant;
        const updatedRecipe = {
            ...recipe,
            ...safeUpdates,
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
        const tenant = currentTenant();

        // Removes the recipe only when it belongs to the caller's tenant. The previous predicate
        // matched on id alone, so any caller holding an id could delete any recipe in the store.
        storage.recipes = storage.recipes.filter(r => !(r.id === id && ownedBy(r, tenant)));

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
        // Scoped like every other read. `categories` and `tags` are the reason this matters more
        // than the count does: they are free text the user wrote, so an unscoped list hands one
        // tenant a summary of what every other tenant works on -- client names, case numbers,
        // whatever they tag with. The count alone would be a weak signal; the labels are content.
        const recipes = storage.recipes.filter(r => ownedBy(r, currentTenant()));

        return {
            totalRecipes: recipes.length,
            maxRecipes: MAX_RECIPES,
            storageVersion: storage.version,
            lastModified: storage.lastModified,
            filePath: this.filePath,
            categories: [...new Set(recipes
                .map(r => r.metadata?.category)
                .filter(Boolean)
            )],
            tags: [...new Set(recipes
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
        const tenant = currentTenant();
        // Clears only the caller's OWN recipes.
        //
        // This used to replace the entire store with an empty one, which on a shared deployment
        // means any caller can destroy every tenant's saved work in one call. It is the most
        // destructive method here, so it is the one that least tolerates being tenant-blind.
        //
        // In a single-tenant deployment every recipe is in the default tenant, so this still
        // empties the store -- the existing behaviour and what the tests assert.
        const storage = this.cache || await this.load();
        const kept = storage.recipes.filter(r => !ownedBy(r, tenant));
        this.logger.warn({ tenant, removed: storage.recipes.length - kept.length },
            "Clearing recipes from storage");

        if (!kept.length) {
            await this.save(createEmptyStorage());
            return;
        }
        await this.save({ ...storage, recipes: kept });
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
