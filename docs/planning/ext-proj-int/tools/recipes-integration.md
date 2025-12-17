# CyberChef Recipes Integration Plan

## Overview

| Attribute | Value |
|-----------|-------|
| Project | cyberchef-recipes |
| Phase | Phase 2 (JavaScript Native) |
| Priority | High |
| Complexity | Low |
| Estimated Effort | 2 days |
| Dependencies | None |

## Integration Scope

The cyberchef-recipes project is a community-contributed collection of 70+ CyberChef operation chains. This integration creates a recipe preset system that makes these recipes accessible through the MCP interface.

### In Scope

1. **Recipe Library** - Curated collection of community recipes
2. **Recipe Search** - Find recipes by category, keyword, or operation
3. **Recipe Execution** - Run preset recipes via MCP
4. **Recipe Validation** - Validate recipe compatibility with Node.js API

### Out of Scope

- Creating new recipes (handled by existing `cyberchef_bake`)
- HTTP-dependent recipes (SOP limitations)
- Web-only operations

## MCP Tools

### Tool 1: cyberchef_recipe_list

**Purpose**: List available preset recipes by category

```javascript
{
    name: 'cyberchef_recipe_list',
    description: 'List available CyberChef preset recipes from community collection',
    inputSchema: {
        type: 'object',
        properties: {
            category: {
                type: 'string',
                enum: ['malware', 'forensics', 'encoding', 'crypto', 'ctf', 'utility', 'all'],
                default: 'all',
                description: 'Recipe category to list'
            },
            include_operations: {
                type: 'boolean',
                default: false,
                description: 'Include operation chain in output'
            }
        }
    }
}
```

### Tool 2: cyberchef_recipe_search

**Purpose**: Search recipes by keyword, operation, or use case

```javascript
{
    name: 'cyberchef_recipe_search',
    description: 'Search CyberChef recipes by keyword, operation name, or use case',
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Search term (matches name, description, operations)'
            },
            operation: {
                type: 'string',
                description: 'Find recipes using specific operation'
            },
            complexity: {
                type: 'string',
                enum: ['beginner', 'intermediate', 'advanced', 'expert'],
                description: 'Filter by complexity level'
            }
        },
        required: ['query']
    }
}
```

### Tool 3: cyberchef_recipe_run

**Purpose**: Execute a preset recipe by name or ID

```javascript
{
    name: 'cyberchef_recipe_run',
    description: 'Execute a preset CyberChef recipe',
    inputSchema: {
        type: 'object',
        properties: {
            recipe_id: {
                type: 'string',
                description: 'Recipe identifier (e.g., "malware_powershell_charcode")'
            },
            input: {
                type: 'string',
                description: 'Input data to process'
            },
            input_format: {
                type: 'string',
                enum: ['text', 'hex', 'base64'],
                default: 'text',
                description: 'Input format'
            }
        },
        required: ['recipe_id', 'input']
    }
}
```

### Tool 4: cyberchef_recipe_info

**Purpose**: Get detailed information about a specific recipe

```javascript
{
    name: 'cyberchef_recipe_info',
    description: 'Get detailed information about a CyberChef recipe',
    inputSchema: {
        type: 'object',
        properties: {
            recipe_id: {
                type: 'string',
                description: 'Recipe identifier'
            }
        },
        required: ['recipe_id']
    }
}
```

## Recipe Library Structure

### Recipe Metadata Schema

```javascript
// src/node/recipes/schema.mjs
export const RecipeSchema = {
    id: 'string',           // Unique identifier
    name: 'string',         // Human-readable name
    description: 'string',  // What the recipe does
    category: 'string',     // Primary category
    tags: ['string'],       // Additional tags
    complexity: 'string',   // beginner|intermediate|advanced|expert
    source: 'string',       // Original recipe number or URL
    author: 'string',       // Attribution
    operations: ['object'], // CyberChef operation chain
    sample_input: 'string', // Example input (optional)
    expected_output: 'string', // Expected result (optional)
    compatibility: {
        node_api: 'boolean', // Works in Node.js API
        requires_http: 'boolean', // Needs HTTP requests
        notes: 'string'     // Compatibility notes
    }
};
```

### Category Organization

```
src/node/recipes/
  index.mjs              # Recipe loader and registry
  schema.mjs             # Recipe metadata schema
  malware/
    powershell.json      # PowerShell deobfuscation recipes
    php-webshell.json    # PHP webshell analysis
    office-maldocs.json  # Office document analysis
    ransomware.json      # Ransomware decryption
  forensics/
    timestamps.json      # Timestamp conversions
    file-analysis.json   # File parsing recipes
    network.json         # Network artifact analysis
  encoding/
    base-variants.json   # Base64, Base32, Base85, etc.
    multi-layer.json     # Nested encoding chains
    charcode.json        # Character code variants
  crypto/
    classical.json       # Classical cipher recipes
    modern.json          # Modern crypto operations
  ctf/
    common-patterns.json # Common CTF challenges
    flags.json           # Flag extraction
  utility/
    formatting.json      # Data formatting
    extraction.json      # Data extraction patterns
```

### Sample Recipe Definitions

```javascript
// src/node/recipes/malware/powershell.json
{
    "recipes": [
        {
            "id": "malware_powershell_charcode",
            "name": "PowerShell CharCode Deobfuscation",
            "description": "Decode PowerShell scripts using character code obfuscation ([char]65, etc.)",
            "category": "malware",
            "tags": ["powershell", "deobfuscation", "charcode"],
            "complexity": "beginner",
            "source": "Recipe #3 from cyberchef-recipes",
            "author": "mattnotmax",
            "operations": [
                {
                    "op": "Regular expression",
                    "args": ["User defined", "([0-9]{2,3}(,\\s|))+", true, true, false, false, false, false, "List matches"]
                },
                {
                    "op": "From Charcode",
                    "args": ["Comma", 10]
                }
            ],
            "sample_input": "[char]72+[char]101+[char]108+[char]108+[char]111",
            "expected_output": "Hello",
            "compatibility": {
                "node_api": true,
                "requires_http": false,
                "notes": ""
            }
        },
        {
            "id": "malware_powershell_base64_gzip",
            "name": "PowerShell Base64 + Gzip Deobfuscation",
            "description": "Decode Base64-encoded, gzip-compressed PowerShell scripts",
            "category": "malware",
            "tags": ["powershell", "base64", "gzip", "compression"],
            "complexity": "intermediate",
            "source": "Recipe #1 from cyberchef-recipes",
            "author": "mattnotmax",
            "operations": [
                {
                    "op": "Regular expression",
                    "args": ["User defined", "[a-zA-Z0-9+/=]{30,}", true, true, false, false, false, false, "List matches"]
                },
                {
                    "op": "From Base64",
                    "args": ["A-Za-z0-9+/=", true]
                },
                {
                    "op": "Raw Inflate",
                    "args": [0, 0, "Adaptive", false, false]
                },
                {
                    "op": "Generic Code Beautify",
                    "args": []
                }
            ],
            "compatibility": {
                "node_api": true,
                "requires_http": false,
                "notes": ""
            }
        }
    ]
}

// src/node/recipes/forensics/timestamps.json
{
    "recipes": [
        {
            "id": "forensics_google_ei",
            "name": "Google ei Timestamp Decoder",
            "description": "Decode Google's ei parameter timestamp from search URLs",
            "category": "forensics",
            "tags": ["google", "timestamp", "forensics"],
            "complexity": "intermediate",
            "source": "Recipe #6 from cyberchef-recipes",
            "author": "mattnotmax",
            "operations": [
                {
                    "op": "From Base64",
                    "args": ["A-Za-z0-9-_=", true]
                },
                {
                    "op": "To Hex",
                    "args": ["None", 0]
                },
                {
                    "op": "Take bytes",
                    "args": [0, 8, false]
                },
                {
                    "op": "Swap endianness",
                    "args": ["Hex", 4, true]
                },
                {
                    "op": "From Base",
                    "args": [16]
                },
                {
                    "op": "From UNIX Timestamp",
                    "args": ["Seconds (s)"]
                }
            ],
            "compatibility": {
                "node_api": true,
                "requires_http": false,
                "notes": ""
            }
        },
        {
            "id": "forensics_squid_timestamp",
            "name": "Squid Proxy Log Timestamp",
            "description": "Convert Squid proxy log timestamps to readable format",
            "category": "forensics",
            "tags": ["squid", "proxy", "timestamp", "logs"],
            "complexity": "beginner",
            "source": "Recipe #45 from cyberchef-recipes",
            "author": "mattnotmax",
            "operations": [
                {
                    "op": "Regular expression",
                    "args": ["User defined", "^\\d{10}", true, true, false, false, false, false, "List matches"]
                },
                {
                    "op": "From UNIX Timestamp",
                    "args": ["Seconds (s)"]
                }
            ],
            "compatibility": {
                "node_api": true,
                "requires_http": false,
                "notes": ""
            }
        }
    ]
}

// src/node/recipes/encoding/multi-layer.json
{
    "recipes": [
        {
            "id": "encoding_multi_base64_loop",
            "name": "Multi-Layer Base64 Decoder (Loop)",
            "description": "Decode multiple layers of Base64 encoding using loops",
            "category": "encoding",
            "tags": ["base64", "loop", "nested"],
            "complexity": "advanced",
            "source": "Recipe #5 from cyberchef-recipes",
            "author": "mattnotmax",
            "operations": [
                {
                    "op": "Label",
                    "args": ["top"]
                },
                {
                    "op": "Regular expression",
                    "args": ["User defined", "[a-zA-Z0-9+/=]{30,}", true, true, false, false, false, false, "List matches"]
                },
                {
                    "op": "From Base64",
                    "args": ["A-Za-z0-9+/=", true]
                },
                {
                    "op": "Jump",
                    "args": ["top", 28]
                }
            ],
            "compatibility": {
                "node_api": true,
                "requires_http": false,
                "notes": "Loop iterations configurable via Jump args[1]"
            }
        }
    ]
}
```

## Implementation

### Recipe Registry

```javascript
// src/node/recipes/index.mjs
import fs from 'fs';
import path from 'path';

export class RecipeRegistry {
    constructor() {
        this.recipes = new Map();
        this.categories = new Map();
        this.operations = new Map();  // Index by operation name
    }

    /**
     * Load all recipes from JSON files
     */
    async loadRecipes(baseDir) {
        const categories = ['malware', 'forensics', 'encoding', 'crypto', 'ctf', 'utility'];

        for (const category of categories) {
            const categoryDir = path.join(baseDir, category);
            if (!fs.existsSync(categoryDir)) continue;

            const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.json'));

            for (const file of files) {
                const filePath = path.join(categoryDir, file);
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                for (const recipe of content.recipes) {
                    this.registerRecipe(recipe);
                }
            }
        }
    }

    /**
     * Register a single recipe
     */
    registerRecipe(recipe) {
        // Add to main registry
        this.recipes.set(recipe.id, recipe);

        // Add to category index
        if (!this.categories.has(recipe.category)) {
            this.categories.set(recipe.category, []);
        }
        this.categories.get(recipe.category).push(recipe.id);

        // Index by operations used
        for (const op of recipe.operations) {
            if (!this.operations.has(op.op)) {
                this.operations.set(op.op, []);
            }
            this.operations.get(op.op).push(recipe.id);
        }
    }

    /**
     * Get recipe by ID
     */
    getRecipe(id) {
        return this.recipes.get(id);
    }

    /**
     * List recipes by category
     */
    listByCategory(category) {
        if (category === 'all') {
            return Array.from(this.recipes.values());
        }
        const ids = this.categories.get(category) || [];
        return ids.map(id => this.recipes.get(id));
    }

    /**
     * Search recipes
     */
    search(query, options = {}) {
        const results = [];
        const queryLower = query.toLowerCase();

        for (const recipe of this.recipes.values()) {
            let score = 0;

            // Name match (highest weight)
            if (recipe.name.toLowerCase().includes(queryLower)) {
                score += 10;
            }

            // Description match
            if (recipe.description.toLowerCase().includes(queryLower)) {
                score += 5;
            }

            // Tag match
            if (recipe.tags.some(t => t.toLowerCase().includes(queryLower))) {
                score += 3;
            }

            // Operation match
            if (options.operation) {
                const hasOp = recipe.operations.some(op =>
                    op.op.toLowerCase().includes(options.operation.toLowerCase())
                );
                if (hasOp) score += 5;
            }

            // Complexity filter
            if (options.complexity && recipe.complexity !== options.complexity) {
                continue;
            }

            if (score > 0) {
                results.push({ recipe, score });
            }
        }

        return results
            .sort((a, b) => b.score - a.score)
            .map(r => r.recipe);
    }

    /**
     * Find recipes using specific operation
     */
    findByOperation(operationName) {
        const ids = this.operations.get(operationName) || [];
        return ids.map(id => this.recipes.get(id));
    }

    /**
     * Get all categories
     */
    getCategories() {
        return Array.from(this.categories.keys());
    }

    /**
     * Get recipe statistics
     */
    getStats() {
        const stats = {
            total: this.recipes.size,
            byCategory: {},
            byComplexity: {},
            nodeCompatible: 0
        };

        for (const recipe of this.recipes.values()) {
            stats.byCategory[recipe.category] = (stats.byCategory[recipe.category] || 0) + 1;
            stats.byComplexity[recipe.complexity] = (stats.byComplexity[recipe.complexity] || 0) + 1;
            if (recipe.compatibility?.node_api) stats.nodeCompatible++;
        }

        return stats;
    }
}

// Singleton instance
export const recipeRegistry = new RecipeRegistry();
```

### Recipe Executor

```javascript
// src/node/recipes/executor.mjs
import { bake } from '../mcp-server.mjs';  // CyberChef bake function
import { recipeRegistry } from './index.mjs';

export class RecipeExecutor {
    /**
     * Execute a recipe by ID
     */
    static async execute(recipeId, input, options = {}) {
        const recipe = recipeRegistry.getRecipe(recipeId);

        if (!recipe) {
            throw new Error(`Recipe not found: ${recipeId}`);
        }

        // Check compatibility
        if (recipe.compatibility?.requires_http) {
            throw new Error(`Recipe ${recipeId} requires HTTP requests (not supported in Node.js API)`);
        }

        // Format input if needed
        let processedInput = input;
        if (options.input_format === 'hex') {
            processedInput = Buffer.from(input, 'hex').toString('utf8');
        } else if (options.input_format === 'base64') {
            processedInput = Buffer.from(input, 'base64').toString('utf8');
        }

        // Execute recipe operations
        const result = await bake(processedInput, recipe.operations);

        return {
            recipe_id: recipeId,
            recipe_name: recipe.name,
            input_length: input.length,
            output: result,
            operations_executed: recipe.operations.length
        };
    }

    /**
     * Validate recipe compatibility
     */
    static validateRecipe(recipe) {
        const issues = [];

        // Check for HTTP-dependent operations
        const httpOps = recipe.operations.filter(op =>
            op.op.toLowerCase().includes('http') ||
            op.op.toLowerCase().includes('request')
        );
        if (httpOps.length > 0) {
            issues.push({
                type: 'warning',
                message: 'Recipe contains HTTP operations (may not work in Node.js API)'
            });
        }

        // Check for browser-only operations
        const browserOps = ['Render Image', 'Render HTML', 'Play Media'];
        const incompatible = recipe.operations.filter(op =>
            browserOps.includes(op.op)
        );
        if (incompatible.length > 0) {
            issues.push({
                type: 'error',
                message: `Recipe contains browser-only operations: ${incompatible.map(o => o.op).join(', ')}`
            });
        }

        return {
            valid: issues.filter(i => i.type === 'error').length === 0,
            issues
        };
    }
}
```

### MCP Tool Handlers

```javascript
// src/node/tools/recipes/handlers.mjs
import { recipeRegistry, RecipeExecutor } from '../recipes/index.mjs';

export const recipeHandlers = {
    /**
     * Handle cyberchef_recipe_list
     */
    async list(args) {
        const { category = 'all', include_operations = false } = args;

        const recipes = recipeRegistry.listByCategory(category);

        return {
            count: recipes.length,
            category: category,
            recipes: recipes.map(r => ({
                id: r.id,
                name: r.name,
                description: r.description,
                category: r.category,
                complexity: r.complexity,
                ...(include_operations ? { operations: r.operations } : {})
            }))
        };
    },

    /**
     * Handle cyberchef_recipe_search
     */
    async search(args) {
        const { query, operation, complexity } = args;

        const results = recipeRegistry.search(query, { operation, complexity });

        return {
            query,
            results_count: results.length,
            recipes: results.map(r => ({
                id: r.id,
                name: r.name,
                description: r.description,
                category: r.category,
                tags: r.tags,
                complexity: r.complexity
            }))
        };
    },

    /**
     * Handle cyberchef_recipe_run
     */
    async run(args) {
        const { recipe_id, input, input_format = 'text' } = args;

        return await RecipeExecutor.execute(recipe_id, input, { input_format });
    },

    /**
     * Handle cyberchef_recipe_info
     */
    async info(args) {
        const { recipe_id } = args;

        const recipe = recipeRegistry.getRecipe(recipe_id);

        if (!recipe) {
            throw new Error(`Recipe not found: ${recipe_id}`);
        }

        const validation = RecipeExecutor.validateRecipe(recipe);

        return {
            ...recipe,
            validation,
            operation_count: recipe.operations.length,
            operations_list: recipe.operations.map(o => o.op)
        };
    }
};
```

## Recipe Curation

### Selection Criteria

From the 70+ community recipes, prioritize:

1. **High-Use Recipes** (20 recipes)
   - Base64/Hex/Binary decoders
   - PowerShell deobfuscation
   - URL extraction/defanging
   - Timestamp conversions

2. **Malware Analysis** (15 recipes)
   - CharCode extraction
   - gzinflate/base64 chains
   - PHP webshell analysis
   - Cobalt Strike beacon parsing

3. **Forensics** (10 recipes)
   - Timestamp conversions (Google ei, Squid, UNIX)
   - File carving patterns
   - Registry artifact extraction

4. **CTF Common** (10 recipes)
   - Multi-layer encoding loops
   - Flag extraction patterns
   - Classical cipher chains

5. **Utility** (5 recipes)
   - Data formatting
   - Hash extraction
   - IOC defanging

### Compatibility Filtering

Exclude recipes that:
- Require HTTP requests (SOP limitations)
- Use browser-only operations (Render Image, Play Media)
- Depend on interactive features (File input)

## File Structure

```
src/node/recipes/
  index.mjs              # RecipeRegistry class
  executor.mjs           # RecipeExecutor class
  schema.mjs             # Recipe metadata schema
  malware/
    powershell.json
    php-webshell.json
    office-maldocs.json
    ransomware.json
    cobalt-strike.json
  forensics/
    timestamps.json
    file-analysis.json
    network.json
    registry.json
  encoding/
    base-variants.json
    multi-layer.json
    charcode.json
    compression.json
  crypto/
    classical.json
  ctf/
    common-patterns.json
    flags.json
  utility/
    formatting.json
    extraction.json
    defanging.json

src/node/tools/recipes/
  index.mjs              # Tool registration
  handlers.mjs           # MCP handler implementations

tests/recipes/
  registry.test.mjs
  executor.test.mjs
  handlers.test.mjs
  compatibility.test.mjs
```

## Test Cases

### Recipe Registry

```javascript
describe('RecipeRegistry', () => {
    it('should load recipes from JSON files', async () => {
        await recipeRegistry.loadRecipes('./src/node/recipes');
        expect(recipeRegistry.recipes.size).toBeGreaterThan(0);
    });

    it('should index by category', () => {
        const malwareRecipes = recipeRegistry.listByCategory('malware');
        expect(malwareRecipes.length).toBeGreaterThan(0);
        expect(malwareRecipes[0].category).toBe('malware');
    });

    it('should search by query', () => {
        const results = recipeRegistry.search('powershell');
        expect(results.length).toBeGreaterThan(0);
    });

    it('should find by operation', () => {
        const results = recipeRegistry.findByOperation('From Base64');
        expect(results.length).toBeGreaterThan(0);
    });
});
```

### Recipe Executor

```javascript
describe('RecipeExecutor', () => {
    it('should execute simple recipe', async () => {
        const result = await RecipeExecutor.execute(
            'malware_powershell_charcode',
            '72,101,108,108,111'
        );
        expect(result.output).toContain('Hello');
    });

    it('should validate recipe compatibility', () => {
        const recipe = {
            operations: [
                { op: 'From Base64', args: [] },
                { op: 'HTTP request', args: ['GET', 'http://example.com'] }
            ]
        };
        const validation = RecipeExecutor.validateRecipe(recipe);
        expect(validation.issues.length).toBeGreaterThan(0);
    });
});
```

## Integration with Existing CyberChef MCP

### Relationship to cyberchef_bake

The recipe system builds on top of `cyberchef_bake`:

```
cyberchef_recipe_run
        |
        v
    RecipeExecutor.execute()
        |
        v
    Load recipe operations from registry
        |
        v
    Call existing bake() function with operations
        |
        v
    Return formatted result
```

### Tool Discovery

When AI uses `cyberchef_search`, recipe tools should appear in results:

```javascript
// Extend search results to include recipes
const searchResults = {
    operations: [...],  // Existing CyberChef operations
    recipes: [
        {
            tool: 'cyberchef_recipe_run',
            recipe_id: 'malware_powershell_charcode',
            name: 'PowerShell CharCode Deobfuscation',
            description: '...'
        }
    ]
};
```

## Timeline

| Task | Duration | Dependencies |
|------|----------|--------------|
| Create recipe JSON files | 0.5 days | None |
| Implement RecipeRegistry | 0.5 days | JSON files |
| Implement RecipeExecutor | 0.25 days | Registry |
| Create MCP handlers | 0.25 days | Executor |
| Write tests | 0.5 days | All above |

**Total: 2 days**

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Operation incompatibility | Medium | Medium | Compatibility validation |
| Recipe execution failures | Low | Low | Error handling, fallback |
| Large recipe library size | Low | Low | Lazy loading |

## Success Criteria

1. 60+ recipes curated and categorized
2. All 4 MCP tools implemented
3. 90%+ recipe compatibility with Node.js API
4. Search returns relevant results
5. Execution matches web CyberChef behavior

## Future Enhancements

1. **User-Defined Recipes**: Allow saving custom recipes
2. **Recipe Sharing**: Export/import recipe definitions
3. **Recipe Versioning**: Track recipe updates
4. **Usage Analytics**: Track most-used recipes
5. **Auto-Suggest**: Recommend recipes based on input patterns

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-17
**Phase:** 2 (JavaScript Native)
