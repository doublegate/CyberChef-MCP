# Release Plan: v2.6.0 - Distributed Architecture

> **Re-scoped during execution. Read this before the plan below.**
>
> This plan was written in December 2025 and its centrepiece — externalising **session state** to
> Redis, plus session affinity, sticky sessions, session migration and failover recovery — solves a
> problem that **no longer exists**. MCP protocol revision `2026-07-28`, which this server has
> implemented since v2.3.0, removed protocol-level sessions outright:
>
> > *"Revision 2026-07-28 changed the behavior of Streamable HTTP. Changes included: Removal of the
> > GET stream endpoint. **Removal of protocol-level sessions.**"*
> >
> > *"An `Mcp-Session-Id` header on a request: **ignore it, and do not mint or echo session IDs.**"*
>
> There is no session to externalise, no affinity to configure, and no store to run. The modern
> request path is already stateless per request.
>
> The plan's state table is also simply wrong: it says recipes live in SQLite. They are a JSON
> file, and **that** is the real constraint on running replicas.
>
> | plan feature | disposition |
> |---|---|
> | 1. Stateless server design | **partly withdrawn** — already stateless; recipes are the exception, see below |
> | 2. Load balancer integration | **shipped** — health probes, drain, connection handling |
> | 3. Kubernetes deployment | **shipped** — Helm chart with probes, HPA, PDB, ingress |
> | 4. Docker Swarm deployment | **re-scoped** to Docker Compose — see below |
> | 5. Warm pool support | **withdrawn on measurement** — the target was met by deleting the cost, not hiding it |
> | 6. Session affinity & persistence | **withdrawn** — the protocol removed sessions |
> | 7. Circuit breakers | **shipped** — wired to the one dependency that can fail: the authorization server |
> | 8. Graceful shutdown | **shipped** — existed since v2.3.0, extended with draining |
>
> **Recipes, not sessions.** Saved recipes are a per-process JSON file, so replicas do not share
> them. v2.6.0 does not add a database to fix that: the supported configurations are a volume per
> replica or a single replica, the chart refuses anything else, and the server detects a clobbering
> write rather than silently losing a recipe. Documented rather than engineered away, deliberately.
>
> **Warm pools.** The plan's target was "<1 s cold start (with warm pools)". Cold start was
> ~1300 ms, of which ~1150 ms was one eager import of all 505 operation implementations. Deferring
> it gives **185 ms** — five times better than the target, with no pre-warmed instances and no
> orchestrator. A background warm-up was then implemented, measured, and removed: it restored the
> full 1300 ms, because module loading blocks the event loop and therefore cannot happen "in the
> background".
>
> **Circuit breakers.** `retry.mjs` already exported a `CircuitBreaker` that **nothing
> instantiated** — the only `new CircuitBreaker` in the repository was in its own test. The first
> disposition here was "leave it: a breaker protects a failing dependency, and this server's work
> is local CPU". That was too broad twice over. Two operations DO reach the network -- `HTTP
> request` and `DNS over HTTPS`, the only two carrying `openWorldHint` -- though a breaker is
> still wrong for them: each call is user-directed at a URL the caller chose, so tripping a
> shared circuit across unrelated hosts would refuse one user's request because another's host
> was down. What the claim actually missed is the authorization server, which every request
> depends on and nobody chooses per call.
>
> `fetchJwks` cached successes and not failures, and `discoverJwksUri` tries two metadata URLs, so
> an issuer outage turned every incoming request into two outbound ones — none with a deadline,
> because Node's `fetch` has no default timeout. Measured, 20 verifications against a down issuer:
>
> ```text
> before:  40 outbound attempts   (2 per request, growing with traffic)
> after:   10 outbound attempts   (then the breaker opens; the rest make none)
> ```
>
> Now wired there, plus a 5 s deadline on every request to the authorization server — the smaller
> fix, and arguably the more important one, since a breaker without a timeout still lets five
> requests hang for minutes before it opens.
>
> **Docker Swarm.** Re-scoped to Compose. Swarm is in maintenance and is not where anyone deploying
> this in 2026 is going; Compose covers the same "one host, not Kubernetes" case that the Swarm
> item was really for.
>
> The measurements behind each of these are in
> [`docs/internal/v2.6.0-findings-log.md`](../../internal/v2.6.0-findings-log.md), and what shipped
> is in [`docs/releases/v2.6.0.md`](../../releases/v2.6.0.md).


**Release Date:** February 2027
**Theme:** Horizontal Scaling and High Availability
**Phase:** Phase 5 - Enterprise
**Effort:** XL (6 weeks)
**Risk Level:** High

## Overview

v2.6.0 enables CyberChef MCP Server to run as a distributed service with horizontal scaling and high availability. Production deployments require the ability to handle variable loads and meet uptime SLAs.

## Goals

1. **Primary Goal**: Enable horizontal scaling to 10+ replicas
2. **Secondary Goal**: Achieve 99.9% uptime with graceful failover
3. **Tertiary Goal**: Support Kubernetes and Docker Swarm deployments

## Success Criteria

- [ ] Linear scaling to 10+ replicas
- [ ] <1s cold start time (with warm pools)
- [ ] 99.9% uptime in production
- [ ] Zero message loss during scale events
- [ ] Kubernetes and Docker Swarm support

## Features

### 1. Stateless Server Design
**Priority:** P0 | **Effort:** L

Refactor server to externalize all state.

**Tasks:**
- [ ] Identify and externalize session state
- [ ] Move recipe storage to external store
- [ ] Externalize cache to Redis/Valkey
- [ ] Remove all in-process state dependencies
- [ ] Add state store health checks
- [ ] Implement graceful state migration

**State Externalization:**
| State Type | Current | Target |
|------------|---------|--------|
| Sessions | In-memory | Redis |
| Recipes | SQLite | PostgreSQL/Redis |
| Cache | In-memory | Redis |
| Plugins | Filesystem | Shared volume/S3 |

### 2. Load Balancer Integration
**Priority:** P0 | **Effort:** M

Support various load balancing strategies.

**Tasks:**
- [ ] Implement health endpoints (liveness, readiness, startup)
- [ ] Add load balancer-aware session handling
- [ ] Support sticky sessions (optional)
- [ ] Add graceful shutdown for zero-downtime deploys
- [ ] Implement connection draining
- [ ] Support multiple LB types (L4, L7)

**Health Endpoints:**
```
GET /health/live     -> 200 OK (process alive)
GET /health/ready    -> 200 OK (ready to serve)
GET /health/startup  -> 200 OK (initialization complete)
```

### 3. Kubernetes Deployment
**Priority:** P0 | **Effort:** L

Kubernetes-native deployment with Helm chart.

**Tasks:**
- [ ] Create Helm chart
- [ ] Add ConfigMap and Secret management
- [ ] Implement HPA (Horizontal Pod Autoscaler)
- [ ] Add PodDisruptionBudget
- [ ] Create ServiceMonitor for Prometheus
- [ ] Add network policies
- [ ] Support Ingress and Gateway API

**Helm Values:**
```yaml
replicaCount: 3

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilization: 70

resources:
  requests:
    memory: "256Mi"
    cpu: "100m"
  limits:
    memory: "1Gi"
    cpu: "1000m"

redis:
  enabled: true
  architecture: replication

ingress:
  enabled: true
  className: nginx
```

### 4. Docker Swarm Deployment
**Priority:** P1 | **Effort:** M

Docker Swarm deployment patterns.

**Tasks:**
- [ ] Create docker-compose.yml for Swarm
- [ ] Add service health checks
- [ ] Implement update rollout strategy
- [ ] Add resource constraints
- [ ] Create overlay network configuration
- [ ] Add secret management

### 5. Warm Pool Support
**Priority:** P1 | **Effort:** M

Fast startup with pre-warmed instances.

**Tasks:**
- [ ] Implement instance pre-warming
- [ ] Add warm pool orchestrator
- [ ] Create startup optimization
- [ ] Implement lazy loading
- [ ] Add module caching
- [ ] Target: <1s cold start

**Optimization Strategies:**
- Lazy load operations (only load when used)
- Pre-compile critical paths
- Cache compiled modules
- V8 code cache (snapshot)
- Reduce dependency tree

### 6. Session Affinity & Persistence
**Priority:** P0 | **Effort:** M

Handle sessions across multiple instances.

**Tasks:**
- [ ] Implement Redis session store
- [ ] Add session serialization
- [ ] Handle session migration
- [ ] Implement session timeout
- [ ] Add session recovery after failover
- [ ] Create session replication (optional)

**Session Store Configuration:**
```json
{
  "sessions": {
    "store": "redis",
    "redis": {
      "url": "redis://redis:6379",
      "prefix": "cyberchef:session:",
      "ttl": 3600
    },
    "replication": {
      "enabled": false,
      "minReplicas": 2
    }
  }
}
```

### 7. Circuit Breaker Patterns
**Priority:** P1 | **Effort:** S

Resilience patterns for distributed systems.

**Tasks:**
- [ ] Implement circuit breaker for external calls
- [ ] Add retry with exponential backoff
- [ ] Create fallback mechanisms
- [ ] Add bulkhead isolation
- [ ] Implement timeout handling

### 8. Graceful Shutdown
**Priority:** P0 | **Effort:** S

Zero-downtime deployments.

**Tasks:**
- [ ] Handle SIGTERM signal
- [ ] Complete in-flight requests
- [ ] Close connections gracefully
- [ ] Persist critical state
- [ ] Notify load balancer (ready=false)

## Technical Design

### Architecture

```
              +---------------+
              | Load Balancer |
              +---------------+
                     |
     +---------------+---------------+
     |               |               |
+--------+     +--------+     +--------+
| Pod 1  |     | Pod 2  |     | Pod 3  |
+--------+     +--------+     +--------+
     |               |               |
     +---------------+---------------+
                     |
              +---------------+
              | Redis Cluster |
              +---------------+
```

### Deployment Topology

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cyberchef-mcp
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      containers:
      - name: cyberchef-mcp
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 10"]
```

## Implementation Plan

### Week 1-2: Stateless Refactor
- [ ] Externalize session state
- [ ] Redis integration
- [ ] Health endpoints
- [ ] State migration

### Week 3-4: Kubernetes
- [ ] Helm chart creation
- [ ] Autoscaling configuration
- [ ] Ingress setup
- [ ] Testing

### Week 5: Docker Swarm & Optimizations
- [ ] Swarm deployment
- [ ] Warm pool support
- [ ] Startup optimization
- [ ] Circuit breakers

### Week 6: Testing & Documentation
- [ ] Load testing
- [ ] Failover testing
- [ ] Documentation
- [ ] Performance tuning

## Dependencies

### Required
- `ioredis`: Redis client
- `@kubernetes/client-node` (optional): K8s API
- `opossum`: Circuit breaker
- `helmet`: Security headers

### External Services
- Redis/Valkey cluster
- Kubernetes (optional)
- Load balancer

## Testing Requirements

### Unit Tests
- [ ] State externalization
- [ ] Health endpoints
- [ ] Circuit breaker logic

### Integration Tests
- [ ] Redis session persistence
- [ ] Multi-instance scenarios
- [ ] Failover behavior

### Load Tests
- [ ] Horizontal scaling
- [ ] High concurrency (1000 req/s)
- [ ] Failover under load

### Chaos Tests
- [ ] Pod termination
- [ ] Network partition
- [ ] Redis failure

## Performance Targets

| Metric | Target |
|--------|--------|
| Cold start | <1s |
| Warm start | <100ms |
| Failover time | <5s |
| Session recovery | <1s |
| Max replicas | 10+ |

## Documentation Updates

- [ ] Kubernetes deployment guide
- [ ] Docker Swarm deployment guide
- [ ] Scaling best practices
- [ ] Troubleshooting guide
- [ ] Architecture diagrams
- [ ] Helm chart reference

## GitHub Milestone

Create milestone: `v2.6.0 - Distributed Architecture`

**Issues:**
1. Implement Stateless Server Design (P0, L)
2. Add Load Balancer Integration (P0, M)
3. Create Kubernetes Deployment (Helm) (P0, L)
4. Add Docker Swarm Deployment (P1, M)
5. Implement Warm Pool Support (P1, M)
6. Add Session Affinity & Persistence (P0, M)
7. Implement Circuit Breaker Patterns (P1, S)
8. Add Graceful Shutdown (P0, S)
9. Load Testing & Performance (P0, L)
10. Documentation & Guides (P0, M)

---

**Last Updated:** December 2025
**Status:** Planning
**Next Review:** January 2027
