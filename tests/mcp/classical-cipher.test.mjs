/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Published vectors, not round trips.
 *
 * A cipher that round-trips against itself proves only that it is self-consistent, and every one
 * of these has variants that are individually self-consistent and mutually incompatible. So each
 * case below is a vector from a named source, and the disagreements between sources are pinned as
 * their own tests -- because an implementation silently picking the other convention produces
 * plausible output that no other tool agrees with.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import tool from "../../src/node/tools/classical-cipher.mjs";

const run = (args) => tool.run(tool.inputSchema.parse(args));

describe("classical_cipher", () => {
    describe("playfair", () => {
        it("reproduces Wikipedia's worked example exactly", async () => {
            const r = await run({
                cipher: "playfair", mode: "encode", key: "playfair example",
                input: "HIDETHEGOLDINTHETREESTUMP"
            });
            expect(r.output).toBe("BMODZBXDNABEKUDMUIXMMOUVIF");
        });

        it("reproduces Christensen's GALOIS example, punctuation and all", async () => {
            const r = await run({
                cipher: "playfair", mode: "encode", key: "GALOIS",
                input: "COMSEC means communications security."
            });
            expect(r.output).toBe("DLFDSDNDIHBDDTNTUEBLUOIMCVBSERULYO");
        });

        it("checks doubled letters per digraph, not with a global pre-pass", async () => {
            // Christensen's own clarifying note: an X goes between the double s in
            // "communications security", but NOT between the double m -- "because those two ms
            // appear in different digraphs". The distinction is where the pairing boundary falls,
            // not whether two identical letters are adjacent in the string.
            //
            // AMMO pairs as AM|MO: the two Ms straddle the boundary, no filler, four letters out.
            // MMOO pairs as MM -> M+filler, then MO|OX: six letters out. A global pre-pass that
            // inserted a filler at every doubled letter would produce six for both.
            const straddling = await run({
                cipher: "playfair", mode: "encode", key: "GALOIS", input: "AMMO"
            });
            const within = await run({
                cipher: "playfair", mode: "encode", key: "GALOIS", input: "MMOO"
            });
            expect(straddling.output).toHaveLength(4);
            expect(within.output).toHaveLength(6);
        });

        it("does not loop forever when the doubled letter is the filler itself", async () => {
            // Inserting X between two X's produces another double, and another, without the
            // fallback. This is a hang, not a wrong answer, which is the worse failure.
            const r = await run({
                cipher: "playfair", mode: "encode", key: "GALOIS", input: "XXXX"
            });
            expect(r.output.length).toBeGreaterThan(0);
        });

        it("offers dcode's omit-V square, without which nothing dcode produces will match", async () => {
            const merged = await run({
                cipher: "playfair", mode: "encode", key: "SECRET", input: "ATTACK"
            });
            const omitV = await run({
                cipher: "playfair", mode: "encode", key: "SECRET", input: "ATTACK",
                "playfair_reduction": "omit_v"
            });
            expect(merged.output).not.toBe(omitV.output);
            expect(omitV.variant.reduction).toBe("omit_v");
        });

        it("labels the pycipher-compatible mode as lossy, because it is", async () => {
            // Their own documented round trip loses a letter: "defend the east wall" comes back
            // as "DEFENDTHEXAST". Available, never the default, and never silently.
            const r = await run({
                cipher: "playfair", mode: "encode", key: "GALOIS", input: "HAMMER",
                "playfair_replace_doubles": true
            });
            expect(r.variant.doubles).toMatch(/lossy/);
            expect(r.note).toMatch(/does not round-trip/);
        });
    });

    describe("polybius", () => {
        it("reproduces dcode's keyed example", async () => {
            const r = await run({
                cipher: "polybius", mode: "decode", key: "DCODE", input: "351332542114"
            });
            expect(r.output).toBe("POLYBE");
        });

        it("encodes row-then-column by default, which is the canonical order", async () => {
            const r = await run({ cipher: "polybius", mode: "encode", input: "BAT" });
            // Wikipedia states it directly: "BAT becomes 12 11 44".
            expect(r.output).toBe("121144");
        });

        it("offers the column-then-row order dcode calls unusual", async () => {
            const r = await run({
                cipher: "polybius", mode: "encode", input: "BAT", "polybius_order": "column_row"
            });
            expect(r.output).toBe("211144");
        });

        it("refuses an odd number of coordinates rather than dropping one", async () => {
            // Every letter is a pair, so valid ciphertext always has an even count. Silently
            // ignoring the stray character would decode most of the message and hide the problem.
            await expect(run({ cipher: "polybius", mode: "decode", input: "12114" }))
                .rejects.toThrow(/odd/);
        });

        it("refuses an alphabet that does not fill the square", async () => {
            await expect(run({
                cipher: "polybius", mode: "encode", input: "BAT", "polybius_alphabet": "ABCDEF"
            })).rejects.toThrow(/needs 25/);
        });
    });

    describe("adfgvx", () => {
        it("round-trips through fractionation and columnar transposition", async () => {
            const plain = "ATTACKAT1200AM";
            const encoded = await run({
                cipher: "adfgvx", mode: "encode", input: plain,
                key: "NACHTBOMMENWERPER", "transposition_key": "PRIVACY"
            });
            expect(encoded.output).toMatch(/^[ADFGVX]+$/);
            const decoded = await run({
                cipher: "adfgvx", mode: "decode", input: encoded.output,
                key: "NACHTBOMMENWERPER", "transposition_key": "PRIVACY"
            });
            expect(decoded.output).toBe(plain);
        });

        it("says outright when it is only doing half the cipher", async () => {
            // Without a transposition key ADFGVX is a 6x6 Polybius square with different labels,
            // which is a substitution and nothing more. Reporting that as ADFGVX would be a lie
            // about the strength of the result.
            const r = await run({ cipher: "adfgvx", mode: "encode", input: "ATTACK", key: "SECRET" });
            expect(r.variant.transposition).toMatch(/only the fractionation half/);
        });
    });

    describe("baudot", () => {
        it("decodes dcode's bit string, sticky shift and all", async () => {
            const r = await run({
                cipher: "baudot", mode: "decode", "baudot_profile": "us_tty",
                input: "01001 01110 11000 01001 00001 00100 11001 00011 00111 01001 11000 10000 11011 01101"
            });
            // Confirms four things at once: the letters table, the sticky figures shift, SPACE
            // being shift-invariant, and the bit order.
            expect(r.output).toBe("DCODE BAUDOT!");
        });

        it("re-encodes it to the identical bit string", async () => {
            const r = await run({
                cipher: "baudot", mode: "encode", input: "DCODE BAUDOT!", "baudot_profile": "us_tty"
            });
            expect(r.output).toBe(
                "01001 01110 11000 01001 00001 00100 11001 00011 00111 01001 11000 10000 11011 01101");
        });

        it("emits a shift only when the case actually changes", async () => {
            const r = await run({ cipher: "baudot", mode: "encode", input: "AB CD" });
            // Five characters, five groups: the whole message is in letters shift and SPACE does
            // not disturb it. A shift per character would be four groups longer.
            expect(r.output.split(" ")).toHaveLength(5);
        });

        it("differs from US-TTY in the figures shift and nowhere else", async () => {
            const ita2 = await run({
                cipher: "baudot", mode: "decode", input: "11011 10001 11111 10001"
            });
            const usTty = await run({
                cipher: "baudot", mode: "decode", input: "11011 10001 11111 10001",
                "baudot_profile": "us_tty"
            });
            // Value 17 is `+` in ITA2 and `"` in US-TTY. The letters shift is identical in both,
            // which is why the second Z comes back the same either way.
            expect(ita2.output).toBe("+Z");
            expect(usTty.output).toBe("\"Z");
        });

        it("swaps CR and LF under the other bit order, which is the self-check", async () => {
            const value = await run({ cipher: "baudot", mode: "decode", input: "01000" });
            const transmission = await run({
                cipher: "baudot", mode: "decode", input: "01000", "baudot_bit_order": "transmission"
            });
            // ITU-T S.1 sends code element 1 first; Wikipedia and dcode print element 5 first. CR
            // and LF are mirror images, so a decoder with the order backwards renders them
            // transposed -- the fastest way to tell which convention a source is using.
            expect(value.output).toBe("\r");
            expect(transmission.output).toBe("\n");
        });

        it("rejects something that is not five-bit groups", async () => {
            await expect(run({ cipher: "baudot", mode: "decode", input: "hello" }))
                .rejects.toThrow(/five-bit groups/);
        });
    });
});
