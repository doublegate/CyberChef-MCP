import { buildRegistry } from "../../../src/node/tools/index.mjs";
const reg = buildRegistry();
const c = reg.getByExposedName("cyberchef_cyclic_pattern");
const h = reg.getByExposedName("cyberchef_hash_identify");
const go = async (t, a) => JSON.stringify(await t.run(t.inputSchema.parse(a)), null, 1);
console.log("GEN", await go(c, { mode: "generate", length: 20 }));
console.log("FIND", await go(c, { mode: "find", fragment: "aaha" }));
console.log("FIND-HEX", await go(c, { mode: "find", fragment: "0x61616861" }));
try { console.log("MISS", await go(c, { mode: "find", fragment: "zzzz" })); } catch (e) { console.log("MISS throws:", e.message.slice(0,80)); }
try { console.log("OVER", await go(c, { mode: "generate", length: 700, "subsequence_length": 2 })); }
catch (e) { console.log("OVER throws:", e.message); }
console.log("BCRYPT", await go(h, { input: "$2b$12$GhvMmNVjRW29ulnudl.LbuAnUtN/LRfe1JsBm1Xu6LE3059z5Tr8m" }));
console.log("HEX32", await go(h, { input: "5f4dcc3b5aa765d61d8327deb882cf99" }));
console.log("JUNK", await go(h, { input: "hello world" }));
