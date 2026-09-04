/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * `List<File>` operations, through a real client.
 *
 * `Unzip`, `Untar` and `Extract Files` were dead through this fork's entire life, and the reason
 * this went unseen for eleven releases is that it CANNOT be reproduced in-process. Two independent
 * defects stack:
 *
 *  1. `Utils.readFile` threw `ERR_INVALID_ARG_TYPE` on the very `File` its signature promises to
 *     accept, so the operation failed inside the presenter after `run()` had succeeded. Fixed by
 *     `patches/fork/11-utils-readfile-accepts-file.patch`.
 *
 *  2. Five operations construct a BARE GLOBAL `File` and none of them imports one. The only
 *     assignment is `global.File = File` in the generated bridge, which this server deliberately
 *     does not import eagerly -- so `new File(...)` resolved to Node's own `File`, a `Blob`
 *     subclass with no `.data`. `Unzip` then returned members with the right NAMES and zero bytes
 *     each: a quiet, plausible-looking wrong answer rather than a crash.
 *
 * Defect 2 is invisible to any test that imports `bakeOnCore`, because `core-recipe.mjs` installs
 * the shim on import and the bug disappears the moment the test harness loads it. It is visible
 * only from outside the process. That is the same blind spot as the empty-`inputSchema` releases,
 * and the same rule closes it: test through a real MCP client, not through the module.
 *
 * The fixtures are built in-process rather than committed, so there is no binary in the tree and
 * no question of what produced it.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, "../../src/node/mcp-server.mjs");
const BOOT_TIMEOUT_MS = 120_000;

/** The bytes each fixture member is expected to carry back. */
const TEXT_MEMBER = "FLAG{list-file-round-trip}\n";
const BINARY_MEMBER = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);

/**
 * CRC-32 of a buffer, as ZIP defines it.
 *
 * Computed here rather than imported: `zlibjs` exposes it only through a bundled UMD build whose
 * shape has changed before, and a fixture builder that breaks on a dependency's export layout is
 * a test that fails for a reason unrelated to what it tests.
 *
 * @param {Buffer} bytes - The data.
 * @returns {number} The checksum, unsigned.
 */
function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A stored (uncompressed) ZIP archive holding one text and one binary member.
 *
 * Written by hand rather than shelled out to `zip`, so the test does not depend on a binary being
 * installed on the runner. Stored entries keep it to header arithmetic; `Unzip` handles method 0
 * and method 8 through the same path, and the defects here are downstream of decompression.
 *
 * @returns {Buffer} The archive.
 */
function buildZip() {
    return buildZipWith([
        { name: "note.txt", data: Buffer.from(TEXT_MEMBER, "utf8") },
        { name: "blob.bin", data: BINARY_MEMBER }
    ]);
}

/**
 * A stored ZIP over an arbitrary member list.
 *
 * @param {Array<{name: string, data: Buffer}>} members - The members.
 * @returns {Buffer} The archive.
 */
function buildZipWith(members) {
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const member of members) {
        const name = Buffer.from(member.name, "utf8");
        const crc = crc32(member.data);

        const local = Buffer.alloc(30 + name.length);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(10, 4);           // version needed
        local.writeUInt16LE(0, 8);            // method: stored
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(member.data.length, 18);
        local.writeUInt32LE(member.data.length, 22);
        local.writeUInt16LE(name.length, 26);
        name.copy(local, 30);

        const central = Buffer.alloc(46 + name.length);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);         // version made by
        central.writeUInt16LE(10, 6);         // version needed
        central.writeUInt16LE(0, 10);         // method: stored
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(member.data.length, 20);
        central.writeUInt32LE(member.data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        name.copy(central, 46);

        locals.push(local, member.data);
        centrals.push(central);
        offset += local.length + member.data.length;
    }

    const directory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(members.length, 8);
    end.writeUInt16LE(members.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...locals, directory, end]);
}

/**
 * A USTAR archive holding the same two members.
 *
 * @returns {Buffer} The archive.
 */
function buildTar() {
    const members = [
        { name: "note.txt", data: Buffer.from(TEXT_MEMBER, "utf8") },
        { name: "blob.bin", data: BINARY_MEMBER }
    ];
    const blocks = [];

    for (const member of members) {
        const header = Buffer.alloc(512);
        header.write(member.name, 0, "utf8");
        header.write("000644 \0", 100);
        header.write("000000 \0", 108);
        header.write("000000 \0", 116);
        header.write(member.data.length.toString(8).padStart(11, "0") + " ", 124);
        header.write("00000000000 ", 136);
        header.write("0", 156);
        header.write("ustar  \0", 257);
        // The checksum is computed with its own field read as spaces, then written back over it.
        header.write("        ", 148);
        let sum = 0;
        for (const byte of header) sum += byte;
        header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);

        const padded = Buffer.alloc(Math.ceil(member.data.length / 512) * 512);
        member.data.copy(padded);
        blocks.push(header, padded);
    }

    return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

describe("List<File> operations, through the official MCP client", () => {
    let client;
    const zip = buildZip();
    const tar = buildTar();

    beforeAll(async () => {
        client = new Client({ name: "list-file-test", version: "0.0.0" }, { capabilities: {} });
        await client.connect(new StdioClientTransport({
            command: process.execPath,
            args: [SERVER]
        }));
    }, BOOT_TIMEOUT_MS);

    afterAll(async () => {
        await client?.close();
    });

    /**
     * Bake a recipe over base64 input and return the text the client receives.
     *
     * @param {Buffer} bytes - The archive.
     * @param {string} operation - The operation to run after decoding.
     * @returns {Promise<string>} The rendered result.
     */
    async function bake(bytes, operation) {
        const result = await client.callTool({
            name: "cyberchef_bake",
            arguments: {
                input: bytes.toString("base64"),
                recipe: [{ op: "From Base64" }, { op: operation }]
            }
        });
        expect(result.isError ?? false).toBe(false);
        return result.content.map(block => block.text ?? "").join("\n");
    }

    it("returns the CONTENTS of every member of a zip, not just its name", async () => {
        const text = await bake(zip, "Unzip");

        // The headline. Before this release each member came back as `(0 bytes, base64)` with an
        // empty body -- names right, payload gone -- which reads like an empty archive rather
        // than like a defect.
        expect(text).toContain(TEXT_MEMBER.trim());
        expect(text).toContain("note.txt");
        expect(text).not.toMatch(/note\.txt \(0 bytes/);
    });

    it("base64-encodes a member that is not text, and says so", async () => {
        const text = await bake(zip, "Unzip");

        // Mojibake would be the easy failure here: a binary member reduced to UTF-8 is lossy and
        // silently so, and the caller has no way to tell it happened.
        expect(text).toContain(`blob.bin (${BINARY_MEMBER.length} bytes, base64)`);
        expect(text).toContain(BINARY_MEMBER.toString("base64"));
    });

    it("names each member, so a caller knows which part came from where", async () => {
        const text = await bake(zip, "Unzip");
        expect(text).toContain("=== note.txt (");
        expect(text).toContain("=== blob.bin (");
    });

    it("does the same for tar", async () => {
        const text = await bake(tar, "Untar");
        expect(text).toContain(TEXT_MEMBER.trim());
        expect(text).toContain(BINARY_MEMBER.toString("base64"));
    });

    it("returns the embedded archive that Extract Files finds", async () => {
        // `Extract Files` carves by signature and hands back what it found as a `List<File>`, so
        // it exercises the same path from a different producer.
        const text = await bake(zip, "Extract Files");
        expect(text).toMatch(/=== extracted_at_0x0\.zip \(\d+ bytes, base64\) ===/);
        expect(text).not.toMatch(/\(0 bytes/);
    });

    it("does not return the browser's file-list markup", async () => {
        const text = await bake(zip, "Unzip");

        // What the presenter produces is a table of names, sizes and two button labels with the
        // contents nowhere in it. It is a plausible-looking answer, which is what makes it worth
        // an assertion of its own.
        expect(text).not.toContain("<div");
        expect(text).not.toContain("Download");
    });
});

describe("the List<File> rendering itself, in-process", () => {
    // The suite above is the one that catches the defect, and it must stay out-of-process for the
    // reason its header gives. But an out-of-process test contributes NO coverage: the
    // instrumentation runs in this process and the server runs in another, so the rendering block
    // measured as untested and the `src/node/lib/**` gate failed.
    //
    // The rendering is not the part that needs a subprocess. Only the missing global `File` was
    // invisible in-process, and importing `bakeOnCore` installs it. So the branches are exercised
    // here, directly, where they can be counted -- and the two suites assert different things:
    // this one that the rendering is right, the one above that it is reachable at all.
    const zip = buildZip();

    it("renders text and binary members from bakeOnCore", async () => {
        const { bakeOnCore } = await import("../../src/node/lib/core-recipe.mjs");
        const out = await bakeOnCore(zip.toString("base64"), [
            { op: "From Base64" }, { op: "Unzip" }
        ]);
        const text = String(out);

        expect(text).toContain(`=== note.txt (${TEXT_MEMBER.length} bytes) ===`);
        expect(text).toContain(TEXT_MEMBER.trim());
        expect(text).toContain(`=== blob.bin (${BINARY_MEMBER.length} bytes, base64) ===`);
        expect(text).toContain(BINARY_MEMBER.toString("base64"));
        // `value` and `toString()` must agree; a caller reaches for either.
        expect(out.value).toBe(text);
    });

    it("labels a zero-length member as base64 rather than as text", async () => {
        // `bytes.length > 0` is the guard: without it an empty member is "printable" by vacuous
        // truth on `every`, and an empty file would claim to be text it does not contain.
        const { bakeOnCore } = await import("../../src/node/lib/core-recipe.mjs");
        const empty = buildZipWith([{ name: "empty.dat", data: Buffer.alloc(0) }]);
        const text = String(await bakeOnCore(empty.toString("base64"), [
            { op: "From Base64" }, { op: "Unzip" }
        ]));
        expect(text).toContain("=== empty.dat (0 bytes, base64) ===");
    });

    it("treats tab, LF and CR as printable, and other control bytes as not", async () => {
        const { bakeOnCore } = await import("../../src/node/lib/core-recipe.mjs");
        const whitespace = Buffer.from("a\tb\r\nc", "latin1");
        const control = Buffer.from([0x41, 0x07, 0x42]);
        const archive = buildZipWith([
            { name: "ws.txt", data: whitespace },
            { name: "bell.bin", data: control }
        ]);
        const text = String(await bakeOnCore(archive.toString("base64"), [
            { op: "From Base64" }, { op: "Unzip" }
        ]));
        expect(text).toContain(`=== ws.txt (${whitespace.length} bytes) ===`);
        expect(text).toContain(`=== bell.bin (${control.length} bytes, base64) ===`);
    });

    it("treats valid UTF-8 as text, not as binary", async () => {
        // An ASCII-only rule called `résumé` binary and handed the caller base64 of perfectly
        // readable text. Most of the world's text has a byte above 0x7f somewhere, so an ASCII
        // rule makes this branch wrong for most non-English archives. Found in review on PR #118.
        const { bakeOnCore } = await import("../../src/node/lib/core-recipe.mjs");
        const accented = Buffer.from("résumé — naïve café\n", "utf8");
        const archive = buildZipWith([{ name: "cv.txt", data: accented }]);
        const text = String(await bakeOnCore(archive.toString("base64"), [
            { op: "From Base64" }, { op: "Unzip" }
        ]));

        expect(text).toContain(`=== cv.txt (${accented.length} bytes) ===`);
        expect(text).toContain("résumé — naïve café");
        expect(text).not.toContain("base64");
    });

    it("still calls invalid UTF-8 binary, rather than decoding it to replacement characters",
        async () => {
            // The other half. `fatal: true` on the decoder is what makes this work: the default
            // replaces an invalid sequence with U+FFFD and returns a string that looks fine, which
            // is the silent corruption the base64 fallback exists to prevent.
            const { bakeOnCore } = await import("../../src/node/lib/core-recipe.mjs");
            const invalid = Buffer.from([0x41, 0xc3, 0x28, 0x42]);   // 0xc3 0x28 is not valid UTF-8
            const archive = buildZipWith([{ name: "bad.txt", data: invalid }]);
            const text = String(await bakeOnCore(archive.toString("base64"), [
                { op: "From Base64" }, { op: "Unzip" }
            ]));

            expect(text).toContain(`=== bad.txt (${invalid.length} bytes, base64) ===`);
            expect(text).toContain(invalid.toString("base64"));
            expect(text).not.toContain("\uFFFD");
        });

    it("leaves a non-List<File> result alone", async () => {
        // The block is keyed on the dish type, so an ordinary string result must not enter it.
        const { bakeOnCore } = await import("../../src/node/lib/core-recipe.mjs");
        const out = await bakeOnCore("hello", [{ op: "To Base64" }]);
        expect(String(out)).toBe("aGVsbG8=");
    });
});
