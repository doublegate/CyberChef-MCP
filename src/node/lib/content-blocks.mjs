/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Turning a baked result into MCP content blocks, including images, audio and binary.
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
 * **Audio was going the same way, and is the same fix.** `Play Media` emits
 * `<audio src='data:audio/x-wav;base64,...' controls>`. Stripping the tag left **23 characters of
 * player chrome** and deleted the recording. MCP has an `audio` block too, so the only thing that
 * differed was which tag the payload rode in -- hence one extractor for `<img>`, `<audio>` and
 * `<video>` rather than three.
 *
 * Video is the honest exception: MCP has no block for it, so the data URI is returned as text.
 * Unreadable, but recoverable, which is the whole difference between that and stripping.
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
 * A `data:` URI carrying base64 media, as CyberChef's media operations emit it.
 *
 * Covers `<img>`, `<audio>` and `<video>`, because all three lose their payload to the same
 * html-to-text conversion. `Play Media` emits
 * `<audio src='data:audio/x-wav;base64,...' controls>`; stripping the tag left 23 characters of
 * player chrome and deleted the recording.
 *
 * Deliberately narrow: a known top-level type, base64 only, and a subtype that may not contain a
 * quote or angle bracket. The alternative -- parsing the html -- would mean a DOM parser for a
 * string this server generated itself two functions ago.
 */
const DATA_URI_MEDIA =
    /<(?:img|audio|video)[^>]+src=["']data:((?:image|audio|video)\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)["']/;

/**
 * Magic numbers, longest first so a prefix cannot shadow a longer match.
 *
 * Only formats an MCP client plausibly renders, and only the two kinds MCP has a content block
 * for. `Detect File Type` covers the general case and is one `cyberchef_bake` call away;
 * duplicating its ~90-signature table here would be a second copy to keep in step for no gain.
 */
const MEDIA_MAGIC = [
    { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { mime: "audio/ogg", bytes: [0x4f, 0x67, 0x67, 0x53] },
    { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
    { mime: "audio/mpeg", bytes: [0x49, 0x44, 0x33] },
    { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
    { mime: "image/bmp", bytes: [0x42, 0x4d] }
];

/**
 * RIFF containers need their form type read to be identified.
 *
 * `RIFF....WAVE` is audio and `RIFF....WEBP` is an image; the first four bytes are identical, so a
 * plain prefix table would have to guess. Checked separately rather than by extending the table
 * with a wildcard, which would make every other entry harder to read.
 *
 * @param {Uint8Array} bytes - The payload.
 * @returns {string|null} The MIME type, or null.
 */
function riffMime(bytes) {
    if (bytes.length < 12) return null;
    const magic = String.fromCharCode(...bytes.slice(0, 4));
    if (magic !== "RIFF") return null;
    const form = String.fromCharCode(...bytes.slice(8, 12));
    if (form === "WAVE") return "audio/wav";
    if (form === "WEBP") return "image/webp";
    return null;
}

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
 * Pull a base64 media payload out of an html-output operation's markup.
 *
 * @param {string} html - The operation's presented output.
 * @returns {{mimeType: string, data: string}|null} The payload, or null if there is not one.
 */
export function mediaFromHtml(html) {
    if (typeof html !== "string") return null;
    const m = DATA_URI_MEDIA.exec(html);
    if (!m) return null;
    // Whitespace is legal inside a data URI and illegal inside the base64 an MCP block carries.
    return { mimeType: m[1], data: m[2].replace(/\s+/g, "") };
}

/**
 * Identify renderable media by its leading bytes.
 *
 * @param {Uint8Array} bytes - The payload.
 * @returns {string|null} The MIME type, or null if it is not recognised.
 */
export function sniffMediaMime(bytes) {
    if (!bytes || bytes.length < 2) return null;
    for (const { mime, bytes: magic } of MEDIA_MAGIC) {
        if (bytes.length < magic.length) continue;
        if (magic.every((b, i) => bytes[i] === b)) return mime;
    }
    return riffMime(bytes);
}

/**
 * The MCP content-block type that carries a given MIME type.
 *
 * MCP has a block for images and one for audio, and none for video -- so video keeps the payload
 * rather than pretending to be something it is not: it falls through to the caller's decision
 * below. Returning "image" for a video would be worse than returning nothing.
 *
 * @param {string} mimeType - The payload's MIME type.
 * @returns {"image"|"audio"|null} The block type, or null when MCP has none.
 */
function blockTypeFor(mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("audio/")) return "audio";
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
 * Four cases, in order:
 *   1. An html-output operation whose markup carries a data-URI image or audio payload -> an
 *      `image` or `audio` block. This is the case that was returning an empty string.
 *   2. The same for video, which MCP has no block for: the data URI is returned as text, so the
 *      payload is recoverable rather than deleted.
 *   3. A binary value whose leading bytes identify renderable media -> the matching block. Reached
 *      by, for example, `From Base64` of a PNG, where no markup is ever produced.
 *   4. Everything else -> the existing `text` block, byte-lossless for binary, optionally base64
 *      under CYBERCHEF_BINARY_OUTPUT.
 *
 * @param {Object} result - The baked result: `{value, outputType?}`.
 * @param {string} [outputType] - The operation's declared output type, when known.
 * @returns {Array<Object>} MCP content blocks; always at least one.
 */
export function toContentBlocks(result, outputType = result?.outputType) {
    const value = result?.value;

    if (outputType === "html" && typeof value === "string") {
        const media = mediaFromHtml(value);
        const blockType = media && blockTypeFor(media.mimeType);
        if (blockType) {
            return [{ type: blockType, data: media.data, mimeType: media.mimeType }];
        }
        // Video reaches here: MCP has no block for it, so the base64 payload is returned as text
        // rather than stripped away. Unreadable, but recoverable -- which is the whole difference
        // between this and what stripping did.
        if (media) {
            return [{ type: "text", text: `data:${media.mimeType};base64,${media.data}` }];
        }
        // Not media at all, so reduce the browser markup to text. Done HERE rather than in
        // `dishToText`, which returns a string value unchanged via its fast path and would hand
        // back a raw `<table class='table table-hover ...'>` -- which is what `Magic` produces,
        // and it is the operation whose readability matters most.
        return [{ type: "text", text: stripMarkup(value) }];
    }

    const bytes = toBytes(value, outputType);
    if (bytes) {
        const mime = sniffMediaMime(bytes);
        const blockType = mime && blockTypeFor(mime);
        if (blockType) {
            return [{
                type: blockType,
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
