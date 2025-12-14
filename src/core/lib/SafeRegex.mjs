/**
 * @author DoubleGate
 * @copyright Crown Copyright 2024
 * @license Apache-2.0
 */

/**
 * Safe Regular Expression utilities to prevent ReDoS attacks.
 * This module provides validation and safe construction of regular expressions
 * from user input to mitigate Regular Expression Denial of Service vulnerabilities.
 */

/**
 * Maximum allowed length for user-provided regex patterns.
 * Patterns exceeding this length are rejected as they may cause performance issues.
 */
const MAX_REGEX_LENGTH = 10000;

/**
 * Maximum time in milliseconds allowed for regex validation.
 * Used to detect potentially catastrophic backtracking patterns.
 */
const VALIDATION_TIMEOUT = 100;

/**
 * Patterns known to cause catastrophic backtracking (ReDoS).
 * These are common anti-patterns that should be avoided.
 */
const REDOS_PATTERNS = [
    // Nested quantifiers (e.g., (a+)+, (a*)*, (a+)*)
    /(\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*[+*]\)[+*{])/,
    // Overlapping alternations with quantifiers
    /(\([^|)]*\|[^)]*\)[+*{])/,
];

/**
 * Validates a regular expression pattern for potential ReDoS vulnerabilities.
 *
 * @param {string} pattern - The regex pattern to validate
 * @param {string} [flags=""] - Optional regex flags
 * @returns {{valid: boolean, error: string|null}} Validation result
 */
export function validateRegexPattern(pattern, flags = "") {
    // Check pattern length
    if (pattern.length > MAX_REGEX_LENGTH) {
        return {
            valid: false,
            error: `Regex pattern too long (${pattern.length} chars). Maximum allowed: ${MAX_REGEX_LENGTH}`
        };
    }

    // Check for known ReDoS patterns
    for (const redosPattern of REDOS_PATTERNS) {
        if (redosPattern.test(pattern)) {
            return {
                valid: false,
                error: "Regex pattern contains potentially dangerous nested quantifiers or overlapping alternations"
            };
        }
    }

    // Try to compile the regex to check for syntax errors
    // Only use standard regex flags for validation (not XRegExp-specific flags like 'A')
    try {
        // Use a timeout to detect catastrophic backtracking
        const testString = "a".repeat(100);
        // Filter to only standard RegExp flags for validation
        const standardFlags = flags.replace(/[^gimsuvy]/g, "");
        const regex = new RegExp(pattern, standardFlags);

        const startTime = Date.now();
        regex.test(testString);
        const elapsedTime = Date.now() - startTime;

        if (elapsedTime > VALIDATION_TIMEOUT) {
            return {
                valid: false,
                error: `Regex validation timed out (${elapsedTime}ms). Pattern may cause performance issues.`
            };
        }
    } catch (err) {
        return {
            valid: false,
            error: `Invalid regex syntax: ${err.message}`
        };
    }

    return { valid: true, error: null };
}

/**
 * Creates a safe RegExp object from a user-provided pattern.
 * Validates the pattern before construction to prevent ReDoS attacks.
 *
 * @param {string} pattern - The regex pattern
 * @param {string} [flags=""] - Optional regex flags
 * @returns {RegExp} A safe RegExp object
 * @throws {Error} If the pattern fails validation
 */
export function createSafeRegExp(pattern, flags = "") {
    const validation = validateRegexPattern(pattern, flags);

    if (!validation.valid) {
        throw new Error(validation.error);
    }

    return new RegExp(pattern, flags);
}

/**
 * Creates a safe XRegExp object from a user-provided pattern.
 * Validates the pattern before construction to prevent ReDoS attacks.
 *
 * @param {Function} XRegExp - The XRegExp constructor
 * @param {string} pattern - The regex pattern
 * @param {string} [flags=""] - Optional regex flags
 * @returns {Object} A safe XRegExp object
 * @throws {Error} If the pattern fails validation
 */
export function createSafeXRegExp(XRegExp, pattern, flags = "") {
    const validation = validateRegexPattern(pattern, flags);

    if (!validation.valid) {
        throw new Error(validation.error);
    }

    return new XRegExp(pattern, flags);
}

/**
 * Escapes special regex characters in a string to make it safe for use in a regex pattern.
 *
 * @param {string} str - The string to escape
 * @returns {string} The escaped string
 */
export function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
