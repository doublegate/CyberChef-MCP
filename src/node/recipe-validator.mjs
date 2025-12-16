/**
 * Recipe validation module for CyberChef MCP Server.
 * Provides Zod schemas and validation logic for recipe management.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { z } from "zod";
import OperationConfig from "../core/config/OperationConfig.json" with {type: "json"};
import { createInputError } from "./errors.mjs";

// Configuration constants
const MAX_OPERATIONS_PER_RECIPE = parseInt(process.env.CYBERCHEF_RECIPE_MAX_OPERATIONS, 10) || 100;
const MAX_RECIPE_DEPTH = parseInt(process.env.CYBERCHEF_RECIPE_MAX_DEPTH, 10) || 5;
const MAX_RECIPE_NAME_LENGTH = 200;
const MAX_RECIPE_DESCRIPTION_LENGTH = 1000;
const MAX_TAG_COUNT = 20;
const MAX_TAG_LENGTH = 50;

/**
 * Schema for a single operation in a recipe.
 */
export const RecipeOperationSchema = z.object({
    op: z.string()
        .min(1)
        .describe("Operation name from CyberChef")
        .optional(),
    args: z.record(z.any())
        .optional()
        .describe("Operation arguments as key-value pairs"),
    recipe: z.string()
        .uuid()
        .optional()
        .describe("Reference to another recipe ID (for composition)")
}).refine(
    (data) => data.op !== undefined || data.recipe !== undefined,
    {
        message: "Either 'op' or 'recipe' must be specified"
    }
).refine(
    (data) => !(data.op !== undefined && data.recipe !== undefined),
    {
        message: "Cannot specify both 'op' and 'recipe' in the same operation"
    }
);

/**
 * Schema for recipe metadata.
 */
export const RecipeMetadataSchema = z.object({
    complexity: z.enum(["low", "medium", "high"])
        .optional()
        .describe("Estimated complexity level"),
    estimatedTime: z.string()
        .optional()
        .describe("Estimated execution time (e.g., '100ms', '2s')"),
    requiredArgs: z.array(z.string())
        .optional()
        .describe("List of required argument names"),
    category: z.string()
        .max(50)
        .optional()
        .describe("Recipe category (e.g., 'crypto', 'encoding')")
});

/**
 * Schema for a complete recipe.
 */
export const RecipeSchema = z.object({
    id: z.string()
        .uuid()
        .describe("Unique recipe identifier"),
    name: z.string()
        .min(1)
        .max(MAX_RECIPE_NAME_LENGTH)
        .describe("Human-readable recipe name"),
    description: z.string()
        .max(MAX_RECIPE_DESCRIPTION_LENGTH)
        .optional()
        .describe("Recipe description and purpose"),
    version: z.string()
        .regex(/^\d+\.\d+\.\d+$/, "Version must be in semver format (e.g., 1.0.0)")
        .describe("Recipe version (semver format)"),
    author: z.string()
        .email()
        .optional()
        .describe("Recipe author email"),
    created: z.string()
        .datetime()
        .describe("ISO 8601 creation timestamp"),
    updated: z.string()
        .datetime()
        .describe("ISO 8601 last update timestamp"),
    tags: z.array(z.string().max(MAX_TAG_LENGTH))
        .max(MAX_TAG_COUNT)
        .optional()
        .describe("Recipe tags for categorization and search"),
    operations: z.array(RecipeOperationSchema)
        .min(1)
        .max(MAX_OPERATIONS_PER_RECIPE)
        .describe("List of operations to perform"),
    metadata: RecipeMetadataSchema
        .optional()
        .describe("Additional recipe metadata")
});

/**
 * Schema for recipe creation (subset of RecipeSchema).
 * ID, timestamps, and version are auto-generated.
 */
export const RecipeCreateSchema = z.object({
    name: z.string()
        .min(1)
        .max(MAX_RECIPE_NAME_LENGTH)
        .describe("Human-readable recipe name"),
    description: z.string()
        .max(MAX_RECIPE_DESCRIPTION_LENGTH)
        .optional()
        .describe("Recipe description and purpose"),
    author: z.string()
        .email()
        .optional()
        .describe("Recipe author email"),
    tags: z.array(z.string().max(MAX_TAG_LENGTH))
        .max(MAX_TAG_COUNT)
        .optional()
        .describe("Recipe tags for categorization and search"),
    operations: z.array(RecipeOperationSchema)
        .min(1)
        .max(MAX_OPERATIONS_PER_RECIPE)
        .describe("List of operations to perform"),
    metadata: RecipeMetadataSchema
        .optional()
        .describe("Additional recipe metadata")
});

/**
 * Schema for recipe update (all fields optional except operations min length).
 */
export const RecipeUpdateSchema = z.object({
    name: z.string()
        .min(1)
        .max(MAX_RECIPE_NAME_LENGTH)
        .optional(),
    description: z.string()
        .max(MAX_RECIPE_DESCRIPTION_LENGTH)
        .optional(),
    author: z.string()
        .email()
        .optional(),
    tags: z.array(z.string().max(MAX_TAG_LENGTH))
        .max(MAX_TAG_COUNT)
        .optional(),
    operations: z.array(RecipeOperationSchema)
        .min(1)
        .max(MAX_OPERATIONS_PER_RECIPE)
        .optional(),
    metadata: RecipeMetadataSchema
        .optional()
});

/**
 * Validate that all operation names in a recipe are valid.
 *
 * @param {Object} recipe - The recipe to validate.
 * @throws {Error} If an operation name is invalid.
 */
export function validateOperationNames(recipe) {
    const validOperations = new Set(Object.keys(OperationConfig));

    for (let i = 0; i < recipe.operations.length; i++) {
        const operation = recipe.operations[i];

        // Skip recipe references (will be validated during execution)
        if (operation.recipe) {
            continue;
        }

        if (operation.op && !validOperations.has(operation.op)) {
            throw createInputError(
                `Invalid operation name at index ${i}: "${operation.op}"`,
                {
                    index: i,
                    operationName: operation.op,
                    suggestion: "Use cyberchef_search to find valid operation names"
                }
            );
        }
    }
}

/**
 * Validate operation arguments against their schemas.
 *
 * @param {Object} recipe - The recipe to validate.
 * @throws {Error} If operation arguments are invalid.
 */
export function validateOperationArguments(recipe) {
    for (let i = 0; i < recipe.operations.length; i++) {
        const operation = recipe.operations[i];

        // Skip recipe references and operations without args
        if (operation.recipe || !operation.op || !operation.args) {
            continue;
        }

        const opConfig = OperationConfig[operation.op];
        if (!opConfig || !opConfig.args) {
            continue;
        }

        // Validate each argument type
        for (const argDef of opConfig.args) {
            const argName = argDef.name.toLowerCase().replace(/ /g, "_");
            const userValue = operation.args[argName];

            // Skip if argument not provided (will use default)
            if (userValue === undefined) {
                continue;
            }

            // Type validation
            switch (argDef.type) {
                case "boolean":
                    if (typeof userValue !== "boolean") {
                        throw createInputError(
                            `Invalid argument type for ${operation.op}.${argName}: expected boolean, got ${typeof userValue}`,
                            {
                                operation: operation.op,
                                argument: argName,
                                expectedType: "boolean",
                                actualType: typeof userValue
                            }
                        );
                    }
                    break;

                case "number":
                case "integer":
                    if (typeof userValue !== "number") {
                        throw createInputError(
                            `Invalid argument type for ${operation.op}.${argName}: expected number, got ${typeof userValue}`,
                            {
                                operation: operation.op,
                                argument: argName,
                                expectedType: "number",
                                actualType: typeof userValue
                            }
                        );
                    }
                    break;

                case "option":
                    // Validate that value is one of the allowed options
                    if (Array.isArray(argDef.value) && argDef.value.length > 0) {
                        const validOptions = argDef.value.map(v =>
                            typeof v === "string" ? v : v.name
                        );
                        if (!validOptions.includes(userValue)) {
                            throw createInputError(
                                `Invalid option for ${operation.op}.${argName}: "${userValue}" not in allowed options`,
                                {
                                    operation: operation.op,
                                    argument: argName,
                                    value: userValue,
                                    allowedOptions: validOptions
                                }
                            );
                        }
                    }
                    break;

                // Other types (string, editableOption, etc.) are flexible
                default:
                    break;
            }
        }
    }
}

/**
 * Detect circular dependencies in recipe composition.
 *
 * @param {Object} recipe - The recipe to check.
 * @param {Function} getRecipeById - Function to retrieve recipe by ID.
 * @param {Set} visited - Set of visited recipe IDs (for recursion tracking).
 * @param {number} depth - Current recursion depth.
 * @throws {Error} If circular dependency or max depth exceeded.
 */
export async function detectCircularDependencies(recipe, getRecipeById, visited = new Set(), depth = 0) {
    if (depth > MAX_RECIPE_DEPTH) {
        throw createInputError(
            `Recipe nesting exceeds maximum depth of ${MAX_RECIPE_DEPTH}`,
            {
                maxDepth: MAX_RECIPE_DEPTH,
                currentDepth: depth,
                recipeId: recipe.id,
                recipeName: recipe.name
            }
        );
    }

    visited.add(recipe.id);

    for (const operation of recipe.operations) {
        if (operation.recipe) {
            if (visited.has(operation.recipe)) {
                throw createInputError(
                    `Circular dependency detected: recipe "${recipe.name}" (${recipe.id}) references itself`,
                    {
                        recipeId: recipe.id,
                        recipeName: recipe.name,
                        circularReference: operation.recipe
                    }
                );
            }

            // Load referenced recipe and check recursively
            const referencedRecipe = await getRecipeById(operation.recipe);
            if (!referencedRecipe) {
                throw createInputError(
                    `Referenced recipe not found: ${operation.recipe}`,
                    {
                        recipeId: recipe.id,
                        recipeName: recipe.name,
                        missingReference: operation.recipe
                    }
                );
            }

            await detectCircularDependencies(
                referencedRecipe,
                getRecipeById,
                new Set(visited),
                depth + 1
            );
        }
    }
}

/**
 * Estimate recipe complexity based on operation count and types.
 *
 * @param {Object} recipe - The recipe to analyze.
 * @returns {string} Complexity level: 'low', 'medium', or 'high'.
 */
export function estimateComplexity(recipe) {
    const operationCount = recipe.operations.length;

    // CPU-intensive operations (crypto, compression, etc.)
    const cpuIntensiveOps = new Set([
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

    const cpuIntensiveCount = recipe.operations.filter(op =>
        op.op && cpuIntensiveOps.has(op.op)
    ).length;

    const recipeReferenceCount = recipe.operations.filter(op => op.recipe).length;

    // Complexity heuristics
    if (operationCount <= 3 && cpuIntensiveCount === 0 && recipeReferenceCount === 0) {
        return "low";
    }

    if (operationCount > 10 || cpuIntensiveCount > 3 || recipeReferenceCount > 2) {
        return "high";
    }

    return "medium";
}

/**
 * Validate a complete recipe.
 *
 * @param {Object} recipe - The recipe to validate.
 * @param {Function} getRecipeById - Function to retrieve recipe by ID (for composition validation).
 * @returns {Promise<void>}
 * @throws {Error} If validation fails.
 */
export async function validateRecipe(recipe, getRecipeById = null) {
    // Schema validation
    RecipeSchema.parse(recipe);

    // Operation name validation
    validateOperationNames(recipe);

    // Operation argument validation
    validateOperationArguments(recipe);

    // Circular dependency detection (if getRecipeById provided)
    if (getRecipeById) {
        await detectCircularDependencies(recipe, getRecipeById);
    }
}

/**
 * Validate recipe creation input.
 *
 * @param {Object} input - The recipe creation input.
 * @returns {void}
 * @throws {Error} If validation fails.
 */
export function validateRecipeCreate(input) {
    RecipeCreateSchema.parse(input);
    validateOperationNames(input);
    validateOperationArguments(input);
}

/**
 * Validate recipe update input.
 *
 * @param {Object} input - The recipe update input.
 * @returns {void}
 * @throws {Error} If validation fails.
 */
export function validateRecipeUpdate(input) {
    RecipeUpdateSchema.parse(input);

    // Only validate operations if they're being updated
    if (input.operations) {
        validateOperationNames(input);
        validateOperationArguments(input);
    }
}
