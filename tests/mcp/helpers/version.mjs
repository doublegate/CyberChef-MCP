/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Shared assertion for the server's VERSION constant.
 *
 * WHY THIS IS A SHAPE CHECK AND NOT A COMPARISON
 * ----------------------------------------------
 * Two tempting assertions are both worse than this one:
 *
 *   expect(VERSION).toBe("2.0.0")
 *     A literal is a second source of truth for the product version. It has to be edited in
 *     lockstep with package.json, and when it is not, the failure says nothing about what broke.
 *     This is what four test files carried until v2.0.0.
 *
 *   expect(VERSION).toBe(pkg.mcpVersion)
 *     A tautology. `src/node/lib/config.mjs` IS `pkg.mcpVersion`, so this compares a value to
 *     itself and can never fail -- a test that looks like coverage and provides none.
 *
 * What can still genuinely break is the export vanishing, or package.json carrying a malformed
 * version. That is what this asserts.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { expect } from "vitest";

/**
 * The official SemVer 2.0.0 regular expression, verbatim from semver.org.
 *
 * A looser `\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?` accepts things SemVer forbids -- leading zeros
 * (`01.2.3`) and empty pre-release identifiers (`1.2.3-alpha..1`) -- so it would pass a version
 * string that npm itself rejects. Since the whole point of this assertion is "package.json does
 * not carry a malformed version", a regex laxer than npm's own rules defeats it.
 */
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Assert that a version constant is present and well-formed.
 *
 * @param {*} version - The VERSION export under test.
 * @returns {void}
 */
export function expectValidVersion(version) {
    expect(typeof version).toBe("string");
    expect(version).toMatch(SEMVER);
}
