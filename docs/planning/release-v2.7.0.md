# Release Plan: v2.7.0 - Edge Deployment Optimization

**Release Date:** April 2027
**Theme:** Minimal Footprint for Edge and IoT
**Phase:** Phase 6 - Evolution
**Effort:** L (4 weeks)
**Risk Level:** Low

## Overview

v2.7.0 optimizes CyberChef MCP Server for edge computing and resource-constrained environments. Edge deployments require minimal container sizes, fast startup times, ARM64 support, and offline operation capabilities.

## Goals

1. **Primary Goal**: Reduce container size to <50MB (from ~200MB)
2. **Secondary Goal**: Achieve <1s cold start time
3. **Tertiary Goal**: Enable offline operation mode

## Success Criteria

- [ ] Container size: <50MB (currently ~200MB)
- [ ] Cold start: <1s (currently ~3s)
- [ ] ARM64 performance: 95% of AMD64
- [ ] Offline mode: 100% core operations functional
- [ ] Memory usage: <100MB baseline

## Features

### 1. Multi-Platform Docker Builds
**Priority:** P0 | **Effort:** M

Native builds for multiple architectures.

**Tasks:**
- [ ] Configure Docker BuildKit multi-platform
- [ ] Build for AMD64, ARM64, ARM/v7
- [ ] Create platform-specific optimizations
- [ ] Test on each platform
- [ ] Automate multi-arch CI/CD
- [ ] Create manifest lists for multi-arch images

**Target Platforms:**
| Platform | Use Case |
|----------|----------|
| linux/amd64 | Servers, cloud |
| linux/arm64 | AWS Graviton, Apple Silicon, RPi4 |
| linux/arm/v7 | Raspberry Pi 3, older ARM |

**Dockerfile.multi-arch:**
```dockerfile
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
ARG TARGETPLATFORM
ARG BUILDPLATFORM

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY src ./src
RUN npm run build

FROM --platform=$TARGETPLATFORM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

CMD ["node", "dist/mcp-server.mjs"]
```

### 2. Minimal Container Images
**Priority:** P0 | **Effort:** L

Aggressive size reduction strategies.

**Tasks:**
- [ ] Use Alpine-based base image
- [ ] Implement multi-stage builds
- [ ] Tree-shake unused dependencies
- [ ] Remove development dependencies
- [ ] Use npm ci --omit=dev
- [ ] Prune node_modules
- [ ] Create distroless variant (optional)

**Size Reduction Strategies:**
| Strategy | Size Reduction |
|----------|----------------|
| Alpine base | ~50MB |
| Multi-stage build | ~30MB |
| Dev dep removal | ~40MB |
| Tree shaking | ~20MB |
| npm prune | ~10MB |
| Compression | ~10MB |

**Target Breakdown:**
```
Base image (node:22-alpine): ~50MB
Application code: ~5MB
Production dependencies: ~40MB
Total: ~95MB -> Target: <50MB
```

### 3. Lazy Loading
**Priority:** P0 | **Effort:** M

Load operations on demand.

**Tasks:**
- [ ] Implement operation module lazy loading
- [ ] Create operation registry without loading
- [ ] Load operation on first use
- [ ] Cache loaded operations
- [ ] Unload unused operations (optional)
- [ ] Measure loading overhead

**Implementation:**
```javascript
class OperationLoader {
  constructor() {
    this.loaded = new Map();
    this.metadata = require('./operation-metadata.json');
  }

  async getOperation(name) {
    if (!this.loaded.has(name)) {
      const path = this.metadata[name].path;
      const module = await import(path);
      this.loaded.set(name, module.default);
    }
    return this.loaded.get(name);
  }
}
```

### 4. Startup Optimization
**Priority:** P0 | **Effort:** M

Sub-second cold start.

**Tasks:**
- [ ] Profile startup bottlenecks
- [ ] Defer non-critical initialization
- [ ] Pre-compile critical paths
- [ ] Use V8 code cache
- [ ] Optimize import order
- [ ] Create startup benchmark

**Optimization Techniques:**
- Lazy import for non-essential modules
- Pre-computed operation metadata
- V8 snapshot for faster parsing
- Connection pooling warm-up
- Parallel initialization where possible

### 5. Offline Operation Mode
**Priority:** P1 | **Effort:** M

Function without network connectivity.

**Tasks:**
- [ ] Identify network dependencies
- [ ] Bundle all required assets
- [ ] Handle network failures gracefully
- [ ] Disable network-requiring features
- [ ] Add offline mode configuration
- [ ] Test in air-gapped environment

**Network Dependencies:**
| Component | Online | Offline Mode |
|-----------|--------|--------------|
| Core operations | No network | Fully functional |
| Plugin loading | NPM registry | Disabled/cached |
| Telemetry | OTLP export | Buffer/disable |
| Health checks | Optional | Local only |
| Auth validation | IdP | Token cache |

### 6. Resource-Constrained Profiles
**Priority:** P1 | **Effort:** S

Preset configurations for limited resources.

**Tasks:**
- [ ] Create "minimal" profile
- [ ] Create "balanced" profile
- [ ] Create "performance" profile
- [ ] Add memory limit configurations
- [ ] Add CPU limit handling
- [ ] Document profile selection

**Profiles:**
```json
{
  "profiles": {
    "minimal": {
      "lazyLoading": true,
      "cacheSize": 10,
      "maxOperations": 100,
      "telemetry": false,
      "memoryLimit": "128Mi"
    },
    "balanced": {
      "lazyLoading": true,
      "cacheSize": 100,
      "maxOperations": 300,
      "telemetry": true,
      "memoryLimit": "512Mi"
    },
    "performance": {
      "lazyLoading": false,
      "cacheSize": 500,
      "maxOperations": "all",
      "telemetry": true,
      "memoryLimit": "2Gi"
    }
  }
}
```

### 7. Memory Footprint Optimization
**Priority:** P1 | **Effort:** M

Reduce baseline memory usage.

**Tasks:**
- [ ] Profile memory usage
- [ ] Identify memory leaks
- [ ] Optimize large data handling
- [ ] Implement buffer pooling
- [ ] Add memory monitoring
- [ ] Create memory pressure handling

**Memory Optimization Strategies:**
- Streaming for large inputs
- Buffer reuse pools
- Weak references for caches
- Aggressive garbage collection hints
- Memory-mapped files for large operations

### 8. Edge Caching
**Priority:** P2 | **Effort:** S

Caching strategies for edge deployments.

**Tasks:**
- [ ] Implement local file cache
- [ ] Add cache warming
- [ ] Create cache invalidation
- [ ] Handle cache size limits
- [ ] Add cache statistics

## Technical Design

### Container Optimization

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
RUN npm run build && npm prune --production

# Stage 2: Runtime (minimal)
FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["dist/mcp-server.mjs"]
```

### Architecture

```
+--------------------+
| Edge Deployment    |
+--------------------+
         |
+--------------------+
| CyberChef MCP      |
| - Lazy loading     |
| - Minimal deps     |
| - Local cache      |
+--------------------+
         |
+--------------------+
| Local Storage      |
| - Operations cache |
| - Recipe cache     |
+--------------------+
```

## Implementation Plan

### Week 1: Multi-Platform & Size
- [ ] BuildKit configuration
- [ ] Multi-arch builds
- [ ] Size reduction
- [ ] Alpine optimization

### Week 2: Startup & Loading
- [ ] Lazy loading implementation
- [ ] Startup profiling
- [ ] V8 optimization
- [ ] Benchmark creation

### Week 3: Offline & Memory
- [ ] Offline mode
- [ ] Resource profiles
- [ ] Memory optimization
- [ ] Testing

### Week 4: Integration & Testing
- [ ] Platform testing
- [ ] Edge caching
- [ ] Documentation
- [ ] Performance validation

## Dependencies

### Required
- Docker BuildKit
- QEMU (for cross-platform builds)
- Node.js 22 (Alpine)

### Optional
- Distroless base images
- V8 snapshot tools

## Testing Requirements

### Platform Tests
- [ ] AMD64 functionality
- [ ] ARM64 functionality
- [ ] ARM/v7 functionality

### Performance Tests
- [ ] Container size measurement
- [ ] Startup time benchmark
- [ ] Memory usage profiling
- [ ] Latency comparison

### Offline Tests
- [ ] Air-gapped operation
- [ ] Network failure handling
- [ ] Cache functionality

## Performance Targets

| Metric | Current | Target |
|--------|---------|--------|
| Image size | ~200MB | <50MB |
| Cold start | ~3s | <1s |
| Memory (idle) | ~150MB | <100MB |
| ARM64 perf | N/A | 95% of AMD64 |

## Documentation Updates

- [ ] Edge deployment guide
- [ ] Platform compatibility matrix
- [ ] Resource profile reference
- [ ] Offline mode documentation
- [ ] Performance tuning guide

## GitHub Milestone

Create milestone: `v2.7.0 - Edge Deployment`

**Issues:**
1. Implement Multi-Platform Docker Builds (P0, M)
2. Create Minimal Container Images (P0, L)
3. Add Lazy Loading System (P0, M)
4. Implement Startup Optimization (P0, M)
5. Add Offline Operation Mode (P1, M)
6. Create Resource-Constrained Profiles (P1, S)
7. Optimize Memory Footprint (P1, M)
8. Implement Edge Caching (P2, S)
9. Platform Testing & Validation (P0, L)
10. Documentation (P0, M)

---

**Last Updated:** December 2025
**Status:** Planning
**Next Review:** March 2027
