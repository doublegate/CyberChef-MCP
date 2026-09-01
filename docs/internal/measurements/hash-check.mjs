const { buildRegistry } = await import("../../../src/node/tools/index.mjs");
const t = buildRegistry().getByExposedName("cyberchef_hash_identify");
const samples = [
    ["bcrypt",      "$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"],
    ["sha512crypt", "$6$rounds=5000$usesomesillystri$D4IrlXatmP7rx3P3InaxBeoomnAihCKRVQP22JZ6EY47Wc6BkroIuUUBOov1i.S5KPgErtP/EN5mcO.ChWQW21"],
    ["md5crypt",    "$1$28772684$iEwNOgGugqO9.bIz5sk8k/"],
    ["argon2id",    "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG"],
    ["PHPass/WP",   "$P$984478476IagS59wHZvyQMArzfx58u."],
    ["Django",      "pbkdf2_sha256$260000$abcdefghijkl$b2FkZWQgc2FsdCBoZXJlIGZvciB0ZXN0aW5n="],
    ["LDAP SSHA",   "{SSHA}uJnZQokFsuAZmyhpiFMcHzuMR/YyMDIzMTAxMQ=="],
    ["MySQL 4.1+",  "*2470C0C06DEE42FD1618BB99005ADCA2EC9D1E19"],
    ["NTLM (hex)",  "b4b9b02e6f09a9bd760f388b67351e2b"],
    ["SHA-256",     "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["nonsense",    "not a hash at all"]
];
for (const [label, h] of samples) {
    const r = await t.run(t.inputSchema.parse({ input: h }));
    const top = r.identified ? `${r.most_likely.format} (hashcat ${r.most_likely.hashcat_mode ?? "-"}, john ${r.most_likely.john_format ?? "-"})` : "NOT IDENTIFIED";
    console.log("MARK", label.padEnd(13), "->", top, r.ambiguous ? `[+${r.candidates.length - 1} more]` : "");
}
