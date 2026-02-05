/**
 * Worker Pool Tests
 *
 * Tests for the Piscina-based worker thread pool.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect, afterAll } from "vitest";
import {
    CPU_INTENSIVE_OPERATIONS,
    shouldUseWorker,
    getPoolStats,
    initWorkerPool,
    executeInWorker,
    destroyWorkerPool
} from "../../src/node/worker-pool.mjs";

describe("Worker Pool", () => {
    describe("CPU_INTENSIVE_OPERATIONS", () => {
        it("should include encryption operations", () => {
            expect(CPU_INTENSIVE_OPERATIONS.has("AES Encrypt")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("AES Decrypt")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("DES Encrypt")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("DES Decrypt")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("Triple DES Encrypt")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("Triple DES Decrypt")).toBe(true);
        });

        it("should include RSA operations", () => {
            expect(CPU_INTENSIVE_OPERATIONS.has("RSA Encrypt")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("RSA Decrypt")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("RSA Sign")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("RSA Verify")).toBe(true);
        });

        it("should include hashing operations", () => {
            expect(CPU_INTENSIVE_OPERATIONS.has("SHA1")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("SHA2")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("SHA3")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("MD5")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("Whirlpool")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("BLAKE2b")).toBe(true);
        });

        it("should include compression operations", () => {
            expect(CPU_INTENSIVE_OPERATIONS.has("Gzip")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("Gunzip")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("Bzip2 Compress")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("Bzip2 Decompress")).toBe(true);
        });

        it("should include key generation operations", () => {
            expect(CPU_INTENSIVE_OPERATIONS.has("Generate RSA Key Pair")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("Generate PGP Key Pair")).toBe(true);
        });

        it("should include password hashing operations", () => {
            expect(CPU_INTENSIVE_OPERATIONS.has("Bcrypt")).toBe(true);
            expect(CPU_INTENSIVE_OPERATIONS.has("Scrypt")).toBe(true);
        });

        it("should not include simple encoding operations", () => {
            expect(CPU_INTENSIVE_OPERATIONS.has("To Base64")).toBe(false);
            expect(CPU_INTENSIVE_OPERATIONS.has("To Hex")).toBe(false);
            expect(CPU_INTENSIVE_OPERATIONS.has("URL Encode")).toBe(false);
        });
    });

    describe("shouldUseWorker (pool not initialized)", () => {
        it("should return false when pool is not initialized", () => {
            expect(shouldUseWorker("AES Encrypt", 10000)).toBe(false);
        });

        it("should return false for non-CPU-intensive operations", () => {
            expect(shouldUseWorker("To Base64", 10000)).toBe(false);
        });
    });

    describe("getPoolStats (pool not initialized)", () => {
        it("should return null when pool is not initialized", () => {
            expect(getPoolStats()).toBeNull();
        });
    });

    describe("Worker Pool Lifecycle", () => {
        afterAll(async () => {
            await destroyWorkerPool();
        });

        it("should initialize the worker pool", async () => {
            await initWorkerPool({ minThreads: 1, maxThreads: 2, idleTimeout: 5000 });
            const stats = getPoolStats();
            expect(stats).not.toBeNull();
            expect(stats.threads).toBeGreaterThanOrEqual(0);
        });

        it("should report shouldUseWorker correctly after init", () => {
            // CPU-intensive with sufficient input size
            expect(shouldUseWorker("AES Encrypt", 2048)).toBe(true);
            // CPU-intensive but too small input
            expect(shouldUseWorker("AES Encrypt", 100)).toBe(false);
            // Non-CPU-intensive
            expect(shouldUseWorker("To Base64", 10000)).toBe(false);
        });

        it("should execute a simple operation in worker", async () => {
            const result = await executeInWorker(
                "Hello, World!",
                [{ op: "To Base64", args: ["A-Za-z0-9+/="] }],
                10000
            );
            expect(result.value).toBe("SGVsbG8sIFdvcmxkIQ==");
        });

        it("should execute a hash operation in worker", async () => {
            const result = await executeInWorker(
                "test",
                [{ op: "MD5", args: [] }],
                10000
            );
            expect(result.value).toBeDefined();
            expect(result.value.length).toBeGreaterThan(0);
        });

        it("should provide updated stats after execution", () => {
            const stats = getPoolStats();
            expect(stats).not.toBeNull();
            expect(stats.completed).toBeGreaterThan(0);
        });

        it("should destroy the pool cleanly", async () => {
            await destroyWorkerPool();
            expect(getPoolStats()).toBeNull();
        });

        it("should throw when executing without pool", async () => {
            await expect(
                executeInWorker("test", [{ op: "MD5", args: [] }], 5000)
            ).rejects.toThrow("Worker pool not initialized");
        });

        it("should allow re-initialization after destroy", async () => {
            await initWorkerPool({ minThreads: 1, maxThreads: 1 });
            expect(getPoolStats()).not.toBeNull();
            await destroyWorkerPool();
        });
    });
});
