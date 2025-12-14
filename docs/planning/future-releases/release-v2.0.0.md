# Release Plan: v2.0.0 - Major Release

**Release Date:** September 2026 (Target: Week of Sep 8)
**Theme:** Major Release with Breaking Changes & API Stabilization
**Phase:** Phase 3 - Maturity
**Effort:** XL (3-4 weeks)
**Risk Level:** High

## Overview

Major version release introducing breaking changes announced in v1.8.0. This release establishes a stable, production-ready API contract for long-term maintenance and sets the architectural foundation for future development.

## Goals

1. **Primary Goal**: Deploy all announced breaking changes
2. **Secondary Goal**: Establish stable API contract (no breaking changes until v3.0.0)
3. **Tertiary Goal**: Achieve production-ready status for enterprise deployments

## Success Criteria

- [ ] All breaking changes from v1.8.0 implemented
- [ ] Zero critical/high CVEs in container image
- [ ] API contract documented and frozen
- [ ] Migration success rate >95%
- [ ] v1.x deprecation period begins (6 months security fixes)

## Breaking Changes Summary

### 1. Tool Naming Convention
**Priority:** P0 | **Impact:** High

Simplify tool naming for better discoverability.

**Changes:**
| v1.x Name | v2.0.0 Name | Notes |
|-----------|-------------|-------|
| `cyberchef_to_base64` | `base64_encode` | Prefix removal optional |
| `cyberchef_from_base64` | `base64_decode` | |
| `cyberchef_aes_encrypt` | `aes_encrypt` | |
| `cyberchef_sha256` | `sha256` | |
| `cyberchef_bake` | `bake` or `cyberchef_bake` | Both supported |

**Configuration:**
```javascript
// v2.0.0 supports both naming conventions
{
  "toolNaming": "simplified"  // default, uses short names
  // or "legacy" to use cyberchef_ prefix
}
```

**Migration:**
- Automated via `npx cyberchef-migrate`
- Compatibility mode supports both conventions
- Legacy names emit deprecation warnings (removable in v3.0.0)

---

### 2. Enhanced Recipe Schema
**Priority:** P0 | **Impact:** High

Improved recipe schema with Zod v4 validation.

**v1.x Schema:**
```json
{
  "op": "To Base64",
  "args": ["A-Za-z0-9+/="]
}
```

**v2.0.0 Schema:**
```json
{
  "operation": "base64_encode",
  "arguments": {
    "alphabet": "A-Za-z0-9+/="
  },
  "metadata": {
    "version": "2.0.0",
    "id": "uuid"
  }
}
```

**Key Changes:**
- `op` becomes `operation` (consistent naming)
- `args` array becomes `arguments` object (named parameters)
- Required `metadata` section for tracking
- Full Zod v4 runtime validation

**Migration:**
```javascript
// Automatic transformation
const v2Recipe = migrateRecipe(v1Recipe);
```

---

### 3. Structured Error Responses
**Priority:** P0 | **Impact:** Medium

Enhanced error responses with codes and context.

**v1.x Error:**
```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "Error: Invalid input" }]
}
```

**v2.0.0 Error:**
```json
{
  "isError": true,
  "error": {
    "code": "INVALID_INPUT",
    "message": "Input is not valid Base64",
    "context": {
      "operation": "base64_decode",
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
- `INVALID_INPUT` - Malformed input data
- `INVALID_ARGUMENTS` - Wrong argument types/values
- `OPERATION_FAILED` - Operation execution error
- `OPERATION_NOT_FOUND` - Unknown operation
- `TIMEOUT` - Operation exceeded time limit
- `MEMORY_LIMIT` - Memory limit exceeded
- `RATE_LIMITED` - Rate limit exceeded
- `VALIDATION_FAILED` - Schema validation error

---

### 4. Unified Configuration System
**Priority:** P1 | **Impact:** Medium

Replace scattered environment variables with unified config.

**v1.x Configuration:**
```bash
# Multiple env vars
LOG_LEVEL=info
ENABLE_RATE_LIMITING=true
RATE_LIMIT_REQUESTS=100
```

**v2.0.0 Configuration:**
```json
// cyberchef-mcp.config.json
{
  "$schema": "https://cyberchef-mcp.io/schema/config-v2.json",
  "version": "2.0.0",
  "logging": {
    "level": "info",
    "format": "json"
  },
  "rateLimiting": {
    "enabled": true,
    "requests": 100,
    "window": "1m"
  },
  "caching": {
    "enabled": true,
    "ttl": "5m",
    "maxSize": 500
  },
  "telemetry": {
    "enabled": false,
    "anonymize": true
  },
  "compatibility": {
    "legacyToolNames": false,
    "legacyRecipeFormat": false
  }
}
```

**Migration:**
```bash
# Migrate env vars to config file
npx cyberchef-migrate config --input .env --output cyberchef-mcp.config.json
```

---

### 5. MCP Protocol Update
**Priority:** P1 | **Impact:** Medium

Update to latest MCP specification.

**Changes:**
- Support for MCP 2026-xx-xx specification
- Enhanced streaming protocol
- Improved error reporting
- Better metadata handling

**SDK Update:**
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^2.0.0"
  }
}
```

---

### 6. Type System Enhancement
**Priority:** P1 | **Impact:** Low

Stricter typing with Zod v4.

**Changes:**
- All inputs validated at runtime
- Enhanced type inference
- Better error messages for type mismatches
- TypeScript types generated from schemas

---

## New Features

### 1. Production Readiness
- Container runs non-root by default
- Read-only filesystem
- SBOM attached to releases
- SLSA Level 3 compliance
- Zero known CVEs (target)

### 2. Enterprise Features
- Comprehensive telemetry (opt-in)
- Rate limiting and quotas
- Result caching
- Batch processing
- Recipe management

### 3. Developer Experience
- Improved error messages
- Progress reporting
- Structured logging
- Migration tools
- Extensive documentation

## Implementation Plan

### Week 1: Core Breaking Changes
- [ ] Implement new tool naming system
- [ ] Deploy enhanced recipe schema
- [ ] Update error response format
- [ ] Add Zod v4 validation

### Week 2: Configuration & Protocol
- [ ] Implement unified configuration
- [ ] Update to latest MCP SDK
- [ ] Migrate all settings

### Week 3: Testing & Documentation
- [ ] Comprehensive testing
- [ ] Documentation finalization
- [ ] Migration guide updates
- [ ] External user testing

### Week 4: Release
- [ ] Final security audit
- [ ] Performance benchmarking
- [ ] Release candidate testing
- [ ] Production release

## Dependencies

### Required
- v1.9.0 migration tools
- MCP SDK v2.0.0
- Zod v4
- Node.js 22 LTS

### Recommended
- Docker Hardened Images
- Trivy security scanning
- SBOM generation

## Testing Requirements

### Breaking Change Tests
- [ ] All tool naming changes work
- [ ] Recipe migration preserves semantics
- [ ] Error responses have correct format
- [ ] Configuration migration works

### Compatibility Tests
- [ ] Legacy mode supports v1.x APIs
- [ ] Migration tools handle all cases
- [ ] Rollback procedures work

### Production Tests
- [ ] Performance benchmarks pass
- [ ] Security scan clean
- [ ] Memory usage acceptable
- [ ] 100MB+ operations work

### Integration Tests
- [ ] MCP protocol compliance
- [ ] Client compatibility (Claude, etc.)
- [ ] Docker deployment works
- [ ] CI/CD pipelines pass

## Documentation Updates

- [ ] Complete API reference for v2.0.0
- [ ] Migration guide finalization
- [ ] Configuration documentation
- [ ] Error code reference
- [ ] Recipe schema documentation
- [ ] Changelog update
- [ ] Release notes
- [ ] Blog post (optional)

## Migration Guide

### For Users

**Recommended Migration Path:**
1. Upgrade to v1.9.0 first
2. Run `npx cyberchef-migrate validate` to identify issues
3. Run `npx cyberchef-migrate recipes` to transform recipes
4. Run `npx cyberchef-migrate config` to create new config
5. Test with v2.0.0-rc.1
6. Upgrade to v2.0.0
7. Monitor for deprecation warnings

**Quick Migration:**
```bash
# Backup current setup
cp -r ./recipes ./recipes-backup
cp .env .env.backup

# Run migration
npx cyberchef-migrate recipes --input ./recipes --output ./recipes
npx cyberchef-migrate config --input .env --output cyberchef-mcp.config.json

# Upgrade
docker pull ghcr.io/doublegate/cyberchef-mcp_v2:v2.0.0
```

### For Developers

**Client Code Changes:**
```javascript
// v1.x
const result = await client.callTool({
  name: 'cyberchef_to_base64',
  arguments: { input: 'Hello' }
});

// v2.0.0
const result = await client.callTool({
  name: 'base64_encode',  // or 'cyberchef_to_base64' in legacy mode
  arguments: { input: 'Hello' }
});

// Error handling
if (result.isError) {
  const error = result.error;
  console.log(`Error ${error.code}: ${error.message}`);
  console.log('Suggestions:', error.suggestions);
}
```

## Rollback Plan

If critical issues found post-release:

1. **Immediate**: Announce issue on GitHub, Twitter
2. **Short-term**: Advise users to use v1.9.0
3. **Medium-term**: Release v2.0.1 hotfix
4. **Last resort**: Unpublish v2.0.0 and extend v1.x support

**Rollback Steps:**
```bash
# Rollback to v1.9.0
docker pull ghcr.io/doublegate/cyberchef-mcp_v1:v1.9.0
docker tag ghcr.io/doublegate/cyberchef-mcp_v1:v1.9.0 cyberchef-mcp:latest

# Restore recipes (if migrated)
cp -r ./recipes-backup ./recipes
```

## LTS Policy

**v1.x Long-Term Support:**
- Security fixes: 6 months after v2.0.0 release (until March 2027)
- No new features
- No non-security bug fixes
- End of life: March 2027

**v2.x Long-Term Support:**
- Active support: Until v3.0.0 release
- Security fixes: 12 months after v3.0.0
- Target end of life: 2028

## Success Metrics

### Technical Metrics
- Migration success rate: >95%
- Zero critical/high CVEs
- Performance parity with v1.x
- Test coverage: >90%

### Adoption Metrics
- v2.0.0 adoption rate (60% in 3 months)
- Migration tool usage
- Support issue volume (low)
- User satisfaction (feedback)

## Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| Week 1 | Core breaking changes | Tool naming, recipe schema |
| Week 2 | Configuration & protocol | Unified config, MCP update |
| Week 3 | Testing & docs | Full testing, documentation |
| Week 4 | Release | Security audit, release |

## Related Documents

- [Phase 3: Maturity](./phase-3-maturity.md)
- [v1.8.0 Release Plan](./release-v1.8.0.md)
- [v1.9.0 Release Plan](./release-v1.9.0.md)
- [ROADMAP.md](../ROADMAP.md)
- [v2.0.0 Breaking Changes](../migration/breaking-changes.md)

## GitHub Milestone

Create milestone: `v2.0.0 - Major Release`

**Issues:**
1. Implement New Tool Naming System (P0, M)
2. Deploy Enhanced Recipe Schema (P0, L)
3. Update Error Response Format (P0, M)
4. Implement Unified Configuration (P1, M)
5. Update to MCP SDK v2.0.0 (P1, M)
6. Add Zod v4 Type System (P1, M)
7. Comprehensive Testing Suite (P0, L)
8. Complete v2.0.0 Documentation (P0, L)
9. Security Audit and Certification (P0, M)
10. Performance Benchmarking (P1, M)
11. Release and Announcement (P0, S)

---

**Last Updated:** December 2025
**Status:** Planning
**Next Review:** After v1.9.0 release
