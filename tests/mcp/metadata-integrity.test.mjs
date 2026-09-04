/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Tool metadata carries no concealed instructions.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every tool name, description, argument name and dropdown option a model reads comes from
 * `src/core/config/OperationConfig.json`, generated from `src/core/operations/**` -- a tree this
 * fork MIRRORS from upstream on every sync and must never hand-edit. That is a direct path from an
 * upstream commit to text a model treats as instruction, and the fork's review of a sync is a diff
 * review: a reviewer reading a rendered diff cannot see a Unicode TAG-block sequence at all,
 * because it renders as nothing.
 *
 * This is not a hypothetical class. Tool-description poisoning is the documented attack against
 * MCP servers, and TAG-block concealment is its stealthiest form -- see
 * `docs/reference/mcp-threat-model-2026.md`.
 *
 * WHAT IT ASSERTS, AND WHAT IT DOES NOT
 * -------------------------------------
 * It fails on characters that can HIDE text from a human reader while remaining visible to a
 * model: TAG-block, C0/C1 controls, bidi overrides, zero-width. It does NOT fail on ordinary
 * non-ASCII -- 89 of 7,408 strings carry accents, Greek letters and mathematical symbols, all
 * legitimate, and a rule that banned them would be turned off the first time upstream added a
 * cipher name with a diacritic.
 *
 * The distinction is the point: this guards against text a reviewer cannot see, not against text a
 * reviewer might not expect.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import OperationConfig from "../../src/core/config/OperationConfig.json" with { type: "json" };

// Built from char codes rather than written as literals: a source file that CONTAINS the
// characters it screens for is a file no reviewer can check either, and several of these are
// invisible in an editor.
const B = String.fromCharCode(92);
const CLASSES = [
    [
        "Unicode TAG block",
        new RegExp(`[${B}u{E0000}-${B}u{E007F}]`, "u"),
        "renders as nothing at all; the canonical way to hide an instruction in a description"
    ],
    [
        "C0/C1 control",
        new RegExp(`[${B}u0000-${B}u0008${B}u000b${B}u000c${B}u000e-${B}u001f${B}u007f-${B}u009f]`),
        "can truncate or reflow what a reviewer sees in a terminal"
    ],
    [
        "bidi override",
        new RegExp(`[${B}u200e${B}u200f${B}u202a-${B}u202e${B}u2066-${B}u2069]`),
        "reorders rendered text so the visible order differs from the byte order"
    ],
    [
        "zero-width",
        // ZWJ in a character class is what `no-misleading-character-class` warns about, and
        // screening for it is the entire purpose here: a joiner hidden in a description splits a
        // word for a human reader while a model reads it whole. The disable sits on the regex
        // line itself -- placed on the comment above, the rule reported it as unused and then
        // fired anyway one line down.
        // eslint-disable-next-line no-misleading-character-class
        new RegExp(`[${B}u200b${B}u200c${B}u200d${B}ufeff]`),
        "invisible; splits a word for a human while a model reads it whole"
    ]
];

/** @returns {Array<{where: string, text: string}>} Every string an MCP client is shown. */
function modelVisibleStrings() {
    const out = [];
    for (const [name, op] of Object.entries(OperationConfig)) {
        out.push({ where: `${name} (name)`, text: name });
        if (op.description) out.push({ where: `${name} (description)`, text: op.description });
        for (const arg of op.args ?? []) {
            if (arg.name) out.push({ where: `${name} arg ${arg.name}`, text: arg.name });
            if (Array.isArray(arg.value)) {
                for (const v of arg.value) {
                    if (typeof v === "string") {
                        out.push({ where: `${name} arg ${arg.name} option`, text: v });
                    }
                }
            }
        }
    }
    return out;
}

describe("tool metadata integrity", () => {
    const strings = modelVisibleStrings();

    it("reads every string a client is shown", () => {
        // A guard over an empty set passes silently, which is the failure mode this whole file is
        // about. Pinned so a change to the config shape cannot quietly empty it.
        expect(OperationConfig && Object.keys(OperationConfig).length).toBeGreaterThan(500);
        expect(strings.length).toBeGreaterThan(7000);
    });

    for (const [label, pattern, why] of CLASSES) {
        it(`carries no ${label} characters -- ${why}`, () => {
            const found = strings.filter(s => pattern.test(s.text)).map(s => s.where);
            expect(found, `${label} found in: ${found.slice(0, 10).join(", ")}`).toEqual([]);
        });
    }

    it("detects the class it screens for, rather than passing vacuously", () => {
        // The screens are proven against synthesised inputs. Without this, a regex that matched
        // nothing -- a mistyped range, an escaping slip -- would look identical to a clean tree.
        const samples = {
            "Unicode TAG block": `Base64${String.fromCodePoint(0xE0041)}`,
            "C0/C1 control": `Base64${String.fromCharCode(7)}`,
            "bidi override": `Base64${String.fromCharCode(0x202e)}`,
            "zero-width": `Base64${String.fromCharCode(0x200b)}`
        };
        for (const [label, pattern] of CLASSES) {
            expect(pattern.test(samples[label]), `${label} screen matched nothing`).toBe(true);
            expect(pattern.test("Ordinary description text."), `${label} screen over-matches`)
                .toBe(false);
        }
    });

    it("tolerates ordinary non-ASCII, deliberately", () => {
        // 89 of 7,408 strings carry accents, Greek letters or mathematical symbols. Banning them
        // would fail the first sync that adds a cipher name with a diacritic, and the rule would
        // be removed rather than the metadata fixed. Visible characters are a reviewer's problem;
        // invisible ones are this test's.
        const NON_ASCII = new RegExp(`[^${B}u0020-${B}u007e${B}n${B}r${B}t]`);
        const count = strings.filter(s => NON_ASCII.test(s.text)).length;
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThan(strings.length * 0.05);
    });
});
