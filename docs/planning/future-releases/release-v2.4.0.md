# Release Plan: v2.4.0 - Enterprise Features

**Release Date:** January 2027
**Theme:** Authentication, Authorization, and Audit Logging
**Phase:** Phase 5 - Enterprise
**Effort:** L (4 weeks)
**Risk Level:** Medium

## Overview

v2.4.0 implements enterprise security features required for production deployments. The MCP Authorization specification (finalized June 2025) establishes OAuth 2.1 as the standard for MCP server authentication. This release aligns with that specification while adding role-based authorization and comprehensive audit logging.

## Goals

1. **Primary Goal**: Implement OAuth 2.1 authentication per MCP spec
2. **Secondary Goal**: Add role-based authorization (RBAC)
3. **Tertiary Goal**: Comprehensive audit logging for compliance

## Success Criteria

- [ ] OAuth 2.1 compliance per MCP authorization spec
- [ ] <50ms authentication overhead
- [ ] Audit log completeness: 100% of operations logged
- [ ] Zero cross-tenant data leakage
- [ ] Integration with 3+ IdP providers (Keycloak, Auth0, Okta)

## Features

### 1. OAuth 2.1 Authentication
**Priority:** P0 | **Effort:** L

Implement MCP Resource Server role per June 2025 specification.

**Tasks:**
- [ ] Configure server as OAuth Resource Server (not Auth Server)
- [ ] Implement token validation (JWT, introspection)
- [ ] Add token refresh handling
- [ ] Support multiple authorization servers
- [ ] Implement token caching for performance
- [ ] Handle token revocation

**OAuth Configuration:**
```json
{
  "oauth": {
    "enabled": true,
    "resourceServerId": "cyberchef-mcp",
    "authorizationServers": [
      {
        "issuer": "https://auth.example.com/realms/main",
        "audience": "cyberchef-mcp",
        "jwksUri": "https://auth.example.com/realms/main/.well-known/jwks.json"
      }
    ],
    "tokenValidation": {
      "algorithm": ["RS256", "ES256"],
      "clockTolerance": 30
    }
  }
}
```

### 2. Role-Based Authorization (RBAC)
**Priority:** P0 | **Effort:** M

Fine-grained access control for operations and resources.

**Tasks:**
- [ ] Design role/permission model
- [ ] Implement permission checking middleware
- [ ] Add operation-level permissions
- [ ] Create recipe access controls
- [ ] Implement resource-level permissions
- [ ] Add permission inheritance

**Role Model:**
```json
{
  "roles": {
    "viewer": {
      "permissions": ["operation:read", "recipe:read"]
    },
    "operator": {
      "permissions": ["operation:execute", "recipe:execute"]
    },
    "admin": {
      "permissions": ["*"]
    }
  }
}
```

**Permission Types:**
| Permission | Description |
|------------|-------------|
| `operation:read` | List and describe operations |
| `operation:execute` | Execute operations |
| `recipe:read` | View saved recipes |
| `recipe:write` | Create/modify recipes |
| `recipe:execute` | Execute recipes |
| `plugin:manage` | Install/remove plugins |
| `config:read` | View configuration |
| `config:write` | Modify configuration |
| `audit:read` | Access audit logs |

### 3. Audit Logging
**Priority:** P0 | **Effort:** M

Comprehensive logging for compliance and security.

**Tasks:**
- [ ] Design audit log schema
- [ ] Implement audit event capture
- [ ] Add structured logging output (JSON)
- [ ] Create log rotation and retention
- [ ] Add sensitive data masking
- [ ] Implement log integrity verification

**Audit Log Schema:**
```json
{
  "timestamp": "2027-01-15T10:30:00Z",
  "eventId": "uuid",
  "eventType": "operation.execute",
  "actor": {
    "type": "user",
    "id": "user-123",
    "email": "user@example.com",
    "roles": ["operator"]
  },
  "resource": {
    "type": "operation",
    "id": "to_base64"
  },
  "action": "execute",
  "result": "success",
  "metadata": {
    "inputSize": 1024,
    "outputSize": 1368,
    "duration": 15
  },
  "clientInfo": {
    "ip": "192.168.1.100",
    "userAgent": "MCP-Client/1.0"
  }
}
```

### 4. Usage Quotas & Metering
**Priority:** P1 | **Effort:** M

Track and limit resource usage.

**Tasks:**
- [ ] Implement quota tracking
- [ ] Add quota enforcement
- [ ] Create usage metering hooks
- [ ] Add quota exceeded responses
- [ ] Implement quota reset mechanism
- [ ] Create billing integration hooks

**Quota Configuration:**
```json
{
  "quotas": {
    "enabled": true,
    "plans": {
      "free": {
        "operationsPerDay": 1000,
        "maxInputSize": "10MB"
      },
      "pro": {
        "operationsPerDay": 100000,
        "maxInputSize": "1GB"
      }
    }
  }
}
```

### 5. API Key Management
**Priority:** P1 | **Effort:** M

Service account authentication for automation.

**Tasks:**
- [ ] Design API key format and generation
- [ ] Implement key validation
- [ ] Add key rotation support
- [ ] Create key scoping (permissions)
- [ ] Add key expiration
- [ ] Implement key revocation

**API Key Format:**
```
cyberchef_sk_live_<base64-key>
cyberchef_sk_test_<base64-key>
```

### 6. Multi-Tenancy Foundation
**Priority:** P1 | **Effort:** L

Prepare for multi-tenant deployments.

**Tasks:**
- [ ] Implement tenant isolation
- [ ] Add tenant context to requests
- [ ] Create tenant-scoped storage
- [ ] Prevent cross-tenant access
- [ ] Add tenant configuration

**Tenant Isolation:**
- Separate recipe storage per tenant
- Tenant-scoped audit logs
- Tenant-specific configuration
- Resource quota per tenant

## Technical Design

### Authentication Flow

```
Client                    MCP Server                Auth Server
   |                          |                          |
   |--Bearer Token----------->|                          |
   |                          |--Validate Token--------->|
   |                          |<--Token Claims-----------|
   |                          |                          |
   |                          |--Check Permissions       |
   |                          |                          |
   |<--Response---------------|                          |
```

### Architecture

```
+------------------+
| MCP Request      |
+------------------+
        |
+------------------+
| Auth Middleware  |
| - Token validate |
| - Permission chk |
+------------------+
        |
+------------------+
| Audit Middleware |
| - Log request    |
+------------------+
        |
+------------------+
| MCP Server Core  |
+------------------+
        |
+------------------+
| Audit Middleware |
| - Log response   |
+------------------+
```

## Implementation Plan

### Week 1: OAuth Authentication
- [ ] Token validation setup
- [ ] JWT verification
- [ ] Authorization server integration
- [ ] Token caching

### Week 2: Authorization
- [ ] RBAC implementation
- [ ] Permission middleware
- [ ] Operation-level permissions
- [ ] Testing

### Week 3: Audit & Quotas
- [ ] Audit logging system
- [ ] Quota tracking
- [ ] API key management
- [ ] Metering hooks

### Week 4: Multi-Tenancy & Polish
- [ ] Tenant isolation
- [ ] Configuration
- [ ] Documentation
- [ ] Security testing

## Dependencies

### Required
- `jose`: JWT validation and signing
- `jwks-rsa`: JWKS fetching
- `express-oauth2-jwt-bearer` (optional): Express middleware
- `pino`: Structured logging

### External Services
- Authorization Server (Keycloak, Auth0, Okta)
- Log aggregation (optional): Elasticsearch, Loki

## Configuration

```json
{
  "security": {
    "authentication": {
      "enabled": true,
      "type": "oauth2",
      "oauth": { /* ... */ }
    },
    "authorization": {
      "enabled": true,
      "defaultRole": "viewer",
      "roleMapping": { /* ... */ }
    },
    "audit": {
      "enabled": true,
      "output": "file",
      "path": "/var/log/cyberchef/audit.log",
      "retention": "90d"
    },
    "quotas": { /* ... */ },
    "apiKeys": {
      "enabled": true,
      "prefix": "cyberchef_sk"
    }
  }
}
```

## Testing Requirements

### Unit Tests
- [ ] Token validation
- [ ] Permission checking
- [ ] Audit log generation
- [ ] Quota enforcement

### Integration Tests
- [ ] OAuth flow with real IdP
- [ ] Multi-tenant isolation
- [ ] Audit log completeness
- [ ] API key authentication

### Security Tests
- [ ] Token bypass attempts
- [ ] Permission escalation
- [ ] Cross-tenant access
- [ ] Audit log tampering

## Compliance Considerations

### SOC 2 Type II
- Complete audit trail
- Access control documentation
- Incident detection capabilities

### HIPAA
- PHI access logging
- Encryption in transit (TLS)
- Access audit trails

### GDPR
- Consent tracking
- Data access logging
- Right to erasure support

## Documentation Updates

- [ ] Authentication setup guide
- [ ] Authorization configuration
- [ ] Audit log format reference
- [ ] IdP integration guides
- [ ] API key management guide
- [ ] Compliance documentation

## GitHub Milestone

Create milestone: `v2.4.0 - Enterprise Features`

**Issues:**
1. Implement OAuth 2.1 Authentication (P0, L)
2. Add Role-Based Authorization (P0, M)
3. Implement Audit Logging System (P0, M)
4. Add Usage Quotas & Metering (P1, M)
5. Implement API Key Management (P1, M)
6. Add Multi-Tenancy Foundation (P1, L)
7. Security Testing & Audit (P0, M)
8. Documentation & Compliance (P0, M)

---

**Last Updated:** December 2025
**Status:** Planning
**Next Review:** December 2026
