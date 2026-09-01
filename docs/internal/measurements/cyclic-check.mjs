const { buildRegistry } = await import("../../../src/node/tools/index.mjs");
const t = buildRegistry().getByExposedName("cyberchef_cyclic_pattern");

const gen = await t.run(t.inputSchema.parse({ mode: "generate", length: 64 }));
console.log("MARK pattern(64):", gen.pattern);
console.log("MARK matches pwntools prefix 'aaaabaaacaaadaaa':", gen.pattern.startsWith("aaaabaaacaaadaaa"));

const cases = [["text aaha", "aaha", "Text"], ["hex 61616861", "61616861", "Hex"], ["auto laaa", "laaa", "Auto"]];
for (const [label, frag, fmt] of cases) {
    try {
        const r = await t.run(t.inputSchema.parse({ mode: "find", length: 1024, fragment: frag, "fragment_format": fmt }));
        console.log("MARK find", label.padEnd(14), "->", JSON.stringify(r.most_likely));
    } catch (e) { console.log("MARK find", label.padEnd(14), "FAIL:", e.message.slice(0, 70)); }
}

const big = await t.run(t.inputSchema.parse({ mode: "generate", length: 1024 }));
const seen = new Set();
for (let i = 0; i + 4 <= big.pattern.length; i++) seen.add(big.pattern.slice(i, i + 4));
console.log("MARK unique 4-byte windows:", seen.size, "of", big.pattern.length - 3);

try {
    await t.run(t.inputSchema.parse({ mode: "generate", length: 500, alphabet: "abcd", "subsequence_length": 4 }));
    console.log("MARK over-length: NOT refused (should have been: 4^4 = 256)");
} catch (e) { console.log("MARK over-length refused:", e.message.slice(0, 72)); }
