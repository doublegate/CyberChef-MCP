import { generateKeyPairSync } from "node:crypto";

/** Read a DER TLV at offset: returns {tag, headerLen, length, valueStart}. */
function tlv(buf, off) {
    const tag = buf[off];
    let i = off + 1, len = buf[i++];
    if (len & 0x80) {
        const n = len & 0x7f;
        len = 0;
        for (let k = 0; k < n; k++) len = len * 256 + buf[i++];
    }
    return { tag, length: len, valueStart: i };
}

/** Decode an OID value into dotted form. */
function oid(buf) {
    const parts = [Math.floor(buf[0] / 40), buf[0] % 40];
    let v = 0n;
    for (const b of buf.subarray(1)) {
        v = (v << 7n) | BigInt(b & 0x7f);
        if (!(b & 0x80)) { parts.push(v.toString()); v = 0n; }
    }
    return parts.join(".");
}

/** SPKI ::= SEQ { AlgorithmIdentifier ::= SEQ { OID, ... }, BIT STRING } */
function spkiOid(der) {
    const outer = tlv(der, 0);                        // SEQUENCE
    const alg = tlv(der, outer.valueStart);           // SEQUENCE (AlgorithmIdentifier)
    const o = tlv(der, alg.valueStart);               // OBJECT IDENTIFIER
    if (o.tag !== 0x06) throw new Error(`expected OID tag, got 0x${o.tag.toString(16)}`);
    return oid(der.subarray(o.valueStart, o.valueStart + o.length));
}

const algs = ["ml-dsa-44","ml-dsa-65","ml-dsa-87","ml-kem-512","ml-kem-768","ml-kem-1024",
              "slh-dsa-sha2-128s","slh-dsa-sha2-128f","slh-dsa-sha2-192s","slh-dsa-shake-128s"];
console.log("alg                  spki  rawpub  OID");
for (const a of algs) {
    try {
        const { publicKey } = generateKeyPairSync(a);
        const der = publicKey.export({ type: "spki", format: "der" });
        // raw public key = the BIT STRING contents, minus the unused-bits byte
        const outer = tlv(der, 0);
        const alg = tlv(der, outer.valueStart);
        const bits = tlv(der, alg.valueStart + alg.length);
        const raw = bits.length - 1;
        console.log(`${a.padEnd(20)} ${String(der.length).padStart(5)} ${String(raw).padStart(7)}  ${spkiOid(der)}`);
    } catch (e) {
        console.log(`${a.padEnd(20)} -- ${String(e.message).slice(0, 50)}`);
    }
}
