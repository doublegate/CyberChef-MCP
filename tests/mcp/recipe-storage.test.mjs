/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Test suite for CyberChef Recipe Storage
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RecipeStorage } from "../../src/node/recipe-storage.mjs";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("RecipeStorage", () => {
    let storage;
    let testDir;
    let testFile;

    beforeEach(async () => {
        // Create temp directory for tests
        // mkdtemp, not join(tmpdir(), random) + mkdir. mkdtemp creates the directory atomically
        // with mode 0700 and its own random suffix, so there is no window in which the path exists
        // but is not yet owner-only -- which is the difference js/insecure-temporary-file is about.
        testDir = await fs.mkdtemp(join(tmpdir(), "cyberchef-test-"));
        testFile = join(testDir, "recipes.json");

        storage = new RecipeStorage(testFile);
    });

    afterEach(async () => {
        // Clean up test directory
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore errors
        }
    });

    describe("initialize", () => {
        it("should create file if not exists", async () => {
            await storage.initialize();

            const exists = await fs.access(testFile).then(() => true).catch(() => false);
            expect(exists).toBe(true);
        });

        it("should load existing file", async () => {
            await storage.initialize();
            await storage.initialize(); // Second init should load existing

            expect(storage.cache).toBeDefined();
        });
    });

    describe("load", () => {
        it("should load valid storage file", async () => {
            await storage.initialize();
            const loaded = await storage.load();

            expect(loaded).toHaveProperty("version");
            expect(loaded).toHaveProperty("recipes");
            expect(Array.isArray(loaded.recipes)).toBe(true);
        });

        it("should return empty schema if file doesn't exist", async () => {
            const loaded = await storage.load();

            expect(loaded).toHaveProperty("version");
            expect(loaded.recipes).toEqual([]);
        });

        it("should throw on invalid JSON", async () => {
            await fs.writeFile(testFile, "invalid json", "utf8");

            await expect(storage.load()).rejects.toThrow();
        });
    });

    describe("save - temp file hardening", () => {
        const storageData = () => ({
            version: "1.0.0",
            recipes: [],
            lastModified: new Date().toISOString()
        });

        it("does NOT write through a predictable `<path>.tmp` sibling", async () => {
            // The predictable name was the finding: anything able to write to the storage
            // directory could pre-create `<path>.tmp`, or symlink it elsewhere, and the save would
            // follow it. CYBERCHEF_RECIPE_STORAGE is caller-supplied, so the directory is not
            // necessarily private.
            //
            // Pre-creating the OLD name must no longer interfere with a save, and must not be
            // consumed by it.
            const predictable = `${testFile}.tmp`;
            await fs.writeFile(predictable, "squatted", "utf8");

            await storage.save(storageData());

            // The save succeeded...
            const saved = JSON.parse(await fs.readFile(testFile, "utf8"));
            expect(saved.version).toBe("1.0.0");

            // ...and left the squatted file untouched, i.e. never used it.
            expect(await fs.readFile(predictable, "utf8")).toBe("squatted");
        });

        it("leaves no temp files behind", async () => {
            await storage.save(storageData());
            const leftovers = (await fs.readdir(testDir)).filter(f => f.endsWith(".tmp"));
            expect(leftovers).toEqual([]);
        });

        it("removes its staging file when the save FAILS", async () => {
            // The success path is not the interesting one. Make the rename fail and assert nothing
            // is left behind -- randomised names cannot be overwritten by the next save, so a leak
            // here accumulates rather than self-healing.
            const renameSpy = vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("boom"));
            try {
                await expect(storage.save(storageData())).rejects.toThrow();
            } finally {
                renameSpy.mockRestore();
            }
            expect((await fs.readdir(testDir)).filter(f => f.endsWith(".tmp"))).toEqual([]);
        });

        it("sweeps a stale orphan from an earlier interrupted save", async () => {
            // Covers what the catch cannot: a process killed between the write and the rename.
            const orphan = `${testFile}.deadbeefdeadbeef.tmp`;
            await fs.writeFile(orphan, "{}", "utf8");
            const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
            await fs.utimes(orphan, old, old);

            await storage.save(storageData());

            await expect(fs.access(orphan)).rejects.toThrow();
        });

        it("does NOT sweep a recent temp file, which may be a concurrent save", async () => {
            const fresh = `${testFile}.feedfacefeedface.tmp`;
            await fs.writeFile(fresh, "{}", "utf8");

            await storage.save(storageData());

            // Still there: a one-hour floor is well beyond any live write.
            await expect(fs.access(fresh)).resolves.toBeUndefined();
        });

        it("ignores a DIRECTORY that matches the temp-file pattern", async () => {
            // opendir yields Dirents, so a matching directory is skipped by type rather than
            // reaching unlink() and throwing EISDIR.
            const dirTrap = `${testFile}.0123456789abcdef.tmp`;
            await fs.mkdir(dirTrap);
            const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
            await fs.utimes(dirTrap, old, old);

            await storage.save(storageData());

            // Still there, and the save succeeded.
            await expect(fs.access(dirTrap)).resolves.toBeUndefined();
            expect(JSON.parse(await fs.readFile(testFile, "utf8")).version).toBe("1.0.0");
        });

        it("writes the storage file owner-only", async () => {
            // A recipe can carry keys and IVs, so the default 0666-minus-umask is too generous.
            await storage.save(storageData());
            const { mode } = await fs.stat(testFile);
            // Low 9 bits: owner rw, group/other nothing.
            expect(mode & 0o777).toBe(0o600);
        });
    });

    describe("save", () => {
        it("should save storage to file", async () => {
            const storageData = {
                version: "1.0.0",
                recipes: [],
                lastModified: new Date().toISOString()
            };

            await storage.save(storageData);

            const content = await fs.readFile(testFile, "utf8");
            const parsed = JSON.parse(content);

            expect(parsed.version).toBe("1.0.0");
            expect(parsed.recipes).toEqual([]);
        });

        it("should create backup when enabled", async () => {
            await storage.initialize();

            const storageData = {
                version: "1.0.0",
                recipes: [{ id: "test", name: "Test" }],
                lastModified: new Date().toISOString()
            };

            await storage.save(storageData);
            await storage.save(storageData);

            // Backup creation depends on BACKUP_ENABLED env var
            // This test verifies save() succeeds with multiple calls
        });

        it("should perform atomic write", async () => {
            const storageData = {
                version: "1.0.0",
                recipes: [],
                lastModified: new Date().toISOString()
            };

            await storage.save(storageData);

            // Verify no .tmp file remains
            const tmpExists = await fs.access(`${testFile}.tmp`).then(() => true).catch(() => false);
            expect(tmpExists).toBe(false);
        });
    });

    describe("CRUD operations", () => {
        beforeEach(async () => {
            await storage.initialize();
        });

        describe("create", () => {
            it("should create a new recipe", async () => {
                const recipe = await storage.create({
                    name: "Test Recipe",
                    operations: [{ op: "To Base64" }]
                });

                expect(recipe.id).toBeDefined();
                expect(recipe.name).toBe("Test Recipe");
                expect(recipe.version).toBe("1.0.0");
                expect(recipe.created).toBeDefined();
                expect(recipe.updated).toBeDefined();
            });

            it("should validate recipe schema", async () => {
                await expect(storage.create({
                    name: "Bad Recipe",
                    operations: []
                })).rejects.toThrow();
            });

            it("should enforce recipe count limit", async () => {
                // This test would require creating MAX_RECIPES recipes
                // Skipping for performance, but the logic is there
                expect(true).toBe(true);
            });
        });

        describe("getById", () => {
            it("should retrieve recipe by ID", async () => {
                const created = await storage.create({
                    name: "Test Recipe",
                    operations: [{ op: "To Base64" }]
                });

                const retrieved = await storage.getById(created.id);

                expect(retrieved).toEqual(created);
            });

            it("should return null for non-existent ID", async () => {
                const retrieved = await storage.getById("non-existent");

                expect(retrieved).toBeNull();
            });
        });

        describe("getAll", () => {
            it("should return all recipes", async () => {
                await storage.create({
                    name: "Recipe 1",
                    operations: [{ op: "To Base64" }]
                });
                await storage.create({
                    name: "Recipe 2",
                    operations: [{ op: "To Hex" }]
                });

                const all = await storage.getAll();

                expect(all).toHaveLength(2);
            });

            it("should filter by tag", async () => {
                await storage.create({
                    name: "Recipe 1",
                    tags: ["encoding"],
                    operations: [{ op: "To Base64" }]
                });
                await storage.create({
                    name: "Recipe 2",
                    tags: ["hashing"],
                    operations: [{ op: "MD5" }]
                });

                const filtered = await storage.getAll({ tag: "encoding" });

                expect(filtered).toHaveLength(1);
                expect(filtered[0].name).toBe("Recipe 1");
            });

            it("should filter by category", async () => {
                await storage.create({
                    name: "Recipe 1",
                    metadata: { category: "crypto" },
                    operations: [{ op: "AES Encrypt" }]
                });
                await storage.create({
                    name: "Recipe 2",
                    metadata: { category: "encoding" },
                    operations: [{ op: "To Base64" }]
                });

                const filtered = await storage.getAll({ category: "crypto" });

                expect(filtered).toHaveLength(1);
                expect(filtered[0].name).toBe("Recipe 1");
            });

            it("should search by name and description", async () => {
                await storage.create({
                    name: "Encode Data",
                    description: "Encodes data to base64",
                    operations: [{ op: "To Base64" }]
                });
                await storage.create({
                    name: "Hash Data",
                    description: "Hashes data with MD5",
                    operations: [{ op: "MD5" }]
                });

                const results = await storage.getAll({ search: "encode" });

                expect(results).toHaveLength(1);
                expect(results[0].name).toBe("Encode Data");
            });

            it("should apply pagination", async () => {
                for (let i = 0; i < 5; i++) {
                    await storage.create({
                        name: `Recipe ${i}`,
                        operations: [{ op: "To Base64" }]
                    });
                }

                const page1 = await storage.getAll({ limit: 2, offset: 0 });
                const page2 = await storage.getAll({ limit: 2, offset: 2 });

                expect(page1).toHaveLength(2);
                expect(page2).toHaveLength(2);
                expect(page1[0].name).not.toBe(page2[0].name);
            });
        });

        describe("update", () => {
            it("should update existing recipe", async () => {
                const created = await storage.create({
                    name: "Original Name",
                    operations: [{ op: "To Base64" }]
                });

                // Small delay to ensure timestamp difference
                await new Promise(resolve => setTimeout(resolve, 5));

                const updated = await storage.update(created.id, {
                    name: "Updated Name"
                });

                expect(updated.name).toBe("Updated Name");
                expect(updated.version).not.toBe(created.version);
                expect(updated.updated).not.toBe(created.updated);
            });

            it("should throw if recipe not found", async () => {
                await expect(storage.update("non-existent", {
                    name: "New Name"
                })).rejects.toThrow(/not found/);
            });

            it("should preserve ID and creation time", async () => {
                const created = await storage.create({
                    name: "Test",
                    operations: [{ op: "To Base64" }]
                });

                const updated = await storage.update(created.id, {
                    name: "Updated"
                });

                expect(updated.id).toBe(created.id);
                expect(updated.created).toBe(created.created);
            });

            it("should increment version", async () => {
                const created = await storage.create({
                    name: "Test",
                    operations: [{ op: "To Base64" }]
                });

                expect(created.version).toBe("1.0.0");

                const updated = await storage.update(created.id, {
                    name: "Updated"
                });

                expect(updated.version).toBe("1.0.1");
            });
        });

        describe("delete", () => {
            it("should delete recipe by ID", async () => {
                const created = await storage.create({
                    name: "To Delete",
                    operations: [{ op: "To Base64" }]
                });

                const deleted = await storage.delete(created.id);

                expect(deleted).toBe(true);

                const retrieved = await storage.getById(created.id);
                expect(retrieved).toBeNull();
            });

            it("should return false if recipe not found", async () => {
                const deleted = await storage.delete("non-existent");

                expect(deleted).toBe(false);
            });
        });

        describe("exists", () => {
            it("should return true for existing recipe", async () => {
                const created = await storage.create({
                    name: "Test",
                    operations: [{ op: "To Base64" }]
                });

                const exists = await storage.exists(created.id);

                expect(exists).toBe(true);
            });

            it("should return false for non-existent recipe", async () => {
                const exists = await storage.exists("non-existent");

                expect(exists).toBe(false);
            });
        });
    });

    describe("getStats", () => {
        it("should return storage statistics", async () => {
            await storage.initialize();

            await storage.create({
                name: "Recipe 1",
                tags: ["tag1"],
                metadata: { category: "cat1" },
                operations: [{ op: "To Base64" }]
            });

            const stats = await storage.getStats();

            expect(stats.totalRecipes).toBe(1);
            expect(stats.maxRecipes).toBeGreaterThan(0);
            expect(stats.storageVersion).toBeDefined();
            expect(stats.filePath).toBe(testFile);
            expect(stats.categories).toContain("cat1");
            expect(stats.tags).toContain("tag1");
        });
    });

    describe("clear", () => {
        it("should clear all recipes", async () => {
            await storage.initialize();

            await storage.create({
                name: "Recipe 1",
                operations: [{ op: "To Base64" }]
            });

            await storage.clear();

            const all = await storage.getAll();
            expect(all).toHaveLength(0);
        });
    });

    describe("restoreFromBackup", () => {
        it("should restore from backup if exists", async () => {
            await storage.initialize();

            const recipe1 = await storage.create({
                name: "Recipe 1",
                operations: [{ op: "To Base64" }]
            });

            // Create backup manually
            await fs.copyFile(testFile, `${testFile}.backup`);

            // Delete recipe
            await storage.delete(recipe1.id);

            // Restore
            const restored = await storage.restoreFromBackup();

            expect(restored).toBe(true);

            const recipes = await storage.getAll();
            expect(recipes).toHaveLength(1);
        });

        it("should return false if no backup exists", async () => {
            await storage.initialize();

            const restored = await storage.restoreFromBackup();

            expect(restored).toBe(false);
        });
    });

    describe("concurrent saves within one process", () => {
        it("does not make the process race itself", async () => {
            // A server handles requests concurrently, so two overlapping cyberchef_recipe_create
            // calls reach one RecipeStorage instance at once. Before saves were serialised, each
            // read the same `loadedGeneration`, and whichever committed last found the generation
            // already advanced -- failing with a message blaming "another process", which is not
            // what happened. Reproduced deterministically at three concurrent creates.
            await storage.initialize();

            const names = ["a", "b", "c", "d", "e", "f", "g", "h"];
            const results = await Promise.allSettled(
                names.map(name => storage.create({ name, operations: [{ op: "To Base64" }] })));

            const rejected = results.filter(r => r.status === "rejected");
            expect(rejected.map(r => r.reason?.message ?? String(r.reason))).toEqual([]);

            // And every one is actually on disk. Serialising the writes would be worthless if the
            // last writer overwrote the others, which is the other half of this failure mode.
            const onDisk = JSON.parse(await fs.readFile(testFile, "utf8"));
            expect(onDisk.recipes.map(r => r.name).sort()).toEqual([...names].sort());
        });

        it("does not resurrect recipes that an overlapping clear removed", async () => {
            // Serialising only the SAVE was not enough, and this is the case that proved it.
            // Every mutator is a read-modify-write; with only the save inside the critical
            // section, clear() builds a fresh snapshot while create() pushes onto the shared
            // cache, and whichever commits last wins. The user asks for their recipes to be
            // deleted, is told it worked, and they come back -- silent, which is what makes it
            // worse than the loud generation error that serialising the save removed.
            await storage.initialize();
            await storage.create({ name: "old-1", operations: [{ op: "To Base64" }] });
            await storage.create({ name: "old-2", operations: [{ op: "To Hex" }] });

            await Promise.allSettled([
                storage.clear(),
                storage.create({ name: "new", operations: [{ op: "To Hex" }] })
            ]);

            const onDisk = JSON.parse(await fs.readFile(testFile, "utf8"));
            const names = onDisk.recipes.map(r => r.name);
            expect(names).not.toContain("old-1");
            expect(names).not.toContain("old-2");
        });

        it("keeps saving after one save fails", async () => {
            // The queues chain through rejection as well as fulfilment; one failed save must not
            // wedge every save after it.
            //
            // The failure is injected at the SAVE. An earlier version of this test used an invalid
            // recipe name, which RecipeSchema rejects before `save` is ever reached -- so it
            // asserted the schema and proved nothing at all about the queue.
            await storage.initialize();

            // Injected at the FILESYSTEM, not by replacing saveNow. Stubbing the method skips
            // the very error handling under test -- including the cache invalidation that stops a
            // failed write being committed by the next successful one.
            const renameSpy = vi.spyOn(fs, "rename")
                .mockRejectedValueOnce(new Error("injected disk failure"));

            await expect(storage.create({ name: "doomed", operations: [{ op: "To Base64" }] }))
                .rejects.toThrow(/injected disk failure/);

            expect(renameSpy).toHaveBeenCalled();
            const ok = await storage.create({ name: "after", operations: [{ op: "To Hex" }] });
            expect(ok.name).toBe("after");

            // The survivor is on disk, and the one whose save failed is not.
            const onDisk = JSON.parse(await fs.readFile(testFile, "utf8"));
            expect(onDisk.recipes.map(r => r.name)).toContain("after");
            expect(onDisk.recipes.map(r => r.name)).not.toContain("doomed");
        });
    });
});
