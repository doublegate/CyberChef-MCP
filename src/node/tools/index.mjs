/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The registry manifest: every tool that is not a CyberChef operation, listed explicitly.
 *
 * This file is the whole loading mechanism, and its plainness is deliberate. There is no directory
 * scan, no glob, no `import()` of a path from configuration -- adding a tool means adding a line
 * here, in a pull request, reviewed. See
 * [ADR 0002](../../../docs/adr/0002-tool-registry-is-not-a-plugin-loader.md) for why a loader is
 * not being built until sandboxing is real rather than nominal.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { ToolRegistry } from "./registry.mjs";
import xorKeyLength from "./xor-key-length.mjs";

/** Tools, in the order they should appear in `tools/list`. */
const TOOLS = [xorKeyLength];

/**
 * Build the registry.
 *
 * @param {Object} [options] - Options.
 * @param {Set<string>|string[]} [options.reservedNames] - Exposed tool names that must not be
 *   shadowed: every operation tool and every meta-tool. A collision throws at construction, which
 *   is a startup failure rather than a surprise at call time.
 * @returns {ToolRegistry} The populated registry.
 */
export function buildRegistry({ reservedNames = [] } = {}) {
    const registry = new ToolRegistry({ reservedNames });
    for (const tool of TOOLS) registry.register(tool);
    return registry;
}

export { ToolRegistry };
