/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * CyberChef MCP Error Handling
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

/**
 * Error codes for CyberChef MCP operations.
 */
export const ErrorCodes = {
    INVALID_INPUT: "INVALID_INPUT",
    MISSING_ARGUMENT: "MISSING_ARGUMENT",
    OPERATION_FAILED: "OPERATION_FAILED",
    TIMEOUT: "TIMEOUT",
    OUT_OF_MEMORY: "OUT_OF_MEMORY",
    UNSUPPORTED_OPERATION: "UNSUPPORTED_OPERATION",
    CACHE_ERROR: "CACHE_ERROR",
    STREAMING_ERROR: "STREAMING_ERROR"
};

/**
 * How much of a context value to show, by key.
 *
 * A flat 100-character cap truncated the one field that carries the fix. An unknown-argument error
 * put the valid argument list in `hint`, and the render cut it mid-word:
 *
 *     hint: "Valid arguments: key, iv, mode, input_arg, output, additional_..._in_outp..."
 *
 * "Truncate with guidance" is the principle, and a guidance field is exactly the wrong thing to
 * truncate. Keys that exist to tell the caller what to do next are given room; everything else
 * keeps the cap, because a context field echoing a megabyte of input helps nobody.
 *
 * @param {string} key - Context key.
 * @param {*} value - Context value.
 * @returns {*} The value, truncated if it is long and not guidance.
 */
function truncateContext(key, value) {
    const GUIDANCE = new Set(["hint", "expected", "accepted", "supported", "available"]);
    if (typeof value !== "string") return value;
    const limit = GUIDANCE.has(key) ? 600 : 100;
    if (value.length <= limit) return value;
    return `${value.substring(0, limit)}... (truncated; ${value.length} characters)`;
}

/**
 * Default recovery suggestions for common error scenarios.
 */
export const ErrorSuggestions = {
    [ErrorCodes.INVALID_INPUT]: [
        "Verify input data format and encoding",
        "Check for special characters or invalid byte sequences",
        "Ensure input matches the operation's expected format"
    ],
    [ErrorCodes.MISSING_ARGUMENT]: [
        "Review operation documentation for required arguments",
        "Check argument names match the schema (use snake_case)",
        "Verify all required parameters are provided"
    ],
    [ErrorCodes.OPERATION_FAILED]: [
        "Check operation logs for detailed error messages",
        "Verify input data is compatible with the operation",
        "Try with a smaller sample input to isolate the issue"
    ],
    [ErrorCodes.TIMEOUT]: [
        "Reduce input size and retry",
        "Increase CYBERCHEF_OPERATION_TIMEOUT environment variable",
        "Consider using streaming for large inputs"
    ],
    [ErrorCodes.OUT_OF_MEMORY]: [
        "Reduce input size",
        "Increase Node.js heap size (NODE_OPTIONS=--max-old-space-size)",
        "Use streaming operations for large files"
    ],
    [ErrorCodes.UNSUPPORTED_OPERATION]: [
        "Use cyberchef_search to find available operations",
        "Check operation name spelling and case",
        "Verify CyberChef version supports this operation"
    ],
    [ErrorCodes.CACHE_ERROR]: [
        "Clear cache and retry",
        "Reduce cache size settings",
        "Disable caching temporarily"
    ],
    [ErrorCodes.STREAMING_ERROR]: [
        "Disable streaming with CYBERCHEF_ENABLE_STREAMING=false",
        "Reduce streaming threshold",
        "Check MCP client supports streaming protocol"
    ]
};

/**
 * Enhanced error class for CyberChef MCP operations.
 */
export class CyberChefMCPError extends Error {
    /**
     * Create a new CyberChef MCP error.
     *
     * @param {string} code - Error code from ErrorCodes.
     * @param {string} message - Human-readable error message.
     * @param {Object} context - Additional context about the error.
     * @param {Array<string>} suggestions - Recovery suggestions.
     */
    constructor(code, message, context = {}, suggestions = null) {
        super(message);
        this.name = "CyberChefMCPError";
        this.code = code;
        this.context = context;
        this.suggestions = suggestions || ErrorSuggestions[code] || [];
        this.timestamp = new Date().toISOString();
        this.isRetryable = this.determineRetryable(code);

        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, CyberChefMCPError);
        }
    }

    /**
     * Determine if an error is retryable based on its code.
     *
     * @param {string} code - Error code.
     * @returns {boolean} True if error is retryable.
     */
    determineRetryable(code) {
        const retryableCodes = [
            ErrorCodes.TIMEOUT,
            ErrorCodes.OUT_OF_MEMORY,
            ErrorCodes.CACHE_ERROR
        ];
        return retryableCodes.includes(code);
    }

    /**
     * Convert error to MCP error response format.
     *
     * @returns {Object} MCP error response object.
     */
    toMCPError() {
        return {
            isError: true,
            content: [{
                type: "text",
                text: this.formatErrorMessage()
            }]
        };
    }

    /**
     * Format error message with context and suggestions.
     *
     * @returns {string} Formatted error message.
     */
    formatErrorMessage() {
        let message = `Error [${this.code}]: ${this.message}`;

        if (Object.keys(this.context).length > 0) {
            message += "\n\nContext:";
            for (const [key, value] of Object.entries(this.context)) {
                message += `\n  - ${key}: ${JSON.stringify(truncateContext(key, value))}`;
            }
        }

        // Generic suggestions are appended ONLY when the error carries no specific guidance.
        //
        // Measured before changing it: an unknown-argument error -- whose context already names
        // every valid argument -- was followed by
        //
        //     1. Verify input data format and encoding
        //     2. Check for special characters or invalid byte sequences
        //     3. Ensure input matches the operation's expected format
        //
        // None of which is the fix, and all of which point away from it. The three lines are keyed
        // by error CODE, so every INVALID_INPUT gets them regardless of which of 504 operations
        // failed or why. Advice that contradicts the error above it is worse than no advice: it is
        // the model's next action, and here it sends it to inspect its input when the input was
        // fine and the argument name was wrong.
        //
        // A `hint` in the context IS the specific suggestion, so the generic list is suppressed
        // when one is present rather than deleted outright -- an error with nothing better to say
        // still says something.
        const specific = typeof this.context.hint === "string" && this.context.hint.length > 0;
        if (this.suggestions.length > 0 && !specific) {
            message += "\n\nSuggestions:";
            this.suggestions.forEach((suggestion, index) => {
                message += `\n  ${index + 1}. ${suggestion}`;
            });
        }

        message += `\n\nTimestamp: ${this.timestamp}`;

        return message;
    }

    /**
     * Convert error to structured log object.
     *
     * @returns {Object} Structured log object.
     */
    toLogObject() {
        return {
            error: {
                name: this.name,
                code: this.code,
                message: this.message,
                context: this.context,
                suggestions: this.suggestions,
                timestamp: this.timestamp,
                isRetryable: this.isRetryable,
                stack: this.stack
            }
        };
    }

    /**
     * Create error from generic Error object.
     *
     * @param {Error} error - Generic error object.
     * @param {Object} context - Additional context.
     * @returns {CyberChefMCPError} CyberChef MCP error.
     */
    static fromError(error, context = {}) {
        // Try to determine error code from error message
        let code = ErrorCodes.OPERATION_FAILED;

        if (error.message.includes("timeout") || error.message.includes("timed out")) {
            code = ErrorCodes.TIMEOUT;
        } else if (error.message.includes("memory") || error.message.includes("heap")) {
            code = ErrorCodes.OUT_OF_MEMORY;
        } else if (error.message.includes("invalid") || error.message.includes("malformed")) {
            code = ErrorCodes.INVALID_INPUT;
        } else if (error.message.includes("missing") || error.message.includes("required")) {
            code = ErrorCodes.MISSING_ARGUMENT;
        }

        const mcpError = new CyberChefMCPError(
            code,
            error.message,
            {
                ...context,
                originalError: error.name
            }
        );

        // Preserve original stack trace
        if (error.stack) {
            mcpError.stack = error.stack;
        }

        return mcpError;
    }
}

/**
 * Helper function to create input validation error.
 *
 * @param {string} message - Error message.
 * @param {Object} context - Error context.
 * @returns {CyberChefMCPError} Validation error.
 */
export function createInputError(message, context = {}) {
    return new CyberChefMCPError(
        ErrorCodes.INVALID_INPUT,
        message,
        context
    );
}

/**
 * Helper function to create timeout error.
 *
 * @param {number} timeout - Timeout value in milliseconds.
 * @param {Object} context - Error context.
 * @returns {CyberChefMCPError} Timeout error.
 */
export function createTimeoutError(timeout, context = {}) {
    return new CyberChefMCPError(
        ErrorCodes.TIMEOUT,
        `Operation timed out after ${timeout}ms`,
        { timeout, ...context }
    );
}

/**
 * Helper function to create memory error.
 *
 * @param {Object} context - Error context.
 * @returns {CyberChefMCPError} Memory error.
 */
export function createMemoryError(context = {}) {
    return new CyberChefMCPError(
        ErrorCodes.OUT_OF_MEMORY,
        "Operation exceeded memory limits",
        context
    );
}

/**
 * Helper function to create operation not found error.
 *
 * @param {string} operation - Operation name.
 * @param {Object} context - Error context.
 * @returns {CyberChefMCPError} Operation not found error.
 */
export function createOperationNotFoundError(operation, context = {}) {
    return new CyberChefMCPError(
        ErrorCodes.UNSUPPORTED_OPERATION,
        `Operation '${operation}' not found`,
        { operation, ...context }
    );
}
