/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The documented tool-surface figures must agree with each other.
 *
 * WHY THIS EXISTS. v3.8.0 added one registry tool, which moved every surface by one tool and by a
 * few thousand bytes. The BYTE figures were re-measured and updated in all three live documents.
 * The TOOL COUNTS were not. `README.md` ended up saying 545 in one clause and 544 in the next;
 * `tool-catalog.mjs` paired new byte counts with old tool counts; and its round-trip sentence
 * claimed the index plus one schema was 42,415 bytes when the index ALONE had just been documented
 * at 44,406 -- a figure impossible on its face.
 *
 * None of it was caught by a gate. `scripts/check-version-consistency.mjs` discovers and checks
 * OPERATION counts (504) across 37 locations and has never covered SURFACE counts, so a partial
 * update reported itself as complete. That is the same defect v3.7.0 fixed for a different claim:
 * a check that covers some occurrences of a claim reads as covering the claim.
 *
 * WHAT THIS DOES AND DOES NOT ESTABLISH, because that distinction is the value of the check.
 * It establishes that every live document AGREES, so changing one forces the rest. It does NOT
 * establish that any of them match reality -- only `npm run measure:surfaces` does that, by driving
 * a real client and counting bytes. Three documents can be consistently stale, and this test will
 * pass. It is deliberately the cheap half: no server, no measurement, milliseconds, so it can run
 * in the ordinary suite. Re-measure before a release; this stops the numbers from diverging in
 * between.
 *
 * A pattern that matches NOTHING fails, rather than passing vacuously. A regex that has quietly
 * stopped matching is how a consistency check silently stops checking -- the failure mode this
 * repository has now hit twice.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = rel => readFileSync(resolve(ROOT, rel), "utf8");

/** "44,406" -> 44406. */
const num = s => Number(s.replace(/,/g, ""));

/**
 * The canonical table in the header of `tool-catalog.mjs`, which is where the output of
 * `npm run measure:surfaces` is transcribed. Every other document is compared against this.
 *
 * @returns {{surface: string, tools: number, bytes: number}[]} One entry per surface.
 */
function canonical() {
    const text = read("src/node/lib/tool-catalog.mjs");
    const rows = [...text.matchAll(/^\s*\*\s+(all|curated|index)\s+(\d+) tools\s+([\d,]+) bytes/gm)];
    expect(rows.length, "the tool-catalog.mjs header table stopped matching").toBe(3);
    return rows.map(m => ({ surface: m[1], tools: Number(m[2]), bytes: num(m[3]) }));
}

describe("documented tool-surface figures", () => {
    it("has one canonical table with three surfaces", () => {
        const table = canonical();
        expect(table.map(r => r.surface).sort()).toEqual(["all", "curated", "index"]);
        // Ordering is a real property: `all` is the most expensive and `index` the cheapest, and a
        // table that contradicted that would mean the figures had been shuffled between rows.
        const bySurface = Object.fromEntries(table.map(r => [r.surface, r]));
        expect(bySurface.all.bytes).toBeGreaterThan(bySurface.curated.bytes);
        expect(bySurface.curated.bytes).toBeGreaterThan(bySurface.index.bytes);
        expect(bySurface.all.tools).toBeGreaterThan(bySurface.curated.tools);
        expect(bySurface.curated.tools).toBeGreaterThan(bySurface.index.tools);
    });

    it("AGENTS.md agrees with the canonical table", () => {
        const bySurface = Object.fromEntries(canonical().map(r => [r.surface, r]));
        const m = read("AGENTS.md").match(
            /\*\*index\*\* by default \((\d+) tools, \*\*([\d,]+) bytes\*\*\)[^)]*?for (\d+) \(([\d,]+)\) or all (\d+) \(([\d,]+)\)/);
        expect(m, "the AGENTS.md tool-surface sentence stopped matching").not.toBeNull();

        expect({ tools: Number(m[1]), bytes: num(m[2]) })
            .toEqual({ tools: bySurface.index.tools, bytes: bySurface.index.bytes });
        expect({ tools: Number(m[3]), bytes: num(m[4]) })
            .toEqual({ tools: bySurface.curated.tools, bytes: bySurface.curated.bytes });
        expect({ tools: Number(m[5]), bytes: num(m[6]) })
            .toEqual({ tools: bySurface.all.tools, bytes: bySurface.all.bytes });
    });

    it("README.md agrees with the canonical table", () => {
        const bySurface = Object.fromEntries(canonical().map(r => [r.surface, r]));
        const text = read("README.md");

        const headline = text.match(
            /\*\*index\*\* by default — (\d+) tools and ([\d,]+) bytes, rather than (\d+) tools and ([\d,]+) bytes/);
        expect(headline, "the README.md headline surface sentence stopped matching").not.toBeNull();
        expect({ tools: Number(headline[1]), bytes: num(headline[2]) })
            .toEqual({ tools: bySurface.index.tools, bytes: bySurface.index.bytes });
        expect({ tools: Number(headline[3]), bytes: num(headline[4]) })
            .toEqual({ tools: bySurface.all.tools, bytes: bySurface.all.bytes });

        // The same paragraph names curated and all a SECOND time, in a different shape. That
        // duplication is what produced "545 ... 544" three sentences apart, so both are checked.
        const presets = text.match(
            /curated` \((\d+) tools, ([\d,]+) bytes\) or `=all` \(all (\d+), ([\d,]+) bytes\)/);
        expect(presets, "the README.md preset sentence stopped matching").not.toBeNull();
        expect({ tools: Number(presets[1]), bytes: num(presets[2]) })
            .toEqual({ tools: bySurface.curated.tools, bytes: bySurface.curated.bytes });
        expect({ tools: Number(presets[3]), bytes: num(presets[4]) })
            .toEqual({ tools: bySurface.all.tools, bytes: bySurface.all.bytes });
    });

    // The wiki and the reference notes state the same figures in their own phrasings, and the
    // first version of this file did not look at them. A reviewer found `Home.md` still saying
    // "40 tools and not 543" AFTER a sweep that was supposed to have caught exactly that, and two
    // more turned up beside it. A gate covering three of seven documents reads as covering the
    // claim -- which is the lesson v3.7.0 recorded about files and v3.8.0 repeated about phrasings,
    // arriving a third time.
    //
    // Each entry pulls the numbers out in that document's own wording. A pattern that matches
    // NOTHING fails, so a rephrasing surfaces as a failure rather than as silence.
    const PROSE_CLAIMS = [
        {
            file: "docs/wiki/Home.md",
            extract: t => t.match(/Why you see (\d+) tools and not (\d+)/),
            expect: s => [String(s.index.tools), String(s.all.tools)]
        },
        {
            file: "docs/wiki/FAQ.md",
            extract: t => t.match(/CYBERCHEF_TOOL_SURFACE=curated` \((\d+)\) or `=all` \((\d+)\)/),
            expect: s => [String(s.curated.tools), String(s.all.tools)]
        },
        {
            file: "docs/wiki/Recipes.md",
            extract: t => t.match(/deliberately pre-loads only (\d+) tools/),
            expect: s => [String(s.index.tools)]
        },
        {
            file: "docs/reference/agent-tool-design.md",
            extract: t => t.match(/`index` surface can pre-load (\d+) tools/),
            expect: s => [String(s.index.tools)]
        }
    ];

    it("the wiki and reference prose agree with the canonical table", () => {
        const bySurface = Object.fromEntries(canonical().map(r => [r.surface, r]));
        const wrong = [];
        for (const { file, extract, expect: wanted } of PROSE_CLAIMS) {
            const m = extract(read(file));
            if (!m) {
                wrong.push(`${file}: the surface-count sentence stopped matching`);
                continue;
            }
            const found = m.slice(1);
            const want = wanted(bySurface);
            if (found.join(",") !== want.join(",")) {
                wrong.push(`${file}: expected ${want.join("/")}, found ${found.join("/")}`);
            }
        }
        expect(wrong).toEqual([]);
    });

    it("the round-trip figure is larger than the index it contains", () => {
        // The defect that made this file worth writing. "index plus one operation schema" was
        // documented at 42,415 bytes while the index alone was documented at 44,406 -- a claim that
        // needs no measurement to refute, only arithmetic. The multiplier is checked against the
        // two figures it is derived from for the same reason.
        const bySurface = Object.fromEntries(canonical().map(r => [r.surface, r]));
        const text = read("src/node/lib/tool-catalog.mjs");

        const m = text.match(
            /index plus one operation schema -- ([\d,]+) bytes against\s*\*?\s*([\d,]+), or \*\*([\d.]+)x cheaper\*\*/);
        expect(m, "the tool-catalog.mjs round-trip sentence stopped matching").not.toBeNull();

        const roundTrip = num(m[1]);
        expect(roundTrip).toBeGreaterThan(bySurface.index.bytes);
        expect(num(m[2])).toBe(bySurface.all.bytes);
        // One decimal place, so allow the rounding the prose uses.
        expect(Number(m[3])).toBeCloseTo(bySurface.all.bytes / roundTrip, 1);
    });
});

describe("the canonical table against a live measurement", () => {
    // WHY THIS EXISTS, and why the four tests above do not cover it.
    //
    // Every check above compares documents to the table in `tool-catalog.mjs`'s header. That
    // establishes AGREEMENT, not TRUTH -- if the table itself drifts, every document agrees with a
    // stale number and all four pass. `registry-tool-docs.test.mjs` says exactly this in its own
    // header ("three documents can be consistently stale and it passes") and it is not hypothetical:
    // entering v3.9.0 the table read 44,406 / 107,652 / 424,810 while the server actually served
    // 44,493 / 107,739 / 424,897. A uniform +87 across all three surfaces, and the gate was green.
    //
    // So this measures. Same method as `npm run measure:surfaces` -- a real MCP client against a
    // real server, `Buffer.byteLength(JSON.stringify({tools}))`, envelope excluded -- because a
    // figure derived a second way is a second figure, not a check on the first.
    const SERVER = resolve(ROOT, "src/node/mcp-server.mjs");

    /**
     * `tools/list` as it actually goes over the wire for one surface.
     *
     * @param {string} surface - `index`, `curated` or `all`.
     * @returns {Promise<{tools: number, bytes: number}>} The measured pair.
     */
    async function measure(surface) {
        const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
        const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
        const client = new Client({ name: "surface-gate", version: "0.0.0" }, { capabilities: {} });
        // CYBERCHEF_TOOL_ALLOWLIST and CYBERCHEF_EXPOSE_ALL_OPS both OUTRANK
        // CYBERCHEF_TOOL_SURFACE, so inheriting either from the ambient environment would measure
        // a surface other than the one named and compare it against the table anyway -- a false
        // failure on someone's machine, or worse a false pass. Reviewer-found.
        const env = { ...process.env, CYBERCHEF_TOOL_SURFACE: surface, CYBERCHEF_LOG_LEVEL: "silent" };
        delete env.CYBERCHEF_TOOL_ALLOWLIST;
        delete env.CYBERCHEF_EXPOSE_ALL_OPS;
        await client.connect(new StdioClientTransport({
            command: process.execPath,
            args: [SERVER],
            env
        }));
        try {
            const { tools } = await client.listTools();
            return { tools: tools.length, bytes: Buffer.byteLength(JSON.stringify({ tools }), "utf8") };
        } finally {
            await client.close();
        }
    }

    it("serves exactly the tool counts and byte sizes the table records", async () => {
        const recorded = Object.fromEntries(canonical().map(r => [r.surface, r]));
        const wrong = [];

        for (const surface of ["index", "curated", "all"]) {
            const live = await measure(surface);
            const said = recorded[surface];
            if (!said) {
                wrong.push(`${surface}: absent from the canonical table`);
                continue;
            }
            if (live.tools !== said.tools) {
                wrong.push(`${surface} tools: table says ${said.tools}, server serves ${live.tools}`);
            }
            // EXACT, not a tolerance. These are deterministic serialisations of a fixed catalogue,
            // so any difference at all is a real change that the documents must follow. A tolerance
            // here would let the drift this test was written for accumulate silently under it.
            if (live.bytes !== said.bytes) {
                wrong.push(`${surface} bytes: table says ${said.bytes}, server serves ${live.bytes}` +
                    ` (${live.bytes - said.bytes >= 0 ? "+" : ""}${live.bytes - said.bytes})` +
                    ` -- re-run \`npm run measure:surfaces\` and update the table and every document`);
            }
        }

        expect(wrong.join("\n")).toBe("");
    }, 180000);
});
