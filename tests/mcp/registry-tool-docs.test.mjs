/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Every registry tool must be documented, and the stated count must match the registry.
 *
 * WHY THIS EXISTS. `ecdsa_recover` shipped in v3.4.0 and was never added to the wiki's
 * Analysis-Tools page, the user guide's list, the README bullet, or the counts in `Tool-Surface.md`
 * and `Home.md`. Five documents said "sixteen" for four releases. `cert_chain` in v3.8.0 compounded
 * it, and only then did anyone notice.
 *
 * The reason it drifted silently is worth stating, because it is the general lesson. v3.8.0 gated
 * two figures and this was a third:
 *
 *   operation count (504)   -- `scripts/check-version-consistency.mjs`, 37 discovered locations
 *   surface tuple           -- `tests/mcp/tool-surface-figures.test.mjs`, cross-document agreement
 *   registry-tool count     -- nothing
 *
 * A figure with no check behind it drifts, and the number of releases it takes to notice is
 * proportional to how rarely anyone recounts by hand.
 *
 * THIS CHECK IS STRONGER THAN THE SURFACE ONE, and deliberately so. `tool-surface-figures` can only
 * establish that documents agree with each other -- three documents can be consistently stale and
 * it passes. This one compares them against the **live registry**, built from the same explicit
 * import list the server uses, so a tool that exists in code and nowhere in prose fails. That is
 * exactly the shape of the defect it was written for.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = rel => readFileSync(resolve(ROOT, rel), "utf8");

/** Number words this project's prose actually uses, rather than a general spell-out library. */
const WORDS = {
    12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen", 16: "sixteen",
    17: "seventeen", 18: "eighteen", 19: "nineteen", 20: "twenty"
};

/**
 * Documents that state the registry-tool count, and how each phrases it. A document listed here
 * whose pattern matches NOTHING fails: a pattern that has quietly stopped matching is how a
 * consistency check silently stops checking, which this repository has now been bitten by twice.
 */
const COUNT_CLAIMS = [
    { file: "README.md", pattern: n => new RegExp(`\\*\\*${WORDS[n]} analysis tools`, "i") },
    { file: "docs/guides/user_guide.md", pattern: n => new RegExp(`\\*\\*The ${WORDS[n]} analysis tools`, "i") },
    { file: "docs/wiki/Tool-Surface.md", pattern: n => new RegExp(`the ${WORDS[n]}\\n\\[analysis tools\\]`, "i") },
    { file: "docs/wiki/Home.md", pattern: n => new RegExp(`\\*\\*${WORDS[n]} analysis tools\\*\\*`, "i") },
    { file: "docs/wiki/Analysis-Tools.md", pattern: n => new RegExp(`^${WORDS[n]} tools that are`, "im") },
    { file: "docs/wiki/FAQ.md", pattern: n => new RegExp(`What are the ${WORDS[n]} tools that are not operations`, "i") },
    { file: "AGENTS.md", pattern: n => new RegExp(`plus ${n} registry tools`) }
];

/**
 * Documents that must carry a written entry for every single tool are DISCOVERED, not listed.
 *
 * The first version of this file listed two files by hand, and a reviewer immediately found a
 * third -- `docs/wiki/FAQ.md`, whose heading said "sixteen" and whose list omitted both
 * `ecdsa_recover` and `cert_chain`. So the gate written to stop a hand-maintained list from going
 * stale went stale because it was a hand-maintained list. That is the third time in one release,
 * after `check:versions` (four files, claim in eleven) and `tool-surface-figures` (three files,
 * claim in seven), and at three occurrences the fix is the mechanism rather than another entry.
 *
 * The rule: a live document naming MORE THAN HALF the registry tools is behaving as an inventory,
 * and an inventory that lists most of them and not the rest is worse than one that lists none --
 * a reader takes it as complete. Half is deliberately a wide margin; the real inventories name all
 * of them and the incidental mentions name a handful.
 */
const INVENTORY_EXEMPT = new Map([
    [
        "THIRD-PARTY-NOTICES.md",
        "An attribution table keyed by BORROWED WORK, not an inventory of tools. It names the " +
        "twelve tools that owe something to a third party; the rest owe nothing and correctly do " +
        "not appear. Requiring all eighteen here would demand a false attribution."
    ]
]);

/** Live documentation, excluding what is historical by nature. */
function liveMarkdown() {
    const out = execFileSync("git", ["ls-files", "*.md"], { cwd: ROOT, encoding: "utf8" })
        .split("\n").filter(Boolean);
    return out.filter(f =>
        !f.startsWith("docs/releases/") &&
        !f.includes("findings-log") &&
        !f.startsWith("docs/planning/future-releases/") &&
        !f.startsWith("docs/planning/phases/") &&
        !f.startsWith("docs/planning/ext-proj-int/") &&
        f !== "CHANGELOG.md");
}

describe("registry tool documentation", () => {
    let names;

    beforeAll(async () => {
        const { buildRegistry } = await import("../../src/node/tools/index.mjs");
        names = buildRegistry().list().map(entry => entry.name).sort();
    });

    it("has a registry to check against", () => {
        expect(names.length).toBeGreaterThan(0);
        // The count must be one this project's prose can spell, or the claim check below silently
        // compares against `undefined` and passes for the wrong reason.
        expect(WORDS[names.length], `no number word for ${names.length}; extend WORDS`).toBeDefined();
    });

    it("states the right count everywhere it states one", () => {
        const wrong = [];
        for (const { file, pattern } of COUNT_CLAIMS) {
            const text = read(file);
            if (!pattern(names.length).test(text)) {
                // Report what it DOES say, so the failure names the fix rather than only the fault.
                const other = Object.entries(WORDS)
                    .filter(([n]) => Number(n) !== names.length)
                    .find(([n]) => pattern(Number(n)).test(text));
                wrong.push(`${file}: expected ${names.length}` +
                    (other ? `, found ${other[0]}` : ", and no count claim matched at all"));
            }
        }
        expect(wrong).toEqual([]);
    });

    it("documents every registered tool by name, in every document that acts as an inventory", () => {
        // The check that would have caught ecdsa_recover in v3.4.0, four releases before anyone did
        // -- and, once it discovers rather than lists, the FAQ that a reviewer found after it did.
        const missing = [];
        const inventories = [];

        for (const file of liveMarkdown()) {
            const text = read(file);
            const named = names.filter(name => text.includes(`cyberchef_${name}`));
            if (named.length * 2 <= names.length) continue;      // an incidental mention, not a list
            if (INVENTORY_EXEMPT.has(file)) continue;
            inventories.push(file);
            for (const name of names) {
                if (!named.includes(name)) missing.push(`${file}: cyberchef_${name}`);
            }
        }

        // Discovery finding nothing would pass vacuously and look identical to success, which is
        // the failure this whole file exists to prevent. The known inventories must be among them.
        expect(inventories).toEqual(expect.arrayContaining([
            "docs/wiki/Analysis-Tools.md", "docs/guides/commands.md", "docs/wiki/FAQ.md"
        ]));
        expect(missing).toEqual([]);
    });

    it("every exemption names a file that still exists and still qualifies", () => {
        // An exemption for a file that no longer looks like an inventory is an exemption nobody
        // will re-examine, and it silently widens the moment the file changes.
        for (const [file, reason] of INVENTORY_EXEMPT) {
            expect(liveMarkdown(), `${file} is exempt but not tracked`).toContain(file);
            expect(reason.length, `${file} needs a written reason`).toBeGreaterThan(40);
            const named = names.filter(name => read(file).includes(`cyberchef_${name}`));
            expect(named.length * 2, `${file} no longer qualifies; drop the exemption`)
                .toBeGreaterThan(names.length);
        }
    });
});
