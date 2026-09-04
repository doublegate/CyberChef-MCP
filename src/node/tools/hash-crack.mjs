/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Recover the plaintext behind a fast unsalted hash, from a wordlist.
 *
 * `hash_identify` says what a hash is and `hash_statistics` says what a corpus of them shows. This
 * answers the next question, and it is the one an incident response actually turns on: is this
 * password one anybody would guess?
 *
 * **Scope, and the measurement behind it.** Pure-JS hashing is far faster than folklore assumes,
 * and the numbers set the boundary. Measured on Node 26.8.1 against a 9-byte candidate:
 *
 *     crypto.hash("md5", string, "hex")            3.08 M/s      <- the oneshot, Node 21+
 *     createHash("md5").update(string).digest()    1.26 M/s
 *     createHash("md5").update(buffer).digest()    0.50 M/s
 *     crypto-js MD5, pure JS                       0.37 M/s
 *
 * Two of those are counterintuitive and both shape the implementation. The oneshot is 6.2x the
 * streaming API for short inputs, because allocation dominates rather than the compression
 * function. And passing a STRING beats passing a Buffer by about 3x, so pre-converting a wordlist
 * to Buffers -- the obvious optimisation -- makes it slower.
 *
 * End to end this tool measures 1.26 M candidates/s against one MD5 target with mutations off, and
 * 1.20 M/s with them on. The gap between that and the 3.08 M/s microbenchmark is the loop around
 * the hash -- iteration, the mutation array, the map lookup -- and it is worth stating rather than
 * quoting the microbenchmark: the twenty-second budget buys about 24 million candidates, not 60.
 * A rockyou-scale list is roughly eleven seconds.
 *
 * That is why this covers fast unsalted digests and refuses bcrypt, scrypt, Argon2 and PBKDF2 by
 * name rather than attempting them. Those are deliberately slow, by factors of 10^4 to 10^6, and a
 * pure-JS attempt at one is a footgun that looks like a feature: it would run, report nothing, and
 * leave a caller believing the password survived a real attack.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createHash, hash as oneshot } from "node:crypto";
import { createInputError } from "../errors.mjs";

/** Wall-clock ceiling. Every operation tool is held to 30 seconds; this leaves room to report. */
const BUDGET_MS = 20000;

/** Largest wordlist accepted, in entries. */
const MAX_WORDS = 2000000;

/** Largest number of hashes attacked at once. */
const MAX_HASHES = 1000;

/** MD4's per-round (word index, rotate) schedules, RFC 1320 section 3.4. */
const MD4_ROUND_1 = [
    [0, 3], [1, 7], [2, 11], [3, 19], [4, 3], [5, 7], [6, 11], [7, 19],
    [8, 3], [9, 7], [10, 11], [11, 19], [12, 3], [13, 7], [14, 11], [15, 19]
];
const MD4_ROUND_2 = [
    [0, 3], [4, 5], [8, 9], [12, 13], [1, 3], [5, 5], [9, 9], [13, 13],
    [2, 3], [6, 5], [10, 9], [14, 13], [3, 3], [7, 5], [11, 9], [15, 13]
];
const MD4_ROUND_3 = [
    [0, 3], [8, 9], [4, 11], [12, 15], [2, 3], [10, 9], [6, 11], [14, 15],
    [1, 3], [9, 9], [5, 11], [13, 15], [3, 3], [11, 9], [7, 11], [15, 15]
];

/**
 * MD4, per RFC 1320, implemented here rather than taken from OpenSSL.
 *
 * `createHash("md4")` throws `ERR_OSSL_EVP_UNSUPPORTED` on any modern build: OpenSSL 3 moved MD4
 * to the legacy provider, which Node does not load. So a tool that wants NTLM either implements
 * MD4 or does not offer NTLM -- and NTLM is exactly the case worth having, because it is unsalted,
 * it is fast, and it is still what a Windows domain hands you.
 *
 * @param {Buffer} message - The bytes to hash.
 * @returns {string} The digest as lowercase hex.
 */
function md4(message) {
    const bitLength = message.length * 8;
    // 64-byte blocks with the RFC's padding: a 0x80 byte, zeros, then the length as 64-bit LE.
    const padded = Buffer.alloc(((message.length + 8) >> 6) * 64 + 64);
    message.copy(padded);
    padded[message.length] = 0x80;
    padded.writeUInt32LE(bitLength >>> 0, padded.length - 8);
    padded.writeUInt32LE(Math.floor(bitLength / 4294967296), padded.length - 4);

    const rol = (x, n) => (x << n) | (x >>> (32 - n));
    let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
    const x = new Int32Array(16);

    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i++) x[i] = padded.readInt32LE(offset + i * 4);
        let [a, b, c, d] = [a0, b0, c0, d0];

        // Round 1: F(x,y,z) = (x & y) | (~x & z), no additive constant.
        for (const [i, shift] of MD4_ROUND_1) {
            const value = (a + (((b & c) | (~b & d)) >>> 0) + x[i]) | 0;
            [a, b, c, d] = [d, rol(value, shift) | 0, b, c];
        }
        // Round 2: G(x,y,z) = (x & y) | (x & z) | (y & z), constant 0x5a827999.
        for (const [i, shift] of MD4_ROUND_2) {
            const value = (a + (((b & c) | (b & d) | (c & d)) >>> 0) + x[i] + 0x5a827999) | 0;
            [a, b, c, d] = [d, rol(value, shift) | 0, b, c];
        }
        // Round 3: H(x,y,z) = x ^ y ^ z, constant 0x6ed9eba1.
        for (const [i, shift] of MD4_ROUND_3) {
            const value = (a + ((b ^ c ^ d) >>> 0) + x[i] + 0x6ed9eba1) | 0;
            [a, b, c, d] = [d, rol(value, shift) | 0, b, c];
        }
        [a0, b0, c0, d0] = [(a0 + a) | 0, (b0 + b) | 0, (c0 + c) | 0, (d0 + d) | 0];
    }

    const out = Buffer.alloc(16);
    out.writeInt32LE(a0, 0);
    out.writeInt32LE(b0, 4);
    out.writeInt32LE(c0, 8);
    out.writeInt32LE(d0, 12);
    return out.toString("hex");
}

/**
 * The digests this will attempt, by hex length and name.
 *
 * NTLM is MD4 of the UTF-16LE password, which is why it carries both a transform and its own
 * digest function rather than just an algorithm name.
 */
const ALGORITHMS = {
    md5: { node: "md5", length: 32, encode: (word) => word },
    sha1: { node: "sha1", length: 40, encode: (word) => word },
    sha256: { node: "sha256", length: 64, encode: (word) => word },
    sha384: { node: "sha384", length: 96, encode: (word) => word },
    sha512: { node: "sha512", length: 128, encode: (word) => word },
    ntlm: { node: null, length: 32, encode: (word) => Buffer.from(word, "utf16le"), digest: md4 }
};

/**
 * Hashes this deliberately refuses, and what to use instead.
 *
 * Named individually rather than rejected as "unsupported", because the useful information is that
 * the hash is doing its job -- a caller who gets "unsupported" tries another tool, and a caller who
 * gets this stops.
 */
const REFUSED = {
    "$2": "bcrypt", "$2a$": "bcrypt", "$2b$": "bcrypt", "$2y$": "bcrypt",
    "$argon2": "Argon2", "$scrypt$": "scrypt", "$7$": "scrypt", "$y$": "yescrypt",
    "$5$": "SHA-256 crypt", "$6$": "SHA-512 crypt", "$1$": "MD5 crypt", "$pbkdf2": "PBKDF2"
};

/**
 * Passwords worth trying before any wordlist.
 *
 * Small on purpose. Its job is to answer "is this one of the handful everybody uses" in the first
 * millisecond; anything larger is the caller's `wordlist` to supply, because bundling a real one
 * would put megabytes into an image for a case the caller can serve better.
 */
const COMMON = [
    "123456", "password", "12345678", "qwerty", "123456789", "12345", "1234", "111111",
    "1234567", "dragon", "123123", "baseball", "abc123", "football", "monkey", "letmein",
    "shadow", "master", "666666", "qwertyuiop", "123321", "mustang", "1234567890",
    "michael", "654321", "superman", "1qaz2wsx", "7777777", "121212", "000000",
    "passw0rd", "admin", "root", "toor", "welcome", "login", "guest", "test", "changeme",
    "P@ssw0rd", "Password1", "iloveyou", "sunshine", "princess", "trustno1", "hunter2"
];

/**
 * Mutations applied to each candidate.
 *
 * The cheap rules, and only those. A full rule engine belongs in hashcat; what earns its place in a
 * tool with a twenty-second budget is the handful that convert a dictionary word into the form a
 * password policy forced a human to type.
 *
 * @param {string} word - The base candidate.
 * @param {boolean} enabled - Whether mutations are on.
 * @returns {string[]} The candidate and its mutations.
 */
function mutate(word, enabled) {
    if (!enabled) return [word];
    const out = [word];
    const capital = word.charAt(0).toUpperCase() + word.slice(1);
    if (capital !== word) out.push(capital);
    out.push(word.toUpperCase());
    for (const suffix of ["1", "123", "!", "12", "2024", "2025", "2026", "1!"]) {
        out.push(word + suffix);
        if (capital !== word) out.push(capital + suffix);
    }
    const leet = word.replace(/a/gi, "4").replace(/e/gi, "3").replace(/o/gi, "0").replace(/i/gi, "1");
    if (leet !== word) out.push(leet);
    return out;
}

export default {
    name: "hash_crack",
    title: "Crack a fast unsalted hash",
    category: "Analysis",
    description:
        "Recover the plaintext behind a fast unsalted hash from a wordlist: MD5, SHA-1, " +
        "SHA-256/384/512 and NTLM. Follows `hash_identify` with the question that matters — is " +
        "this password one anybody would guess? Deliberately REFUSES bcrypt, scrypt, Argon2, " +
        "yescrypt and the crypt(3) family BY NAME rather than attempting them, because a pure-JS " +
        "attempt would find nothing and imply the password was strong. Supply a wordlist; a small " +
        "common-password list and cheap mutations are built in. Bounded to 20 seconds, about 24 " +
        "million candidates.",
    annotations: {
        title: "Crack a fast unsalted hash",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        hashes: z.array(z.string().min(1).max(256)).min(1).max(MAX_HASHES)
            .describe("The hashes, as hex. Several share one pass over the wordlist."),
        algorithm: z.enum(["auto", ...Object.keys(ALGORITHMS)]).default("auto")
            .describe(
                "Which digest. `auto` infers it from the hex length and tries every candidate " +
                "when that is ambiguous, as it is at 32 characters."),
        wordlist: z.array(z.string().max(256)).max(MAX_WORDS).optional()
            .describe("Candidates to try, in order. The built-in common list runs first."),
        mutations: z.boolean().default(true)
            .describe("Capitalise, uppercase, append a digit or year, leetspeak. About 20x the search."),
        "include_common": z.boolean().default(true)
            .describe("Try the built-in list of the most-used passwords first.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} What was recovered, what was refused, and what the budget stopped.
     */
    async run(args) {
        const refused = [];
        const targets = [];
        for (const raw of args.hashes) {
            const value = raw.trim();
            const prefix = Object.keys(REFUSED).find(p => value.startsWith(p));
            if (prefix) {
                refused.push({ hash: value.slice(0, 32), scheme: REFUSED[prefix] });
                continue;
            }
            if (!/^[0-9a-f]+$/i.test(value)) {
                throw createInputError(
                    `"${value.slice(0, 40)}" is not hex and is not a recognised crypt(3) prefix.`,
                    { received: value.slice(0, 40), accepted: "hex digests, or a $-prefixed MCF string" });
            }
            targets.push(value.toLowerCase());
        }

        if (!targets.length) {
            return {
                cracked: [],
                refused,
                "candidates_tried": 0,
                assessment: refused.length ?
                    "Every hash here uses a deliberately slow scheme: " +
                    `${[...new Set(refused.map(r => r.scheme))].join(", ")}. Those are working as ` +
                    "intended. A pure-JS attempt would find nothing and tell you nothing, so it is " +
                    "refused rather than attempted." :
                    "No hashes to work on.",
                next: "For a slow scheme use hashcat or John the Ripper with a GPU, and budget hours " +
                    "rather than seconds."
            };
        }

        // Which algorithms to run. `auto` at 32 hex characters is genuinely ambiguous between MD5
        // and NTLM and no amount of looking at the string resolves it, so both are tried -- which
        // costs one extra pass and removes a guess the caller would otherwise have to make.
        const chosen = args.algorithm === "auto" ?
            Object.entries(ALGORITHMS).filter(([, spec]) => targets.some(t => t.length === spec.length)) :
            [[args.algorithm, ALGORITHMS[args.algorithm]]];
        if (!chosen.length) {
            throw createInputError(
                `No supported digest has a ${targets[0].length}-character hex form.`,
                { length: targets[0].length, supported: Object.keys(ALGORITHMS).join(", ") });
        }

        // EVERY target must match a chosen algorithm's length, not just one of them. `some` above
        // selected MD5 for `["abcdef", "<a real MD5>"]` and then reported `abcdef` as UNCRACKED --
        // which reads as "the password survived the search" for a string that was never hashed by
        // anything the search ran. Not cracking something and not being able to try are different
        // answers, and only one of them says anything about the password.
        const lengths = new Set(chosen.map(([, spec]) => spec.length));
        const unusable = targets.filter(target => !lengths.has(target.length));
        if (unusable.length) {
            throw createInputError(
                `${unusable.length} of ${targets.length} hashes have a length no selected digest ` +
                `produces: ${[...new Set(unusable.map(t => t.length))].join(", ")} characters.`,
                {
                    rejected: unusable.slice(0, 5).map(t => t.slice(0, 24)),
                    selected: chosen.map(([name]) => name).join(", "),
                    hint: "Split the batch by digest, or set `algorithm` explicitly. An unsupported " +
                        "hash reported as uncracked would read as a password that survived a search " +
                        "it was never part of."
                });
        }

        const wanted = new Map();
        for (const target of targets) wanted.set(target, null);
        const deadline = Date.now() + BUDGET_MS;
        let tried = 0;
        let exhausted = true;

        const base = [
            ...(args.include_common ? COMMON : []),
            ...(args.wordlist ?? [])
        ];

        outer:
        for (const word of base) {
            for (const candidate of mutate(word, args.mutations)) {
                // Checked per candidate rather than per word: with mutations on, one word is about
                // twenty hashes, and a per-word check can overshoot the budget by that much.
                if ((tried & 0x3ff) === 0 && Date.now() > deadline) {
                    exhausted = false;
                    break outer;
                }
                tried++;
                for (const [name, spec] of chosen) {
                    const input = spec.encode(candidate);
                    // The oneshot, not createHash().update().digest(). 6.2x for short inputs,
                    // because allocation dominates rather than the compression function -- and
                    // `oneshot` is unavailable before Node 21, hence the fallback.
                    const digest = spec.digest ? spec.digest(input) :
                        oneshot ? oneshot(spec.node, input, "hex") :
                            createHash(spec.node).update(input).digest("hex");
                    if (wanted.has(digest) && wanted.get(digest) === null) {
                        wanted.set(digest, { plaintext: candidate, algorithm: name });
                    }
                }
                if ([...wanted.values()].every(v => v !== null)) {
                    exhausted = true;
                    break outer;
                }
            }
        }

        const cracked = [...wanted.entries()]
            .filter(([, found]) => found !== null)
            .map(([hash, found]) => ({ hash, ...found }));
        const uncracked = [...wanted.entries()].filter(([, found]) => found === null).map(([hash]) => hash);

        return {
            cracked,
            uncracked,
            ...(refused.length ? { refused } : {}),
            "candidates_tried": tried,
            "algorithms_tried": chosen.map(([name]) => name),
            "wordlist_exhausted": exhausted,
            ...(exhausted ? {} : {
                "budget_note": `The ${BUDGET_MS / 1000}-second budget stopped the search after ` +
                    `${tried} candidates. The wordlist was not finished, so an uncracked hash here ` +
                    "has not been ruled out."
            }),
            assessment: cracked.length ?
                `${cracked.length} of ${targets.length} recovered. Every one of these was in a list ` +
                "anybody can download, so treat the accounts as compromised rather than as " +
                "needing a password change." :
                exhausted ?
                    "Nothing matched the candidates tried. That rules out this wordlist and these " +
                    "mutations — not the password. An unsalted fast hash is a storage defect " +
                    "regardless of whether the password behind it is strong." :
                    "The budget ran out before the wordlist did, so nothing is ruled out.",
            next: cracked.length && args.hashes.length > 1 ?
                "Run hash_statistics over the whole set to see whether the recovered passwords are " +
                "shared between accounts." :
                "For a full wordlist run use hashcat or John the Ripper; this is bounded to seconds " +
                "on one core, and is meant to answer the cheap question first."
        };
    }
};
