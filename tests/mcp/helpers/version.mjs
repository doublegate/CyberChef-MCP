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

/** SemVer 2.0.0, with optional pre-release and build metadata. */
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

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
