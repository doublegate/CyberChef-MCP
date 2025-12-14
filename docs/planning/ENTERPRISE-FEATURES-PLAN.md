# Enterprise Features Plan

**Version:** 1.0.0
**Target Release:** v2.4.0 - v2.6.0 (Q1 2027)
**Last Updated:** December 2025
**Status:** Planning

## Executive Summary

This document outlines the enterprise features roadmap for CyberChef MCP Server, including authentication, authorization, audit logging, distributed architecture, and observability. These features enable production deployments in organizations with strict security, compliance, and operational requirements.

## Enterprise Requirements Analysis

### Security Requirements

| Requirement | Priority | Release |
|-------------|----------|---------|
| OAuth 2.1 Authentication | P0 | v2.4.0 |
| Role-Based Authorization | P0 | v2.4.0 |
| Audit Logging | P0 | v2.4.0 |
| API Key Management | P1 | v2.4.0 |
| Multi-Tenancy | P1 | v2.4.0 |

### Operational Requirements

| Requirement | Priority | Release |
|-------------|----------|---------|
| Horizontal Scaling | P0 | v2.5.0 |
| High Availability | P0 | v2.5.0 |
| Health Checks | P0 | v2.5.0 |
| Graceful Shutdown | P0 | v2.5.0 |

### Observability Requirements

| Requirement | Priority | Release |
|-------------|----------|---------|
| Distributed Tracing | P0 | v2.6.0 |
| Metrics (Prometheus) | P0 | v2.6.0 |
| Structured Logging | P0 | v2.6.0 |
| Dashboards | P1 | v2.6.0 |

## Authentication Architecture

### MCP Authorization Specification

The MCP Authorization specification (finalized June 2025) designates MCP servers as OAuth Resource Servers (not Authorization Servers). This means:

1. CyberChef MCP Server validates tokens, doesn't issue them
2. Integration with external Identity Providers (IdP)
3. Support for multiple authorization servers

### OAuth 2.1 Implementation

```
+------------------+     +------------------+     +------------------+
|                  |     |                  |     |                  |
|  MCP Client      |---->|  CyberChef MCP   |---->|  Auth Server     |
|                  |     |  (Resource Svr)  |     |  (Keycloak, etc) |
+------------------+     +------------------+     +------------------+
        |                        |                        |
        |  1. Get Token          |                        |
        |------------------------|----------------------->|
        |                        |                        |
        |<-----------------------|------------------------|
        |  2. Access Token       |                        |
        |                        |                        |
        |  3. Request + Token    |                        |
        |----------------------->|                        |
        |                        |  4. Validate Token     |
        |                        |----------------------->|
        |                        |                        |
        |                        |<-----------------------|
        |                        |  5. Token Claims       |
        |                        |                        |
        |<-----------------------|                        |
        |  6. Response           |                        |
```

### Token Validation

```javascript
import { jwtVerify, createRemoteJWKSet } from 'jose';

class TokenValidator {
  constructor(config) {
    this.config = config;
    this.jwks = new Map();
  }

  async validate(token) {
    const header = this.decodeHeader(token);
    const issuer = this.findIssuer(header);

    if (!issuer) {
      throw new AuthenticationError('Unknown token issuer');
    }

    const jwks = await this.getJWKS(issuer);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: issuer.issuer,
      audience: this.config.audience,
      clockTolerance: this.config.clockTolerance || 30
    });

    return {
      valid: true,
      claims: payload,
      userId: payload.sub,
      roles: payload.roles || payload['realm_access']?.roles || [],
      permissions: payload.permissions || []
    };
  }

  async getJWKS(issuer) {
    if (!this.jwks.has(issuer.issuer)) {
      const jwks = createRemoteJWKSet(new URL(issuer.jwksUri));
      this.jwks.set(issuer.issuer, jwks);
    }
    return this.jwks.get(issuer.issuer);
  }
}
```

### Identity Provider Integration

#### Keycloak

```json
{
  "oauth": {
    "authorizationServers": [{
      "issuer": "https://keycloak.example.com/realms/main",
      "jwksUri": "https://keycloak.example.com/realms/main/protocol/openid-connect/certs",
      "audience": "cyberchef-mcp",
      "rolesClaim": "realm_access.roles"
    }]
  }
}
```

#### Auth0

```json
{
  "oauth": {
    "authorizationServers": [{
      "issuer": "https://your-tenant.auth0.com/",
      "jwksUri": "https://your-tenant.auth0.com/.well-known/jwks.json",
      "audience": "https://cyberchef-mcp.example.com",
      "rolesClaim": "https://cyberchef-mcp.example.com/roles"
    }]
  }
}
```

#### Okta

```json
{
  "oauth": {
    "authorizationServers": [{
      "issuer": "https://your-org.okta.com/oauth2/default",
      "jwksUri": "https://your-org.okta.com/oauth2/default/v1/keys",
      "audience": "api://cyberchef-mcp",
      "rolesClaim": "groups"
    }]
  }
}
```

## Authorization Model

### Role-Based Access Control (RBAC)

```
+------------------+
|     Roles        |
+------------------+
| admin            |
| operator         |
| viewer           |
| developer        |
+------------------+
         |
         v
+------------------+
|   Permissions    |
+------------------+
| operation:read   |
| operation:execute|
| recipe:read      |
| recipe:write     |
| recipe:execute   |
| plugin:manage    |
| config:read      |
| config:write     |
| audit:read       |
| tenant:admin     |
+------------------+
```

### Permission Definitions

```javascript
const permissions = {
  // Operation permissions
  'operation:read': 'List and describe operations',
  'operation:execute': 'Execute operations',

  // Recipe permissions
  'recipe:read': 'View saved recipes',
  'recipe:write': 'Create and modify recipes',
  'recipe:execute': 'Execute saved recipes',
  'recipe:delete': 'Delete recipes',

  // Plugin permissions
  'plugin:read': 'List plugins',
  'plugin:install': 'Install plugins',
  'plugin:uninstall': 'Remove plugins',
  'plugin:manage': 'Full plugin management',

  // Configuration permissions
  'config:read': 'View configuration',
  'config:write': 'Modify configuration',

  // Audit permissions
  'audit:read': 'Access audit logs',
  'audit:export': 'Export audit logs',

  // Tenant permissions (for multi-tenancy)
  'tenant:admin': 'Tenant administration',
  'tenant:create': 'Create sub-tenants',

  // System permissions
  'system:admin': 'Full system access'
};
```

### Role Definitions

```json
{
  "roles": {
    "viewer": {
      "description": "Read-only access",
      "permissions": [
        "operation:read",
        "recipe:read"
      ]
    },

    "operator": {
      "description": "Execute operations and recipes",
      "permissions": [
        "operation:read",
        "operation:execute",
        "recipe:read",
        "recipe:execute"
      ]
    },

    "developer": {
      "description": "Full recipe and plugin access",
      "permissions": [
        "operation:read",
        "operation:execute",
        "recipe:*",
        "plugin:read"
      ]
    },

    "admin": {
      "description": "Full system access",
      "permissions": ["*"]
    }
  }
}
```

### Permission Checking

```javascript
class AuthorizationMiddleware {
  async check(request, requiredPermission) {
    const user = request.user;
    if (!user) {
      throw new AuthenticationError('Not authenticated');
    }

    const userPermissions = await this.getUserPermissions(user);

    if (!this.hasPermission(userPermissions, requiredPermission)) {
      throw new AuthorizationError(
        `Permission denied: ${requiredPermission}`,
        { userId: user.id, required: requiredPermission }
      );
    }

    return true;
  }

  hasPermission(userPermissions, required) {
    // Check for wildcard
    if (userPermissions.includes('*')) return true;

    // Check for exact match
    if (userPermissions.includes(required)) return true;

    // Check for category wildcard (e.g., recipe:* matches recipe:read)
    const [category] = required.split(':');
    if (userPermissions.includes(`${category}:*`)) return true;

    return false;
  }
}
```

## Audit Logging

### Audit Event Schema

```typescript
interface AuditEvent {
  // Event identification
  id: string;                     // UUID
  timestamp: string;              // ISO 8601
  version: string;                // Schema version

  // Event classification
  type: AuditEventType;          // operation.execute, auth.login, etc.
  category: AuditCategory;       // authentication, authorization, data, admin
  severity: AuditSeverity;       // info, warning, error, critical

  // Actor information
  actor: {
    type: 'user' | 'service' | 'system';
    id: string;
    email?: string;
    roles: string[];
    ip?: string;
    userAgent?: string;
  };

  // Resource information
  resource: {
    type: 'operation' | 'recipe' | 'plugin' | 'config' | 'user';
    id: string;
    name?: string;
  };

  // Action details
  action: string;                // read, create, update, delete, execute
  result: 'success' | 'failure';
  reason?: string;               // Failure reason

  // Context
  context: {
    tenantId?: string;
    sessionId?: string;
    requestId: string;
    traceId?: string;
  };

  // Metadata
  metadata: Record<string, any>;  // Operation-specific data
}

type AuditEventType =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.token_refresh'
  | 'auth.failed'
  | 'operation.execute'
  | 'operation.failed'
  | 'recipe.create'
  | 'recipe.update'
  | 'recipe.delete'
  | 'recipe.execute'
  | 'plugin.install'
  | 'plugin.uninstall'
  | 'config.update'
  | 'tenant.create'
  | 'tenant.update';
```

### Audit Logger

```javascript
class AuditLogger {
  constructor(config) {
    this.config = config;
    this.outputs = this.initializeOutputs(config.outputs);
  }

  async log(event) {
    const enrichedEvent = this.enrich(event);
    const validated = this.validate(enrichedEvent);

    // Write to all configured outputs
    await Promise.all(
      this.outputs.map(output => output.write(validated))
    );
  }

  enrich(event) {
    return {
      ...event,
      id: event.id || uuidv4(),
      timestamp: event.timestamp || new Date().toISOString(),
      version: '1.0.0',
      context: {
        ...event.context,
        serverVersion: this.config.serverVersion,
        environment: this.config.environment
      }
    };
  }

  // Convenience methods
  async authSuccess(actor, metadata = {}) {
    await this.log({
      type: 'auth.login',
      category: 'authentication',
      severity: 'info',
      actor,
      resource: { type: 'user', id: actor.id },
      action: 'login',
      result: 'success',
      metadata
    });
  }

  async operationExecute(actor, operation, input, output, duration) {
    await this.log({
      type: 'operation.execute',
      category: 'data',
      severity: 'info',
      actor,
      resource: { type: 'operation', id: operation.name },
      action: 'execute',
      result: 'success',
      metadata: {
        inputSize: input.length,
        outputSize: output.length,
        duration
      }
    });
  }
}
```

### Audit Storage

#### File Output

```javascript
class FileAuditOutput {
  constructor(config) {
    this.path = config.path;
    this.rotation = config.rotation; // daily, weekly, size-based
  }

  async write(event) {
    const line = JSON.stringify(event) + '\n';
    await fs.appendFile(this.getFilePath(), line);
  }

  getFilePath() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.path, `audit-${date}.log`);
  }
}
```

#### Elasticsearch Output

```javascript
class ElasticsearchAuditOutput {
  constructor(config) {
    this.client = new Client({ node: config.url });
    this.index = config.index || 'cyberchef-audit';
  }

  async write(event) {
    await this.client.index({
      index: `${this.index}-${this.getDateSuffix()}`,
      body: event
    });
  }
}
```

## Multi-Tenancy

### Tenant Isolation

```
+------------------+
|   Load Balancer  |
+------------------+
         |
+------------------+
| Tenant Resolver  |
| - Header         |
| - Subdomain      |
| - API Key        |
+------------------+
         |
+------------------+
|  Tenant Context  |
+------------------+
         |
    +----+----+
    |         |
+-------+ +-------+
|Tenant | |Tenant |
|   A   | |   B   |
+-------+ +-------+
```

### Tenant Context

```javascript
class TenantContext {
  constructor(tenantId, config) {
    this.tenantId = tenantId;
    this.config = config;
  }

  getStorage() {
    return new TenantStorage(this.tenantId);
  }

  getRecipeRepository() {
    return new RecipeRepository({
      prefix: `tenant:${this.tenantId}:`
    });
  }

  getQuota() {
    return this.config.quotas[this.tenantId] || this.config.defaultQuota;
  }
}

// Middleware to resolve tenant
function tenantMiddleware(req, res, next) {
  const tenantId = req.headers['x-tenant-id'] ||
                   req.subdomains[0] ||
                   extractFromApiKey(req.headers.authorization);

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant not specified' });
  }

  req.tenant = new TenantContext(tenantId, config);
  next();
}
```

## Distributed Architecture

### Stateless Design

```
+------------------+
|   Load Balancer  |
+------------------+
         |
    +----+----+
    |    |    |
+-----+ +-----+ +-----+
|Pod 1| |Pod 2| |Pod 3|
+-----+ +-----+ +-----+
    |    |    |
    +----+----+
         |
+------------------+
|   Redis Cluster  |
| - Sessions       |
| - Cache          |
| - Pub/Sub        |
+------------------+
         |
+------------------+
|   PostgreSQL     |
| - Recipes        |
| - Audit Logs     |
| - Config         |
+------------------+
```

### Session Management

```javascript
class RedisSessionStore {
  constructor(redisClient, options = {}) {
    this.redis = redisClient;
    this.prefix = options.prefix || 'cyberchef:session:';
    this.ttl = options.ttl || 3600;
  }

  async get(sessionId) {
    const data = await this.redis.get(this.prefix + sessionId);
    return data ? JSON.parse(data) : null;
  }

  async set(sessionId, data) {
    await this.redis.setex(
      this.prefix + sessionId,
      this.ttl,
      JSON.stringify(data)
    );
  }

  async destroy(sessionId) {
    await this.redis.del(this.prefix + sessionId);
  }

  async touch(sessionId) {
    await this.redis.expire(this.prefix + sessionId, this.ttl);
  }
}
```

### Health Checks

```javascript
// Kubernetes-compatible health endpoints
app.get('/health/live', (req, res) => {
  // Liveness: is the process alive?
  res.status(200).json({ status: 'ok' });
});

app.get('/health/ready', async (req, res) => {
  // Readiness: can we serve traffic?
  const checks = await Promise.all([
    checkRedis(),
    checkDatabase(),
    checkOperations()
  ]);

  const allHealthy = checks.every(c => c.healthy);
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ok' : 'degraded',
    checks
  });
});

app.get('/health/startup', async (req, res) => {
  // Startup: has initialization completed?
  if (serverInitialized) {
    res.status(200).json({ status: 'ok' });
  } else {
    res.status(503).json({ status: 'starting' });
  }
});
```

## Observability

### OpenTelemetry Integration

```javascript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

const sdk = new NodeSDK({
  serviceName: 'cyberchef-mcp',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  }),
  metricReader: new PrometheusExporter({
    port: 9090
  }),
  instrumentations: [
    getNodeAutoInstrumentations()
  ]
});

sdk.start();
```

### Custom Metrics

```javascript
const meter = opentelemetry.metrics.getMeter('cyberchef-mcp');

const operationCounter = meter.createCounter('cyberchef_operations_total', {
  description: 'Total operations executed'
});

const operationDuration = meter.createHistogram('cyberchef_operation_duration_seconds', {
  description: 'Operation execution duration'
});

// Usage
operationCounter.add(1, { operation: 'to_base64', status: 'success' });
operationDuration.record(0.015, { operation: 'to_base64' });
```

## Compliance

### SOC 2 Type II

| Control | Implementation |
|---------|----------------|
| Access Control | OAuth 2.1, RBAC |
| Audit Logging | Complete audit trail |
| Change Management | Git, deployment logs |
| Encryption | TLS, encryption at rest |
| Availability | HA architecture |

### HIPAA

| Requirement | Implementation |
|-------------|----------------|
| Access Control | RBAC with PHI restrictions |
| Audit Trail | Comprehensive logging |
| Encryption | TLS 1.3, AES-256 at rest |
| Minimum Necessary | Role-based access |
| Business Associate | BAA template provided |

### GDPR

| Requirement | Implementation |
|-------------|----------------|
| Consent | Configurable consent tracking |
| Right to Access | Audit log export |
| Right to Erasure | Data deletion tools |
| Data Portability | Export in standard formats |
| Privacy by Design | Minimal data collection |

## Implementation Timeline

| Release | Features | Timeline |
|---------|----------|----------|
| v2.4.0 | Auth, RBAC, Audit, Multi-tenant | January 2027 |
| v2.5.0 | Scaling, HA, Health Checks | February 2027 |
| v2.6.0 | OpenTelemetry, Dashboards | March 2027 |

## References

- [MCP Authorization Specification](https://modelcontextprotocol.io/docs/tutorials/security/authorization)
- [OAuth 2.1 Specification](https://oauth.net/2.1/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Release v2.4.0 Plan](./release-v2.4.0.md)
- [Release v2.5.0 Plan](./release-v2.5.0.md)
- [Release v2.6.0 Plan](./release-v2.6.0.md)
- [Phase 5: Enterprise](./phase-5-enterprise.md)

---

**Document Owner:** TBD
**Review Cycle:** Monthly
**Next Review:** December 2026
