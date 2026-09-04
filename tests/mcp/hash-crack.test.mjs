/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The question that follows `hash_identify`, and the one it refuses to pretend to answer.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import tool from "../../src/node/tools/hash-crack.mjs";

const md5 = (value) => createHash("md5").update(value).digest("hex");
const sha1 = (value) => createHash("sha1").update(value).digest("hex");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const run = (args) => tool.run(tool.inputSchema.parse(args));

describe("hash_crack", () => {
    it("recovers a password from the built-in list", async () => {
        const r = await run({ hashes: [md5("password")] });
        expect(r.cracked[0]).toMatchObject({ plaintext: "password", algorithm: "md5" });
    });

    it("recovers a mutation of a list word", async () => {
        const r = await run({ hashes: [sha1("Dragon1")] });
        expect(r.cracked[0].plaintext).toBe("Dragon1");
    });

    it("cracks NTLM, which needs an MD4 that OpenSSL 3 will not give you", async () => {
        // `createHash("md4")` throws ERR_OSSL_EVP_UNSUPPORTED on any modern build, so this digest
        // is implemented in the tool. The vector is the whole reason that implementation is
        // trustworthy: it is checked against RFC 1320 below, and here against a real NTLM hash.
        const r = await run({ hashes: ["becedb42ec3c5c7f965255338be4453c"], algorithm: "ntlm" });
        expect(r.cracked[0]).toMatchObject({ plaintext: "letmein", algorithm: "ntlm" });
    });

    it("reproduces the RFC 1320 MD4 vectors through the NTLM path", async () => {
        // NTLM is MD4 of the UTF-16LE password, so the empty password is MD4 of the empty string --
        // 31d6cfe0d16ae931b73c59d7e0c089c0, the vector every NTLM tool is recognised by.
        const r = await run({ hashes: ["31d6cfe0d16ae931b73c59d7e0c089c0"], algorithm: "ntlm", wordlist: [""] });
        expect(r.cracked[0].plaintext).toBe("");
    });

    it("tries both digests when the length is ambiguous", async () => {
        // 32 hex characters is MD5 or NTLM and nothing about the string resolves it. Trying both
        // costs one pass and removes a guess the caller would otherwise have to make.
        const r = await run({ hashes: [md5("qwerty")] });
        expect(r.algorithms_tried).toEqual(expect.arrayContaining(["md5", "ntlm"]));
    });

    it("shares one pass over the wordlist between many hashes", async () => {
        const r = await run({ hashes: [md5("password"), md5("qwerty"), sha256("letmein")] });
        expect(r.cracked).toHaveLength(3);
    });

    it("refuses a slow scheme by name, and says it is working as intended", async () => {
        const r = await run({ hashes: ["$2b$12$abcdefghijklmnopqrstuv"] });

        // "Unsupported" would send a caller looking for another tool. Naming the scheme tells them
        // to stop: a pure-JS attempt would run, find nothing, and imply the password is strong.
        expect(r.refused[0].scheme).toBe("bcrypt");
        expect(r.assessment).toMatch(/working as intended/);
        expect(r.next).toMatch(/hashcat or John the Ripper/);
    });

    it("recognises yescrypt, now the default on most Linux distributions", async () => {
        const r = await run({ hashes: ["$y$j9T$abcdefghijklmnop$qrstuvwxyz"] });
        expect(r.refused[0].scheme).toBe("yescrypt");
    });

    it("says what a clean run rules out, and what it does not", async () => {
        const r = await run({ hashes: [md5("j8Fq2p!zX9@vLmT4")], mutations: false });

        expect(r.cracked).toHaveLength(0);
        expect(r.wordlist_exhausted).toBe(true);
        // The password may be strong; the storage is a defect either way, and only one of those
        // two facts is about the password.
        expect(r.assessment).toMatch(/storage defect/);
    });

    it("accepts a caller wordlist and reports it was exhausted", async () => {
        const r = await run({
            hashes: [md5("correcthorsebatterystaple")],
            wordlist: ["wrong", "correcthorsebatterystaple"], mutations: false, "include_common": false
        });
        expect(r.cracked[0].plaintext).toBe("correcthorsebatterystaple");
        expect(r.candidates_tried).toBe(2);
    });

    it("checks the clock during the search, not only between words", async () => {
        // The budget test fires every 1024 CANDIDATES rather than every word, because with
        // mutations on one word is about twenty candidates and a per-word check can overshoot by
        // that much. It needs more than 1024 candidates to run at all, which nothing else here
        // supplies.
        const r = await run({
            hashes: [md5("needle-in-the-haystack")],
            wordlist: Array.from({ length: 4000 }, (_, i) => `filler${i}`),
            mutations: false, "include_common": false
        });

        expect(r.candidates_tried).toBe(4000);
        expect(r.wordlist_exhausted).toBe(true);
        expect(r.cracked).toHaveLength(0);
    }, 30000);

    it.each([["sha384", 96], ["sha512", 128]])(
        "cracks %s, whose length nothing else in this file exercises", async (algorithm, length) => {
            const digest = createHash(algorithm).update("password").digest("hex");
            expect(digest).toHaveLength(length);
            const r = await run({ hashes: [digest] });
            expect(r.cracked[0]).toMatchObject({ plaintext: "password", algorithm });
        });

    it("rejects something that is neither hex nor a crypt string", async () => {
        await expect(run({ hashes: ["not a hash at all"] }))
            .rejects.toThrow(/not hex and is not a recognised crypt/);
    });

    it("rejects a hex length no supported digest has", async () => {
        await expect(run({ hashes: ["abcdef"] })).rejects.toThrow(/No supported digest/);
    });
});
