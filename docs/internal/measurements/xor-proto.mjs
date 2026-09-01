// Prototype: does per-column non-uniformity actually recover an XOR key length?
const PLAIN = `The Model Context Protocol lets an assistant call tools directly. CyberChef exposes
five hundred and four operations for encryption, encoding, compression and forensic analysis, and
this server makes every one of them reachable. A repeating-key XOR is the classic first exercise:
the key length falls out of the statistics long before the key itself does.`.repeat(3);

const xor = (bytes, key) => bytes.map((b, i) => b ^ key[i % key.length]);

/**
 * Index of coincidence for a byte column: the probability that two bytes drawn at random from it
 * are equal. Size-NORMALISED, which is the whole point -- chi-square against uniform grows with n,
 * so it ranks short key lengths highest no matter what the data says.
 * Uniform random bytes give 1/256 = 0.0039; structured text gives considerably more.
 */
function columnScore(col) {
    if (col.length < 2) return 0;
    const counts = new Array(256).fill(0);
    for (const b of col) counts[b]++;
    let sum = 0;
    for (const c of counts) sum += c * (c - 1);
    return sum / (col.length * (col.length - 1));
}

function rankKeyLengths(bytes, maxLen) {
    const out = [];
    for (let k = 1; k <= maxLen; k++) {
        if (bytes.length < k * 4) continue;          // too little data to say anything
        let total = 0;
        for (let c = 0; c < k; c++) {
            const col = [];
            for (let i = c; i < bytes.length; i += k) col.push(bytes[i]);
            total += columnScore(col);
        }
        out.push({ length: k, score: total / k });    // per-column average, so k is comparable
    }
    return out.sort((a, b) => b.score - a.score);
}

const plainBytes = [...Buffer.from(PLAIN, "utf8")];
for (const key of ["K", "sec", "hunter", "correcthorse", "0123456789abcdef"]) {
    const kb = [...Buffer.from(key, "utf8")];
    const ct = xor(plainBytes, kb);
    const ranked = rankKeyLengths(ct, 32);
    const top = ranked.slice(0, 4).map(r => `${r.length}(${r.score.toFixed(4)})`).join(" ");
    // The true length should be the top candidate, or the smallest among the leaders.
    // Multiples of the true length score well too, so the answer is the smallest length whose
    // score is within a whisker of the best -- not simply the best.
    const best = ranked[0].score;
    const smallestLeader = ranked.filter(r => r.score >= best * 0.9).map(r => r.length).sort((a, b) => a - b)[0];
    console.log(`MARK key="${key}" len=${kb.length}  top: ${top}  -> smallest leader ${smallestLeader} ${smallestLeader === kb.length ? "OK" : "MISS"}`);
}
