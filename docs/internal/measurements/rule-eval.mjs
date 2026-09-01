import { CODE, LOG } from './corpora.mjs';
const BASE = `The Model Context Protocol lets an assistant call tools directly. CyberChef exposes five hundred and four operations for encryption, encoding, compression and forensic analysis. A repeating-key XOR is the classic first exercise: the key length falls out of the statistics long before the key itself does. `;
const ic = (col) => {
    if (col.length < 2) return 0;
    const c = new Array(256).fill(0);
    for (const b of col) c[b]++;
    let s = 0;
    for (const n of c) s += n * (n - 1);
    return s / (col.length * (col.length - 1));
};
const rank = (bytes, max) => {
    const out = [];
    for (let k = 1; k <= max; k++) {
        if (bytes.length < k * 4) break;
        let t = 0;
        for (let o = 0; o < k; o++) { const col = []; for (let i = o; i < bytes.length; i += k) col.push(bytes[i]); t += ic(col); }
        out.push({ length: k, score: t / k });
    }
    return out.sort((a, b) => b.score - a.score);
};
// Candidate rules.
const rules = {
    "smallest>=90%": (r) => r.filter(x => x.score >= r[0].score * 0.9).map(x => x.length).sort((a, b) => a - b)[0],
    "smallest>=80%": (r) => r.filter(x => x.score >= r[0].score * 0.8).map(x => x.length).sort((a, b) => a - b)[0],
    "gcd of >=90%": (r) => { const g=(a,b)=>b?g(b,a%b):a; return r.filter(x => x.score >= r[0].score*0.9).map(x=>x.length).reduce((a,b)=>g(a,b)); },
    "gcd of top5": (r) => { const g=(a,b)=>b?g(b,a%b):a; return r.slice(0,5).map(x=>x.length).reduce((a,b)=>g(a,b)); },
    // Divisor rule: smallest k such that every leader is a multiple of k.
    "smallest divisor of leaders": (r) => {
        const leaders = r.filter(x => x.score >= r[0].score * 0.85).map(x => x.length);
        for (const k of [...leaders].sort((a, b) => a - b)) if (leaders.every(l => l % k === 0)) return k;
        return r[0].length;
    }
};
const CORPORA = {
    prose: BASE,
    // Different statistics: source code has heavy punctuation and indentation.
    code: CODE,
    // Lower-entropy, highly repetitive -- the easy case, included so a rule cannot pass by
    // being tuned to hard cases only.
    log: LOG
};
const keys = ["K", "ab", "sec", "hunt", "hunter", "secretk", "secretkey", "correcthorse", "0123456789abcdef", "twentyfourbytekey!!12345"];
const reps = [1, 2, 4];
const tally = Object.fromEntries(Object.keys(rules).map(n => [n, 0]));
let total = 0;
const misses = [];
for (const [corpusName, corpus] of Object.entries(CORPORA)) for (const rep of reps) for (const key of keys) {
    const plain = [...Buffer.from(corpus.repeat(rep * 3), "utf8")];
    const kb = [...Buffer.from(key, "utf8")];
    const ct = plain.map((b, i) => b ^ kb[i % kb.length]);
    const r = rank(ct, 32);
    if (!r.length) continue;
    total++;
    for (const [n, f] of Object.entries(rules)) if (f(r) === kb.length) tally[n]++;
    const got = rules["smallest>=80%"](r);
    if (got !== kb.length) misses.push(`${corpusName} rep${rep} key=${kb.length} -> ${got}`);
}
console.log(`MARK evaluated ${total} cases (${keys.length} keys x ${reps.length} lengths x ${Object.keys(CORPORA).length} corpora)`);
for (const [n, hits] of Object.entries(tally)) console.log(`MARK ${n.padEnd(28)} ${hits}/${total}`);
console.log("MARK --- where smallest>=80% misses ---");
const byCorpus = {};
for (const m of misses) { const c = m.split(" ")[0]; byCorpus[c] = (byCorpus[c] || 0) + 1; }
for (const [c, n] of Object.entries(byCorpus)) console.log(`MARK   ${c}: ${n} misses`);
for (const m of misses.slice(0, 8)) console.log(`MARK   ${m}`);
