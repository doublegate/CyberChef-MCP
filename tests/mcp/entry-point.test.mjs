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

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, symlinkSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER = join(ROOT, "src/node/mcp-server.mjs");

/**
 * How long to let the server boot before giving up.
 *
 * Generous on purpose: booting builds a 500-tool schema, and a timeout here should mean "broken",
 * not "busy CI runner". The child is fed an empty stdin, so it exits on EOF rather than hanging.
 */
const BOOT_TIMEOUT_MS = 120_000;

/**
 * `SERVER` as a `file://` URL, for dynamic import.
 *
 * `await import("C:\\path\\to\\file.mjs")` throws `ERR_UNSUPPORTED_ESM_URL_SCHEME` on Windows --
 * a bare absolute path is not a valid specifier there, and the drive letter reads as a scheme.
 * Reviewer-found. This repository has no Windows runner today, which is exactly why it would have
 * gone unnoticed. `spawn` takes the plain path; only `import` needs the URL.
 */
const SERVER_URL = pathToFileURL(SERVER).href;

/**
 * Temp directories this file creates, removed in `afterAll`.
 *
 * Reviewer-found, and the finding lands hard: this file exists to prove a temp-directory leak was
 * fixed, and it leaked two directories of its own on every run. The "40 -> 40, leak-free"
 * measurement in the v3.10.0 notes was taken with a prefix filter -- `cyberchef-{mcp-handlers,
 * mcp-pr,quota,ratelimit}` -- that did not include `cyberchef-bin-` or `cyberchef-guard-`. The
 * verification was built, accidentally, so that it could not see this leak. 33 directories had
 * accumulated by the time two reviewers pointed at it independently.
 */
const tempDirs = [];

/**
 * Make a temp directory that will be cleaned up.
 *
 * @param {string} prefix - Name prefix.
 * @returns {string} The directory path.
 */
function tempDir(prefix) {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

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
            await import(${JSON.stringify(SERVER_URL)});
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
            const m = await import(${JSON.stringify(SERVER_URL)});
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
            // POLL for the marker; do not sleep a fixed interval and hope. vitest.config.mjs
            // records that booting a server over 504 operations takes 9.5-10s on this machine for
            // the heavier files, and the first version of this test waited a flat 12 seconds --
            // a two-second margin against a ten-second boot, under a suite that runs files in
            // parallel. It flaked on the first full run, which is exactly the fixed-budget mistake
            // this project keeps finding elsewhere, committed here in a test written to prove
            // something else. Exits as soon as the marker appears, so it is also faster.
            // NOTE: no backticks in this comment -- it lives inside a template literal, and a
            // backtick here closes it. p.exitCode === null means still running. Without it, a
            // child that dies instantly
            // is polled for the full 60 seconds before the assertion fails -- a slow, uninformative
            // failure where a fast one is available. Reviewer-found.
            const deadline = Date.now() + 60000;
            while (Date.now() < deadline && p.exitCode === null &&
                   !out.includes("Running on stdio transport")) {
                await new Promise(r => setTimeout(r, 250));
            }
            p.kill("SIGKILL");
            console.log(out.includes("Running on stdio transport") ? "SERVER_STARTED" : "NO_START:" + out.slice(0, 400));
        `);
        expect(r.stdout + r.stderr).toContain("SERVER_STARTED");
    }, 90000);

    it("DOES start through an npm-style bin symlink", (ctx) => {
        // `package.json` maps the `cyberchef-mcp` bin at this file, and npm installs bins as
        // SYMLINKS on unix. A main-module check comparing `import.meta.url` to `process.argv[1]`
        // without resolving symlinks therefore fails for every `npx cyberchef-mcp` user while
        // passing every test above. Realpath resolution is what makes it correct, and this is the
        // test that proves it.
        const bin = tempDir("cyberchef-bin-");
        const link = join(bin, "cyberchef-mcp");
        try {
            symlinkSync(SERVER, link);
        } catch (error) {
            // Windows refuses symlink creation with EPERM unless Developer Mode is on or the
            // process is elevated. Skipping beats failing a Windows contributor's suite for a
            // platform capability rather than a defect -- but ONLY for that error, so a real
            // failure still fails. Reviewer-suggested.
            if (error.code === "EPERM" || error.code === "EACCES") {
                ctx.skip();
                return;
            }
            throw error;
        }

        const r = runScript(`
            import { spawn } from "node:child_process";
            const p = spawn(process.execPath, [${JSON.stringify(link)}], {
                stdio: ["pipe", "pipe", "pipe"],
                env: { ...process.env, CYBERCHEF_LOG_LEVEL: "info" }
            });
            let out = "";
            p.stdout.on("data", d => { out += d; });
            p.stderr.on("data", d => { out += d; });
            // POLL for the marker; do not sleep a fixed interval and hope. vitest.config.mjs
            // records that booting a server over 504 operations takes 9.5-10s on this machine for
            // the heavier files, and the first version of this test waited a flat 12 seconds --
            // a two-second margin against a ten-second boot, under a suite that runs files in
            // parallel. It flaked on the first full run, which is exactly the fixed-budget mistake
            // this project keeps finding elsewhere, committed here in a test written to prove
            // something else. Exits as soon as the marker appears, so it is also faster.
            // NOTE: no backticks in this comment -- it lives inside a template literal, and a
            // backtick here closes it. p.exitCode === null means still running. Without it, a
            // child that dies instantly
            // is polled for the full 60 seconds before the assertion fails -- a slow, uninformative
            // failure where a fast one is available. Reviewer-found.
            const deadline = Date.now() + 60000;
            while (Date.now() < deadline && p.exitCode === null &&
                   !out.includes("Running on stdio transport")) {
                await new Promise(r => setTimeout(r, 250));
            }
            p.kill("SIGKILL");
            console.log(out.includes("Running on stdio transport") ? "SERVER_STARTED" : "NO_START:" + out.slice(0, 400));
        `);
        expect(r.stdout + r.stderr).toContain("SERVER_STARTED");
    }, 90000);

    it("keeps the Docker CMD pointing at a path the guard recognises", () => {
        // `CMD ["src/node/mcp-server.mjs"]` against the Chainguard base's `node` entrypoint, so
        // argv[1] is a RELATIVE path resolved against WORKDIR. A guard comparing raw strings rather
        // than resolved paths would leave the published image starting nothing.
        const dockerfile = readFileSync(join(ROOT, "Dockerfile.mcp"), "utf8");
        expect(dockerfile).toMatch(/CMD\s*\[\s*"src\/node\/mcp-server\.mjs"\s*\]/);
    });
});

describe("isEntryPoint", () => {
    // The guard's LOGIC, in-process and deterministic, by moving `process.argv[1]` rather than
    // spawning. The child-process tests above prove the end-to-end behaviour; these prove the
    // decision, including the branches a spawn cannot reach cheaply.
    let isEntryPoint;
    const original = process.argv[1];

    beforeAll(async () => {
        ({ isEntryPoint } = await import("../../src/node/mcp-server.mjs"));
    });

    afterEach(() => {
        process.argv[1] = original;
    });

    it("is true when argv[1] is this module", () => {
        process.argv[1] = SERVER;
        expect(isEntryPoint()).toBe(true);
    });

    it("is true through a symlink, which is how npm installs the bin", (ctx) => {
        // The case that would break `npx cyberchef-mcp` if the guard compared strings. npm installs
        // bins as symlinks, so argv[1] is the link and `import.meta.filename` is the target.
        const dir = tempDir("cyberchef-guard-");
        const link = join(dir, "cyberchef-mcp");
        try {
            symlinkSync(SERVER, link);
        } catch (error) {
            if (error.code === "EPERM" || error.code === "EACCES") {
                ctx.skip();
                return;
            }
            throw error;
        }
        process.argv[1] = link;
        expect(isEntryPoint()).toBe(true);
    });

    it("is true for a relative path, which is the Docker CMD shape", () => {
        // `CMD ["src/node/mcp-server.mjs"]` against the base image's `node` entrypoint: argv[1]
        // arrives relative to WORKDIR, so the guard has to resolve before comparing.
        process.argv[1] = "src/node/mcp-server.mjs";
        expect(isEntryPoint()).toBe(true);
    });

    it("is false when another file is the entry point", () => {
        process.argv[1] = fileURLToPath(import.meta.url);
        expect(isEntryPoint()).toBe(false);
    });

    it("is false when there is no argv[1] at all", () => {
        // `node --input-type=module -e '...'` and some embedders.
        delete process.argv[1];
        expect(isEntryPoint()).toBe(false);
    });

    it("is false, not throwing, when argv[1] does not exist", () => {
        // `realpathSync` throws ENOENT. Failing closed is deliberate: the cost is not auto-starting,
        // and every real entry path resolves.
        process.argv[1] = join(tmpdir(), "cyberchef-does-not-exist-" + Date.now());
        expect(isEntryPoint()).toBe(false);
    });
});

describe("the startup banner reports a removed setting that is still set", () => {
    // WHY THIS IS A CHILD PROCESS. `removedAliasWarning()` is unit-tested in
    // `lib-internals.test.mjs`, which proves the MESSAGE. It cannot prove the WIRING: the startup
    // block that calls it runs once, at boot, and in-process v8 coverage never sees it -- the
    // same blind spot v3.10.0 recorded about the entry point, in the same file.
    //
    // The distinction matters here. A correct warning that nothing calls is indistinguishable
    // from no warning at all, and the operator this exists for would be told nothing either way.
    it("warns on stderr when CYBERCHEF_EXPOSE_ALL_OPS is set", () => {
        const r = spawnSync(process.execPath, [SERVER], {
            input: "",
            encoding: "utf8",
            timeout: BOOT_TIMEOUT_MS,
            env: { ...process.env, CYBERCHEF_EXPOSE_ALL_OPS: "true", CYBERCHEF_TOOL_SURFACE: "index" }
        });
        expect(r.stderr).toContain("CYBERCHEF_EXPOSE_ALL_OPS");
        expect(r.stderr).toContain("IGNORED");
        expect(r.stderr).toContain("removed in v4.0.0");
        // The surface really is index -- the variable did not quietly resurrect `all`.
        expect(r.stderr).toContain("tool surface: index");
        // On stderr, never stdout: stdout is the JSON-RPC channel and one stray byte breaks it.
        expect(r.stdout ?? "").not.toContain("CYBERCHEF_EXPOSE_ALL_OPS");
    }, BOOT_TIMEOUT_MS + 5000);

    it("says nothing about it when the variable is absent", () => {
        const env = { ...process.env };
        delete env.CYBERCHEF_EXPOSE_ALL_OPS;
        const r = spawnSync(process.execPath, [SERVER], {
            input: "", encoding: "utf8", timeout: BOOT_TIMEOUT_MS, env
        });
        expect(r.stderr).toContain("tool surface:");   // it did boot
        expect(r.stderr).not.toContain("CYBERCHEF_EXPOSE_ALL_OPS");
    }, BOOT_TIMEOUT_MS + 5000);
});

afterAll(async () => {
    // After the child processes are dead -- each test kills its own before returning, so nothing
    // here is holding these paths.
    for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});
