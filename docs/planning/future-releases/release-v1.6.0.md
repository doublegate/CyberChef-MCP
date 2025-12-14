# Release Plan: v1.6.0 - Recipe Management

**Release Date:** May 2026 (Target: Week of May 19)
**Theme:** Recipe Management & Sharing
**Phase:** Phase 2 - Enhancement
**Effort:** XL (3-4 weeks)
**Risk Level:** Medium

## Overview

Implement comprehensive recipe management system allowing users to save, load, share, and version CyberChef operation chains. This transforms the MCP server from individual tool execution into a workflow automation platform.

## Goals

1. **Primary Goal**: Save and load multi-operation recipes
2. **Secondary Goal**: Share recipes via URLs or exports
3. **Tertiary Goal**: Build community recipe library

## Success Criteria

- [ ] Recipe CRUD operations implemented
- [ ] Recipe validation and versioning working
- [ ] Import/export functionality complete
- [ ] Recipe library with 20+ examples
- [ ] Documentation with recipe examples

## Features & Improvements

### 1. Recipe Storage & Management
**Priority:** P0 | **Effort:** L (8 days)

Implement recipe storage, versioning, and CRUD operations.

**Schema:**
```javascript
{
  "id": "uuid-v4",
  "name": "Decrypt and Decode JWT",
  "description": "Decode Base64, parse JSON, extract claims",
  "version": "1.0.0",
  "author": "user@example.com",
  "created": "2026-05-01T00:00:00Z",
  "updated": "2026-05-15T12:00:00Z",
  "tags": ["jwt", "crypto", "decode"],
  "operations": [
    {
      "op": "From Base64",
      "args": { "alphabet": "URL safe" }
    },
    {
      "op": "JSON Parse",
      "args": {}
    }
  ],
  "metadata": {
    "complexity": "medium",
    "estimatedTime": "100ms",
    "requiredArgs": ["input"]
  }
}
```

**New MCP Tools:**
- `cyberchef_recipe_create` - Save new recipe
- `cyberchef_recipe_get` - Load recipe by ID
- `cyberchef_recipe_list` - List all recipes (with filters)
- `cyberchef_recipe_update` - Update existing recipe
- `cyberchef_recipe_delete` - Delete recipe
- `cyberchef_recipe_execute` - Execute saved recipe

**Tasks:**
- [ ] Design recipe schema with validation
- [ ] Implement SQLite storage backend
- [ ] Create CRUD MCP tools
- [ ] Add recipe versioning support
- [ ] Implement recipe search/filtering

**Acceptance Criteria:**
- Recipes persist across restarts
- CRUD operations work correctly
- Schema validation prevents invalid recipes
- Versioning tracks changes

---

### 2. Recipe Import/Export
**Priority:** P0 | **Effort:** M (5 days)

Support importing/exporting recipes in multiple formats.

**Formats:**
- JSON (native format)
- CyberChef recipe format (compatibility)
- YAML (human-readable)
- URL-encoded (shareable links)

**New MCP Tools:**
- `cyberchef_recipe_export` - Export to JSON/YAML/URL
- `cyberchef_recipe_import` - Import from various formats

**Tasks:**
- [ ] Implement JSON export/import
- [ ] Add CyberChef recipe format support
- [ ] Create URL encoding for shareable links
- [ ] Add YAML support for readability
- [ ] Test round-trip (export → import)

---

### 3. Recipe Validation & Testing
**Priority:** P1 | **Effort:** M (6 days)

Validate recipes before execution and provide testing framework.

**Validation:**
- Required arguments present
- Operation names valid
- Argument types match schema
- No circular dependencies
- Complexity within limits

**New MCP Tools:**
- `cyberchef_recipe_validate` - Validate recipe structure
- `cyberchef_recipe_test` - Test recipe with sample inputs

**Tasks:**
- [ ] Implement recipe validator
- [ ] Add dry-run execution mode
- [ ] Create test case system for recipes
- [ ] Add complexity estimation
- [ ] Implement safety checks

---

### 4. Recipe Library & Examples
**Priority:** P1 | **Effort:** M (5 days)

Build curated library of common recipes.

**Categories:**
- Cryptography (encryption, hashing, signing)
- Encoding (Base64, Hex, URL encoding)
- Data Extraction (JSON, XML, regex)
- Forensics (file analysis, data carving)
- Networking (IP manipulation, DNS)

**Tasks:**
- [ ] Create 20+ example recipes
- [ ] Add recipe documentation
- [ ] Implement recipe search
- [ ] Add recipe ratings/popularity
- [ ] Create recipe submission process

---

### 5. Recipe Composition & Chaining
**Priority:** P2 | **Effort:** M (4 days)

Allow recipes to reference other recipes.

**Implementation:**
```javascript
{
  "name": "Decrypt and Parse",
  "operations": [
    { "recipe": "decrypt-aes-256" },  // Reference to saved recipe
    { "op": "JSON Parse", "args": {} }
  ]
}
```

**Tasks:**
- [ ] Support recipe references
- [ ] Implement recipe resolution
- [ ] Detect circular dependencies
- [ ] Add recipe composition docs

---

## Breaking Changes

None. New features are additive.

## Dependencies

- SQLite or JSON file storage
- UUID library (crypto.randomUUID)
- js-yaml (YAML support)

## Testing Requirements

- [ ] Recipe CRUD operations
- [ ] Import/export round-trips
- [ ] Validation catches errors
- [ ] Recipe execution works
- [ ] Storage persists correctly

## Documentation Updates

- [ ] Recipe management guide
- [ ] Recipe schema documentation
- [ ] Recipe library index
- [ ] Import/export examples
- [ ] Recipe composition tutorial

## Migration Guide

No migration required. New optional feature.

**Getting Started:**
1. Create first recipe: `cyberchef_recipe_create`
2. Execute saved recipe: `cyberchef_recipe_execute`
3. Share recipe: `cyberchef_recipe_export`

## Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| Week 1 | Storage & CRUD | Recipe persistence working |
| Week 2 | Import/export | Multiple formats supported |
| Week 3 | Validation & library | Validated recipes, examples |
| Week 4 | Polish & docs | Complete documentation |

## Related Documents

- [Phase 2: Enhancement](./phase-2-enhancement.md)
- [v1.5.0 Release Plan](./release-v1.5.0.md)
- [v1.7.0 Release Plan](./release-v1.7.0.md)

## GitHub Milestone

Create milestone: `v1.6.0 - Recipe Management`

**Issues:**
1. Implement Recipe Storage & CRUD (P0, L)
2. Add Import/Export Functionality (P0, M)
3. Create Recipe Validation (P1, M)
4. Build Recipe Library (P1, M)
5. Support Recipe Composition (P2, M)
6. Add Recipe Documentation (P1, M)

---

**Last Updated:** December 2025
**Status:** Planning
