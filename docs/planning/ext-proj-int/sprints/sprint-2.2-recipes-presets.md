# Sprint 2.2: Recipe Presets

## Sprint Overview

| Field | Value |
|-------|-------|
| Sprint | 2.2 |
| Phase | 2 - JavaScript Native |
| Duration | 2 weeks |
| Start | Week 7 |
| End | Week 8 |

## Objectives

1. Implement recipe preset system
2. Port community recipes from cyberchef-recipes
3. Create recipe discovery and execution tools
4. Enable recipe-based workflow automation

## User Stories

### US-2.2.1: Recipe Registry

**As a** user
**I want** a catalog of pre-built analysis recipes
**So that** I can quickly apply common transformations

**Acceptance Criteria:**
- [ ] Recipe storage and indexing
- [ ] Category organization
- [ ] Tag-based discovery
- [ ] Recipe metadata (author, description, use case)

### US-2.2.2: Recipe Execution

**As a** analyst
**I want** to execute recipes through MCP
**So that** AI assistants can apply complex transformations

**Acceptance Criteria:**
- [ ] Execute recipe by name
- [ ] Parameter customization
- [ ] Partial recipe execution
- [ ] Error handling per operation

### US-2.2.3: Malware Analysis Recipes

**As a** malware analyst
**I want** pre-built recipes for common malware patterns
**So that** I can quickly deobfuscate samples

**Acceptance Criteria:**
- [ ] PowerShell deobfuscation
- [ ] JavaScript unpacking
- [ ] VBA macro extraction
- [ ] Base64/XOR unwrapping chains

### US-2.2.4: CTF Recipes

**As a** CTF player
**I want** recipes for common CTF patterns
**So that** I can solve challenges faster

**Acceptance Criteria:**
- [ ] Flag extraction patterns
- [ ] Multi-encoding detection
- [ ] Common cipher chains
- [ ] Steganography workflows

## Tasks

### Recipe System (Day 1-4)

| ID | Task | Estimate | Assignee |
|----|------|----------|----------|
| T-2.2.1 | Design recipe format specification | 4h | - |
| T-2.2.2 | Implement RecipeRegistry class | 6h | - |
| T-2.2.3 | Implement RecipeExecutor class | 8h | - |
| T-2.2.4 | Create recipe validation | 4h | - |

### Recipe Porting (Day 5-8)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-2.2.5 | Port malware analysis recipes (10) | 8h | T-2.2.2 |
| T-2.2.6 | Port CTF recipes (10) | 6h | T-2.2.2 |
| T-2.2.7 | Port data extraction recipes (8) | 6h | T-2.2.2 |
| T-2.2.8 | Create recipe documentation | 4h | T-2.2.5-7 |

### MCP Integration (Day 9-10)

| ID | Task | Estimate | Depends On |
|----|------|----------|------------|
| T-2.2.9 | Create recipe list tool | 3h | T-2.2.2 |
| T-2.2.10 | Create recipe search tool | 3h | T-2.2.2 |
| T-2.2.11 | Create recipe run tool | 4h | T-2.2.3 |
| T-2.2.12 | Create recipe info tool | 2h | T-2.2.2 |
| T-2.2.13 | Write tests | 6h | T-2.2.9-12 |

## Deliverables

### Files to Create

```
src/node/tools/
├── recipes/
│   ├── index.mjs           # Module exports
│   ├── registry.mjs        # RecipeRegistry class
│   ├── executor.mjs        # RecipeExecutor class
│   ├── validator.mjs       # Recipe validation
│   ├── register.mjs        # Tool registration
│   └── presets/
│       ├── malware/
│       │   ├── powershell.mjs
│       │   ├── javascript.mjs
│       │   └── vba.mjs
│       ├── ctf/
│       │   ├── encoding-chains.mjs
│       │   └── flag-patterns.mjs
│       └── data/
│           ├── extraction.mjs
│           └── transformation.mjs
```

### Code Specifications

#### Recipe Format

```javascript
/**
 * Recipe specification format
 */
const RecipeSchema = {
    name: 'string',           // Unique identifier
    title: 'string',          // Human-readable title
    description: 'string',    // Detailed description
    category: 'string',       // Primary category
    tags: ['string'],         // Search tags
    author: 'string',         // Recipe author
    version: 'string',        // Recipe version
    operations: [             // CyberChef operations
        {
            op: 'string',     // Operation name
            args: ['any'],    // Operation arguments
            disabled: false   // Skip this operation
        }
    ],
    metadata: {
        useCase: 'string',    // When to use
        examples: ['string'], // Example inputs
        references: ['string'] // Related resources
    }
};
```

#### RecipeRegistry (registry.mjs)

```javascript
/**
 * Registry for recipe presets
 */
export class RecipeRegistry {
    #recipes = new Map();
    #categories = new Map();
    #tags = new Map();

    /**
     * Register a recipe
     */
    register(recipe) {
        this.validate(recipe);

        this.#recipes.set(recipe.name, recipe);
        this.#addToCategory(recipe.category, recipe);
        this.#addToTags(recipe.tags, recipe);
    }

    /**
     * Get recipe by name
     */
    get(name) {
        return this.#recipes.get(name);
    }

    /**
     * List all recipes
     */
    list(options = {}) {
        let recipes = [...this.#recipes.values()];

        if (options.category) {
            recipes = recipes.filter(r => r.category === options.category);
        }

        if (options.tag) {
            recipes = recipes.filter(r => r.tags.includes(options.tag));
        }

        return recipes.map(r => ({
            name: r.name,
            title: r.title,
            description: r.description,
            category: r.category,
            tags: r.tags
        }));
    }

    /**
     * Search recipes by query
     */
    search(query, options = {}) {
        const lowerQuery = query.toLowerCase();
        const limit = options.limit || 10;

        const results = [];

        for (const recipe of this.#recipes.values()) {
            const score = this.#calculateScore(recipe, lowerQuery);
            if (score > 0) {
                results.push({ recipe, score });
            }
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(r => r.recipe);
    }

    /**
     * Get all categories
     */
    getCategories() {
        return [...this.#categories.keys()];
    }

    /**
     * Get all tags
     */
    getTags() {
        return [...this.#tags.keys()];
    }

    validate(recipe) {
        if (!recipe.name) throw new Error('Recipe must have name');
        if (!recipe.title) throw new Error('Recipe must have title');
        if (!recipe.operations?.length) throw new Error('Recipe must have operations');
        if (this.#recipes.has(recipe.name)) {
            throw new Error(`Recipe '${recipe.name}' already exists`);
        }
    }

    #calculateScore(recipe, query) {
        let score = 0;

        if (recipe.name.toLowerCase().includes(query)) score += 10;
        if (recipe.title.toLowerCase().includes(query)) score += 8;
        if (recipe.description.toLowerCase().includes(query)) score += 5;
        if (recipe.tags.some(t => t.toLowerCase().includes(query))) score += 3;

        return score;
    }

    #addToCategory(category, recipe) {
        if (!this.#categories.has(category)) {
            this.#categories.set(category, new Set());
        }
        this.#categories.get(category).add(recipe.name);
    }

    #addToTags(tags, recipe) {
        for (const tag of tags) {
            if (!this.#tags.has(tag)) {
                this.#tags.set(tag, new Set());
            }
            this.#tags.get(tag).add(recipe.name);
        }
    }
}
```

#### RecipeExecutor (executor.mjs)

```javascript
import { bake } from '../../index.mjs';

/**
 * Executes CyberChef recipes
 */
export class RecipeExecutor {
    constructor(registry) {
        this.registry = registry;
    }

    /**
     * Execute a recipe by name
     */
    async execute(recipeName, input, options = {}) {
        const recipe = this.registry.get(recipeName);
        if (!recipe) {
            throw new Error(`Recipe '${recipeName}' not found`);
        }

        return this.executeRecipe(recipe, input, options);
    }

    /**
     * Execute a recipe object
     */
    async executeRecipe(recipe, input, options = {}) {
        const startTime = performance.now();
        const results = [];

        let currentInput = input;
        const operations = options.operations || recipe.operations;

        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];

            if (op.disabled) {
                results.push({
                    operation: op.op,
                    skipped: true
                });
                continue;
            }

            try {
                const opStartTime = performance.now();
                const output = await this.executeOperation(op, currentInput);
                const opDuration = performance.now() - opStartTime;

                results.push({
                    operation: op.op,
                    success: true,
                    duration: opDuration,
                    inputLength: currentInput.length,
                    outputLength: output.length
                });

                currentInput = output;

            } catch (error) {
                results.push({
                    operation: op.op,
                    success: false,
                    error: error.message
                });

                if (!options.continueOnError) {
                    return {
                        success: false,
                        output: currentInput,
                        error: `Operation '${op.op}' failed: ${error.message}`,
                        steps: results,
                        duration: performance.now() - startTime
                    };
                }
            }
        }

        return {
            success: true,
            output: currentInput,
            steps: results,
            duration: performance.now() - startTime,
            recipe: recipe.name
        };
    }

    /**
     * Execute a single operation
     */
    async executeOperation(op, input) {
        const result = await bake(input, [{
            op: op.op,
            args: op.args || []
        }]);

        return result.toString();
    }
}
```

#### Malware Recipe Example (powershell.mjs)

```javascript
/**
 * PowerShell deobfuscation recipes
 */

export const POWERSHELL_CHARCODE = {
    name: 'powershell_charcode',
    title: 'PowerShell CharCode Deobfuscation',
    description: 'Decode PowerShell using [char] array concatenation',
    category: 'malware',
    tags: ['powershell', 'deobfuscation', 'charcode', 'malware'],
    author: 'cyberchef-recipes',
    version: '1.0.0',
    operations: [
        {
            op: 'Find / Replace',
            args: [{ option: 'Regex', string: "'\\+" }, '', true, false, true, false]
        },
        {
            op: 'Find / Replace',
            args: [{ option: 'Regex', string: '\\[char\\]' }, '', true, false, true, false]
        },
        {
            op: 'From Charcode',
            args: ['Space', 10]
        }
    ],
    metadata: {
        useCase: 'Decode PowerShell scripts that use [char] concatenation for obfuscation',
        examples: [
            "[char]72+[char]101+[char]108+[char]108+[char]111"
        ],
        references: [
            'https://github.com/mattnotmax/cyberchef-recipes#recipe-6---from-charcode'
        ]
    }
};

export const POWERSHELL_BASE64_GZIP = {
    name: 'powershell_base64_gzip',
    title: 'PowerShell Base64 + Gzip Decode',
    description: 'Decode PowerShell with Base64-encoded Gzip-compressed payload',
    category: 'malware',
    tags: ['powershell', 'deobfuscation', 'base64', 'gzip', 'malware'],
    author: 'cyberchef-recipes',
    version: '1.0.0',
    operations: [
        {
            op: 'Regular expression',
            args: ['User defined', "\\(\\'\\'([A-Za-z0-9+/=]+)\\'\\)", true, true, false, false, false, false, 'List capture groups']
        },
        {
            op: 'From Base64',
            args: ['A-Za-z0-9+/=', true]
        },
        {
            op: 'Gunzip',
            args: []
        }
    ],
    metadata: {
        useCase: 'Decode PowerShell scripts with compressed Base64 payloads',
        examples: [],
        references: [
            'https://github.com/mattnotmax/cyberchef-recipes#recipe-8---gzip-compression'
        ]
    }
};

export const POWERSHELL_SECURESTRING = {
    name: 'powershell_securestring',
    title: 'PowerShell SecureString Decode',
    description: 'Decode PowerShell SecureString to plaintext',
    category: 'malware',
    tags: ['powershell', 'deobfuscation', 'securestring', 'malware'],
    author: 'cyberchef-recipes',
    version: '1.0.0',
    operations: [
        {
            op: 'From Hex',
            args: ['Auto']
        },
        {
            op: 'Decode text',
            args: ['UTF-16LE (1200)']
        }
    ],
    metadata: {
        useCase: 'Decode PowerShell SecureString hex data to plaintext',
        examples: [],
        references: []
    }
};
```

### MCP Tools Registered

| Tool Name | Description |
|-----------|-------------|
| `cyberchef_recipe_list` | List available recipes |
| `cyberchef_recipe_search` | Search recipes by query |
| `cyberchef_recipe_run` | Execute a recipe |
| `cyberchef_recipe_info` | Get detailed recipe information |

### Recipes Included

| Category | Recipes |
|----------|---------|
| Malware | powershell_charcode, powershell_base64_gzip, powershell_securestring, js_unescape, js_array_decode, vba_decode |
| CTF | multi_base64, rot13_chain, flag_extract, encoding_detect |
| Data | jwt_decode, url_decode_chain, html_entity_decode, unicode_escape |

## Definition of Done

- [ ] RecipeRegistry with 28+ recipes
- [ ] RecipeExecutor with error handling
- [ ] All 4 MCP tools implemented
- [ ] Unit tests with > 85% coverage
- [ ] Integration tests passing
- [ ] Recipe documentation complete

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| CyberChef operation changes | Medium | Low | Pin operation names, version docs |
| Complex recipe failures | Medium | Medium | Detailed error per operation |
| Recipe format evolution | Low | Medium | Version field, migration support |

## Dependencies

### External

- None (uses existing CyberChef operations)

### Internal

- Sprint 1.1 (ToolRegistry)
- CyberChef Node API (bake function)

## Notes

- Recipes are JSON-compatible for easy sharing
- Focus on high-value malware analysis recipes first
- Community contributions welcome post-release

---

**Sprint Version:** 1.0.0
**Created:** 2025-12-17
