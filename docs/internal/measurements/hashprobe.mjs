import "../../../src/node/index.mjs";
import { bakeOnCore } from "../../../src/node/lib/core-recipe.mjs";
const samples = [
    ["bcrypt",  "$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"],
    ["sha512crypt", "$6$rounds=5000$usesomesillystri$D4IrlXatmP7rx3P3InaxBeoomnAihCKRVQP22JZ6EY47Wc6BkroIuUUBOov1i.S5KPgErtP/EN5mcO.ChWQW21"],
    ["NTLM",    "b4b9b02e6f09a9bd760f388b67351e2b"],
    ["argon2",  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG"]
];
for (const [label, h] of samples) {
    const r = await bakeOnCore(h, [{op: "Analyse hash"}]);
    console.log("MARK", label.padEnd(12), String(r).replace(/\s+/g, " ").slice(0, 96));
}
