# Release Plan: v1.4.0 - Performance Optimization

**Release Date:** March 2026 (Target: Week of Mar 24)
**Theme:** Performance Optimization & Resource Management
**Phase:** Phase 1 - Foundation
**Effort:** L (2 weeks)
**Risk Level:** Low

## Overview

Optimize MCP server performance to handle large operations (100MB+), leverage Node.js 22 streaming improvements, implement worker threads for CPU-intensive operations, and establish performance benchmarking infrastructure.

## Goals

1. **Primary Goal**: Handle 100MB operations without crashes or excessive memory
2. **Secondary Goal**: Leverage Node.js 22 streaming performance gains (100%+ improvement)
3. **Tertiary Goal**: Establish performance benchmark suite

## Success Criteria

- [ ] Process 100MB inputs successfully
- [ ] Memory usage stays below 512MB for typical operations
- [ ] Startup time <2 seconds
- [ ] Operation latency <100ms for simple ops, <5s for complex
- [ ] Benchmark suite integrated into CI

## Features & Improvements

### 1. Streaming API Implementation
**Priority:** P0 | **Effort:** L (7 days)

Leverage Node.js 22 WebStreams performance improvements (100%+ gains) for large operations.

**Implementation:**
```javascript
// mcp-server.mjs
async function handleLargeOperation(input, operation) {
  if (input.length > 10_000_000) {  // 10MB threshold
    // Use streaming approach
    const readable = Readable.from([input]);
    const chunks = [];

    for await (const chunk of readable) {
      const result = await operation.run(chunk);
      chunks.push(result);
    }

    return chunks.join('');
  } else {
    // Traditional approach for small inputs
    return operation.run(input);
  }
}
```

**Tasks:**
- [ ] Identify streaming-capable operations (compression, encoding, hashing)
- [ ] Implement chunked processing
- [ ] Configure high-water marks appropriately
- [ ] Handle backpressure correctly
- [ ] Add streaming tests with large inputs

**Acceptance Criteria:**
- 100MB inputs processed without OOM
- Memory usage remains stable during streaming
- Performance improvement vs non-streaming approach

---

### 2. Worker Threads for CPU-Intensive Operations
**Priority:** P1 | **Effort:** M (5 days)

Offload CPU-intensive operations (crypto, compression) to worker threads to prevent event loop blocking.

**Implementation:**
```javascript
// workers/operation-worker.mjs
import { parentPort, workerData } from 'worker_threads';

parentPort.on('message', async ({ operation, input, args }) => {
  const result = await runOperation(operation, input, args);
  parentPort.postMessage({ result });
});
```

**Tasks:**
- [ ] Identify CPU-intensive operations (AES, RSA, Gzip, etc.)
- [ ] Create worker pool (4 workers default)
- [ ] Implement task queue with Piscina or similar
- [ ] Add timeout handling (30s max)
- [ ] Test with concurrent requests

**Acceptance Criteria:**
- CPU-intensive ops don't block event loop
- Concurrent operations processed in parallel
- Worker pool scales based on CPU cores
- Graceful timeout handling

---

### 3. Memory Management & Optimization
**Priority:** P0 | **Effort:** M (4 days)

Implement object pooling, optimize garbage collection, and manage memory for large operations.

**Implementation:**
```javascript
// Use object pooling for frequently allocated objects
const bufferPool = {
  buffers: [],
  acquire(size) {
    return this.buffers.pop() || Buffer.allocUnsafe(size);
  },
  release(buffer) {
    buffer.fill(0);  // Clear before reuse
    this.buffers.push(buffer);
  }
};

// Configure GC appropriately
process.env.NODE_OPTIONS = '--max-old-space-size=512 --gc-interval=100';
```

**Tasks:**
- [ ] Implement buffer pooling for large operations
- [ ] Add memory monitoring with process.memoryUsage()
- [ ] Configure appropriate heap size limits
- [ ] Implement LRU cache for frequently used operations
- [ ] Add memory leak detection tests

---

### 4. Performance Benchmark Suite
**Priority:** P1 | **Effort:** M (5 days)

Create comprehensive performance benchmarks for CI/CD integration.

**Implementation:**
```javascript
// benchmarks/operation-benchmarks.mjs
import { Suite } from 'benchmark';

const suite = new Suite();

suite
  .add('To Base64 (1KB)', () => {
    callTool('cyberchef_to_base64', { input: testData1KB });
  })
  .add('To Base64 (1MB)', () => {
    callTool('cyberchef_to_base64', { input: testData1MB });
  })
  .add('AES Encrypt (1MB)', () => {
    callTool('cyberchef_aes_encrypt', { input: testData1MB, key: 'test' });
  })
  .on('complete', function() {
    console.log('Fastest is ' + this.filter('fastest').map('name'));
  })
  .run();
```

**Tasks:**
- [ ] Set up Benchmark.js or Tinybench
- [ ] Create benchmarks for common operations (20+ ops)
- [ ] Test various input sizes (1KB, 100KB, 1MB, 10MB)
- [ ] Add CI/CD integration with performance tracking
- [ ] Create performance regression detection

**Acceptance Criteria:**
- Benchmarks for 20+ operations
- Tests multiple input sizes
- Integrated into CI/CD
- Regression detection configured
- Results tracked over time

---

### 5. Connection Pooling & Resource Limits
**Priority:** P2 | **Effort:** S (3 days)

Implement resource limits to prevent abuse and ensure stability.

**Tasks:**
- [ ] Add max request size limit (100MB default)
- [ ] Implement request queue (max 100 pending)
- [ ] Add timeout for long-running operations
- [ ] Monitor resource usage (CPU, memory)
- [ ] Add rate limiting hooks (future use)

---

## Breaking Changes

None. Performance optimizations are transparent to users.

## Dependencies

- Node.js 22 (for streaming improvements)
- Piscina (worker thread pool) or custom implementation
- Benchmark.js or Tinybench

## Testing Requirements

### Performance Tests
- [ ] 100MB input processing
- [ ] Concurrent operations (10+ simultaneous)
- [ ] Memory leak detection
- [ ] CPU utilization under load
- [ ] Startup time regression

### Functional Tests
- [ ] All operations still work correctly
- [ ] Streaming produces same results as non-streaming
- [ ] Worker threads don't introduce race conditions
- [ ] Timeout handling works

## Documentation Updates

- [ ] Add performance tuning guide
- [ ] Document resource limits
- [ ] Add benchmarking documentation
- [ ] Update architecture.md with performance architecture

## Migration Guide

No migration required. Users may see performance improvements automatically.

**Recommended Actions:**
- Increase `--max-old-space-size` if processing >100MB regularly
- Monitor memory usage in production
- Report performance regressions via GitHub issues

## Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| Week 1 | Streaming, worker threads | Large input support, CPU offloading |
| Week 2 | Memory management, benchmarks | Optimized GC, benchmark suite |

## Related Documents

- [Phase 1: Foundation](./phase-1-foundation.md)
- [v1.3.0 Release Plan](./release-v1.3.0.md)
- [v1.5.0 Release Plan](./release-v1.5.0.md)

## GitHub Milestone

Create milestone: `v1.4.0 - Performance Optimization`

**Issues to Create:**
1. Implement Streaming API for Large Operations (P0, L)
2. Add Worker Threads for CPU-Intensive Ops (P1, M)
3. Optimize Memory Management (P0, M)
4. Create Performance Benchmark Suite (P1, M)
5. Implement Resource Limits (P2, S)
6. Add Performance Documentation (P2, S)

---

**Last Updated:** December 2025
**Status:** Planning
