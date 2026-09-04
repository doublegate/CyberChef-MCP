/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Answer the questions a CREDENTIAL DUMP raises, which identifying one hash at a time cannot.
 *
 * `cyberchef_hash_identify` takes one hash and names its format. That is the right shape for
 * "what is this", and the wrong shape for the questions somebody actually holding a dump has:
 *
 *   - How many accounts share a password? (identical digests, same salt or unsalted)
 *   - What is the WEAKEST algorithm in here, and how much of the file uses it?
 *   - Which entries are locked or passwordless rather than hashed at all?
 *   - Which are salted, and which fall to a rainbow table?
 *
 * None of those is a property of a single hash, so none of them can be answered by calling a
 * per-hash tool in a loop and reading the results one by one -- the answer is in the RELATIONSHIPS
 * between entries. That is what makes this a registry tool rather than an operation: an operation
 * transforms its input, and this one compares its input against itself.
 *
 * It parses the two shapes credentials actually arrive in -- bare hashes one per line, and
 * `/etc/shadow` or `user:hash` colon-separated records -- because requiring the caller to strip
 * fields first is asking them to do the parsing that makes the tool worth having.
 *
 * It NEVER cracks anything and never reaches the network. It reads structure.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";
import { FORMATS, BY_HEX_LENGTH } from "./hash-identify.mjs";

/** The NetNTLM patterns, by name, so this file cannot drift from `hash_identify`'s. */
const NETNTLM = FORMATS.filter(format => format.name.startsWith("NetNTLM"));

/** How many rounds of stretching a format applies by default, and what that buys. */
const STRENGTH = {
    "bcrypt": { rank: 5, why: "adaptive cost, memory-light but deliberately slow" },
    "argon2id": { rank: 6, why: "memory-hard, the current recommendation" },
    "argon2i": { rank: 5, why: "memory-hard" },
    "argon2d": { rank: 5, why: "memory-hard" },
    "yescrypt": { rank: 6, why: "memory-hard; the default on modern glibc systems" },
    "scrypt (crypt)": { rank: 6, why: "memory-hard" },
    "sha512crypt": { rank: 4, why: "5000 rounds by default; slow but not memory-hard" },
    "sha256crypt": { rank: 4, why: "5000 rounds by default" },
    "PHPass (WordPress, phpBB)": { rank: 3, why: "iterated MD5; weak by modern standards" },
    "md5crypt": { rank: 2, why: "1000 rounds of MD5; broken for anything but the longest passwords" },
    "Apache apr1": { rank: 2, why: "md5crypt under another name" },
    "MD5": { rank: 0, why: "unsalted single-round; rainbow tables cover the entire keyspace people use" },
    "NTLM": { rank: 0, why: "unsalted MD4; a GPU does the whole 8-character keyspace" },
    "SHA-1": { rank: 0, why: "unsalted single-round" },
    "SHA-256": { rank: 1, why: "unsalted single-round: fast is the problem, not the algorithm" },
    "SHA-512": { rank: 1, why: "unsalted single-round" },
    "LM (half)": { rank: 0, why: "LM: 7-character halves, uppercased. Trivially broken." }
};

/** Placeholders that mean "no password set" or "login disabled" rather than a hash. */
const NON_HASH = new Map([
    ["", "empty — no password required"],
    ["*", "login disabled (no password will ever match)"],
    ["!", "locked"],
    ["!!", "locked, password never set"],
    ["x", "shadowed — the hash is in /etc/shadow, not here"],
    ["*LK*", "locked (Solaris)"],
    ["NP", "no password (Solaris)"]
]);

const MAX_ENTRIES = 5000;

/**
 * @param {number} n - The count.
 * @param {string} one - Singular form.
 * @param {string} [many] - Plural form, when it is not `one + "s"`.
 * @returns {string} The form matching `n`.
 */
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/**
 * Split a corpus into candidate hashes, tolerating the shapes credentials arrive in.
 *
 * @param {string} text - The corpus.
 * @returns {Array<{line: number, user: string|null, value: string}>} One record per non-blank line.
 */
function parseCorpus(text) {
    const out = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i].trim();
        if (!raw || raw.startsWith("#")) continue;
        // NetNTLM is the exception and has to come first. A bare NetNTLMv1/v2 value is
        // `user::domain:challenge:response`, so the FIRST colon is not a user/hash separator and
        // the second field is empty -- which stored an empty value and made the tool report a
        // passwordless account for a perfectly good response hash.
        //
        // Matched by SHAPE, against the same patterns `hash_identify` uses, not by looking for
        // `::`. A disabled /etc/shadow line is `daemon:*:19000:0:99999:7:::` and a passwordless
        // one is `user::19000:0:...`; both contain `::`, and the first has it at the same position
        // a NetNTLM record does. Only the full pattern tells them apart.
        if (NETNTLM.some(format => format.pattern.test(raw))) {
            out.push({ line: i + 1, user: raw.slice(0, raw.indexOf(":")) || null, value: raw });
            continue;
        }

        // `user:hash:...` (shadow, passwd, or a two-field dump). A modular-crypt hash contains
        // `$` and no `:`, so splitting on the FIRST colon is safe for both shapes -- and the
        // fields after the hash in /etc/shadow are ageing metadata, not part of it.
        const colon = raw.indexOf(":");
        if (colon > 0) {
            const rest = raw.slice(colon + 1);
            const second = rest.indexOf(":");
            out.push({
                line: i + 1,
                user: raw.slice(0, colon),
                value: second >= 0 ? rest.slice(0, second) : rest
            });
        } else {
            out.push({ line: i + 1, user: null, value: raw });
        }
    }
    return out;
}

/**
 * Name the format of one value, reusing the identifier's tables so there is one source of truth.
 *
 * @param {string} value - A candidate hash.
 * @returns {{format: string, basis: string}} The format and how confidently it was reached.
 */
function classify(value) {
    if (NON_HASH.has(value)) return { format: `(${NON_HASH.get(value)})`, basis: "placeholder" };
    const structural = FORMATS.find(f => !f.weak && f.pattern.test(value));
    if (structural) return { format: structural.name, basis: "structure" };
    if (/^[0-9a-f]+$/i.test(value)) {
        const byLength = BY_HEX_LENGTH[value.length];
        if (byLength) return { format: byLength[0][0], basis: "length only" };
        return { format: `unknown (${value.length} hex characters)`, basis: "none" };
    }
    const weak = FORMATS.find(f => f.pattern.test(value));
    if (weak) return { format: weak.name, basis: "non-exclusive structure" };
    return { format: "unrecognised", basis: "none" };
}

export default {
    name: "hash_statistics",
    title: "Hash corpus statistics",
    category: "Analysis",
    description:
        "Analyse a set of password hashes as a SET: which formats appear and in what proportion, " +
        "which accounts share a password, which entries are locked or passwordless rather than " +
        "hashed, and which algorithm is the weakest link. Answers questions that are properties " +
        "of the corpus rather than of any single hash, so calling hash_identify in a loop cannot " +
        "produce them. Accepts bare hashes one per line or user:hash records including " +
        "/etc/shadow. Reads structure only — it never cracks anything and never reaches the network.",
    annotations: {
        title: "Hash corpus statistics",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        input: z.string().min(1).max(1048576)
            .describe(
                "The corpus: one hash per line, or user:hash records (/etc/shadow works as-is). " +
                "Blank lines and # comments are skipped. At most 1 MB."),
        "reveal_shared": z.boolean().default(true)
            .describe(
                "Report which accounts share a digest. The usernames are echoed back; set false " +
                "if the output is going somewhere the hashes should not.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} The corpus view.
     */
    async run(args) {
        const records = parseCorpus(args.input);
        if (!records.length) {
            throw createInputError(
                "No candidate hashes found: every line was blank or a comment.",
                { hint: "One hash per line, or user:hash records. /etc/shadow works as-is." });
        }
        if (records.length > MAX_ENTRIES) {
            throw createInputError(
                `${records.length} entries; this reads at most ${MAX_ENTRIES} in one call.`,
                {
                    entries: records.length,
                    maximum: MAX_ENTRIES,
                    hint: `Split the corpus and call again. The per-format counts add up across ` +
                        "calls; the shared-password analysis does NOT, because it depends on " +
                        "seeing every entry at once."
                });
        }

        const byFormat = new Map();
        const byDigest = new Map();
        let placeholders = 0;
        for (const record of records) {
            const { format, basis } = classify(record.value);
            if (!byFormat.has(format)) byFormat.set(format, { count: 0, basis });
            byFormat.get(format).count += 1;
            if (basis === "placeholder") {
                placeholders += 1;
                continue;
            }
            if (!byDigest.has(record.value)) byDigest.set(record.value, []);
            byDigest.get(record.value).push(record.user ?? `line ${record.line}`);
        }

        // Identical digests mean an identical password ONLY when the format is unsalted -- which
        // is exactly why it is worth reporting: a salted scheme makes this collision impossible,
        // so seeing it at all is a finding about the scheme as much as about the users.
        const shared = [...byDigest.entries()]
            .filter(([, who]) => who.length > 1)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([digest, who]) => ({
                accounts: who.length,
                ...(args.reveal_shared ? { who } : {}),
                format: classify(digest).format,
                digest: args.reveal_shared ? digest : `${digest.slice(0, 8)}...`
            }));

        const formats = [...byFormat.entries()]
            .map(([format, { count, basis }]) => ({
                format,
                count,
                share: `${((count / records.length) * 100).toFixed(1)}%`,
                basis,
                ...(STRENGTH[format] ? { strength: STRENGTH[format].why } : {})
            }))
            .sort((a, b) => b.count - a.count);

        const ranked = formats
            .filter(f => STRENGTH[f.format])
            .sort((a, b) => STRENGTH[a.format].rank - STRENGTH[b.format].rank);
        const weakest = ranked[0] ?? null;

        return {
            entries: records.length,
            "distinct_formats": byFormat.size,
            formats,
            placeholders,
            "shared_passwords": shared.length,
            "shared_detail": shared.slice(0, 20),
            ...(shared.length > 20 ? { "shared_truncated": shared.length - 20 } : {}),
            "weakest_format": weakest ?
                { format: weakest.format, count: weakest.count, why: STRENGTH[weakest.format].why } :
                null,
            assessment: [
                byFormat.size > 1 ?
                    `${byFormat.size} formats in one corpus, which usually means a migration that ` +
                    "was never finished: the old algorithm survives for everyone who has not logged " +
                    "in since." :
                    "One format throughout.",
                shared.length ?
                    `${shared.length} ${plural(shared.length, "digest")} ` +
                    `${plural(shared.length, "appears", "appear")} more than once. In an unsalted ` +
                    "format that is the same password; in a salted one it should be impossible, " +
                    "so check the salt." :
                    "No repeated digests.",
                placeholders ?
                    `${placeholders} ${plural(placeholders, "entry", "entries")} ` +
                    `${plural(placeholders, "is a placeholder", "are placeholders")} rather ` +
                    `than ${plural(placeholders, "a hash", "hashes")} — locked, empty, or ` +
                    "shadowed elsewhere." :
                    "No placeholder entries."
            ].join(" "),
            next: weakest && STRENGTH[weakest.format].rank <= 2 ?
                `Start with the ${weakest.count} ${weakest.format} entries: ` +
                `${STRENGTH[weakest.format].why}. cyberchef_hash_identify gives the hashcat mode.` :
                "No trivially weak format present. cyberchef_hash_identify gives per-hash detail."
        };
    }
};
