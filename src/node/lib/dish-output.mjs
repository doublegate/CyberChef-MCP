/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Turning a baked Dish into the text an MCP client receives.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

/**
 * Render a baked result as the string a caller should see.
 *
 * The previous rule was `typeof value === "string" ? value : JSON.stringify(value)`, and it was
 * wrong for every operation whose output type is not `string` -- 175 of 504, including all 44
 * `byteArray` and 32 `ArrayBuffer` operations, which is to say **every decode**. Decoding
 * `SGVsbG8sIENoZWYh` returned
 *
 *     [72,101,108,108,111,44,32,67,104,101,102,33]
 *
 * rather than `Hello, Chef!`. Valid JSON, and useless: a model asking to decode base64 got a list
 * of integers, and the fix on the caller's side would be to know that this particular tool returns
 * character codes.
 *
 * A `NodeDish` knows how to present itself -- `toString()` is `presentAs(string)`, the same
 * conversion the CyberChef web UI applies before showing you the output pane. Using it makes the
 * MCP output match what the same recipe shows in the UI, which is the behaviour a caller expects.
 *
 * Ordering matters and is deliberate:
 *   1. An actual string passes through untouched, so the 329 string-output operations are
 *      byte-for-byte unchanged.
 *   2. Otherwise ask the Dish to present itself.
 *   3. If presentation throws -- some types have no string form, and a File does not -- fall back
 *      to the old JSON rendering rather than failing the call. A degraded answer beats an error.
 *
 * @param {Object} result - The value returned by `bake()`; normally a NodeDish.
 * @returns {string} Text suitable for an MCP `text` content block.
 */
export function dishToText(result) {
    if (typeof result?.value === "string") return result.value;

    if (result && typeof result.toString === "function" && result.toString !== Object.prototype.toString) {
        try {
            const presented = result.toString();
            // `presentAs` can legitimately produce "" (an empty result), which is a real answer --
            // but a bare "[object Object]" means toString did not actually present anything.
            if (typeof presented === "string" && presented !== "[object Object]") return presented;
        } catch {
            // fall through to the JSON rendering below
        }
    }

    return JSON.stringify(result?.value);
}
