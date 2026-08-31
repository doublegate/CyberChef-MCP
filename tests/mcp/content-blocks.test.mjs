/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Image, audio and binary content blocks.
 *
 * The defect these pin is total, silent data loss: `Generate QR Code` produced a valid PNG and the
 * caller received `""`, because the operation's output type is `html` and the html-to-text
 * conversion stripped the `<img>` tag that carried the entire payload. It had never worked over
 * MCP -- v2.0.0 returned `{}` for the same call -- so there is no prior behaviour to preserve, only
 * one to establish. `Play Media` lost its audio the same way, leaving 23 characters of player
 * chrome, which is why one extractor covers `<img>`, `<audio>` and `<video>`.
 *
 * The binary half is deliberately NOT changed by default, and the tests say why: the latin1
 * presentation is byte-for-byte reversible, so it is a readability problem rather than a
 * correctness one, and altering output for 76 operations to fix something that is not broken is a
 * worse trade than an opt-in.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, afterEach } from "vitest";
import {
    toContentBlocks, mediaFromHtml, sniffMediaMime, binaryOutputMode
} from "../../src/node/lib/content-blocks.mjs";

/** A 1x1 transparent PNG. */
const PNG_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/**
 * The latin1 string form the core engine hands back for a binary result.
 *
 * @param {string} b64 - Base64 payload.
 * @returns {string} One character per byte.
 */
function asLatin1(b64) {
    return Buffer.from(b64, "base64").toString("latin1");
}

afterEach(() => {
    delete process.env.CYBERCHEF_BINARY_OUTPUT;
});

describe("mediaFromHtml", () => {
    it("extracts a data-URI image from an img tag", () => {
        const img = mediaFromHtml(`<img src="data:image/png;base64,${PNG_B64}">`);
        expect(img).toEqual({ mimeType: "image/png", data: PNG_B64 });
    });

    it("accepts single quotes and extra attributes", () => {
        const img = mediaFromHtml(`<img class='x' src='data:image/gif;base64,R0lGODlh' alt='y'>`);
        expect(img.mimeType).toBe("image/gif");
    });

    it("strips whitespace, which is legal in a data URI and illegal in a content block", () => {
        const img = mediaFromHtml('<img src="data:image/png;base64,iVBO Rw0K\nGgo=">');
        expect(img.data).toBe("iVBORw0KGgo=");
    });

    it("ignores markup with no image", () => {
        expect(mediaFromHtml("<table class='table'><tr><td>Magic</td></tr></table>")).toBeNull();
        expect(mediaFromHtml("<img src='https://example.com/x.png'>")).toBeNull();
        expect(mediaFromHtml("")).toBeNull();
        expect(mediaFromHtml(null)).toBeNull();
    });

    it("does not treat a non-image data URI as an image", () => {
        expect(mediaFromHtml('<img src="data:text/html;base64,PGI+">')).toBeNull();
    });
});

describe("sniffMediaMime", () => {
    it("identifies the formats a client can render", () => {
        expect(sniffMediaMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
        expect(sniffMediaMime(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
        expect(sniffMediaMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
        expect(sniffMediaMime(Uint8Array.from([0x42, 0x4d, 0x36]))).toBe("image/bmp");
    });

    it("returns null for anything else, including truncated magic", () => {
        expect(sniffMediaMime(Uint8Array.from([0x1f, 0x8b, 0x08]))).toBeNull();   // gzip
        expect(sniffMediaMime(Uint8Array.from([0x89, 0x50]))).toBeNull();          // partial PNG
        expect(sniffMediaMime(Uint8Array.from([]))).toBeNull();
        expect(sniffMediaMime(null)).toBeNull();
    });
});

describe("toContentBlocks", () => {
    it("returns an image block for an html operation carrying a data-URI image", () => {
        // The QR defect, as a unit.
        const blocks = toContentBlocks(
            { value: `<img src="data:image/png;base64,${PNG_B64}">` }, "html");
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe("image");
        expect(blocks[0].mimeType).toBe("image/png");
        expect(blocks[0].data).toBe(PNG_B64);
    });

    it("reduces html that is NOT an image to readable text", () => {
        // Magic's answer is a table of candidate decodings. Raw markup is close to unreadable and
        // expensive; this must not regress while fixing the image case.
        const blocks = toContentBlocks(
            { value: "<table class='table table-hover'><tr><td>From_Base64</td></tr></table>" }, "html");
        expect(blocks[0].type).toBe("text");
        expect(blocks[0].text).not.toContain("<table");
        expect(blocks[0].text).toContain("From_Base64");
    });

    it("returns an image block when binary output IS an image", () => {
        // Reached by `From Base64` of a PNG, where no markup is ever produced. The value arrives as
        // a latin1 string because the engine is asked for returnType "string".
        const blocks = toContentBlocks({ value: asLatin1(PNG_B64) }, "byteArray");
        expect(blocks[0].type).toBe("image");
        expect(blocks[0].mimeType).toBe("image/png");
        expect(blocks[0].data).toBe(PNG_B64);
    });

    it("leaves non-image binary as lossless text by default", () => {
        const gzip = String.fromCharCode(0x1f, 0x8b, 0x08, 0x00, 0xff);
        const blocks = toContentBlocks({ value: gzip }, "byteArray");
        expect(blocks[0].type).toBe("text");
        expect(blocks[0].text).toBe(gzip);
        // The property the default rests on: every character is exactly one byte.
        expect(Array.from(blocks[0].text, c => c.charCodeAt(0))).toEqual([0x1f, 0x8b, 0x08, 0x00, 0xff]);
    });

    it("returns base64 for non-image binary when asked", () => {
        process.env.CYBERCHEF_BINARY_OUTPUT = "base64";
        const gzip = String.fromCharCode(0x1f, 0x8b, 0x08);
        const blocks = toContentBlocks({ value: gzip }, "byteArray");
        expect(blocks[0].type).toBe("text");
        expect(blocks[0].text).toBe(Buffer.from([0x1f, 0x8b, 0x08]).toString("base64"));
    });

    it("never reinterprets ordinary text as bytes", () => {
        // The guard that keeps the latin1 branch from firing on the 329 string operations.
        const blocks = toContentBlocks({ value: "Hello, Chef!" }, "string");
        expect(blocks[0].type).toBe("text");
        expect(blocks[0].text).toBe("Hello, Chef!");
    });

    it("treats a string with a code point above 0xff as text, not truncated bytes", () => {
        // Declared binary but not actually a latin1 byte string. Truncating would silently corrupt.
        const blocks = toContentBlocks({ value: "héllo ☃" }, "byteArray");
        expect(blocks[0].type).toBe("text");
        expect(blocks[0].text).toBe("héllo ☃");
    });

    it("accepts an ArrayBuffer and a byte array directly", () => {
        const bytes = Buffer.from(PNG_B64, "base64");
        for (const value of [
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            Array.from(bytes)
        ]) {
            const blocks = toContentBlocks({ value }, "ArrayBuffer");
            expect(blocks[0].type).toBe("image");
            expect(blocks[0].data).toBe(PNG_B64);
        }
    });

    it("reads the output type off the result when not given one", () => {
        const blocks = toContentBlocks({
            value: `<img src="data:image/png;base64,${PNG_B64}">`,
            outputType: "html"
        });
        expect(blocks[0].type).toBe("image");
    });

    it("falls back to a text block for anything unrecognised", () => {
        expect(toContentBlocks({ value: 42 })[0]).toEqual({ type: "text", text: "42" });
    });
});

describe("binaryOutputMode", () => {
    it("defaults to text and honours the opt-in", () => {
        expect(binaryOutputMode()).toBe("text");
        process.env.CYBERCHEF_BINARY_OUTPUT = "base64";
        expect(binaryOutputMode()).toBe("base64");
        process.env.CYBERCHEF_BINARY_OUTPUT = "nonsense";
        expect(binaryOutputMode()).toBe("text");
    });
});

describe("audio and video, which lost their payload the same way images did", () => {
    /** A 144-byte 8-bit mono WAV of silence, as `Play Media` would emit it. */
    const WAV = (() => {
        const wav = Buffer.alloc(44 + 100, 0x80);
        wav.write("RIFF", 0);
        wav.writeUInt32LE(36 + 100, 4);
        wav.write("WAVEfmt ", 8);
        wav.writeUInt32LE(16, 16);       // fmt chunk size
        wav.writeUInt16LE(1, 20);        // PCM
        wav.writeUInt16LE(1, 22);        // mono
        wav.writeUInt32LE(8000, 24);     // sample rate
        wav.writeUInt32LE(8000, 28);     // byte rate
        wav.writeUInt16LE(1, 32);        // block align
        wav.writeUInt16LE(8, 34);        // bits per sample
        wav.write("data", 36);
        wav.writeUInt32LE(100, 40);
        return wav;
    })();
    const WAV_B64 = WAV.toString("base64");

    it("returns an audio block for Play Media's markup", () => {
        // Before: `stripHtmlTags` removed the tag and left 23 characters of player chrome, with
        // the recording gone. Exactly the QR defect, wearing a different tag.
        const html = `<audio src='data:audio/x-wav;base64,${WAV_B64}' type='audio/x-wav' controls>`;
        const blocks = toContentBlocks({ value: html }, "html");
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe("audio");
        expect(blocks[0].mimeType).toBe("audio/x-wav");
        expect(blocks[0].data).toBe(WAV_B64);
    });

    it("extracts from img, audio and video alike", () => {
        for (const [tag, mime] of [["img", "image/png"], ["audio", "audio/mpeg"], ["video", "video/mp4"]]) {
            const found = mediaFromHtml(`<${tag} src="data:${mime};base64,QUJD">`);
            expect(found, tag).toEqual({ mimeType: mime, data: "QUJD" });
        }
    });

    it("returns video as a recoverable data URI, since MCP has no video block", () => {
        // The honest option. Returning an `image` block for a video would be worse than returning
        // nothing, and stripping it is what this whole module exists to stop.
        const blocks = toContentBlocks({ value: '<video src="data:video/mp4;base64,QUJD" controls>' }, "html");
        expect(blocks[0].type).toBe("text");
        expect(blocks[0].text).toBe("data:video/mp4;base64,QUJD");
    });

    it("identifies audio by magic number too", () => {
        expect(sniffMediaMime(WAV)).toBe("audio/wav");
        expect(sniffMediaMime(Uint8Array.from([0x49, 0x44, 0x33, 0x04]))).toBe("audio/mpeg");   // ID3
        expect(sniffMediaMime(Uint8Array.from([0x4f, 0x67, 0x67, 0x53]))).toBe("audio/ogg");
    });

    it("reads the RIFF form type instead of guessing from the first four bytes", () => {
        // RIFF....WAVE is audio and RIFF....WEBP is an image; the prefix is identical, so a plain
        // magic table would have to pick one and be wrong half the time.
        const riff = (form) => Uint8Array.from([
            ...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from(form)
        ]);
        expect(sniffMediaMime(riff("WAVE"))).toBe("audio/wav");
        expect(sniffMediaMime(riff("WEBP"))).toBe("image/webp");
        expect(sniffMediaMime(riff("AVI "))).toBeNull();
        // Truncated before the form type: not enough to decide, so decide nothing.
        expect(sniffMediaMime(Uint8Array.from(Buffer.from("RIFF")))).toBeNull();
    });

    it("promotes sniffed audio bytes to an audio block", () => {
        const latin1 = WAV.toString("latin1");
        const blocks = toContentBlocks({ value: latin1 }, "byteArray");
        expect(blocks[0].type).toBe("audio");
        expect(blocks[0].mimeType).toBe("audio/wav");
        expect(blocks[0].data).toBe(WAV_B64);
    });
});
