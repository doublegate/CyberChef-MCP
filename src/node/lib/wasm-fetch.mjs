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

/** Guard so repeated imports (or an explicit call in a worker) install the wrapper only once. */
let installed = false;

/**
 * Wrap `globalThis.fetch` so absolute filesystem paths are served from disk.
 *
 * Deliberately narrow. Only a value that is unambiguously a local path is intercepted -- an
 * absolute POSIX path, or a Windows drive path -- and everything else, including every real URL,
 * goes to the original `fetch` untouched. A broader rule risks turning a genuine network call into
 * a file read, which would be a far worse bug than the one being fixed.
 *
 * @returns {boolean} True if the wrapper was installed by this call.
 */
export function installWasmFetch() {
    if (installed || typeof globalThis.fetch !== "function") return false;
    installed = true;

    const originalFetch = globalThis.fetch;

    globalThis.fetch = async function wasmAwareFetch(resource, options) {
        const asString = typeof resource === "string" ? resource :
            (resource instanceof URL ? resource.href : String(resource));

        const isPosixPath = asString.startsWith("/");
        const isWindowsPath = /^[A-Za-z]:[/\\]/.test(asString);

        if (isPosixPath || isWindowsPath) {
            // A failure here must still surface as a rejected fetch, NOT as a thrown error from a
            // different call stack -- the whole point is to keep this off the process-wide
            // unhandledRejection path that aborts the process.
            const buffer = await readFile(asString);
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
