/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Registry for tools that are not CyberChef operations.
 *
 * Every tool this server has exposed until now is derived from `OperationConfig` -- 504 of them,
 * each a pure `run(input, args)` over one input. That shape cannot express an *analysis*: trying
 * forty candidate key lengths and scoring each, walking a search space, or composing several
 * operations and comparing their results. `cyberchef_bake` does not help, because a recipe is a
 * linear pipeline, not a loop.
 *
 * This registry is where those live. It is deliberately narrow.
 *
 * WHAT THIS IS NOT: A PLUGIN LOADER
 * ---------------------------------
 * The roadmap line for v2.4.0 reads "plugin system, sandboxed execution, plugin registry". The
 * first and third are here; the second is not, and until it is, this registry loads NOTHING from
 * disk. Tools are registered by explicit import from `src/node/tools/index.mjs` -- first-party
 * code, reviewed and shipped in the package, at exactly the same trust level as the rest of the
 * server.
 *
 * That is not caution for its own sake. "Sandboxed execution" is not achievable with `node:vm`,
 * which Node's own documentation states plainly: *"The node:vm module is not a security mechanism.
 * Do not use it to run untrusted code."* And it is not a technicality -- every useful tool needs a
 * capability (this one needs `bake`), and a host function handed into a vm context carries its own
 * realm with it:
 *
 *     const ctx = vm.createContext({ bake: hostBake });
 *     vm.runInContext('bake.constructor("return process")()', ctx);   // -> the real process
 *
 * Measured, not quoted. Worker threads do not close the gap either: they bound CPU, not authority,
 * and share the process's filesystem and network. A real sandbox means process isolation plus an
 * explicit capability allowlist. That is a design, not a bullet point, and shipping a loader
 * labelled "sandboxed" without it would be precisely the kind of claim the last three releases
 * were spent deleting.
 *
 * THE ONE SECURITY PROPERTY THIS FILE DOES ENFORCE
 * -----------------------------------------------
 * A registry tool can never shadow a CyberChef operation. `cyberchef_aes_decrypt` must always be
 * AES Decrypt. Registration fails loudly on a collision rather than resolving it by order, so no
 * future tool -- and no future plugin loader built on this -- can quietly take over the name of an
 * operation a caller already trusts.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";

/** Registry tool names are lower snake_case. The `cyberchef_` prefix is added on exposure. */
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/**
 * A registered tool.
 *
 * @typedef {Object} RegistryTool
 * @property {string} name - Lower snake_case, without the `cyberchef_` prefix.
 * @property {string} title - Human-readable display name.
 * @property {string} description - What it does, in one or two sentences.
 * @property {string} category - Grouping, for discovery.
 * @property {Object} inputSchema - A Zod object schema for the arguments.
 * @property {Object} [annotations] - MCP tool annotations; sensible defaults are filled in.
 * @property {Function} run - `async (args, ctx) => result`. `ctx` carries the capabilities the
 *   tool is allowed to use; it never imports the engine itself.
 */

/**
 * Central registry for non-operation tools.
 */
export class ToolRegistry {

    /**
     * @param {Object} [options] - Options.
     * @param {Set<string>|string[]} [options.reservedNames] - Exposed MCP tool names that must not
     *   be shadowed: every operation tool and every meta-tool. Registration against one of these
     *   throws.
     */
    constructor({ reservedNames = [] } = {}) {
        this._tools = new Map();
        this._reserved = reservedNames instanceof Set ? reservedNames : new Set(reservedNames);
    }

    /** @returns {number} How many tools are registered. */
    get size() {
        return this._tools.size;
    }

    /**
     * The MCP tool name for a registry name.
     *
     * The `cyberchef_` prefix is kept deliberately. It was announced for removal in v1.8.0 as
     * DEP001 and withdrawn in v2.0.0 on measurement: stripping it saved 2.6% of the tool payload
     * and produced 19 names that collide in MCP's flat per-session namespace. A registry tool
     * called `search` or `diff` would be exactly that problem arriving by a new door.
     *
     * @param {string} name - Registry name.
     * @returns {string} The exposed MCP tool name.
     */
    static exposedName(name) {
        return `cyberchef_${name}`;
    }

    /**
     * Register a tool.
     *
     * @param {RegistryTool} tool - The tool.
     * @returns {ToolRegistry} this, for chaining.
     * @throws {Error} If the tool is malformed or its name is taken.
     */
    register(tool) {
        if (!tool || typeof tool !== "object")
            throw createInputError("A registry tool must be an object", { received: typeof tool });

        const { name, title, description, category, inputSchema, run } = tool;

        if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
            throw createInputError(
                `Invalid registry tool name: ${JSON.stringify(name)}. ` +
                "Expected lower snake_case, e.g. \"xor_key_length\".",
                { name, pattern: NAME_PATTERN.source });
        }
        if (name.startsWith("cyberchef_")) {
            throw createInputError(
                `Registry tool "${name}" must not carry the cyberchef_ prefix; it is added on ` +
                "exposure. Register it as \"" + name.slice("cyberchef_".length) + "\".",
                { name });
        }
        for (const [field, value] of [["title", title], ["description", description], ["category", category]]) {
            if (typeof value !== "string" || !value.trim())
                throw createInputError(`Registry tool "${name}" needs a non-empty ${field}`, { name, field });
        }
        // A Zod object specifically: `toInputSchema` converts it, and a bare shape or a
        // non-object schema produces a tool a client cannot call. That failure shipped once
        // already, as an empty `inputSchema` on all 524 tools.
        // `instanceof` against a duplicated zod copy is false even for a genuine object schema, so
        // it is backed by a structural check rather than replaced by one: `instanceof` is the
        // precise test when there is a single zod, and `def.type` catches the duplicate-copy case.
        //
        // NOT `_def.typeName`, which a review suggested: that is the Zod 3 shape. On the zod 4 this
        // project uses it is `undefined` for every schema, so the check would reject every tool and
        // the server would not start.
        const isObjectSchema = inputSchema instanceof z.ZodObject || inputSchema?.def?.type === "object";
        if (!inputSchema || typeof inputSchema.safeParse !== "function" || !isObjectSchema) {
            throw createInputError(
                `Registry tool "${name}" needs a Zod OBJECT schema as inputSchema`,
                { name, received: inputSchema === undefined ? "undefined" : typeof inputSchema });
        }
        if (typeof run !== "function")
            throw createInputError(`Registry tool "${name}" needs a run function`, { name });

        if (this._tools.has(name))
            throw createInputError(`Registry tool "${name}" is already registered`, { name });

        // The property this file exists to guarantee. A registry tool must never be able to take
        // over the name of a CyberChef operation or a meta-tool: `cyberchef_aes_decrypt` has to
        // stay AES Decrypt. Failing loudly here is the whole point -- resolving it by
        // registration order would mean the winner depends on import sequence.
        const exposed = ToolRegistry.exposedName(name);
        if (this._reserved.has(exposed)) {
            throw createInputError(
                `Registry tool "${name}" would shadow the existing tool "${exposed}". ` +
                "Registry tools may not take the name of a CyberChef operation or a meta-tool.",
                { name, exposed });
        }

        this._tools.set(name, Object.freeze({ ...tool }));
        return this;
    }

    /**
     * Look a tool up by its EXPOSED name, which is what a `tools/call` carries.
     *
     * @param {string} exposedName - e.g. `cyberchef_xor_key_length`.
     * @returns {RegistryTool|undefined} The tool, or undefined.
     */
    getByExposedName(exposedName) {
        if (typeof exposedName !== "string" || !exposedName.startsWith("cyberchef_")) return undefined;
        return this._tools.get(exposedName.slice("cyberchef_".length));
    }

    /**
     * Every registered tool, in registration order.
     *
     * @returns {RegistryTool[]} The tools.
     */
    list() {
        return [...this._tools.values()];
    }

    /**
     * Registered tools grouped by category, for discovery.
     *
     * @returns {Object<string, string[]>} Category name to exposed tool names.
     */
    byCategory() {
        // Null prototype: "__proto__" and "constructor" are valid category strings, and on a
        // plain object `out["__proto__"]` reads an inherited value that is truthy, so `||= []`
        // never assigns and the `.push` below throws instead of grouping.
        const out = Object.create(null);
        for (const tool of this._tools.values()) {
            (out[tool.category] ||= []).push(ToolRegistry.exposedName(tool.name));
        }
        return out;
    }
}
