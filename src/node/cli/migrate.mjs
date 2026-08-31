#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * `cyberchef-migrate` -- check a v1.x recipe against v2.x, and convert it.
 *
 * WHY THIS EXISTS, LATE
 * ---------------------
 * `docs/v2.0.0-breaking-changes.md` has told readers to run `cyberchef-migrate` since **v1.8.0**,
 * and the command has never existed. Only the two MCP tools (`cyberchef_migration_preview` and
 * `cyberchef_deprecation_stats`) were ever built, and those are reachable only from inside an MCP
 * session -- which is no use to someone with a directory of saved recipe files and no server
 * running.
 *
 * It shares `analyzeRecipeCompatibility` and `transformRecipeToV2` with the MCP tools rather than
 * reimplementing them, so the CLI and the tool cannot disagree about what a v1 recipe means.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not rewrite files in place unless asked (`--write`), and even then it refuses without a
 * backup unless `--force` is given. A migration tool that silently rewrites the only copy of
 * someone's recipes is worse than no migration tool: the failure is discovered later, by which
 * point the original is gone.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

import {
    analyzeRecipeCompatibility,
    transformRecipeToV2
} from "../deprecation.mjs";
import { VERSION } from "../lib/config.mjs";

const USAGE = `cyberchef-migrate ${VERSION} -- check and convert v1.x recipes for v2.x

USAGE
  cyberchef-migrate <file...>              Report what would change. Reads nothing else.
  cyberchef-migrate --write <file...>      Convert in place, keeping a .bak of each original.
  cyberchef-migrate --stdout <file>        Write the converted recipe to stdout.
  cat r.json | cyberchef-migrate -         Read one recipe from stdin, write to stdout.

OPTIONS
  --write        Rewrite each file. A <file>.bak is written first.
  --force        With --write, proceed even if the .bak already exists (it is overwritten).
  --stdout       Print the converted recipe instead of rewriting anything.
  --json         Machine-readable report (implies no conversion unless --write is given).
  -h, --help     This text.
  -v, --version  Print the version.

EXIT STATUS
  0  every recipe is already compatible, or was converted successfully
  1  at least one recipe needs changes (without --write), or a file could not be processed
  2  usage error
`;

/**
 * Parse argv into flags and file arguments.
 *
 * @param {string[]} argv - Arguments after the node binary and script.
 * @returns {{flags: Set<string>, files: string[], bad: string[]}} Parsed arguments.
 */
function parseArgs(argv) {
    const known = new Set(["--write", "--force", "--stdout", "--json", "-h", "--help", "-v", "--version"]);
    const flags = new Set();
    const files = [];
    const bad = [];

    for (const arg of argv) {
        if (arg === "-") {
            files.push("-");
        } else if (!arg.startsWith("-")) {
            files.push(arg);
        } else if (known.has(arg)) {
            flags.add(arg);
        } else {
            bad.push(arg);
        }
    }
    return { flags, files, bad };
}

/**
 * Read a recipe from a path, or from stdin for "-".
 *
 * @param {string} file - Path, or "-".
 * @returns {*} The parsed recipe.
 */
function readRecipe(file) {
    const raw = file === "-" ?
        readFileSync(0, "utf8") :
        readFileSync(file, "utf8");
    return JSON.parse(raw);
}

/**
 * Report one recipe's compatibility in human-readable form.
 *
 * @param {string} file - The file it came from.
 * @param {Object} analysis - The compatibility analysis.
 * @returns {void}
 */
function report(file, analysis) {
    const name = file === "-" ? "<stdin>" : basename(file);

    // Reported on ISSUE COUNT, not on `compatible`. `compatible` means "nothing BREAKING", and
    // the legacy formats this tool exists to convert -- a bare array recipe, positional arguments
    // -- are `severity: "warning"`. An earlier version of this function keyed off `compatible` and
    // announced "already v2-compatible" for a recipe it was about to rewrite three ways, which is
    // exactly the sort of confidently wrong output a migration tool must not produce.
    if (!analysis.issues.length) {
        console.log(`  clean    ${name} -- nothing to change`);
        return;
    }

    const breaking = analysis.breakingCount ?? 0;
    const label = breaking ? "BREAKING" : "CHANGES ";
    console.log(`  ${label} ${name} -- ${analysis.issues.length} issue(s)` +
        (breaking ? `, ${breaking} breaking` : ""));
    for (const issue of analysis.issues) {
        console.log(`             [${issue.severity}] ${issue.location}: ${issue.message}`);
        if (issue.fix) console.log(`               fix: ${issue.fix}`);
    }
}

/**
 * Entry point.
 *
 * @param {string[]} argv - Arguments after the node binary and script.
 * @returns {number} Process exit code.
 */
function main(argv) {
    const { flags, files, bad } = parseArgs(argv);

    if (bad.length) {
        console.error(`cyberchef-migrate: unknown option${bad.length > 1 ? "s" : ""}: ${bad.join(", ")}`);
        console.error(USAGE);
        return 2;
    }
    if (flags.has("-h") || flags.has("--help")) {
        console.log(USAGE);
        return 0;
    }
    if (flags.has("-v") || flags.has("--version")) {
        console.log(VERSION);
        return 0;
    }
    if (!files.length) {
        console.error("cyberchef-migrate: no input files\n");
        console.error(USAGE);
        return 2;
    }
    if (flags.has("--stdout") && files.length > 1) {
        console.error("cyberchef-migrate: --stdout takes exactly one file");
        return 2;
    }

    const write = flags.has("--write");
    const results = [];
    let failed = false;
    let needsChanges = false;

    for (const file of files) {
        let recipe;
        try {
            recipe = readRecipe(file);
        } catch (err) {
            console.error(`  ERROR    ${file}: ${err.message}`);
            failed = true;
            continue;
        }

        const analysis = analyzeRecipeCompatibility(recipe);
        results.push({ file, ...analysis });
        if (analysis.issues.length) needsChanges = true;

        // `--json` suppresses the HUMAN-READABLE report only. It used to `continue` here, which
        // also skipped the conversion below -- so `--json --write` reported what would change and
        // silently changed nothing, exiting 0. A migration command that says it converted and did
        // not is worse than one that refuses the flag combination.
        if (!flags.has("--json") && !flags.has("--stdout")) report(file, analysis);

        if (flags.has("--stdout")) {
            console.log(JSON.stringify(transformRecipeToV2(recipe), null, 2));
            continue;
        }

        if (write && analysis.issues.length) {
            if (file === "-") {
                console.error("  ERROR    cannot --write stdin; use --stdout");
                failed = true;
                continue;
            }
            // The original is copied aside BEFORE anything is written. Refusing to clobber an
            // existing .bak matters: a second run would otherwise overwrite the backup with the
            // already-migrated file, destroying the only copy of the original.
            const backup = `${file}.bak`;
            if (existsSync(backup) && !flags.has("--force")) {
                console.error(`  ERROR    ${backup} exists; not overwriting it (use --force)`);
                failed = true;
                continue;
            }
            copyFileSync(file, backup);
            writeFileSync(file, `${JSON.stringify(transformRecipeToV2(recipe), null, 2)}\n`);
            console.log(`             written; original kept at ${basename(backup)}`);
        }
    }

    if (flags.has("--json")) {
        console.log(JSON.stringify({ version: VERSION, results }, null, 2));
    }

    if (failed) return 1;
    // Without --write, "needs changes" is a finding, and a non-zero status is what makes this
    // usable in a pre-upgrade check that should stop a pipeline.
    return (needsChanges && !write) ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
