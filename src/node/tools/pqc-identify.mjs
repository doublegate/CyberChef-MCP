/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Identify NIST post-quantum keys, signatures and ciphertexts.
 *
 * WHY THIS IS A REGISTRY TOOL. Zero of the 504 operations touch ML-KEM, ML-DSA or SLH-DSA --
 * measured against `OperationConfig.json`, not assumed. A toolkit that parses RSA, ECDSA, DSA and
 * EdDSA and not the FIPS 203/204/205 standards has a gap a user will meet. This is the third of the
 * three gaps that justify a registry tool: a cipher upstream simply lacks.
 *
 * It identifies rather than implements. Generating or verifying PQC is Node's job -- `crypto`
 * supports all eighteen parameter sets from Node 24 -- and this project has no business shipping
 * its own lattice arithmetic.
 *
 * EVERY NUMBER BELOW WAS EXTRACTED, NOT CITED. The OIDs come from walking the DER of keys Node
 * generated; the sizes come from measuring those keys and signing with them. They then agreed with
 * the published FIPS figures, which is the cross-check rather than the source. The first extraction
 * attempt scanned for a `0x06` tag byte and produced a plausible-looking wrong OID for ML-KEM-1024;
 * see the v3.11.0 findings log, F-01.
 *
 * WHAT IT WILL NOT DO. Two ambiguities are reported rather than resolved, because resolving them
 * would mean guessing:
 *
 *   - ML-KEM-1024's encapsulation key and ciphertext are BOTH 1568 bytes. From raw length alone,
 *     a public key and a ciphertext are indistinguishable for that parameter set.
 *   - SLH-DSA public keys are 32, 48 or 64 bytes -- the same lengths as a SHA-256/384/512 digest
 *     and an Ed25519 key. Length is worthless there. And `sha2` and `shake` share every signature
 *     size, so a raw signature gives the parameter set but never the hash family.
 *
 * A DER structure carrying an OID is the only identification this tool calls definite.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";

/**
 * The algorithm table, keyed by OID.
 *
 * `pub`/`priv` are raw key sizes in bytes; `sig` is a signature; `ct` a KEM ciphertext. Extracted
 * from Node-generated material -- see this file's header.
 */
const BY_OID = {
    "2.16.840.1.101.3.4.3.17": { name: "ML-DSA-44", kind: "signature", standard: "FIPS 204", pub: 1312, sig: 2420 },
    "2.16.840.1.101.3.4.3.18": { name: "ML-DSA-65", kind: "signature", standard: "FIPS 204", pub: 1952, sig: 3309 },
    "2.16.840.1.101.3.4.3.19": { name: "ML-DSA-87", kind: "signature", standard: "FIPS 204", pub: 2592, sig: 4627 },
    "2.16.840.1.101.3.4.4.1": { name: "ML-KEM-512", kind: "kem", standard: "FIPS 203", pub: 800, ct: 768 },
    "2.16.840.1.101.3.4.4.2": { name: "ML-KEM-768", kind: "kem", standard: "FIPS 203", pub: 1184, ct: 1088 },
    "2.16.840.1.101.3.4.4.3": { name: "ML-KEM-1024", kind: "kem", standard: "FIPS 203", pub: 1568, ct: 1568 },
    "2.16.840.1.101.3.4.3.20": { name: "SLH-DSA-SHA2-128s", kind: "signature", standard: "FIPS 205", pub: 32, sig: 7856 },
    "2.16.840.1.101.3.4.3.21": { name: "SLH-DSA-SHA2-128f", kind: "signature", standard: "FIPS 205", pub: 32, sig: 17088 },
    "2.16.840.1.101.3.4.3.22": { name: "SLH-DSA-SHA2-192s", kind: "signature", standard: "FIPS 205", pub: 48, sig: 16224 },
    "2.16.840.1.101.3.4.3.23": { name: "SLH-DSA-SHA2-192f", kind: "signature", standard: "FIPS 205", pub: 48, sig: 35664 },
    "2.16.840.1.101.3.4.3.24": { name: "SLH-DSA-SHA2-256s", kind: "signature", standard: "FIPS 205", pub: 64, sig: 29792 },
    "2.16.840.1.101.3.4.3.25": { name: "SLH-DSA-SHA2-256f", kind: "signature", standard: "FIPS 205", pub: 64, sig: 49856 },
    "2.16.840.1.101.3.4.3.26": { name: "SLH-DSA-SHAKE-128s", kind: "signature", standard: "FIPS 205", pub: 32, sig: 7856 },
    "2.16.840.1.101.3.4.3.27": { name: "SLH-DSA-SHAKE-128f", kind: "signature", standard: "FIPS 205", pub: 32, sig: 17088 },
    "2.16.840.1.101.3.4.3.28": { name: "SLH-DSA-SHAKE-192s", kind: "signature", standard: "FIPS 205", pub: 48, sig: 16224 },
    "2.16.840.1.101.3.4.3.29": { name: "SLH-DSA-SHAKE-192f", kind: "signature", standard: "FIPS 205", pub: 48, sig: 35664 },
    "2.16.840.1.101.3.4.3.30": { name: "SLH-DSA-SHAKE-256s", kind: "signature", standard: "FIPS 205", pub: 64, sig: 29792 },
    "2.16.840.1.101.3.4.3.31": { name: "SLH-DSA-SHAKE-256f", kind: "signature", standard: "FIPS 205", pub: 64, sig: 49856 }
};

/**
 * Read one DER tag-length-value header.
 *
 * A real walk, not a scan for tag bytes. The scan version of this produced a plausible wrong OID
 * for ML-KEM-1024 by reading a `0x06` inside a length field as an OBJECT IDENTIFIER tag.
 *
 * @param {Buffer} buf - The DER.
 * @param {number} off - Offset of the tag byte.
 * `limit` is the end of the structure this TLV must fit inside, and it is not optional padding:
 * bounding only against the whole buffer lets a nested read walk out of its parent. An
 * AlgorithmIdentifier declared EMPTY, followed by a real OID as its SIBLING, then yields a
 * `definite` identification from an OID that is not in the AlgorithmIdentifier at all. Both
 * reviewers found that independently, and it is this tool's own stated failure mode -- a parser
 * that invents an answer -- arriving by a second route.
 *
 * @param {Buffer} buf - The DER.
 * @param {number} off - Offset of the tag byte.
 * @param {number} limit - Exclusive end offset this TLV must lie within.
 * @returns {?{tag: number, length: number, valueStart: number, end: number}} Header, or null.
 */
function readTlv(buf, off, limit = buf.length) {
    const bound = Math.min(limit, buf.length);
    if (off + 1 >= bound) return null;
    const tag = buf[off];
    let i = off + 1;
    let length = buf[i++];
    if (length & 0x80) {
        const count = length & 0x7f;
        // Indefinite length (0x80) and absurd counts are not valid here.
        if (count === 0 || count > 4 || i + count > bound) return null;
        length = 0;
        for (let k = 0; k < count; k++) length = length * 256 + buf[i++];
    }
    if (i + length > bound) return null;
    return { tag, length, valueStart: i, end: i + length };
}

/**
 * Decode a DER OBJECT IDENTIFIER body to dotted decimal.
 *
 * BigInt for the accumulator: JavaScript's `<<` is 32-bit, and an arc above 2^31 would silently
 * wrap into a negative number and produce a wrong OID that still looks like an OID.
 *
 * @param {Buffer} body - The OID contents, without tag or length.
 * @returns {?string} Dotted form, or null when empty.
 */
function decodeOid(body) {
    if (body.length === 0) return null;

    // Every subidentifier is base-128, INCLUDING the first. Reading `body[0]` directly and
    // splitting it by 40 assumes the first one is a single byte, which is true for the NIST OIDs
    // (2.16.840... encodes as 0x60) and false in general: 2.100 needs two bytes, and 2.40 fits in
    // one but yields "3.0" under that arithmetic. Reviewer-found. The fixtures could not expose it
    // because they are all PQC OIDs -- but the tool reports the OID it saw for algorithms it does
    // NOT know, which is exactly where an unusual arc shows up.
    const values = [];
    let value = 0n;
    let pending = false;
    for (const byte of body) {
        value = (value << 7n) | BigInt(byte & 0x7f);
        pending = true;
        if (!(byte & 0x80)) {
            values.push(value);
            value = 0n;
            pending = false;
        }
    }
    // A trailing continuation bit means the encoding was truncated.
    if (pending || values.length === 0) return null;

    // X.690 8.19.4: the first subidentifier is 40*X + Y, where X is 0, 1 or 2 -- and for X = 2, Y
    // is unbounded, so the split is by range rather than by division.
    const first = values[0];
    let head;
    if (first < 40n) head = [0n, first];
    else if (first < 80n) head = [1n, first - 40n];
    else head = [2n, first - 80n];
    return head.concat(values.slice(1)).map(String).join(".");
}

/**
 * Pull the AlgorithmIdentifier OID out of a SubjectPublicKeyInfo or PrivateKeyInfo.
 *
 * Both start `SEQUENCE { [version,] AlgorithmIdentifier SEQUENCE { OID ... } ... }`, so this walks
 * into the first inner SEQUENCE and takes its first element, skipping a leading INTEGER if present
 * (PKCS#8 carries a version where SPKI does not).
 *
 * @param {Buffer} der - The structure.
 * @returns {?string} The OID, or null when this is not that shape.
 */
function algorithmOid(der) {
    const outer = readTlv(der, 0);
    if (!outer || outer.tag !== 0x30) return null;

    // Every nested read is bounded by its PARENT's declared end, not by the buffer. Without this,
    // an AlgorithmIdentifier declared empty and followed by a real OID as a sibling returns a
    // `definite` identification for an OID it does not contain.
    let cursor = outer.valueStart;
    let first = readTlv(der, cursor, outer.end);
    if (!first) return null;
    if (first.tag === 0x02) {                       // PKCS#8 version INTEGER
        cursor = first.end;
        first = readTlv(der, cursor, outer.end);
        if (!first) return null;
    }
    if (first.tag !== 0x30) return null;            // AlgorithmIdentifier

    const oid = readTlv(der, first.valueStart, first.end);
    if (!oid || oid.tag !== 0x06) return null;
    return decodeOid(der.subarray(oid.valueStart, oid.end));
}

/**
 * Decode the input to bytes, accepting PEM as well as the declared format.
 *
 * @param {string} input - The data.
 * @param {string} format - `Auto`, `PEM`, `Base64`, `Hex` or `Raw`.
 * @returns {{bytes: Buffer, decodedAs: string}} The bytes and how they were read.
 */
function decodeInput(input, format) {
    // The label is captured and back-referenced, so `BEGIN PUBLIC KEY ... END CERTIFICATE` is not
    // a PEM block. It matched before, and mismatched labels are exactly the shape of a
    // copy-paste that spliced two different objects together.
    const pem = input.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/);
    if ((format === "Auto" || format === "PEM") && pem) {
        return { bytes: decodeStrict(pem[2], "base64", "PEM"), decodedAs: "PEM" };
    }
    // `createInputError`, not a bare Error: every other registry tool signals bad input this way,
    // and the difference is visible to a caller -- it is what carries the INVALID_INPUT code and
    // the offending field instead of an untyped message.
    if (format === "PEM") {
        throw createInputError(
            "input_format is PEM but the input has no -----BEGIN-----/-----END----- block with matching labels.",
            { field: "input", received: input.slice(0, 60) });
    }

    const trimmed = input.trim();
    if (format === "Hex" || (format === "Auto" && /^[0-9a-fA-F\s]+$/.test(trimmed) && trimmed.replace(/\s+/g, "").length % 2 === 0)) {
        return { bytes: decodeStrict(trimmed, "hex", "Hex"), decodedAs: "Hex" };
    }
    if (format === "Base64" || (format === "Auto" && /^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 32)) {
        return { bytes: decodeStrict(trimmed, "base64", "Base64"), decodedAs: "Base64" };
    }
    return { bytes: Buffer.from(input, "latin1"), decodedAs: "Raw" };
}

/**
 * Decode hex or base64, rejecting what `Buffer.from` would silently drop.
 *
 * WHY THIS IS NOT PARANOIA. `Buffer.from` stops at the first thing it cannot parse and returns the
 * prefix, with no error. So 1,312 valid hex bytes followed by garbage decodes to 1,312 bytes and is
 * reported as a probable ML-DSA-44 public key, and `"zz"` as declared Hex decodes to zero bytes.
 * Both reviewers found this independently. A tool whose entire contribution is telling you what
 * something IS must not identify the part of the input it happened to understand.
 *
 * @param {string} text - The encoded text, whitespace permitted.
 * @param {string} encoding - `hex` or `base64`.
 * @param {string} label - How to name the format in an error.
 * @returns {Buffer} The decoded bytes.
 */
function decodeStrict(text, encoding, label) {
    const compact = text.replace(/\s+/g, "");
    const valid = encoding === "hex" ?
        /^[0-9a-fA-F]*$/.test(compact) && compact.length % 2 === 0 :
        /^[A-Za-z0-9+/]*={0,2}$/.test(compact) && compact.length % 4 === 0;
    if (!valid || compact.length === 0) {
        throw createInputError(
            `input is not valid ${label}. It was not decoded, because decoding it partially would ` +
            "identify whatever prefix happened to parse.",
            { field: "input", format: label, received: compact.slice(0, 60) });
    }
    return Buffer.from(compact, encoding);
}

/**
 * Everything the byte length alone is consistent with.
 *
 * Deliberately returns a LIST. For most lengths it is one entry; for the two documented collisions
 * it is more, and reporting several is the honest answer rather than picking a favourite.
 *
 * @param {number} length - Byte count.
 * @returns {Object[]} Candidate roles.
 */
function candidatesByLength(length) {
    const out = [];
    for (const [oid, spec] of Object.entries(BY_OID)) {
        if (spec.pub === length) out.push({ algorithm: spec.name, role: "public key", standard: spec.standard, oid });
        if (spec.sig === length) out.push({ algorithm: spec.name, role: "signature", standard: spec.standard, oid });
        if (spec.ct === length) out.push({ algorithm: spec.name, role: "KEM ciphertext", standard: spec.standard, oid });
    }
    return out;
}

export default {
    name: "pqc_identify",
    title: "Identify a post-quantum key, signature or ciphertext",
    category: "Public Key",
    description:
        "Identifies NIST post-quantum material -- ML-KEM (FIPS 203), ML-DSA (FIPS 204) and SLH-DSA " +
        "(FIPS 205) -- from a DER/PEM structure or from raw bytes. None of the 504 CyberChef " +
        "operations covers these. An OID in a SubjectPublicKeyInfo or PrivateKeyInfo gives a " +
        "DEFINITE answer; raw bytes give a candidate list by length, which is genuinely ambiguous " +
        "in two documented cases and says so rather than guessing: ML-KEM-1024's public key and " +
        "ciphertext are both 1568 bytes, and SLH-DSA public keys (32/48/64) are the same lengths " +
        "as common hashes and Ed25519 keys. Identification only -- it does no PQC arithmetic.",
    inputSchema: z.object({
        input: z.string().min(1).max(1048576)
            .describe("The key, signature or ciphertext. PEM, base64, hex or raw bytes."),
        "input_format": z.enum(["Auto", "PEM", "Base64", "Hex", "Raw"]).default("Auto")
            .describe("How `input` is encoded. Auto detects PEM, then hex, then base64, then raw.")
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Object} The identification.
     */
    run(args) {
        const { bytes, decodedAs } = decodeInput(args.input, args.input_format);
        const notes = [];

        const oid = algorithmOid(bytes);
        if (oid && BY_OID[oid]) {
            const spec = BY_OID[oid];
            return {
                identified: true,
                confidence: "definite",
                basis: "algorithm OID in a DER structure",
                algorithm: spec.name,
                standard: spec.standard,
                oid,
                kind: spec.kind,
                "input_bytes": bytes.length,
                "decoded_as": decodedAs,
                sizes: { "public_key": spec.pub, signature: spec.sig ?? null, ciphertext: spec.ct ?? null },
                notes: ["The OID names the algorithm outright; no inference from length was needed."]
            };
        }
        if (oid) {
            notes.push(`Found algorithm OID ${oid}, which is not a NIST PQC algorithm this tool knows.`);
        }

        const candidates = candidatesByLength(bytes.length);
        if (candidates.length === 0) {
            return {
                identified: false,
                confidence: "none",
                basis: "no OID, and the length matches no known parameter set",
                "input_bytes": bytes.length,
                "decoded_as": decodedAs,
                candidates: [],
                notes: notes.concat([
                    "This is not evidence the input is NOT post-quantum material: a private key, a " +
                    "partial read or an encapsulated form would all miss. It only means nothing here matched."
                ])
            };
        }

        const algorithms = new Set(candidates.map(c => c.algorithm));
        if (candidates.length > 1) {
            notes.push(
                `Length ${bytes.length} is consistent with ${candidates.length} roles across ` +
                `${algorithms.size} parameter set(s). Length cannot separate them; only an OID can.`);
        }
        if (candidates.some(c => c.algorithm === "ML-KEM-1024")) {
            notes.push("ML-KEM-1024's encapsulation key and ciphertext are both 1568 bytes, so this length cannot tell them apart.");
        }
        if (candidates.some(c => c.algorithm.startsWith("SLH-DSA")) && bytes.length <= 64) {
            notes.push(
                "SLH-DSA public keys are 32/48/64 bytes -- the same lengths as SHA-256/384/512 " +
                "digests and Ed25519 keys. A length match here is weak evidence on its own.");
        }
        if (candidates.some(c => c.role === "signature" && c.algorithm.startsWith("SLH-DSA"))) {
            notes.push("SLH-DSA SHA2 and SHAKE families share every signature size, so the hash family cannot be determined from length.");
        }

        return {
            identified: true,
            confidence: candidates.length === 1 ? "probable" : "ambiguous",
            basis: "byte length only",
            "input_bytes": bytes.length,
            "decoded_as": decodedAs,
            candidates,
            notes
        };
    }
};
