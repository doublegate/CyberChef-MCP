/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Image and binary content blocks.
 *
 * The defect these pin is total, silent data loss: `Generate QR Code` produced a valid PNG and the
 * caller received `""`, because the operation's output type is `html` and the html-to-text
 * conversion stripped the `<img>` tag that carried the entire payload. It had never worked over
 * MCP -- v2.0.0 returned `{}` for the same call -- so there is no prior behaviour to preserve, only
 * one to establish.
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
    toContentBlocks, imageFromHtml, sniffImageMime, binaryOutputMode
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

describe("imageFromHtml", () => {
    it("extracts a data-URI image from an img tag", () => {
        const img = imageFromHtml(`<img src="data:image/png;base64,${PNG_B64}">`);
        expect(img).toEqual({ mimeType: "image/png", data: PNG_B64 });
    });

    it("accepts single quotes and extra attributes", () => {
        const img = imageFromHtml(`<img class='x' src='data:image/gif;base64,R0lGODlh' alt='y'>`);
        expect(img.mimeType).toBe("image/gif");
    });

    it("strips whitespace, which is legal in a data URI and illegal in a content block", () => {
        const img = imageFromHtml('<img src="data:image/png;base64,iVBO Rw0K\nGgo=">');
        expect(img.data).toBe("iVBORw0KGgo=");
    });

    it("ignores markup with no image", () => {
        expect(imageFromHtml("<table class='table'><tr><td>Magic</td></tr></table>")).toBeNull();
        expect(imageFromHtml("<img src='https://example.com/x.png'>")).toBeNull();
        expect(imageFromHtml("")).toBeNull();
        expect(imageFromHtml(null)).toBeNull();
    });

    it("does not treat a non-image data URI as an image", () => {
        expect(imageFromHtml('<img src="data:text/html;base64,PGI+">')).toBeNull();
    });
});

describe("sniffImageMime", () => {
    it("identifies the formats a client can render", () => {
        expect(sniffImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
        expect(sniffImageMime(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
        expect(sniffImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
        expect(sniffImageMime(Uint8Array.from([0x42, 0x4d, 0x36]))).toBe("image/bmp");
    });

    it("returns null for anything else, including truncated magic", () => {
        expect(sniffImageMime(Uint8Array.from([0x1f, 0x8b, 0x08]))).toBeNull();   // gzip
        expect(sniffImageMime(Uint8Array.from([0x89, 0x50]))).toBeNull();          // partial PNG
        expect(sniffImageMime(Uint8Array.from([]))).toBeNull();
        expect(sniffImageMime(null)).toBeNull();
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
