/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Workflow integrity: one version per action, and every shell block parses.
 *
 * WHY THIS EXISTS. Entering v3.9.0 this repository used `actions/checkout` at THREE different
 * majors simultaneously -- v7 sixteen times, v6 three times, v5 twice -- and `actions/setup-node`
 * at three as well. Nothing noticed, because nothing was looking.
 *
 * Dependabot is not the check. It reports the LOWEST version it finds and raises one PR for it, so
 * #125 ("checkout 5 -> 7") and #126 ("setup-node 5 -> 7") would both have merged green while
 * `helm-chart.yml` and `benchmark-baseline.yml` stayed on v6. Converging an ecosystem one
 * Dependabot PR at a time is slow and, more to the point, never reports DONE -- there is no state
 * in which it says "these all agree now". That is what this file is for.
 *
 * It DISCOVERS its targets. The three gates added in v3.8.0 each began as a hand-written list of
 * files and each went stale or was found incomplete during review; at the third occurrence the fix
 * stopped being another entry and became the mechanism. So: every `uses:` in every workflow, found
 * by walking the directory, with no action named in this file.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
// js-yaml 5.x is an ESM package with NAMED exports and no default -- `import yaml from` binds
// undefined, which fails at the first `.load` rather than at import.
import { load as loadYaml } from "js-yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOWS = join(ROOT, ".github", "workflows");

/**
 * A 40-hex commit SHA, which is a pin rather than a version reference.
 *
 * A pin is the stronger form and this file must not push anyone off it -- `antigravity-review.yml`
 * pins `actions/checkout` deliberately because that job runs on a SELF-HOSTED runner, where a
 * compromised tag would execute on the maintainer's own machine rather than in a disposable VM.
 * So a pin is read through the `# vN` comment beside it, which is also the form Dependabot's
 * github-actions ecosystem reads to keep the pin current.
 */
const SHA = /^[0-9a-f]{40}$/;

/**
 * The comment beside a SHA pin, which must be a READABLE version and not merely present.
 *
 * Reviewer-found: the first version of this file only checked the comment was non-empty, so
 * `# current` or `# pinned` passed and `effectiveVersion()` then reconciled the pin against tag
 * references using that string as its version -- which cannot ever match `v7`, so the convergence
 * test would report a split that is really an unreadable annotation, or worse compare two
 * unreadable ones and call them equal.
 *
 * Pre-release suffixes are accepted (`v2.0.0-rc.1`). No action pins one today, but a gate that
 * rejects a legitimate pin fails on a CORRECT change, which is the worse of the two errors.
 * Reviewer-suggested.
 */
const VERSION_COMMENT = /^v\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Every `uses:` reference in every workflow file.
 *
 * @returns {{file: string, line: number, action: string, ref: string, comment: ?string}[]} Uses.
 */
function collectUses() {
    const out = [];
    for (const name of readdirSync(WORKFLOWS)) {
        if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
        const text = readFileSync(join(WORKFLOWS, name), "utf8");
        text.split("\n").forEach((raw, i) => {
            // `uses:` also appears inside `with:` blocks as ordinary strings in some actions, so
            // anchor on the YAML key at the start of a (possibly listed) step.
            const m = raw.match(/^\s*(?:-\s+)?uses:\s*([^\s#]+)\s*(?:#\s*(\S+))?/);
            if (!m) return;
            const [, useRef, comment] = m;
            // Local composite actions (`./.github/actions/x`) and docker refs have no version to
            // reconcile. Skip rather than mis-parse them.
            if (useRef.startsWith("./") || useRef.startsWith("docker://")) return;
            const at = useRef.lastIndexOf("@");
            if (at < 0) return;
            out.push({
                file: name,
                line: i + 1,
                action: useRef.slice(0, at),
                ref: useRef.slice(at + 1),
                comment: comment ?? null
            });
        });
    }
    return out;
}

/**
 * The version a `uses:` effectively names -- the ref, or a SHA pin's `# vN` comment.
 *
 * @param {{ref: string, comment: ?string}} use - One collected use.
 * @returns {?string} The version, or null when a SHA pin carries no comment to read.
 */
function effectiveVersion(use) {
    if (!SHA.test(use.ref)) return use.ref;
    if (!use.comment || !VERSION_COMMENT.test(use.comment)) return null;
    return use.comment;
}

describe("workflow action versions", () => {
    const uses = collectUses();

    it("found workflows to check", () => {
        // Discovery returning nothing would make every assertion below pass vacuously, which looks
        // identical to success. This repository has been bitten by a pattern that quietly stopped
        // matching; fail loudly instead.
        expect(uses.length, "no `uses:` found -- the parser or the directory moved").toBeGreaterThan(20);
        expect(new Set(uses.map(u => u.file)).size).toBeGreaterThan(5);
    });

    it("pins every SHA-pinned action with a readable version comment", () => {
        // A bare SHA with no `# vN` beside it cannot be reconciled with the tag-referenced uses of
        // the same action, and Dependabot cannot keep it current either. Both failures are silent.
        const unreadable = uses
            .filter(u => SHA.test(u.ref) && !VERSION_COMMENT.test(u.comment ?? ""))
            .map(u => `${u.file}:${u.line} ${u.action}@${u.ref.slice(0, 12)} needs a "# vN" comment` +
                (u.comment ? `, found "# ${u.comment}"` : ", found none"));
        expect(unreadable).toEqual([]);
    });

    it("uses exactly one version of each action across every workflow", () => {
        const byAction = new Map();
        for (const u of uses) {
            const v = effectiveVersion(u);
            if (v === null) continue;                       // covered by the test above
            if (!byAction.has(u.action)) byAction.set(u.action, new Map());
            const seen = byAction.get(u.action);
            if (!seen.has(v)) seen.set(v, []);
            seen.get(v).push(`${u.file}:${u.line}`);
        }

        const split = [];
        for (const [action, versions] of byAction) {
            if (versions.size === 1) continue;
            const detail = [...versions.entries()]
                .sort()
                .map(([v, where]) => `    ${v}  <- ${where.join(", ")}`)
                .join("\n");
            split.push(`${action} is used at ${versions.size} different versions:\n${detail}`);
        }

        // Report every split action at once. Fixing these one per run is how the drift accumulated.
        expect(split.join("\n\n")).toBe("");
    });
});

describe("workflow shell blocks", () => {
    /**
     * Every `run:` block that a POSIX shell will execute, with the file and step it came from.
     *
     * @returns {{file: string, step: string, shell: string, script: string}[]} Blocks.
     */
    function collectRunBlocks() {
        const out = [];
        for (const name of readdirSync(WORKFLOWS)) {
            if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
            const doc = loadYaml(readFileSync(join(WORKFLOWS, name), "utf8"));
            for (const job of Object.values(doc?.jobs ?? {})) {
                const jobShell = job?.defaults?.run?.shell;
                for (const step of job?.steps ?? []) {
                    if (typeof step?.run !== "string") continue;
                    const shell = step.shell ?? jobShell ?? "bash";
                    // pwsh/python/node steps are not ours to syntax-check with `bash -n`.
                    if (shell !== "bash" && shell !== "sh") continue;
                    out.push({ file: name, step: step.name ?? "(unnamed)", shell, script: step.run });
                }
            }
        }
        return out;
    }

    const blocks = collectRunBlocks();

    it("found shell blocks to check", () => {
        // Vacuous success and real success look identical when discovery returns nothing.
        expect(blocks.length, "no `run:` blocks parsed -- yaml shape or directory moved")
            .toBeGreaterThan(50);
    });

    it("parses every one of them", () => {
        // WHY. A shell syntax error in a workflow is invisible until that workflow RUNS, and some
        // of these run rarely by design -- `rollback.yml` is an emergency path, so its first
        // execution is the worst possible moment to discover a stray quote. Written after it
        // caught a real one: a mis-nested `'"'"'` sequence introduced while fixing
        // `upstream-monitor.yml` in this same release, which broke the quoting of an echo.
        //
        // WHAT IT DOES NOT CATCH, stated because the limit is easy to misread as coverage.
        // `bash -n` parses; it does not evaluate. The same edit also doubled a backslash before a
        // backtick inside a double-quoted string, which makes the backslash literal and leaves the
        // backtick free to OPEN A COMMAND SUBSTITUTION. That is valid syntax, so this gate passes
        // it; it fails at runtime instead, trying to run the expansion as a command. Verified by
        // reintroducing both defects: the quoting one fails this test, the backslash one does not.
        // Catching the second needs a linter that models expansion (shellcheck), a larger
        // dependency than this file is worth -- so the gap is written down rather than papered over.
        const broken = [];
        for (const b of blocks) {
            const r = spawnSync(b.shell, ["-n"], { input: b.script, encoding: "utf8" });
            if (r.status !== 0) {
                broken.push(`${b.file} :: ${b.step}\n${(r.stderr || "").trim()}`);
            }
        }
        expect(broken.join("\n\n")).toBe("");
    });
});
