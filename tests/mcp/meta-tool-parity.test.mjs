/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Every advertised meta-tool is dispatched, and every dispatched meta-tool is advertised.
 *
 * WHY THIS EXISTS
 * ---------------
 * `mcp-server.mjs` holds the meta-tools twice: once as the `META_TOOLS` literal that `tools/list`
 * is built from, and once as a chain of `name === "cyberchef_..."` branches that `tools/call`
 * dispatches on. Adding a tool means editing both, and **nothing enforced that they agree**.
 *
 * The v3.0.0 plan recorded this as carried-forward work — *"adding a tool means editing two
 * places"* — and it was carried, unmeasured, through six releases. Measured in v3.7.0 the two lists
 * do agree: 23 declared, 23 dispatched, no drift. So this is a guard against a latent hazard rather
 * than a fix for an active defect, and the guard is the proportionate response: the duplication is
 * legible and a rewrite into a dispatch table would be a large change to the hottest file in the
 * server for a problem that has not yet bitten.
 *
 * It has bitten in the adjacent case, which is why the hazard is credible rather than theoretical.
 * The registry tools have exactly this tripwire in `stdio-client-contract.test.mjs` —
 * *"has a client-driven call for every registry tool, with none missing"* — and it earned its keep
 * in v3.4.0 when `ecdsa_recover` was added.
 *
 * WHAT EACH DIRECTION MEANS
 * -------------------------
 * Declared but not dispatched: a tool that appears in `tools/list` with a full schema and fails on
 * every call. That is the shape of the defect that hid ten flow-control tools until v2.1.0 —
 * advertised, uncallable, and worse than absent, because a model reaches for a tool precisely when
 * it cannot tell a broken one from a hard problem.
 *
 * Dispatched but not declared: a callable tool nobody can discover, and one that a scope-filtered
 * `tools/list` cannot hide. AGENTS.md states the rule it breaks — *listing must never be stricter
 * than dispatch.*
 *
 * WHY THIS READS THE SOURCE
 * -------------------------
 * `META_TOOLS` is a module-private constant and the dispatch chain is control flow, so neither is
 * reachable from a client. A protocol-level test cannot see the invariant at all: it would have to
 * call all 23 tools and infer the mapping from what did not fail. Reading the file is the honest
 * way to assert a property of the file.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, "../../src/node/mcp-server.mjs");
const source = readFileSync(SERVER, "utf8");

/** Names in the `META_TOOLS` literal, which is what `tools/list` is built from. */
function declaredNames() {
    const start = source.indexOf("const META_TOOLS = [");
    expect(start, "META_TOOLS literal not found -- this test's assumption about the file is stale")
        .toBeGreaterThan(-1);
    // Indentation-anchored: `name:` at eight spaces is a top-level entry of the literal. A looser
    // match picks up `name` fields inside nested Zod schemas and argument descriptions.
    return new Set([...source.slice(start).matchAll(/^\s{8}name: "(cyberchef_[a-z_0-9]+)"/gm)]
        .map(match => match[1]));
}

/** Names the `tools/call` chain compares against. */
function dispatchedNames() {
    return new Set([...source.matchAll(/name === "(cyberchef_[a-z_0-9]+)"/g)].map(match => match[1]));
}

describe("meta-tool parity between tools/list and tools/call", () => {
    it("finds both lists, so a refactor cannot make this test vacuously pass", () => {
        // The failure mode of a source-reading test: the file changes shape, both sets come back
        // empty, and `empty === empty` reports success forever. Pinned with a floor rather than an
        // exact count, so adding a meta-tool does not require editing this number.
        expect(declaredNames().size).toBeGreaterThanOrEqual(20);
        expect(dispatchedNames().size).toBeGreaterThanOrEqual(20);
    });

    it("advertises nothing it cannot dispatch", () => {
        const undispatched = [...declaredNames()].filter(name => !dispatchedNames().has(name));
        // Named in the message rather than left to a bare count: the point of failing is to say
        // which tool would appear in tools/list and fail on every call.
        expect(undispatched, `advertised but never dispatched: ${undispatched.join(", ")}`)
            .toEqual([]);
    });

    it("dispatches nothing it does not advertise", () => {
        const undeclared = [...dispatchedNames()].filter(name => !declaredNames().has(name));
        expect(undeclared, `dispatched but never advertised: ${undeclared.join(", ")}`)
            .toEqual([]);
    });

    it("does not let a meta-tool shadow a registry tool", () => {
        // Registration already throws on a registry tool that shadows a meta-tool, so this asserts
        // the other direction -- the one nothing checks, because META_TOOLS is a literal and
        // literals do not run a constructor.
        const registry = readFileSync(resolve(HERE, "../../src/node/tools/index.mjs"), "utf8");
        const registryNames = [...registry.matchAll(/^import (\w+) from "\.\/([a-z-]+)\.mjs";$/gm)]
            .map(match => `cyberchef_${match[2].replace(/-/g, "_")}`);
        const collisions = registryNames.filter(name => declaredNames().has(name));
        expect(collisions, `a meta-tool and a registry tool share a name: ${collisions.join(", ")}`)
            .toEqual([]);
    });
});
