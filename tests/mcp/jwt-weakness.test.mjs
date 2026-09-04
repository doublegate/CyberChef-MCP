/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * What a token proves about itself, and where that stops.
 *
 * The boundary is the substance of this tool, so it is tested as such: findings and
 * `server_dependent` observations must never mix, because half the well-known JWT attacks cannot
 * be confirmed without a server and reporting them as findings would be a guess in a finding's
 * clothing.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import tool from "../../src/node/tools/jwt-weakness.mjs";

const b64u = (value) => Buffer.from(value).toString("base64url");

/** @returns {string} A token; a null secret produces an empty signature. */
function mint(header, payload, secret) {
    const signing = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
    if (secret === null) return `${signing}.`;
    return `${signing}.${createHmac("sha256", secret).update(signing).digest("base64url")}`;
}

const run = (token, extra = {}) => tool.run(tool.inputSchema.parse({ token, ...extra }));
const ids = (list) => list.map(f => f.id);

describe("jwt_weakness", () => {
    it("catches alg none in a spelling a string comparison would miss", async () => {
        const r = await run(mint({ alg: "nOnE" }, { sub: "admin", exp: 9999999999 }, null));

        expect(ids(r.findings)).toContain("alg-none");
        // The variant is its own finding, because a filter that compares against the exact string
        // "none" passes this token through and its author needs to know that is why.
        expect(ids(r.findings)).toContain("alg-none-obfuscated");
    });

    it("resolves a Unicode escape before comparing, as JSON.parse does", async () => {
        // `\u006eone` is "none" after parsing. A check applied to the raw header text sees a
        // different string; a check applied after the parse does not.
        const header = b64u("{\"alg\":\"\\u006eone\",\"typ\":\"JWT\"}");
        const payload = b64u(JSON.stringify({ sub: "admin", exp: 9999999999 }));
        const r = await run(`${header}.${payload}.`);

        expect(ids(r.findings)).toContain("alg-none");
    });

    it("recovers a quickstart secret and names it", async () => {
        const r = await run(mint({ alg: "HS256" }, { sub: "u", exp: 9999999999 }, "secret"));

        const finding = r.findings.find(f => f.id === "weak-secret");
        expect(finding.secret).toBe("secret");
        expect(finding.severity).toBe("critical");
    });

    it("tries the empty secret, which some libraries accept", async () => {
        const r = await run(mint({ alg: "HS256" }, { sub: "u", exp: 9999999999 }, ""));
        expect(r.findings.find(f => f.id === "weak-secret").secret).toBe("");
    });

    it("accepts extra secrets from the caller", async () => {
        const token = mint({ alg: "HS256" }, { sub: "u", exp: 9999999999 }, "correct-horse-battery");
        expect(ids((await run(token)).findings)).not.toContain("weak-secret");
        const r = await run(token, { secrets: ["nope", "correct-horse-battery"] });
        expect(r.findings.find(f => f.id === "weak-secret").secret).toBe("correct-horse-battery");
    });

    it("recognises the psychic signature", async () => {
        const signing = `${b64u(JSON.stringify({ alg: "ES256" }))}.${b64u(JSON.stringify({ sub: "u", exp: 9999999999 }))}`;
        const r = await run(`${signing}.${Buffer.alloc(64, 0).toString("base64url")}`);

        // Java 15 through 18 accepted r = s = 0 against any key and any message.
        expect(ids(r.findings)).toContain("psychic-signature");
    });

    it("keeps server-dependent headers out of the findings entirely", async () => {
        const r = await run(mint(
            { alg: "RS256", jku: "https://attacker.example/keys", kid: "../../dev/null" },
            { sub: "u", exp: 9999999999 }, "x"));

        // None of these can be confirmed from the token, so none of them is a finding. The
        // separation is the substance, not the presentation.
        expect(ids(r.findings)).not.toContain("header-jku");
        expect(ids(r.server_dependent)).toEqual(
            expect.arrayContaining(["asymmetric-algorithm", "header-jku", "header-kid"]));
        for (const item of r.server_dependent) expect(item.severity).toBeUndefined();
    });

    it("notices a kid shaped like a path", async () => {
        const r = await run(mint({ alg: "HS256", kid: "/dev/null" }, { sub: "u", exp: 9999999999 }, "x"));
        expect(r.server_dependent.find(o => o.id === "header-kid").detail).toMatch(/empty key/);
    });

    it("treats a missing expiry as a finding and an expired token as an observation", async () => {
        const missing = await run(mint({ alg: "HS256" }, { sub: "u" }, "x"));
        expect(ids(missing.findings)).toContain("no-expiry");

        const expired = await run(mint({ alg: "HS256" }, { sub: "u", exp: 1000 }, "x"), { "now_seconds": 2000 });
        // Being expired is a property of the token, not a weakness in it. A server that accepts it
        // anyway is the weakness, and that is not decidable here.
        expect(ids(expired.findings)).not.toContain("expired");
        expect(ids(expired.server_dependent)).toContain("expired");
    });

    it("refuses to call a clean token safe", async () => {
        const r = await run(mint({ alg: "HS256" }, { sub: "u", exp: 9999999999 }, "j8Fq2p!zX9@vLmT4"));

        expect(r.findings).toHaveLength(0);
        expect(r.assessment).toMatch(/not a clean bill of health/);
    });

    it("rejects something that is not a token", async () => {
        await expect(run("not.a.jwt.at.all")).rejects.toThrow(/two or three dot-separated parts/);
        await expect(run("###.###.###")).rejects.toThrow(/header is not base64url-encoded JSON/);
    });

    it("names the payload when it is the payload that is malformed", async () => {
        await expect(run(`${b64u(JSON.stringify({ alg: "HS256" }))}.###.x`))
            .rejects.toThrow(/payload is not base64url-encoded JSON/);
    });
});
