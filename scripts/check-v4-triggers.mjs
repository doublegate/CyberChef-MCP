#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The v4.0.0 trigger watch, executed rather than remembered.
 *
 * WHY THIS EXISTS. `docs/planning/v4/v4.0.0-plan.md` concludes that v4.0.0 must not be cut, because
 * none of its triggers has fired. That conclusion has an expiry date nobody can see: the thing
 * blocking v4.0.0 is not effort, it is NOTICING. `to-dos/00-PHASE-0-TRIGGER-WATCH.md` lists twelve
 * checks and says to run them once per release, by hand -- and two of the twelve (T-11, T-12) were
 * missing from that file until the day after it was written, which is the failure mode exactly.
 *
 * A charter with a trigger nobody polls is a wish with extra steps. This polls them.
 *
 * IT REPORTS; IT DOES NOT DECIDE. A fired trigger means "run the RE-MEASURE ritual", not "cut a
 * major version". Every check prints what it measured, so a human can disagree with the verdict
 * rather than only with the conclusion.
 *
 * Exit codes: 0 nothing fired, 1 at least one fired, 2 the check itself could not run.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

/**
 * Documentation URLs, in their MARKDOWN form.
 *
 * `.md` matters. modelcontextprotocol.io is a Next.js/Mintlify app, and fetching the HTML route
 * returns an error shell (`id="__next_error__"`) rather than the page -- so a regex over it finds
 * nothing and, unless the code is careful, reports the reassuring answer. The `.md` routes 307 to
 * the real source and `fetch` follows redirects. Found by running this script and not believing it.
 */
const DOCS = {
    changelog: "https://modelcontextprotocol.io/specification/draft/changelog.md",
    versioning: "https://modelcontextprotocol.io/specification/versioning.md"
};

/** The revision this server implements, and the one a successor would supersede. */
const CURRENT_REVISION = "2026-07-28";

/** The newest `server.json` schema this repository knows how to validate against. */
const CURRENT_SCHEMA = "2025-12-11";

/** Package versions this release was built against, from the v3.10.0 measurement. */
const PINNED = {
    "@modelcontextprotocol/server": "2.0.0",
    "@modelcontextprotocol/node": "2.0.0",
    "@modelcontextprotocol/client": "2.0.0",
    "@modelcontextprotocol/conformance": "0.2.0-alpha.11"
};

/**
 * Fetch a URL as text, with a bounded timeout.
 *
 * A network failure must NOT read as "no trigger fired" -- that is the silent-green this project
 * keeps finding in its own checks. Failures are surfaced as errors and set exit code 2.
 *
 * @param {string} url - What to fetch.
 * @returns {Promise<string>} The body.
 */
async function fetchText(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return response.text();
}

/**
 * The npm dist-tags for a package.
 *
 * @param {string} name - Package name.
 * @returns {Promise<Object>} Its dist-tags.
 */
async function distTags(name) {
    const body = await fetchText(`https://registry.npmjs.org/-/package/${encodeURIComponent(name)}/dist-tags`);
    return JSON.parse(body);
}

const results = [];

/**
 * Record one check.
 *
 * @param {string} id - Trigger id, matching the to-do table.
 * @param {string} what - What it watches.
 * @param {boolean} fired - Whether it fired.
 * @param {string} detail - What was actually measured.
 */
function record(id, what, fired, detail) {
    results.push({ id, what, fired, detail });
}

/** @returns {Promise<void>} Runs every check, recording rather than throwing. */
async function run() {
    // T-1 / T-2 -- the specification itself. The single most important pair: everything else is a
    // hint, this is the forcing function.
    const changelog = await fetchText(DOCS.changelog);
    // The page is a stub until something lands in it. Measure CONTENT, not presence: the file has
    // always existed, so a 200 proves nothing.
    const stub = /Changes since the most recent release will accumulate here\./.test(changelog);
    const hasEntries = /^\s*[-*]\s+|^\s*#{2,3}\s+\S/m.test(changelog.replace(/^#\s*Changelog\s*$/m, ""));
    if (!stub && !hasEntries) {
        throw new Error(
            "the draft changelog at " + DOCS.changelog + " is neither the known empty stub nor\n" +
            "anything with entries. Read it by hand: the page shape changed, and guessing which\n" +
            "of those two it is would be guessing about the one thing this script exists to know.");
    }
    record("T-1", "draft specification changelog has content", hasEntries,
        stub ? "still the empty stub" : "HAS ENTRIES");

    const versioning = await fetchText(DOCS.versioning);
    const current = versioning.match(/current\*{0,2}\s+protocol version is\s+\[?\*{0,2}(\d{4}-\d{2}-\d{2})/i);
    if (!current) {
        // THROW rather than record a miss. A trigger watch that cannot read the page must not
        // print the same "--" it prints when the page says nothing has changed: those are
        // different facts and only one of them is reassuring. This exact case was live for one
        // revision of this script, reporting "unparsed" beside a "--".
        throw new Error(
            "could not find the current protocol revision in " + DOCS.versioning + ".\n" +
            "The page shape changed, or the fetch returned an app shell instead of markdown.");
    }
    record("T-2", "a revision after " + CURRENT_REVISION + " is Current",
        current[1] > CURRENT_REVISION, `current revision is ${current[1]}`);

    // T-8 / T-9 -- the SDK and the conformance oracle.
    for (const [name, pinned] of Object.entries(PINNED)) {
        const tags = await distTags(name);
        const newest = name.endsWith("conformance") ? (tags.alpha ?? tags.latest) : tags.latest;
        record(name.endsWith("conformance") ? "T-9" : "T-8", `${name} moved past ${pinned}`,
            newest !== pinned, `${name}: ${newest}`);
    }

    // T-10 -- the registry's server.json schema. Probe forward a year; a dated schema that resolves
    // and is newer than ours is the trigger.
    let newestSchema = CURRENT_SCHEMA;
    const probes = [];
    const base = new Date(`${CURRENT_SCHEMA}T00:00:00Z`);
    for (let month = 1; month <= 14; month++) {
        const d = new Date(base);
        d.setUTCMonth(d.getUTCMonth() + month);
        probes.push(d.toISOString().slice(0, 10));
    }
    for (const date of probes) {
        const r = await fetch(`https://static.modelcontextprotocol.io/schemas/${date}/server.schema.json`,
            { method: "HEAD", signal: AbortSignal.timeout(15000) });
        if (r.ok && date > newestSchema) newestSchema = date;
    }
    record("T-10", `a server.json schema newer than ${CURRENT_SCHEMA}`,
        newestSchema !== CURRENT_SCHEMA, `newest resolving schema: ${newestSchema}`);
}

try {
    await run();
} catch (error) {
    process.stderr.write(`\nThe trigger watch could not complete: ${error.message}\n` +
        "Treat this as UNKNOWN, not as \"nothing fired\" -- a check that cannot run must not\n" +
        "report the reassuring answer.\n");
    process.exit(2);
}

const fired = results.filter(r => r.fired);
const width = Math.max(...results.map(r => r.what.length));
process.stdout.write("\nv4.0.0 trigger watch\n\n");
for (const r of results) {
    process.stdout.write(`  ${r.fired ? "FIRED " : "  --  "} ${r.id.padEnd(5)} ${r.what.padEnd(width)}  ${r.detail}\n`);
}

if (fired.length === 0) {
    process.stdout.write("\nNothing fired. v4.0.0 stays unscheduled; ship the next minor.\n" +
        "Checks not covered here are in docs/planning/v4/to-dos/00-PHASE-0-TRIGGER-WATCH.md --\n" +
        "T-3 to T-7 track individual SEPs and T-11/T-12 need judgement, so they stay manual.\n");
    process.exit(0);
}

process.stdout.write(`\n${fired.length} trigger(s) fired. This means RUN THE RE-MEASURE RITUAL\n` +
    "(docs/planning/v3/RE-MEASURE.md), not \"cut a major version\". Read what changed, write F-01,\n" +
    "and re-scope from the measurement.\n");
process.exit(1);
