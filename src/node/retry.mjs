/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Error recovery and retry logic for CyberChef MCP Server.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { logRetry } from "./logger.mjs";
import { CyberChefMCPError, ErrorCodes } from "./errors.mjs";

/**
 * Retry configuration.
 */
export const RetryConfig = {
    // Maximum number of retry attempts
    MAX_RETRIES: parseInt(process.env.CYBERCHEF_MAX_RETRIES, 10) || 3,

    // Initial backoff delay in milliseconds
    INITIAL_BACKOFF: parseInt(process.env.CYBERCHEF_INITIAL_BACKOFF, 10) || 1000,

    // Maximum backoff delay in milliseconds
    MAX_BACKOFF: parseInt(process.env.CYBERCHEF_MAX_BACKOFF, 10) || 10000,

    // Backoff multiplier
    BACKOFF_MULTIPLIER: parseFloat(process.env.CYBERCHEF_BACKOFF_MULTIPLIER) || 2
};

/**
 * Classify error as retryable or non-retryable.
 *
 * @param {Error} error - Error object.
 * @returns {boolean} True if error is retryable.
 */
export function isRetryableError(error) {
    // CyberChefMCPError has explicit isRetryable flag
    if (error instanceof CyberChefMCPError) {
        return error.isRetryable;
    }

    // Check error message for retryable patterns
    const message = error.message.toLowerCase();

    const retryablePatterns = [
        "timeout",
        "timed out",
        "econnreset",
        "econnrefused",
        "etimedout",
        "network",
        "temporary",
        "transient",
        "memory",
        "heap",
        "cache"
    ];

    return retryablePatterns.some(pattern => message.includes(pattern));
}

/**
 * Calculate exponential backoff delay.
 *
 * @param {number} attempt - Current attempt number (0-indexed).
 * @param {Object} config - Retry configuration.
 * @returns {number} Delay in milliseconds.
 */
export function calculateBackoff(attempt, config = RetryConfig) {
    const exponentialDelay = config.INITIAL_BACKOFF * Math.pow(config.BACKOFF_MULTIPLIER, attempt);
    const cappedDelay = Math.min(exponentialDelay, config.MAX_BACKOFF);

    // Add jitter to prevent thundering herd (±25%)
    const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

    return Math.round(cappedDelay + jitter);
}

/**
 * Sleep for specified duration.
 *
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise} Promise that resolves after delay.
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute function with retry logic.
 *
 * @param {Function} fn - Async function to execute.
 * @param {Object} options - Retry options.
 * @param {string} options.requestId - Request ID for logging.
 * @param {number} options.maxRetries - Maximum retry attempts.
 * @param {Object} options.context - Additional context for error handling.
 * @returns {Promise} Promise that resolves with function result.
 */
export async function executeWithRetry(fn, options = {}) {
    const {
        requestId = "unknown",
        maxRetries = RetryConfig.MAX_RETRIES,
        context = {}
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Execute function
            const result = await fn();
            return result;

        } catch (error) {
            lastError = error;

            // Check if error is retryable
            if (!isRetryableError(error)) {
                // Non-retryable error - throw immediately
                throw error;
            }

            // Check if we have retries remaining
            if (attempt >= maxRetries) {
                // Out of retries - throw with retry context
                if (error instanceof CyberChefMCPError) {
                    error.context = {
                        ...error.context,
                        ...context,
                        retries: attempt,
                        maxRetries
                    };
                    throw error;
                } else {
                    throw CyberChefMCPError.fromError(error, {
                        ...context,
                        retries: attempt,
                        maxRetries
                    });
                }
            }

            // Calculate backoff delay
            const delay = calculateBackoff(attempt);

            // Log retry attempt
            logRetry(requestId, attempt + 1, maxRetries, delay);

            // Wait before retry
            await sleep(delay);
        }
    }

    // This should never be reached, but TypeScript/ESLint wants it
    throw lastError;
}

/**
 * Execute function with timeout and retry.
 *
 * @param {Function} fn - Async function to execute.
 * @param {number} timeout - Timeout in milliseconds.
 * @param {Object} retryOptions - Retry options.
 * @returns {Promise} Promise that resolves with function result.
 */
export async function executeWithTimeoutAndRetry(fn, timeout, retryOptions = {}) {
    return executeWithRetry(
        async () => {
            // The timer is captured and CLEARED in `finally`. Losing the reference -- which is what
            // the inline `new Promise((_, reject) => setTimeout(...))` form does -- leaves a live
            // timer armed for the full timeout after the operation has already answered.
            //
            // Measured before the fix: a single `cyberchef_to_base64` call answered in 1,259 ms and
            // then held the process open until 61,318 ms. For a stdio client that is a server which
            // will not exit for a minute after its work is done, and under load it is one pending
            // timer per call, all of them holding their captured error object.
            //
            // `Promise.race` does not cancel the loser; nothing does, unless it is done here.
            let timer;
            try {
                return await Promise.race([
                    fn(),
                    new Promise((_, reject) => {
                        timer = setTimeout(
                            () => reject(new CyberChefMCPError(
                                ErrorCodes.TIMEOUT,
                                `Operation timed out after ${timeout}ms`,
                                { timeout }
                            )),
                            timeout
                        );
                    })
                ]);
            } finally {
                clearTimeout(timer);
            }
        },
        retryOptions
    );
}

/**
 * Create a circuit breaker for operations.
 *
 * Circuit breaker prevents repeated attempts when a service is known to be failing.
 */
export class CircuitBreaker {
    /**
     * Create a circuit breaker.
     *
     * @param {Object} options - Circuit breaker options.
     * @param {number} options.failureThreshold - Number of failures before opening circuit.
     * @param {number} options.resetTimeout - Time in ms before trying again.
     */
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000;
        this.failures = 0;
        this.lastFailureTime = null;
        this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
        // Whether a HALF_OPEN trial call is currently running. See `isOpen()`.
        this.probeInFlight = false;
    }

    /**
     * Check if circuit is open.
     *
     * @returns {boolean} True if circuit is open.
     */
    isOpen() {
        if (this.state === "OPEN") {
            // Check if we should try again
            if (Date.now() - this.lastFailureTime > this.resetTimeout) {
                this.state = "HALF_OPEN";
                this.probeInFlight = true;
                return false;
            }
            return true;
        }
        // HALF_OPEN admits exactly ONE trial call, and this is the line that makes that true.
        //
        // Without it, HALF_OPEN simply returned false, so every CONCURRENT caller passed -- and a
        // recovery burst is precisely when callers are concurrent. Measured against a down issuer
        // with 50 clients retrying at once after the reset window:
        //
        //     probes during recovery: 100     (should be 1)
        //
        // A breaker that bounds the outage and then stampedes the service at the moment it comes
        // back has moved the outage rather than contained it.
        if (this.state === "HALF_OPEN" && this.probeInFlight) return true;
        return false;
    }

    /**
     * Record a successful execution.
     */
    recordSuccess() {
        this.failures = 0;
        this.state = "CLOSED";
        this.probeInFlight = false;
    }

    /**
     * Record a failed execution.
     */
    recordFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        // Whatever the outcome, the trial is over. A failed probe reopens the circuit below and
        // the next one waits out another full reset window.
        this.probeInFlight = false;

        if (this.failures >= this.failureThreshold) {
            this.state = "OPEN";
        }
    }

    /**
     * Execute function with circuit breaker.
     *
     * @param {Function} fn - Function to execute.
     * @returns {Promise} Promise that resolves with function result.
     */
    async execute(fn) {
        if (this.isOpen()) {
            throw new CyberChefMCPError(
                ErrorCodes.OPERATION_FAILED,
                "Circuit breaker is OPEN - operation temporarily unavailable",
                {
                    state: this.state,
                    failures: this.failures,
                    lastFailureTime: this.lastFailureTime
                },
                [
                    `Wait ${Math.round(this.resetTimeout / 1000)}s before retrying`,
                    "Check server logs for underlying issues",
                    "Reduce operation load or input size"
                ]
            );
        }

        try {
            const result = await fn();
            this.recordSuccess();
            return result;
        } catch (error) {
            this.recordFailure();
            throw error;
        }
    }

    /**
     * Reset circuit breaker.
     */
    reset() {
        this.failures = 0;
        this.probeInFlight = false;
        this.lastFailureTime = null;
        this.state = "CLOSED";
    }

    /**
     * Get circuit breaker status.
     *
     * @returns {Object} Circuit breaker status.
     */
    getStatus() {
        return {
            state: this.state,
            failures: this.failures,
            lastFailureTime: this.lastFailureTime,
            threshold: this.failureThreshold,
            resetTimeout: this.resetTimeout
        };
    }
}
