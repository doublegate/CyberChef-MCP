/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Importing the server module must not START a server.
 *
 * WHY THIS EXISTS. `src/node/mcp-server.mjs` called `runServer()` at module scope with no
 * main-module guard, and `runServer().catch` ends in `process.exit(1)`. So importing the module --
 * which 23 test files do -- started a real stdio server in that process, holding a live recipe
 * manager, and armed a process exit inside every one of them.
 *
 * That is not a tidiness complaint. It took down `mcp-test` on BOTH Node versions during v3.9.0
 * while passing locally twice: four test files repoint `CYBERCHEF_RECIPE_STORAGE` at a temp
 * directory, import the server, and delete that directory in `afterAll`; a save landing after the
 * delete failed with ENOENT, `runServer().catch` fired, and `process.exit(1)` killed the vitest
 * worker mid-file. The release shipped with those four directories deliberately LEAKED, as a
 * workaround that said so in the code. This file is what lets the workaround be removed.
 *
 * Recorded as F-13 in `docs/internal/v3.9.0-findings-log.md`. An independent reviewer diagnosed it
 * identically and unprompted, and proposed the same two fixes.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER = join(ROOT, "src/node/mcp-server.mjs");

/**
 * Run a short script in a fresh Node process and return everything it wrote.
 *
 * A CHILD PROCESS, not an in-process import: this suite's own worker has already imported the
 * server module several times over, so an in-process check would measure the module cache rather
 * than the behaviour. It also means a stray `process.exit` cannot take the test runner with it.
 *
 * @param {string} source - The script to run.
 * @param {Object} [env] - Extra environment.
 * @returns {{stdout: string, stderr: string, status: number}} What it produced.
 */
function runScript(source, env = {}) {
    // `spawnSync`, NOT `execFileSync`. execFileSync only surfaces stderr on a NON-ZERO exit, and
    // this server logs to stderr by design -- stdout is the JSON-RPC channel and writing to it
    // corrupts the protocol, which is a lesson this project learned the expensive way. The first
    // version of this helper therefore discarded exactly the output these tests assert on, and the
    // headline test passed while the defect was present. A false pass, in the release written to
    // stop checks meaning something other than what they say.
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 120000,
        env: { ...process.env, CYBERCHEF_LOG_LEVEL: "info", ...env }
    });
    return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status ?? 1 };
}

/** Log lines the server only emits once it is actually serving. */
const STARTED = /CyberChef MCP Server v[\d.]+ started|Running on stdio transport/;

describe("the server module's entry point", () => {
    it("does not start a server when merely imported", () => {
        const r = runScript(`
            await import(${JSON.stringify(SERVER)});
            console.log("IMPORT_COMPLETED");
        `);
        const all = r.stdout + r.stderr;

        expect(all).toContain("IMPORT_COMPLETED");
        // The assertion that failed before this release, and the reason the four temp-directory
        // leaks existed.
        expect(all, "importing the module started a server").not.toMatch(STARTED);
    });

    it("still exports what callers import it for", () => {
        const r = runScript(`
            const m = await import(${JSON.stringify(SERVER)});
            console.log("EXPORTS:" + Object.keys(m).length);
            console.log("HAS:" + ["createMcpServer", "RateLimiter", "BatchProcessor"]
                .filter(k => m[k] !== undefined).join(","));
        `);
        // A guard that starts no server is useless if it also breaks the import surface that
        // 23 test files depend on. `createMcpServer` is the one they all reach for.
        //
        // NOT `runServer` or `serveStdio`: neither is exported, and asserting them was this test's
        // own bug -- it failed against correct code until the export list was actually read.
        expect(r.stdout).toContain("createMcpServer");
        expect(r.stdout).toMatch(/EXPORTS:[1-9]\d+/);
    });

    it("DOES start when run as the entry point, the way `npm run mcp` does", () => {
        // The other direction, and the one that would break production silently. A guard that
        // wrongly reports "not main" yields a container that exits instantly with no error --
        // worse than the defect it replaces.
        const r = runScript(`
            import { spawn } from "node:child_process";
            const p = spawn(process.execPath, [${JSON.stringify(SERVER)}], {
                stdio: ["pipe", "pipe", "pipe"],
                env: { ...process.env, CYBERCHEF_LOG_LEVEL: "info" }
            });
            let out = "";
            p.stdout.on("data", d => { out += d; });
            p.stderr.on("data", d => { out += d; });
            await new Promise(r => setTimeout(r, 12000));
            p.kill("SIGKILL");
            console.log(out.includes("Running on stdio transport") ? "SERVER_STARTED" : "NO_START:" + out.slice(0, 400));
        `);
        expect(r.stdout + r.stderr).toContain("SERVER_STARTED");
    }, 120000);

    it("DOES start through an npm-style bin symlink", () => {
        // `package.json` maps the `cyberchef-mcp` bin at this file, and npm installs bins as
        // SYMLINKS on unix. A main-module check comparing `import.meta.url` to `process.argv[1]`
        // without resolving symlinks therefore fails for every `npx cyberchef-mcp` user while
        // passing every test above. Realpath resolution is what makes it correct, and this is the
        // test that proves it.
        const bin = mkdtempSync(join(tmpdir(), "cyberchef-bin-"));
        const link = join(bin, "cyberchef-mcp");
        symlinkSync(SERVER, link);

        const r = runScript(`
            import { spawn } from "node:child_process";
            const p = spawn(process.execPath, [${JSON.stringify(link)}], {
                stdio: ["pipe", "pipe", "pipe"],
                env: { ...process.env, CYBERCHEF_LOG_LEVEL: "info" }
            });
            let out = "";
            p.stdout.on("data", d => { out += d; });
            p.stderr.on("data", d => { out += d; });
            await new Promise(r => setTimeout(r, 12000));
            p.kill("SIGKILL");
            console.log(out.includes("Running on stdio transport") ? "SERVER_STARTED" : "NO_START:" + out.slice(0, 400));
        `);
        expect(r.stdout + r.stderr).toContain("SERVER_STARTED");
    }, 120000);

    it("keeps the Docker CMD pointing at a path the guard recognises", () => {
        // `CMD ["src/node/mcp-server.mjs"]` against the Chainguard base's `node` entrypoint, so
        // argv[1] is a RELATIVE path resolved against WORKDIR. A guard comparing raw strings rather
        // than resolved paths would leave the published image starting nothing.
        const dockerfile = readFileSync(join(ROOT, "Dockerfile.mcp"), "utf8");
        expect(dockerfile).toMatch(/CMD\s*\[\s*"src\/node\/mcp-server\.mjs"\s*\]/);
    });
});
