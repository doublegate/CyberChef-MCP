/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Runs every file in `examples/` and fails if any of them stops working.
 *
 * The examples are written as executable scripts with their own assertions precisely so this test
 * can exist. Documentation that is not executed drifts from the code silently -- and this project
 * has the receipt: three separate documents asserted that a ReDoS mitigation was active for four
 * releases after a sync had removed it. An example that only lives in a fenced code block is the
 * same failure waiting to happen.
 *
 * Each script exits non-zero on a failed assertion, so the test body is just "run it".
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, extname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = resolve(HERE, "../../examples");

// Each example boots at least one server, and 04/07 boot several or bind a socket. Generous on
// purpose: a timeout here should mean "broken", not "the runner was busy".
const TIMEOUT_MS = 300_000;

/**
 * Every runnable example, discovered rather than listed.
 *
 * Discovery matters: a hard-coded list silently stops covering a new example, which is the exact
 * failure mode this suite exists to prevent. `_lib.mjs` is shared plumbing, not an example, and
 * the README is not executable.
 *
 * @returns {string[]} File names, sorted so failures report in a predictable order.
 */
function findExamples() {
    return readdirSync(EXAMPLES_DIR)
        .filter(f => [".mjs", ".sh"].includes(extname(f)))
        .filter(f => !f.startsWith("_"))
        .sort();
}

/**
 * Run one example to completion.
 *
 * @param {string} file - File name within examples/.
 * @returns {Promise<{code: number, stdout: string, stderr: string}>} Its exit status and output.
 */
function run(file) {
    return new Promise((resolveRun, rejectRun) => {
        const isShell = extname(file) === ".sh";
        const child = spawn(
            isShell ? "bash" : process.execPath,
            [resolve(EXAMPLES_DIR, file)],
            { cwd: resolve(HERE, "../.."), stdio: ["ignore", "pipe", "pipe"] }
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", d => {
            stdout += d;
        });
        child.stderr.on("data", d => {
            stderr += d;
        });
        child.on("error", rejectRun);
        child.on("close", code => resolveRun({ code, stdout, stderr }));
    });
}

/**
 * Is `jq` available on PATH?
 *
 * @returns {boolean} True when the shell example's dependency is present.
 */
function hasJq() {
    const res = spawnSync("jq", ["--version"], { stdio: "ignore" });
    return !res.error && res.status === 0;
}

describe("examples/", () => {
    const examples = findExamples();

    it("finds the examples to run", () => {
        // Guards against a rename or a moved directory quietly reducing this suite to nothing --
        // zero discovered files would otherwise make every other assertion below vacuous.
        expect(examples.length).toBeGreaterThanOrEqual(8);
    });

    for (const file of examples) {
        it(`${file} runs clean`, async (ctx) => {
            // The shell example needs `jq`. Skipping when it is absent is right rather than
            // failing: the example documents a real usage pattern, and a missing developer tool on
            // the machine is not a defect in this project. CI installs jq, so it does run there.
            if (extname(file) === ".sh" && !hasJq()) {
                ctx.skip();
                return;
            }

            const { code, stdout, stderr } = await run(file);

            if (code !== 0) {
                // Surface the script's own output. Its assertions print what was expected versus
                // what happened, which is far more useful than "exit code 1".
                throw new Error(
                    `${file} exited ${code}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr.slice(-4000)}`
                );
            }

            // Every example finishes by saying so. Asserting it catches the case where a script
            // exits 0 having silently skipped its own body -- an empty run is not a passing run.
            //
            // Matched anywhere in the last line rather than anchored to the very end of stdout:
            // the first version required the output to END with "complete.", and 04 signs off
            // with "Triage complete: decoded, indicators extracted, sample fingerprinted." That
            // failed a script which had in fact run perfectly, which is the wrong way round for a
            // test whose job is to notice when an example stops working.
            expect(stdout.trim().length, `${file} produced no output`).toBeGreaterThan(0);
            const lastLine = stdout.trim().split("\n").pop();
            expect(lastLine, `${file} did not report completion`).toMatch(/complete/i);
        }, TIMEOUT_MS);
    }
});
