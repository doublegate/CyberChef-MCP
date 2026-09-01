import "../../../src/node/index.mjs";
import { bakeOnCore } from "../../../src/node/lib/core-recipe.mjs";
const cases = [
    ["defang URL", "http://evil.example.com/a?b=1", [{op: "Defang URL"}]],
    ["extract IPs", "src 10.0.0.5 dst 8.8.8.8 via 192.168.1.1", [{op: "Extract IP addresses"}]],
    ["b64 then gunzip", "H4sIAAAAAAAAA8tIzcnJVyjPL8pJUQQAlRmFGwwAAAA=", [{op: "From Base64"}, {op: "Gunzip"}]],
    ["JWT decode", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiQWxpY2UifQ.x", [{op: "JWT Decode"}]],
    ["analyse hash", "5d41402abc4b2a76b9719d911017c592", [{op: "Analyse hash"}]],
    ["detect file type", "504b03040a000000000000", [{op: "From Hex"}, {op: "Detect File Type"}]],
    ["entropy", "aaaaaaaaaaaaaaaaaaaaaaaa", [{op: "Entropy"}]],
    ["magic", "537570657220736563726574", [{op: "Magic"}]]
];
for (const [label, input, recipe] of cases) {
    try {
        const r = await bakeOnCore(input, recipe);
        console.log("MARK", label.padEnd(18), "->", String(r).replace(/\s+/g, " ").slice(0, 70));
    } catch (e) {
        console.log("MARK", label.padEnd(18), "FAIL:", e.message.slice(0, 60));
    }
}
