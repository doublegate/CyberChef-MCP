/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Adding a registry tool must not grow the `index` surface.
 *
 * WHAT THIS REPLACED, AND WHY THAT MATTERS
 * ----------------------------------------
 * The v4.1.0 charter claimed the index would cost more than `curated` at 59 registry tools, and
 * that figure reordered the whole v4 line. It is arithmetically impossible, and the first version
 * of this file is what disproved it: forty synthetic registry tools were injected to prove the
 * gate could fail, and the ordering assertion did not fail. Measured directly:
 *
 *     index 44,968 -> 121,408   curated 108,214 -> 184,654   gap 63,246 -> 63,246
 *
 * Registry tools are listed on EVERY surface -- `CYBERCHEF_TOOL_SURFACE` selects how many
 * *operation* schemas to pre-load and has never governed them -- so each one added grows all three
 * equally and the gap is a constant. See F-02 in `docs/internal/v4.1.0-findings-log.md`.
 *
 * The real finding, which survived: 19 registry tools were 30,683 of the index's 44,968 bytes,
 * 68%, on the surface whose entire purpose is being small.
 *
 * SO THIS GATE ASSERTS THE PROPERTY THAT CAN ACTUALLY MOVE
 * -------------------------------------------------------
 * After v4.1.0, registry tools are reachable but not listed on `index`. That makes the growth
 * curve flat, and flatness is directly testable: the index must contain none of them, so adding a
 * twentieth or a hundredth changes its size by zero. A gate on "is the index still smaller than
 * curated" could never fail; this one fails the moment a registry tool leaks back onto the index.
 *
 * The tool-count assertion is the other half, and it is the one with external evidence behind it.
 * Anthropic documents that tool-selection accuracy "degrades once you exceed 30-50 available
 * tools". The index was 41 -- inside that band -- which means the pre-v4.1.0 surface was the
 * degraded condition and the release that did nothing carried the risk. Staying under 30 is the
 * property worth holding.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER = resolve(ROOT, "src/node/mcp-server.mjs");

/**
 * The accuracy band Anthropic publishes for tool selection, and the ceiling this gate holds.
 *
 * "Claude's ability to pick the right tool degrades once you exceed 30-50 available tools."
 * Held at the bottom of the band rather than the top: 50 is where degradation is established, 30
 * is where it starts, and a default surface should sit below the start.
 */
const ACCURACY_BAND_FLOOR = 30;

/**
 * `tools/list` as it goes over the wire, through a real client.
 *
 * @param {string} surface - `index`, `curated` or `all`.
 * @returns {Promise<{tools: Array<Object>, bytes: number}>} The listed tools and their wire size.
 */
async function measure(surface) {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    const client = new Client({ name: "growth-gate", version: "0.0.0" }, { capabilities: {} });
    // Both OUTRANK CYBERCHEF_TOOL_SURFACE, so inheriting either would measure a different surface
    // than the one named and compare it anyway.
    const env = { ...process.env, CYBERCHEF_TOOL_SURFACE: surface, CYBERCHEF_LOG_LEVEL: "silent" };
    delete env.CYBERCHEF_TOOL_ALLOWLIST;
    delete env.CYBERCHEF_EXPOSE_ALL_OPS;
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env }));
    try {
        const { tools } = await client.listTools();
        return { tools, bytes: Buffer.byteLength(JSON.stringify({ tools }), "utf8") };
    } finally {
        await client.close();
    }
}

/**
 * Every registry tool's exposed name, discovered from the registry.
 *
 * Discovery rather than a list: a hand-written set of nineteen names would have to be edited by
 * the very change that adds a twentieth, which is the change this gate exists to catch.
 *
 * @returns {Promise<Set<string>>} Exposed names.
 */
async function registryExposedNames() {
    const { buildRegistry, ToolRegistry } = await import(resolve(ROOT, "src/node/tools/index.mjs"));
    return new Set(buildRegistry().list().map(t => ToolRegistry.exposedName(t.name)));
}

describe("registry tools do not grow the index surface", () => {
    it("lists no registry tool on `index`, so the growth curve is flat", async () => {
        const { tools } = await measure("index");
        const registry = await registryExposedNames();
        const leaked = tools.map(t => t.name).filter(n => registry.has(n));

        expect(leaked,
            `${leaked.length} registry tool(s) are listed on the index surface: ` +
            `${leaked.join(", ")}.\n` +
            "Registry tools are reachable through `cyberchef_analyse` and describable through " +
            "`cyberchef_describe_operation`; they are deliberately not listed on the default " +
            "surface, because each one listed costs every caller its full schema on every " +
            "`tools/list`. Nineteen of them were 68% of this surface before v4.1.0.\n" +
            "If a tool genuinely must be listed by default, that is a charter-level decision -- " +
            "see docs/planning/v4/charters/v4.1.0.md -- not a test to update."
        ).toEqual([]);
    }, 180000);

    it("still lists every registry tool on `curated` and `all`", async () => {
        // The other direction, and the one that stops this gate being satisfied by deleting the
        // tools. `index` is a DEFAULT, not a capability boundary: a caller who asks for the larger
        // surfaces must still get them outright rather than having to discover them.
        const registry = await registryExposedNames();
        for (const surface of ["curated", "all"]) {
            const { tools } = await measure(surface);
            const listed = new Set(tools.map(t => t.name));
            const missing = [...registry].filter(n => !listed.has(n));
            expect(missing,
                `${surface} is missing ${missing.length} registry tool(s): ${missing.join(", ")}.\n` +
                "v4.1.0 removed them from `index` only. A caller who opts into a larger surface " +
                "is asking for schemas up front and must receive them."
            ).toEqual([]);
        }
    }, 180000);

    it("keeps the index under the published tool-selection accuracy band", async () => {
        const { tools } = await measure("index");

        expect(tools.length,
            `The index lists ${tools.length} tools. Anthropic documents that tool-selection ` +
            `accuracy "degrades once you exceed 30-50 available tools", so a default surface ` +
            `should sit below ${ACCURACY_BAND_FLOOR}.\n` +
            "This is not a byte budget -- it is a correctness property of the thing consuming " +
            "the list. Before v4.1.0 the index was 41 tools, inside the band, which made the " +
            "status quo the degraded condition. Do not raise this number to make a tool fit; " +
            "reach it through `cyberchef_analyse` instead."
        ).toBeLessThan(ACCURACY_BAND_FLOOR);
    }, 180000);

    it("costs materially less than `curated`, and the gap is about operations not tools", async () => {
        // Kept, but stated correctly this time. The index IS cheaper than curated -- that part was
        // always true. What was wrong was believing registry tools could close the gap. They
        // cannot: the difference is the curated operation schemas and nothing else, which is why
        // this assertion is about a ratio and carries no projection.
        const [index, curated] = [await measure("index"), await measure("curated")];
        expect(index.bytes).toBeLessThan(curated.bytes);
        expect(index.tools.length).toBeLessThan(curated.tools.length);
    }, 180000);
});
