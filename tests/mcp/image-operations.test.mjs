/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The 17 jimp-backed image operations, end to end.
 *
 * The defect these pin is upstream's, and it is both a correctness and a disclosure bug. Every one
 * of these operations ended `run()` with
 *
 *     return imageBuffer.buffer;
 *
 * where `imageBuffer` is a Node `Buffer`. A Buffer is a *view*: for a small allocation Node hands
 * back a window into a shared pool, so `.buffer` is not the image -- measured here, a 129-byte PNG
 * came back as a 65,599-byte ArrayBuffer at byteOffset 32. Two consequences:
 *
 *   - The image is unreadable. `present()` does `new Uint8Array(data)` from offset 0, `isImage()`
 *     sees no magic bytes, and the operation throws "Invalid file type." -- from the *presenter*,
 *     after `run()` had already succeeded, which is why the message points nowhere near the cause.
 *   - The extra 65 KB is whatever else the process recently allocated. On a server handling more
 *     than one caller, that is other callers' data.
 *
 * Upstream fixed exactly this in `GenerateImage.mjs`, with a comment citing
 * https://nodejs.org/docs/latest-v24.x/api/buffer.html#bufbyteoffset, and left the 17 siblings
 * unfixed. `patches/fork/09-image-ops-return-pooled-buffer.patch` applies the same fix to all of
 * them; these tests are what stops a future sync from quietly taking it back out.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */
import { describe, it, expect, beforeAll } from "vitest";

// An 8x8 PNG with a red diagonal on blue: small enough that its Buffer is pool-allocated (which is
// the precondition for the defect) and large enough for crop/resize/cover to have something to do.
const PNG8X8 = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAASElEQVR4AXXBgQmAMBAEwfVrupquqK/pe" +
    "ooKCiEkM9eAIYeTkkNanBQPOaTFTvGRQ1qsiokc0mJWLOSQFr9iQw5p8SoO5JAWN/xNGHRq0fVzAAAAAElFTkSuQmCC";

/** Every jimp-backed operation patch 09 touches. All run correctly on their default arguments. */
const IMAGE_OPS = [
    "Add Text To Image", "Blur Image", "Contain Image", "Convert Image Format", "Cover Image",
    "Crop Image", "Dither Image", "Flip Image", "Image Brightness / Contrast", "Image Filter",
    "Image Hue/Saturation/Lightness", "Image Opacity", "Invert Image", "Normalise Image",
    "Resize Image", "Rotate Image", "Sharpen Image",
];

/** Magic-byte prefixes for the formats these operations emit. */
const MAGIC = {
    "image/png": [0x89, 0x50, 0x4e, 0x47],
    "image/jpeg": [0xff, 0xd8, 0xff],
    "image/bmp": [0x42, 0x4d],
    "image/gif": [0x47, 0x49, 0x46],
    "image/tiff": [0x49, 0x49],
};

let bakeOnCore, toContentBlocks;

beforeAll(async () => {
    // Load the generated Node API first, exactly as the server does: it registers every operation
    // module, so the recipe engine resolves them statically rather than by dynamic import.
    await import("../../src/node/index.mjs");
    ({ bakeOnCore } = await import("../../src/node/lib/core-recipe.mjs"));
    ({ toContentBlocks } = await import("../../src/node/lib/content-blocks.mjs"));
}, 60000);

describe("image operations return the image, not the buffer pool", () => {
    it.each(IMAGE_OPS)("%s produces a readable image over the MCP path", async (op) => {
        // Crop's defaults (10x10) exceed this 8x8 fixture, which is correct behaviour, not the
        // defect under test -- so it gets a window that fits.
        const args = op === "Crop Image" ? { "x_position": 0, "y_position": 0, "width": 4, "height": 4 } : undefined;
        const result = await bakeOnCore(PNG8X8, [{ op: "From Base64" }, args ? { op, args } : { op }]);
        const blocks = toContentBlocks(result);

        const image = blocks.find(b => b.type === "image");
        expect(image, `${op} returned no image block: ${JSON.stringify(blocks).slice(0, 200)}`)
            .toBeDefined();

        const magic = MAGIC[image.mimeType];
        expect(magic, `unhandled mime ${image.mimeType}`).toBeDefined();

        const bytes = Buffer.from(image.data, "base64");
        expect([...bytes.subarray(0, magic.length)]).toEqual(magic);

        // The pooled ArrayBuffer measured 65,599 bytes for a 129-byte PNG. Nothing this fixture
        // produces legitimately approaches that, so the size alone separates the two outcomes.
        expect(bytes.length).toBeLessThan(8192);
        expect(bytes.length).toBeGreaterThan(magic.length);
    }, 30000);
});

describe("the underlying defect, at the operation boundary", () => {
    it("run() returns an ArrayBuffer sized to the image, not to its backing allocation", async () => {
        const { default: ImageBrightnessContrast } =
            await import("../../src/core/operations/ImageBrightnessContrast.mjs");

        const png = Buffer.from(PNG8X8, "base64");
        const input = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
        const output = await new ImageBrightnessContrast().run(input, [10, 0]);

        expect(output).toBeInstanceOf(ArrayBuffer);
        // The whole bug in one assertion: unfixed, this is the pool (tens of KB) and byte 0 is
        // whatever happened to be allocated before the image.
        expect(output.byteLength).toBeLessThan(8192);
        expect([...new Uint8Array(output).subarray(0, 4)]).toEqual(MAGIC["image/png"]);
    }, 30000);

    it("names an unknown font face instead of failing somewhere inside jimp", async () => {
        const { default: AddTextToImage } =
            await import("../../src/core/operations/AddTextToImage.mjs");

        const png = Buffer.from(PNG8X8, "base64");
        const input = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
        // Args are positional: Text, Horizontal align, Vertical align, X, Y, Size, Font face, RGBA.
        const args = ["hi", "Center", "Middle", 0, 0, 32, "Comic Sans", 255, 255, 255, 255];

        // Patch 10 replaced a webpack import map with a face-to-filename map, which introduces a
        // lookup that can miss. It has to say so: without the check, an unknown face reaches
        // loadFont as `undefined` and fails as a path error from inside jimp, naming a file rather
        // than the argument the caller got wrong.
        await expect(new AddTextToImage().run(input, args)).rejects.toThrow(/Unknown font face/);
    }, 30000);

    it("present() accepts what run() returned", async () => {
        const { default: InvertImage } =
            await import("../../src/core/operations/InvertImage.mjs");

        const png = Buffer.from(PNG8X8, "base64");
        const input = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
        const op = new InvertImage();
        // Unfixed, this threw OperationError("Invalid file type.") -- from the presenter, long
        // after run() had succeeded, which is what made the failure so hard to attribute.
        expect(op.present(await op.run(input, []))).toMatch(/^<img src="data:image\/png;base64,/);
    }, 30000);
});
