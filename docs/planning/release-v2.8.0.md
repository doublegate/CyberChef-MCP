# Release Plan: v2.8.0 - AI-Native Features

**Release Date:** May 2027
**Theme:** LLM-Powered Operation Discovery and Recipe Generation
**Phase:** Phase 6 - Evolution
**Effort:** XL (6 weeks)
**Risk Level:** High

## Overview

v2.8.0 introduces AI-native features that leverage LLM capabilities to enhance the CyberChef MCP experience. Since AI assistants are the primary consumers of MCP servers, this release adds features specifically designed to work with LLM function calling patterns.

## Goals

1. **Primary Goal**: Natural language to recipe translation
2. **Secondary Goal**: Context-aware operation suggestions
3. **Tertiary Goal**: Intelligent error correction

## Success Criteria

- [ ] Recipe generation accuracy: >80% correct
- [ ] Operation suggestion relevance: >90%
- [ ] Error suggestion helpfulness: >70% user acceptance
- [ ] Feature adoption: 30% of users within 3 months
- [ ] Performance: <500ms for suggestions

## Features

### 1. Natural Language to Recipe Translation
**Priority:** P0 | **Effort:** XL

Convert natural language descriptions to executable recipes.

**Tasks:**
- [ ] Design NL-to-recipe prompt templates
- [ ] Create operation knowledge base
- [ ] Implement recipe validation
- [ ] Add confidence scoring
- [ ] Create fallback mechanisms
- [ ] Build example library

**Example:**
```
User: "Decode this base64, then decompress it, and extract any URLs"

Generated Recipe:
[
  { "op": "From Base64" },
  { "op": "Gunzip" },
  { "op": "Extract URLs" }
]
```

**Implementation Approach:**
```javascript
const nlToRecipe = {
  // Tool exposed via MCP
  name: "cyberchef_create_recipe_from_description",
  description: "Convert a natural language description to a CyberChef recipe",
  arguments: {
    description: "string",
    inputSample: "string (optional)",
    expectedOutput: "string (optional)"
  },
  execute: async (args) => {
    // Use operation knowledge base
    // Match intent to operations
    // Build and validate recipe
    // Return with confidence score
  }
};
```

### 2. Context-Aware Operation Suggestions
**Priority:** P0 | **Effort:** L

Suggest relevant operations based on input context.

**Tasks:**
- [ ] Implement input analysis
- [ ] Create operation similarity matching
- [ ] Add context from previous operations
- [ ] Build suggestion ranking
- [ ] Add personalization (optional)
- [ ] Measure suggestion quality

**Suggestion Triggers:**
| Input Pattern | Suggested Operations |
|---------------|---------------------|
| Base64-like string | From Base64, To Base64 |
| Hex string | From Hex, To Hex |
| JSON-like | JSON Beautify, Parse JSON |
| URL-encoded | URL Decode, URL Encode |
| Binary header (magic bytes) | Detect File Type, Extract Files |

**Tool:**
```javascript
{
  name: "cyberchef_suggest_operations",
  description: "Get suggested operations based on input data",
  arguments: {
    input: "string or binary",
    context: "string (optional) - previous operations"
  },
  returns: [{
    operation: "string",
    confidence: "number 0-1",
    reason: "string"
  }]
}
```

### 3. Auto-Recipe Generation from Examples
**Priority:** P1 | **Effort:** L

Infer recipes from input/output pairs.

**Tasks:**
- [ ] Implement input/output comparison
- [ ] Create transformation detection
- [ ] Build operation chain inference
- [ ] Add multi-step detection
- [ ] Validate generated recipes
- [ ] Handle ambiguous cases

**Example:**
```
Input:  "Hello World"
Output: "SGVsbG8gV29ybGQ="

Inferred Recipe: [{ "op": "To Base64" }]
```

### 4. Operation Chaining Optimization
**Priority:** P1 | **Effort:** M

Optimize operation sequences for efficiency.

**Tasks:**
- [ ] Identify redundant operations
- [ ] Suggest operation reordering
- [ ] Detect common patterns
- [ ] Add performance estimates
- [ ] Create optimization rules

**Optimizations:**
| Pattern | Optimization |
|---------|--------------|
| Encode then decode (same) | Remove both |
| Multiple text replacements | Combine into one |
| Sequential compressions | Suggest single efficient |
| Redundant conversions | Simplify chain |

### 5. Intelligent Error Correction
**Priority:** P0 | **Effort:** M

Suggest fixes for operation errors.

**Tasks:**
- [ ] Categorize common errors
- [ ] Build error-to-fix mapping
- [ ] Add context-aware suggestions
- [ ] Implement fix validation
- [ ] Create explanation generation
- [ ] Measure fix success rate

**Error Categories:**
| Error Type | Suggested Fixes |
|------------|-----------------|
| Invalid Base64 | Check padding, remove non-b64 chars |
| JSON parse error | Validate JSON, escape characters |
| Decryption failed | Verify key/IV, check mode |
| Encoding mismatch | Suggest alternative encodings |
| Truncated data | Suggest complete input |

**Response Format:**
```json
{
  "error": "Invalid Base64 input at position 23",
  "suggestions": [
    {
      "fix": "Add padding (=)",
      "confidence": 0.9,
      "example": "SGVsbG8gV29ybGQ="
    },
    {
      "fix": "Remove non-Base64 character",
      "confidence": 0.7,
      "example": "Remove '%' at position 23"
    }
  ]
}
```

### 6. LLM-Powered Documentation
**Priority:** P2 | **Effort:** M

Enhanced operation documentation.

**Tasks:**
- [ ] Generate operation explanations
- [ ] Create usage examples
- [ ] Add related operations
- [ ] Build FAQ responses
- [ ] Create tutorial generation

**Enhanced Documentation:**
```javascript
{
  name: "cyberchef_explain_operation",
  description: "Get detailed explanation of an operation",
  arguments: {
    operation: "string",
    context: "string (optional) - use case"
  },
  returns: {
    explanation: "string",
    examples: ["..."],
    relatedOperations: ["..."],
    commonUseCases: ["..."]
  }
}
```

### 7. Recipe Explanation & Annotation
**Priority:** P1 | **Effort:** S

Explain what recipes do in natural language.

**Tasks:**
- [ ] Implement recipe analysis
- [ ] Generate step-by-step explanations
- [ ] Add data flow descriptions
- [ ] Create visual representation hints
- [ ] Handle complex nested recipes

**Tool:**
```javascript
{
  name: "cyberchef_explain_recipe",
  arguments: {
    recipe: "Recipe[]"
  },
  returns: {
    summary: "This recipe decodes base64, decompresses, and finds URLs",
    steps: [
      "1. From Base64: Decodes base64 encoded text to binary",
      "2. Gunzip: Decompresses gzip compressed data",
      "3. Extract URLs: Finds all URL patterns in the text"
    ],
    dataFlow: "text -> binary -> text -> url list"
  }
}
```

## Technical Design

### Architecture

```
+-------------------+
| MCP Request       |
+-------------------+
        |
+-------------------+
| AI Feature Layer  |
| - NL Parser       |
| - Suggestion Eng  |
| - Error Analyzer  |
+-------------------+
        |
+-------------------+
| Operation KB      |
| - Descriptions    |
| - Patterns        |
| - Examples        |
+-------------------+
        |
+-------------------+
| CyberChef Core    |
+-------------------+
```

### Knowledge Base Schema

```json
{
  "operations": {
    "to_base64": {
      "name": "To Base64",
      "description": "Converts data to Base64 encoding",
      "category": "Encoding",
      "inputPatterns": ["text", "binary"],
      "outputPattern": "base64",
      "keywords": ["encode", "base64", "convert"],
      "commonUseCases": [
        "Encode binary for text transmission",
        "Create data URLs"
      ],
      "relatedOps": ["from_base64", "to_hex"],
      "examples": [
        { "input": "Hello", "output": "SGVsbG8=" }
      ]
    }
  }
}
```

### NL Processing Pipeline

```
Natural Language Input
        |
        v
+------------------+
| Intent Detection |
| - Encode/Decode  |
| - Compress       |
| - Encrypt        |
+------------------+
        |
        v
+------------------+
| Entity Extract   |
| - Data types     |
| - Algorithms     |
| - Parameters     |
+------------------+
        |
        v
+------------------+
| Operation Match  |
| - Fuzzy match    |
| - Semantic sim   |
+------------------+
        |
        v
+------------------+
| Recipe Build     |
| - Order ops      |
| - Fill params    |
+------------------+
        |
        v
+------------------+
| Validation       |
| - Test run       |
| - Confidence     |
+------------------+
```

## Implementation Plan

### Week 1-2: NL to Recipe
- [ ] Intent detection
- [ ] Operation matching
- [ ] Recipe building
- [ ] Validation

### Week 3: Suggestions & Examples
- [ ] Input analysis
- [ ] Suggestion engine
- [ ] Example inference
- [ ] Testing

### Week 4: Error Correction
- [ ] Error categorization
- [ ] Fix suggestions
- [ ] Validation
- [ ] Documentation

### Week 5-6: Documentation & Polish
- [ ] Enhanced docs
- [ ] Recipe explanation
- [ ] Integration testing
- [ ] Performance tuning

## Dependencies

### Required
- Operation knowledge base (new)
- Pattern matching library
- Fuzzy string matching

### Optional
- External LLM API (for complex cases)
- Vector embedding database (for semantic search)

## Configuration

```json
{
  "aiFeatures": {
    "enabled": true,
    "naturalLanguage": {
      "enabled": true,
      "minConfidence": 0.7
    },
    "suggestions": {
      "enabled": true,
      "maxSuggestions": 5
    },
    "errorCorrection": {
      "enabled": true
    },
    "externalLLM": {
      "enabled": false,
      "provider": "openai",
      "model": "gpt-4o-mini"
    }
  }
}
```

## Testing Requirements

### Quality Tests
- [ ] Recipe generation accuracy
- [ ] Suggestion relevance
- [ ] Error fix success rate

### Performance Tests
- [ ] Response time (<500ms)
- [ ] Memory impact
- [ ] Scaling behavior

### Edge Cases
- [ ] Ambiguous inputs
- [ ] Multi-language support
- [ ] Complex recipes

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Low accuracy | Confidence thresholds, fallbacks |
| Hallucinations | Validation, known operation sets |
| Performance | Caching, local processing priority |
| User expectations | Clear confidence communication |

## Documentation Updates

- [ ] AI features guide
- [ ] NL recipe examples
- [ ] Suggestion system reference
- [ ] Error correction patterns
- [ ] Best practices

## GitHub Milestone

Create milestone: `v2.8.0 - AI-Native Features`

**Issues:**
1. Implement NL to Recipe Translation (P0, XL)
2. Add Context-Aware Suggestions (P0, L)
3. Create Auto-Recipe from Examples (P1, L)
4. Add Operation Chaining Optimization (P1, M)
5. Implement Intelligent Error Correction (P0, M)
6. Add LLM-Powered Documentation (P2, M)
7. Implement Recipe Explanation (P1, S)
8. Build Operation Knowledge Base (P0, L)
9. Quality Testing & Validation (P0, L)
10. Documentation & Examples (P0, M)

---

**Last Updated:** December 2025
**Status:** Planning
**Next Review:** April 2027
