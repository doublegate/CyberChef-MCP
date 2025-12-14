# Release Plan: v2.3.0 - Plugin Architecture

**Release Date:** December 2026
**Theme:** Third-Party Operation Extensions
**Phase:** Phase 4 - Expansion
**Effort:** XL (6 weeks)
**Risk Level:** High

## Overview

v2.3.0 introduces a plugin architecture allowing third-party developers to create custom CyberChef operations. This enables community-driven extensions without modifying core code, specialized domain-specific operations, and experimental features.

## Goals

1. **Primary Goal**: Enable third-party operation packages via npm
2. **Secondary Goal**: Implement sandboxed execution for security
3. **Tertiary Goal**: Create plugin validation and signing system

## Success Criteria

- [ ] Plugin installation via `npm install`
- [ ] Plugin execution isolation (no core access)
- [ ] 10+ community plugins within 3 months of release
- [ ] <100ms plugin loading overhead
- [ ] Zero security vulnerabilities from plugins

## Features

### 1. Plugin Manifest Schema
**Priority:** P0 | **Effort:** M

Define the structure for plugin packages.

**Tasks:**
- [ ] Design plugin manifest schema (package.json extension)
- [ ] Define operation metadata format
- [ ] Specify dependency declaration
- [ ] Add capability declarations
- [ ] Create schema validation

**Manifest Schema:**
```json
{
  "name": "@cyberchef-plugins/example",
  "version": "1.0.0",
  "cyberchef": {
    "pluginVersion": "1.0.0",
    "operations": [
      {
        "name": "Custom Operation",
        "module": "./dist/CustomOperation.mjs",
        "description": "Does something custom",
        "category": "Custom",
        "args": [
          { "name": "input", "type": "string" }
        ]
      }
    ],
    "capabilities": ["network", "filesystem"],
    "sandbox": true
  }
}
```

### 2. Plugin Discovery & Loading
**Priority:** P0 | **Effort:** L

Automatic discovery and dynamic loading of plugins.

**Tasks:**
- [ ] Implement plugin discovery from node_modules
- [ ] Add plugin loading with dependency resolution
- [ ] Handle plugin initialization lifecycle
- [ ] Create plugin registry (in-memory)
- [ ] Add hot-reload support (development mode)
- [ ] Handle plugin conflicts (same operation name)

**Discovery Locations:**
1. `node_modules/@cyberchef-plugins/*`
2. `node_modules/cyberchef-plugin-*`
3. Custom paths via configuration

### 3. Sandboxed Execution
**Priority:** P0 | **Effort:** XL

Secure execution environment for untrusted plugins.

**Tasks:**
- [ ] Evaluate sandbox options (WebAssembly, isolated-vm, vm2)
- [ ] Implement chosen sandbox solution
- [ ] Define capability-based permissions
- [ ] Add resource limits (CPU, memory, time)
- [ ] Create secure module resolution
- [ ] Handle sandbox escapes gracefully

**Sandbox Options Analysis:**

| Option | Security | Performance | Compatibility |
|--------|----------|-------------|---------------|
| WebAssembly/WASI | High | Medium | Limited Node APIs |
| isolated-vm | High | High | Full V8 compatibility |
| Node vm | Low | High | Full compatibility |
| Worker threads | Medium | High | Full compatibility |

**Recommended:** `isolated-vm` with capability-based permissions

**Capability Permissions:**
- `network`: Allow HTTP/HTTPS requests
- `filesystem`: Allow file read (specific paths)
- `crypto`: Allow cryptographic operations
- `child_process`: Disallowed always
- `native_modules`: Disallowed always

### 4. Plugin Validation
**Priority:** P0 | **Effort:** M

Validate plugins before loading.

**Tasks:**
- [ ] Schema validation for manifest
- [ ] Static analysis for dangerous patterns
- [ ] Dependency audit (known vulnerabilities)
- [ ] Type checking (if TypeScript)
- [ ] Size limits enforcement
- [ ] Signature verification (optional)

**Validation Rules:**
- Max plugin size: 10MB
- No native dependencies
- No dynamic code execution (eval, Function)
- Required exports validation
- API compatibility check

### 5. Plugin Signing & Verification
**Priority:** P1 | **Effort:** M

Optional cryptographic signing for verified publishers.

**Tasks:**
- [ ] Define signing key infrastructure
- [ ] Implement signature verification
- [ ] Create verified publisher program
- [ ] Add trust levels to UI/logs
- [ ] Handle signature expiration

**Trust Levels:**
| Level | Description | Sandbox |
|-------|-------------|---------|
| Verified | Signed by verified publisher | Optional |
| Community | Not signed, from npm | Required |
| Local | Loaded from filesystem | Configurable |

### 6. Plugin Documentation Generation
**Priority:** P1 | **Effort:** S

Automatically generate documentation for plugins.

**Tasks:**
- [ ] Extract documentation from manifest
- [ ] Generate API documentation
- [ ] Create operation reference
- [ ] Add to MCP tool listing
- [ ] Include in search results

### 7. Plugin CLI Tools
**Priority:** P1 | **Effort:** M

Developer tools for plugin creation.

**Tasks:**
- [ ] Create plugin scaffolding CLI (`npx create-cyberchef-plugin`)
- [ ] Add plugin validation command
- [ ] Implement local testing harness
- [ ] Create plugin publishing guide
- [ ] Add plugin debugging tools

## Technical Design

### Architecture

```
+-------------------+
| MCP Server        |
+-------------------+
         |
+-------------------+
| Plugin Manager    |
| - Discovery       |
| - Loading         |
| - Lifecycle       |
+-------------------+
         |
+-------------------+
| Sandbox Runtime   |
| - isolated-vm     |
| - Capability mgmt |
| - Resource limits |
+-------------------+
         |
+-------------------+
| Plugin Instance   |
| - Operations[]    |
| - Configuration   |
+-------------------+
```

### Operation Interface

```typescript
interface CyberChefOperation {
  name: string;
  description: string;
  category: string;

  run(input: OperationInput, args: OperationArgs): Promise<OperationOutput>;

  getArgs(): ArgDefinition[];
  presentType?: PresentType;
}

interface OperationInput {
  data: string | Uint8Array;
  type: 'text' | 'binary';
}

interface OperationOutput {
  data: string | Uint8Array;
  type: 'text' | 'binary';
  mimeType?: string;
}
```

### Plugin Lifecycle

```
Discovery -> Validation -> Loading -> Initialization -> Registration
                                           |
                                           v
                    Ready <-> Execution -> Shutdown
```

## Implementation Plan

### Week 1-2: Core Infrastructure
- [ ] Plugin manifest schema
- [ ] Discovery mechanism
- [ ] Basic loading without sandbox

### Week 3-4: Sandbox Implementation
- [ ] isolated-vm integration
- [ ] Capability system
- [ ] Resource limits

### Week 5: Validation & Security
- [ ] Schema validation
- [ ] Static analysis
- [ ] Signature verification

### Week 6: Tooling & Documentation
- [ ] CLI tools
- [ ] Documentation generation
- [ ] Example plugins
- [ ] Testing & polish

## Dependencies

### Required
- `isolated-vm`: V8 isolate-based sandbox
- `ajv`: JSON schema validation
- `semver`: Version compatibility checking
- `glob`: Plugin discovery

### Optional
- `@aspect-js/vm`: Alternative sandbox
- `cosmiconfig`: Configuration loading
- `npm-registry-fetch`: Plugin registry queries

## Configuration

```json
{
  "plugins": {
    "enabled": true,
    "autoDiscover": true,
    "paths": [
      "./plugins"
    ],
    "sandbox": {
      "enabled": true,
      "memoryLimit": 128,
      "timeout": 30000,
      "capabilities": {
        "network": false,
        "filesystem": false
      }
    },
    "verification": {
      "requireSignature": false,
      "trustedPublishers": []
    }
  }
}
```

## Security Considerations

### Threat Model
| Threat | Mitigation |
|--------|------------|
| Code execution | Sandbox isolation |
| Resource exhaustion | CPU/memory limits |
| Data exfiltration | Network capability control |
| Privilege escalation | No native module access |
| Supply chain attack | Dependency audit, signing |

### Security Testing
- [ ] Sandbox escape attempts
- [ ] Resource limit enforcement
- [ ] Capability bypass attempts
- [ ] Dependency vulnerability scanning

## Testing Requirements

### Unit Tests
- [ ] Plugin discovery
- [ ] Manifest validation
- [ ] Sandbox isolation
- [ ] Capability enforcement

### Integration Tests
- [ ] Full plugin lifecycle
- [ ] Multi-plugin scenarios
- [ ] Hot reload functionality
- [ ] Error handling

### Security Tests
- [ ] Sandbox escape fuzzing
- [ ] Resource limit testing
- [ ] Malicious plugin scenarios

## Documentation Updates

- [ ] Plugin development guide
- [ ] Plugin publishing guide
- [ ] Security guidelines
- [ ] API reference
- [ ] Example plugins
- [ ] Troubleshooting guide

## Example Plugin

```javascript
// my-plugin/index.mjs
export const operations = [
  {
    name: "ROT47",
    description: "ROT47 cipher - rotates ASCII characters 33-126",
    category: "Encryption / Encoding",

    run(input, args) {
      const result = input.data.split('').map(char => {
        const code = char.charCodeAt(0);
        if (code >= 33 && code <= 126) {
          return String.fromCharCode(33 + ((code - 33 + 47) % 94));
        }
        return char;
      }).join('');

      return { data: result, type: 'text' };
    },

    getArgs() {
      return [];
    }
  }
];
```

## GitHub Milestone

Create milestone: `v2.3.0 - Plugin Architecture`

**Issues:**
1. Design Plugin Manifest Schema (P0, M)
2. Implement Plugin Discovery & Loading (P0, L)
3. Implement Sandboxed Execution (P0, XL)
4. Create Plugin Validation System (P0, M)
5. Add Plugin Signing & Verification (P1, M)
6. Implement Documentation Generation (P1, S)
7. Create Plugin CLI Tools (P1, M)
8. Write Plugin Development Guide (P0, M)
9. Security Testing & Audit (P0, L)

---

**Last Updated:** December 2025
**Status:** Planning
**Next Review:** November 2026
