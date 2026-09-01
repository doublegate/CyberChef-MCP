import {readFileSync, writeFileSync, mkdirSync} from "fs";
import {dirname, join} from "path";
import {execFileSync} from "child_process";

const SP = process.env.SP;
const F = "src/core/operations/AddTextToImage.mjs";

// Patch 09 already edits this file, and patches apply in filename order, so patch 10's base is
// the post-09 tree -- which is exactly the current working copy.
const before = readFileSync(F, "utf8");
if (!before.includes("patches/fork/09")) {
    console.error("REFUSING: expected patch 09 to be applied first"); process.exit(1);
}
const pristine = join(SP, "base10", F);
mkdirSync(dirname(pristine), {recursive: true});
writeFileSync(pristine, before);

// 1. The webpack-only font imports, replaced by a name -> vendored filename map.
const importsStart = before.indexOf("        const fontsMap = {};\n");
const importsEnd = before.indexOf("        let jimpFont;\n");
if (importsStart < 0 || importsEnd < 0 || importsEnd < importsStart) {
    console.error("REFUSING: font-import block not found in its expected shape"); process.exit(1);
}
const replacement = `        // FORK CHANGE (patches/fork/10): load the bitmap fonts from disk, not from webpack.
        //
        // Upstream reached them with webpack-only \`import()\` of \`.fnt\`/\`.png\` under
        // \`src/web/static/fonts/bmfonts/\`, then built an absolute URL from \`self.docURL\`. This fork
        // removed \`src/web/\` in v1.7.1 and runs under plain Node, where neither exists -- so every
        // call threw "Error preparing fonts. (Cannot find module ...RobotoBlack72White.fnt)" and the
        // operation had never once worked here, while still being advertised in \`tools/list\`.
        //
        // The four fonts are vendored at \`src/vendor/bmfonts/\` (see its README). jimp's
        // \`loadFont()\` takes a filesystem path in Node and resolves each font's page atlas relative
        // to its descriptor, so no document URL is needed.
        const FONT_FILES = {
            "Roboto": "Roboto72White.fnt",
            "Roboto Black": "RobotoBlack72White.fnt",
            "Roboto Mono": "RobotoMono72White.fnt",
            "Roboto Slab": "RobotoSlab72White.fnt",
        };

`;
let after = before.slice(0, importsStart) + replacement + before.slice(importsEnd);

// 2. The loadFont call itself.
const oldLoad = `            const font = fontsMap[fontFace];

            // LoadFont needs an absolute url, so append the font name to self.docURL
            jimpFont = await loadFont(self.docURL + "/" + font.default);`;
const newLoad = `            const fontFile = FONT_FILES[fontFace];
            if (!fontFile)
                throw new OperationError(\`Unknown font face: \${fontFace}\`);

            jimpFont = await loadFont(
                fileURLToPath(new URL(\`../../vendor/bmfonts/\${fontFile}\`, import.meta.url)));`;
if (!after.includes(oldLoad)) { console.error("REFUSING: loadFont call not found"); process.exit(1); }
after = after.replace(oldLoad, newLoad);

// 3. fileURLToPath, imported beside the existing jimp import.
const anchor = `} from "jimp";\n`;
if (!after.includes(anchor)) { console.error("REFUSING: jimp import not found"); process.exit(1); }
after = after.replace(anchor, anchor + `import { fileURLToPath } from "node:url";\n`);

writeFileSync(F, after);
let d = "";
try { execFileSync("diff", ["-u", "--label", `a/${F}`, "--label", `b/${F}`, pristine, F], {encoding: "utf8"}); }
catch (e) { d = e.stdout; }
writeFileSync("patches/fork/10-add-text-to-image-node-fonts.patch", d);
console.log(`wrote patch 10 (${d.split("\n").length} lines)`);
