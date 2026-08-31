/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The filesystem-`fetch` shim, and the boundary that keeps it from being a local file inclusion.
 *
 * The shim exists because `argon2-browser` fetches its `.wasm` by filesystem path, Node's `fetch`
 * rejects that, and `jq-web`'s Emscripten runtime turns the unhandled rejection into a
 * process-wide `abort()` -- so one tool call killed the server for every connected client.
 *
 * Its first version served **any** absolute path, which was a local file inclusion: CyberChef
 * ships an "HTTP request" operation that calls `fetch(url)` with a caller-supplied URL, so
 * `fetch("/etc/hostname")` returned the file. Raised in review on #90; demonstrated, then fixed.
 *
 * Both halves are asserted here, because a fix for either one alone is worthless: the shim must
 * serve the WASM payload (or the server crashes again) **and** refuse everything else.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { _servableWasmPathForTest as servable } from "../../src/node/lib/wasm-fetch.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const NODE_MODULES = join(REPO_ROOT, "node_modules");

describe("wasm-fetch: what may be read from disk", () => {
    it("serves a .wasm payload inside node_modules", () => {
        // The one thing it exists to do. If this stops working, argon2 takes the process down.
        const wasm = join(NODE_MODULES, "argon2-browser", "dist", "argon2.wasm");
        expect(servable(wasm)).toBe(wasm);
    });

    it("refuses paths outside node_modules", () => {
        // The LFI, stated as the thing that was actually wrong.
        for (const path of ["/etc/passwd", "/etc/hostname", "/proc/self/environ", "/root/.ssh/id_rsa"]) {
            expect(servable(path), `${path} must be refused`).toBeNull();
        }
    });

    it("refuses traversal that resolves out of node_modules", () => {
        // Checked on the RESOLVED path, not on the spelling -- `path.resolve` normalises `..`
        // first, so these are rejected for where they land rather than for how they look.
        for (const path of [
            join(NODE_MODULES, "..", "..", "..", "etc", "passwd"),
            join(NODE_MODULES, "argon2-browser", "..", "..", "..", "etc", "passwd"),
            `${NODE_MODULES}/../.env`
        ]) {
            expect(servable(path), `${path} must be refused`).toBeNull();
        }
    });

    it("refuses a sibling directory that merely starts with the same prefix", () => {
        // `node_modules_evil` must not match `node_modules` by string prefix.
        expect(servable(`${NODE_MODULES}_evil/x.wasm`)).toBeNull();
    });

    it("refuses non-wasm files even inside node_modules", () => {
        // Scope by construction: a dependency may ship a .env or a test key, and none of that is
        // a WebAssembly payload.
        for (const name of [".env", "key.pem", "index.js", "package.json", "secret.txt"]) {
            expect(servable(join(NODE_MODULES, "some-pkg", name)), name).toBeNull();
        }
    });

    it("leaves real URLs alone", () => {
        // A genuine network call must never be answered from disk -- that would be a worse bug
        // than the one the shim fixes.
        for (const url of [
            "https://example.com/payload.wasm",
            "http://localhost:3000/x.wasm",
            "data:application/wasm;base64,AGFzbQ=="
        ]) {
            expect(servable(url), url).toBeNull();
        }
    });

    it("refuses a relative path", () => {
        // Only absolute paths are ever intercepted; a relative one has no unambiguous meaning here.
        expect(servable("node_modules/argon2-browser/dist/argon2.wasm")).toBeNull();
        expect(servable("./argon2.wasm")).toBeNull();
    });
});
