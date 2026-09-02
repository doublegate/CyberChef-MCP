/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Batch operation execution, parallel or sequential.
 *
 * Extracted verbatim from mcp-server.mjs during the v2.0.0 decomposition. Behaviour is
 * unchanged; the only edits are the import and export lines needed to stand alone.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

// Lazy: importing the Node API eagerly costs ~1150 ms of startup for a function this module
// uses on one branch of one batch operation. See lib/node-api.mjs.
import { loadNodeApi } from "./node-api.mjs";
import OperationConfig from "../../core/config/OperationConfig.json" with {type: "json"};
import { BATCH_ENABLED, BATCH_MAX_SIZE, OPERATION_TIMEOUT } from "./config.mjs";
import { executeWithTimeoutAndRetry, RetryConfig } from "../retry.mjs";
import { createInputError } from "../errors.mjs";
import { dishToText } from "./dish-output.mjs";
import { bakeOnCore } from "./core-recipe.mjs";
import { sanitizeToolName, resolveArgValue, validateInputSize, toolArgName } from "./tool-schema.mjs";

/**
 * Batch processor for executing multiple operations (v1.7.0).
 */
class BatchProcessor {
    /**
     * Execute a batch of operations.
     *
     * @param {Array} operations - Array of operation objects.
     * @param {string} mode - Execution mode: "parallel" or "sequential".
     * @param {Object} context - Execution context.
     * @returns {Promise<Object>} Batch results.
     */
    async executeBatch(operations, mode = "parallel", context = {}) {
        // Shape check FIRST. The disabled-batch guard below reports `operations.length` in its
        // context, so running it first meant a disabled-batch call with a missing or non-array
        // `operations` threw a bare TypeError instead of the structured INVALID_INPUT the caller
        // is promised -- the feature flag turning a validation error into a crash.
        if (!Array.isArray(operations) || operations.length === 0) {
            throw createInputError("Operations must be a non-empty array", { received: typeof operations });
        }

        if (!BATCH_ENABLED) {
            throw createInputError("Batch processing is disabled", { batchSize: operations.length });
        }

        if (operations.length > BATCH_MAX_SIZE) {
            throw createInputError(
                `Batch size (${operations.length}) exceeds maximum allowed size (${BATCH_MAX_SIZE})`,
                { batchSize: operations.length, maxBatchSize: BATCH_MAX_SIZE }
            );
        }

        const results = [];
        const errors = [];
        let successCount = 0;

        if (mode === "parallel") {
            // Execute all operations in parallel
            const promises = operations.map(async (op, index) => {
                try {
                    const result = await this.executeOperation(op, { ...context, index });
                    return { index, success: true, result };
                } catch (error) {
                    return { index, success: false, error: error.message || String(error) };
                }
            });

            const outcomes = await Promise.all(promises);

            outcomes.forEach(outcome => {
                if (outcome.success) {
                    results.push({ index: outcome.index, result: outcome.result });
                    successCount++;
                } else {
                    errors.push({ index: outcome.index, error: outcome.error });
                }
            });

        } else if (mode === "sequential") {
            // Execute operations one by one
            for (let i = 0; i < operations.length; i++) {
                try {
                    const result = await this.executeOperation(operations[i], { ...context, index: i });
                    results.push({ index: i, result });
                    successCount++;
                } catch (error) {
                    errors.push({ index: i, error: error.message || String(error) });
                    // Continue with next operation (partial success)
                }
            }
        } else {
            throw createInputError(`Invalid mode: ${mode}. Must be "parallel" or "sequential"`, { mode });
        }

        return {
            total: operations.length,
            successful: successCount,
            failed: errors.length,
            results,
            errors,
            mode
        };
    }

    /**
     * Execute a single operation from batch.
     *
     * @param {Object} op - Operation object.
     * @param {Object} context - Execution context.
     * @returns {Promise<any>} Operation result.
     */
    async executeOperation(op, context) {
        if (!op.tool || !op.tool.startsWith("cyberchef_")) {
            throw createInputError(`Invalid tool name: ${op.tool}`, { tool: op.tool });
        }

        if (!op.arguments || typeof op.arguments !== "object") {
            throw createInputError("Operation arguments must be an object", {
                tool: op.tool,
                received: typeof op.arguments
            });
        }

        // Validate input if present
        if (op.arguments.input) {
            validateInputSize(op.arguments.input);
        }

        // Extract operation name
        const toolName = op.tool;

        // Handle bake operation
        if (toolName === "cyberchef_bake") {
            const result = await executeWithTimeoutAndRetry(
                () => bakeOnCore(op.arguments.input, op.arguments.recipe),
                OPERATION_TIMEOUT,
                { ...context, maxRetries: RetryConfig.MAX_RETRIES }
            );
            return dishToText(result);
        }

        // Handle search operation
        if (toolName === "cyberchef_search") {
            const { help } = await loadNodeApi();
            const results = help(op.arguments.query);
            return JSON.stringify(results, null, 2);
        }

        // Handle standard operations
        const opName = Object.keys(OperationConfig).find(k => sanitizeToolName(k) === toolName);
        if (!opName) {
            throw createInputError(`Operation not found: ${toolName}`, { tool: toolName });
        }

        const opConfig = OperationConfig[opName];
        const recipeArgs = [];

        if (opConfig.args) {
            opConfig.args.forEach(argDef => {
                // `toolArgName`, not a fourth private copy of the sanitisation. This WAS a
                // fourth copy, and it had already drifted: it produced `input` where the schema
                // and the direct-call path produce `input_arg`, so a batched AES call failed
                // while the identical direct call succeeded.
                const argName = toolArgName(argDef.name);
                const userVal = op.arguments[argName];
                recipeArgs.push(resolveArgValue(argDef, userVal));
            });
        }

        const recipe = [{ op: opName, args: recipeArgs }];
        const result = await executeWithTimeoutAndRetry(
            () => bakeOnCore(op.arguments.input, recipe),
            OPERATION_TIMEOUT,
            { ...context, maxRetries: RetryConfig.MAX_RETRIES }
        );

        return dishToText(result);
    }
}

export { BatchProcessor };
