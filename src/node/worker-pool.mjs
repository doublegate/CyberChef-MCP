/**
 * Worker Thread Pool Manager for CyberChef MCP Server.
 *
 * Uses Piscina to manage a pool of worker threads for CPU-intensive
 * operations, keeping the main event loop responsive.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getLogger } from "./logger.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * CPU-intensive operations that benefit from worker threads.
 * Moved from mcp-server.mjs commented code.
 */
export const CPU_INTENSIVE_OPERATIONS = new Set([
    "AES Decrypt", "AES Encrypt",
    "DES Decrypt", "DES Encrypt",
    "Triple DES Decrypt", "Triple DES Encrypt",
    "RSA Decrypt", "RSA Encrypt", "RSA Sign", "RSA Verify",
    "Bcrypt", "Scrypt",
    "Gzip", "Gunzip", "Bzip2 Decompress", "Bzip2 Compress",
    "SHA1", "SHA2", "SHA3", "MD2", "MD4", "MD5", "MD6",
    "Whirlpool", "BLAKE2b", "BLAKE2s",
    "Generate RSA Key Pair", "Generate PGP Key Pair"
]);

/**
 * Minimum input size (in bytes) to justify worker thread overhead.
 */
const WORKER_MIN_INPUT_SIZE = parseInt(
    process.env.CYBERCHEF_WORKER_MIN_INPUT_SIZE, 10
) || 1024; // 1KB default

let pool = null;

/**
 * Initialize the worker thread pool.
 *
 * @param {Object} options - Pool configuration options.
 * @param {number} options.minThreads - Minimum threads (default: 1).
 * @param {number} options.maxThreads - Maximum threads (default: 4).
 * @param {number} options.idleTimeout - Idle timeout in ms (default: 30000).
 * @returns {Promise<void>}
 */
export async function initWorkerPool(options = {}) {
    if (pool) return;

    const { default: Piscina } = await import("piscina");

    const minThreads = options.minThreads ||
        parseInt(process.env.CYBERCHEF_WORKER_MIN_THREADS, 10) ||
        1;
    const maxThreads = options.maxThreads ||
        parseInt(process.env.CYBERCHEF_WORKER_MAX_THREADS, 10) ||
        4;
    const idleTimeout = options.idleTimeout ||
        parseInt(process.env.CYBERCHEF_WORKER_IDLE_TIMEOUT, 10) ||
        30000;

    pool = new Piscina({
        filename: join(__dirname, "worker.mjs"),
        minThreads,
        maxThreads,
        idleTimeout
    });

    const logger = getLogger();
    logger.info({
        event: "worker_pool_initialized",
        minThreads,
        maxThreads,
        idleTimeout
    }, `Worker pool initialized: ${minThreads}-${maxThreads} threads`);
}

/**
 * Check whether an operation should use a worker thread.
 *
 * @param {string} operation - Operation name.
 * @param {number} inputSize - Input size in bytes.
 * @returns {boolean} True if the operation should use a worker.
 */
export function shouldUseWorker(operation, inputSize) {
    if (!pool) return false;
    if (inputSize < WORKER_MIN_INPUT_SIZE) return false;
    return CPU_INTENSIVE_OPERATIONS.has(operation);
}

/**
 * Execute an operation in a worker thread.
 *
 * @param {string} input - Input data.
 * @param {Array} recipe - Recipe array [{op, args}].
 * @param {number} timeout - Timeout in ms.
 * @returns {Promise<Object>} Result with value property.
 */
export async function executeInWorker(input, recipe, timeout) {
    if (!pool) {
        throw new Error("Worker pool not initialized. Call initWorkerPool() first.");
    }

    return pool.run({ input, recipe, timeout });
}

/**
 * Get pool statistics.
 *
 * @returns {Object} Pool stats or null if not initialized.
 */
export function getPoolStats() {
    if (!pool) return null;

    return {
        threads: pool.threads?.length ?? 0,
        completed: pool.completed,
        waiting: pool.queueSize,
        utilization: pool.utilization,
        duration: pool.duration,
        runTime: pool.runTime?.average ?? 0
    };
}

/**
 * Destroy the worker pool and clean up resources.
 *
 * @returns {Promise<void>}
 */
export async function destroyWorkerPool() {
    if (!pool) return;

    await pool.destroy();
    pool = null;

    const logger = getLogger();
    logger.info({ event: "worker_pool_destroyed" }, "Worker pool destroyed");
}
