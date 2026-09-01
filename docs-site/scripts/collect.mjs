/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Builds the site's content from the repository, so there is exactly one source of truth.
 *
 * The alternative -- copying `docs/**` into `src/content/docs/` and committing it -- produces two
 * copies of every page, and the copy is the one contributors edit because it is the one the site
 * builds from. This repository has spent three releases deleting claims that had drifted from the
 * code; a documentation site that drifts from `docs/` would be the same failure with a nicer font.
 *
 * So: `docs/**` stays authoritative and uncommitted-to here, the generated tree is gitignored, and
 * this script runs before every build.
 *
 * Two things it does that a plain copy cannot:
 *
 *   1. **Rewrites repository-relative links.** `docs/guides/user_guide.md` links to
 *      `../releases/v2.3.0.md`, which is correct in the repository and 404s on a site where the
 *      page lives at `/guides/user-guide/`. Links that leave the published set are rewritten to
 *      point at GitHub rather than left broken.
 *   2. **Generates the tool reference from `OperationConfig`.** The hand-maintained
 *      `docs/guides/commands.md` is 349 KB and can only be wrong; the operation list, argument
 *      names and types are already in the config the server itself reads. Generating them means the
 *      reference cannot disagree with the server.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = resolve(HERE, "../src/content/docs");

/**
 * The published set, in sidebar order.
 *
 * An allowlist, not a sweep of `docs/**`. Of the 141 markdown files in this repository, most are
 * working documents -- sprint plans, findings logs, tech-debt analyses, a 63-file planning tree.
 * They are valuable and they stay in the repository; they are not documentation of the product,
 * and publishing them would bury the pages someone actually needs.
 */
const PAGES = [
    // section, source path, slug, title override, description
    ["start", "README.md", "overview", "Overview", "What this is, and how to run it."],
    ["guides", "docs/guides/user_guide.md", "user-guide", "User guide", "Installing, configuring and running the server."],
    ["guides", "docs/guides/tutorial.md", "tutorial", "Tutorial", "A first session, end to end."],
    ["guides", "docs/guides/http-transport.md", "http-transport", "HTTP transport", "Streamable HTTP, sessions and the host allowlist."],
    ["guides", "docs/guides/recipe_management.md", "recipes", "Recipes", "Saving, sharing and executing recipes."],
    ["guides", "docs/guides/upstream-sync-guide.md", "upstream-sync", "Upstream sync", "How this fork tracks GCHQ CyberChef."],
    ["architecture", "docs/architecture/architecture.md", "architecture", "Architecture", "How the server is put together."],
    ["architecture", "docs/architecture/technical_implementation.md", "implementation", "Implementation notes", "The MCP layer in detail."],
    ["architecture", "docs/architecture/performance-tuning.md", "performance", "Performance", "Streaming, workers, caching and their limits."],
    ["security", "SECURITY.md", "policy", "Security policy", "Reporting a vulnerability, and what is in scope."],
    ["security", "docs/security/2026-08-31-open-alert-sweep.md", "alert-disposition", "Alert disposition", "Every open finding, fixed or justified."],
    ["security", "docs/security/2026-08-30-saferegex-reverted-by-upstream-sync.md", "saferegex-incident", "A mitigation that vanished", "Why fork changes are patches, not edits."],
    ["decisions", "docs/adr/0001-relicense-to-gpl-3-0-or-later.md", "adr-0001-gpl", "ADR 0001: GPL-3.0-or-later", "Why the licence changed, and why v3 specifically."],
    ["decisions", "docs/v2.0.0-breaking-changes.md", "v2-migration", "v2.0.0 migration", "What changed, and what was withdrawn."]
];

/** Release notes are collected wholesale: they are the project's history and each is self-contained. */
const RELEASE_DIR = join(REPO, "docs/releases");

/** Paths that exist in the published set, so a link to one can be rewritten to a site route. */
const published = new Map();

/**
 * A URL-stable slug for a release note.
 *
 * @param {string} file - e.g. `v2.3.0.md`.
 * @returns {string} e.g. `v2-3-0`.
 */
function releaseSlug(file) {
    return file.replace(/\.md$/, "").replace(/\./g, "-");
}

/** @returns {string} The GitHub blob URL for a repository path. */
const ghBlob = (p) => `https://github.com/doublegate/CyberChef-MCP/blob/master/${p}`;

/**
 * Escape a string for a YAML double-quoted scalar.
 *
 * @param {string} v - The value.
 * @returns {string} The quoted scalar.
 */
function yaml(v) {
    return `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

/**
 * Rewrite links that were written to work inside the repository.
 *
 * @param {string} body - Markdown body.
 * @param {string} sourcePath - Repository-relative path of the source file.
 * @returns {string} Markdown with links that resolve on the site.
 */
function rewriteLinks(body, sourcePath) {
    const fromDir = dirname(sourcePath);
    return body.replace(/\]\(((?!https?:|#|mailto:)[^)]+)\)/g, (whole, target) => {
        const [pathPart, anchor = ""] = target.split("#");
        if (!pathPart) return whole;                       // a bare #anchor
        const repoPath = resolve("/", fromDir, pathPart).slice(1);
        const site = published.get(repoPath);
        if (site) return `](${site}${anchor ? "#" + anchor : ""})`;
        // Not published: send the reader to the repository rather than to a 404. This is the
        // common case for planning documents and source files, and it is deliberate -- the
        // alternative is a site that quietly loses half its cross-references.
        return `](${ghBlob(repoPath)}${anchor ? "#" + anchor : ""})`;
    });
}

/**
 * Strip the leading H1, which Starlight renders from frontmatter.
 *
 * @param {string} body - Markdown body.
 * @returns {string} Body without its first H1.
 */
function stripTitle(body) {
    return body.replace(/^\s*#\s+.*\n+/, "");
}

/**
 * Write one page.
 *
 * @param {string} section - Sidebar directory.
 * @param {string} slug - File slug.
 * @param {string} title - Page title.
 * @param {string} description - Page description.
 * @param {string} body - Markdown body.
 * @param {number} [order] - Sidebar order.
 */
function emit(section, slug, title, description, body, order) {
    const dir = join(OUT, section);
    mkdirSync(dir, { recursive: true });
    const fm = [
        "---",
        `title: ${yaml(title)}`,
        description ? `description: ${yaml(description)}` : null,
        order !== undefined ? `sidebar:\n  order: ${order}` : null,
        "---",
        ""
        // `!== null`, NOT `Boolean`: the trailing "" is the blank line that separates the
        // frontmatter fence from the body, and `Boolean` drops it -- gluing `---` to the first
        // line of prose, which markdown then reads as part of the fence.
    ].filter(l => l !== null).join("\n");
    writeFileSync(join(dir, `${slug}.md`), fm + body.trimStart() + "\n");
}

// ---------------------------------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Pass 1: learn every published path, so pass 2 can rewrite links between them.
for (const [section, src, slug] of PAGES) published.set(src, `/CyberChef-MCP/${section}/${slug}/`);
const releases = existsSync(RELEASE_DIR) ?
    (await import("node:fs")).readdirSync(RELEASE_DIR).filter(f => /^v[\d.]+\.md$/.test(f)) : [];
for (const f of releases) {
    // Astro slugifies "v2.3.0" to "v230". Dashes survive, so the slug is chosen here rather
    // than left to the slugifier, and the page title keeps the real version.
    published.set(`docs/releases/${f}`, `/CyberChef-MCP/releases/${releaseSlug(f)}/`);
}

let count = 0;

// Pass 2: the curated pages.
for (const [i, [section, src, slug, title, description]] of PAGES.entries()) {
    const abs = join(REPO, src);
    if (!existsSync(abs)) {
        console.error(`  MISSING (skipped): ${src}`);
        continue;
    }
    emit(section, slug, title, description, rewriteLinks(stripTitle(readFileSync(abs, "utf8")), src), i);
    count++;
}

// Release notes, newest first.
const semver = (f) => f.slice(1, -3).split(".").map(Number);
releases.sort((a, b) => {
    const [A, B] = [semver(a), semver(b)];
    return (B[0] - A[0]) || (B[1] - A[1]) || (B[2] - A[2]);
});
releases.forEach((f, i) => {
    const src = `docs/releases/${f}`;
    const version = f.replace(/\.md$/, "");
    emit("releases", releaseSlug(f), `${version} release notes`, `What changed in ${version}.`,
        rewriteLinks(stripTitle(readFileSync(join(REPO, src), "utf8")), src), i);
    count++;
});

// The tool reference, generated from the config the server itself reads.
const configPath = join(REPO, "src/core/config/OperationConfig.json");
if (!existsSync(configPath)) {
    console.error("  OperationConfig.json is absent -- run `npx grunt configTests` first.");
    console.error("  The tool reference will be missing from this build.");
} else {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const byCategory = new Map();
    for (const [name, op] of Object.entries(config)) {
        (byCategory.get(op.module) ?? byCategory.set(op.module, []).get(op.module)).push([name, op]);
    }
    const toolName = (n) => "cyberchef_" + n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const argName = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    /**
     * Operation descriptions to plain text.
     *
     * Upstream writes them as HTML fragments -- `<br>`, `<code>`, links -- and they end up in
     * markdown that Astro renders, so a tag that survives is a tag the site executes.
     *
     * A single `.replace(/<[^>]+>/g, "")` is NOT enough, and CodeQL was right to say so
     * (`js/incomplete-multi-character-sanitization`, high): one pass over `<<script>>` leaves
     * `<script`. Two defences, because either alone is a promise about inputs rather than a
     * property of the output:
     *
     *   1. Strip to a FIXPOINT, so nesting cannot smuggle a tag through by being eaten once.
     *   2. Escape whatever remains. After this, the result cannot contain a tag by construction,
     *      whatever the input was -- which is the only version of this that is worth relying on.
     *
     * @param {string} html - An operation description.
     * @returns {string} Plain, escaped text.
     */
    const strip = (html) => {
        let text = String(html || "");
        for (let previous = null; previous !== text;) {
            previous = text;
            text = text.replace(/<[^>]*>/g, "");
        }
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\s+/g, " ")
            .trim();
    };

    const modules = [...byCategory.keys()].sort();
    emit("reference", "index", "Tool reference",
        `All ${Object.keys(config).length} operations, generated from the server's own OperationConfig.`,
        [
            "Every operation this server exposes, **generated at build time from the same",
            "`OperationConfig.json` the server reads**. It therefore cannot disagree with the running",
            "server about what exists, what an argument is called, or what type it takes.",
            "",
            "Only a small subset is pre-loaded as an individual tool. The default `tools/list` is an",
            "index of about two dozen tools; everything here is reachable regardless, either through",
            "`cyberchef_bake` by operation name or by walking",
            "`cyberchef_categories` → `cyberchef_list_operations` → `cyberchef_describe_operation`.",
            "See the [user guide](/CyberChef-MCP/guides/user-guide/) for the tool-surface settings.",
            "",
            "| Category | Operations |",
            "|---|---|",
            ...modules.map(m => `| [${m}](/CyberChef-MCP/reference/${m.toLowerCase()}/) | ${byCategory.get(m).length} |`),
            "",
            `**${Object.keys(config).length} operations in ${modules.length} categories.**`
        ].join("\n"), 0);
    count++;

    modules.forEach((mod, i) => {
        const ops = byCategory.get(mod).sort((a, b) => a[0].localeCompare(b[0]));
        const lines = [
            `${ops.length} operations. Call any of them with \`cyberchef_bake\`, or pre-load them`,
            "with `CYBERCHEF_TOOL_SURFACE=all`.",
            ""
        ];
        for (const [name, op] of ops) {
            lines.push(`## ${name}`, "");
            const d = strip(op.description);
            if (d) lines.push(d, "");
            lines.push(`- **Tool name:** \`${toolName(name)}\``);
            lines.push(`- **Input / output:** \`${op.inputType}\` → \`${op.outputType}\``);
            if (op.flowControl) lines.push("- **Flow control:** yes");
            if (op.args?.length) {
                lines.push("", "| Argument | Type | Default |", "|---|---|---|");
                for (const a of op.args) {
                    const def = Array.isArray(a.value) ?
                        (typeof a.value[0] === "string" ? a.value[0] : a.value[0]?.name ?? "") :
                        a.value;
                    lines.push(`| \`${argName(a.name)}\` | ${a.type} | ${def === undefined || def === "" ? "—" : `\`${String(def).slice(0, 40)}\``} |`);
                }
            } else {
                lines.push("- **Arguments:** none");
            }
            lines.push("");
        }
        emit("reference", mod.toLowerCase(), mod, `${ops.length} CyberChef operations in the ${mod} category.`,
            lines.join("\n"), i + 1);
        count++;
    });
}

// The landing page, with its figures read from the repository rather than typed in. A splash
// page that says "504 operations" is a claim like any other, and this one checks itself.
const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
const opCount = existsSync(configPath) ? Object.keys(JSON.parse(readFileSync(configPath, "utf8"))).length : 0;
writeFileSync(join(OUT, "index.mdx"), `---
title: CyberChef MCP Server
description: ${opCount} CyberChef operations as tools an AI assistant can call, over MCP protocol revision 2026-07-28.
template: splash
hero:
  tagline: GCHQ's Cyber Swiss Army Knife, as tools an AI assistant can call — ${opCount} operations for encryption, encoding, compression and forensics.
  actions:
    - text: Get started
      link: /CyberChef-MCP/guides/user-guide/
      icon: right-arrow
    - text: Tool reference
      link: /CyberChef-MCP/reference/
      variant: minimal
    - text: View on GitHub
      link: https://github.com/doublegate/CyberChef-MCP
      icon: external
      variant: minimal
---

import { Card, CardGrid } from '@astrojs/starlight/components';

<CardGrid stagger>
  <Card title="Run it in one line" icon="rocket">
    \`\`\`bash
    docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v2:${pkg.version}
    \`\`\`
    Then point any MCP client at it. See the [user guide](/CyberChef-MCP/guides/user-guide/).
  </Card>
  <Card title="${opCount} operations, ~24 tools" icon="puzzle">
    \`tools/list\` is an **index** by default — about 3,400 tokens rather than 98,000. Every
    operation stays reachable through \`cyberchef_bake\` and the navigation tools.
  </Card>
  <Card title="Protocol revision 2026-07-28" icon="approve-check">
    Served alongside the 2025 era from one set of handlers, on stdio, HTTP and a socket binding.
    Existing clients are unaffected.
  </Card>
  <Card title="This reference is generated" icon="information">
    The [tool reference](/CyberChef-MCP/reference/) is built from the same
    \`OperationConfig.json\` the server reads, so it cannot disagree with the running server.
  </Card>
</CardGrid>
`);
count++;

console.log(`collect: wrote ${count} pages to ${relative(REPO, OUT)}`);
