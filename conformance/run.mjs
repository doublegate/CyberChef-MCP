#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Run the official MCP conformance suite against this server.
 *
 * WHY THIS EXISTS
 * ---------------
 * v3.0.0 shipped "MCP 2026-07-28 conformance" verified entirely by tests written in this
 * repository. Module 20's rule is that accuracy-critical behaviour is checked against an
 * independent, external oracle rather than self-asserted, and a conformance release verified only
 * by its own tests is the definition of self-asserted.
 *
 * `@modelcontextprotocol/conformance` is that oracle, and it was published four weeks before
 * v3.0.0 with scenarios for the exact SEPs v3.0.0 implemented -- `caching` for SEP-2549,
 * `sep-2164-resource-not-found`, `server-stateless` for SEP-2575. Nobody looked. It found a real
 * defect on its first run: v3.1.0 findings log F-03.
 *
 * WHY A BASELINE RATHER THAN A SCENARIO ALLOWLIST
 * ----------------------------------------------
 * Most of the suite's failures here are the harness calling its own reference-server fixtures --
 * `test_simple_prompt`, `test://static-text` -- which no server with its own surface can pass.
 * The obvious response is to run only the scenarios that apply. That is the wrong shape: the list
 * would be written once and never revisited, and a scenario added by a later release would never
 * run at all.
 *
 * `--expected-failures` inverts it. Everything runs; each non-applicable result is recorded with a
 * reason; and the run FAILS if a baselined entry starts passing. A reason that stops being true
 * becomes a red build instead of a silence, which is the same property `check:versions` was built
 * for in v2.10.0.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SERVER = resolve(ROOT, "src/node/mcp-server.mjs");
const CLI = resolve(ROOT, "node_modules/@modelcontextprotocol/conformance/dist/index.js");
const BASELINE = resolve(HERE, "expected-failures.yaml");

// Both eras this server serves. The filter is cumulative for date versions, so the 2026 run also
// carries the 2025 scenarios -- but it negotiates 2026-07-28, and the legacy wire is a separate
// code path that a passing 2026 run says nothing about. That is the whole reason v2.3.0 kept the
// v1 SDK as a devDependency, so it is the reason to run both here.
const ERAS = ["2026-07-28", "2025-11-25"];

/** @returns {Promise<number>} A port nothing is listening on. */
function freePort() {
    return new Promise((ok, fail) => {
        const probe = createServer();
        probe.on("error", fail);
        probe.listen(0, "127.0.0.1", () => {
            const { port } = probe.address();
            probe.close(() => ok(port));
        });
    });
}

/** Wait until the MCP endpoint answers, or give up. @returns {Promise<void>} */
async function waitForServer(port, deadlineMs = 60_000) {
    const until = Date.now() + deadlineMs;
    while (Date.now() < until) {
        try {
            await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST" });
            return;
        } catch {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    throw new Error(`server did not accept connections on ${port} within ${deadlineMs}ms`);
}

/** @returns {Promise<number>} The child's exit code. */
function run(command, args, options = {}) {
    return new Promise((ok, fail) => {
        const child = spawn(command, args, { stdio: "inherit", ...options });
        child.on("error", fail);
        child.on("exit", code => ok(code ?? 1));
    });
}

const port = await freePort();
const server = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
    env: {
        ...process.env,
        CYBERCHEF_TRANSPORT: "http",
        CYBERCHEF_HTTP_PORT: String(port),
        CYBERCHEF_LOG_LEVEL: "silent",
        // The suite drives the protocol, not the operation catalogue, and every scenario it runs
        // reaches `tools/list` rather than a specific tool. `all` is used anyway: the surface
        // decides what `tools/list` returns, and conformance of that response is the point.
        CYBERCHEF_TOOL_SURFACE: "all"
    }
});

let failed = 0;
try {
    await waitForServer(port);
    for (const era of ERAS) {
        process.stdout.write(`\n=== conformance: ${era} ===\n`);
        const code = await run(process.execPath, [
            CLI, "server",
            "--url", `http://127.0.0.1:${port}/mcp`,
            "--spec-version", era,
            // `active` excludes the pending suite, and the pending suite is where the scenarios
            // for THIS server's most recent work live -- `caching`, `server-stateless`,
            // `sep-2164-resource-not-found`. Running only `active` would have skipped every
            // scenario that validates v3.0.0.
            "--suite", "all",
            "--expected-failures", BASELINE
        ], { cwd: ROOT });
        if (code !== 0) failed += 1;
    }
} finally {
    server.kill();
}

if (failed > 0) {
    process.stdout.write(`\n${failed} of ${ERAS.length} eras did not match the baseline.\n`);
    process.exit(1);
}
process.stdout.write(`\nBoth eras match the baseline.\n`);
