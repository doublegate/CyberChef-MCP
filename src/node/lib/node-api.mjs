/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Deferred access to the CyberChef Node API (`src/node/index.mjs`).
 *
 * That module imports **every one of the 505 operation implementations** eagerly, and importing it
 * is essentially the entire cost of starting this server. Measured on Node 26, five runs, launch
 * to first `tools/list` response:
 *
 *     src/node/index.mjs           1159 ms
 *       src/core/operations/index   1132 ms   <- the bulk
 *     src/core/Chef.mjs              20 ms
 *     src/node/lib/tool-catalog.mjs  12 ms
 *     ------------------------------------
 *     cold start                   ~1300 ms   of which ~1150 ms is the import above
 *
 * **Nothing on the hot path needs it.** `tools/list` is built from `OperationConfig.json` and
 * `Categories.json`; every operation call, registry tool and streaming path goes through
 * `bakeOnCore`, which uses `Chef.mjs` at 20 ms. The Node API is reached from exactly THREE places,
 * and the third is worth naming because omitting it is what made the first attempt at this change
 * measure no improvement at all:
 *
 *   1. `help()` for `cyberchef_search`            -- mcp-server.mjs
 *   2. `help()` for the batched search branch     -- lib/batch.mjs
 *   3. `bake()` for recipe execute/test           -- recipe-manager.mjs
 *
 * So a server that is launched and then asked to list tools -- which is what every editor does,
 * on stdio, on every session -- paid 1.15 s to import 505 operation implementations it had not
 * been asked to run.
 *
 * Two things make deferring it safe rather than merely faster:
 *
 *   - **The promise is memoised**, so concurrent callers share one import rather than racing.
 *     ESM caches modules anyway, but the memo makes "has this been loaded yet" observable, which
 *     is what lets a test assert that a plain `tools/list` never touches it.
 *   - **There is deliberately no warm-up.** Pre-importing in the background after connect -- the
 *     v2.6.0 plan's "warm pool" idea, in-process -- was implemented, measured, and removed:
 *
 *         lazy, no warm-up          186 ms   <- launch to first tools/list response
 *         lazy + background warm   1300 ms
 *         eager (before v2.6.0)    1300 ms
 *
 *     Module loading blocks the event loop, so "in the background" is not something it can be:
 *     the warm-up does the same 1.1 s of work and does it in front of the request already
 *     queued behind it. Loading on demand at least makes the caller that needs the operations
 *     the one who waits for them.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

/** The in-flight or completed import, or null before anything has asked for it. */
let modulePromise = null;

/**
 * The CyberChef Node API, imported on first use.
 *
 * @returns {Promise<Object>} The module namespace of `src/node/index.mjs`.
 */
export function loadNodeApi() {
    if (!modulePromise) {
        modulePromise = import("../index.mjs");
    }
    return modulePromise;
}

/** @returns {boolean} Whether the Node API has been requested yet. Test seam. */
export function _nodeApiRequested() {
    return modulePromise !== null;
}

/** Test seam: forget the memoised import so a test can observe a cold load. */
export function _resetNodeApiForTest() {
    modulePromise = null;
}
