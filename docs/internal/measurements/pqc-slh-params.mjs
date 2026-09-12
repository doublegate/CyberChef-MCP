import { generateKeyPairSync, sign } from "node:crypto";
const sets = [];
for (const h of ["sha2","shake"]) for (const n of [128,192,256]) for (const v of ["s","f"]) sets.push(`slh-dsa-${h}-${n}${v}`);
console.log("alg                    OID                        pubBytes  sigBytes");
for (const a of sets) {
    try {
        const { publicKey, privateKey } = generateKeyPairSync(a);
        const der = publicKey.export({ type: "spki", format: "der" });
        let i = 0; const tlv = (b,o)=>{let t=b[o],j=o+1,l=b[j++];if(l&0x80){const n=l&0x7f;l=0;for(let k=0;k<n;k++)l=l*256+b[j++];}return{tag:t,length:l,valueStart:j};};
        const outer=tlv(der,0), alg=tlv(der,outer.valueStart), o=tlv(der,alg.valueStart);
        const body=der.subarray(o.valueStart,o.valueStart+o.length);
        const parts=[Math.floor(body[0]/40),body[0]%40]; let v=0n;
        for (const b of body.subarray(1)) { v=(v<<7n)|BigInt(b&0x7f); if(!(b&0x80)){parts.push(v.toString());v=0n;} }
        const bits=tlv(der,alg.valueStart+alg.length);
        const sig = sign(null, Buffer.from("probe"), privateKey);
        console.log(`${a.padEnd(22)} ${parts.join(".").padEnd(26)} ${String(bits.length-1).padStart(8)}  ${String(sig.length).padStart(8)}`);
    } catch (e) { console.log(`${a.padEnd(22)} unsupported`); }
}
