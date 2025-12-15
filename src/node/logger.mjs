/**
 * Structured logging for CyberChef MCP Server.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import pino from "pino";
import { randomUUID } from "crypto";

/**
 * Create a Pino logger instance configured for MCP server.
 *
 * @param {Object} options - Logger configuration options.
 * @returns {Object} Configured Pino logger.
 */
function createLogger(options = {}) {
    const logLevel = process.env.LOG_LEVEL || "info";

    return pino({
        level: logLevel,
        formatters: {
            level: (label) => ({ level: label }),
            bindings: (bindings) => ({
                pid: bindings.pid,
                hostname: bindings.hostname
            })
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        base: {
            service: "cyberchef-mcp",
            version: options.version || "unknown"
        },
        // Write to stderr to avoid interfering with MCP protocol on stdout
        ...options
    });
}

/**
 * Request context manager for correlation IDs.
 */
class RequestContext {
    /**
     * Create a new request context manager.
     */
    constructor() {
        this.contexts = new Map();
    }

    /**
     * Generate a new request ID.
     *
     * @returns {string} UUID request ID.
     */
    generateRequestId() {
        return randomUUID();
    }

    /**
     * Create a new request context.
     *
     * @param {string} toolName - Name of the tool being called.
     * @param {Object} args - Tool arguments.
     * @returns {Object} Request context.
     */
    createContext(toolName, args = {}) {
        const requestId = this.generateRequestId();
        const context = {
            requestId,
            toolName,
            startTime: Date.now(),
            inputSize: args.input ? Buffer.byteLength(args.input, "utf8") : 0
        };

        this.contexts.set(requestId, context);
        return context;
    }

    /**
     * Get a request context by ID.
     *
     * @param {string} requestId - Request ID.
     * @returns {Object|null} Request context or null if not found.
     */
    getContext(requestId) {
        return this.contexts.get(requestId) || null;
    }

    /**
     * Complete a request and calculate duration.
     *
     * @param {string} requestId - Request ID.
     * @param {Object} metadata - Additional metadata.
     * @returns {Object|null} Completed context with duration.
     */
    completeContext(requestId, metadata = {}) {
        const context = this.contexts.get(requestId);
        if (!context) return null;

        const duration = Date.now() - context.startTime;
        const completedContext = {
            ...context,
            duration,
            endTime: Date.now(),
            ...metadata
        };

        // Clean up old contexts (keep for 1 minute for debugging)
        setTimeout(() => {
            this.contexts.delete(requestId);
        }, 60000);

        return completedContext;
    }

    /**
     * Clear all contexts.
     */
    clear() {
        this.contexts.clear();
    }
}

// Global logger instance
let globalLogger = null;
let requestContext = null;

/**
 * Initialize the global logger.
 *
 * @param {Object} options - Logger options.
 */
export function initLogger(options = {}) {
    globalLogger = createLogger(options);
    requestContext = new RequestContext();
}

/**
 * Get the global logger instance.
 *
 * @returns {Object} Pino logger instance.
 */
export function getLogger() {
    if (!globalLogger) {
        initLogger();
    }
    return globalLogger;
}

/**
 * Get the request context manager.
 *
 * @returns {RequestContext} Request context manager.
 */
export function getRequestContext() {
    if (!requestContext) {
        initLogger();
    }
    return requestContext;
}

/**
 * Log a tool request start.
 *
 * @param {string} toolName - Name of the tool.
 * @param {Object} args - Tool arguments.
 * @returns {string} Request ID.
 */
export function logRequestStart(toolName, args = {}) {
    const logger = getLogger();
    const ctx = getRequestContext();
    const context = ctx.createContext(toolName, args);

    logger.info({
        requestId: context.requestId,
        tool: toolName,
        inputSize: context.inputSize,
        event: "request_start"
    }, `Tool request started: ${toolName}`);

    return context.requestId;
}

/**
 * Log a tool request completion.
 *
 * @param {string} requestId - Request ID.
 * @param {Object} metadata - Additional metadata.
 */
export function logRequestComplete(requestId, metadata = {}) {
    const logger = getLogger();
    const ctx = getRequestContext();
    const context = ctx.completeContext(requestId, metadata);

    if (!context) {
        logger.warn({ requestId }, "Request context not found for completion");
        return;
    }

    logger.info({
        requestId: context.requestId,
        tool: context.toolName,
        inputSize: context.inputSize,
        outputSize: metadata.outputSize || 0,
        duration: context.duration,
        cached: metadata.cached || false,
        streamed: metadata.streamed || false,
        event: "request_complete"
    }, `Tool request completed: ${context.toolName} (${context.duration}ms)`);
}

/**
 * Log a tool request error.
 *
 * @param {string} requestId - Request ID.
 * @param {Error} error - Error object.
 * @param {Object} metadata - Additional metadata.
 */
export function logRequestError(requestId, error, metadata = {}) {
    const logger = getLogger();
    const ctx = getRequestContext();
    const context = ctx.completeContext(requestId, metadata);

    const logData = {
        requestId,
        error: {
            name: error.name,
            message: error.message,
            code: error.code,
            isRetryable: error.isRetryable,
            stack: error.stack
        },
        event: "request_error"
    };

    if (context) {
        logData.tool = context.toolName;
        logData.inputSize = context.inputSize;
        logData.duration = context.duration;
    }

    logger.error(logData, `Tool request failed: ${error.message}`);
}

/**
 * Log cache operation.
 *
 * @param {string} operation - Cache operation (hit, miss, set, evict).
 * @param {Object} metadata - Cache metadata.
 */
export function logCache(operation, metadata = {}) {
    const logger = getLogger();

    logger.debug({
        cache: {
            operation,
            ...metadata
        },
        event: "cache_operation"
    }, `Cache ${operation}`);
}

/**
 * Log memory usage.
 *
 * @param {Object} usage - Memory usage object from process.memoryUsage().
 */
export function logMemory(usage) {
    const logger = getLogger();

    logger.debug({
        memory: {
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
            rss: Math.round(usage.rss / 1024 / 1024),
            external: Math.round(usage.external / 1024 / 1024)
        },
        event: "memory_check"
    }, `Memory: ${Math.round(usage.heapUsed / 1024 / 1024)}MB / ${Math.round(usage.heapTotal / 1024 / 1024)}MB heap, ${Math.round(usage.rss / 1024 / 1024)}MB RSS`);
}

/**
 * Log streaming operation.
 *
 * @param {string} operation - Operation name.
 * @param {Object} metadata - Streaming metadata.
 */
export function logStreaming(operation, metadata = {}) {
    const logger = getLogger();

    logger.info({
        streaming: {
            operation,
            ...metadata
        },
        event: "streaming_operation"
    }, `Streaming ${operation}: ${metadata.inputSize ? Math.round(metadata.inputSize / 1024 / 1024) + "MB" : "unknown size"}`);
}

/**
 * Log retry attempt.
 *
 * @param {string} requestId - Request ID.
 * @param {number} attempt - Retry attempt number.
 * @param {number} maxRetries - Maximum retry attempts.
 * @param {number} delay - Delay before retry in milliseconds.
 */
export function logRetry(requestId, attempt, maxRetries, delay) {
    const logger = getLogger();

    logger.warn({
        requestId,
        retry: {
            attempt,
            maxRetries,
            delay
        },
        event: "retry_attempt"
    }, `Retry attempt ${attempt}/${maxRetries} after ${delay}ms`);
}

/**
 * Log server startup.
 *
 * @param {Object} config - Server configuration.
 */
export function logServerStart(config) {
    const logger = getLogger();

    logger.info({
        config,
        event: "server_start"
    }, `CyberChef MCP Server v${config.version} started`);
}

/**
 * Log server shutdown.
 */
export function logServerShutdown() {
    const logger = getLogger();

    logger.info({
        event: "server_shutdown"
    }, "CyberChef MCP Server shutting down");
}
