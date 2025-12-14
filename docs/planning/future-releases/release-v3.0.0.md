# Release Plan: v3.0.0 - Major Release

**Release Date:** August 2027
**Theme:** Breaking Changes & API Evolution
**Phase:** Phase 6 - Evolution
**Effort:** XL (6 weeks)
**Risk Level:** High

## Overview

v3.0.0 is a major release introducing breaking changes that improve API design, performance, and maintainability. This release establishes a stable foundation for the next major version cycle, targeting support through 2029.

## Goals

1. **Primary Goal**: Deploy all breaking changes announced in v2.8.0-v2.9.0
2. **Secondary Goal**: Establish stable API contract (no breaking changes until v4.0.0)
3. **Tertiary Goal**: Achieve migration success rate >95%

## Success Criteria

- [ ] All breaking changes implemented
- [ ] Migration success rate >95%
- [ ] Zero critical bugs at launch
- [ ] v2.x LTS maintenance established
- [ ] User adoption: 80% within 6 months

## Breaking Changes

### 1. Tool Naming Convention
**Priority:** P0 | **Impact:** High

Simplified tool names without mandatory prefix.

**Changes:**
| v2.x Name | v3.0.0 Name | Notes |
|-----------|-------------|-------|
| `cyberchef_to_base64` | `to_base64` | Prefix removed by default |
| `cyberchef_from_base64` | `from_base64` | |
| `cyberchef_aes_encrypt` | `aes_encrypt` | |
| `cyberchef_bake` | `bake` | |
| `cyberchef_search` | `search` | |

**Configuration:**
```json
{
  "toolNaming": {
    "style": "simplified",  // or "legacy" for cyberchef_ prefix
    "prefix": ""  // custom prefix if desired
  }
}
```

### 2. Recipe Schema v2
**Priority:** P0 | **Impact:** High

Enhanced recipe format with named arguments.

**v2.x Format:**
```json
{
  "op": "To Base64",
  "args": ["A-Za-z0-9+/="]
}
```

**v3.0.0 Format:**
```json
{
  "operation": "to_base64",
  "arguments": {
    "alphabet": "A-Za-z0-9+/="
  },
  "metadata": {
    "version": "3.0.0",
    "id": "uuid"
  }
}
```

**Key Changes:**
- `op` -> `operation`
- `args` array -> `arguments` object
- Named parameters instead of positional
- Optional `metadata` section

### 3. Structured Error Responses
**Priority:** P0 | **Impact:** Medium

Rich error format with codes and suggestions.

**v3.0.0 Error Format:**
```json
{
  "isError": true,
  "error": {
    "code": "INVALID_INPUT",
    "message": "Input is not valid Base64",
    "context": {
      "operation": "from_base64",
      "inputPreview": "SGVsbG8...",
      "position": 5
    },
    "suggestions": [
      "Ensure input contains only Base64 characters",
      "Check for whitespace or newlines"
    ],
    "documentation": "https://docs.cyberchef-mcp.io/errors/INVALID_INPUT"
  },
  "content": [{ "type": "text", "text": "Error: Invalid input" }]
}
```

**Error Codes:**
| Code | Description |
|------|-------------|
| `INVALID_INPUT` | Malformed input data |
| `INVALID_ARGUMENTS` | Wrong argument types/values |
| `OPERATION_FAILED` | Operation execution error |
| `OPERATION_NOT_FOUND` | Unknown operation |
| `TIMEOUT` | Time limit exceeded |
| `MEMORY_LIMIT` | Memory limit exceeded |
| `RATE_LIMITED` | Rate limit exceeded |
| `VALIDATION_FAILED` | Schema validation error |
| `AUTHENTICATION_REQUIRED` | Auth required |
| `PERMISSION_DENIED` | Insufficient permissions |

### 4. Unified Configuration
**Priority:** P0 | **Impact:** Medium

Single configuration file instead of environment variables.

**Configuration File:** `cyberchef.config.json`
```json
{
  "$schema": "https://cyberchef-mcp.io/schema/config-v3.json",
  "version": "3.0.0",

  "server": {
    "name": "cyberchef-mcp",
    "port": 3000,
    "host": "0.0.0.0"
  },

  "security": {
    "authentication": { /* ... */ },
    "authorization": { /* ... */ },
    "rateLimit": { /* ... */ }
  },

  "features": {
    "plugins": { /* ... */ },
    "aiFeatures": { /* ... */ }
  },

  "observability": {
    "traces": { /* ... */ },
    "metrics": { /* ... */ },
    "logging": { /* ... */ }
  }
}
```

### 5. Plugin API v2
**Priority:** P1 | **Impact:** Medium

Updated plugin interface.

**v3.0.0 Plugin Interface:**
```javascript
export default {
  name: "@cyberchef-plugins/example",
  version: "2.0.0",
  pluginApiVersion: "2.0.0",

  operations: [
    {
      name: "Custom Operation",
      module: "./CustomOperation.mjs",
      schema: {
        input: z.string(),
        output: z.string(),
        arguments: {
          param1: z.string().optional()
        }
      }
    }
  ],

  lifecycle: {
    onLoad: async (context) => { /* ... */ },
    onUnload: async (context) => { /* ... */ }
  }
};
```

### 6. MCP Protocol 2027
**Priority:** P1 | **Impact:** Medium

Update to latest MCP specification.

**Changes:**
- Updated SDK to v3.x
- New protocol features
- Enhanced streaming
- Improved resource handling

## New Features

### 1. API v3 Improvements
- Consistent naming conventions
- Enhanced type safety with Zod v4
- Better error context
- Improved documentation generation

### 2. Performance Improvements
- Optimized operation dispatch
- Reduced memory footprint
- Faster startup
- Better caching

### 3. Developer Experience
- Improved error messages
- Better debugging support
- Enhanced documentation
- Migration tooling

## Implementation Plan

### Week 1: Core Breaking Changes
- [ ] Tool naming system
- [ ] Recipe schema v2
- [ ] Error response format
- [ ] Remove deprecated APIs

### Week 2: Configuration & Plugin
- [ ] Unified configuration
- [ ] Plugin API v2
- [ ] Migration of internal plugins
- [ ] Configuration validation

### Week 3: Protocol & SDK
- [ ] MCP SDK v3 integration
- [ ] Protocol compatibility
- [ ] Transport updates
- [ ] Feature flags removal

### Week 4: Testing
- [ ] Comprehensive testing
- [ ] Migration testing
- [ ] Performance testing
- [ ] Security testing

### Week 5: Documentation
- [ ] API reference
- [ ] Migration guide finalization
- [ ] Configuration reference
- [ ] Changelog

### Week 6: Release
- [ ] Final security audit
- [ ] Release candidate validation
- [ ] Production release
- [ ] Announcement

## Migration Support

### Automated Migration
```bash
# Full migration
npx cyberchef-migrate --version 3.0.0

# Step-by-step
npx cyberchef-migrate recipes --input ./recipes --output ./recipes-v3
npx cyberchef-migrate config --input .env --output cyberchef.config.json
npx cyberchef-migrate plugins --input ./plugins --output ./plugins-v3
```

### Compatibility Mode
For gradual migration, v3.0.0 supports limited v2.x compatibility:

```json
{
  "compatibility": {
    "v2ToolNames": true,
    "v2RecipeFormat": true,
    "v2ErrorFormat": false
  }
}
```

**Note:** Compatibility mode is deprecated and will be removed in v4.0.0.

## Testing Requirements

### Breaking Change Tests
- [ ] All tool naming changes
- [ ] Recipe migration preservation
- [ ] Error response format
- [ ] Configuration migration
- [ ] Plugin API migration

### Compatibility Tests
- [ ] v2.x compatibility mode
- [ ] Migration tool accuracy
- [ ] Rollback functionality

### Production Tests
- [ ] Performance benchmarks
- [ ] Security audit
- [ ] Memory usage
- [ ] Scalability

### Client Compatibility
- [ ] Claude Desktop
- [ ] Cursor
- [ ] Continue
- [ ] Custom clients

## Documentation

### API Reference
- [ ] Complete operation reference
- [ ] Tool schema documentation
- [ ] Error code reference
- [ ] Configuration reference

### Migration
- [ ] Migration overview
- [ ] Breaking changes detail
- [ ] Step-by-step guides
- [ ] Troubleshooting

### Other
- [ ] Release notes
- [ ] Changelog
- [ ] Blog post
- [ ] Video walkthrough (optional)

## LTS Policy

### v2.x Support After v3.0.0
| Type | Duration |
|------|----------|
| Security fixes | 12 months (until Aug 2028) |
| Critical bugs | 6 months (until Feb 2028) |
| New features | None |
| End of life | August 2028 |

### v3.x Support
| Type | Duration |
|------|----------|
| Active support | Until v4.0.0 |
| Security fixes | 12 months after v4.0.0 |
| Target EOL | 2029 |

## Rollback Plan

If critical issues discovered:

### Immediate (Day 1-3)
1. Announce issue on GitHub
2. Advise downgrade to v2.9.0
3. Begin hotfix development

### Short-term (Week 1)
1. Release v3.0.1 hotfix
2. Update migration guidance
3. Communicate resolution

### Last Resort
1. Unpublish v3.0.0
2. Extend v2.x support
3. Re-plan v3.0.0 release

## Success Metrics

### Technical
- Migration success: >95%
- Zero critical bugs (first 30 days)
- Performance parity with v2.9.0

### Adoption
- 50% adoption in 3 months
- 80% adoption in 6 months
- Support issue rate <5% of users

### Quality
- User satisfaction NPS >60
- Documentation helpfulness >80%
- Migration tool rating >4.5/5

## Communication Plan

### Pre-Release
| When | What |
|------|------|
| -4 weeks | Announce release date |
| -2 weeks | Publish RC |
| -1 week | Final migration guide |
| -1 day | Release notes preview |

### Release Day
- GitHub release
- Blog post
- Social media
- Email to enterprise users
- Community forums

### Post-Release
| When | What |
|------|------|
| +1 week | First feedback summary |
| +2 weeks | v3.0.1 if needed |
| +1 month | Adoption metrics |
| +3 months | Retrospective |

## GitHub Milestone

Create milestone: `v3.0.0 - Major Release`

**Issues:**
1. Implement Tool Naming Changes (P0, M)
2. Deploy Recipe Schema v2 (P0, L)
3. Update Error Response Format (P0, M)
4. Implement Unified Configuration (P0, M)
5. Update Plugin API to v2 (P1, M)
6. Integrate MCP SDK v3 (P1, M)
7. Remove Deprecated APIs (P0, S)
8. Migration Testing Suite (P0, L)
9. Comprehensive Documentation (P0, L)
10. Security Audit (P0, M)
11. Performance Validation (P0, M)
12. Release & Announcement (P0, S)

---

**Last Updated:** December 2025
**Status:** Planning
**Next Review:** June 2027
