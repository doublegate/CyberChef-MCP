/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Tests for ReDoS screening of user-supplied regular expressions.
 *
 * The predecessor module shipped with NO tests -- its own security report left "Add
 * security-focused unit tests for SafeRegex" unchecked -- which is exactly why an upstream sync
 * could strip every call site without anything going red. The suite below is written so that
 * cannot happen again: the "stays wired up" block fails if the screen is ever disconnected from
 * the dispatch path, and the "covers the operations that compile user patterns" block fails if
 * the argument-detection heuristic stops matching the operations it exists to protect.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import {
    screenRegexPattern,
    isRegexArg,
    assertSafeRegexArg,
    MAX_PATTERN_LENGTH
} from "../../src/node/lib/safe-regex.mjs";
import { resolveArgValue } from "../../src/node/lib/tool-schema.mjs";
import OperationConfig from "../../src/core/config/OperationConfig.json" with { type: "json" };

const REGEX_ARG = { name: "Regex", type: "text" };

describe("screenRegexPattern", () => {
    it("passes ordinary patterns", () => {
        for (const p of [
            "^[a-z0-9_]+$",
            "\\d{4}-\\d{2}-\\d{2}",
            "(foo|bar)baz",
            "https?://[^\\s]+",
            "[A-Fa-f0-9]{32}",
            "a+b+c+"                       // sequential quantifiers are fine; only NESTED blow up
        ]) {
            expect(screenRegexPattern(p), `expected safe: ${p}`).toEqual({ safe: true });
        }
    });

    it("rejects nested quantifiers", () => {
        for (const p of ["^(a+)+$", "(x*)*", "(\\d+)+$"]) {
            const v = screenRegexPattern(p);
            expect(v.safe, `expected unsafe: ${p}`).toBe(false);
            expect(v.shape).toBe("nested-quantifier");
        }
    });

    it("rejects quantified alternation with overlapping branches", () => {
        const v = screenRegexPattern("(a|ab)+");
        expect(v.safe).toBe(false);
        expect(v.shape).toBe("quantified-alternation");
    });

    it("rejects bounded repetition wrapping a quantified group", () => {
        const v = screenRegexPattern("(a+){10,}");
        expect(v.safe).toBe(false);
        expect(v.shape).toBe("nested-bounded-repeat");
    });

    it("rejects over-length patterns", () => {
        const v = screenRegexPattern("a".repeat(MAX_PATTERN_LENGTH + 1));
        expect(v.safe).toBe(false);
        expect(v.shape).toBe("over-length");
    });

    it("treats empty and non-string input as safe rather than throwing", () => {
        expect(screenRegexPattern("")).toEqual({ safe: true });
        expect(screenRegexPattern(undefined)).toEqual({ safe: true });
        expect(screenRegexPattern(null)).toEqual({ safe: true });
    });
});

describe("isRegexArg", () => {
    it("matches args whose name says regex", () => {
        expect(isRegexArg({ name: "Regex", type: "text" })).toBe(true);
        expect(isRegexArg({ name: "Match (regex)", type: "string" })).toBe(true);
        expect(isRegexArg({ name: "Section (regex)", type: "string" })).toBe(true);
    });

    it("matches a toggleString offering a Regex mode", () => {
        expect(isRegexArg({
            name: "Find", type: "toggleString",
            toggleValues: ["Regex", "Extended (\\n, \\t, \\x...)", "Simple string"]
        })).toBe(true);
    });

    it("does NOT match enumerated types, which cannot carry a user pattern", () => {
        expect(isRegexArg({ name: "Built in regexes", type: "populateOption" })).toBe(false);
        expect(isRegexArg({ name: "Colour Pattern #1", type: "option" })).toBe(false);
        expect(isRegexArg({ name: "Wheel Pattern", type: "argSelector" })).toBe(false);
    });

    it("does NOT match cribs that take literal text", () => {
        // Bombe, ROT13/47 Brute Force and XOR Brute Force take plaintext, not patterns.
        expect(isRegexArg({ name: "Crib", type: "string" })).toBe(false);
        expect(isRegexArg({ name: "Crib (known plaintext string)", type: "string" })).toBe(false);
        // Magic's crib explicitly accepts a regex, so it IS screened.
        expect(isRegexArg({
            name: "Crib (known plaintext string or regex)", type: "string"
        })).toBe(true);
    });

    it("tolerates malformed argument definitions", () => {
        for (const bad of [null, undefined, {}, "nope", 42]) {
            expect(isRegexArg(bad)).toBe(false);
        }
    });
});

describe("assertSafeRegexArg", () => {
    it("throws a structured input error, without echoing the pattern", () => {
        let err;
        try {
            assertSafeRegexArg(REGEX_ARG, "^(a+)+$");
        } catch (e) {
            err = e;
        }
        expect(err, "expected a throw").toBeDefined();
        expect(err.message).toMatch(/denial-of-service/i);
        // The pattern is attacker-controlled and this message can reach logs.
        expect(JSON.stringify(err)).not.toContain("^(a+)+$");
    });

    it("ignores non-regex arguments entirely", () => {
        expect(() => assertSafeRegexArg({ name: "Delimiter", type: "string" }, "^(a+)+$"))
            .not.toThrow();
    });

    it("ignores non-string values", () => {
        expect(() => assertSafeRegexArg(REGEX_ARG, 42)).not.toThrow();
        expect(() => assertSafeRegexArg(REGEX_ARG, undefined)).not.toThrow();
    });
});

describe("stays wired up (regression guard for the v1.4.1 failure)", () => {
    // The predecessor module was not deleted -- it was DISCONNECTED, and nothing noticed.
    // These assertions go through the real dispatch helper, so they fail if the screen is ever
    // removed from `resolveArgValue`, regardless of whether the module itself still exists.
    it("resolveArgValue rejects a catastrophic pattern for a regex arg", () => {
        expect(() => resolveArgValue(REGEX_ARG, "^(a+)+$")).toThrow(/denial-of-service/i);
    });

    it("resolveArgValue still passes ordinary patterns through unchanged", () => {
        expect(resolveArgValue(REGEX_ARG, "^[a-z]+$")).toBe("^[a-z]+$");
    });

    it("resolveArgValue leaves non-regex arguments alone", () => {
        const argDef = { name: "Delimiter", type: "string" };
        expect(resolveArgValue(argDef, "(a+)+")).toBe("(a+)+");
    });
});

describe("covers the operations that compile user patterns", () => {
    // Ground truth: operations whose source constructs a RegExp/XRegExp from an argument.
    // If an upstream sync renames these arguments, the heuristic stops matching and this fails
    // -- which is the alarm the original module never had.
    const MUST_COVER = [
        "Regular expression",
        "Filter",
        "Find / Replace",
        "Subsection",
        "Conditional Jump",
        "RAKE"
    ];

    it.each(MUST_COVER)("%s has at least one screened argument", (opName) => {
        const def = OperationConfig[opName];
        expect(def, `${opName} missing from OperationConfig`).toBeDefined();
        const screened = (def.args || []).filter(isRegexArg);
        expect(screened.length, `no screened arg found on "${opName}"`).toBeGreaterThan(0);
    });

    it("does not over-reach across the whole operation set", () => {
        // A heuristic that matched everything would be useless and would break normal use.
        // This pins the blast radius: a change that suddenly screens hundreds of arguments
        // fails here rather than in production.
        let screened = 0, total = 0;
        for (const def of Object.values(OperationConfig)) {
            for (const a of (def.args || [])) {
                total++;
                if (isRegexArg(a)) screened++;
            }
        }
        expect(screened).toBeGreaterThan(5);
        expect(screened).toBeLessThan(total * 0.05);
    });
});
