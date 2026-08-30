/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ReDoS screening for user-supplied regular expressions.
 *
 * WHY THIS LIVES IN src/node/lib/ AND NOT src/core/
 * -------------------------------------------------
 * Its ancestor, `src/core/lib/SafeRegex.mjs`, was added in v1.4.1 and worked by having
 * operations under `src/core/operations/` import it. `upstream-sync.yml` copies that
 * directory verbatim from upstream, so a later sync overwrote every call site and the
 * mitigation silently disappeared -- for four minor releases, while three documents went on
 * describing it as active. See docs/security/2026-08-30-saferegex-reverted-by-upstream-sync.md.
 *
 * `src/node/lib/` is fork-owned and outside every sync allowlist, so nothing upstream can
 * revert this. The screening also now happens in the MCP dispatch path rather than inside the
 * operations, which means it covers every operation at once instead of needing a per-file edit
 * that the next sync undoes.
 *
 * WHY THE TIMEOUT CHECK FROM THE OLD MODULE IS NOT REIMPLEMENTED
 * --------------------------------------------------------------
 * The original advertised "timeout-based validation (100ms) to detect catastrophic
 * backtracking". That cannot work, and it is worth stating plainly so nobody adds it back.
 * Catastrophic backtracking blocks the V8 event loop synchronously, so no timer scheduled
 * from JavaScript can fire while it runs. Measured:
 *
 *     const evil = /^(a+)+$/, input = "a".repeat(30) + "!";
 *     setTimeout(() => console.log("TIMEOUT FIRED"), 500);
 *     evil.test(input);            // process killed at 10s; "TIMEOUT FIRED" never printed
 *
 * The same reasoning applies to the MCP layer's `OPERATION_TIMEOUT`: `Promise.race` against a
 * `setTimeout` gives NO protection against ReDoS, only against slow-but-yielding work. That is
 * precisely why screening has to happen BEFORE the pattern is ever executed.
 *
 * WHAT THIS IS AND IS NOT
 * -----------------------
 * This is a static screen: a length bound plus structural detection of the shapes that cause
 * exponential backtracking. It is defence in depth, NOT a decision procedure -- deciding whether
 * an arbitrary regex backtracks catastrophically is not something a heuristic settles. It is
 * tuned to reject the classic exponential shapes while passing ordinary patterns; a determined
 * adversary with an unusual construction may still get through. The durable fix is executing
 * untrusted patterns in a worker thread that can be terminated (`CYBERCHEF_ENABLE_WORKERS`),
 * where a hard timeout is actually enforceable. This screen is what protects the default
 * single-threaded configuration in the meantime.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { createInputError } from "../errors.mjs";

/**
 * Longest pattern accepted. Real patterns are far shorter; very long ones are both a
 * backtracking risk and a sign the argument is not really a regex.
 */
const MAX_PATTERN_LENGTH = Number(process.env.CYBERCHEF_MAX_REGEX_LENGTH) || 1000;

/**
 * Do two alternation branches overlap — can they match the same text?
 *
 * Exact overlap detection is language-inclusion and not something to attempt here. These three
 * cases cover the shapes that actually appear in ReDoS patterns, and each is decidable by
 * inspection:
 *
 *   identical      (a|a)      both branches accept the same string
 *   prefix         (a|ab)     one accepts a prefix of what the other accepts
 *   quantified     (a+|b)     a variable-length branch can absorb what a fixed one matches
 *
 * @param {string} left - One branch's source.
 * @param {string} right - Another branch's source.
 * @returns {boolean} True if the two can match overlapping text.
 */
function branchesOverlap(left, right) {
    const a = left.trim(), b = right.trim();
    if (a === "" || b === "") return true;              // an empty branch matches everywhere
    if (a === b) return true;                            // (a|a)
    if (a.startsWith(b) || b.startsWith(a)) return true; // (a|ab)
    // A quantifier makes a branch variable-length, so it can consume text the other branch
    // would also accept -- the (a+|b)+ family.
    return /[+*]|\{\d+,\d*\}/.test(a) || /[+*]|\{\d+,\d*\}/.test(b);
}

/**
 * Is there a quantified alternation group whose branches can overlap?
 *
 * @param {string} pattern - The regex source.
 * @returns {boolean} True if such a group is present.
 */
function hasOverlappingQuantifiedAlternation(pattern) {
    // Groups containing a top-level `|` and followed by a quantifier. The trailing `[?]?`
    // deliberately ALLOWS the lazy form: `(a|a)+?` is as catastrophic as `(a|a)+`.
    const GROUP = /\(([^()]*\|[^()]*)\)\s*(?:[+*]|\{\d+,\d*\})\??/g;
    for (const m of pattern.matchAll(GROUP)) {
        const branches = m[1].split("|");
        for (let i = 0; i < branches.length; i++) {
            for (let j = i + 1; j < branches.length; j++) {
                if (branchesOverlap(branches[i], branches[j])) return true;
            }
        }
    }
    return false;
}

/**
 * Structural shapes that cause exponential (not merely slow) backtracking.
 *
 * Each entry is deliberately narrow. A broad "contains nested quantifiers" test rejects
 * legitimate patterns, and a screen that fires on ordinary input gets disabled by whoever
 * trips over it -- which is a worse outcome than not having it.
 */
const CATASTROPHIC_SHAPES = [
    {
        // (a+)+ , (a*)* , (a+)* -- a quantified group whose body is itself quantified.
        // The classic exponential blowup.
        id: "nested-quantifier",
        re: /\([^)]*[+*]\)\s*[+*]/,
        why: "a quantified group whose body is also quantified, e.g. (a+)+"
    },
    {
        // (a|a)+ , (a|ab)* -- quantified alternation whose branches can match the SAME text,
        // giving the engine exponentially many ways to split the input.
        //
        // This one cannot be a plain regex, and the attempt to make it one was wrong in both
        // directions (measured):
        //   * `(foo|bar)+` and `(cat|dog)*` were REJECTED. Disjoint branches cannot overlap, so
        //     these are linear and completely ordinary. A screen that rejects them is a screen
        //     someone switches off.
        //   * `(a|a)+?` was ALLOWED, because the rule carried a `(?![?+])` guard that skipped
        //     lazy quantifiers. Laziness changes the ORDER the engine explores, not the size of
        //     the search space. Measured on 26 a's plus a failing character:
        //         (a|a)+   5383ms        (a|a)+?   5163ms
        //         (a+)+    2974ms        (a+)+?    2906ms
        //     Lazy is not meaningfully cheaper. The guard was a bypass: append one `?`.
        //
        // So overlap is what matters, and it is decided per pattern rather than by shape alone.
        id: "quantified-alternation",
        detect: hasOverlappingQuantifiedAlternation,
        why: "a quantified alternation whose branches can match the same text, e.g. (a|ab)+"
    },
    {
        // {n,m} repetition applied to an already-quantified group.
        id: "nested-bounded-repeat",
        re: /\([^)]*[+*][^)]*\)\s*\{\d+,?\d*\}/,
        why: "a bounded repetition wrapping a quantified group, e.g. (a+){10,}"
    }
];

/**
 * Screen a pattern, returning a structured verdict rather than throwing.
 *
 * @param {string} pattern - The raw regex source supplied by the caller.
 * @returns {{safe: boolean, reason?: string, shape?: string}} Verdict.
 */
function screenRegexPattern(pattern) {
    if (typeof pattern !== "string" || pattern.length === 0) return { safe: true };

    if (pattern.length > MAX_PATTERN_LENGTH) {
        return {
            safe: false,
            shape: "over-length",
            reason: `pattern is ${pattern.length} characters, over the ${MAX_PATTERN_LENGTH} limit`
        };
    }

    for (const shape of CATASTROPHIC_SHAPES) {
        const hit = shape.detect ? shape.detect(pattern) : shape.re.test(pattern);
        if (hit) {
            return { safe: false, shape: shape.id, reason: shape.why };
        }
    }

    return { safe: true };
}

/**
 * Does this argument definition describe a value the operation will compile as a regex?
 *
 * Derived from the argument definition rather than a hardcoded operation list, so operations
 * added by an upstream sync are covered without anyone remembering to update a table. The
 * pinned expectations in tests/mcp/safe-regex.test.mjs fail if this ever stops matching the
 * operations it is supposed to match -- the check that the original module lacked, and the
 * reason its removal went unnoticed.
 *
 * @param {Object} argDef - A CyberChef argument definition from OperationConfig.
 * @returns {boolean} True if the value should be screened.
 */
function isRegexArg(argDef) {
    if (!argDef || typeof argDef !== "object") return false;

    // Enumerated types (option, argSelector, populateOption, number...) never carry a
    // user-authored pattern; their values come from a fixed list.
    const FREE_TEXT = ["string", "text", "binaryString", "toggleString", "editableOption"];
    if (!FREE_TEXT.includes(argDef.type)) return false;

    const name = String(argDef.name || "").toLowerCase();

    // A toggleString offering a "Regex" mode: the value is a pattern whenever that mode is
    // selected. The mode is chosen at call time and is not visible here, so screen either way.
    // Rejecting a literal string that happens to look like a catastrophic regex is acceptable;
    // missing a real one is not.
    if (argDef.type === "toggleString" && Array.isArray(argDef.toggleValues) &&
        argDef.toggleValues.some(v => /regex/i.test(String(v)))) {
        return true;
    }

    // Names that state the value is a regex. "Crib (known plaintext string)" is deliberately
    // NOT matched -- those args (Bombe, ROT13/47 Brute Force, XOR Brute Force) take literal
    // text. "Crib (known plaintext string or regex)" on Magic does match.
    return /regex|regular expression/.test(name);
}

/**
 * Screen a resolved argument value, throwing a structured error if it is unsafe.
 *
 * Called from `resolveArgValue`, which is the single point every user-supplied argument passes
 * through on its way into a recipe -- for single operations, for `cyberchef_bake`, and for
 * batch execution alike. One hook covers all three.
 *
 * @param {Object} argDef - The argument definition.
 * @param {any} value - The resolved value.
 * @throws {CyberChefMCPError} If the value is a regex argument that fails screening.
 */
function assertSafeRegexArg(argDef, value) {
    if (!isRegexArg(argDef) || typeof value !== "string") return;

    const verdict = screenRegexPattern(value);
    if (verdict.safe) return;

    throw createInputError(
        `Regular expression rejected as a denial-of-service risk: ${verdict.reason}`,
        {
            argument: argDef.name,
            shape: verdict.shape,
            patternLength: value.length,
            // Never echo the pattern itself -- it is attacker-controlled and this string can
            // reach logs. The shape and length are what a caller needs to fix it.
            hint: "Rewrite the pattern to avoid nested or overlapping quantifiers, or set " +
                  "CYBERCHEF_ENABLE_WORKERS=true to run operations in a terminable worker thread."
        }
    );
}

export {
    screenRegexPattern,
    isRegexArg,
    assertSafeRegexArg,
    MAX_PATTERN_LENGTH,
    CATASTROPHIC_SHAPES
};
