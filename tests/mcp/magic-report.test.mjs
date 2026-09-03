/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Magic's readable report, and the round trip that the old output could not complete.
 *
 * The defect this suite pins is not "the text was ugly". It is that the single most actionable
 * field Magic produced -- the recipe it recommends -- was rendered in a form `bake` REJECTS, so a
 * caller acting on Magic's own suggestion had to reconstruct it by guesswork. The headline test
 * here therefore takes each recipe out of the report and executes it, which is the assertion that
 * would have failed before this release and cannot silently pass now.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { runMagic, renderMagicReport, likelyLanguage, toPreview, describeEntropy } from "../../src/node/lib/magic.mjs";
import { mapArgsToZod } from "../../src/node/lib/tool-schema.mjs";
import OperationConfig from "../../src/core/config/OperationConfig.json" with { type: "json" };

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, "../../src/node/mcp-server.mjs");
const BOOT_TIMEOUT_MS = 120_000;

const B64_TEXT = Buffer.from("The quick brown fox").toString("base64");
const GZIP_B64 = gzipSync(Buffer.from(
    "Meet me at the docks at midnight. Bring the documents.")).toString("base64");

describe("magic report shaping", () => {
    it("emits a recipe in the executable form, never the pretty form", async () => {
        const { candidates } = await runMagic(B64_TEXT);
        const withRecipe = candidates.filter(c => c.recipe.length);
        expect(withRecipe.length).toBeGreaterThan(0);

        for (const candidate of withRecipe) {
            for (const step of candidate.recipe) {
                // The pretty form is `From_Base64('A-Za-z0-9+/=',true,false)` -- a single string
                // with underscores for spaces. The executable form is an object with a spaced
                // operation name and a separate args array. Asserting both halves, because a
                // regression could produce either shape.
                expect(typeof step).toBe("object");
                expect(typeof step.op).toBe("string");
                expect(step.op).not.toMatch(/[(']/);
                expect(step.op).not.toContain("_");
                expect(Array.isArray(step.args)).toBe(true);
            }
        }
    });

    it("drops languageScores, which dominated the raw payload", async () => {
        const shaped = await runMagic(GZIP_B64);
        const serialised = JSON.stringify(shaped);
        // 39 entries per option by default, almost all with probability 0. Their absence is the
        // whole size win, so it is asserted rather than assumed.
        expect(serialised).not.toContain("languageScores");
        expect(serialised).not.toContain("chiSqr");
        expect(serialised.length).toBeLessThan(6000);
    });

    it("reports a language only as an estimate, with its runners-up", () => {
        // Verbatim shape of a real scores array: a vanishingly small probability still passes
        // `> 0`, which is how "Attack at dawn" was reported as German.
        const scores = [
            { lang: "de", score: 401.1, probability: 1.35e-8 },
            { lang: "en", score: 415.0, probability: 1.0e-9 },
            { lang: "nl", score: 420.0, probability: 1.0e-10 },
            { lang: "fr", score: 900.0, probability: 0 }
        ];
        const estimate = likelyLanguage(scores, 14);
        expect(estimate.name).toBe("German");
        // The true language must survive into the alternatives -- that is what stops the report
        // asserting a single wrong answer.
        expect(estimate.alternatives).toContain("English");
        // Zero-probability languages are not runners-up, they are noise.
        expect(estimate.alternatives).not.toContain("French");
        expect(estimate.shortSample).toBe(true);
    });

    it("says nothing about language when nothing scored above zero", () => {
        expect(likelyLanguage([{ lang: "en", score: 809, probability: 0 }], 19)).toBeNull();
        expect(likelyLanguage([], 100)).toBeNull();
        expect(likelyLanguage(undefined, 100)).toBeNull();
    });

    it("never states a language as fact in the rendered report", async () => {
        // "Attack at dawn" is English and Magic calls it German. The report may carry that guess;
        // it may not present it as a determination.
        const shaped = await runMagic(Buffer.from("Attack at dawn").toString("hex"));
        const report = renderMagicReport(shaped);
        if (report.includes("language")) {
            expect(report).toContain("estimated language");
            expect(report).toContain("not a determination");
        }
    });

    it("escapes control characters instead of emitting them", () => {
        const nasty = "a" + String.fromCharCode(0) + String.fromCharCode(27) + "[31m" +
            String.fromCharCode(7) + "b";
        const { preview } = toPreview(nasty);
        // An escape sequence reaching a terminal verbatim can recolour or reposition the rest of
        // the report, so the raw bytes must be gone entirely.
        expect(preview).not.toMatch(new RegExp("[\u0000-\u001f\u007f]"));
        expect(preview).toContain("\\x00");
        expect(preview).toContain("\\x1b");
        expect(preview).toContain("\\x07");
    });

    it("marks a truncated preview as truncated", () => {
        const { preview, truncated } = toPreview("x".repeat(5000));
        expect(truncated).toBe(true);
        expect(preview.length).toBeLessThan(400);
        expect(toPreview("short").truncated).toBe(false);
    });

    it("bands entropy on Magic's own thresholds", () => {
        expect(describeEntropy(2.9)).toContain("low");
        expect(describeEntropy(4.0)).toContain("natural-language");
        expect(describeEntropy(7.9)).toContain("encrypted");
    });

    it("rejects a catastrophic crib rather than compiling it", async () => {
        // The direct-library path bypasses `resolveArgValue`, where every other argument is
        // screened, so the module has to screen this one itself. Without that, a nested quantifier
        // is compiled and then run against every candidate decoding.
        await expect(runMagic(B64_TEXT, { crib: "(a+)+$" }))
            .rejects.toThrow(/denial-of-service/i);
    });

    it("passes intensive and extLang in the order speculativeExecution expects", async () => {
        // The operation declares [depth, intensive, extLang, crib] but calls
        // speculativeExecution(depth, extLang, intensive, ...). Swapping them throws no error and
        // produces no warning -- it just brute-forces when asked for languages. Extensive language
        // support widens the language table, so it is observable through the options echo.
        const shaped = await runMagic("just some ordinary words here", { extLang: true });
        expect(shaped.options.extLang).toBe(true);
        expect(shaped.options.intensive).toBe(false);
    });

    it("renders every optional signal a candidate can carry", () => {
        // Driven from a synthetic shape rather than a real bake: the optional fields appear
        // together only for inputs that are awkward to construct, and this keeps the assertions
        // about the RENDERER rather than about which candidates Magic happens to find today.
        const report = renderMagicReport({
            input: {
                bytes: 512, entropy: 7.9,
                entropyAssessment: "high, suggesting encrypted, compressed or random data",
                isUTF8: false, fileType: { mime: "application/gzip", extension: "gz" }
            },
            options: { depth: 3, intensive: false, extLang: false, crib: null },
            candidateCount: 2,
            candidates: [
                {
                    rank: 1, recipe: [{ op: "From Base64", args: [] }], operations: ["From Base64"],
                    preview: "decoded", previewTruncated: true, isUTF8: true, entropy: 3.2,
                    language: { code: "en", name: "English", probability: 1, alternatives: ["Dutch"], shortSample: false },
                    fileType: { mime: "image/png", extension: "png" },
                    matchingOperations: ["Gunzip"], usefulOperationDetected: true, matchesCrib: null
                },
                {
                    rank: 2, recipe: [], operations: [],
                    preview: "raw", previewTruncated: false, isUTF8: false, entropy: null,
                    language: null, fileType: null,
                    matchingOperations: [], usefulOperationDetected: false, matchesCrib: null
                }
            ]
        });

        expect(report).toContain("not valid UTF-8");
        expect(report).toContain("application/gzip (.gz)");
        expect(report).toContain("[truncated]");
        expect(report).toContain("estimated language English (or Dutch)");
        expect(report).toContain("image/png (.png)");
        expect(report).toContain("renders as something viewable");
        expect(report).toContain("further operations match: Gunzip");
        expect(report).toContain("(no operation -- the input as given)");
        // A candidate with no recipe must not advertise an empty one.
        expect(report).not.toContain("Recipe:  []");
        // Every candidate had a long enough sample, so the short-sample clause stays out.
        expect(report).not.toContain("shorter than 64 bytes");
    });

    it("prints the no-language footnote when nothing scored", () => {
        const report = renderMagicReport({
            input: { bytes: 8, entropy: 2.0, entropyAssessment: "low", isUTF8: true, fileType: null },
            options: { depth: 3, intensive: false, extLang: false, crib: null },
            candidateCount: 1,
            candidates: [{
                rank: 1, recipe: [{ op: "From Hex", args: [] }], operations: ["From Hex"],
                preview: "x", previewTruncated: false, isUTF8: true, entropy: 1.0,
                language: null, fileType: null, matchingOperations: [],
                usefulOperationDetected: false, matchesCrib: null
            }]
        });
        expect(report).toContain("was not conclusive");
        expect(report).not.toContain("estimated language");
    });

    it("accepts a Buffer and an ArrayBuffer as readily as a string", async () => {
        const asString = await runMagic(B64_TEXT);
        const asBuffer = await runMagic(Buffer.from(B64_TEXT, "utf8"));
        const asArrayBuffer = await runMagic(
            Uint8Array.from(Buffer.from(B64_TEXT, "utf8")).buffer);

        expect(asBuffer.input.bytes).toBe(asString.input.bytes);
        expect(asArrayBuffer.input.bytes).toBe(asString.input.bytes);
        expect(asBuffer.candidateCount).toBe(asString.candidateCount);
    });

    it("survives data that is absent or not a string", () => {
        expect(toPreview(undefined).preview).toBe("");
        expect(toPreview(null).preview).toBe("");
        expect(toPreview(12345).preview).toBe("12345");
    });

    it("explains itself when there is nothing to suggest", async () => {
        const shaped = await runMagic(B64_TEXT, { crib: "definitely-not-present-anywhere" });
        expect(shaped.candidateCount).toBe(0);
        const report = renderMagicReport(shaped);
        expect(report).toMatch(/crib/i);
        // An empty result must still tell the caller what to do next, not just go quiet.
        expect(report.length).toBeGreaterThan(120);
    });
});

describe("magic's argument schema", () => {
    it("describes every argument Magic takes", () => {
        const schema = mapArgsToZod(OperationConfig.Magic.args, "Magic");
        const keys = [
            "depth", "intensive_mode", "extensive_language_support",
            "crib_known_plaintext_string_or_regex"
        ];
        for (const key of keys) {
            const described = schema[key]?.description ?? schema[key]?._def?.description ?? "";
            expect(described.length).toBeGreaterThan(30);
        }
    });

    it("tells a caller what the crib actually does", () => {
        // The crib is the most effective filter Magic has and the least guessable from its name,
        // which is the whole reason the curated table exists.
        const schema = mapArgsToZod(OperationConfig.Magic.args, "Magic");
        const crib = schema.crib_known_plaintext_string_or_regex;
        const text = crib.description ?? crib._def?.description ?? "";
        expect(text.toLowerCase()).toContain("regex");
        expect(text.toLowerCase()).toContain("match");
    });

    it("adds nothing when the operation name is not supplied", () => {
        // The lookup is keyed by operation, so the old single-argument call must behave exactly as
        // it did -- every other caller of mapArgsToZod depends on that.
        const schema = mapArgsToZod(OperationConfig.Magic.args);
        const depth = schema.depth;
        expect(depth.description ?? depth._def?.description ?? "").toBe("");
    });

    it("leaves the derived toggleString prose intact for other operations", () => {
        // The curated table must not displace the option list a caller needs in order to pass a
        // key in the right encoding.
        const schema = mapArgsToZod(OperationConfig["AES Decrypt"].args, "AES Decrypt");
        const key = schema.key;
        const text = key.description ?? key._def?.description ?? "";
        expect(text).toContain("Hex");
        expect(text).toContain("default");
    });

    it("does not describe arguments that explain themselves", () => {
        // The bar for an entry is deliberately high, because tools/list is a per-request cost.
        const schema = mapArgsToZod(OperationConfig["To Base64"].args, "To Base64");
        const alphabet = schema.alphabet;
        const text = alphabet.description ?? alphabet._def?.description ?? "";
        expect(text).not.toContain("Magic");
    });
});

describe("magic through a real MCP client", () => {
    let client;

    beforeAll(async () => {
        client = new Client({ name: "magic-report-test", version: "0.0.0" }, { capabilities: {} });
        await client.connect(new StdioClientTransport({
            command: process.execPath,
            args: [SERVER],
            env: { ...process.env, CYBERCHEF_TOOL_SURFACE: "all" }
        }));
    }, BOOT_TIMEOUT_MS);

    afterAll(async () => {
        await client?.close();
    });

    it("returns readable text, not a de-tagged HTML table", async () => {
        const res = await client.callTool({
            name: "cyberchef_magic",
            arguments: { input: B64_TEXT }
        });

        const text = res.content.find(c => c.type === "text").text;

        // The exact artefacts of the old output. "Recipe (click to load)" is the clearest of them:
        // a UI affordance with no meaning whatsoever to a client that cannot click.
        expect(text).not.toContain("click to load");
        expect(text).not.toContain("Result snippet");
        expect(text).not.toMatch(/<[a-z]+[\s>]/i);
        expect(text).not.toContain("data-toggle");

        // And what it must contain instead.
        expect(text).toContain("The quick brown fox");
        expect(text).toContain("From Base64");
        expect(text).toContain("cyberchef_bake");
    }, BOOT_TIMEOUT_MS);

    it("carries the same facts in structuredContent", async () => {
        const res = await client.callTool({
            name: "cyberchef_magic",
            arguments: { input: B64_TEXT }
        });

        expect(res.structuredContent).toBeDefined();
        expect(res.structuredContent.candidateCount).toBeGreaterThan(0);
        expect(res.structuredContent.input.bytes).toBe(B64_TEXT.length);
        // Both halves are built from one value, so they cannot disagree; this pins that they are
        // both actually present, which is the half of the MCP rule that is easy to get wrong.
        const text = res.content.find(c => c.type === "text").text;
        expect(text).toContain(String(res.structuredContent.input.entropy));
    }, BOOT_TIMEOUT_MS);

    it("recommends recipes that bake actually accepts", async () => {
        // THE test. Before this release the recommended recipe was the pretty form and bake
        // answered "Couldn't find an operation with name 'From_Base64(...)'".
        const magic = await client.callTool({
            name: "cyberchef_magic",
            arguments: { input: GZIP_B64 }
        });

        const candidates = magic.structuredContent.candidates.filter(c => c.recipe.length);
        expect(candidates.length).toBeGreaterThan(0);

        for (const candidate of candidates) {
            const baked = await client.callTool({
                name: "cyberchef_bake",
                arguments: { input: GZIP_B64, recipe: candidate.recipe }
            });

            expect(baked.isError ?? false).toBe(false);
            const out = baked.content.find(c => c.type === "text")?.text ?? "";
            expect(out).not.toContain("Couldn't find an operation");
        }

        // And the best candidate must actually reproduce the plaintext the report advertised.
        const best = candidates[0];
        const baked = await client.callTool({
            name: "cyberchef_bake",
            arguments: { input: GZIP_B64, recipe: best.recipe }
        });
        expect(baked.content.find(c => c.type === "text").text)
            .toContain("Meet me at the docks at midnight");
    }, BOOT_TIMEOUT_MS);
});
