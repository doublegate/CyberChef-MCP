/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Performance benchmarks for CyberChef MCP operations.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { Bench } from "tinybench";
import { bake } from "../src/node/index.mjs";

// Results are COLLECTED as well as printed. Until v3.2.0 every run printed a table and threw the
// numbers away, which is why `performance-benchmarks.yml` could say in its own output that it
// "cannot fail on a regression": there was nothing to compare. `--json` emits what
// `benchmarks/check-regression.mjs` gates on.
const AS_JSON = process.argv.includes("--json");
const collected = [];

/**
 * Run a bench, print it for humans, and keep the numbers.
 *
 * `throughput.mean` is the gated figure rather than latency: it is the one that reads the right
 * way round (higher is better) and the one every prior release note quoted.
 *
 * @param {string} suite - Group heading this bench belongs to.
 * @param {Object} bench - A tinybench instance, already constructed.
 * @returns {Promise<void>} Resolves when the bench has run.
 */
async function runAndCollect(suite, bench) {
    await bench.run();
    if (!AS_JSON) console.table(bench.table());
    for (const task of bench.tasks) {
        const r = task.result;
        if (!r) continue;
        collected.push({
            suite,
            task: task.name,
            // MEDIAN, not mean. The mean is dragged by the first samples while the JIT is still
            // warming and by any scheduler hiccup; on this machine `Gzip (100KB)` reported a mean
            // relative margin of error of 15.69% against a median that barely moved. A gate reads
            // the statistic that is stable, and records the other so a reader can see the spread.
            throughputMedian: r.throughput.p50,
            throughputMean: r.throughput.mean,
            throughputRme: r.throughput.rme,
            latencyMedian: r.latency.p50,
            samples: r.latency.samplesCount ?? r.latency.samples?.length ?? 0
        });
    }
}

// Test data of various sizes
const testData1KB = "A".repeat(1024);
const testData10KB = "A".repeat(10 * 1024);
const testData100KB = "A".repeat(100 * 1024);
// 1 MB and 10 MB fixtures were declared here and never used by any benchmark. Deleting them is not
// only a lint tidy-up: `"A".repeat()` builds the string eagerly, so every run allocated 11 MB and
// then threw it away. Add them back beside the benchmark that needs them, not ahead of it.

/**
 * Timeout wrapper to prevent operations from hanging.
 */
async function withTimeout(fn, timeoutMs = 30000) {
    return Promise.race([
        fn(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Operation timeout exceeded')), timeoutMs)
        )
    ]);
}

/**
 * Helper to execute a CyberChef operation with timeout protection.
 */
async function executeOperation(opName, input, args = []) {
    const recipe = [{ op: opName, args }];
    return await withTimeout(() => bake(input, recipe));
}

/**
 * Create benchmark suite for a specific operation.
 * Using moderate test sizes (1KB, 10KB, 100KB) to prevent memory issues.
 */
function createOperationBenchmark(opName, args = [], label = opName) {
    // Reduced warmup time to 500ms to prevent memory pressure from excessive iterations
    const bench = new Bench({ time: 500, iterations: 10 });

    // `label` exists because SHA2 is registered twice -- once for 256 and once for 512 -- and both
    // produced tasks called `SHA2 (1KB)`. Printed side by side that reads as a repeat; consumed by
    // anything keyed on the name it silently conflates two different operations, which is exactly
    // what the first regression baseline did: SHA2 appeared to swing 84% run to run, and the swing
    // was SHA-256 and SHA-512 taking turns in the same slot.
    bench
        .add(`${label} (1KB)`, async () => {
            await executeOperation(opName, testData1KB, args);
        })
        .add(`${label} (10KB)`, async () => {
            await executeOperation(opName, testData10KB, args);
        })
        .add(`${label} (100KB)`, async () => {
            await executeOperation(opName, testData100KB, args);
        });

    return bench;
}

/**
 * Create benchmark suite for compression operations with smaller test sizes.
 * Compression operations are slower, so we use smaller data sizes to prevent timeouts.
 */
function createCompressionBenchmark(opName, args = []) {
    // Further reduced settings for compression operations
    const bench = new Bench({ time: 500, iterations: 5 });

    bench
        .add(`${opName} (1KB)`, async () => {
            await executeOperation(opName, testData1KB, args);
        })
        .add(`${opName} (10KB)`, async () => {
            await executeOperation(opName, testData10KB, args);
        })
        .add(`${opName} (100KB)`, async () => {
            await executeOperation(opName, testData100KB, args);
        });

    return bench;
}

/**
 * Run encoding benchmarks.
 */
async function runEncodingBenchmarks() {
    if (!AS_JSON) {
    console.log("\n=== Encoding Operations ===");
    }

    const base64Bench = createOperationBenchmark("To Base64");
    await runAndCollect("encoding", base64Bench);

    const hexBench = createOperationBenchmark("To Hex", ["None"]);
    await runAndCollect("encoding", hexBench);
}

/**
 * Run hashing benchmarks.
 */
async function runHashingBenchmarks() {
    if (!AS_JSON) {
    console.log("\n=== Hashing Operations ===");
    }

    const md5Bench = createOperationBenchmark("MD5");
    await runAndCollect("hashing", md5Bench);

    const sha256Bench = createOperationBenchmark("SHA2", ["256"], "SHA2-256");
    await runAndCollect("hashing", sha256Bench);

    const sha512Bench = createOperationBenchmark("SHA2", ["512"], "SHA2-512");
    await runAndCollect("hashing", sha512Bench);
}

/**
 * Run compression benchmarks.
 * Note: Using smaller test sizes (1KB, 10KB, 100KB) to prevent timeouts.
 */
async function runCompressionBenchmarks() {
    if (!AS_JSON) {
    console.log("\n=== Compression Operations ===");
        console.log("(Using smaller test sizes for compression operations)");
    }

    const gzipBench = createCompressionBenchmark("Gzip", [
        "Dynamic Huffman Coding",
        "",
        "",
        false
    ]);

    try {
        await runAndCollect("compression", gzipBench);
    } catch (error) {
        if (error.message.includes('timeout')) {
            console.error("Gzip benchmark exceeded timeout - skipping");
        } else {
            throw error;
        }
    }
}

/**
 * Run crypto benchmarks.
 */
async function runCryptoBenchmarks() {
    if (!AS_JSON) {
    console.log("\n=== Cryptographic Operations ===");
    }

    const aesBench = createOperationBenchmark("AES Encrypt", [
        { option: "Hex", string: "00112233445566778899aabbccddeeff" },
        { option: "Hex", string: "00000000000000000000000000000000" },
        "CBC",
        "Raw",
        "Hex",
        { option: "Hex", string: "" }
    ]);
    await runAndCollect("crypto", aesBench);
}

/**
 * Run text operation benchmarks.
 */
async function runTextBenchmarks() {
    if (!AS_JSON) {
    console.log("\n=== Text Operations ===");
    }

    const regexBench = createOperationBenchmark("Regular expression", [
        "test",
        "i",
        true,
        true,
        false,
        false,
        false,
        false,
        "Highlight matches"
    ]);
    await runAndCollect("text", regexBench);
}

/**
 * Run analysis benchmarks.
 */
async function runAnalysisBenchmarks() {
    if (!AS_JSON) {
    console.log("\n=== Analysis Operations ===");
    }

    const entropyBench = createOperationBenchmark("Entropy", ["Shannon scale"]);
    await runAndCollect("analysis", entropyBench);

    const freqBench = createOperationBenchmark("Frequency distribution", ["Space"]);
    await runAndCollect("analysis", freqBench);
}

/**
 * Run all benchmarks.
 */
async function runAllBenchmarks() {
    if (!AS_JSON) {
        console.log("CyberChef MCP Performance Benchmarks");
        console.log("=====================================");
    }

    const startTime = Date.now();

    try {
        await runEncodingBenchmarks();
        await runHashingBenchmarks();
        await runCompressionBenchmarks();
        await runCryptoBenchmarks();
        await runTextBenchmarks();
        await runAnalysisBenchmarks();

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        if (AS_JSON) {
            process.stdout.write(`${JSON.stringify({
                node: process.version,
                capturedAt: new Date().toISOString(),
                totalSeconds: Number(totalTime),
                results: collected
            }, null, 2)}\n`);
        } else {
            console.log(`\n=== Benchmarks Complete ===`);
            console.log(`Total time: ${totalTime}s`);
        }
    } catch (error) {
        console.error("Benchmark error:", error);
        process.exit(1);
    }
}

// Run benchmarks if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllBenchmarks();
}

export { runAllBenchmarks, runEncodingBenchmarks, runHashingBenchmarks };
