/**
 * Performance benchmarks for CyberChef MCP operations.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { Bench } from "tinybench";
import { bake } from "../src/node/index.mjs";

// Test data of various sizes
const testData1KB = "A".repeat(1024);
const testData10KB = "A".repeat(10 * 1024);
const testData100KB = "A".repeat(100 * 1024);
const testData1MB = "A".repeat(1024 * 1024);
const testData10MB = "A".repeat(10 * 1024 * 1024);

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
function createOperationBenchmark(opName, args = []) {
    // Reduced warmup time to 500ms to prevent memory pressure from excessive iterations
    const bench = new Bench({ time: 500, iterations: 10 });

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
    console.log("\n=== Encoding Operations ===");

    const base64Bench = createOperationBenchmark("To Base64");
    await base64Bench.run();
    console.table(base64Bench.table());

    const hexBench = createOperationBenchmark("To Hex", ["None"]);
    await hexBench.run();
    console.table(hexBench.table());
}

/**
 * Run hashing benchmarks.
 */
async function runHashingBenchmarks() {
    console.log("\n=== Hashing Operations ===");

    const md5Bench = createOperationBenchmark("MD5");
    await md5Bench.run();
    console.table(md5Bench.table());

    const sha256Bench = createOperationBenchmark("SHA2", ["256"]);
    await sha256Bench.run();
    console.table(sha256Bench.table());

    const sha512Bench = createOperationBenchmark("SHA2", ["512"]);
    await sha512Bench.run();
    console.table(sha512Bench.table());
}

/**
 * Run compression benchmarks.
 * Note: Using smaller test sizes (1KB, 10KB, 100KB) to prevent timeouts.
 */
async function runCompressionBenchmarks() {
    console.log("\n=== Compression Operations ===");
    console.log("(Using smaller test sizes for compression operations)");

    const gzipBench = createCompressionBenchmark("Gzip", [
        "Dynamic Huffman Coding",
        "",
        "",
        false
    ]);

    try {
        await gzipBench.run();
        console.table(gzipBench.table());
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
    console.log("\n=== Cryptographic Operations ===");

    const aesBench = createOperationBenchmark("AES Encrypt", [
        { option: "Hex", string: "00112233445566778899aabbccddeeff" },
        { option: "Hex", string: "00000000000000000000000000000000" },
        "CBC",
        "Raw",
        "Hex",
        { option: "Hex", string: "" }
    ]);
    await aesBench.run();
    console.table(aesBench.table());
}

/**
 * Run text operation benchmarks.
 */
async function runTextBenchmarks() {
    console.log("\n=== Text Operations ===");

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
    await regexBench.run();
    console.table(regexBench.table());
}

/**
 * Run analysis benchmarks.
 */
async function runAnalysisBenchmarks() {
    console.log("\n=== Analysis Operations ===");

    const entropyBench = createOperationBenchmark("Entropy", ["Shannon scale"]);
    await entropyBench.run();
    console.table(entropyBench.table());

    const freqBench = createOperationBenchmark("Frequency distribution", ["Space"]);
    await freqBench.run();
    console.table(freqBench.table());
}

/**
 * Run all benchmarks.
 */
async function runAllBenchmarks() {
    console.log("CyberChef MCP Performance Benchmarks");
    console.log("=====================================");

    const startTime = Date.now();

    try {
        await runEncodingBenchmarks();
        await runHashingBenchmarks();
        await runCompressionBenchmarks();
        await runCryptoBenchmarks();
        await runTextBenchmarks();
        await runAnalysisBenchmarks();

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n=== Benchmarks Complete ===`);
        console.log(`Total time: ${totalTime}s`);
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
