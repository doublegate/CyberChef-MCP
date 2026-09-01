import {readFileSync, writeFileSync, mkdirSync} from "fs";
import {dirname, join} from "path";
import {execFileSync} from "child_process";

const SP = process.env.SP;
const FILES = [
    "src/core/operations/AddTextToImage.mjs", "src/core/operations/BlurImage.mjs",
    "src/core/operations/ContainImage.mjs", "src/core/operations/ConvertImageFormat.mjs",
    "src/core/operations/CoverImage.mjs", "src/core/operations/CropImage.mjs",
    "src/core/operations/DitherImage.mjs", "src/core/operations/FlipImage.mjs",
    "src/core/operations/ImageBrightnessContrast.mjs", "src/core/operations/ImageFilter.mjs",
    "src/core/operations/ImageHueSaturationLightness.mjs", "src/core/operations/ImageOpacity.mjs",
    "src/core/operations/InvertImage.mjs", "src/core/operations/NormaliseImage.mjs",
    "src/core/operations/ResizeImage.mjs", "src/core/operations/RotateImage.mjs",
    "src/core/operations/SharpenImage.mjs",
];

const dirty = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...FILES], {encoding: "utf8"}).trim();
if (dirty) { console.error("REFUSING: already modified:\n" + dirty); process.exit(1); }

// `return <buf>.buffer;` -> slice it to the view's own window, with the reason recorded in place.
const RE = /^([ \t]*)return ([A-Za-z_$][\w$]*)\.buffer;$/gm;
let patch = "", sites = 0;
for (const f of FILES) {
    const pristine = join(SP, "pristine", f);
    mkdirSync(dirname(pristine), {recursive: true});
    const before = readFileSync(f, "utf8");
    writeFileSync(pristine, before);

    let hits = 0;
    const after = before.replace(RE, (whole, indent, v) => {
        hits++;
        return [
            `${indent}// FORK CHANGE (patches/fork/09): return the image, not the whole pool it was`,
            `${indent}// allocated in. https://nodejs.org/docs/latest-v24.x/api/buffer.html#bufbyteoffset`,
            `${indent}// -- upstream fixed exactly this in GenerateImage.mjs and left the siblings.`,
            `${indent}return ${v}.buffer.slice(${v}.byteOffset, ${v}.byteOffset + ${v}.byteLength);`,
        ].join("\n");
    });
    if (!hits) { console.error(`REFUSING: no return <buf>.buffer in ${f}`); process.exit(1); }
    sites += hits;
    writeFileSync(f, after);

    let d = "";
    try { execFileSync("diff", ["-u", "--label", `a/${f}`, "--label", `b/${f}`, pristine, f], {encoding: "utf8"}); }
    catch (e) { d = e.stdout; }
    patch += d;
}
writeFileSync("patches/fork/09-image-ops-return-pooled-buffer.patch", patch);
console.log(`wrote patch 09: ${FILES.length} files, ${sites} return sites`);
