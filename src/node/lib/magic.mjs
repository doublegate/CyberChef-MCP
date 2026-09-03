/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Magic, rendered for something that reads.
 *
 * WHY THIS EXISTS
 * ---------------
 * `Magic` is the operation an assistant reaches for first when handed an unknown blob, and it was
 * the one whose output an assistant could least act on. Three defects, all measured against the
 * shipped v2.8.1 server rather than reasoned about:
 *
 * 1. **The result was a de-tagged HTML table.** `Magic` declares `presentType: "html"`, and Chef
 *    always applies `present()` -- so `outputType: "JSON"` does not help, and neither does asking
 *    for a string. What reached the client was the web app's results table with its markup
 *    stripped: column headers, run-together fields, and the literal instruction
 *    "Recipe (click to load)" -- a UI affordance with no meaning whatsoever over MCP.
 *
 * 2. **The recipe it handed back was not executable.** The table renders recipes through
 *    `Utils.generatePrettyRecipe`, which produces `From_Base64('A-Za-z0-9+/=',true,false)`.
 *    `bake` REJECTS that string:
 *
 *        Couldn't find an operation with name 'From_Base64('A-Za-z0-9+/=',true,false)'.
 *
 *    So the one field a caller most wants to use is the one field it cannot use. To act on Magic's
 *    own suggestion a model had to reverse-engineer the pretty form back into
 *    `[{op: "From Base64", args: [...]}]` -- guessing that underscores become spaces and that the
 *    quoted arguments map positionally. That is a hallucination invitation sitting in the happy
 *    path, and it is why this module emits the executable form and nothing else.
 *
 * 3. **`languageScores` dominated the payload.** Every option carries one entry per candidate
 *    language -- 39 by default, 284 with extensive support -- and in the common case EVERY ONE has
 *    `probability: 0`. Measured raw against shaped:
 *
 *        base64 text   2 options    5,007 B  ->    539 B
 *        hex           2 options    5,348 B  ->    870 B
 *        gzip+base64   6 options   16,033 B  ->  2,583 B
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not invent confidence. The web presenter shows a language ONLY when
 * `languageScores[0].probability > 0`, and this module applies the same test, because the scores
 * are chi-squared byte-frequency distances that are always populated and always sorted -- so
 * `languageScores[0]` names a language even for a PNG. Reporting that top entry unconditionally
 * would state "English" on pure noise, which is precisely the exactness dishonesty module 20
 * forbids. When every probability is zero this says the language was not determined, and a caller
 * that wants the raw distances can still reach them through `cyberchef_bake`.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import MagicLib from "../../core/lib/Magic.mjs";
import { isUTF8 } from "../../core/lib/ChrEnc.mjs";
import { assertSafeRegexArg } from "./safe-regex.mjs";
import { createInputError } from "../errors.mjs";

/**
 * The crib argument definition, as `OperationConfig` declares it.
 *
 * Reproduced here because this module calls `speculativeExecution` DIRECTLY and therefore bypasses
 * `resolveArgValue`, which is where every other user-supplied argument is screened. The crib is
 * compiled with `new RegExp(crib, "i")` in `Magic.mjs` and then run against every candidate
 * decoding, so an unscreened catastrophic pattern is a denial of service with extra steps.
 *
 * The name matters and is not decoration: `isRegexArg` matches on it, and it is the exact string
 * `safe-regex.mjs` calls out as the one crib that IS a regex -- the identically-named cribs on
 * Bombe and the brute-force operations take literal text and are deliberately not screened.
 */
const CRIB_ARG = Object.freeze({
    name: "Crib (known plaintext string or regex)",
    type: "string"
});

/** Bytes of each candidate's decoded output to carry in the report. */
const PREVIEW_BYTES = 220;

/** Operation defaults, from `Magic.mjs`'s own `this.args`. */
const DEFAULTS = Object.freeze({ depth: 3, intensive: false, extLang: false, crib: "" });

/**
 * Describe an entropy figure in words.
 *
 * The bands are `Magic.mjs`'s own `chooseColour` thresholds (<3, <5, else), so the wording and the
 * web app's colour cannot disagree about the same number.
 *
 * @param {number} entropy - Shannon entropy, 0 to 8.
 * @returns {string} A short characterisation.
 */
function describeEntropy(entropy) {
    if (entropy < 3) return "low, suggesting structured or repetitive data";
    if (entropy < 5) return "typical of natural-language text";
    return "high, suggesting encrypted, compressed or random data";
}

/**
 * Control characters, which are escaped rather than emitted into the report.
 *
 * Built from a string so the pattern is written in printable ASCII: an earlier revision put the
 * raw bytes in a regex literal, where they are invisible in a diff and in review.
 */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

/**
 * A short, safe, single-line rendering of decoded output.
 *
 * Control characters are escaped rather than emitted: the result goes into a text report that a
 * terminal renders, and a raw control byte can move the cursor or corrupt the surrounding lines.
 *
 * @param {string} data - The decoded data.
 * @returns {{preview: string, truncated: boolean}} The preview and whether it was cut.
 */
function toPreview(data) {
    const text = typeof data === "string" ? data : String(data ?? "");
    const truncated = text.length > PREVIEW_BYTES;
    const clipped = truncated ? text.slice(0, PREVIEW_BYTES) : text;
    const escaped = clipped.replace(CONTROL_CHARS, ch => {
        const map = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };
        return map[ch] ?? `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`;
    });
    return { preview: escaped, truncated };
}

/**
 * Below this many bytes the language estimate is flagged as resting on a short sample.
 *
 * Chosen from measurement, not taste: a 14-byte "Attack at dawn" scores GERMAN top, and passes a
 * `probability > 0` test on a probability of 1.35e-8.
 */
const LANGUAGE_SAMPLE_FLOOR = 64;

/**
 * The language a candidate's byte frequencies most resemble, or null when nothing can be said.
 *
 * This is an ESTIMATE and is reported as one. `detectLanguage` is a chi-squared comparison of byte
 * frequencies against per-language averages; it is a weak signal that is confidently wrong often
 * enough to matter, and no simple threshold fixes it. Measured across four languages:
 *
 *     "Attack at dawn"                 (14 B, English)  -> German, probability 1.35e-8
 *     "just some ordinary words here"  (29 B, English)  -> Polish, probability 1, English 4th
 *     a representative French sample  (100 B)           -> English
 *     the same French sample           (40 B and 160 B) -> French, correctly
 *
 * So accuracy does not rise monotonically with length, and a length cutoff would discard correct
 * answers while still admitting wrong ones. The response is therefore to keep the presenter's own
 * `probability > 0` gate, carry the runners-up, and let the wording say "estimate" -- rather than
 * to state a determination the statistic does not support. A caller that needs certainty should
 * look at the decoded text itself, which this report also carries.
 *
 * @param {Object[]} scores - The option's `languageScores`, already sorted best-first.
 * @param {number} sampleLength - Length of the data the scores were computed over.
 * @returns {?Object} The estimate, or null when no language scored above zero.
 */
function likelyLanguage(scores, sampleLength) {
    const positive = (Array.isArray(scores) ? scores : []).filter(s => s && s.probability > 0);
    if (positive.length === 0) return null;
    const top = positive[0];
    return {
        code: top.lang,
        name: MagicLib.codeToLanguage(top.lang),
        probability: top.probability,
        alternatives: positive.slice(1, 4).map(s => MagicLib.codeToLanguage(s.lang)),
        shortSample: sampleLength < LANGUAGE_SAMPLE_FLOOR
    };
}

/**
 * Reduce one raw Magic option to the fields a caller can act on.
 *
 * @param {Object} option - A raw option from `speculativeExecution`.
 * @param {number} index - Zero-based rank; the list arrives sorted best-first.
 * @returns {Object} The shaped candidate.
 */
function shapeCandidate(option, index) {
    const { preview, truncated } = toPreview(option.data);
    const recipe = Array.isArray(option.recipe) ? option.recipe : [];

    return {
        rank: index + 1,
        // The EXECUTABLE form -- `[{op, args}]`, exactly what `cyberchef_bake` takes. Never the
        // pretty string, which bake rejects. See this module's header.
        recipe,
        operations: recipe.map(step => step.op),
        preview,
        previewTruncated: truncated,
        isUTF8: Boolean(option.isUTF8),
        entropy: typeof option.entropy === "number" ? Number(option.entropy.toFixed(2)) : null,
        language: likelyLanguage(option.languageScores, (option.data ?? "").length),
        fileType: option.fileType ? { mime: option.fileType.mime, extension: option.fileType.ext } : null,
        matchingOperations: [...new Set((option.matchingOps ?? []).map(op => op.op))],
        usefulOperationDetected: Boolean(option.useful),
        matchesCrib: option.matchesCrib ?? null
    };
}

/**
 * Run Magic and return a shaped, machine-readable result.
 *
 * @param {string|ArrayBuffer|Buffer} input - The data to analyse.
 * @param {Object} [options] - Magic options.
 * @param {number} [options.depth=3] - Maximum recursion depth.
 * @param {boolean} [options.intensive=false] - Brute-force XOR, bit rotates and encodings.
 * @param {boolean} [options.extLang=false] - Compare against 284 languages instead of ~40.
 * @param {string} [options.crib=""] - Regex the decoded data must match.
 * @returns {Promise<Object>} The shaped result.
 * @throws {CyberChefMCPError} `INVALID_INPUT` if the crib is a denial-of-service risk.
 */
async function runMagic(input, options = {}) {
    const { depth, intensive, extLang, crib } = { ...DEFAULTS, ...options };

    // Screened BEFORE compilation, not after -- `new RegExp` on a catastrophic pattern is cheap,
    // and it is running it against each candidate that costs. See CRIB_ARG.
    assertSafeRegexArg(CRIB_ARG, crib);

    // A malformed crib is the CALLER's mistake, so it has to arrive as INVALID_INPUT rather than
    // as a bare SyntaxError that the error layer classifies as an operation failure. Reproduced
    // before fixing: `crib: "(unclosed"` threw
    // `SyntaxError: Invalid regular expression: /(unclosed/i: Unterminated group`, with no code on
    // it -- so a caller was told the operation failed, not that its own argument was wrong.
    //
    // The engine message is quoted because it names the actual fault ("Unterminated group"), which
    // is what the caller needs in order to fix the pattern. It is derived from the input rather
    // than from anything secret.
    let cribRegex = null;
    if (crib && crib.length) {
        try {
            cribRegex = new RegExp(crib, "i");
        } catch (e) {
            throw createInputError(
                `The crib is not a valid regular expression: ${e.message}`,
                { argument: CRIB_ARG.name, patternLength: crib.length }
            );
        }
    }

    const buffer = input instanceof ArrayBuffer ?
        input :
        Uint8Array.from(Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8")).buffer;

    const magic = new MagicLib(buffer);
    // Argument order is NOT the ingredient order: the operation declares its args as
    // [depth, intensive, extLang, crib] but calls speculativeExecution(depth, extLang, intensive,
    // ...). Passing them in declaration order silently swaps two booleans -- brute-forcing when
    // asked for extra languages and vice versa, with no error either way.
    let candidates = await magic.speculativeExecution(depth, extLang, intensive, [], false, cribRegex);
    if (cribRegex) candidates = candidates.filter(option => option.matchesCrib);

    const inputEntropy = magic.calcEntropy();
    const detectedType = magic.detectFileType();

    return {
        input: {
            bytes: buffer.byteLength,
            entropy: Number(inputEntropy.toFixed(2)),
            entropyAssessment: describeEntropy(inputEntropy),
            // A free function over the buffer, not a method -- mirroring how `speculativeExecution`
            // itself derives the same field, so the input line and each candidate line agree.
            isUTF8: !!isUTF8(buffer),
            fileType: detectedType ? { mime: detectedType.mime, extension: detectedType.ext } : null
        },
        options: { depth, intensive, extLang, crib: crib || null },
        candidateCount: candidates.length,
        candidates: candidates.map(shapeCandidate)
    };
}

/**
 * Render a shaped Magic result as a plain-text report.
 *
 * This is what a client that reads only `content` receives, and what an assistant relays to a
 * person. It is written to be quotable near-verbatim: no markup, no table, every figure already
 * interpreted, and the executable recipe on its own labelled line so it can be copied without
 * being reconstructed.
 *
 * @param {Object} result - A result from `runMagic`.
 * @returns {string} The report.
 */
function renderMagicReport(result) {
    const { input, candidates, options } = result;
    const lines = [];

    const facts = [
        `${input.bytes} bytes`,
        `entropy ${input.entropy} (${input.entropyAssessment})`,
        input.isUTF8 ? "valid UTF-8" : "not valid UTF-8"
    ];
    if (input.fileType) facts.push(`file type ${input.fileType.mime} (.${input.fileType.extension})`);
    lines.push(`Input: ${facts.join(" | ")}`);

    if (candidates.length === 0) {
        lines.push("");
        lines.push(options.crib ?
            "No candidate decoding both matched the input and contained the crib. The crib may be " +
            "absent, or the encoding may need a greater depth or intensive mode." :
            "Magic found no candidate decoding. The data may already be plaintext, may use an " +
            "encoding Magic does not detect, or may be encrypted. Intensive mode brute-forces XOR, " +
            "bit rotations and character encodings if you want a deeper search.");
        return lines.join("\n");
    }

    lines.push("");
    lines.push(`${candidates.length} candidate decoding${candidates.length === 1 ? "" : "s"}, most likely first:`);

    for (const candidate of candidates) {
        const label = candidate.operations.length ?
            candidate.operations.join(" then ") :
            "(no operation -- the input as given)";
        lines.push("");
        lines.push(`${candidate.rank}. ${label}`);
        lines.push(`   Result:  ${candidate.preview}${candidate.previewTruncated ? " [truncated]" : ""}`);

        const signals = [];
        if (candidate.language) {
            // "estimated" is load-bearing, not hedging for its own sake: this line is relayed to a
            // person verbatim, and the bare form "language German" reads as a determination when
            // the underlying statistic is a byte-frequency guess that is sometimes plainly wrong.
            const alts = candidate.language.alternatives;
            signals.push(`estimated language ${candidate.language.name}` +
                (alts.length ? ` (or ${alts.join(", ")})` : ""));
        }
        if (candidate.fileType) signals.push(`file type ${candidate.fileType.mime} (.${candidate.fileType.extension})`);
        signals.push(candidate.isUTF8 ? "valid UTF-8" : "not valid UTF-8");
        if (candidate.entropy !== null) signals.push(`entropy ${candidate.entropy}`);
        if (candidate.usefulOperationDetected) signals.push("renders as something viewable, such as an image");
        if (candidate.matchingOperations.length) {
            signals.push(`further operations match: ${candidate.matchingOperations.join(", ")}`);
        }
        lines.push(`   Signals: ${signals.join(" | ")}`);

        if (candidate.recipe.length) {
            lines.push(`   Recipe:  ${JSON.stringify(candidate.recipe)}`);
        }
    }

    lines.push("");
    lines.push("To reproduce any of these, pass its Recipe value unchanged as the `recipe` argument " +
        "to cyberchef_bake, with the same input. The recipes above are already in the executable " +
        "form that tool expects.");

    const withLanguage = candidates.filter(c => c.language);
    if (withLanguage.length === 0) {
        lines.push("");
        lines.push("No language is reported above because the byte-frequency comparison was not " +
            "conclusive for any candidate. That is normal for short, binary or non-textual data, " +
            "and does not mean a candidate is wrong.");
    } else {
        lines.push("");
        lines.push("Any language above is an estimate from byte frequencies, not a determination, " +
            "and it is sometimes wrong even when it looks confident" +
            (withLanguage.some(c => c.language.shortSample) ?
                " -- particularly here, where at least one candidate is shorter than 64 bytes" : "") +
            ". Read the decoded result itself before repeating the language as fact.");
    }

    return lines.join("\n");
}

export { runMagic, renderMagicReport, describeEntropy, toPreview, likelyLanguage, shapeCandidate, DEFAULTS };
