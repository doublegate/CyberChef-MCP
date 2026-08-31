/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Prompts: the entry points a caller needs when facing 504 operations.
 *
 * WHY THIS EXISTS
 * ---------------
 * The tool surface answers "what can this server do". It does not answer "what should I do first",
 * and for this server that gap is unusually wide: 504 operations, most of which are only correct
 * for one specific kind of input, and no indication which combination solves a real task.
 *
 * A `tools/list` of 24 navigation tools is the right shape for a model that already knows it wants
 * to base64-decode something. It is the wrong shape for someone holding a suspicious blob who does
 * not yet know what it is -- the case this server is most useful for and worst at advertising.
 *
 * Prompts are MCP's answer to that: named, user-selectable workflows that a client surfaces as
 * slash commands or menu entries. Each one below encodes an actual analysis procedure -- the order
 * a practitioner would work in -- rather than a description of a tool.
 *
 * WHAT MAKES A GOOD PROMPT HERE
 * -----------------------------
 * Each of these was written from a real recipe pattern in the upstream corpus rather than invented,
 * so the sequence matches how the work is actually done: `Magic` before guessing, defang before
 * reporting an indicator, entropy before assuming a decode will help. A prompt that merely says
 * "use the cyberchef tools" would add nothing a tool description does not already say.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

/**
 * The prompt catalogue.
 *
 * `build` receives the caller's arguments and returns the user-message text. Kept as plain data so
 * `prompts/list` and `prompts/get` cannot disagree about which prompts exist.
 */
const PROMPTS = [
    {
        name: "analyse-unknown-data",
        title: "Analyse unknown data",
        description:
            "Identify what an unknown string or blob is, then decode it. Use this when you do " +
            "not yet know the encoding, cipher or file type.",
        arguments: [
            { name: "data", description: "The unknown data", required: true }
        ],
        /**
         * @param {Object} args - Prompt arguments.
         * @returns {string} The user message.
         */
        build: (args) => [
            "Identify and decode the following data.",
            "",
            "Work in this order, because guessing first wastes calls:",
            "1. `cyberchef_magic` with depth 3. It brute-forces candidate decodings and reports",
            "   entropy and matching operations, and it is the correct first move on anything",
            "   unidentified.",
            "2. If Magic reports a confident candidate, run it with `cyberchef_bake` and repeat",
            "   from step 1 on the result -- layered encoding is the norm, not the exception.",
            "3. If Magic finds nothing, check `Entropy` and `Detect File Type`. High entropy with",
            "   no file type usually means encryption or compression rather than an encoding.",
            "4. Report what the data turned out to be, the exact recipe that decoded it, and",
            "   anything notable in the result.",
            "",
            "Data:",
            "```",
            String(args?.data ?? ""),
            "```"
        ].join("\n")
    },
    {
        name: "extract-iocs",
        title: "Extract indicators of compromise",
        description:
            "Pull URLs, IP addresses, email addresses, domains and hashes out of a document, log " +
            "or script, and defang them for safe reporting.",
        arguments: [
            { name: "content", description: "The text to search", required: true }
        ],
        /**
         * @param {Object} args - Prompt arguments.
         * @returns {string} The user message.
         */
        build: (args) => [
            "Extract every indicator of compromise from the content below.",
            "",
            "1. Run `Extract URLs`, `Extract IP addresses`, `Extract email addresses` and",
            "   `Extract domains`. `cyberchef_batch` runs them in one call.",
            "2. If the content is obfuscated -- base64 blobs, charcode arrays, hex strings --",
            "   decode it FIRST and extract from the decoded form. Indicators are usually hidden",
            "   precisely where a plain extractor will not look.",
            "3. Defang everything you report with `Defang URL` / `Defang IP Addresses`. An",
            "   indicator pasted live into a ticket or chat is a clickable link to a malicious",
            "   host.",
            "4. Report indicators grouped by type, and say which were found only after decoding.",
            "",
            "Content:",
            "```",
            String(args?.content ?? ""),
            "```"
        ].join("\n")
    },
    {
        name: "deobfuscate-script",
        title: "Deobfuscate a script",
        description:
            "Unwrap an obfuscated PowerShell, JavaScript, VBScript or PHP payload layer by layer " +
            "and report what it does.",
        arguments: [
            { name: "script", description: "The obfuscated script", required: true }
        ],
        /**
         * @param {Object} args - Prompt arguments.
         * @returns {string} The user message.
         */
        build: (args) => [
            "Deobfuscate the script below and explain what it does.",
            "",
            "Layered obfuscation is the norm; expect to repeat these steps several times:",
            "1. Find the encoded payload with `Regular expression` -- typically a long base64,",
            "   hex or charcode run.",
            "2. Decode it. Common chains, in rough order of frequency:",
            "   - `From Base64` then `Decode text` with UTF-16LE, for PowerShell `-enc`;",
            "   - `From Base64` then `Raw Inflate` or `Gunzip`, for compressed droppers;",
            "   - `From Charcode`, for VBScript and JScript;",
            "   - `From Hex` then `XOR`, where a single-byte key is usual. `XOR Brute Force`",
            "     finds the key when it is not stated.",
            "3. Repeat on whatever comes out, until the result is readable code.",
            "4. Beautify with `Generic Code Beautify`, then extract and DEFANG any URLs.",
            "5. Report: what each layer was, the final payload's behaviour, and every indicator.",
            "",
            "Do not execute anything you recover. Describe it.",
            "",
            "Script:",
            "```",
            String(args?.script ?? ""),
            "```"
        ].join("\n")
    },
    {
        name: "identify-hash",
        title: "Identify a hash",
        description:
            "Work out which algorithm produced a hash, and what can be done with it.",
        arguments: [
            { name: "hash", description: "The hash value", required: true }
        ],
        /**
         * @param {Object} args - Prompt arguments.
         * @returns {string} The user message.
         */
        build: (args) => [
            "Identify the hash below.",
            "",
            "1. Run `Analyse hash`. It reports the candidate algorithms for the length and",
            "   character set.",
            "2. Narrow the candidates by context if there is any -- a 32-character hex string is",
            "   MD5, NTLM or LM, and which one depends entirely on where it came from.",
            "3. If you have a candidate plaintext, confirm it: `Generate all hashes` computes",
            "   every algorithm at once, so one call settles the question.",
            "",
            "Report the most likely algorithm, the alternatives you could not rule out, and what",
            "would distinguish them.",
            "",
            "Hash:",
            "```",
            String(args?.hash ?? ""),
            "```"
        ].join("\n")
    },
    {
        name: "decode-chain",
        title: "Decode a layered blob",
        description:
            "Walk a known chain of nested encodings, when you already know roughly what was done " +
            "to the data.",
        arguments: [
            { name: "data", description: "The encoded data", required: true },
            { name: "hint", description: "What you think was done to it", required: false }
        ],
        /**
         * @param {Object} args - Prompt arguments.
         * @returns {string} The user message.
         */
        build: (args) => {
            const hint = String(args?.hint ?? "").trim();
            return [
                "Decode the data below, unwrapping every layer.",
                "",
                hint ? `The caller believes: ${hint}` : "No hint was given about the encoding.",
                "",
                "Build the whole chain as ONE `cyberchef_bake` recipe once you know the steps --",
                "it is a single round trip rather than one per layer. `cyberchef_describe_operation`",
                "gives the exact argument names, which are not guessable: a wrong name is now",
                "rejected rather than silently ignored, so check before composing a long recipe.",
                "",
                "If a step fails, decode one layer at a time to find where the chain breaks.",
                "",
                "Data:",
                "```",
                String(args?.data ?? ""),
                "```"
            ].join("\n");
        }
    }
];

/**
 * The prompts, in the shape `prompts/list` returns.
 *
 * @returns {{prompts: Array<Object>}} The listing.
 */
export function listPrompts() {
    return {
        prompts: PROMPTS.map(({ name, title, description, arguments: args }) => ({
            name,
            title,
            description,
            arguments: args
        }))
    };
}

/**
 * One prompt, rendered with the caller's arguments.
 *
 * @param {string} name - Prompt name.
 * @param {Object} args - Prompt arguments.
 * @returns {Object} A `prompts/get` result.
 * @throws {Error} If the prompt does not exist, or a required argument is missing.
 */
export function getPrompt(name, args = {}) {
    const prompt = PROMPTS.find(p => p.name === name);
    if (!prompt) {
        const err = new Error(
            `Unknown prompt: ${name}. Available: ${PROMPTS.map(p => p.name).join(", ")}`);
        err.knownPrompts = PROMPTS.map(p => p.name);
        throw err;
    }

    // Checked here rather than left to the operation: a prompt rendered without its data is a
    // request to analyse nothing, and the failure would surface much later as a confusing answer
    // rather than as a missing argument.
    const missing = (prompt.arguments || [])
        .filter(a => a.required)
        .map(a => a.name)
        .filter(n => args[n] === undefined || args[n] === "");
    if (missing.length) {
        throw new Error(`Prompt "${name}" requires: ${missing.join(", ")}`);
    }

    return {
        description: prompt.description,
        messages: [{
            role: "user",
            content: { type: "text", text: prompt.build(args) }
        }]
    };
}
