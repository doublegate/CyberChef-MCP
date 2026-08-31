/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Choosing which CyberChef operations appear as their own tool.
 *
 * THE PROBLEM THIS SOLVES
 * ----------------------
 * `tools/list` is sent to the model on every request, before the user has typed anything. With all
 * 504 operations exposed it is roughly **86,000 tokens** -- measured, not estimated, on the
 * serialised payload. For comparison, published guidance puts model tool-selection quality as
 * degrading past about fifty tool definitions, and this server offers ten times that.
 *
 * That cost was HIDDEN until v2.1.0. Every `inputSchema` was an empty envelope, because
 * `zod-to-json-schema` fails silently against Zod 4, so the payload measured ~52,000 tokens while
 * describing nothing. Fixing the schemas made the tools usable and the true price visible at once.
 *
 * WHY CURATING COSTS NO CAPABILITY
 * --------------------------------
 * `cyberchef_bake` invokes ANY of the 504 operations by name, and `cyberchef_search` finds the
 * name. So a smaller default surface removes nothing a caller can do -- it only stops pre-loading
 * schemas for operations this session will never touch. That pairing is what makes the trade
 * one-sided, and it is why the curated set below is small without being limiting.
 *
 * THE DEFAULT IS "index" -- see lib/tool-catalog.mjs for how the hierarchy works
 * ------------------------------------------------------------------------------
 * Measured on this server: `all` is 524 tools and ~86,000 tokens; `curated` is 99 tools and
 * ~16,600 tokens. An 81% reduction, for no loss of reach.
 *
 * This IS a visible change: a client that hard-codes a tool name outside the curated set -- say
 * `cyberchef_to_morse_code` -- will no longer find it in `tools/list`. Two ways back, both one
 * line: set `CYBERCHEF_TOOL_SURFACE=all` to restore every tool, or call the operation through
 * `cyberchef_bake`, which never stopped working. It is called out in the release notes rather
 * than left to be discovered.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

/**
 * Operations exposed as individual tools in `curated` mode.
 *
 * Chosen for what an analyst or an agent actually reaches for first: the encodings and hashes that
 * appear in nearly every workflow, the compression and crypto primitives, the extractors, and the
 * detection operations that answer "what IS this?". Everything else stays one `cyberchef_bake`
 * call away.
 *
 * Names are CyberChef operation names, matched exactly against OperationConfig.
 */
export const CURATED_OPERATIONS = [
    // Detection and triage -- the first move on unknown data.
    "Magic", "Detect File Type", "Entropy", "Frequency distribution",

    // Encodings, both directions.
    "To Base64", "From Base64", "To Hex", "From Hex", "To Decimal", "From Decimal",
    "To Binary", "From Binary", "URL Encode", "URL Decode", "To Charcode", "From Charcode",
    "To Base32", "From Base32", "To Base58", "From Base58", "To Base85", "From Base85",
    "To Quoted Printable", "From Quoted Printable", "Escape Unicode Characters",

    // Hashing and checksums.
    "MD5", "SHA1", "SHA2", "SHA3", "Generate all hashes", "CRC-32 Checksum", "HMAC",
    "Bcrypt", "Bcrypt Compare",

    // Symmetric crypto and key derivation.
    "AES Encrypt", "AES Decrypt", "DES Encrypt", "DES Decrypt",
    "Triple DES Encrypt", "Triple DES Decrypt",
    "Derive PBKDF2 key", "Derive EVP key", "XOR", "XOR Brute Force",

    // Tokens and certificates.
    "JWT Decode", "JWT Sign", "JWT Verify", "Parse X.509 certificate",

    // Compression.
    "Gzip", "Gunzip", "Zlib Deflate", "Zlib Inflate", "Raw Deflate", "Raw Inflate",
    "Unzip", "Zip",

    // Text, structure and extraction.
    "Regular expression", "Find / Replace", "Extract URLs", "Extract IP addresses",
    "Extract email addresses", "Extract domains", "Extract file paths", "Strings",
    "JSON Beautify", "JSON Minify", "XML Beautify", "CSV to JSON", "JSON to CSV",
    "Remove null bytes", "Take bytes", "Drop bytes",

    // Classic ciphers people genuinely ask for by name.
    "ROT13", "Atbash Cipher", "Vigenère Decode", "Vigenère Encode",

    // Dates and numbers.
    "From UNIX Timestamp", "To UNIX Timestamp", "Parse DateTime",
    "Parse URI", "Parse User Agent"
];

/**
 * Operations exposed as a tool in EVERY mode, including `index`.
 *
 * Exactly one, and the argument for it is specific rather than a matter of taste.
 *
 * `Magic` is the entry point to this whole server: given an unknown blob, brute-forcing candidate
 * decodings is the correct first move, and it is what a model reaches for before it knows enough
 * to navigate anywhere. Requiring `cyberchef_categories` -> `cyberchef_list_operations` ->
 * `cyberchef_describe_operation` to reach the tool you need *in order to find out what you are
 * looking at* inverts the cost: three round trips for the one operation whose entire purpose is to
 * answer the first question.
 *
 * It is also nearly free. Magic has four arguments, so its schema is a few hundred bytes against
 * an index measured in kilobytes -- well under a percent, for the most likely first call.
 *
 * The bar for adding a second entry here is high: it must be something a caller needs BEFORE it
 * knows what it is dealing with. `Detect File Type` and `Entropy` are close, and are deliberately
 * left out -- Magic already reports entropy and file-type candidates in its results, and both stay
 * one `cyberchef_bake` call away.
 */
const ALWAYS_EXPOSED = new Set(["Magic"]);

/** Membership lookup for the curated list, built once. */
const CURATED_SET = new Set(CURATED_OPERATIONS);

/**
 * Read the configured surface mode.
 *
 * @returns {"all"|"curated"} The mode, defaulting to "all".
 */
export function surfaceMode() {
    // CYBERCHEF_EXPOSE_ALL_OPS is honoured in both directions, because the v2.0.0 planning
    // documents named it as the way to get every operation and someone may already have set it.
    const legacy = process.env.CYBERCHEF_EXPOSE_ALL_OPS;
    if (legacy === "true") return "all";
    if (legacy === "false") return "curated";

    const mode = process.env.CYBERCHEF_TOOL_SURFACE;
    return ["all", "curated", "index"].includes(mode) ? mode : "index";
}

/**
 * The explicit allowlist, if one is configured.
 *
 * Takes precedence over the mode: someone who has named the operations they want has been more
 * specific than someone who picked a preset, and silently unioning the two would give them tools
 * they did not ask for.
 *
 * @returns {Set<string>|null} Operation names, or null when unset.
 */
export function configuredAllowlist() {
    const raw = process.env.CYBERCHEF_TOOL_ALLOWLIST;
    if (!raw) return null;
    const names = raw.split(",").map(n => n.trim()).filter(Boolean);
    return names.length ? new Set(names) : null;
}

/**
 * Should this operation be exposed as its own tool?
 *
 * @param {string} opName - The CyberChef operation name.
 * @returns {boolean} Whether to generate a tool for it.
 */
export function isExposed(opName) {
    const allowlist = configuredAllowlist();
    if (allowlist) return allowlist.has(opName);

    const mode = surfaceMode();
    if (mode === "all") return true;
    if (ALWAYS_EXPOSED.has(opName)) return true;
    if (mode === "index") return false;   // navigation tools only; nothing else is pre-loaded
    return CURATED_SET.has(opName);
}

/**
 * A one-line summary of the active surface, for the startup log.
 *
 * Logged rather than left implicit because "why can the model not see this tool" is otherwise a
 * confusing question to debug from the client side.
 *
 * @param {number} exposed - How many operation tools were generated.
 * @param {number} total - How many operations exist.
 * @returns {string} Human-readable description.
 */
export function describeSurface(exposed, total) {
    if (configuredAllowlist()) {
        return `tool surface: allowlist (${exposed}/${total} operations, CYBERCHEF_TOOL_ALLOWLIST)`;
    }
    const mode = surfaceMode();
    if (mode === "index") {
        return `tool surface: index (${exposed}/${total} operations pre-loaded; browse with ` +
            "cyberchef_categories -> cyberchef_list_operations -> cyberchef_describe_operation, " +
            "run anything with cyberchef_bake. CYBERCHEF_TOOL_SURFACE=curated|all to pre-load)";
    }
    if (mode === "curated") {
        return `tool surface: curated (${exposed}/${total} operations; the rest remain reachable ` +
            "via cyberchef_bake -- set CYBERCHEF_TOOL_SURFACE=all to expose every one as a tool)";
    }
    return `tool surface: all (${exposed}/${total} operations; ~86k tokens per tools/list)`;
}
