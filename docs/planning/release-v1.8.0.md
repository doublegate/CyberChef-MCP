# Release Plan: v1.8.0 - Breaking Changes Preparation

**Release Date:** July 2026 (Target: Week of Jul 14)
**Theme:** Breaking Changes Preparation & Deprecation Warnings
**Phase:** Phase 3 - Maturity
**Effort:** M (1-2 weeks)
**Risk Level:** High

## Overview

Prepare the codebase for v2.0.0 breaking changes by adding deprecation warnings, implementing compatibility shims, and providing migration previews. This release focuses on communication and preparation rather than new features.

## Goals

1. **Primary Goal**: Communicate all planned v2.0.0 breaking changes
2. **Secondary Goal**: Add deprecation warnings for affected APIs
3. **Tertiary Goal**: Provide migration preview tools

## Success Criteria

- [ ] All breaking changes documented with deprecation notices
- [ ] Deprecation warnings emitted at runtime
- [ ] Migration preview tool created
- [ ] v2.0.0 compatibility mode available (opt-in)
- [ ] User feedback mechanism in place

## Features & Improvements

### 1. Deprecation Warning System
**Priority:** P0 | **Effort:** M (5 days)

Implement runtime deprecation warnings for APIs changing in v2.0.0.

**Implementation:**
```javascript
const deprecationWarnings = new Set();

function emitDeprecation(code, message, alternative) {
  if (deprecationWarnings.has(code)) return;
  deprecationWarnings.add(code);

  console.warn(`[DEPRECATION] ${code}: ${message}`);
  console.warn(`  Alternative: ${alternative}`);
  console.warn(`  This will be removed in v2.0.0`);

  // Log to telemetry if enabled
  if (telemetryEnabled) {
    logDeprecationUsage(code);
  }
}

// Usage
emitDeprecation(
  'TOOL_NAMING_V1',
  'Tool names with cyberchef_ prefix will be simplified in v2.0.0',
  'Use the new naming convention: base64_encode instead of cyberchef_to_base64'
);
```

**Tasks:**
- [ ] Design deprecation warning system
- [ ] Identify all deprecated APIs
- [ ] Add deprecation warnings to affected code
- [ ] Configure warning suppression (for CI/CD)
- [ ] Document all deprecations

**Acceptance Criteria:**
- Warnings emitted on first use of deprecated API
- No duplicate warnings per session
- Suppressible via environment variable
- Logged to telemetry (if enabled)

**GitHub Issue Template:**
```markdown
## Feature: Implement Deprecation Warning System

### Description
Add runtime deprecation warnings for all APIs changing in v2.0.0 to give users advance notice and time to prepare.

### Deprecation Codes
- DEP001: Tool naming convention
- DEP002: Recipe schema format
- DEP003: Error response format
- DEP004: Configuration system
- DEP005: Legacy argument handling

### Tasks
- [ ] Create deprecation utility module
- [ ] Add warnings to affected code paths
- [ ] Implement suppression mechanism
- [ ] Add deprecation documentation
- [ ] Test warning behavior

### Success Criteria
- All deprecations warn at runtime
- Warnings are suppressible
- No performance impact
```

---

### 2. v2.0.0 Breaking Changes Documentation
**Priority:** P0 | **Effort:** M (4 days)

Create comprehensive documentation of all breaking changes.

**Breaking Changes to Document:**

1. **Tool Naming Convention**
   - Current: `cyberchef_to_base64`
   - v2.0.0: `base64_encode` (optional prefix removal)
   - Impact: Client code referencing tools by name

2. **Recipe Schema**
   - Current: Simple JSON structure
   - v2.0.0: Enhanced schema with Zod v4 validation
   - Impact: Stored recipes may need migration

3. **Error Response Format**
   - Current: Simple error message strings
   - v2.0.0: Structured error objects with codes
   - Impact: Error handling in client code

4. **Configuration System**
   - Current: Environment variables
   - v2.0.0: Unified configuration file + env vars
   - Impact: Deployment configurations

5. **MCP Protocol Version**
   - Current: MCP 2024-11-05
   - v2.0.0: MCP 2026-xx-xx (latest spec)
   - Impact: Client compatibility

**Tasks:**
- [ ] Document each breaking change in detail
- [ ] Create migration examples for each
- [ ] Add before/after comparisons
- [ ] Include rollback procedures
- [ ] Create FAQ section

---

### 3. Migration Preview Tool
**Priority:** P1 | **Effort:** M (5 days)

Create tool to preview v2.0.0 migration impact.

**Implementation:**
```javascript
// cyberchef_migration_preview tool
cyberchef_migration_preview({
  recipe: { /* current format recipe */ },
  mode: "analyze"  // or "transform"
})

// Output
{
  "compatible": false,
  "issues": [
    {
      "code": "SCHEMA_CHANGE",
      "location": "operations[0].args",
      "message": "Array args will change to object format",
      "severity": "breaking",
      "fix": "Convert args array to named object"
    }
  ],
  "transformed": { /* v2.0.0 format */ }
}
```

**Tasks:**
- [ ] Create migration analysis function
- [ ] Implement recipe transformation
- [ ] Add tool configuration analysis
- [ ] Create detailed migration reports
- [ ] Test with various recipe formats

**Acceptance Criteria:**
- Analyzes current recipes for v2.0.0 compatibility
- Provides actionable fix suggestions
- Can transform recipes to new format
- Reports all compatibility issues

---

### 4. v2.0.0 Compatibility Mode
**Priority:** P1 | **Effort:** M (4 days)

Opt-in preview of v2.0.0 behavior.

**Configuration:**
```bash
# Enable v2.0.0 compatibility mode
V2_COMPATIBILITY_MODE=true npm run mcp
```

**Behavior Changes in Compatibility Mode:**
- New tool naming convention active
- Enhanced error responses enabled
- New recipe schema enforced
- Deprecation warnings become errors

**Tasks:**
- [ ] Implement compatibility mode flag
- [ ] Add conditional behavior switching
- [ ] Test all operations in both modes
- [ ] Document compatibility mode usage
- [ ] Create compatibility test suite

**Acceptance Criteria:**
- Compatibility mode enables all v2.0.0 behaviors
- All tests pass in both modes
- Clear documentation of differences
- Easy to toggle on/off

---

### 5. User Feedback Collection
**Priority:** P2 | **Effort:** S (3 days)

Collect feedback on proposed breaking changes.

**Implementation:**
- GitHub Discussion for breaking changes
- In-repo feedback form
- Deprecation usage telemetry

**Tasks:**
- [ ] Create GitHub Discussion template
- [ ] Add feedback prompts to deprecation warnings
- [ ] Aggregate deprecation usage data
- [ ] Review and respond to feedback
- [ ] Adjust v2.0.0 plans based on feedback

---

## Breaking Changes

None. This release adds deprecation warnings only.

**Deprecation Notices:**
All APIs changing in v2.0.0 will emit warnings. See `docs/v2.0.0-breaking-changes.md` for full list.

## Dependencies

- Telemetry system (v1.7.0)
- Recipe management (v1.6.0)

## Testing Requirements

### Deprecation Testing
- [ ] All deprecated APIs emit warnings
- [ ] Warnings suppressible via env var
- [ ] No duplicate warnings
- [ ] No performance impact

### Compatibility Mode Testing
- [ ] All operations work in v2.0.0 mode
- [ ] Mode toggle works correctly
- [ ] Test suite passes in both modes
- [ ] No data corruption

### Migration Tool Testing
- [ ] Analyzes recipes correctly
- [ ] Transformations preserve semantics
- [ ] Reports all compatibility issues
- [ ] Handles edge cases

## Documentation Updates

- [ ] Create `docs/v2.0.0-breaking-changes.md`
- [ ] Add deprecation notice to each affected API doc
- [ ] Create migration preview guide
- [ ] Update FAQ with migration questions
- [ ] Add compatibility mode documentation

## Migration Guide

**For Users:**
1. Upgrade to v1.8.0
2. Review deprecation warnings in logs
3. Run migration preview tool on recipes
4. Test with v2.0.0 compatibility mode (optional)
5. Provide feedback on GitHub Discussions

**For Developers:**
1. Review deprecation codes in documentation
2. Update client code to use new APIs where possible
3. Test integration with compatibility mode
4. Plan migration timeline

## Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| Week 1 | Deprecation system, documentation | Warnings working, docs complete |
| Week 2 | Migration tool, compatibility mode | Preview tool, testing complete |

## Related Documents

- [Phase 3: Maturity](./phase-3-maturity.md)
- [v1.7.0 Release Plan](./release-v1.7.0.md)
- [v1.9.0 Release Plan](./release-v1.9.0.md)
- [v2.0.0 Release Plan](./release-v2.0.0.md)

## GitHub Milestone

Create milestone: `v1.8.0 - Breaking Changes Preparation`

**Issues:**
1. Implement Deprecation Warning System (P0, M)
2. Document v2.0.0 Breaking Changes (P0, M)
3. Create Migration Preview Tool (P1, M)
4. Implement v2.0.0 Compatibility Mode (P1, M)
5. Set Up User Feedback Collection (P2, S)
6. Create v2.0.0 Migration FAQ (P2, S)

---

**Last Updated:** December 2025
**Status:** Planning
