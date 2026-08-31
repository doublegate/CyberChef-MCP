/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Turning a baked result into MCP content blocks, including images and binary.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every result this server has ever returned was a single `text` block. For the 329 string-output
 * operations that is right. For the rest it ranges from awkward to a total loss:
 *
 * **Images were being deleted.** `Generate QR Code` produces `<img src="data:image/png;base64,...">`
 * -- its output type is `html`, and v2.1.0 renders html operations as plain text with
 * `stripHtmlTags`, which removes the whole tag. The caller got `""`. It is not a v2.1.0 regression:
 * v2.0.0 returned `{}` for the same call because it `JSON.stringify`'d the Dish. The operation has
 * never worked over MCP; only the failure mode changed. `Render Image`, `Rotate Image` and the rest
 * of the image set behave identically.
 *
 * MCP has carried an `image` content block since its first revision. Emitting one turns a tool that
 * silently returns nothing into a tool that returns the picture.
 *
 * **Binary is lossless but unreadable.** The 76 `ArrayBuffer`/`byteArray` operations present as a
 * latin1 string, so `Gzip` comes back as mojibake. That was measured rather than assumed, and the
 * measurement matters: the mapping is byte-for-byte reversible (`str.charCodeAt(i) === bytes[i]`
 * for every byte), so **no data is lost** and a client that knows the convention can recover the
 * payload exactly.
 *
 * So this is a usability problem, not a correctness one, and it is treated differently from the
 * image case. Changing the default would alter output for 76 operations to fix something that is
 * not broken; `CYBERCHEF_BINARY_OUTPUT=base64` opts in instead.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import Utils from "../../core/Utils.mjs";
import { dishToText } from "./dish-output.mjs";

/**
 * A `data:` URI carrying base64 image data, as CyberChef's image operations emit it.
 *
 * Deliberately narrow: only `image/<subtype>`, only base64, and the subtype may not contain a
 * quote or angle bracket. The alternative -- parsing the html -- would mean a DOM parser for a
 * string this server generated itself two functions ago.
 */
const DATA_URI_IMAGE = /<img[^>]+src=["']data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)["']/;

/**
 * Magic numbers, longest first so a prefix cannot shadow a longer match.
 *
 * Only formats an MCP client plausibly renders. `Detect File Type` covers the general case and is
 * one `cyberchef_bake` call away; duplicating its ~90-signature table here would be a second copy
 * to keep in step for no gain.
 */
const IMAGE_MAGIC = [
    { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
    { mime: "image/bmp", bytes: [0x42, 0x4d] },
    { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] }
];

/** Output types whose value is bytes rather than text. */
const BINARY_OUTPUT_TYPES = new Set(["ArrayBuffer", "byteArray", "File"]);

/**
 * How binary (non-image) output should be presented.
 *
 * @returns {"text"|"base64"} The configured mode; "text" unless explicitly set otherwise.
 */
export function binaryOutputMode() {
    return process.env.CYBERCHEF_BINARY_OUTPUT === "base64" ? "base64" : "text";
}

/**
 * Pull a base64 image payload out of an html-output operation's markup.
 *
 * @param {string} html - The operation's presented output.
 * @returns {{mimeType: string, data: string}|null} The image, or null if there is not one.
 */
export function imageFromHtml(html) {
    if (typeof html !== "string") return null;
    const m = DATA_URI_IMAGE.exec(html);
    if (!m) return null;
    // Whitespace is legal inside a data URI and illegal inside the base64 an MCP block carries.
    return { mimeType: m[1], data: m[2].replace(/\s+/g, "") };
}

/**
 * Identify an image by its leading bytes.
 *
 * @param {Uint8Array} bytes - The payload.
 * @returns {string|null} The MIME type, or null if it is not a recognised image.
 */
export function sniffImageMime(bytes) {
    if (!bytes || bytes.length < 2) return null;
    for (const { mime, bytes: magic } of IMAGE_MAGIC) {
        if (bytes.length < magic.length) continue;
        if (magic.every((b, i) => bytes[i] === b)) return mime;
    }
    return null;
}

/**
 * Reduce CyberChef's browser markup to plain text.
 *
 * Upstream's own pair, and upstream's own conclusion for non-browser consumers:
 * `DishHTML.toArrayBuffer()` runs exactly this before handing bytes on.
 *
 * @param {string} html - The markup.
 * @returns {string} Plain text.
 */
function stripMarkup(html) {
    return Utils.unescapeHtml(Utils.stripHtmlTags(html, true));
}

/**
 * Coerce a baked value to bytes, if it represents bytes.
 *
 * The string branch is the one that matters in practice. `bakeOnCore` asks the engine for
 * `returnType: "string"`, so a `byteArray`/`ArrayBuffer` operation arrives here as a **latin1
 * string**, not as a buffer -- `From Base64` of a PNG is a string whose char codes are the PNG's
 * bytes. That mapping was verified byte-for-byte (`str.charCodeAt(i) === bytes[i]` for every byte
 * of a gzip payload), which is what makes reconstructing the bytes here exact rather than
 * approximate.
 *
 * Guarded by the declared output type, so an ordinary text result is never reinterpreted as bytes.
 *
 * @param {*} value - The Dish value.
 * @param {string} [outputType] - The operation's declared output type.
 * @returns {Uint8Array|null} The bytes, or null.
 */
function toBytes(value, outputType) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (Array.isArray(value) && value.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) {
        return Uint8Array.from(value);
    }
    if (typeof value === "string" && BINARY_OUTPUT_TYPES.has(outputType)) {
        const bytes = new Uint8Array(value.length);
        for (let i = 0; i < value.length; i++) {
            const code = value.charCodeAt(i);
            // A code above 0xff means the value is not the latin1 byte string this branch assumes,
            // so treat it as text rather than silently truncating data.
            if (code > 0xff) return null;
            bytes[i] = code;
        }
        return bytes;
    }
    return null;
}

/**
 * Render a baked result as MCP content blocks.
 *
 * Three cases, in order:
 *   1. An html-output operation whose markup carries a data-URI image -> an `image` block. This is
 *      the case that was returning an empty string.
 *   2. A binary value whose leading bytes identify an image -> an `image` block. Reached by, for
 *      example, `From Base64` of a PNG, where the operation never produced markup at all.
 *   3. Everything else -> the existing `text` block, byte-lossless for binary, optionally base64
 *      under CYBERCHEF_BINARY_OUTPUT.
 *
 * @param {Object} result - The baked result: `{value, outputType?}`.
 * @param {string} [outputType] - The operation's declared output type, when known.
 * @returns {Array<Object>} MCP content blocks; always at least one.
 */
export function toContentBlocks(result, outputType = result?.outputType) {
    const value = result?.value;

    if (outputType === "html" && typeof value === "string") {
        const image = imageFromHtml(value);
        if (image) {
            return [{ type: "image", data: image.data, mimeType: image.mimeType }];
        }
        // Not an image, so reduce the browser markup to text. Done HERE rather than in
        // `dishToText`, which returns a string value unchanged via its fast path and would hand
        // back a raw `<table class='table table-hover ...'>` -- which is what `Magic` produces,
        // and it is the operation whose readability matters most.
        return [{ type: "text", text: stripMarkup(value) }];
    }

    const bytes = toBytes(value, outputType);
    if (bytes) {
        const mime = sniffImageMime(bytes);
        if (mime) {
            return [{
                type: "image",
                data: Buffer.from(bytes).toString("base64"),
                mimeType: mime
            }];
        }
        if (binaryOutputMode() === "base64") {
            return [{ type: "text", text: Buffer.from(bytes).toString("base64") }];
        }
    }

    return [{ type: "text", text: dishToText(result) }];
}
