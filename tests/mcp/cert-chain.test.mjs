/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * `cert_chain`, against a real certificate chain.
 *
 * The fixtures in `tests/mcp/fixtures/` are a throwaway PKI generated with openssl: a self-signed
 * root, an intermediate it signed, a leaf the intermediate signed, and an **imposter** minted with
 * the same subject as the real intermediate and a different key. Certificates only — no private key
 * is committed, and nothing here is trusted by anything.
 *
 * They are committed rather than generated at test time for two reasons. Generating a chain needs
 * openssl on the runner, which is a dependency this suite otherwise does not have; and a fixture
 * whose contents change per run cannot pin a fingerprint or a validity window.
 *
 * The leaf expires 90 days after generation, so every test that cares about validity passes
 * `as_of` explicitly. A test whose result depends on the day it runs is a test that will fail on
 * some future morning for no reason.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { X509Certificate } from "node:crypto";
import tool from "../../src/node/tools/cert-chain.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const pem = name => readFileSync(resolve(HERE, `fixtures/cert-${name}.pem`), "utf8");

const ROOT = pem("root");
const INTER = pem("inter");
const LEAF = pem("leaf");
const IMPOSTER = pem("imposter");
// The adversary that refuted this tool's original design claim. Minted with the real
// intermediate's subject AND a subjectKeyIdentifier equal to the leaf's authorityKeyIdentifier,
// over a DIFFERENT key -- so `checkIssued` accepts it and `verify` rejects it. `cert-imposter.pem`
// above does not have that property: its key identifier differs, which is the only reason
// `checkIssued` rejected it, and mistaking that for a signature check is what produced the wrong
// claim in the first place.
const SKID_IMPOSTER = pem("skid-imposter");

// Inside the leaf's validity window, fixed so the suite does not depend on the calendar.
const WITHIN = new Date(new Date(new X509Certificate(LEAF).validFrom).getTime() + 86400000)
    .toISOString();
// After the leaf has expired but while the intermediate and root are still valid.
const AFTER_LEAF = new Date(new Date(new X509Certificate(LEAF).validTo).getTime() + 86400000)
    .toISOString();

describe("cert_chain", () => {
    it("orders a shuffled bundle into leaf, intermediate, root", async () => {
        // Deliberately out of order. Ordering is the point: a bundle arrives however it was
        // concatenated, and reporting it in arrival order would answer nothing.
        const out = await tool.run({ input: ROOT + LEAF + INTER, "as_of": WITHIN });

        expect(out.chain_length).toBe(3);
        expect(out.chain.map(entry => entry.subject))
            .toEqual(["CN=example.test", "CN=Test Intermediate", "CN=Test Root CA"]);
        expect(out.self_consistent).toBe(true);
    });

    it("verifies every link cryptographically", async () => {
        const out = await tool.run({ input: LEAF + INTER + ROOT, "as_of": WITHIN });

        expect(out.links).toHaveLength(2);
        for (const link of out.links) {
            expect(link.names_match).toBe(true);
            expect(link.signature_verifies).toBe(true);
            expect(link.warning).toBeUndefined();
        }
    });

    it("keeps an imposter out of the chain and names it", async () => {
        // The case the tool exists for. `IMPOSTER` carries the SAME subject as the real
        // intermediate and a different key, so a tool comparing issuer to subject as text would
        // accept it as the leaf's issuer.
        expect(new X509Certificate(IMPOSTER).subject)
            .toBe(new X509Certificate(INTER).subject);

        const out = await tool.run({ input: LEAF + IMPOSTER + ROOT, "as_of": WITHIN });

        // It is not a link. `checkIssued` rejects it, so it never enters the chain at all -- which
        // is stronger than reporting it as a broken link, and is why the tool does not claim to
        // report "names match but signature fails".
        expect(out.chain.map(entry => entry.subject)).not.toContain("CN=Test Intermediate");
        expect(out.self_consistent).toBe(false);

        // And it is named rather than left inside a count: a certificate bearing an issuer's name
        // on a key that signed nothing is the shape of a substituted certificate.
        const orphan = out.not_in_chain.find(entry => entry.subject === "CN=Test Intermediate");
        expect(orphan).toBeDefined();
        expect(orphan.claims_an_issuer_name_in_this_chain).toBe(true);
        expect(out.problems.join(" ")).toContain("issuer name");
    });

    it("reports a missing intermediate rather than silently shortening the chain", async () => {
        const out = await tool.run({ input: LEAF + ROOT, "as_of": WITHIN });

        expect(out.chain_length).toBe(1);
        expect(out.not_in_chain).toHaveLength(1);
        expect(out.self_consistent).toBe(false);
        expect(out.problems.join(" ")).toMatch(/not part of the chain|intermediate/);
    });

    it("judges validity at as_of, not at the wall clock", async () => {
        const valid = await tool.run({ input: LEAF + INTER + ROOT, "as_of": WITHIN });
        expect(valid.chain.every(entry => !entry.expired)).toBe(true);

        const later = await tool.run({ input: LEAF + INTER + ROOT, "as_of": AFTER_LEAF });
        expect(later.chain.find(entry => entry.subject === "CN=example.test").expired).toBe(true);
        expect(later.self_consistent).toBe(false);
    });

    it("reports the chain's validity window as the intersection, not the root's", async () => {
        // The statistic no per-certificate operation can produce: a chain is only usable while
        // EVERY member is, so the answer is the earliest expiry rather than the last.
        const out = await tool.run({ input: LEAF + INTER + ROOT, "as_of": WITHIN });
        const earliest = out.chain
            .map(entry => entry.not_after)
            .sort()[0];
        expect(out.chain_valid_until).toBe(earliest);
        // And that is the leaf here, not the ten-year root.
        expect(out.chain_valid_until)
            .toBe(out.chain.find(entry => entry.subject === "CN=example.test").not_after);
    });

    it("reports BOTH ends of the chain's validity window", async () => {
        // An intersection has a start. `chain_valid_until` alone was min(not_after) while the
        // documentation claimed the whole interval -- reviewer-found. `chain_valid_from` is
        // max(not_before), and both are needed before the pair can be called an intersection.
        const out = await tool.run({ input: LEAF + INTER + ROOT, "as_of": WITHIN });

        const latestStart = out.chain.map(e => e.not_before).sort().at(-1);
        const earliestEnd = out.chain.map(e => e.not_after).sort()[0];

        expect(out.chain_valid_from).toBe(latestStart);
        expect(out.chain_valid_until).toBe(earliestEnd);
        // A usable chain has a non-empty intersection, and `as_of` sits inside it.
        expect(out.chain_valid_from < out.chain_valid_until).toBe(true);
        expect(out.chain_valid_from <= WITHIN && WITHIN <= out.chain_valid_until).toBe(true);
    });

    it("flags a certificate expiring inside the warning window", async () => {
        const out = await tool.run({
            input: LEAF + INTER + ROOT, "as_of": WITHIN, "expiry_warning_days": 3650
        });
        expect(out.expiring_soon.map(entry => entry.subject)).toContain("CN=example.test");
    });

    it("treats a missing root as a note, not a problem, and stays self_consistent", async () => {
        // A server's fullchain.pem legitimately omits the root, and this is the commonest real
        // input the tool will ever see.
        //
        // This test used to assert the missing-root text appeared in `problems`, which is exactly
        // the defect a reviewer caught: `self_consistent` is `problems.length === 0`, so a perfectly
        // good fullchain.pem came back `self_consistent: false` beside an assessment saying a
        // missing root is not a defect. The tool contradicted itself in one response. Notes and
        // problems are now separate fields, and this pins BOTH halves so they cannot drift back
        // together.
        const out = await tool.run({ input: LEAF + INTER, "as_of": WITHIN });

        expect(out.notes.join(" ")).toContain("NORMAL");
        // `problems` is omitted entirely when there are none, rather than sent as an empty array.
        expect(out.problems).toBeUndefined();
        expect(out.self_consistent).toBe(true);
        expect(out.assessment).toContain("nothing in `notes` is a defect");
    });

    it("keeps a real defect a problem even when a note is also present", async () => {
        // A bare leaf carries a note (its issuer is not in the bundle) and no DEFECT: there is
        // nothing here that fails to verify, nothing expired, and no certificate that does not
        // belong. A one-certificate bundle is internally consistent in the only sense this tool
        // claims to measure, so it stays self_consistent.
        const bare = await tool.run({ input: LEAF, "as_of": WITHIN });
        expect(bare.notes.join(" ")).toContain("NORMAL");
        expect(bare.self_consistent).toBe(true);

        // The direction that matters for the note/problem split: adding an unrelated certificate
        // introduces a real defect, and the note must not rescue it into self_consistent. Both the
        // note and the problem are present here, which is the case that would regress if the two
        // fields were ever folded back together.
        const withOrphan = await tool.run({ input: LEAF + ROOT, "as_of": WITHIN });
        expect(withOrphan.notes.join(" ")).toContain("NORMAL");
        expect(withOrphan.problems.length).toBeGreaterThan(0);
        expect(withOrphan.self_consistent).toBe(false);
    });

    it("refuses input with no PEM blocks, and says how to convert DER", async () => {
        await expect(tool.run({ input: "not a certificate" }))
            .rejects.toThrow(/No PEM certificate blocks/);
    });

    it("names which certificate failed to parse", async () => {
        const broken = "-----BEGIN CERTIFICATE-----\nnotbase64!!\n-----END CERTIFICATE-----\n";
        await expect(tool.run({ input: LEAF + broken }))
            .rejects.toThrow(/Certificate 2 of 2/);
    });

    it("rejects an unparseable as_of instead of silently using now", async () => {
        await expect(tool.run({ input: LEAF, "as_of": "last Tuesday" }))
            .rejects.toThrow(/not a date/);
    });

    it("proves checkIssued does NOT verify signatures", async () => {
        // The measurement this tool's design was originally, and wrongly, built on. Kept as a test
        // rather than a comment because the whole defect came from asserting this without checking
        // it: an imposter was rejected, the rejection was attributed to cryptography, and it was
        // actually a key-identifier mismatch.
        const leaf = new X509Certificate(LEAF);
        const evil = new X509Certificate(SKID_IMPOSTER);

        expect(evil.subject).toBe(new X509Certificate(INTER).subject);
        expect(leaf.checkIssued(evil)).toBe(true);          // metadata says yes
        expect(leaf.verify(evil.publicKey)).toBe(false);    // cryptography says no
    });

    it("prefers the issuer whose signature verifies over one that merely looks right", async () => {
        // THE DEFECT. The first draft took the first `checkIssued` match and stopped, so this
        // hostile certificate captured the edge and the real intermediate -- present in the same
        // bundle -- was never considered. A good bundle with one hostile certificate in it was
        // reported as a broken chain.
        const out = await tool.run({ input: LEAF + SKID_IMPOSTER + INTER + ROOT, "as_of": WITHIN });

        expect(out.chain.map(entry => entry.subject))
            .toEqual(["CN=example.test", "CN=Test Intermediate", "CN=Test Root CA"]);
        // Every link in the selected chain verifies, because the real issuer won.
        expect(out.links.every(link => link.signature_verifies)).toBe(true);
        // And the hostile certificate is named rather than quietly dropped.
        const orphan = out.not_in_chain.find(e => e.subject === "CN=Test Intermediate");
        expect(orphan).toBeDefined();
        expect(orphan.claims_an_issuer_name_in_this_chain).toBe(true);
    });

    it("reports a substituted issuer as a broken link when the real one is absent", async () => {
        // The fallback path: nothing in the bundle verifies, so the metadata-only match is kept so
        // the failure is REPORTED. Dropping it would turn a substitution into a silent orphan.
        const out = await tool.run({ input: LEAF + SKID_IMPOSTER, "as_of": WITHIN });

        const link = out.links.find(l => l.from === "CN=example.test");
        expect(link).toBeDefined();
        expect(link.names_match).toBe(true);
        expect(link.signature_verifies).toBe(false);
        expect(link.warning).toContain("SUBSTITUTED");
        expect(out.self_consistent).toBe(false);
        expect(out.problems.join(" ")).toContain("do not verify cryptographically");
    });

    it("reports whether each issuer is permitted to be one", async () => {
        const out = await tool.run({ input: LEAF + INTER + ROOT, "as_of": WITHIN });
        expect(out.links.every(link => link.issuer_is_ca)).toBe(true);
        expect(out.links.every(link => link.ca_warning === undefined)).toBe(true);
    });

    it("is registered and does not shadow an operation or meta-tool", async () => {
        const { buildRegistry } = await import("../../src/node/tools/index.mjs");
        expect(buildRegistry().list().map(entry => entry.name)).toContain("cert_chain");
        expect(tool.name.startsWith("cyberchef_")).toBe(false);
    });
});
