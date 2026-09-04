#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Assert that `server.json` is what the MCP registry schema says it is.
 *
 * WHY THIS EXISTS
 * ---------------
 * `server.json` exists to be machine-read by the MCP registry. Nothing had ever read it. Measured
 * in v3.4.0, it failed validation against the schema it declared in **six** places:
 *
 *     /description                 153 characters, against a 100-character limit
 *     /packages/0, /packages/1     missing `registry_type`; `registryType` not permitted
 *                                  missing `registry_base_url`; `registryBaseUrl` not permitted
 *
 * The cause is worth stating precisely, because it is not a typo. The file was WRITTEN to the
 * 2025-09-29 schema, which is camelCase, and DECLARED the 2025-07-09 schema, which is snake_case.
 * Both URLs resolve, both are real, and the file is internally consistent -- so nothing about
 * reading it suggests a problem. Only validation finds it.
 *
 * That is the same class of defect as the version drift `check-version-consistency.mjs` was
 * written for, and it has the same fix: a gate, not a note.
 *
 * WHY NOT A JSON SCHEMA VALIDATOR
 * -------------------------------
 * Two reasons, and the second is the one that decides it.
 *
 * `ajv` is present in `node_modules` only as a transitive dependency of something else. Building a
 * release gate on a package nothing declares means the gate disappears the day that dependency
 * drops it, silently and at a moment unrelated to this file.
 *
 * More importantly, validating against the LIVE schema would make this gate need the network --
 * and this project ships an explicit offline posture and an air-gapped deployment guide. A gate
 * that cannot run in the environment the product supports is not a gate.
 *
 * So the rules below are transcribed from the schema, with the retrieval date recorded. That
 * trades one risk for another: a transcription can go stale. The mitigation is the check on the
 * declared `$schema` URL -- if it names a version whose rules are not encoded here, this FAILS
 * rather than passing. A checker that silently checks the wrong rules is exactly what produced
 * the defect above, and it is not repeated here.
 *
 * THIS IS NOT THE ORACLE, AND v3.5.0 IS WHY
 * -----------------------------------------
 * That mitigation catches the document drifting from the checker. It cannot catch **both** drifting
 * from the registry, which is what happened: this file shipped in v3.4.0 encoding 2025-09-29 while
 * 2025-12-11 was already current, and nothing here could have noticed. The official
 * `mcp-publisher validate` reports it in one line.
 *
 * So CI runs the official validator too, in `.github/workflows/pull_requests.yml`. That is the
 * arrangement the conformance suite already has and for the same reason -- an in-tree check
 * verifies what its author believed; only an external oracle can contradict them. This script
 * remains the BLOCKING gate because it runs offline, which the product's air-gapped posture
 * requires and a downloaded binary does not.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The schema version whose rules are encoded below.
 *
 * Transcribed from https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json,
 * retrieved 2026-09-05. Bumping `$schema` in `server.json` without updating this constant and the
 * rules under it is a deliberate failure, not an oversight -- see the header.
 */
const KNOWN_SCHEMA = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

/**
 * `ServerDetail.required`, from the schema.
 *
 * 2025-12-11 merged the old `Server` definition into `ServerDetail`; the three required fields and
 * their constraints are unchanged by that merge.
 */
const REQUIRED = ["name", "description", "version"];

/** `ServerDetail.properties.<field>.maxLength`, from the schema. `title` is new in 2025-12-11. */
const MAX_LENGTH = { name: 200, description: 100, version: 255, title: 100 };

/** Optional top-level fields, checked only when present. */
const OPTIONAL_TOP_LEVEL = new Set(["title"]);

/** `ServerDetail.properties.name.pattern`, from the schema. */
const NAME_PATTERN = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;

/**
 * `Package.required` and each field's type, from the schema.
 *
 * Types, not just presence. Presence alone let `"transport": "stdio"` pass -- a string where the
 * schema requires an object -- which is a `server.json` the registry rejects and this gate called
 * valid. Found in review on PR #118.
 *
 * Snake_case in 2025-07-09; camelCase from 2025-09-29.
 */
const PACKAGE_REQUIRED = {
    "registryType": "string",
    identifier: "string",
    transport: "object"
};

/**
 * Fields the schema does not require but constrains when present.
 *
 * `version` moved out of `Package.required` in 2025-12-11 (optional for MCPB packages, where the
 * version is embedded in the download URL). It is still a string when given, and this repository's
 * own packages always give it -- `check:versions` asserts the value, this asserts the type.
 * Encoded as optional-but-typed rather than dropped, because a checker that is STRICTER than the
 * schema fails documents the registry would accept, which is its own kind of wrong answer.
 */
const PACKAGE_OPTIONAL = { version: "string" };

/**
 * The transport shapes, from the schema's `StdioTransport` / `StreamableHttpTransport` /
 * `SseTransport` definitions: each `type` and the fields that type additionally requires.
 */
const TRANSPORTS = {
    stdio: [],
    "streamable-http": ["url"],
    sse: ["url"]
};

/**
 * Fields the 2025-07-09 schema used for the same data.
 *
 * Checked for explicitly rather than left to fall out of "unknown property", so the failure names
 * the actual mistake -- "this is the older schema's spelling" -- instead of "unexpected key".
 */
const SUPERSEDED_SPELLINGS = {
    "registry_type": "registryType",
    "registry_base_url": "registryBaseUrl",
    "file_sha256": "fileSha256",
    "runtime_hint": "runtimeHint",
    "runtime_arguments": "runtimeArguments",
    "package_arguments": "packageArguments",
    "environment_variables": "environmentVariables"
};

const problems = [];
const checked = [];

/**
 * Record one assertion's outcome.
 *
 * Returns whether it held, so a caller can skip a check that depends on this one having passed --
 * a length check against a non-string, say, which would otherwise report a second, confusing
 * failure about the same field.
 *
 * @param {boolean} ok - Whether it held.
 * @param {string} what - What was checked.
 * @param {string} detail - The value seen, for the report.
 * @returns {boolean} `ok`.
 */
function assert(ok, what, detail) {
    checked.push(`${ok ? "ok " : "BAD"}  ${what}: ${detail}`);
    if (!ok) problems.push(`${what}: ${detail}`);
    return ok;
}

const raw = readFileSync(join(ROOT, "server.json"), "utf8");
let doc;
try {
    doc = JSON.parse(raw);
} catch (error) {
    process.stdout.write(`FAIL  server.json is not valid JSON: ${error.message}\n`);
    process.exit(1);
}

// FIRST, before anything else. Every rule below is specific to one schema version, and applying
// them to a document that declares a different one is how a check reports "ok" about the wrong
// thing.
if (doc.$schema !== KNOWN_SCHEMA) {
    process.stdout.write(
        `FAIL  server.json declares a schema this checker does not know:\n\n` +
        `        declared: ${doc.$schema ?? "(none)"}\n` +
        `        encoded:  ${KNOWN_SCHEMA}\n\n` +
        "      The rules in scripts/check-server-json.mjs are transcribed from one specific\n" +
        "      schema version. Update them together, or this passes while checking rules the\n" +
        "      document is not written to -- which is the defect that made this gate necessary.\n");
    process.exit(1);
}
checked.push(`ok   $schema: ${doc.$schema}`);

for (const field of REQUIRED) {
    assert(doc[field] !== undefined, `required field "${field}"`, doc[field] === undefined ? "missing" : "present");
}

for (const [field, limit] of Object.entries(MAX_LENGTH)) {
    // Optional fields are skipped when absent and checked when present -- not the same as the old
    // `continue` on a non-string, which skipped a REQUIRED field's length check silently so
    // `"version": 3.4` passed while the run still said "validates". A check that quietly opts out
    // of checking is the shape of defect this whole script exists for.
    if (doc[field] === undefined && OPTIONAL_TOP_LEVEL.has(field)) continue;
    if (!assert(typeof doc[field] === "string", `${field} is a string`, typeof doc[field])) continue;
    assert(doc[field].length <= limit, `${field} length (limit ${limit})`, String(doc[field].length));
}

if (typeof doc.name === "string") {
    assert(NAME_PATTERN.test(doc.name), "name matches the schema pattern", doc.name);
}

assert(Array.isArray(doc.packages) && doc.packages.length > 0,
    "packages is a non-empty array", Array.isArray(doc.packages) ? `${doc.packages.length} entries` : "not an array");

for (const [index, pkg] of (doc.packages ?? []).entries()) {
    const shapeOf = (value) => value === undefined ? "missing" :
        (Array.isArray(value) ? "array" : typeof value);
    for (const [field, wanted] of Object.entries(PACKAGE_REQUIRED)) {
        const seen = shapeOf(pkg[field]);
        assert(seen === wanted, `packages[${index}].${field} (${wanted})`,
            seen === wanted ? JSON.stringify(pkg[field]) : seen);
    }
    for (const [field, wanted] of Object.entries(PACKAGE_OPTIONAL)) {
        if (pkg[field] === undefined) continue;
        const seen = shapeOf(pkg[field]);
        assert(seen === wanted, `packages[${index}].${field} (optional, ${wanted})`,
            seen === wanted ? JSON.stringify(pkg[field]) : seen);
    }
    // The transport's own shape. `{"type": "stdio"}` and `{"type": "sse", "url": ...}` are
    // different schemas, and a transport naming a type the spec does not define is a package no
    // client can launch.
    if (pkg.transport && typeof pkg.transport === "object" && !Array.isArray(pkg.transport)) {
        const kind = pkg.transport.type;
        if (assert(Object.prototype.hasOwnProperty.call(TRANSPORTS, kind),
            `packages[${index}].transport.type`, String(kind))) {
            for (const field of TRANSPORTS[kind]) {
                assert(typeof pkg.transport[field] === "string",
                    `packages[${index}].transport.${field} (required for "${kind}")`,
                    pkg.transport[field] === undefined ? "missing" : typeof pkg.transport[field]);
            }
        }
    }
    for (const [old, current] of Object.entries(SUPERSEDED_SPELLINGS)) {
        if (pkg[old] !== undefined) {
            assert(false, `packages[${index}].${old}`, `superseded spelling; this schema uses "${current}"`);
        }
    }
}

// Not a schema rule, but the reason the file exists: the registry resolves `name` to a GitHub
// namespace and proves ownership against the repository. A `name` that does not correspond to
// `repository.url` is a publish that will be rejected, discovered at publish time.
if (typeof doc.name === "string" && doc.repository?.url) {
    const owner = doc.name.startsWith("io.github.") ? doc.name.slice("io.github.".length).split("/")[0] : null;
    const repoOwner = (doc.repository.url.match(/github\.com\/([^/]+)\//) ?? [])[1];
    if (owner && repoOwner) {
        assert(owner.toLowerCase() === repoOwner.toLowerCase(),
            "name namespace matches the repository owner", `${owner} vs ${repoOwner}`);
    }
}

// The registry's OWNERSHIP PROOFS, which are not part of the schema and are not optional.
//
// The registry does not take the publisher's word for who owns a package. For npm it reads
// `mcpName` out of the published `package.json`; for an OCI image it reads the
// `io.modelcontextprotocol.server.name` annotation off the image. Each MUST equal `name` here.
// (Source: modelcontextprotocol/registry, docs/modelcontextprotocol-io/package-types.mdx,
// retrieved 2026-09-04.)
//
// Both were missing until v3.4.0, which is why the server was absent from the registry -- measured
// rather than assumed: a search for "cyberchef" returned zero servers, and `npm view cyberchef-mcp
// mcpName` was empty across all eleven published versions.
//
// They are checked here because the failure they produce is otherwise invisible until a publish is
// rejected, and because one identifier now lives in three files.
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
assert(pkg.mcpName === doc.name, "package.json mcpName matches server.json name",
    pkg.mcpName ?? "(absent -- the registry cannot verify npm ownership without it)");

const dockerfile = readFileSync(join(ROOT, "Dockerfile.mcp"), "utf8");
const label = (dockerfile.match(/io\.modelcontextprotocol\.server\.name="([^"]+)"/) ?? [])[1];
assert(label === doc.name, "Dockerfile.mcp registry annotation matches server.json name",
    label ?? "(absent -- the registry cannot verify OCI ownership without it)");

process.stdout.write("server.json, against the schema it declares:\n\n");
for (const line of checked) process.stdout.write(`  ${line}\n`);

if (problems.length > 0) {
    process.stdout.write(`\n${problems.length} problem(s):\n\n`);
    for (const p of problems) process.stdout.write(`  FAIL  ${p}\n`);
    process.stdout.write(
        `\nSchema: ${KNOWN_SCHEMA}\n` +
        "Version fields are checked separately by `npm run check:versions`.\n");
    process.exit(1);
}

process.stdout.write("\nserver.json validates.\n");
