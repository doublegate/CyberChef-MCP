# Performance Tuning Guide

This guide provides recommendations for optimizing CyberChef MCP Server performance in various deployment scenarios.

## Quick Start

### Default Configuration

The default configuration is optimized for general-purpose use with moderate resource constraints:

```bash
Max Input Size: 100MB
Operation Timeout: 30s
Streaming Threshold: 10MB
Cache Size: 100MB (1000 items)
Streaming: Enabled
Worker Threads: Enabled (infrastructure only in v1.4.0)
```

This configuration works well for:
- Claude Desktop integration
- General data manipulation tasks
- Moderate file sizes (<50MB)
- Typical workstation environments

### Production Configuration

For production deployments handling large files:

```bash
CYBERCHEF_MAX_INPUT_SIZE=524288000      # 500MB
CYBERCHEF_STREAMING_THRESHOLD=52428800   # 50MB
CYBERCHEF_CACHE_MAX_SIZE=524288000      # 500MB
CYBERCHEF_CACHE_MAX_ITEMS=5000          # 5000 items
CYBERCHEF_OPERATION_TIMEOUT=120000      # 2 minutes
```

## Configuration Parameters

### Input Size Limits

**Environment Variable:** `CYBERCHEF_MAX_INPUT_SIZE`
**Default:** 104857600 (100MB)
**Range:** 1048576 - 1073741824 (1MB - 1GB)

Controls the maximum input size accepted by the server.

**Recommendations:**
- **Low memory (<4GB)**: 10MB - 50MB
- **Standard (4-8GB)**: 100MB - 200MB
- **High memory (>8GB)**: 500MB - 1GB

**Docker memory sizing:**
- Add 512MB overhead: `docker run --memory=$((INPUT_SIZE + 512))m`
- Example: 500MB input → `--memory=1g`

### Operation Timeout

**Environment Variable:** `CYBERCHEF_OPERATION_TIMEOUT`
**Default:** 30000 (30 seconds)
**Range:** 1000 - 600000 (1s - 10 minutes)

Maximum time allowed for a single operation.

**Recommendations:**
- **Simple operations**: 10s - 30s
- **Complex crypto/compression**: 60s - 120s
- **Batch processing**: 300s - 600s

**CPU-intensive operations may need longer timeouts:**
- RSA key generation: 60s+
- Large file compression: 120s+
- Complex regex on large inputs: 60s+

### Streaming Threshold

**Environment Variable:** `CYBERCHEF_STREAMING_THRESHOLD`
**Default:** 10485760 (10MB)
**Range:** 1048576 - 104857600 (1MB - 100MB)

Input size threshold for automatic streaming.

**Recommendations:**
- **Limited memory**: 5MB - 10MB
- **Standard memory**: 10MB - 50MB
- **High memory**: 50MB - 100MB

**Lower threshold = more streaming = less memory, slightly slower**
**Higher threshold = less streaming = more memory, slightly faster**

### Cache Configuration

#### Cache Size

**Environment Variable:** `CYBERCHEF_CACHE_MAX_SIZE`
**Default:** 104857600 (100MB)
**Range:** 10485760 - 1073741824 (10MB - 1GB)

Maximum total size of cached operation results.

#### Cache Items

**Environment Variable:** `CYBERCHEF_CACHE_MAX_ITEMS`
**Default:** 1000
**Range:** 100 - 10000

Maximum number of cached operation results.

**Recommendations:**
- **Repetitive workloads**: Larger cache (500MB, 5000 items)
- **Diverse workloads**: Smaller cache (50MB, 500 items)
- **Low memory**: Minimal cache (10MB, 100 items)

### Feature Toggles

#### Streaming

**Environment Variable:** `CYBERCHEF_ENABLE_STREAMING`
**Default:** true
**Values:** true, false

Disable if you encounter issues with streaming operations.

#### Worker Threads

**Environment Variable:** `CYBERCHEF_ENABLE_WORKERS`
**Default:** true
**Values:** true, false

Reserved for future worker pool implementation.

## Deployment Scenarios

### Scenario 1: Claude Desktop (Default)

**Environment:** Personal workstation, 8-16GB RAM
**Use Case:** General data manipulation, moderate files

```bash
# Use defaults - no configuration needed
docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v1:latest
```

**Expected Performance:**
- <10MB operations: <100ms
- 10-100MB operations: 1-5s (streaming)
- Cache hits: <10ms

### Scenario 2: Low-Memory Environment

**Environment:** Raspberry Pi, VPS with 1-2GB RAM
**Use Case:** Light tasks, small files

```bash
docker run -i --rm --memory=512m \
  -e CYBERCHEF_MAX_INPUT_SIZE=10485760 \
  -e CYBERCHEF_STREAMING_THRESHOLD=5242880 \
  -e CYBERCHEF_CACHE_MAX_SIZE=10485760 \
  -e CYBERCHEF_CACHE_MAX_ITEMS=100 \
  ghcr.io/doublegate/cyberchef-mcp_v1:latest
```

**Expected Performance:**
- <5MB operations: <100ms
- 5-10MB operations: 500ms-2s
- Memory usage: <200MB

### Scenario 3: High-Throughput Server

**Environment:** Server with 16GB+ RAM
**Use Case:** Large files, high concurrency

```bash
docker run -i --rm --memory=4g \
  -e CYBERCHEF_MAX_INPUT_SIZE=524288000 \
  -e CYBERCHEF_STREAMING_THRESHOLD=52428800 \
  -e CYBERCHEF_CACHE_MAX_SIZE=524288000 \
  -e CYBERCHEF_CACHE_MAX_ITEMS=5000 \
  -e CYBERCHEF_OPERATION_TIMEOUT=120000 \
  ghcr.io/doublegate/cyberchef-mcp_v1:latest
```

**Expected Performance:**
- <50MB operations: <200ms
- 50-500MB operations: 2-10s (streaming)
- Memory usage: <2GB
- High cache hit rate for repeated operations

### Scenario 4: Batch Processing

**Environment:** Dedicated processing server
**Use Case:** Large batch operations, long-running tasks

```bash
docker run -i --rm --memory=8g \
  -e CYBERCHEF_MAX_INPUT_SIZE=1073741824 \
  -e CYBERCHEF_STREAMING_THRESHOLD=104857600 \
  -e CYBERCHEF_CACHE_MAX_SIZE=1073741824 \
  -e CYBERCHEF_CACHE_MAX_ITEMS=10000 \
  -e CYBERCHEF_OPERATION_TIMEOUT=600000 \
  ghcr.io/doublegate/cyberchef-mcp_v1:latest
```

**Expected Performance:**
- Large files (100MB-1GB): 10-60s (streaming)
- Very high cache hit rate
- Memory usage: <4GB

## Performance Monitoring

### Memory Usage Logs

The server logs memory usage every 5 seconds to stderr:

```
[Memory] Heap: 85MB / 128MB, RSS: 120MB
```

**Monitor these values:**
- **Heap Used**: Should stay below 80% of Heap Total
- **RSS**: Should stay below Docker memory limit

**Warning signs:**
- Heap constantly at 90%+ → Increase memory or reduce cache
- RSS approaching Docker limit → Increase `--memory` setting
- Frequent GC pauses → Reduce cache size

### Cache Performance

Cache hits are logged:

```
[Cache] Hit for To Base64
```

**Good cache performance indicators:**
- Hit rate >50% for repetitive workloads
- Hit rate 10-30% for diverse workloads
- Zero hits → Consider disabling cache to save memory

### Streaming Detection

Streaming operations are logged:

```
[Streaming] Using streaming for Gzip (45MB)
```

**Monitor streaming activation:**
- Should trigger for inputs exceeding threshold
- If not activating, check threshold configuration
- If activating too often, increase threshold

## Performance Optimization Tips

### 1. Adjust Streaming Threshold

**For better memory efficiency:**
```bash
CYBERCHEF_STREAMING_THRESHOLD=5242880  # 5MB - more streaming
```

**For better performance (if memory available):**
```bash
CYBERCHEF_STREAMING_THRESHOLD=52428800  # 50MB - less streaming
```

### 2. Optimize Cache Size

**For repetitive workloads:**
```bash
CYBERCHEF_CACHE_MAX_SIZE=524288000  # 500MB
CYBERCHEF_CACHE_MAX_ITEMS=5000
```

**For diverse workloads (to save memory):**
```bash
CYBERCHEF_CACHE_MAX_SIZE=52428800   # 50MB
CYBERCHEF_CACHE_MAX_ITEMS=500
```

### 3. Set Appropriate Timeouts

**For interactive use (fail fast):**
```bash
CYBERCHEF_OPERATION_TIMEOUT=10000  # 10s
```

**For batch processing (allow completion):**
```bash
CYBERCHEF_OPERATION_TIMEOUT=300000  # 5 minutes
```

### 4. Docker Resource Limits

Always set Docker memory limit to prevent OOM:

```bash
docker run --memory=2g --memory-swap=2g ...
```

**Formula:** `memory = max_input_size + cache_size + 512MB overhead`

### 5. Disable Features You Don't Need

**Disable caching (save memory):**
```bash
CYBERCHEF_CACHE_MAX_SIZE=0
CYBERCHEF_CACHE_MAX_ITEMS=0
```

**Disable streaming (simplify debugging):**
```bash
CYBERCHEF_ENABLE_STREAMING=false
```

## Benchmarking

### Run Benchmarks

```bash
npm run benchmark
```

### Interpret Results

Tinybench output shows:

```
┌───────────────────────┬──────────┬────────────┐
│ Task Name             │ ops/sec  │ Average    │
├───────────────────────┼──────────┼────────────┤
│ To Base64 (1KB)       │ 50000    │ 0.02ms     │
│ To Base64 (100KB)     │ 5000     │ 0.20ms     │
│ To Base64 (1MB)       │ 350      │ 2.86ms     │
└───────────────────────┴──────────┴────────────┘
```

**Key metrics:**
- **ops/sec**: Operations per second (higher = better)
- **Average**: Average operation time (lower = better)

**Compare across versions to detect regressions.**

## Troubleshooting

### Out of Memory Errors

**Symptoms:**
- Server crashes
- Docker container exits with code 137

**Solutions:**
1. Reduce `CYBERCHEF_MAX_INPUT_SIZE`
2. Increase Docker `--memory` limit
3. Reduce `CYBERCHEF_CACHE_MAX_SIZE`
4. Lower `CYBERCHEF_STREAMING_THRESHOLD`

### Timeout Errors

**Symptoms:**
- Operations fail with "Operation timed out after Xms"

**Solutions:**
1. Increase `CYBERCHEF_OPERATION_TIMEOUT`
2. Use smaller inputs
3. Check if operation is appropriate for input size

### Poor Performance

**Symptoms:**
- Operations take longer than expected
- High latency

**Solutions:**
1. Check memory logs for GC pressure
2. Verify streaming is activating for large inputs
3. Ensure cache is enabled and hitting
4. Review timeout settings
5. Run benchmarks to establish baseline

### High Memory Usage

**Symptoms:**
- Memory usage constantly high
- Frequent GC pauses

**Solutions:**
1. Reduce cache size
2. Lower streaming threshold
3. Monitor for memory leaks (RSS growing unbounded)
4. Restart server periodically if needed

## Advanced Tuning

### Node.js Heap Configuration

For very large workloads, adjust Node.js heap:

```bash
docker run -i --rm --memory=8g \
  -e NODE_OPTIONS="--max-old-space-size=6144" \
  ...
```

**Recommendation:** Set heap to 75% of Docker memory limit.

### Garbage Collection Tuning

For latency-sensitive workloads:

```bash
-e NODE_OPTIONS="--max-old-space-size=4096 --gc-interval=100"
```

For throughput-optimized workloads:

```bash
-e NODE_OPTIONS="--max-old-space-size=4096 --expose-gc"
```

## Conclusion

Performance tuning is about balancing:
- **Memory usage** vs **Speed**
- **Reliability** (timeouts) vs **Completion** (long operations)
- **Cache size** vs **Hit rate**

Start with defaults, monitor, and adjust based on your workload characteristics.

## Resources

- [Release Notes v1.4.0](releases/v1.4.0.md)
- [Architecture Documentation](architecture.md)
- [CHANGELOG](../CHANGELOG.md)
