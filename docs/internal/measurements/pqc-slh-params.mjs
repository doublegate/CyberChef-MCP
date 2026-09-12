/**
 * SLH-DSA (FIPS 205) parameter sets: OID, public-key size and signature size, read out of keys
 * Node itself generates rather than out of a specification.
 *
 * The sibling of `pqc-oids.mjs`, which does the same for ML-KEM and ML-DSA. Together they are how
 * `src/node/tools/pqc-identify.mjs`'s `BY_OID` table was built -- `AGENTS.md` says that table
 * "came out of DER that Node 24 generated, not out of a specification read by eye", and this is
 * the instrument that statement refers to.
 *
 * Signature size is measured by actually signing, not looked up: it is the field most likely to be
 * misremembered, and the twelve sets differ by more than an order of magnitude (7,856 to 49,856).
 */
import { generateKeyPairSync, sign } from "node:crypto";

/** The twelve FIPS 205 parameter sets, in the order the standard names them. */
const sets = [];
for (const hash of ["sha2", "shake"]) {
    for (const bits of [128, 192, 256]) {
        for (const variant of ["s", "f"]) {
            sets.push(`slh-dsa-${hash}-${bits}${variant}`);
        }
    }
}

/**
 * Read one DER TLV.
 *
 * @param {Buffer} buf - The DER.
 * @param {number} off - Offset of the tag byte.
 * @returns {{tag: number, length: number, valueStart: number}} The parsed header.
 */
function tlv(buf, off) {
    const tag = buf[off];
    let i = off + 1;
    let length = buf[i++];
    if (length & 0x80) {
        const n = length & 0x7f;
        length = 0;
        for (let k = 0; k < n; k++) length = length * 256 + buf[i++];
    }
    return { tag, length, valueStart: i };
}

/**
 * Decode a DER OBJECT IDENTIFIER body to dotted form.
 *
 * @param {Buffer} body - The OID contents, without its tag and length.
 * @returns {string} Dotted decimal.
 */
function dottedOid(body) {
    const parts = [Math.floor(body[0] / 40), body[0] % 40];
    let value = 0n;
    for (const byte of body.subarray(1)) {
        value = (value << 7n) | BigInt(byte & 0x7f);
        if (!(byte & 0x80)) {
            parts.push(value.toString());
            value = 0n;
        }
    }
    return parts.join(".");
}

console.log("alg                    OID                        pubBytes  sigBytes");
for (const alg of sets) {
    try {
        const { publicKey, privateKey } = generateKeyPairSync(alg);
        const der = publicKey.export({ type: "spki", format: "der" });

        const outer = tlv(der, 0);
        const algId = tlv(der, outer.valueStart);
        const oid = tlv(der, algId.valueStart);
        const dotted = dottedOid(der.subarray(oid.valueStart, oid.valueStart + oid.length));

        // The BIT STRING after the AlgorithmIdentifier; its first content byte is the unused-bit
        // count, hence the -1.
        const bitString = tlv(der, algId.valueStart + algId.length);
        const signature = sign(null, Buffer.from("probe"), privateKey);

        console.log(`${alg.padEnd(22)} ${dotted.padEnd(26)} ` +
            `${String(bitString.length - 1).padStart(8)}  ${String(signature.length).padStart(8)}`);
    } catch {
        // A parameter set this Node build does not implement. Reported rather than skipped: which
        // sets are missing is itself the finding when re-running on a new Node.
        console.log(`${alg.padEnd(22)} unsupported`);
    }
}
