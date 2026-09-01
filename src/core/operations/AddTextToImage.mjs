/**
 * @author j433866 [j433866@gmail.com]
 * @copyright Crown Copyright 2019
 * @license Apache-2.0
 */

import Operation from "../Operation.mjs";
import OperationError from "../errors/OperationError.mjs";
import { isImage } from "../lib/FileType.mjs";
import { toBase64 } from "../lib/Base64.mjs";
import { isWorkerEnvironment } from "../Utils.mjs";
import {
    Jimp,
    JimpMime,
    ResizeStrategy,
    measureText,
    measureTextHeight,
    loadFont,
} from "jimp";
import { fileURLToPath } from "node:url";

/**
 * Add Text To Image operation
 */
class AddTextToImage extends Operation {
    /**
     * AddTextToImage constructor
     */
    constructor() {
        super();

        this.name = "Add Text To Image";
        this.module = "Image";
        this.description =
            "Adds text onto an image.<br><br>Text can be horizontally or vertically aligned, or the position can be manually specified.<br>Variants of the Roboto font face are available in any size or colour.";
        this.infoURL = "";
        this.inputType = "ArrayBuffer";
        this.outputType = "ArrayBuffer";
        this.presentType = "html";
        this.args = [
            {
                name: "Text",
                type: "string",
                value: "",
            },
            {
                name: "Horizontal align",
                type: "option",
                value: ["None", "Left", "Center", "Right"],
            },
            {
                name: "Vertical align",
                type: "option",
                value: ["None", "Top", "Middle", "Bottom"],
            },
            {
                name: "X position",
                type: "number",
                value: 0,
            },
            {
                name: "Y position",
                type: "number",
                value: 0,
            },
            {
                name: "Size",
                type: "number",
                value: 32,
                min: 8,
            },
            {
                name: "Font face",
                type: "option",
                value: ["Roboto", "Roboto Black", "Roboto Mono", "Roboto Slab"],
            },
            {
                name: "Red",
                type: "number",
                value: 255,
                min: 0,
                max: 255,
            },
            {
                name: "Green",
                type: "number",
                value: 255,
                min: 0,
                max: 255,
            },
            {
                name: "Blue",
                type: "number",
                value: 255,
                min: 0,
                max: 255,
            },
            {
                name: "Alpha",
                type: "number",
                value: 255,
                min: 0,
                max: 255,
            },
        ];
    }

    /**
     * @param {ArrayBuffer} input
     * @param {Object[]} args
     * @returns {byteArray}
     */
    async run(input, args) {
        const text = args[0],
            hAlign = args[1],
            vAlign = args[2],
            size = args[5],
            fontFace = args[6],
            red = args[7],
            green = args[8],
            blue = args[9],
            alpha = args[10];

        let xPos = args[3],
            yPos = args[4];

        if (!isImage(input)) {
            throw new OperationError("Invalid file type.");
        }

        let image;
        try {
            image = await Jimp.read(input);
        } catch (err) {
            throw new OperationError(`Error loading image. (${err})`);
        }

        if (isWorkerEnvironment())
            self.sendStatusMessage("Adding text to image...");

        // FORK CHANGE (patches/fork/10): load the bitmap fonts from disk, not from webpack.
        //
        // Upstream reached them with webpack-only `import()` of `.fnt`/`.png` under
        // `src/web/static/fonts/bmfonts/`, then built an absolute URL from `self.docURL`. This fork
        // removed `src/web/` in v1.7.1 and runs under plain Node, where neither exists -- so every
        // call threw "Error preparing fonts. (Cannot find module ...RobotoBlack72White.fnt)" and the
        // operation had never once worked here, while still being advertised in `tools/list`.
        //
        // The four fonts are vendored at `src/vendor/bmfonts/` (see its README). jimp's
        // `loadFont()` takes a filesystem path in Node and resolves each font's page atlas relative
        // to its descriptor, so no document URL is needed.
        const FONT_FILES = {
            "Roboto": "Roboto72White.fnt",
            "Roboto Black": "RobotoBlack72White.fnt",
            "Roboto Mono": "RobotoMono72White.fnt",
            "Roboto Slab": "RobotoSlab72White.fnt",
        };

        let jimpFont;
        try {
            const fontFile = FONT_FILES[fontFace];
            if (!fontFile)
                throw new OperationError(`Unknown font face: ${fontFace}`);

            jimpFont = await loadFont(
                fileURLToPath(new URL(`../../vendor/bmfonts/${fontFile}`, import.meta.url)));

            jimpFont.pages.forEach(function (page) {
                if (page.bitmap) {
                    // Adjust the RGB values of the image pages to change the font colour.
                    const pageWidth = page.bitmap.width;
                    const pageHeight = page.bitmap.height;
                    for (let ix = 0; ix < pageWidth; ix++) {
                        for (let iy = 0; iy < pageHeight; iy++) {
                            const idx = (iy * pageWidth + ix) << 2;

                            const newRed = page.bitmap.data[idx] - (255 - red);
                            const newGreen =
                                page.bitmap.data[idx + 1] - (255 - green);
                            const newBlue =
                                page.bitmap.data[idx + 2] - (255 - blue);
                            const newAlpha =
                                page.bitmap.data[idx + 3] - (255 - alpha);

                            // Make sure the bitmap values don't go below 0 as that makes jimp very unhappy
                            page.bitmap.data[idx] = newRed > 0 ? newRed : 0;
                            page.bitmap.data[idx + 1] =
                                newGreen > 0 ? newGreen : 0;
                            page.bitmap.data[idx + 2] =
                                newBlue > 0 ? newBlue : 0;
                            page.bitmap.data[idx + 3] =
                                newAlpha > 0 ? newAlpha : 0;
                        }
                    }
                }
            });
        } catch (err) {
            throw new OperationError(`Error loading font. (${err})`);
        }

        try {
            // Create a temporary image to hold the rendered text
            const textImage = new Jimp({
                width: measureText(jimpFont, text),
                height: measureTextHeight(jimpFont, text),
            });
            textImage.print({
                font: jimpFont,
                x: 0,
                y: 0,
                text,
            });

            // Scale the rendered text image to the correct size
            const scaleFactor = size / 72;
            if (size !== 1) {
                // Use bicubic for decreasing size
                if (size > 1) {
                    textImage.scale({
                        f: scaleFactor,
                        mode: ResizeStrategy.BICUBIC,
                    });
                } else {
                    textImage.scale({
                        f: scaleFactor,
                        mode: ResizeStrategy.BILINEAR,
                    });
                }
            }

            // If using the alignment options, calculate the pixel values AFTER the image has been scaled
            switch (hAlign) {
                case "Left":
                    xPos = 0;
                    break;
                case "Center":
                    xPos = image.width / 2 - textImage.width / 2;
                    break;
                case "Right":
                    xPos = image.width - textImage.width;
                    break;
            }

            switch (vAlign) {
                case "Top":
                    yPos = 0;
                    break;
                case "Middle":
                    yPos = image.height / 2 - textImage.height / 2;
                    break;
                case "Bottom":
                    yPos = image.height - textImage.height;
                    break;
            }

            // Blit the rendered text image onto the original source image
            image.blit({
                src: textImage,
                x: xPos,
                y: yPos,
            });
        } catch (err) {
            throw new OperationError(`Error adding text to image. (${err})`);
        }

        try {
            let imageBuffer;
            if (image.mime === "image/gif") {
                imageBuffer = await image.getBuffer(JimpMime.png);
            } else {
                imageBuffer = await image.getBuffer(image.mime);
            }
            // FORK CHANGE (patches/fork/09): return the image, not the whole pool it was
            // allocated in. https://nodejs.org/docs/latest-v24.x/api/buffer.html#bufbyteoffset
            // -- upstream fixed exactly this in GenerateImage.mjs and left the siblings.
            return imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength);
        } catch (err) {
            throw new OperationError(`Error exporting image. (${err})`);
        }
    }

    /**
     * Displays the blurred image using HTML for web apps
     *
     * @param {ArrayBuffer} data
     * @returns {html}
     */
    present(data) {
        if (!data.byteLength) return "";
        const dataArray = new Uint8Array(data);

        const type = isImage(dataArray);
        if (!type) {
            throw new OperationError("Invalid file type.");
        }

        return `<img src="data:${type};base64,${toBase64(dataArray)}">`;
    }
}

export default AddTextToImage;
