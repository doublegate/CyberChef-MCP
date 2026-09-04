/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Identify a password hash by its STRUCTURE, not only by its length.
 *
 * CyberChef's `Analyse hash` measures a hex string and lists the algorithms that produce a digest
 * of that size. That is the right answer for a bare digest and no answer at all for the formats
 * people actually hold. Measured against it:
 *
 *     $2y$10$N9qo8uLOickgx2ZMRZoMye...   -> "Invalid hash"     (bcrypt)
 *     $6$rounds=5000$usesomesillystri$   -> "Invalid hash"     (sha512crypt)
 *     $argon2id$v=19$m=65536,t=3,p=4$    -> "Invalid hash"     (argon2id)
 *
 * Those three are among the most common hashes in a real credential dump, and the tool that is
 * supposed to identify them rejects them as malformed. This recognises the encoding: modular crypt,
 * LDAP, application-specific and vendor formats first, falling back to length only when there is no
 * structure to read.
 *
 * It reports the **hashcat mode** and **John format name** alongside each match, because
 * "this is bcrypt" is rarely the end of the question -- the next step is a cracking tool that wants
 * a mode number.
 *
 * Format signatures are derived from the public format documentation of John the Ripper (GPLv2+,
 * usable here under GPLv3) and hashcat's example-hashes list; see THIRD-PARTY-NOTICES.md.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";

/**
 * Structured formats, most specific first.
 *
 * Order matters: `$2y$` must be tested before a generic `$...$` shape, and yescrypt's `$y$` before
 * anything that merely starts with a dollar. A later entry never shadows an earlier one.
 *
 * @type {Array<{name: string, pattern: RegExp, hashcat: number|null, john: string|null, note?: string}>}
 */
export const FORMATS = [
    // --- modular crypt format -----------------------------------------------------------------
    { name: "bcrypt", pattern: /^\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}$/, hashcat: 3200, john: "bcrypt",
        note: "Cost is the number after the second $: 10 means 2^10 rounds." },
    { name: "sha512crypt", pattern: /^\$6\$(rounds=\d+\$)?[^$]{1,16}\$[./A-Za-z0-9]{86}$/, hashcat: 1800, john: "sha512crypt",
        note: "Linux /etc/shadow default on most modern distributions." },
    { name: "sha256crypt", pattern: /^\$5\$(rounds=\d+\$)?[^$]{1,16}\$[./A-Za-z0-9]{43}$/, hashcat: 7400, john: "sha256crypt" },
    { name: "md5crypt", pattern: /^\$1\$[^$]{1,8}\$[./A-Za-z0-9]{22}$/, hashcat: 500, john: "md5crypt",
        note: "Also Cisco IOS type 5." },
    { name: "Apache apr1", pattern: /^\$apr1\$[^$]{1,8}\$[./A-Za-z0-9]{22}$/, hashcat: 1600, john: "md5crypt-apache" },
    { name: "yescrypt", pattern: /^\$y\$[^$]+\$[^$]+\$[./A-Za-z0-9]+$/, hashcat: null, john: null,
        note: "Default on recent Debian and Fedora. Not supported by hashcat as of writing." },
    { name: "scrypt (crypt)", pattern: /^\$7\$[^$]+\$[^$]+$/, hashcat: 8900, john: "scrypt" },
    { name: "argon2i", pattern: /^\$argon2i\$v=\d+\$m=\d+,t=\d+,p=\d+\$[^$]+\$[^$]+$/, hashcat: 34000, john: "argon2" },
    { name: "argon2d", pattern: /^\$argon2d\$v=\d+\$m=\d+,t=\d+,p=\d+\$[^$]+\$[^$]+$/, hashcat: null, john: "argon2" },
    { name: "argon2id", pattern: /^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$[^$]+\$[^$]+$/, hashcat: 34000, john: "argon2",
        note: "The recommended choice for new systems (OWASP)." },
    { name: "PHPass (WordPress, phpBB)", pattern: /^\$[PH]\$[./A-Za-z0-9]{31}$/, hashcat: 400, john: "phpass",
        note: "WordPress uses $P$; phpBB3 uses $H$." },
    { name: "Drupal 7", pattern: /^\$S\$[./A-Za-z0-9]{52}$/, hashcat: 7900, john: "drupal7" },
    { name: "PBKDF2-HMAC-SHA256 (crypt)", pattern: /^\$pbkdf2-sha256\$\d+\$[^$]+\$[^$]+$/, hashcat: 10900, john: "pbkdf2-hmac-sha256" },
    { name: "PBKDF2-HMAC-SHA512 (crypt)", pattern: /^\$pbkdf2-sha512\$\d+\$[^$]+\$[^$]+$/, hashcat: 12100, john: "pbkdf2-hmac-sha512" },
    { name: "Cisco IOS type 8 (PBKDF2-SHA256)", pattern: /^\$8\$[./A-Za-z0-9]{14}\$[./A-Za-z0-9]{43}$/, hashcat: 9200, john: "cisco8" },
    { name: "Cisco IOS type 9 (scrypt)", pattern: /^\$9\$[./A-Za-z0-9]{14}\$[./A-Za-z0-9]{43}$/, hashcat: 9300, john: "cisco9" },

    // --- application formats ------------------------------------------------------------------
    { name: "Django PBKDF2-SHA256", pattern: /^pbkdf2_sha256\$\d+\$[^$]+\$[A-Za-z0-9+/=]+$/, hashcat: 10000, john: "django" },
    { name: "LDAP SSHA (salted SHA-1)", pattern: /^\{SSHA\}[A-Za-z0-9+/=]{20,}$/, hashcat: 111, john: "salted-sha1" },
    { name: "LDAP SHA-1", pattern: /^\{SHA\}[A-Za-z0-9+/=]{28}$/, hashcat: 101, john: "nsldap" },
    { name: "LDAP SSHA-256", pattern: /^\{SSHA256\}[A-Za-z0-9+/=]{40,}$/, hashcat: 1411, john: null },
    { name: "LDAP MD5", pattern: /^\{MD5\}[A-Za-z0-9+/=]{24}$/, hashcat: 1600, john: null },
    { name: "MySQL 4.1+ (SHA-1 twice)", pattern: /^\*[0-9A-F]{40}$/i, hashcat: 300, john: "mysql-sha1",
        note: "The leading asterisk is part of the stored value." },
    { name: "JWT", pattern: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/, hashcat: 16500, john: null,
        note: "Not a password hash. Decode it with cyberchef_bake and the JWT Decode operation; " +
              "the signature is what a cracking tool would attack." },
    { name: "NetNTLMv2", pattern: /^[^:]+::[^:]*:[0-9a-f]{16}:[0-9a-f]{32}:[0-9a-f]+$/i, hashcat: 5600, john: "netntlmv2",
        note: "A captured challenge-response, not a stored hash." },
    { name: "NetNTLMv1", pattern: /^[^:]+::[^:]*:[0-9a-f]{48}:[0-9a-f]{48}:[0-9a-f]{16}$/i, hashcat: 5500, john: "netntlm" },
    { name: "/etc/shadow line", pattern: /^[^:]+:\$[^:]+:\d*:/, hashcat: null, john: null,
        note: "A whole shadow line. Pass just the hash field (between the first and second colon)." },
    // `weak` marks a pattern that matches things it does not own. This one is two decimal digits
    // followed by hex, which every hex digest beginning "01".."99" also satisfies:
    // 0123456789abcdef0123456789abcdef is a perfectly ordinary MD5-length digest. Treating that as
    // a definitive structural hit suppressed the length candidates entirely and reported
    // "Identified by structure, so this is reliable" for a value that is almost certainly an MD5 --
    // the exact confident-wrong-answer this tool exists to avoid.
    { name: "Cisco IOS type 7 (reversible)", pattern: /^[0-9]{2}[0-9A-F]{4,}$/i, hashcat: null,
        john: null, weak: true,
        note: "NOT a hash: a reversible obfuscation. Decode it rather than cracking it." }
];

/** Bare digests, by hex length. Ambiguous by construction, so all plausible answers are listed. */
export const BY_HEX_LENGTH = {
    8: [["CRC-32", null, null]],
    16: [["MySQL 3.23 (pre-4.1)", 200, "mysql"], ["DES (tripcode)", null, null]],
    32: [["MD5", 0, "raw-md5"], ["NTLM", 1000, "nt"], ["MD4", 900, "raw-md4"],
         ["LM (half)", 3000, "lm"], ["RIPEMD-128", null, null]],
    40: [["SHA-1", 100, "raw-sha1"], ["RIPEMD-160", 6000, "ripemd-160"], ["MySQL 4.1+ (no asterisk)", 300, "mysql-sha1"]],
    56: [["SHA-224", 1300, "raw-sha224"], ["SHA3-224", 17300, null]],
    64: [["SHA-256", 1400, "raw-sha256"], ["SHA3-256", 17400, null], ["BLAKE2s-256", null, null],
         ["Keccak-256", 17800, null], ["GOST R 34.11-94", 6900, "gost"]],
    96: [["SHA-384", 10800, "raw-sha384"], ["SHA3-384", 17500, null]],
    128: [["SHA-512", 1700, "raw-sha512"], ["SHA3-512", 17600, null], ["BLAKE2b-512", 600, "raw-blake2"],
          ["Whirlpool", 6100, "whirlpool"]]
};

export default {
    name: "hash_identify",
    title: "Identify hash",
    category: "Analysis",
    description:
        "Identify a password hash by its structure — bcrypt, sha512crypt, argon2, PHPass, Django, " +
        "LDAP, MySQL, NetNTLM and others — and report the hashcat mode and John format name for " +
        "each match. Falls back to length-based candidates for a bare digest. Use this before " +
        "trying to crack something: CyberChef's Analyse hash operation reads hex length only and " +
        "reports \"Invalid hash\" for bcrypt, sha512crypt and argon2.",
    annotations: {
        title: "Identify hash",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        // Bounded on domain grounds rather than performance: matching is a list of anchored
        // regexes over single character classes, so it is linear -- 8 MB of junk costs 56 ms, and
        // there is no backtracking to exploit. But no hash is 8 MB. The longest format here is a
        // NetNTLMv2 line at a few hundred characters, so past 4 KB it is not a hash, and accepting
        // it only invites someone to find out what else is linear.
        input: z.string().min(1).max(4096)
            .describe("The hash, one per call. Whitespace is trimmed.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} Candidate formats, most specific first.
     */
    async run(args) {
        const hash = args.input.trim();
        if (!hash) throw createInputError("Empty input: supply a hash.", {});

        const hit = FORMATS.filter(f => f.pattern.test(hash));
        const matches = hit.map(f => ({
            format: f.name,
            confidence: f.weak ? "structural, but not exclusive" : "structural",
            "hashcat_mode": f.hashcat,
            "john_format": f.john,
            ...(f.note ? { note: f.note } : {})
        }));
        // A structural match is only decisive if it is exclusive. Every match being `weak` means
        // the pattern is satisfied by values it does not own, so the length candidates have to
        // stand beside it rather than be suppressed by it.
        const decisive = hit.some(f => !f.weak);

        // Length-based candidates when nothing decisive matched. Offering both unconditionally
        // would bury a definite answer under five guesses, which is the failure this tool exists
        // to correct -- but suppressing them behind a non-exclusive match is the same failure
        // wearing the opposite sign.
        let byLength = [];
        if (!decisive && /^[0-9a-f]+$/i.test(hash)) {
            byLength = (BY_HEX_LENGTH[hash.length] || []).map(([name, hashcat, john]) => ({
                format: name,
                confidence: "length only",
                "hashcat_mode": hashcat,
                "john_format": john
            }));
        }

        const all = [...matches, ...byLength];
        if (!all.length) {
            return {
                identified: false,
                "input_length": hash.length,
                candidates: [],
                note: /^[0-9a-f]+$/i.test(hash) ?
                    `A ${hash.length}-character hex string matches no digest length this tool knows. ` +
                    "It may be truncated, or not a hash at all." :
                    "No structural format matched and the input is not plain hex. If it is encoded, " +
                    "try cyberchef_magic to identify the encoding first."
            };
        }

        return {
            identified: true,
            candidates: all,
            "most_likely": all[0],
            ambiguous: all.length > 1,
            note: decisive ?
                "Identified by structure, so this is reliable." :
                matches.length && byLength.length ?
                    `A structural pattern matched (${matches[0].format}), but it is not exclusive — ` +
                    `a ${hash.length}-character hex string satisfies it by coincidence. The ` +
                    "length-based candidates are listed alongside it, and context decides." :
                    "Identified by digest length ALONE, which cannot distinguish these — MD5 and NTLM " +
                "are both 32 hex characters. Context decides: an NTLM hash comes from Windows, an " +
                "MD5 from almost anywhere.",
            next: all[0].hashcat_mode !== null && all[0].hashcat_mode !== undefined ?
                `hashcat -m ${all[0].hashcat_mode}` :
                "No hashcat mode is known for the most likely format."
        };
    }
};
