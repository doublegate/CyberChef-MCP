/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Tool annotations: telling a client what a tool will and will not do.
 *
 * WHY THIS MATTERS
 * ----------------
 * MCP clients decide whether to prompt the user before running a tool. With no annotations a
 * careful client must assume the worst of every one of them -- so a session that decodes a base64
 * string, extracts URLs and hashes the result asks for approval three times, for three operations
 * that read their input and return a value.
 *
 * This server emitted none. It is an unusually good candidate for them: a CyberChef operation is a
 * pure function of its input and arguments. The overwhelming majority are read-only,
 * non-destructive, idempotent and closed-world, and the handful that are not are enumerable.
 *
 * The value of an annotation is entirely in its accuracy, so the exceptions below were established
 * by measurement rather than by reading names.
 *
 * HOW THE EXCEPTIONS WERE FOUND
 * -----------------------------
 * **Network reach**: every operation whose source calls `fetch`, `XMLHttpRequest` or `axios`.
 * Exactly two, and they are the two you would guess -- but the grep is what makes it a fact rather
 * than a guess, and it is repeatable when upstream adds a third.
 *
 * **Non-idempotent**: each candidate was run TWICE on the same input with its default arguments,
 * and the outputs compared. That is why this list contains `Derive PBKDF2 key` (it generates a
 * random salt when none is supplied) and `Bcrypt` (random salt), which a reading of the names
 * would not obviously flag, and why it does NOT contain `Argon2` or `Scrypt`, whose defaults are
 * fixed and which produced identical output on both runs.
 *
 * Two entries come from reasoning the empirical test cannot reach, and are marked as such below:
 * `Generate TOTP` varies with the clock rather than with a random source, so two calls inside one
 * time step agree; `Shuffle` and `Randomize Colour Palette` are random by construction but need an
 * input with more than one element to show it. Including them is the conservative direction -- an
 * operation wrongly marked non-idempotent costs a retry, while one wrongly marked idempotent
 * invites a client to cache or replay a result that should not be.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

/**
 * Operations that talk to a host outside this process.
 *
 * Found by grepping `src/core/operations/` for `fetch(`, `XMLHttpRequest` and `axios`.
 *
 * EXPORTED, and read by `lib/offline.mjs` as well as by the annotations below. One set, two
 * consumers: an offline switch that refused a different list from the one `openWorldHint`
 * advertises would be telling clients one thing and doing another.
 */
export const NETWORK_OPERATIONS = new Set([
    "HTTP request",
    "DNS over HTTPS"
]);

/**
 * Operations that can change state somewhere else.
 *
 * Only one: `HTTP request` takes a method, so it can POST, PUT or DELETE against a caller-supplied
 * URL. `DNS over HTTPS` issues a lookup and is read-only despite being networked -- the two
 * properties are independent, which is exactly why MCP gives them separate hints.
 */
const WRITING_OPERATIONS = new Set([
    "HTTP request"
]);

/**
 * Operations whose output can differ between two identical calls.
 *
 * Empirically confirmed by running each twice with default arguments and comparing:
 * `Generate UUID`, `Pseudo-Random Number Generator`, `Pseudo-Random Integer Generator`,
 * `Pseudo-Random Prime Generator`, `Bcrypt`, `Numberwang`, `CipherSaber2 Encrypt`,
 * `Derive PBKDF2 key`, `Generate RSA Key Pair`, `Generate ECDSA Key Pair`, `Generate Lorem Ipsum`.
 *
 * The rest are included on reasoning the two-run test cannot reach, and are noted individually.
 */
const NON_IDEMPOTENT_OPERATIONS = new Set([
    // Verified by the two-run comparison.
    "Generate UUID",
    "Pseudo-Random Number Generator",
    "Pseudo-Random Integer Generator",
    "Pseudo-Random Prime Generator",
    "Bcrypt",
    "Numberwang",
    "CipherSaber2 Encrypt",
    "Derive PBKDF2 key",
    "Generate RSA Key Pair",
    "Generate ECDSA Key Pair",
    "Generate Lorem Ipsum",

    // Random by construction, but needs a multi-element input to demonstrate it; both call
    // `Math.random` directly.
    "Shuffle",
    "Randomize Colour Palette",

    // Varies with the clock, not with a random source, so two calls inside one time step agree.
    "Generate TOTP",

    // Slow to generate and so excluded from the timed comparison, but a key pair is random by
    // definition.
    "Generate PGP Key Pair",

    // Answers depend on a remote host, which may return something different next time.
    "HTTP request",
    "DNS over HTTPS"
]);

/**
 * Annotations for one CyberChef operation exposed as a tool.
 *
 * @param {string} opName - The CyberChef operation name.
 * @returns {Object} MCP tool annotations.
 */
export function annotationsForOperation(opName) {
    const writes = WRITING_OPERATIONS.has(opName);
    return {
        // The operation name reads far better in a client's UI than `cyberchef_aes_encrypt`, and
        // it is the name every piece of CyberChef documentation uses.
        title: opName,
        readOnlyHint: !writes,
        // Only meaningful when readOnlyHint is false, per the spec, but stated either way so a
        // client reading it in isolation is not left to infer.
        destructiveHint: writes,
        idempotentHint: !NON_IDEMPOTENT_OPERATIONS.has(opName),
        openWorldHint: NETWORK_OPERATIONS.has(opName)
    };
}

/**
 * Annotations for this server's own meta-tools.
 *
 * They are not CyberChef operations, so their properties are stated here rather than derived. The
 * recipe tools are the interesting ones: they persist to a store, so they are neither read-only
 * nor -- for update and delete -- non-destructive.
 *
 * @param {string} toolName - The tool name, including the `cyberchef_` prefix.
 * @param {string} title - Human-readable title.
 * @returns {Object} MCP tool annotations.
 */
export function annotationsForMetaTool(toolName, title) {
    // Runs a caller-supplied recipe, which may contain ANY operation -- including `HTTP request`
    // with a method of POST, PUT or DELETE against a URL of the caller's choosing.
    //
    // These are therefore NOT marked read-only, and that costs something real: `cyberchef_bake` is
    // the primary tool, so a client that prompts on non-read-only tools will prompt often. It is
    // still the right call. A `readOnlyHint` is a claim about what the tool can do, and a claim
    // that an arbitrary-recipe executor cannot reach the network is simply false. An annotation is
    // worth exactly as much as its accuracy; one that is convenient and wrong teaches a client to
    // ignore the whole set.
    //
    // A caller who wants the cheap path has one: call the operation tool directly. Every one of the
    // 504 is individually annotated from its own behaviour, so `cyberchef_to_base64` is read-only
    // and idempotent and can be auto-approved, while only `cyberchef_http_request` is not.
    const EXECUTORS = new Set([
        "cyberchef_bake",
        "cyberchef_recipe_execute",
        "cyberchef_batch"
    ]);

    // Writes to the recipe store. `cyberchef_cache_clear` also mutates, but only this server's own
    // in-memory cache, which no caller can lose work to.
    const WRITES = new Set([
        "cyberchef_recipe_create",
        "cyberchef_recipe_update",
        "cyberchef_recipe_delete",
        "cyberchef_recipe_import"
    ]);
    // Removes something a caller may not be able to recover.
    const DESTRUCTIVE = new Set([
        "cyberchef_recipe_delete",
        "cyberchef_recipe_update"
    ]);
    // A new id, or a changed timestamp, on every call.
    const NON_IDEMPOTENT = new Set([
        "cyberchef_recipe_create",
        "cyberchef_recipe_import",
        "cyberchef_bake",
        "cyberchef_recipe_execute",
        "cyberchef_batch"
    ]);

    return {
        title,
        readOnlyHint: !WRITES.has(toolName) && !EXECUTORS.has(toolName),
        // Executors are destructive too, and an earlier version of this file argued otherwise:
        // that an executor "destroys nothing by itself" and marking it destructive would flatten a
        // distinction. That reasoning does not survive contact with the spec. `destructiveHint` is
        // meaningful precisely when `readOnlyHint` is false -- which it already is here -- and it
        // asks whether the tool MAY perform destructive updates. A recipe may contain
        // `HTTP request` with a DELETE, so the answer is yes.
        //
        // Being conservative on a hint a client uses to decide whether to ask the user is the
        // right direction to be wrong in: over-warning costs a prompt, under-warning costs a
        // deletion nobody approved.
        destructiveHint: DESTRUCTIVE.has(toolName) || EXECUTORS.has(toolName),
        // Claiming idempotence for an executor would be a claim about a recipe this server has not
        // seen yet: it may contain `Generate UUID`, or a network call.
        idempotentHint: !NON_IDEMPOTENT.has(toolName),
        // Same reasoning. `recipe_create` and `recipe_import` are non-idempotent because they mint
        // an id, not because they reach anywhere -- so they are not open-world.
        openWorldHint: EXECUTORS.has(toolName)
    };
}
