/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Let WASM-backed operations load their `.wasm` payload under Node.
 *
 * WHAT GOES WRONG WITHOUT THIS
 * ----------------------------
 * `argon2-browser` was written for browsers, where `fetch("/path/to/argon2.wasm")` resolves
 * against the page origin. Node's built-in `fetch` has no origin to resolve against and rejects a
 * bare filesystem path outright:
 *
 *     TypeError: Failed to parse URL from .../node_modules/argon2-browser/dist/argon2.wasm
 *
 * On its own that would be a failed operation. It is much worse than that here, because
 * `jq-web`'s Emscripten runtime installs a PROCESS-WIDE handler:
 *
 *     process.on("unhandledRejection", bA)      // -> abort()
 *
 * So the rejection from one operation reaches another library's global handler and takes the
 * **entire server process down**. Measured by calling every tool in turn: `cyberchef_argon2_compare`
 * killed the server, and the 484 tools after it in the sweep all reported "Not connected". A
 * single tool call ending the process for every connected client is the most severe failure mode
 * this server has, and it was reachable from an ordinary request.
 *
 * WHY IT WAS NOT CAUGHT
 * ---------------------
 * Upstream hit the same thing and fixed it for TESTS ONLY -- `tests/lib/wasmFetchPolyfill.mjs`,
 * imported at the head of the generated test index. The test suite therefore passes while the
 * shipped server crashes, which is precisely the gap a test-only fix creates. This module is the
 * same idea applied where it actually matters, and it lives in the fork-owned MCP layer so no
 * upstream sync can remove it.
 *
 * The alternative was the `--no-experimental-fetch` flag the old npm scripts carried. That works
 * by removing Node's fetch entirely so the library falls back to its own loader -- a blunt
 * instrument that also denies `fetch` to everything else in the process, and one Node has already
 * begun to retire. Serving the file is the narrower fix.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The only directory a filesystem `fetch` may read from.
 *
 * `src/node/lib/wasm-fetch.mjs` -> repository root -> `node_modules`.
 */
const NODE_MODULES = resolve(fileURLToPath(new URL("../../../node_modules", import.meta.url)));

/** Guard so repeated imports (or an explicit call in a worker) install the wrapper only once. */
let installed = false;

/**
 * May this path be served from disk?
 *
 * THIS FUNCTION IS THE SECURITY BOUNDARY, and the first version of this module did not have one.
 * It served *any* absolute path, which was a local file inclusion: CyberChef ships an "HTTP
 * request" operation that calls `fetch(url)` with a caller-supplied URL (HTTPRequest.mjs:106), so
 * a request for `/etc/passwd` came back as the file's contents. Demonstrated before fixing:
 *
 *     fetch("/etc/hostname")  ->  "AB-i9"
 *
 * Two conditions, both required:
 *   - the path RESOLVES inside this project's `node_modules`. `path.resolve` normalises `..`
 *     first, so `/node_modules/../../etc/passwd` is rejected on its resolved form, not its
 *     spelling; the `sep` suffix stops `node_modules_evil` matching by prefix.
 *   - the file ends in `.wasm`. The whole purpose is loading WebAssembly payloads, so anything
 *     else in node_modules -- a `.env` a dependency shipped, a private key in a test fixture --
 *     is out of scope by construction.
 *
 * Anything failing either test is handed to the ORIGINAL fetch, which restores exactly the
 * behaviour that existed before this module: a bare path is rejected by Node. Failing closed here
 * costs nothing, because a genuine URL never reaches this check.
 *
 * @param {string} candidate - The resource, as a string.
 * @returns {string|null} The absolute path to read, or null if it must not be read.
 */
function servableWasmPath(candidate) {
    const isPosixPath = candidate.startsWith("/");
    const isWindowsPath = /^[A-Za-z]:[/\\]/.test(candidate);
    if (!isPosixPath && !isWindowsPath) return null;

    const resolved = resolve(candidate);
    const inNodeModules = resolved === NODE_MODULES || resolved.startsWith(NODE_MODULES + sep);
    if (!inNodeModules) return null;
    if (extname(resolved).toLowerCase() !== ".wasm") return null;

    return resolved;
}

/**
 * Wrap `globalThis.fetch` so a WASM payload inside `node_modules` is served from disk.
 *
 * Deliberately narrow -- see `servableWasmPath`, which decides what may be read. Everything else,
 * including every real URL, goes to the original `fetch` untouched. A broader rule turns a genuine
 * network call into a file read, which is a far worse bug than the one being fixed.
 *
 * @returns {boolean} True if the wrapper was installed by this call.
 */
export function installWasmFetch() {
    if (installed || typeof globalThis.fetch !== "function") return false;
    installed = true;

    const originalFetch = globalThis.fetch;

    globalThis.fetch = async function wasmAwareFetch(resource, options) {
        // `String()` on a string is a no-op, so the extra ternary the first version had bought
        // nothing.
        const asString = resource instanceof URL ? resource.href : String(resource);
        const wasmPath = servableWasmPath(asString);

        if (wasmPath) {
            // A failure here must still surface as a rejected fetch, NOT as a thrown error from a
            // different call stack -- the whole point is to keep this off the process-wide
            // unhandledRejection path that aborts the process.
            const buffer = await readFile(wasmPath);
            return new Response(buffer, {
                status: 200,
                headers: { "Content-Type": "application/wasm" }
            });
        }

        return originalFetch(resource, options);
    };

    return true;
}

/**
 * The path-allowlist predicate, exported so the regression test can assert the boundary directly
 * rather than only through `fetch`.
 *
 * @param {string} candidate - The resource, as a string.
 * @returns {string|null} The absolute path to read, or null.
 */
export function _servableWasmPathForTest(candidate) {
    return servableWasmPath(candidate);
}

/**
 * Whether the wrapper is currently installed.
 *
 * Exported for the regression test, which has to be able to assert the wiring rather than just
 * the behaviour: the defect this prevents is "nobody called the installer".
 *
 * @returns {boolean} Installation state.
 */
export function isWasmFetchInstalled() {
    return installed;
}
