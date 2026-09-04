/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Corpus-level hash analysis: the questions a per-hash tool cannot answer.
 *
 * The reason this tool exists is the reason these tests are written against RELATIONSHIPS rather
 * than against single values -- "these two accounts share a password" and "this is the weakest
 * algorithm present" are properties of the set, and calling `hash_identify` in a loop produces
 * neither.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import hashStatistics from "../../src/node/tools/hash-statistics.mjs";

const BCRYPT = "$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
const MD5_PASSWORD = "5f4dcc3b5aa765d61d8327deb882cf99";
const SHA512CRYPT =
    "$6$rounds=5000$abcdefgh$" + "A".repeat(86);
const ARGON2ID =
    "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";

describe("hash_statistics: what only a corpus shows", () => {
    it("finds accounts sharing a password, and says why that is a finding", async () => {
        const r = await hashStatistics.run({
            input: `alice:${MD5_PASSWORD}\nbob:${MD5_PASSWORD}\ncarol:${BCRYPT}`,
            "reveal_shared": true
        });

        expect(r.shared_passwords).toBe(1);
        expect(r.shared_detail[0].accounts).toBe(2);
        expect(r.shared_detail[0].who).toEqual(["alice", "bob"]);
        // The point is not that two strings match -- it is that a salted scheme makes the match
        // impossible, so the collision indicts the scheme as well as the users.
        expect(r.assessment).toMatch(/in a salted one it should be impossible/);
    });

    it("redacts on request, and still reports the count", async () => {
        const r = await hashStatistics.run({
            input: `alice:${MD5_PASSWORD}\nbob:${MD5_PASSWORD}`,
            "reveal_shared": false
        });

        expect(r.shared_passwords).toBe(1);
        expect(r.shared_detail[0]).not.toHaveProperty("who");
        expect(r.shared_detail[0].digest).not.toBe(MD5_PASSWORD);
        expect(r.shared_detail[0].digest).toContain("...");
    });

    it("names the weakest format rather than the most common one", async () => {
        // Four bcrypt against one MD5: the majority is strong and the answer is still MD5,
        // because a corpus is as weak as its weakest entry and the caller wants to know where to
        // start.
        const r = await hashStatistics.run({
            input: [BCRYPT, BCRYPT, BCRYPT, BCRYPT, MD5_PASSWORD].join("\n"),
            "reveal_shared": true
        });

        expect(r.weakest_format.format).toBe("MD5");
        expect(r.formats[0].format).toBe("bcrypt");
        expect(r.next).toMatch(/Start with the 1 MD5/);
    });

    it("reads /etc/shadow as it comes, including locked and disabled accounts", async () => {
        const shadow = [
            "# comment line",
            `root:${SHA512CRYPT}:19000:0:99999:7:::`,
            "daemon:*:19000:0:99999:7:::",
            "sync:!:19000:0:99999:7:::",
            "",
            `app:${ARGON2ID}:19000:0:99999:7:::`
        ].join("\n");

        const r = await hashStatistics.run({ input: shadow, "reveal_shared": true });

        expect(r.entries).toBe(4);
        expect(r.placeholders).toBe(2);
        const formats = r.formats.map(f => f.format);
        expect(formats).toContain("sha512crypt");
        expect(formats).toContain("argon2id");
        // The ageing fields after the hash must not become part of it.
        expect(r.formats.find(f => f.format === "sha512crypt").basis).toBe("structure");
    });

    it("calls a mixed corpus what it usually is: an unfinished migration", async () => {
        const r = await hashStatistics.run({
            input: [MD5_PASSWORD, BCRYPT, ARGON2ID].join("\n"), "reveal_shared": true
        });

        expect(r.distinct_formats).toBe(3);
        expect(r.assessment).toMatch(/migration that was never finished/);
    });

    it("agrees with itself about singular and plural", async () => {
        const one = await hashStatistics.run({
            input: `a:${MD5_PASSWORD}\nb:${MD5_PASSWORD}\nc:!`, "reveal_shared": true });
        expect(one.assessment).toContain("1 digest appears");
        expect(one.assessment).toContain("1 entry is a placeholder rather than a hash");

        const many = await hashStatistics.run({
            input: [`a:${MD5_PASSWORD}`, `b:${MD5_PASSWORD}`, "c:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    "d:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "e:!", "f:!"].join("\n"),
            "reveal_shared": true });
        expect(many.assessment).toContain("2 digests appear");
        expect(many.assessment).toContain("2 entries are placeholders rather than hashes");
    });

    it("refuses an empty corpus and a corpus too large to compare against itself", async () => {
        await expect(hashStatistics.run({ input: "# only comments\n\n", "reveal_shared": true }))
            .rejects.toThrow(/No candidate hashes/);

        const huge = Array.from({ length: 5001 }, (_, i) => `u${i}:${MD5_PASSWORD}`).join("\n");
        // The message must say that splitting does NOT preserve the shared-password answer --
        // the per-format counts add across calls and the collision analysis does not, and a
        // caller who splits without knowing that gets a confidently wrong zero.
        await expect(hashStatistics.run({ input: huge, "reveal_shared": true }))
            .rejects.toThrow(/at most 5000/);
    });

    it("keeps a bare NetNTLM record whole, and still reads a disabled shadow line", async () => {
        // A bare NetNTLMv1/v2 value is `user::domain:challenge:response`, so its second field is
        // empty -- and splitting on the first colon stored that empty field as the hash and
        // reported a passwordless account for a perfectly good response.
        //
        // Detected by SHAPE rather than by looking for `::`, which is the part that took two
        // attempts. A disabled shadow line is `daemon:*:19000:0:99999:7:::` and a genuinely
        // passwordless one is `user::19000:0:...`; both contain `::`, and the first has it at the
        // same position a NetNTLM record does. Only the full pattern separates them.
        const r = await hashStatistics.run({
            input: [
                "admin::CORP:1122334455667788:" + "a".repeat(32) + ":0101000000000000abcdef",
                "daemon:*:19000:0:99999:7:::",
                "nobody::19000:0:99999:7:::"
            ].join("\n"),
            "reveal_shared": true
        });

        expect(r.formats.map(f => f.format)).toContain("NetNTLMv2");
        expect(r.placeholders).toBe(2);
    });
});
