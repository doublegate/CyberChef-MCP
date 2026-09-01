const strip = (html) => {
    let text = String(html || "");
    for (let previous = null; previous !== text;) {
        previous = text;
        text = text.replace(/<[^>]*>/g, "");
    }
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\s+/g, " ").trim();
};
const single = (h) => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const cases = [
    "Performs <code>BLAKE2b</code> hashing.<br>Supports keys.",
    "<<script>>alert(1)<</script>>",
    "<scr<x>ipt>alert(1)</scr<x>ipt>",
    "a < b and c > d"
];
for (const c of cases) {
    console.log("MARK in    :", JSON.stringify(c));
    console.log("     single:", JSON.stringify(single(c)), single(c).includes("<script") ? "  <-- LEAKS <script" : "");
    console.log("     fixed :", JSON.stringify(strip(c)));
}
