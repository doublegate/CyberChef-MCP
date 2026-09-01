import {readFileSync, writeFileSync, mkdirSync, existsSync} from "fs";
import {dirname, join} from "path";
import {execFileSync} from "child_process";

const SP = process.env.SP;
const FILES = [
    "src/core/lib/Hash.mjs",
    "src/core/lib/SM2.mjs",
    "src/core/operations/DeriveHKDFKey.mjs",
    "src/core/operations/FlaskSessionSign.mjs",
    "src/core/operations/FlaskSessionVerify.mjs",
    "src/core/operations/HMAC.mjs",
    "src/core/operations/SM3.mjs",
];
const NOTE = '// FORK CHANGE (patches/fork/08): vendored crypto-api -- see src/vendor/crypto-api/README.md\n';

// Refuse to run against a working tree that already differs from HEAD for these files: the patch
// must be generated against pristine upstream, not against our own earlier edits.
const dirty = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...FILES], {encoding: "utf8"}).trim();
if (dirty) { console.error("REFUSING: already modified:\n" + dirty); process.exit(1); }

let patch = "";
for (const f of FILES) {
    const pristine = join(SP, "pristine", f);
    mkdirSync(dirname(pristine), {recursive: true});
    const before = readFileSync(f, "utf8");
    writeFileSync(pristine, before);

    let after = before.replaceAll('"crypto-api/src/', '"../../vendor/crypto-api/');
    if (after === before) { console.error(`REFUSING: no crypto-api import in ${f}`); process.exit(1); }
    // Put the provenance note immediately above the first rewritten import.
    const idx = after.indexOf('"../../vendor/crypto-api/');
    const lineStart = after.lastIndexOf("\n", idx) + 1;
    after = after.slice(0, lineStart) + NOTE + after.slice(lineStart);
    writeFileSync(f, after);

    let d = "";
    try {
        execFileSync("diff", ["-u", "--label", `a/${f}`, "--label", `b/${f}`, pristine, f], {encoding: "utf8"});
    } catch (e) { d = e.stdout; }   // diff exits 1 when files differ
    if (!d) { console.error(`REFUSING: empty diff for ${f}`); process.exit(1); }
    patch += d;
}
writeFileSync("patches/fork/08-crypto-api-vendored.patch", patch);
console.log(`wrote patches/fork/08-crypto-api-vendored.patch (${FILES.length} files, ${patch.split("\n").length} lines)`);
