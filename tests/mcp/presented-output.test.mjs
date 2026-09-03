/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Presented markup versus the actual result.
 *
 * 44 operations declare a `presentType` that differs from their `outputType`. The presenter targets
 * a browser, and `bakeOnCore` asks for the presented form because a handful of those operations
 * carry their payload ONLY in the markup -- `Generate QR Code` emits `<img src="data:image/png...">`
 * and the bytes exist nowhere else.
 *
 * For every other one the presentation was strictly worse, and for `JSON Beautify` it was WRONG:
 * its presenter renders an object key as bare text inside `<li>name<span class="json-colon">:</span>`,
 * so the quotes around each key are markup structure rather than characters. Reducing that to text
 * produced `{name: "alice",age: 30}` -- unparseable, with the indentation the operation exists to
 * add also gone.
 *
 * These tests pin both directions at once, because a fix for one is the obvious way to break the
 * other: the data operations must return their data, and the image operations must still return
 * their image.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { bakeOnCore } from "../../src/node/lib/core-recipe.mjs";
import { toContentBlocks } from "../../src/node/lib/content-blocks.mjs";

/**
 * Bake and render exactly as a tool call does.
 *
 * @param {string} input - The input data.
 * @param {Array} recipe - The recipe.
 * @returns {Promise<Array>} The MCP content blocks.
 */
async function blocksFor(input, recipe) {
    const result = await bakeOnCore(input, recipe);
    return toContentBlocks(result, result.outputType);
}

describe("operations whose presentation is browser markup", () => {
    it("returns JSON Beautify output that actually parses", async () => {
        const input = JSON.stringify({ name: "alice", age: 30, tags: ["a", "b"] });
        const [block] = await blocksFor(input, [
            { op: "JSON Beautify", args: ["    ", false, true] }
        ]);

        expect(block.type).toBe("text");
        // The headline. Before this release the client received `{name: "alice",age: 30,...}`,
        // which throws here -- a "beautify" that emits invalid JSON is a silently wrong answer.
        const parsed = JSON.parse(block.text);
        expect(parsed).toEqual({ name: "alice", age: 30, tags: ["a", "b"] });
        // And it must be beautified, which is the operation's entire purpose.
        expect(block.text).toContain("\n");
        expect(block.text).toContain("    ");
    });

    it("returns Text Encoding Brute Force as data, not a fused table", async () => {
        const [block] = await blocksFor("Hello", [
            { op: "Text Encoding Brute Force", args: ["Encode"] }
        ]);

        // The stripped table ran its headers into its first value: `EncodingValueUTF-8
        // (65001)Hello...`, with no delimiter anywhere. Nothing can read that back.
        expect(block.text).not.toContain("EncodingValue");
        const parsed = JSON.parse(block.text);
        expect(parsed["UTF-8 (65001)"]).toBe("Hello");
    });

    it("returns Frequency distribution as data, without the chart markup", async () => {
        const [block] = await blocksFor("hello world hello", [
            { op: "Frequency distribution", args: [true, true] }
        ]);

        // The presented form opened with `<canvas id='chart-area'></canvas>` -- an element for a
        // browser to draw into, carrying no data at all, and 2.7x the size of the real answer.
        expect(block.text).not.toContain("chart-area");
        const parsed = JSON.parse(block.text);
        expect(parsed.dataLength).toBe(17);
    });

    it("leaves no markup in any of them", async () => {
        const recipes = [
            ["{\"a\":1}", [{ op: "JSON Beautify", args: ["    ", false, true] }]],
            ["Hello", [{ op: "Text Encoding Brute Force", args: ["Encode"] }]],
            ["hello world", [{ op: "Frequency distribution", args: [true, true] }]]
        ];
        for (const [input, recipe] of recipes) {
            const [block] = await blocksFor(input, recipe);
            expect(block.text).not.toMatch(/<[a-z][a-z0-9]*(\s[^>]*)?>/i);
        }
    });

    it("still returns a picture for the operations whose payload IS the markup", async () => {
        // The other direction, and the reason `bakeOnCore` asks for the presented form at all.
        // `Generate QR Code` puts the PNG in a data URI inside an `<img>`; take the raw dish here
        // and the image is gone. This is the assertion that stops the fix above going too far.
        const [block] = await blocksFor("https://example.com", [
            { op: "Generate QR Code", args: ["PNG", 5, 4, "Medium"] }
        ]);

        expect(block.type).toBe("image");
        expect(block.mimeType).toBe("image/png");
        expect(block.data.length).toBeGreaterThan(100);
    });

    it("does not mistake a result that merely contains angle brackets for markup", async () => {
        // The swap is triggered by something that LOOKS like an opening tag, so a caller whose
        // data is XML -- or a diff, or a shell snippet -- must get their bytes back untouched.
        const xml = "<note><to>Bob</to><from>Alice</from></note>";
        const [block] = await blocksFor(xml, [{ op: "To Upper case", args: ["All"] }]);
        expect(block.text).toBe(xml.toUpperCase());
    });

    it("leaves ordinary operations completely unaffected", async () => {
        const [block] = await blocksFor("hello", [
            { op: "To Base64", args: ["A-Za-z0-9+/="] }
        ]);
        expect(block.text).toBe("aGVsbG8=");
    });
});
