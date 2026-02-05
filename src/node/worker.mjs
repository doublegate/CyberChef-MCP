/**
 * Worker thread script for CyberChef operations.
 *
 * Executed within Piscina worker threads to offload CPU-intensive
 * operations from the main event loop.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { bake } from "./index.mjs";

/**
 * Execute a CyberChef operation in a worker thread.
 *
 * @param {Object} task - The task to execute.
 * @param {string} task.input - Input data to process.
 * @param {Array} task.recipe - Recipe array [{op, args}].
 * @param {number} task.timeout - Timeout in milliseconds.
 * @returns {Promise<Object>} Result with value property.
 */
export default async function({ input, recipe, timeout }) {
    const timeoutMs = timeout || 30000;

    const result = await Promise.race([
        bake(input, recipe),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Worker timeout after ${timeoutMs}ms`)), timeoutMs)
        )
    ]);

    return {
        value: typeof result.value === "string" ? result.value : JSON.stringify(result.value)
    };
}
