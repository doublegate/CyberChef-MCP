/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Everything wrong with a JWT that can be established from the token alone.
 *
 * CyberChef has `JWT Decode`, `JWT Verify` and `JWT Sign`. Verify tells you whether a signature is
 * valid under a key you supply, which is a different question from whether the token is safe -- a
 * token with `alg: none` has no signature to verify and a token signed with `secret` verifies
 * perfectly.
 *
 * **The boundary this tool holds, and the reason it matters.** Roughly half of the well-known JWT
 * attacks are SERVER-INTERACTION attacks: `jku`, `jwk` and `x5u` point the server at a key you
 * control, and `kid` traversal makes it read a key from a file you can predict. None of them can be
 * confirmed from the token, because whether they work depends entirely on what the server does with
 * those headers. Reporting them as vulnerabilities would be a guess dressed as a finding, so they
 * are reported as HEADERS PRESENT with the caveat attached. What is decided here is decided from
 * the bytes: the algorithm, the signature's shape, and whether a weak secret verifies.
 *
 * RFC 8725 (JSON Web Token Best Current Practices) is the normative map for the checks: sections
 * 2.1 and 3.1 for algorithm confusion and `alg: none`, 2.2 and 3.5 for key identification, 2.9 and
 * 3.10 for the rest.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createInputError } from "../errors.mjs";

/** Largest token accepted, in characters. */
const MAX_TOKEN = 65536;

/**
 * Secrets worth trying against an HMAC-signed token.
 *
 * A deliberately tiny list, and the size is the point. This is a configuration check, not a
 * cracking run: these are the values that appear in framework quickstarts and tutorials and end up
 * in production because nobody changed them. A real wordlist run belongs in hashcat mode 16500,
 * and `wallarm/jwt-secrets` is the curated list to point it at.
 */
const COMMON_SECRETS = [
    "secret", "password", "123456", "changeme", "your-256-bit-secret", "your_jwt_secret",
    "jwt_secret", "jwtsecret", "supersecret", "mysecret", "secretkey", "secret_key",
    "key", "test", "admin", "qwerty", "s3cr3t", "SECRET", "Secret", "topsecret",
    "my-secret", "my_secret_key", "shhhhh", "hunter2", "letmein", "default", "example",
    "" /* the empty secret: some libraries accept it and every HMAC then verifies */
];

/** HMAC algorithms whose secret can be tested offline. */
const HMAC = { HS256: "sha256", HS384: "sha384", HS512: "sha512" };

/**
 * Decode a base64url segment to text.
 *
 * @param {string} segment - The segment.
 * @returns {string} The decoded bytes as UTF-8.
 */
const decodeSegment = (segment) =>
    Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

/**
 * Whether a string is the word "none" in any of the forms a naive filter misses.
 *
 * PortSwigger documents filters bypassed by exactly this: `nOnE`, `NONE`, and Unicode escapes in
 * the JSON itself, which JSON.parse resolves before any comparison happens. A case-sensitive
 * equality test against "none" is therefore not a check, and neither is a case-insensitive one
 * applied to the raw header text before parsing.
 *
 * @param {unknown} alg - The parsed algorithm value.
 * @returns {boolean} Whether it means none.
 */
const meansNone = (alg) => typeof alg === "string" && alg.trim().toLowerCase() === "none";

export default {
    name: "jwt_weakness",
    title: "JWT weakness scan",
    category: "Analysis",
    description:
        "Report everything wrong with a JWT that can be established from the token alone. `JWT " +
        "Verify` answers whether a signature is valid under a key you supply, which is a " +
        "different question: `alg: none` has no signature to verify and one signed with `secret` " +
        "verifies perfectly. Checks the algorithm (including the case and Unicode-escape variants " +
        "that bypass naive filters), an empty signature, the ECDSA psychic signature " +
        "(CVE-2022-21449), quickstart secrets, and the standard claims. Headers that only matter " +
        "because of what a SERVER does with them — jku, jwk, x5u, kid — are reported as present, " +
        "never as confirmed.",
    annotations: {
        title: "JWT weakness scan",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        token: z.string().min(1).max(MAX_TOKEN).describe("The JWT, in compact serialisation."),
        secrets: z.array(z.string().max(256)).max(256).optional()
            .describe(
                "Extra HMAC secrets to try, in addition to the built-in quickstart list. This is " +
                "a configuration check, not a cracking run — for a wordlist use hashcat mode 16500."),
        "now_seconds": z.number().int().optional()
            .describe("Unix time to evaluate exp and nbf against. Defaults to the current time.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} Findings, split by what could and could not be decided offline.
     */
    async run(args) {
        const parts = args.token.trim().split(".");
        if (parts.length < 2 || parts.length > 3) {
            throw createInputError(
                `A compact JWT has two or three dot-separated parts; this has ${parts.length}.`,
                { parts: parts.length, expected: "header.payload.signature" });
        }

        let header;
        let payload;
        try {
            header = JSON.parse(decodeSegment(parts[0]));
        } catch {
            throw createInputError("The header is not base64url-encoded JSON.",
                { segment: parts[0].slice(0, 40) });
        }
        try {
            payload = JSON.parse(decodeSegment(parts[1]));
        } catch {
            throw createInputError("The payload is not base64url-encoded JSON.",
                { segment: parts[1].slice(0, 40) });
        }
        const signature = parts[2] ?? "";
        const findings = [];
        const observations = [];

        const alg = header.alg;
        if (meansNone(alg)) {
            findings.push({
                id: "alg-none",
                severity: "critical",
                detail: `The algorithm is "${alg}", so there is no signature to check. Anyone can ` +
                    "mint a token by editing the payload and re-encoding it.",
                reference: "RFC 8725 section 3.1"
            });
            if (alg !== "none") {
                findings.push({
                    id: "alg-none-obfuscated",
                    severity: "high",
                    detail: `It is spelled "${alg}" rather than "none", which is how a filter ` +
                        "comparing against the exact string is bypassed. A check for this has to " +
                        "compare case-insensitively AFTER parsing the JSON, because a Unicode " +
                        "escape in the header resolves during the parse.",
                    reference: "PortSwigger, JWT attacks"
                });
            }
        }

        if (parts.length === 2 || signature === "") {
            findings.push({
                id: "empty-signature",
                severity: meansNone(alg) ? "medium" : "critical",
                detail: "The signature is empty. Several libraries have treated an empty signature " +
                    "as a valid one (CVE-2020-28042), and a token with none at all is unsigned " +
                    "whatever the header claims.",
                reference: "CVE-2020-28042"
            });
        }

        if (typeof alg === "string" && /^ES\d/.test(alg) && signature) {
            const raw = Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64");
            if (raw.length > 0 && raw.every(b => b === 0)) {
                findings.push({
                    id: "psychic-signature",
                    severity: "critical",
                    detail: "An ECDSA signature of r = s = 0. Java 15 through 18 accepted this " +
                        "against any key and any message — the 'psychic signature'.",
                    reference: "CVE-2022-21449"
                });
            }
        }

        if (typeof alg === "string" && HMAC[alg] && signature) {
            const signing = `${parts[0]}.${parts[1]}`;
            const expected = Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64");
            for (const secret of [...COMMON_SECRETS, ...(args.secrets ?? [])]) {
                const actual = createHmac(HMAC[alg], secret).update(signing).digest();
                // Constant-time even here. It is not that an attacker is timing this tool; it is
                // that a comparison written the fast way in a scanner gets copied into a verifier.
                if (actual.length === expected.length && timingSafeEqual(actual, expected)) {
                    findings.push({
                        id: "weak-secret",
                        severity: "critical",
                        detail: `The token is signed with the secret "${secret}". Anyone who knows ` +
                            "it can mint tokens with any claims they like.",
                        secret,
                        reference: "RFC 8725 section 3.5"
                    });
                    break;
                }
            }
        }

        if (typeof alg === "string" && /^(RS|ES|PS)\d/.test(alg)) {
            observations.push({
                id: "asymmetric-algorithm",
                detail: `The algorithm is ${alg}. If the server picks its verification method from ` +
                    "this header rather than from its own configuration, re-signing the token as " +
                    "HS256 using the PUBLIC key as the HMAC secret may verify — algorithm " +
                    "confusion. That depends on the server, so it cannot be confirmed here.",
                reference: "RFC 8725 section 2.1"
            });
        }

        for (const [key, note] of [
            ["jku", "points the server at a URL to fetch the verification key from"],
            ["jwk", "embeds the verification key in the token itself"],
            ["x5u", "points the server at a URL to fetch a certificate from"]
        ]) {
            if (header[key] !== undefined) {
                observations.push({
                    id: `header-${key}`,
                    detail: `The token carries a \`${key}\` header, which ${note}. A server that ` +
                        "trusts it will verify against a key the token's author chose. Whether " +
                        "this server does cannot be established from the token.",
                    value: typeof header[key] === "string" ? header[key].slice(0, 200) : "(object)",
                    reference: "RFC 8725 section 3.5"
                });
            }
        }

        if (typeof header.kid === "string") {
            const suspicious = /\.\.|^\/|\0/.test(header.kid) || header.kid === "/dev/null";
            observations.push({
                id: "header-kid",
                detail: suspicious ?
                    `The \`kid\` is "${header.kid}", which is shaped like a path rather than an ` +
                    "identifier. A server that reads a key file at this path can be steered to a " +
                    "predictable one — `/dev/null` gives an empty key, which an HMAC then accepts." :
                    `The token carries a \`kid\` of "${header.kid}". If the server uses it to look ` +
                    "up a key by path or by SQL, it is an injection point. Not decidable here.",
                reference: "RFC 8725 section 3.10"
            });
        }

        const now = args.now_seconds ?? Math.floor(Date.now() / 1000);
        if (payload.exp === undefined) {
            findings.push({
                id: "no-expiry",
                severity: "medium",
                detail: "There is no `exp` claim, so this token never expires on its own. Whatever " +
                    "it authorises, it authorises forever.",
                reference: "RFC 8725 section 3.10"
            });
        } else if (typeof payload.exp === "number" && payload.exp < now) {
            observations.push({
                id: "expired",
                detail: `Expired at ${new Date(payload.exp * 1000).toISOString()}. That is a ` +
                    "property of the token, not a weakness — but a server that accepts it anyway is one."
            });
        }
        if (typeof payload.nbf === "number" && payload.nbf > now) {
            observations.push({
                id: "not-yet-valid",
                detail: `Not valid before ${new Date(payload.nbf * 1000).toISOString()}.`
            });
        }

        const critical = findings.filter(f => f.severity === "critical").length;
        return {
            header,
            payload,
            "signature_present": signature !== "",
            "signature_bytes": signature ?
                Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64").length : 0,
            findings,
            // Kept in a separate list, and the separation is the substance rather than presentation.
            // Everything above was decided from the bytes; everything here depends on what a server
            // does with a header, and conflating them turns a scan into a set of guesses.
            "server_dependent": observations,
            assessment: critical ?
                `${critical} finding(s) mean this token can be forged outright, from the token alone.` :
                findings.length ?
                    "Nothing here lets a token be forged, but the findings are real weaknesses." :
                    "Nothing decidable from the token is wrong with it. That is not a clean bill of " +
                    "health: the server-dependent list is where the remaining risk lives, and none " +
                    "of it can be settled without testing the server.",
            next: findings.some(f => f.id === "weak-secret") ?
                "Mint a token with the recovered secret using cyberchef_bake and the `JWT Sign` operation." :
                "For a real secret search use hashcat mode 16500; `wallarm/jwt-secrets` is the " +
                "curated list. The server-dependent items need a request to the server, not a tool."
        };
    }
};
