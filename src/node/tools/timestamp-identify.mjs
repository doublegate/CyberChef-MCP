/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * "What is this number, and is it a time?"
 *
 * CyberChef has `Parse DateTime`, `From UNIX Timestamp` and `Windows Filetime to UNIX Timestamp`,
 * and every one of them requires you to already know which format you are holding. That is the gap:
 * the operations convert, and nothing identifies.
 *
 * The discriminator is not epoch arithmetic -- every epoch below converts trivially. It is
 * PLAUSIBILITY WINDOWING. A 64-bit integer is a valid FILETIME, a valid Cocoa date and a valid
 * Unix nanosecond count simultaneously; what separates them is that only one of the three lands in
 * a year a real record could carry. Magnitude narrows it fast on its own -- roughly 10 digits is
 * Unix seconds, 13 is Unix milliseconds or Java, 16 is microseconds or WebKit, 17 to 18 is FILETIME
 * or .NET ticks -- and the window finishes the job.
 *
 * Always a RANKED LIST, never a verdict. Two pairs here are genuinely indistinguishable from the
 * value alone: OLE Automation and Delphi TDateTime are the same encoding, and Chrome/WebKit shares
 * FILETIME's epoch with a different unit, so a value plausible as one is often plausible as the
 * other. A single confident answer would be wrong by construction.
 *
 * Epochs verified against dfdatetime's module source rather than its rendered documentation: the
 * readthedocs build prints the OLE epoch as 1889-12-30 where the source says 1899-12-30.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { createInputError } from "../errors.mjs";

/** Milliseconds from an epoch to the Unix epoch, for each format. */
const MS = {
    UNIX: 0,
    FILETIME: -11644473600000,      // 1601-01-01
    NET: -62135596800000,           // 0001-01-01
    UUID: -12219292800000,          // 1582-10-15, the Gregorian reform
    OLE: -2209161600000,            // 1899-12-30
    HFS: -2082844800000,            // 1904-01-01
    COCOA: 978307200000,            // 2001-01-01
    GPS: 315964800000               // 1980-01-06
};

/**
 * Every candidate interpretation. `toMs` converts a raw value to milliseconds since the Unix epoch.
 *
 * `float` marks the two encodings whose value is a fractional day count rather than an integer
 * tick, which is also how they are told apart from everything else: an OLE date with a time of day
 * is never a whole number.
 */
const FORMATS = [
    { name: "Unix seconds", toMs: (v) => v * 1000, note: "The default in POSIX, most databases and most log formats." },
    { name: "Unix milliseconds", toMs: (v) => v, note: "JavaScript's Date.now(), and Java's System.currentTimeMillis()." },
    { name: "Unix microseconds", toMs: (v) => v / 1e3, note: "Common in tracing and in some database column types." },
    { name: "Unix nanoseconds", toMs: (v) => v / 1e6, note: "Go's UnixNano, and APFS timestamps (which are signed)." },
    {
        name: "Windows FILETIME", toMs: (v) => v / 1e4 + MS.FILETIME,
        note: "100-nanosecond intervals since 1601. Throughout the Win32 API, NTFS and the registry."
    },
    {
        name: "Chrome / WebKit", toMs: (v) => v / 1e3 + MS.FILETIME,
        note: "Microseconds since 1601 — the SAME epoch as FILETIME with a different unit, which " +
            "is the classic misidentification. Chromium history and cookie databases."
    },
    {
        name: ".NET ticks", toMs: (v) => v / 1e4 + MS.NET,
        note: "100-nanosecond intervals since year 1. DateTime.Ticks."
    },
    {
        name: "UUID version 1", toMs: (v) => v / 1e4 + MS.UUID,
        note: "100-nanosecond intervals since the Gregorian reform of 1582. The time field of a v1 UUID."
    },
    {
        name: "OLE Automation / Delphi TDateTime", toMs: (v) => v * 86400000 + MS.OLE, float: true,
        note: "Days since 1899-12-30, with the time of day as the fraction. Excel, VB, COM and " +
            "Delphi all use it, and Delphi's TDateTime is byte-identical — they cannot be told " +
            "apart from the value."
    },
    {
        name: "HFS+ / HFS", toMs: (v) => v * 1000 + MS.HFS,
        note: "Seconds since 1904. Classic Mac OS and HFS+ volumes."
    },
    {
        name: "Cocoa / Core Data", toMs: (v) => v * 1000 + MS.COCOA, float: true,
        note: "Seconds since 2001, often fractional. NSDate, and macOS/iOS plists."
    },
    {
        name: "GPS seconds", toMs: (v) => v * 1000 + MS.GPS - gpsLeapSeconds(v) * 1000,
        note: "Seconds since 1980-01-06 with NO leap seconds, so it runs ahead of UTC by however " +
            "many have been inserted since — 18 since 2017. The correction IS applied here, and " +
            "it is the represented instant's offset rather than today's, so a 1990 timestamp gets " +
            "the 1990 value."
    }
];

/**
 * GPS-to-UTC offsets, as [GPS seconds at which the offset takes effect, seconds].
 *
 * GPS time does not insert leap seconds, so it drifts ahead of UTC by one per insertion. Adding
 * the epoch alone therefore produces an ISO time that is too LATE, by up to 18 seconds — which is
 * small, and is exactly the size of error that survives review because it looks right.
 *
 * The offset used is the one in force at the REPRESENTED instant, not today's: a 1990 GPS
 * timestamp is 6 seconds ahead of UTC, not 18. Using a single current value would be correct only
 * for the present and wrong for every historical record, which is what a forensic tool mostly sees.
 *
 * Derived from IERS Bulletin C. The table ends in 2017 because no leap second has been inserted
 * since; a future one needs a row here.
 */
const GPS_LEAP_SECONDS = [
    [0, 0], [46828800, 1], [78364801, 2], [109900802, 3], [173059203, 4], [252028804, 5],
    [315187205, 6], [346723206, 7], [393984007, 8], [425520008, 9], [457056009, 10],
    [504489610, 11], [551750411, 12], [599184012, 13], [820108813, 14], [914803214, 15],
    [1025136015, 16], [1119744016, 17], [1167264017, 18]
];

/**
 * @param {number} gpsSeconds - The raw GPS second count.
 * @returns {number} Leap seconds in force at that instant.
 */
function gpsLeapSeconds(gpsSeconds) {
    let offset = 0;
    for (const [from, seconds] of GPS_LEAP_SECONDS) {
        if (gpsSeconds >= from) offset = seconds;
        else break;
    }
    return offset;
}

/** Default plausibility window. Narrow enough to discriminate, wide enough not to hide real data. */
const DEFAULT_FROM = "1990-01-01";
const DEFAULT_TO = "2040-01-01";

/**
 * Parse a value that may be decimal, hex, or a v1 UUID.
 *
 * @param {string} raw - The input.
 * @returns {{value: number, form: string}} The numeric value and how it was read.
 */
function parseValue(raw) {
    const text = raw.trim();
    const uuid = /^([0-9a-f]{8})-([0-9a-f]{4})-1([0-9a-f]{3})-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(text);
    if (uuid) {
        // The v1 time field is split across three groups, high-order last. Reassembling it is the
        // only way the number becomes a timestamp at all, so it is done here rather than asking the
        // caller to do it.
        const hex = uuid[3] + uuid[2] + uuid[1];
        return { value: Number(BigInt("0x" + hex)), form: "UUID version 1 time field" };
    }
    if (/^0x[0-9a-f]+$/i.test(text)) return { value: Number(BigInt(text)), form: "hex" };
    if (/^-?\d+\.\d+$/.test(text)) return { value: Number(text), form: "decimal with a fraction" };
    if (/^-?\d+$/.test(text)) return { value: Number(text), form: "decimal" };
    if (/^[0-9a-f]{8,20}$/i.test(text)) return { value: Number(BigInt("0x" + text)), form: "bare hex" };
    throw createInputError(
        "That is not a number, a hex string, or a version-1 UUID.",
        { received: text.slice(0, 60), accepted: "decimal, 0x-prefixed hex, bare hex, or a v1 UUID" });
}

/**
 * What the ranking does and does not establish.
 *
 * @param {boolean} fromUuid - Whether the format was read from the input's structure.
 * @param {Object[]} plausible - The interpretations inside the window.
 * @returns {string} The assessment.
 */
function assess(fromUuid, plausible) {
    if (fromUuid) {
        return "The version nibble identified this as a v1 UUID, so the format is known from the " +
            "structure rather than guessed from the magnitude. No ranking is needed.";
    }
    if (plausible.length === 0) {
        return "No interpretation lands inside the window, so every row is shown. Either this is " +
            "not a timestamp, or the window is wrong for it - widen it before concluding the former.";
    }
    if (plausible.length === 1) {
        return `Exactly one interpretation is plausible: ${plausible[0].format}. That is a strong ` +
            "answer, but it is still a plausibility argument and not a determination.";
    }
    return `${plausible.length} interpretations are plausible and the value alone cannot separate ` +
        "them. OLE Automation and Delphi TDateTime are the same encoding and never can be; " +
        "Chrome/WebKit shares FILETIME's epoch with a different unit. Use the surrounding data - " +
        "the file format, the neighbouring fields, the field width - rather than the number.";
}

export default {
    name: "timestamp_identify",
    title: "Identify a timestamp",
    category: "Analysis",
    description:
        "Given a number that might be a time, rank every format it could plausibly be — the step " +
        "before CyberChef's date operations, which all need you to know the format already. " +
        "Covers Unix at four resolutions, FILETIME, Chrome/WebKit, .NET ticks, UUIDv1, OLE " +
        "Automation and Delphi, HFS+, Cocoa and GPS, and takes a v1 UUID directly. Always a " +
        "ranked list: one 64-bit integer is a valid FILETIME, Cocoa date and nanosecond count at " +
        "once, so a single confident answer would be wrong by construction.",
    annotations: {
        title: "Identify a timestamp",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        value: z.string().min(1).max(128)
            .describe("The number, as decimal, hex, or a version-1 UUID."),
        "plausible_from": z.string().max(32).default(DEFAULT_FROM)
            .describe("Earliest date a result may have and still be called plausible, as YYYY-MM-DD."),
        "plausible_to": z.string().max(32).default(DEFAULT_TO)
            .describe("Latest such date."),
        "show_all": z.boolean().default(false)
            .describe("Include interpretations outside the window, when the window is what is wrong.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} Every interpretation, plausible ones first.
     */
    async run(args) {
        const { value, form } = parseValue(args.value);
        const from = Date.parse(args.plausible_from);
        const to = Date.parse(args.plausible_to);
        if (Number.isNaN(from) || Number.isNaN(to)) {
            throw createInputError(
                "plausible_from and plausible_to must be parseable dates, e.g. 2000-01-01.",
                { from: args.plausible_from, to: args.plausible_to });
        }

        const rows = FORMATS.map(format => {
            const ms = format.toMs(value);
            const plausible = Number.isFinite(ms) && ms >= from && ms <= to;
            let iso = null;
            // Date rejects anything outside +-8.64e15 ms, which several of these interpretations
            // exceed for a large input. That is not an error -- it IS the answer for that row.
            if (Number.isFinite(ms) && Math.abs(ms) <= 8.64e15) iso = new Date(ms).toISOString();
            return {
                format: format.name,
                iso,
                plausible,
                ...(iso === null ? { "out_of_range": "Outside the representable range of a date." } : {}),
                note: format.note
            };
        });

        // A v1 UUID is the one input that is not ambiguous, because the format was read off the
        // structure rather than guessed from the magnitude -- the version nibble said so, and the
        // time field was reassembled from three groups to get here. Ranking it against eleven other
        // interpretations would throw that certainty away and could easily rank one of them higher.
        const fromUuid = form.startsWith("UUID");
        const rows2 = fromUuid ? rows.filter(r => r.format === "UUID version 1") : rows;
        const plausible = rows2.filter(r => r.plausible);
        const shown = args.show_all ? rows2 : (plausible.length ? plausible : rows2);

        return {
            value: String(value),
            "read_as": form,
            digits: Math.abs(value).toFixed(0).length,
            window: { from: args.plausible_from, to: args.plausible_to },
            interpretations: shown,
            assessment: assess(fromUuid, plausible),
            next: "Convert with cyberchef_bake once you have chosen: `From UNIX Timestamp` or " +
                "`Windows Filetime to UNIX Timestamp` take it from here."
        };
    }
};
