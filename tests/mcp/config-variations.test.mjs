/**
 * Configuration Variation Tests
 *
 * Tests that environment variable combinations are correctly parsed
 * and applied in the MCP server configuration.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { describe, it, expect } from "vitest";
import {
    VERSION,
    MAX_INPUT_SIZE,
    OPERATION_TIMEOUT,
    STREAMING_THRESHOLD,
    ENABLE_STREAMING,
    ENABLE_WORKERS,
    CACHE_MAX_SIZE,
    CACHE_MAX_ITEMS,
    BATCH_MAX_SIZE,
    BATCH_ENABLED,
    TELEMETRY_ENABLED,
    RATE_LIMIT_ENABLED,
    RATE_LIMIT_REQUESTS,
    RATE_LIMIT_WINDOW,
    CACHE_ENABLED,
    V2_COMPATIBILITY_MODE,
    SUPPRESS_DEPRECATIONS,
    LRUCache,
    TelemetryCollector,
    RateLimiter,
    ResourceQuotaTracker,
    BatchProcessor,
    MemoryMonitor,
    quotaTracker
} from "../../src/node/mcp-server.mjs";

describe("Configuration Variations", () => {
    describe("Default Values", () => {
        it("should have correct default MAX_INPUT_SIZE (100MB)", () => {
            expect(MAX_INPUT_SIZE).toBe(100 * 1024 * 1024);
        });

        it("should have correct default OPERATION_TIMEOUT (30s)", () => {
            expect(OPERATION_TIMEOUT).toBe(30000);
        });

        it("should have correct default STREAMING_THRESHOLD (10MB)", () => {
            expect(STREAMING_THRESHOLD).toBe(10 * 1024 * 1024);
        });

        it("should have streaming enabled by default", () => {
            expect(ENABLE_STREAMING).toBe(true);
        });

        it("should have workers disabled by default", () => {
            expect(ENABLE_WORKERS).toBe(false);
        });

        it("should have cache enabled by default", () => {
            expect(CACHE_ENABLED).toBe(true);
        });

        it("should have batch enabled by default", () => {
            expect(BATCH_ENABLED).toBe(true);
        });

        it("should have telemetry disabled by default (privacy-first)", () => {
            expect(TELEMETRY_ENABLED).toBe(false);
        });

        it("should have rate limiting disabled by default", () => {
            expect(RATE_LIMIT_ENABLED).toBe(false);
        });

        it("should have V2 compatibility mode disabled by default", () => {
            expect(V2_COMPATIBILITY_MODE).toBe(false);
        });

        it("should have deprecation warnings enabled by default", () => {
            expect(SUPPRESS_DEPRECATIONS).toBe(false);
        });
    });

    describe("Cache Configuration", () => {
        it("should have valid default cache size (100MB)", () => {
            expect(CACHE_MAX_SIZE).toBe(100 * 1024 * 1024);
        });

        it("should have valid default cache max items (1000)", () => {
            expect(CACHE_MAX_ITEMS).toBe(1000);
        });

        it("should create cache with custom size limits", () => {
            const cache = new LRUCache(1024, 5);
            expect(cache.maxSize).toBe(1024);
            expect(cache.maxItems).toBe(5);
        });

        it("should return cache stats", () => {
            const cache = new LRUCache(1024 * 1024, 100);
            cache.set("k1", "v1");
            const stats = cache.getStats();
            expect(stats.items).toBe(1);
            expect(stats.size).toBeGreaterThan(0);
        });
    });

    describe("Rate Limiter Configuration", () => {
        it("should have default rate limit of 100 req/60s", () => {
            expect(RATE_LIMIT_REQUESTS).toBe(100);
            expect(RATE_LIMIT_WINDOW).toBe(60000);
        });

        it("should create rate limiter with custom limits", () => {
            const limiter = new RateLimiter(10, 1000);
            expect(limiter.maxRequests).toBe(10);
            expect(limiter.windowMs).toBe(1000);
        });

        it("should track connections", () => {
            const limiter = new RateLimiter();
            const stats = limiter.getStats();
            expect(stats.activeConnections).toBeDefined();
            expect(typeof stats.activeConnections).toBe("number");
        });
    });

    describe("Batch Processor Configuration", () => {
        it("should have default batch max size of 100", () => {
            expect(BATCH_MAX_SIZE).toBe(100);
        });

        it("should create batch processor with executeBatch method", () => {
            const bp = new BatchProcessor();
            expect(typeof bp.executeBatch).toBe("function");
        });
    });

    describe("Telemetry Collector", () => {
        it("should track stats on a new collector", () => {
            const collector = new TelemetryCollector();
            const stats = collector.getStats();
            expect(stats.totalCalls).toBe(0);
        });

        it("should export empty metrics array on new collector", () => {
            const collector = new TelemetryCollector();
            expect(collector.exportMetrics()).toHaveLength(0);
        });

        it("should clear collected metrics", () => {
            const collector = new TelemetryCollector();
            collector.clear();
            expect(collector.exportMetrics()).toHaveLength(0);
        });
    });

    describe("Resource Quota Tracker", () => {
        it("should have default max concurrent ops of 10", () => {
            expect(quotaTracker.maxConcurrentOps).toBe(10);
        });

        it("should track input and output data", () => {
            const tracker = new ResourceQuotaTracker();
            tracker.trackData(1000, 2000);
            const info = tracker.getInfo();
            expect(info.totalInputSize).toBe(1000);
            expect(info.totalOutputSize).toBe(2000);
        });

        it("should reset tracked data", () => {
            const tracker = new ResourceQuotaTracker();
            tracker.trackData(500, 500);
            tracker.reset();
            const info = tracker.getInfo();
            expect(info.totalOperations).toBe(0);
        });
    });

    describe("Memory Monitor", () => {
        it("should track memory without error", () => {
            const monitor = new MemoryMonitor();
            expect(() => monitor.check()).not.toThrow();
        });

        it("should provide heap usage via getUsage()", () => {
            const monitor = new MemoryMonitor();
            const usage = monitor.getUsage();
            expect(usage.heapUsed).toBeGreaterThan(0);
            expect(usage.heapTotal).toBeGreaterThan(0);
            expect(usage.rss).toBeGreaterThan(0);
        });
    });

    describe("Version", () => {
        it("should have a valid semver version", () => {
            expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
        });
    });
});
