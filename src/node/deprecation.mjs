/**
 * CyberChef MCP Deprecation Warning System
 *
 * Runtime deprecation warnings for APIs changing in v2.0.0.
 * Helps users prepare for breaking changes by providing early warnings
 * and migration guidance.
 *
 * @author DoubleGate
 * @license Apache-2.0
 * @version 1.8.0
 */

import { getLogger } from "./logger.mjs";

/**
 * Deprecation codes for v2.0.0 changes.
 * Each code identifies a specific deprecated feature.
 */
export const DEPRECATION_CODES = {
    DEP001: {
        code: "DEP001",
        feature: "Tool naming convention",
        description: "The 'cyberchef_' prefix will be removed from tool names in v2.0.0",
        alternative: "Use base64_encode instead of cyberchef_to_base64",
        removalVersion: "2.0.0"
    },
    DEP002: {
        code: "DEP002",
        feature: "Recipe schema format",
        description: "Recipe schema will be enhanced with Zod v4 validation in v2.0.0",
        alternative: "Use enhanced Zod v4 validated schema with stricter type checking",
        removalVersion: "2.0.0"
    },
    DEP003: {
        code: "DEP003",
        feature: "Error response format",
        description: "Error responses will include structured error codes in v2.0.0",
        alternative: "Use structured error objects with codes instead of plain text errors",
        removalVersion: "2.0.0"
    },
    DEP004: {
        code: "DEP004",
        feature: "Configuration system",
        description: "Configuration will use unified config file + env vars in v2.0.0",
        alternative: "Use unified config file (cyberchef.config.json) combined with environment variables",
        removalVersion: "2.0.0"
    },
    DEP005: {
        code: "DEP005",
        feature: "Legacy argument handling",
        description: "Positional arguments will be replaced with named object arguments in v2.0.0",
        alternative: "Use named object arguments: { key: value } instead of positional arrays",
        removalVersion: "2.0.0"
    },
    DEP006: {
        code: "DEP006",
        feature: "Recipe array format",
        description: "Recipe operations using simple arrays will require explicit operation objects in v2.0.0",
        alternative: "Use explicit operation objects: { op: 'name', args: {...} } instead of shorthand",
        removalVersion: "2.0.0"
    },
    DEP007: {
        code: "DEP007",
        feature: "Meta-tool cyberchef_bake",
        description: "cyberchef_bake will be renamed to 'bake' in v2.0.0",
        alternative: "Prepare for tool rename: cyberchef_bake -> bake",
        removalVersion: "2.0.0"
    },
    DEP008: {
        code: "DEP008",
        feature: "Meta-tool cyberchef_search",
        description: "cyberchef_search will be renamed to 'search' in v2.0.0",
        alternative: "Prepare for tool rename: cyberchef_search -> search",
        removalVersion: "2.0.0"
    }
};

/**
 * Set to track which deprecation warnings have been emitted.
 * Prevents duplicate warnings in the same session.
 */
const deprecationWarnings = new Set();

/**
 * Timestamp when deprecations were first tracked.
 */
let sessionStartTime = Date.now();

/**
 * Check if deprecation warnings are suppressed.
 *
 * @returns {boolean} True if warnings are suppressed.
 */
export function areSuppressed() {
    return process.env.CYBERCHEF_SUPPRESS_DEPRECATIONS === "true";
}

/**
 * Check if v2.0.0 compatibility mode is enabled.
 *
 * @returns {boolean} True if v2 compatibility mode is enabled.
 */
export function isV2CompatibilityMode() {
    return process.env.V2_COMPATIBILITY_MODE === "true";
}

/**
 * Emit a deprecation warning for a specific code.
 * Warnings are emitted only once per session per code.
 *
 * @param {string} code - Deprecation code (e.g., "DEP001").
 * @param {string} [context=""] - Additional context about where the deprecation occurred.
 * @returns {boolean} True if warning was emitted, false if suppressed or already warned.
 */
export function emitDeprecation(code, context = "") {
    // Check if suppressed
    if (areSuppressed()) {
        return false;
    }

    // Check if already warned
    if (deprecationWarnings.has(code)) {
        return false;
    }

    // Get deprecation info
    const dep = DEPRECATION_CODES[code];
    if (!dep) {
        const logger = getLogger();
        logger.warn({ deprecationCode: code }, `[DEPRECATION] Unknown deprecation code: ${code}`);
        return false;
    }

    // Mark as warned
    deprecationWarnings.add(code);

    // Format and emit warning
    const timestamp = new Date().toISOString();
    const logger = getLogger();

    // In v2 compatibility mode, emit as errors instead of warnings
    const logLevel = isV2CompatibilityMode() ? "error" : "warn";
    const prefix = isV2CompatibilityMode() ? "[DEPRECATION ERROR]" : "[DEPRECATION]";

    const deprecationMessage = [
        `${prefix} ${code}: ${dep.feature} is deprecated.`,
        `  Description: ${dep.description}`,
        `  Alternative: ${dep.alternative}`,
        `  This will be removed in v${dep.removalVersion}`,
        context ? `  Context: ${context}` : null,
        `  Timestamp: ${timestamp}`
    ].filter(Boolean).join("\n");

    logger[logLevel]({
        deprecationCode: code,
        feature: dep.feature,
        removalVersion: dep.removalVersion,
        context: context || undefined
    }, deprecationMessage);

    return true;
}

/**
 * Emit a deprecation warning for tool naming convention.
 *
 * @param {string} toolName - The tool name being used.
 * @returns {boolean} True if warning was emitted.
 */
export function emitToolNamingDeprecation(toolName) {
    if (toolName.startsWith("cyberchef_")) {
        return emitDeprecation("DEP001", `Tool: ${toolName}`);
    }
    return false;
}

/**
 * Emit a deprecation warning for meta-tools.
 *
 * @param {string} toolName - The meta-tool name being used.
 * @returns {boolean} True if warning was emitted.
 */
export function emitMetaToolDeprecation(toolName) {
    if (toolName === "cyberchef_bake") {
        return emitDeprecation("DEP007", `Meta-tool: ${toolName}`);
    }
    if (toolName === "cyberchef_search") {
        return emitDeprecation("DEP008", `Meta-tool: ${toolName}`);
    }
    return false;
}

/**
 * Emit a deprecation warning for legacy recipe format.
 *
 * @param {any} recipe - The recipe being validated.
 * @returns {boolean} True if warning was emitted.
 */
export function emitRecipeFormatDeprecation(recipe) {
    if (Array.isArray(recipe)) {
        // Check for legacy shorthand format
        for (const op of recipe) {
            if (Array.isArray(op.args)) {
                return emitDeprecation("DEP005", "Recipe uses positional array arguments");
            }
        }
    }
    return false;
}

/**
 * Get statistics about deprecation warnings in current session.
 *
 * @returns {Object} Statistics object with warning details.
 */
export function getDeprecationStats() {
    const warnedList = Array.from(deprecationWarnings);
    const warnedDetails = warnedList.map(code => ({
        code,
        ...DEPRECATION_CODES[code]
    }));

    return {
        warned: warnedList,
        warnedDetails,
        total: deprecationWarnings.size,
        suppressed: areSuppressed(),
        v2CompatibilityMode: isV2CompatibilityMode(),
        availableCodes: Object.keys(DEPRECATION_CODES),
        sessionDuration: Date.now() - sessionStartTime
    };
}

/**
 * Reset deprecation warnings for testing purposes.
 * Clears all tracked warnings so they can be emitted again.
 */
export function resetDeprecations() {
    deprecationWarnings.clear();
    sessionStartTime = Date.now();
}

/**
 * Get all deprecation codes and their details.
 *
 * @returns {Object} All deprecation codes with full details.
 */
export function getAllDeprecationCodes() {
    return { ...DEPRECATION_CODES };
}

/**
 * Check if a specific deprecation has been warned.
 *
 * @param {string} code - Deprecation code to check.
 * @returns {boolean} True if already warned.
 */
export function hasWarned(code) {
    return deprecationWarnings.has(code);
}

/**
 * Get the count of warnings emitted.
 *
 * @returns {number} Number of unique warnings emitted.
 */
export function getWarningCount() {
    return deprecationWarnings.size;
}

/**
 * Utility function to get tool name for v2.0.0.
 * Returns the name with or without prefix based on compatibility mode.
 *
 * @param {string} baseName - The base tool name without cyberchef_ prefix.
 * @param {boolean} [forV2] - Override to force v2 naming. Defaults to V2_COMPATIBILITY_MODE.
 * @returns {string} The tool name appropriate for current mode.
 */
export function getToolName(baseName, forV2 = isV2CompatibilityMode()) {
    if (forV2) {
        return baseName; // e.g., "to_base64"
    }
    return `cyberchef_${baseName}`; // e.g., "cyberchef_to_base64"
}

/**
 * Utility function to strip cyberchef_ prefix from tool name.
 *
 * @param {string} toolName - The full tool name.
 * @returns {string} The tool name without cyberchef_ prefix.
 */
export function stripToolPrefix(toolName) {
    if (toolName.startsWith("cyberchef_")) {
        return toolName.substring(10); // Remove "cyberchef_" (10 chars)
    }
    return toolName;
}

/**
 * Analyze a recipe for v2.0.0 compatibility issues.
 *
 * @param {Object} recipe - Recipe object to analyze.
 * @returns {Object} Analysis result with issues and recommendations.
 */
export function analyzeRecipeCompatibility(recipe) {
    const issues = [];

    if (!recipe || typeof recipe !== "object") {
        return {
            compatible: false,
            issues: [{
                code: "INVALID_RECIPE",
                location: "root",
                message: "Recipe must be a valid object",
                severity: "breaking",
                fix: "Provide a valid recipe object with operations array"
            }]
        };
    }

    // Check for operations array
    if (recipe.operations && Array.isArray(recipe.operations)) {
        recipe.operations.forEach((op, index) => {
            // Check for positional args (DEP005)
            if (op.args && Array.isArray(op.args)) {
                issues.push({
                    code: "DEP005",
                    location: `operations[${index}].args`,
                    message: "Positional array arguments are deprecated",
                    severity: "warning",
                    fix: "Convert array arguments to named object: { key: value }"
                });
            }

            // Check for missing explicit op field
            if (!op.op && !op.recipe) {
                issues.push({
                    code: "DEP006",
                    location: `operations[${index}]`,
                    message: "Operation missing explicit 'op' field",
                    severity: "warning",
                    fix: "Add explicit 'op' field with operation name"
                });
            }
        });
    }

    // Check for legacy recipe array format (passed directly as array)
    if (Array.isArray(recipe)) {
        issues.push({
            code: "DEP006",
            location: "root",
            message: "Recipe passed as array instead of object",
            severity: "warning",
            fix: "Wrap recipe in object: { name: 'Recipe Name', operations: [...] }"
        });
    }

    // Determine overall compatibility
    const hasBreaking = issues.some(i => i.severity === "breaking");

    return {
        compatible: !hasBreaking,
        issues,
        issueCount: issues.length,
        breakingCount: issues.filter(i => i.severity === "breaking").length,
        warningCount: issues.filter(i => i.severity === "warning").length
    };
}

/**
 * Transform a recipe to v2.0.0 format.
 *
 * @param {Object|Array} recipe - Recipe in legacy format.
 * @returns {Object} Recipe transformed to v2.0.0 format.
 */
export function transformRecipeToV2(recipe) {
    // Handle array format (legacy)
    if (Array.isArray(recipe)) {
        return {
            name: "Transformed Recipe",
            description: "Automatically transformed from v1.x array format",
            operations: recipe.map(op => transformOperationToV2(op)),
            metadata: {
                transformedAt: new Date().toISOString(),
                originalFormat: "array"
            }
        };
    }

    // Handle object format
    if (recipe && typeof recipe === "object") {
        const transformed = { ...recipe };

        // Transform operations if present
        if (transformed.operations && Array.isArray(transformed.operations)) {
            transformed.operations = transformed.operations.map(op => transformOperationToV2(op));
        }

        // Add transformation metadata
        transformed.metadata = {
            ...transformed.metadata,
            transformedAt: new Date().toISOString(),
            v2Compatible: true
        };

        return transformed;
    }

    // Return as-is if not recognizable
    return recipe;
}

/**
 * Transform a single operation to v2.0.0 format.
 *
 * @param {Object} op - Operation in legacy format.
 * @returns {Object} Operation in v2.0.0 format.
 */
function transformOperationToV2(op) {
    if (!op || typeof op !== "object") {
        return op;
    }

    const transformed = { ...op };

    // Convert array args to object args (DEP005)
    if (transformed.args && Array.isArray(transformed.args)) {
        // Create named args from positional args
        // This is a best-effort transformation
        const namedArgs = {};
        transformed.args.forEach((arg, index) => {
            namedArgs[`arg${index}`] = arg;
        });
        transformed.args = namedArgs;
        transformed._legacyArgsConverted = true;
    }

    return transformed;
}
