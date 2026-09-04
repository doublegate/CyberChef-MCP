/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The step before CyberChef's date operations, all of which need you to already know the format.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import tool from "../../src/node/tools/timestamp-identify.mjs";

const run = (args) => tool.run(tool.inputSchema.parse(args));
const plausible = (r) => r.interpretations.filter(i => i.plausible).map(i => i.format);

describe("timestamp_identify", () => {
    it("reads a ten-digit number as Unix seconds", async () => {
        const r = await run({ value: "1756900000" });
        const hit = r.interpretations.find(i => i.format === "Unix seconds");
        expect(hit.iso).toBe("2025-09-03T11:46:40.000Z");
        expect(hit.plausible).toBe(true);
    });

    it("separates FILETIME from Chrome by unit, not by epoch", async () => {
        // They share the 1601 epoch and differ only in the unit, which is the classic
        // misidentification. Only the magnitude tells them apart.
        expect(plausible(await run({ value: "133700000000000000" }))).toContain("Windows FILETIME");
        expect(plausible(await run({ value: "13400000000000000" }))).toContain("Chrome / WebKit");
    });

    it("takes a v1 UUID and reassembles its split time field", async () => {
        const ticks = (Date.parse("2024-01-01T00:00:00Z") + 12219292800000) * 10000;
        const hex = BigInt(ticks).toString(16).padStart(15, "0");
        const uuid = `${hex.slice(7)}-${hex.slice(3, 7)}-1${hex.slice(0, 3)}-8000-001122334455`;
        const r = await run({ value: uuid });

        expect(r.read_as).toMatch(/UUID/);
        expect(r.interpretations[0].iso).toBe("2024-01-01T00:00:00.000Z");
        // No ranking: the version nibble said what this is, so offering eleven alternatives would
        // discard a certainty and could easily rank one of them first.
        expect(r.interpretations).toHaveLength(1);
        expect(r.assessment).toMatch(/No ranking is needed/);
    });

    it("says outright when the value alone cannot decide", async () => {
        const r = await run({ value: "780000000" });
        expect(r.interpretations.filter(i => i.plausible).length).toBeGreaterThan(1);
        expect(r.assessment).toMatch(/cannot separate them/);
    });

    it("shows everything, and says the window may be what is wrong", async () => {
        // A small value is NOT the way to get here: seconds since 2001 puts anything from 0 to
        // about 1.2 billion inside the window, so Cocoa reads almost every small integer as a
        // plausible date. It takes a value that is out of range for every interpretation at once.
        const r = await run({ value: "-5000000000" });
        expect(r.interpretations.some(i => i.plausible)).toBe(false);
        expect(r.assessment).toMatch(/widen it before concluding/);
    });

    it("reports an unrepresentable date as the answer for that row, not as an error", async () => {
        const r = await run({ value: "99999999999999999999", "show_all": true });
        expect(r.interpretations.some(i => i.out_of_range)).toBe(true);
    });

    it("honours a widened window", async () => {
        const narrow = await run({ value: "100000000" });
        const wide = await run({ value: "100000000", "plausible_from": "1900-01-01" });
        expect(plausible(wide).length).toBeGreaterThan(plausible(narrow).length);
    });

    it("accepts hex in both forms", async () => {
        const decimal = await run({ value: "1756900000" });
        const prefixed = await run({ value: "0x68b82aa0" });
        expect(prefixed.value).toBe(decimal.value);
    });

    it("applies the leap-second offset in force at the represented instant, not today's", async () => {
        // GPS does not insert leap seconds, so it runs ahead of UTC by however many have been
        // inserted since 1980 -- 18 since 2017, 7 in early 1991. Adding the epoch alone produces
        // an ISO time that is too LATE, which is small enough to survive review because it looks
        // right. A single current offset would be correct only for the present and wrong for every
        // historical record, which is most of what a forensic tool sees.
        const recent = await run({ value: "1441152018", "plausible_from": "1980-01-01" });
        const older = await run({ value: "347155206", "plausible_from": "1980-01-01" });
        const gps = (r) => r.interpretations.find(i => i.format === "GPS seconds");

        // Both land one leap-second offset BEFORE the naive conversion, and the two offsets differ.
        const naiveRecent = new Date((1441152018 + 315964800) * 1000).getTime();
        const naiveOlder = new Date((347155206 + 315964800) * 1000).getTime();
        expect(naiveRecent - Date.parse(gps(recent).iso)).toBe(18000);
        expect(naiveOlder - Date.parse(gps(older).iso)).toBe(7000);
    });

    it("rejects a window that is not a date", async () => {
        await expect(run({ value: "1756900000", "plausible_from": "not a date" }))
            .rejects.toThrow(/parseable dates/);
    });

    it("rejects something that is not a number at all", async () => {
        await expect(run({ value: "hello world" })).rejects.toThrow(/not a number/);
    });
});
