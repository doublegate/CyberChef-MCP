/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The Piscina worker entry point.
 *
 * This file had never been measured: it was absent from `vitest.config.mjs`'s coverage include
 * list, so it appeared in no report while being our own code on the worker-threads path. It is a
 * 41-line module with one exported function, and it is a plain async function -- calling it
 * directly exercises the same code the worker thread runs, without needing a worker thread. There
 * was no reason for it to be unmeasured beyond nobody having looked.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import runTask from "../../src/node/worker.mjs";

describe("worker entry point", () => {
    it("bakes a recipe and returns the value as a string", async () => {
        const result = await runTask({ input: "abc", recipe: [{ op: "MD5", args: [] }] });
        expect(result.value).toBe("900150983cd24fb0d6963f7d28e17f72");
    }, 60000);

    it("rejects when the operation outruns its timeout", async () => {
        // `Sleep` rather than a heavy operation with a tight deadline: this has to be a race the
        // timeout wins every time, on a loaded CI runner as well as here, or the test is a flake
        // dressed as a guarantee.
        await expect(runTask({
            input: "abc",
            recipe: [{ op: "Sleep", args: [5000] }],
            timeout: 50
        })).rejects.toThrow(/Worker timeout after 50ms/);
    }, 60000);

    it("falls back to the default deadline when none is given", async () => {
        // `timeout || 30000`, so 0 and undefined both mean the default -- a caller passing 0
        // meaning "no limit" would otherwise get an immediate rejection instead.
        const result = await runTask({ input: "abc", recipe: [{ op: "MD5", args: [] }], timeout: 0 });
        expect(result.value).toBe("900150983cd24fb0d6963f7d28e17f72");
    }, 60000);
});
