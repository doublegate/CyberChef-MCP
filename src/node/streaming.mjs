/**
 * MCP Streaming Protocol Implementation for CyberChef.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { logStreaming } from "./logger.mjs";
import { ErrorCodes, CyberChefMCPError } from "./errors.mjs";
import { executeWithTimeoutAndRetry, RetryConfig } from "./retry.mjs";

/**
 * Configuration for streaming operations.
 */
export const StreamingConfig = {
    // Chunk size for processing (1MB)
    CHUNK_SIZE: parseInt(process.env.CYBERCHEF_STREAM_CHUNK_SIZE, 10) || 1024 * 1024,

    // Progress reporting interval (10MB)
    PROGRESS_INTERVAL: parseInt(process.env.CYBERCHEF_STREAM_PROGRESS_INTERVAL, 10) || 10 * 1024 * 1024,

    // Maximum chunks in memory (for backpressure)
    MAX_CHUNKS_IN_MEMORY: parseInt(process.env.CYBERCHEF_STREAM_MAX_CHUNKS, 10) || 10
};

/**
 * Operations that support true streaming (process chunks independently).
 */
export const STREAMABLE_OPERATIONS = new Set([
    "To Base64",
    "From Base64",
    "To Hex",
    "From Hex",
    "URL Encode",
    "URL Decode",
    "To Upper case",
    "To Lower case",
    "Reverse",
    "MD5",
    "SHA1",
    "SHA2",
    "SHA3",
    "BLAKE2b",
    "BLAKE2s"
]);

/**
 * Operations that need full input but can report progress.
 */
export const PROGRESS_OPERATIONS = new Set([
    "Gzip",
    "Gunzip",
    "Bzip2 Compress",
    "Bzip2 Decompress",
    "AES Encrypt",
    "AES Decrypt",
    "DES Encrypt",
    "DES Decrypt"
]);

/**
 * Check if an operation supports streaming.
 *
 * @param {string} operation - Operation name.
 * @returns {boolean} True if operation supports streaming.
 */
export function supportsStreaming(operation) {
    return STREAMABLE_OPERATIONS.has(operation);
}

/**
 * Check if an operation supports progress reporting.
 *
 * @param {string} operation - Operation name.
 * @returns {boolean} True if operation supports progress reporting.
 */
export function supportsProgress(operation) {
    return STREAMABLE_OPERATIONS.has(operation) || PROGRESS_OPERATIONS.has(operation);
}

/**
 * Split input into chunks for streaming.
 *
 * @param {string} input - Input data.
 * @param {number} chunkSize - Size of each chunk.
 * @returns {Array<string>} Array of input chunks.
 */
export function chunkInput(input, chunkSize = StreamingConfig.CHUNK_SIZE) {
    const chunks = [];
    for (let i = 0; i < input.length; i += chunkSize) {
        chunks.push(input.substring(i, i + chunkSize));
    }
    return chunks;
}

/**
 * Calculate progress percentage.
 *
 * @param {number} processed - Bytes processed.
 * @param {number} total - Total bytes.
 * @returns {number} Progress percentage (0-100).
 */
export function calculateProgress(processed, total) {
    if (total === 0) return 100;
    return Math.min(100, Math.round((processed / total) * 100));
}

/**
 * Stream operation execution with progress reporting.
 *
 * This function processes input in chunks and yields progress updates.
 *
 * @param {Function} bakeFunction - CyberChef bake function.
 * @param {string} operation - Operation name.
 * @param {string} input - Input data.
 * @param {Array} args - Operation arguments.
 * @param {Object} options - Streaming options.
 * @yields {Object} Progress updates and results.
 */
export async function* streamOperation(bakeFunction, operation, input, args, options = {}) {
    const inputSize = Buffer.byteLength(input, "utf8");
    const chunkSize = options.chunkSize || StreamingConfig.CHUNK_SIZE;
    const progressInterval = options.progressInterval || StreamingConfig.PROGRESS_INTERVAL;

    logStreaming(operation, { inputSize, chunkSize, progressInterval });

    try {
        // Yield initial status
        yield {
            content: [{
                type: "text",
                text: JSON.stringify({
                    status: "processing",
                    operation,
                    inputSize,
                    chunked: true
                })
            }],
            _meta: {
                progress: 0,
                total: inputSize,
                operation
            }
        };

        const chunks = chunkInput(input, chunkSize);
        const results = [];
        let processedBytes = 0;
        let lastProgressReport = 0;

        // Process each chunk
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkBytes = Buffer.byteLength(chunk, "utf8");

            // Execute operation on chunk
            const recipe = [{ op: operation, args }];
            const result = await bakeFunction(chunk, recipe);
            results.push(result.value);

            processedBytes += chunkBytes;

            // Report progress at intervals
            if (processedBytes - lastProgressReport >= progressInterval || i === chunks.length - 1) {
                const progress = calculateProgress(processedBytes, inputSize);

                yield {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "progress",
                            processed: processedBytes,
                            total: inputSize,
                            progress,
                            chunks: i + 1,
                            totalChunks: chunks.length
                        })
                    }],
                    _meta: {
                        progress,
                        processed: processedBytes,
                        total: inputSize,
                        operation
                    }
                };

                lastProgressReport = processedBytes;
            }
        }

        // Combine results
        const finalResult = results.join("");

        // Yield final result
        yield {
            content: [{
                type: "text",
                text: finalResult
            }],
            _meta: {
                complete: true,
                progress: 100,
                processed: processedBytes,
                total: inputSize,
                outputSize: Buffer.byteLength(finalResult, "utf8"),
                operation
            }
        };

    } catch (error) {
        throw new CyberChefMCPError(
            ErrorCodes.STREAMING_ERROR,
            `Streaming operation failed: ${error.message}`,
            {
                operation,
                inputSize,
                originalError: error.name
            }
        );
    }
}

/**
 * Stream operation with full input (for operations that need complete input).
 *
 * This function processes the full input but provides progress updates.
 *
 * @param {Function} bakeFunction - CyberChef bake function.
 * @param {string} operation - Operation name.
 * @param {string} input - Input data.
 * @param {Array} args - Operation arguments.
 * @param {Object} options - Streaming options.
 * @yields {Object} Progress updates and results.
 */
export async function* streamOperationWithProgress(bakeFunction, operation, input, args, options = {}) {
    const inputSize = Buffer.byteLength(input, "utf8");
    // const progressInterval = options.progressInterval || StreamingConfig.PROGRESS_INTERVAL;
    // Note: progressInterval is reserved for future use when CyberChef operations support progress callbacks

    logStreaming(operation, { inputSize, fullInput: true });

    try {
        // Yield initial status
        yield {
            content: [{
                type: "text",
                text: JSON.stringify({
                    status: "processing",
                    operation,
                    inputSize,
                    chunked: false
                })
            }],
            _meta: {
                progress: 0,
                total: inputSize,
                operation
            }
        };

        // Simulate progress updates while processing
        // Note: Actual CyberChef operations don't provide progress callbacks yet
        // This is a placeholder for future enhancement
        const progressPromise = new Promise((resolve) => {
            const interval = setInterval(() => {
                // This would be replaced with actual progress from CyberChef
            }, 1000);

            // Execute operation
            const recipe = [{ op: operation, args }];
            bakeFunction(input, recipe).then(result => {
                clearInterval(interval);
                resolve(result);
            }).catch(err => {
                clearInterval(interval);
                throw err;
            });
        });

        const result = await progressPromise;

        // Yield final result
        yield {
            content: [{
                type: "text",
                text: typeof result.value === "string" ? result.value : JSON.stringify(result.value)
            }],
            _meta: {
                complete: true,
                progress: 100,
                processed: inputSize,
                total: inputSize,
                outputSize: Buffer.byteLength(
                    typeof result.value === "string" ? result.value : JSON.stringify(result.value),
                    "utf8"
                ),
                operation
            }
        };

    } catch (error) {
        throw new CyberChefMCPError(
            ErrorCodes.STREAMING_ERROR,
            `Streaming operation failed: ${error.message}`,
            {
                operation,
                inputSize,
                originalError: error.name
            }
        );
    }
}

/**
 * Determine best streaming strategy for an operation.
 *
 * @param {string} operation - Operation name.
 * @param {number} inputSize - Input size in bytes.
 * @param {number} threshold - Streaming threshold.
 * @returns {Object} Streaming strategy.
 */
export function determineStreamingStrategy(operation, inputSize, threshold) {
    const shouldStream = inputSize > threshold;

    if (!shouldStream) {
        return {
            type: "none",
            reason: "Input below threshold"
        };
    }

    if (supportsStreaming(operation)) {
        return {
            type: "chunked",
            reason: "Operation supports chunked streaming"
        };
    }

    if (supportsProgress(operation)) {
        return {
            type: "progress",
            reason: "Operation supports progress reporting"
        };
    }

    return {
        type: "none",
        reason: "Operation does not support streaming"
    };
}

/**
 * Execute operation with appropriate streaming strategy.
 *
 * @param {Function} bakeFunction - CyberChef bake function.
 * @param {string} operation - Operation name.
 * @param {string} input - Input data.
 * @param {Array} args - Operation arguments.
 * @param {number} threshold - Streaming threshold.
 * @param {Object} options - Additional options.
 * @returns {AsyncGenerator|Object} Stream generator or direct result.
 */
export function executeWithStreamingStrategy(bakeFunction, operation, input, args, threshold, options = {}) {
    const inputSize = Buffer.byteLength(input, "utf8");
    const strategy = determineStreamingStrategy(operation, inputSize, threshold);

    if (strategy.type === "chunked") {
        return streamOperation(bakeFunction, operation, input, args, options);
    }

    if (strategy.type === "progress") {
        return streamOperationWithProgress(bakeFunction, operation, input, args, options);
    }

    // No streaming - return synchronous result wrapped in async generator format
    return (async function*() {
        const recipe = [{ op: operation, args }];
        const result = await bakeFunction(input, recipe);
        yield {
            content: [{
                type: "text",
                text: typeof result.value === "string" ? result.value : JSON.stringify(result.value)
            }],
            _meta: {
                complete: true,
                progress: 100,
                operation,
                streamed: false
            }
        };
    })();
}

/**
 * Execute an operation with MCP progress notifications.
 *
 * Consumes the existing async generators (streamOperation, streamOperationWithProgress)
 * and sends MCP notifications/progress via the server when a progress token is provided.
 * Falls back to direct execution when no progress token or streaming is disabled.
 *
 * @param {Object} options - Execution options.
 * @param {Function} options.bakeFunction - CyberChef bake function.
 * @param {string} options.operation - Operation name.
 * @param {string} options.input - Input data.
 * @param {Array} options.recipeArgs - Operation arguments.
 * @param {Array} options.recipe - Full recipe array [{op, args}].
 * @param {Object} options.server - MCP Server instance (for sending notifications).
 * @param {string|number|undefined} options.progressToken - MCP progress token from request.
 * @param {boolean} options.streamingEnabled - Whether streaming is enabled globally.
 * @param {number} options.streamingThreshold - Size threshold for streaming.
 * @param {number} options.timeout - Operation timeout in ms.
 * @param {string} options.requestId - Request ID for logging.
 * @returns {Promise<Object>} The operation result {value: string}.
 */
export async function executeWithStreamingProgress({
    bakeFunction,
    operation,
    input,
    recipeArgs,
    recipe,
    server,
    progressToken,
    streamingEnabled,
    streamingThreshold,
    timeout,
    requestId
}) {
    const inputSize = Buffer.byteLength(input, "utf8");
    const strategy = streamingEnabled
        ? determineStreamingStrategy(operation, inputSize, streamingThreshold)
        : { type: "none", reason: "Streaming disabled" };

    // If no progress token or no streaming strategy, fall back to direct execution
    if (!progressToken || strategy.type === "none") {
        const timeoutMs = strategy.type !== "none" ? timeout * 2 : timeout;
        return executeWithTimeoutAndRetry(
            () => bakeFunction(input, recipe),
            timeoutMs,
            {
                requestId,
                maxRetries: RetryConfig.MAX_RETRIES,
                context: { operation, inputSize }
            }
        );
    }

    logStreaming(operation, { inputSize, strategy: strategy.type, progressToken });

    // Send initial progress notification
    const sendProgress = async (progress, total, message) => {
        try {
            await server.notification({
                method: "notifications/progress",
                params: {
                    progressToken,
                    progress,
                    total: total || inputSize,
                    message
                }
            });
        } catch {
            // Progress notifications are best-effort
        }
    };

    await sendProgress(0, inputSize, `Starting ${operation}`);

    // Choose the appropriate generator
    const generator = strategy.type === "chunked"
        ? streamOperation(bakeFunction, operation, input, recipeArgs)
        : streamOperationWithProgress(bakeFunction, operation, input, recipeArgs);

    let finalResult = null;

    for await (const update of generator) {
        const meta = update._meta || {};

        if (meta.complete) {
            finalResult = update.content[0].text;
            await sendProgress(inputSize, inputSize, `Completed ${operation}`);
        } else if (meta.progress !== undefined) {
            const processed = meta.processed || 0;
            await sendProgress(processed, inputSize, `Processing ${operation}: ${meta.progress}%`);
        }
    }

    if (finalResult === null) {
        throw new CyberChefMCPError(
            ErrorCodes.STREAMING_ERROR,
            "Streaming completed without producing a result",
            { operation, inputSize }
        );
    }

    return { value: finalResult };
}
