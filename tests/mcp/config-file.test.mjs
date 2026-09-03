/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * `cyberchef.config.json`, and the promise it keeps.
 *
 * The migration guide has told users to write this file since v1.8.0 and nothing read it. The
 * headline test here is therefore the one that would have failed for every release from v2.0.0 to
 * v2.9.0: a file asking for a setting, and the setting actually taking effect.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
    applyConfigFile, resolveConfig, ConfigFileError, SETTINGS
} from "../../src/node/lib/config-file.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, "../../src/node/mcp-server.mjs");

let dir;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cyberchef-cfg-"));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

/**
 * Write a config file into the scratch directory.
 *
 * @param {string|Object} content - JSON text, or an object to serialise.
 * @param {string} [name] - Filename.
 * @returns {string} The path written.
 */
function writeConfig(content, name = "cyberchef.config.json") {
    const path = join(dir, name);
    writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
    return path;
}

describe("resolving a configuration", () => {
    it("maps grouped settings onto their environment variables", () => {
        const { applied } = resolveConfig({
            server: { maxInputSize: 1024 },
            security: { offline: true },
            cache: { enabled: false }
        }, {});

        expect(applied).toEqual({
            CYBERCHEF_MAX_INPUT_SIZE: "1024",
            CYBERCHEF_OFFLINE: "true",
            CYBERCHEF_CACHE_ENABLED: "false"
        });
    });

    it("lets the environment win over the file", () => {
        // The precedence that makes `docker run -e ...` still work against a file baked into an
        // image. Asserted on both halves: the file value is not applied, and it is reported as
        // deferred rather than silently dropped.
        const { applied, deferredToEnv } = resolveConfig(
            { server: { maxInputSize: 1024 } },
            { CYBERCHEF_MAX_INPUT_SIZE: "999" });

        expect(applied).toEqual({});
        expect(deferredToEnv).toEqual(["server.maxInputSize"]);
    });

    it("treats an empty environment variable as set", () => {
        // An operator who exports an empty value is still being explicit; overriding them from a
        // file would be its own surprise.
        const { applied, deferredToEnv } = resolveConfig(
            { tools: { surface: "all" } },
            { CYBERCHEF_TOOL_SURFACE: "" });
        expect(applied).toEqual({});
        expect(deferredToEnv).toEqual(["tools.surface"]);
    });

    it("joins arrays, because the settings that take lists are read as comma-separated", () => {
        const { applied } = resolveConfig(
            { tools: { allowlist: ["To Base64", "From Hex"] } }, {});
        expect(applied.CYBERCHEF_TOOL_ALLOWLIST).toBe("To Base64,From Hex");
    });

    it("ignores $schema so an editor can be pointed at one", () => {
        const { applied } = resolveConfig(
            { $schema: "./schema.json", cache: { enabled: false } }, {});
        expect(applied).toEqual({ CYBERCHEF_CACHE_ENABLED: "false" });
    });

    it("names the section a typo probably meant", () => {
        // Substring matching produced NO suggestion for either of these, which is why the
        // implementation uses edit distance: "sever" is not a substring of "server".
        expect(() => resolveConfig({ sever: { maxInputSize: 1 } }, {}))
            .toThrow(/unknown section "sever" \(did you mean "server"\?\)/);
    });

    it("names the setting a typo probably meant", () => {
        expect(() => resolveConfig({ security: { offlien: true } }, {}))
            .toThrow(/unknown setting "security.offlien" \(did you mean "offline"\?\)/);
    });

    it("reports a genuinely unknown name as unknown rather than guessing", () => {
        const attempt = () => resolveConfig({ quantumFlux: { enabled: true } }, {});
        expect(attempt).toThrow(/unknown section "quantumFlux"/);
        expect(attempt).not.toThrow(/did you mean/);
    });

    it("refuses a value that cannot be an environment variable", () => {
        expect(() => resolveConfig({ server: { maxInputSize: { nested: 1 } } }, {}))
            .toThrow(/expected a string, number, boolean or array, found object/);
        expect(() => resolveConfig({ server: { maxInputSize: null } }, {}))
            .toThrow(/found null/);
        expect(() => resolveConfig({ server: { maxInputSize: Infinity } }, {}))
            .toThrow(/not a finite number/);
    });

    it("refuses an array holding anything but strings or numbers", () => {
        // Arrays are accepted because the list-valued settings are read as comma-separated
        // strings, but an object inside one would stringify to "[object Object]" and become a
        // silently wrong allowlist entry -- which is the failure mode this module exists to stop.
        expect(() => resolveConfig({ tools: { allowlist: ["To Base64", { op: "x" }] } }, {}))
            .toThrow(/arrays may contain only strings or numbers, found object/);
    });

    it("refuses a section that is not an object", () => {
        expect(() => resolveConfig({ server: "yes" }, {})).toThrow(/must be an object of settings/);
        expect(() => resolveConfig([], {})).toThrow(/top level must be an object/);
        expect(() => resolveConfig(null, {})).toThrow(/top level must be an object/);
    });

    it("covers every setting the server reads", () => {
        // The table is committed as a literal, so this guards the thing that would otherwise rot:
        // a setting added later and never exposed. Names must be unique across groups too, since
        // they all land in one flat environment.
        const names = Object.values(SETTINGS).flatMap(g => Object.values(g));
        expect(new Set(names).size).toBe(names.length);
        expect(names.length).toBeGreaterThanOrEqual(64);
        expect(names).toContain("CYBERCHEF_OFFLINE");
        expect(names).toContain("CYBERCHEF_TOOL_ALLOWLIST");
        expect(names).toContain("V2_COMPATIBILITY_MODE");
    });
});

describe("reading the file", () => {
    it("applies a file that is there", () => {
        writeConfig({ server: { maxInputSize: 1024 } });
        const env = {};
        const result = applyConfigFile({ env, cwd: dir });

        expect(env.CYBERCHEF_MAX_INPUT_SIZE).toBe("1024");
        expect(result.applied).toEqual(["CYBERCHEF_MAX_INPUT_SIZE"]);
    });

    it("stays silent when there is no file", () => {
        // The environment-only deployment every release before this one supported. Absent is
        // ordinary, not an error.
        const env = {};
        const result = applyConfigFile({ env, cwd: dir });
        expect(result.path).toBeNull();
        expect(result.applied).toEqual([]);
        expect(Object.keys(env)).toEqual([]);
    });

    it("refuses when a named file is missing", () => {
        // The distinction that matters: absent by default is fine, absent when ASKED for is not.
        // Treating an operator's explicit path as "no configuration" would be the original bug --
        // a configuration silently not applied -- in a new place.
        expect(() => applyConfigFile({
            env: { CYBERCHEF_CONFIG_FILE: "definitely-not-here.json" }, cwd: dir
        })).toThrow(/points at .*definitely-not-here.json", which does not exist/);
    });

    it("reports a read failure that is not simple absence", () => {
        // A directory at the configured path fails with EISDIR, not ENOENT. That must be reported
        // rather than folded into the "no file, carry on" branch, which would silently ignore a
        // configuration the operator did explicitly point at.
        expect(() => applyConfigFile({ env: { CYBERCHEF_CONFIG_FILE: "." }, cwd: dir }))
            .toThrow(/could not read/);
    });

    it("reads a file named explicitly", () => {
        writeConfig({ cache: { enabled: false } }, "custom.json");
        const env = { CYBERCHEF_CONFIG_FILE: "custom.json" };
        applyConfigFile({ env, cwd: dir });
        expect(env.CYBERCHEF_CACHE_ENABLED).toBe("false");
    });

    it("refuses malformed JSON, naming the file", () => {
        writeConfig('{ "server": { "maxInputSize": 1024, }');
        expect(() => applyConfigFile({ env: {}, cwd: dir }))
            .toThrow(ConfigFileError);
        expect(() => applyConfigFile({ env: {}, cwd: dir }))
            .toThrow(/is not valid JSON/);
    });

    it("does not half-apply a file that fails validation", () => {
        // The valid setting comes first, so a loader that applied as it went would leave the
        // environment half-configured after throwing on the second.
        writeConfig({ cache: { enabled: false }, security: { offlien: true } });
        const env = {};
        expect(() => applyConfigFile({ env, cwd: dir })).toThrow(/unknown setting/);
        expect(env.CYBERCHEF_CACHE_ENABLED).toBeUndefined();
    });
});

describe("the guide and the code agree", () => {
    it("documents every setting, with its environment variable", async () => {
        // The whole release exists because a document described a behaviour the code did not have.
        // Shipping a settings table that can drift out of date would be that defect again, so the
        // guide's own claim -- "a setting cannot be added without appearing here" -- is enforced
        // rather than asserted.
        const guide = await readFile(resolve(HERE, "../../docs/guides/configuration.md"), "utf8");

        const missing = [];
        for (const [section, entries] of Object.entries(SETTINGS)) {
            for (const [key, envName] of Object.entries(entries)) {
                if (!guide.includes(`\`${section}.${key}\``)) missing.push(`${section}.${key}`);
                if (!guide.includes(`\`${envName}\``)) missing.push(envName);
            }
        }
        expect(missing).toEqual([]);
    });
});

describe("the server, started with a configuration file", () => {
    /**
     * Start the server in a directory and return its stderr banner.
     *
     * @param {string} cwd - Working directory holding the config file.
     * @param {Object} [extraEnv] - Environment overrides.
     * @returns {Promise<{stderr: string, code: number}>} What it printed, and how it exited.
     */
    function startServer(cwd, extraEnv = {}) {
        return new Promise(resolvePromise => {
            const child = spawn(process.execPath, [SERVER], {
                cwd,
                env: { ...process.env, ...extraEnv }
            });
            let stderr = "";
            child.stderr.on("data", d => {
                stderr += d;
            });
            child.stdout.on("data", () => {});
            // The banner is printed at startup; the server then waits on stdin forever, so it is
            // stopped once it has said what it was going to say.
            const done = code => resolvePromise({ stderr, code });
            child.on("close", done);
            setTimeout(() => {
                if (stderr.includes("=====") || stderr.length > 0) child.kill();
            }, 20000);
        });
    }

    it("applies the file, and says so", async () => {
        writeConfig({ tools: { surface: "curated" }, security: { offline: true } });
        const { stderr } = await startServer(dir);

        // The assertion that would have failed for every release since v2.0.0: a setting in the
        // file actually reaching the running server.
        expect(stderr).toMatch(/tool surface: curated/);
        expect(stderr).toMatch(/Config file:.*2 settings applied/);
    }, 90_000);

    it("reports which settings the environment overrode", async () => {
        writeConfig({ tools: { surface: "curated" } });
        const { stderr } = await startServer(dir, { CYBERCHEF_TOOL_SURFACE: "index" });

        expect(stderr).toMatch(/tool surface: index/);
        expect(stderr).toMatch(/overridden by environment: tools.surface/);
    }, 90_000);

    it("refuses to start on a bad file, with a message and not a stack trace", async () => {
        writeConfig({ security: { offlien: true } });
        const { stderr, code } = await startServer(dir);

        expect(code).toBe(1);
        expect(stderr).toMatch(/unknown setting "security.offlien"/);
        expect(stderr).toMatch(/The server did not start/);
        // The point of catching it: an operator's mistake must not be reported as an ESM loader
        // stack whose last frame has nothing to do with their file.
        expect(stderr).not.toMatch(/asyncRunEntryPointWithESMLoader/);
    }, 90_000);
});
