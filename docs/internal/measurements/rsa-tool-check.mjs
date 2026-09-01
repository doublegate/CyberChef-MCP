import { buildRegistry } from "../../../src/node/tools/index.mjs";
const reg = buildRegistry({ reservedNames: [] });
const t = reg.getByExposedName("cyberchef_rsa_attack");
const run = a => t.run(t.inputSchema.parse(a));

// 1. Fermat: two primes 6 apart.
const p1 = 1000000007n, q1 = 1000000009n;
let r = await run({ modulus: (p1 * q1).toString() });
console.log("fermat:", r.factored && ((BigInt(r.p) === p1 && BigInt(r.q) === q1)) ? "OK" : "FAIL", "| via", r.via);

// 2. Common factor: n1 and n2 share q.
const shared = 32416190071n;
const n1 = shared * 32416189381n, n2 = shared * 32416187567n;
r = await run({ modulus: n1.toString(), "other_modulus": n2.toString() });
console.log("common factor:", r.factored && (BigInt(r.p) === shared || BigInt(r.q) === shared) ? "OK" : "FAIL", "| via", r.via);

// 3. Wiener: pick p,q then a tiny d, derive e.
const p3 = 1000003n, q3 = 1000033n, n3 = p3 * q3, phi3 = (p3 - 1n) * (q3 - 1n);
const d3 = 5n;
const modinv = (a, m) => { let [o,r0]=[a%m,m],[s,t]=[1n,0n]; while(r0){const q=o/r0;[o,r0]=[r0,o-q*r0];[s,t]=[t,s-q*t];} return ((s%m)+m)%m; };
const e3 = modinv(d3, phi3);
r = await run({ modulus: n3.toString(), "public_exponent": e3.toString(), attacks: ["wiener"] });
console.log("wiener:", r.factored && r.private_exponent === "5" ? "OK" : "FAIL", "| d =", r.private_exponent);

// 4. Small-e cube root, no factoring at all.
const msg = 4241788n;              // "@\xb3\xac" -- any short message
const c4 = msg ** 3n;
const bigN = 2n ** 2048n - 1n;     // far larger than m^3, so it never wrapped
r = await run({ modulus: bigN.toString(), "public_exponent": "3", ciphertext: c4.toString(), attacks: ["small_e"] });
console.log("small e:", !r.factored && r.small_e_recovery?.message_int === msg.toString() ? "OK" : "FAIL");

// 5. End to end: factor AND decrypt.
const p5 = 1000000007n, q5 = 1000000009n, n5 = p5 * q5, e5 = 65537n;
const plain = 123456789n;
const c5 = (() => { let res=1n,b=plain%n5,ex=e5; while(ex>0n){ if(ex&1n)res=res*b%n5; b=b*b%n5; ex>>=1n;} return res; })();
r = await run({ modulus: n5.toString(), ciphertext: c5.toString() });
console.log("decrypt:", r.plaintext_int === plain.toString() ? "OK" : "FAIL", "|", r.plaintext_int);

// 6. A sound key must resist everything, and say so honestly.
r = await run({ modulus: "0x" + (2n**127n - 1n).toString(16), "fermat_iterations": 500 });
console.log("strong key:", r.factored === false && /NOT proof/.test(r.assessment) ? "OK" : "FAIL");

// 7. Hex input, and refusing nonsense.
r = await run({ modulus: "0x" + (p1*q1).toString(16) });
console.log("hex input:", BigInt(r.p) === p1 ? "OK" : "FAIL");
try { await run({ modulus: "not a number" }); console.log("bad input: FAIL (no throw)"); }
catch (err) { console.log("bad input:", /not an integer/.test(err.message) ? "OK" : "FAIL", "|", err.message.slice(0, 50)); }
