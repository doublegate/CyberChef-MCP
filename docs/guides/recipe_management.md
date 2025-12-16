# Recipe Management Guide

**Version:** 1.6.0
**Last Updated:** December 2025

## Overview

The CyberChef MCP Server's Recipe Management system allows you to save, organize, and reuse multi-operation workflows. This transforms the server from individual tool execution into a powerful workflow automation platform.

## Table of Contents

- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Recipe Structure](#recipe-structure)
- [MCP Tools Reference](#mcp-tools-reference)
- [Import/Export](#importexport)
- [Recipe Composition](#recipe-composition)
- [Recipe Library](#recipe-library)
- [Configuration](#configuration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Key Features

### Core Capabilities
- **Recipe CRUD**: Create, read, update, and delete recipes
- **Execution**: Execute saved recipes with input data
- **Validation**: Validate recipes before saving or executing
- **Testing**: Test recipes with sample inputs
- **Import/Export**: Share recipes in multiple formats (JSON, YAML, URL, CyberChef)
- **Composition**: Nest recipes within recipes for complex workflows
- **Library**: 25+ curated example recipes across 5 categories

### Storage
- **Backend**: JSON file-based storage with atomic writes
- **Caching**: In-memory cache for fast retrieval
- **Backup**: Automatic backup creation on each save
- **Versioning**: Semantic versioning for recipe updates
- **Limits**: Configurable limits for recipes, operations, and nesting depth

## Quick Start

### Creating Your First Recipe

```javascript
// Create a recipe to decode and parse JWT tokens
await client.callTool({
  name: 'cyberchef_recipe_create',
  arguments: {
    name: 'Decode JWT',
    description: 'Decode JWT token and beautify JSON',
    operations: [
      { op: 'JWT Decode', args: {} },
      { op: 'JSON Beautify', args: {} }
    ],
    tags: ['jwt', 'decode', 'json']
  }
});

// Response:
// {
//   "id": "550e8400-e29b-41d4-a716-446655440000",
//   "name": "Decode JWT",
//   "version": "1.0.0",
//   "created": "2025-12-16T10:00:00Z",
//   ...
// }
```

### Executing a Recipe

```javascript
// Execute the saved recipe
await client.callTool({
  name: 'cyberchef_recipe_execute',
  arguments: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    input: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});
```

### Listing Recipes

```javascript
// List all recipes
await client.callTool({
  name: 'cyberchef_recipe_list',
  arguments: {}
});

// List recipes with filtering
await client.callTool({
  name: 'cyberchef_recipe_list',
  arguments: {
    tag: 'crypto',
    category: 'cryptography',
    search: 'decrypt',
    limit: 10,
    offset: 0
  }
});
```

## Recipe Structure

### Recipe Schema

```javascript
{
  "id": "uuid-v4",                    // Auto-generated
  "name": "Recipe Name",              // Required, 1-200 chars
  "description": "Description",       // Optional, max 1000 chars
  "version": "1.0.0",                 // Auto-generated, semver
  "author": "user@example.com",       // Optional, email format
  "created": "2025-12-16T10:00:00Z",  // Auto-generated, ISO 8601
  "updated": "2025-12-16T10:00:00Z",  // Auto-generated, ISO 8601
  "tags": ["tag1", "tag2"],           // Optional, max 20 tags
  "operations": [                     // Required, 1-100 operations
    {
      "op": "Operation Name",         // CyberChef operation name
      "args": {                       // Operation arguments as object
        "key": "value"
      }
    }
  ],
  "metadata": {                       // Optional
    "complexity": "low|medium|high",  // Auto-estimated
    "estimatedTime": "100ms",
    "category": "crypto|encoding|data|forensics|networking"
  }
}
```

### Operation Format

Regular operation:
```javascript
{
  "op": "To Base64",
  "args": {
    "alphabet": "Standard"
  }
}
```

Recipe reference (composition):
```javascript
{
  "recipe": "uuid-of-another-recipe"
}
```

### Complexity Estimation

Recipes are automatically assigned a complexity level:

- **Low**: ≤3 operations, no CPU-intensive operations, no nested recipes
- **Medium**: 4-10 operations, 1-3 CPU-intensive operations, 1-2 nested recipes
- **High**: >10 operations, >3 CPU-intensive operations, or >2 nested recipes

CPU-intensive operations include: AES, RSA, DES, bcrypt, scrypt, compression, SHA hashing, etc.

## MCP Tools Reference

### `cyberchef_recipe_create`

Create a new recipe.

**Arguments:**
- `name` (string, required): Recipe name (1-200 chars)
- `description` (string, optional): Recipe description (max 1000 chars)
- `operations` (array, required): List of operations (1-100)
- `tags` (array, optional): Tags for categorization (max 20)
- `author` (string, optional): Author email
- `metadata` (object, optional): Additional metadata

**Returns:** Created recipe object with auto-generated ID, timestamps, and version.

**Example:**
```javascript
{
  name: 'Base64 to Hex',
  description: 'Decode Base64 and convert to hexadecimal',
  operations: [
    { op: 'From Base64', args: { alphabet: 'Standard' } },
    { op: 'To Hex', args: { delimiter: 'Space' } }
  ],
  tags: ['base64', 'hex', 'encoding'],
  metadata: { category: 'encoding' }
}
```

---

### `cyberchef_recipe_get`

Retrieve a recipe by ID.

**Arguments:**
- `id` (string, required): Recipe UUID

**Returns:** Recipe object

---

### `cyberchef_recipe_list`

List recipes with optional filtering.

**Arguments:**
- `tag` (string, optional): Filter by tag
- `category` (string, optional): Filter by metadata category
- `search` (string, optional): Search in name/description
- `limit` (number, optional): Maximum results (default: all)
- `offset` (number, optional): Pagination offset (default: 0)

**Returns:** Array of recipe objects

**Example:**
```javascript
{
  tag: 'crypto',
  category: 'cryptography',
  search: 'decrypt',
  limit: 10,
  offset: 0
}
```

---

### `cyberchef_recipe_update`

Update an existing recipe.

**Arguments:**
- `id` (string, required): Recipe UUID
- `name` (string, optional): New name
- `description` (string, optional): New description
- `operations` (array, optional): New operations
- `tags` (array, optional): New tags
- `metadata` (object, optional): New metadata

**Returns:** Updated recipe object with incremented version

**Notes:**
- Only specified fields are updated
- Version is automatically incremented (patch level)
- `updated` timestamp is refreshed

---

### `cyberchef_recipe_delete`

Delete a recipe by ID.

**Arguments:**
- `id` (string, required): Recipe UUID

**Returns:** Success confirmation

---

### `cyberchef_recipe_execute`

Execute a saved recipe with input data.

**Arguments:**
- `id` (string, required): Recipe UUID
- `input` (string, required): Input data to process

**Returns:** Execution result with output data

**Example:**
```javascript
{
  id: '550e8400-e29b-41d4-a716-446655440000',
  input: 'SGVsbG8gV29ybGQ='  // Base64 encoded "Hello World"
}
```

---

### `cyberchef_recipe_export`

Export a recipe to various formats.

**Arguments:**
- `id` (string, required): Recipe UUID
- `format` (string, required): Export format (`json`, `yaml`, `url`, `cyberchef`)

**Returns:** Exported recipe data as string

**Formats:**
- `json`: Native JSON format (pretty-printed)
- `yaml`: Human-readable YAML format
- `url`: Base64-encoded URL for sharing (`cyberchef://recipe?data=...`)
- `cyberchef`: CyberChef upstream format (operations array only)

---

### `cyberchef_recipe_import`

Import a recipe from various formats.

**Arguments:**
- `data` (string, required): Recipe data to import
- `format` (string, required): Import format (`json`, `yaml`, `url`, `cyberchef`)

**Returns:** Imported and saved recipe object

**Notes:**
- ID, created, and updated timestamps are regenerated
- Existing ID in import data is ignored
- CyberChef format imports get auto-generated name/description

---

### `cyberchef_recipe_validate`

Validate a recipe structure without saving.

**Arguments:**
- `recipe` (object, required): Recipe to validate

**Returns:** Validation result
```javascript
{
  valid: true|false,
  complexity: "low|medium|high",
  operationCount: 5,
  error: "...",      // if invalid
  details: {}        // error context
}
```

---

### `cyberchef_recipe_test`

Test a recipe with sample inputs.

**Arguments:**
- `recipe` (object, required): Recipe to test
- `testInputs` (array, required): Array of test input strings

**Returns:** Test results
```javascript
{
  totalTests: 3,
  passed: 2,
  failed: 1,
  results: [
    { input: "test1", output: "...", success: true },
    { input: "test2", output: "...", success: true },
    { input: "test3", error: "...", success: false }
  ]
}
```

## Import/Export

### Export Formats

#### JSON (Native)
```javascript
await client.callTool({
  name: 'cyberchef_recipe_export',
  arguments: { id: '...', format: 'json' }
});
```

Output: Pretty-printed JSON with full recipe structure.

#### YAML (Human-Readable)
```javascript
await client.callTool({
  name: 'cyberchef_recipe_export',
  arguments: { id: '...', format: 'yaml' }
});
```

Output: YAML format for easy editing and version control.

#### URL (Shareable)
```javascript
await client.callTool({
  name: 'cyberchef_recipe_export',
  arguments: { id: '...', format: 'url' }
});
```

Output: `cyberchef://recipe?data=eyJ...` (base64url-encoded)

#### CyberChef (Compatibility)
```javascript
await client.callTool({
  name: 'cyberchef_recipe_export',
  arguments: { id: '...', format: 'cyberchef' }
});
```

Output: Operations array compatible with upstream CyberChef.

### Import Formats

All export formats can be imported:

```javascript
await client.callTool({
  name: 'cyberchef_recipe_import',
  arguments: {
    data: '{"name": "...", "operations": [...]}',
    format: 'json'
  }
});
```

## Recipe Composition

### Nesting Recipes

Recipes can reference other recipes to create complex workflows:

```javascript
// Create a decryption recipe
const decryptRecipe = await client.callTool({
  name: 'cyberchef_recipe_create',
  arguments: {
    name: 'AES Decrypt',
    operations: [
      { op: 'AES Decrypt', args: { mode: 'CBC', key: '...', iv: '...' } }
    ]
  }
});

// Create a decompression recipe
const decompressRecipe = await client.callTool({
  name: 'cyberchef_recipe_create',
  arguments: {
    name: 'Gunzip',
    operations: [
      { op: 'Gunzip', args: {} }
    ]
  }
});

// Compose them into a master recipe
await client.callTool({
  name: 'cyberchef_recipe_create',
  arguments: {
    name: 'Decrypt and Decompress',
    operations: [
      { recipe: decryptRecipe.id },  // Reference by ID
      { recipe: decompressRecipe.id }
    ]
  }
});
```

### Circular Dependency Protection

The system automatically detects and prevents circular dependencies:

```javascript
// This will fail validation
Recipe A → Recipe B → Recipe C → Recipe A
```

Error message includes the circular path for debugging.

### Nesting Depth Limits

Default maximum depth: 5 levels (configurable with `CYBERCHEF_RECIPE_MAX_DEPTH`).

## Recipe Library

The server includes a curated library of 25+ example recipes across 5 categories:

### Cryptography (6 recipes)
- Decode and Parse JWT
- AES-256 Decrypt and Decompress
- Generate and Format RSA Keys
- Hash with Multiple Algorithms
- Generate TOTP Code
- PGP Encrypt and Armor

### Encoding (6 recipes)
- Base64 to Hex
- URL Decode and Parse
- HTML Entity Decode and Strip Tags
- Unicode Normalization and Escape
- Binary to Text (Multiple Formats)
- ROT13 and Base64

### Data Extraction (5 recipes)
- Extract JSON Paths
- XML to JSON
- Extract Emails and URLs
- CSV to JSON
- SQL Beautify and Minify

### Forensics (4 recipes)
- Extract File Metadata
- Extract Strings from Binary
- Entropy Analysis
- Hex Dump and Analysis

### Networking (5 recipes)
- Parse IPv4 and Expand
- IPv6 Expand and Compress
- Parse User-Agent
- HTTP Request Builder
- Defang and Refang URLs

### Accessing the Library

The library is stored in `src/node/recipes/recipe-library.json`. You can import these recipes:

```javascript
import recipeLibrary from './src/node/recipes/recipe-library.json' with {type: "json"};

// Import each recipe
for (const recipe of recipeLibrary.recipes) {
  await client.callTool({
    name: 'cyberchef_recipe_create',
    arguments: recipe
  });
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CYBERCHEF_RECIPE_STORAGE` | `./recipes.json` | Storage file path |
| `CYBERCHEF_RECIPE_MAX_COUNT` | `10000` | Maximum number of recipes |
| `CYBERCHEF_RECIPE_MAX_OPERATIONS` | `100` | Max operations per recipe |
| `CYBERCHEF_RECIPE_MAX_DEPTH` | `5` | Max nesting depth for composition |

### Docker Volume Persistence

For recipe persistence across container restarts:

```bash
docker run -i --rm \
  -v ./recipes.json:/app/recipes.json \
  cyberchef-mcp
```

## Best Practices

### Recipe Design

1. **Single Responsibility**: Each recipe should have one clear purpose
2. **Descriptive Names**: Use clear, descriptive names (e.g., "Decode JWT and Extract Claims")
3. **Tag Consistently**: Use consistent tags for easy filtering (e.g., "crypto", "encoding")
4. **Document**: Include descriptions explaining what the recipe does and why
5. **Test**: Use `cyberchef_recipe_test` before deploying

### Performance

1. **Limit Operations**: Keep recipes under 20 operations when possible
2. **Avoid Deep Nesting**: Limit composition depth to 2-3 levels
3. **Cache Results**: Frequently used recipes benefit from caching
4. **Complexity**: Monitor complexity levels; high-complexity recipes may timeout

### Organization

1. **Categories**: Use metadata.category for grouping
2. **Tags**: Apply relevant tags for multi-dimensional filtering
3. **Versioning**: Update version when making significant changes
4. **Backup**: Regularly backup recipes.json

### Security

1. **No Secrets**: Never store API keys, passwords, or secrets in recipes
2. **Validate Inputs**: Always validate and sanitize user inputs
3. **Access Control**: Store recipes.json with appropriate file permissions
4. **Audit**: Track recipe creation/updates via logs

## Troubleshooting

### Recipe Not Found

**Error:** `Recipe not found: <uuid>`

**Solutions:**
- Verify the UUID is correct
- Check if recipe was deleted
- List all recipes to find the correct ID

### Circular Dependency

**Error:** `Circular dependency detected`

**Solutions:**
- Review recipe references
- Break circular chains by creating intermediate recipes
- Simplify composition structure

### Operation Not Found

**Error:** `Invalid operation name: "<op>"`

**Solutions:**
- Use `cyberchef_search` to find correct operation names
- Check for typos in operation names
- Verify operation is available in CyberChef

### Recipe Storage Full

**Error:** `Recipe storage is full (maximum 10000 recipes)`

**Solutions:**
- Delete unused recipes
- Increase `CYBERCHEF_RECIPE_MAX_COUNT`
- Archive old recipes externally

### Max Depth Exceeded

**Error:** `Recipe nesting exceeds maximum depth of 5`

**Solutions:**
- Reduce nesting depth
- Flatten recipe structure
- Increase `CYBERCHEF_RECIPE_MAX_DEPTH` if necessary

### Validation Errors

**Error:** Various validation errors

**Solutions:**
- Use `cyberchef_recipe_validate` to identify issues
- Check operation arguments against schemas
- Verify all required fields are present
- Ensure data types match (e.g., number vs string)

### Storage File Corruption

**Error:** `Invalid storage file format`

**Solutions:**
- Restore from backup: `recipes.json.backup`
- Validate JSON syntax
- Check file permissions
- Re-initialize storage if necessary

## Support

For additional help:
- GitHub Issues: https://github.com/doublegate/CyberChef-MCP/issues
- Documentation: https://github.com/doublegate/CyberChef-MCP/tree/master/docs
- CyberChef Operations Reference: Use `cyberchef_search` tool

---

**Version:** 1.6.0
**Last Updated:** December 2025
