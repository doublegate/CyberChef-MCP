/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The release-note link rewriter, `scripts/absolutise-release-links.py`.
 *
 * WHY A JS SUITE TESTS A PYTHON SCRIPT
 * ------------------------------------
 * The script runs in `mcp-release.yml`, whose job has no `setup-node` -- so Python, which is
 * preinstalled on the runner, avoids adding a setup step to the one workflow where extra machinery
 * is least welcome. That leaves it outside every existing gate, which is exactly how the defects
 * below got as far as they did. Running it as a subprocess from vitest puts it back inside the gate
 * without changing the release path.
 *
 * WHAT IT PROTECTS
 * ----------------
 * A release body renders on the Releases page, not inside the tree, so a relative link 404s for
 * every reader of the release. v2.0.0 shipped 8 such links and v2.1.0 shipped 3, all broken.
 *
 * Two mistakes were made writing the fix, and both are pinned here because neither is obvious:
 *
 *   - **Depth matters.** The first version used `sed` to strip every leading `../` and prepend the
 *     repository root. `../guides/x.md` sits beside the notes under `docs/`, so it resolves to
 *     `docs/guides/x.md` -- not `guides/x.md`. Only `../../` happened to land correctly.
 *   - **An absolute path silently produces garbage** unless it is made relative first: `dirname`
 *     of an absolute path embeds the checkout directory in every URL.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const SCRIPT = join(REPO_ROOT, "scripts", "absolutise-release-links.py");
const FIXTURE_DIR = join(REPO_ROOT, "docs", "releases");
const FIXTURE = join(FIXTURE_DIR, "__link-rewriter-fixture.md");
const REL_FIXTURE = "docs/releases/__link-rewriter-fixture.md";
const BASE = "https://github.com/owner/repo/blob/v9.9.9/";

/**
 * Run the rewriter over `markdown` and return its output.
 *
 * @param {string} markdown - The note body.
 * @param {string} [path] - Path to pass to the script.
 * @returns {string} The rewritten body.
 */
function rewrite(markdown, path = REL_FIXTURE) {
    writeFileSync(FIXTURE, markdown);
    return execFileSync("python3", [SCRIPT, path, "owner/repo", "v9.9.9"], {
        cwd: REPO_ROOT,
        encoding: "utf8"
    });
}

beforeAll(() => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
});

afterAll(() => {
    rmSync(FIXTURE, { force: true });
});

describe("absolutise-release-links", () => {
    it("resolves a sibling directory against the note's own location", () => {
        // The case sed got wrong. `docs/releases/` + `../guides/` is `docs/guides/`.
        expect(rewrite("[a](../guides/tutorial.md)")).toBe(`[a](${BASE}docs/guides/tutorial.md)`);
    });

    it("resolves a link that climbs to the repository root", () => {
        expect(rewrite("[b](../../examples/)")).toBe(`[b](${BASE}examples/)`);
    });

    it("keeps a trailing slash, so a directory link stays a directory link", () => {
        // normpath eats it, and without it GitHub renders a file page for a directory.
        expect(rewrite("[b](../../examples/)")).toMatch(/examples\/\)$/);
    });

    it("resolves an explicit ./ sibling", () => {
        expect(rewrite("[c](./v2.1.0.md)")).toBe(`[c](${BASE}docs/releases/v2.1.0.md)`);
    });

    it("leaves anchors, external URLs and bare names alone", () => {
        // A bare `](x.md)` is ambiguous with an anchor or an external shortlink; guessing wrong
        // would break a link that currently works.
        const input = "[d](#anchor) [e](https://x.test/y) [f](bare.md)";
        expect(rewrite(input)).toBe(input);
    });

    it("leaves a link that escapes the repository root for a human to fix", () => {
        // Broken either way; publishing a URL that cannot resolve would hide it.
        expect(rewrite("[g](../../../escape.md)")).toBe("[g](../../../escape.md)");
    });

    it("rewrites every link in a realistic note", () => {
        const out = rewrite([
            "# Release", "",
            "See [the disposition](../security/disposition.md) and",
            "[the guide](../guides/user_guide.md), plus [examples](../../examples/).",
            "Unchanged: [spec](https://modelcontextprotocol.io) and [#12](#12)."
        ].join("\n"));

        expect(out).toContain(`${BASE}docs/security/disposition.md`);
        expect(out).toContain(`${BASE}docs/guides/user_guide.md`);
        expect(out).toContain(`${BASE}examples/`);
        expect(out).toContain("https://modelcontextprotocol.io");
        expect(out).not.toMatch(/\]\(\.\.?\//);
    });

    it("handles an absolute notes path without embedding the checkout directory", () => {
        // Without the relpath guard this produced URLs containing the runner's working directory --
        // valid-looking and completely wrong.
        expect(rewrite("[a](../guides/tutorial.md)", FIXTURE))
            .toBe(`[a](${BASE}docs/guides/tutorial.md)`);
    });

    it("is a no-op on a note that has no relative links", () => {
        const input = "# Release\n\nNothing relative here.\n";
        expect(rewrite(input)).toBe(input);
    });
});
