/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Order a bundle of X.509 certificates into a chain, and say where it breaks.
 *
 * CyberChef has `Parse X.509 certificate`, `Parse X.509 CRL` and `Public Key from Certificate`.
 * Every one of them takes **one** certificate. Nothing relates two, and the questions people
 * actually have about a certificate bundle are all relational:
 *
 *     is this chain in the right order?
 *     is an intermediate missing?
 *     does each certificate actually sign the next, or do the names merely line up?
 *     which link expires first?
 *
 * That is the first and second categories of registry tool at once -- a loop with a decision inside
 * it (ordering an unordered bundle), and a statistic computed ACROSS inputs (the chain's validity
 * window is the intersection of its members'). `Fork` runs one recipe per branch and cannot compare
 * branches, so none of it is expressible as a recipe.
 *
 * ## Links are established cryptographically, not by string comparison
 *
 * The tempting implementation matches `issuer` against `subject` as text. That accepts a forgery
 * trivially: anyone can mint a certificate whose `issuer` string says whatever they like.
 *
 * `checkIssued()` alone is NOT enough, and this file claimed otherwise for most of its life. The
 * claim was that "names match, signature does not" is unreachable because `checkIssued` verifies
 * cryptographically, and it was supported by a measurement:
 *
 *     real.subject === imposter.subject      true
 *     leaf.checkIssued(real)                 true
 *     leaf.checkIssued(imposter)             FALSE
 *
 * That measurement is real and the conclusion drawn from it was wrong. `checkIssued` compares
 * issuer/subject names, authority and subject KEY IDENTIFIERS, and key usage. It never checks the
 * signature. The imposter was rejected because its subjectKeyIdentifier did not match the leaf's
 * authorityKeyIdentifier -- a metadata mismatch, mistaken for cryptography.
 *
 * A reviewer disputed it, and the disproof is a certificate carrying the real intermediate's
 * subject AND a subjectKeyIdentifier equal to the leaf's authorityKeyIdentifier, over a different
 * key (`tests/mcp/fixtures/cert-skid-imposter.pem`):
 *
 *     leaf.checkIssued(skidImposter)         true
 *     leaf.verify(skidImposter.publicKey)    FALSE
 *
 * So the branch is REACHABLE, it is the substitution signature this tool exists to surface, and
 * `verify()` is the discriminator rather than a confirmation. Edge selection requires it; see the
 * selection loop. The lesson is not about X.509: a single negative result was taken as proof of a
 * mechanism, when it only ruled out one way of failing.
 *
 * An imposter therefore surfaces in one of two places, depending on whether the real issuer is also
 * present: as a rejected candidate listed in `not_in_chain` (the real issuer won the edge), or as a
 * link whose `signature_verifies` is false (nothing in the bundle signed the child). Both are
 * reported. Getting the `not_in_chain` question right took a further
 * correction, caught by a real bundle rather than by review. The first attempt asked whether an
 * orphan shared a subject with a certificate already IN the chain -- which finds nothing in exactly
 * the case that matters, because when an imposter has replaced the real intermediate the real one
 * is absent, so its subject is not in the chain either. It returned `false` for the very
 * certificate it was written to catch.
 *
 * The question that works is about the name the chain is LOOKING FOR: every certificate names its
 * issuer, the top of the chain names one that is not present, and that is the slot an imposter
 * occupies. See `wantedIssuers` below.
 *
 * ## No dependency
 *
 * `node:crypto`'s `X509Certificate` does the parsing and the signature check. Adding an X.509
 * library to an image whose size is a tracked metric, for something the runtime already has, would
 * be the wrong trade.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { z } from "zod";
import { X509Certificate } from "node:crypto";
import { createInputError } from "../errors.mjs";

/** Largest bundle accepted, in characters. */
const MAX_INPUT = 1048576;

/** Most certificates accepted. The ordering pass is quadratic in this. */
const MAX_CERTS = 64;

/** PEM blocks, in the order they appear. */
const PEM_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

/**
 * Days between two dates, rounded toward zero.
 *
 * @param {Date} from - The earlier date.
 * @param {Date} to - The later date.
 * @returns {number} Whole days.
 */
const daysBetween = (from, to) => Math.trunc((to.getTime() - from.getTime()) / 86400000);

/**
 * Summarise one certificate, without its key material.
 *
 * @param {X509Certificate} cert - The certificate.
 * @param {Date} now - The instant validity is judged at.
 * @returns {Object} The summary.
 */
function describe(cert, now) {
    const notBefore = new Date(cert.validFrom);
    const notAfter = new Date(cert.validTo);
    return {
        subject: cert.subject.replace(/\n/g, ", "),
        issuer: cert.issuer.replace(/\n/g, ", "),
        "serial_number": cert.serialNumber,
        "is_ca": cert.ca,
        "self_signed": cert.subject === cert.issuer,
        "not_before": notBefore.toISOString(),
        "not_after": notAfter.toISOString(),
        // The two questions an operator actually asks, answered rather than left to date arithmetic.
        expired: now > notAfter,
        "not_yet_valid": now < notBefore,
        "days_until_expiry": daysBetween(now, notAfter),
        "fingerprint_sha256": cert.fingerprint256,
        ...(cert.subjectAltName ? { "subject_alt_name": cert.subjectAltName } : {})
    };
}

export default {
    name: "cert_chain",
    title: "Order and validate an X.509 certificate chain",
    category: "Analysis",
    // The phrase "an issuer whose name matches but whose signature does not" stood here until
    // review caught it. That branch is unreachable -- `checkIssued` verifies cryptographically, so
    // such a certificate never becomes a link and cannot be reported as a broken one -- and this
    // string is MODEL-VISIBLE, which makes it worse than the stale comment that accompanied it: it
    // advertised a finding the tool cannot produce. What is actually detectable is the substitution
    // shape, and that is what it now says.
    description:
        "Order a PEM bundle of X.509 certificates into a chain and report where it breaks: wrong " +
        "order, a missing intermediate, an expired link, an issuer not permitted to sign, or an " +
        "issuer whose name and key identifier match while its SIGNATURE does not — the shape of a " +
        "substituted certificate. Every link is verified CRYPTOGRAPHICALLY: matching names and key " +
        "identifiers are metadata, and anyone can mint a certificate carrying the ones they like. " +
        "The three X.509 operations each parse ONE certificate and nothing relates two.",
    annotations: {
        title: "Order and validate an X.509 certificate chain",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
    },
    inputSchema: z.object({
        input: z.string().min(1).max(MAX_INPUT)
            .describe(
                "One or more PEM certificate blocks, in any order. A concatenated bundle — the " +
                "form `fullchain.pem` and most servers use — is the expected input."),
        "as_of": z.string().max(64).optional()
            .describe(
                "Judge validity at this instant (ISO 8601) instead of now. For asking whether a " +
                "chain WILL be valid at a future date, or was at an incident's timestamp."),
        "expiry_warning_days": z.number().int().min(0).max(3650).default(30)
            .describe("Flag any certificate expiring within this many days of the reference time.")
    }),

    /**
     * @param {Object} args - Validated arguments.
     * @returns {Promise<Object>} The ordered chain and what is wrong with it.
     */
    async run(args) {
        const blocks = args.input.match(PEM_BLOCK) ?? [];
        if (blocks.length === 0) {
            throw createInputError(
                "No PEM certificate blocks found. Expected one or more " +
                "-----BEGIN CERTIFICATE----- blocks; a DER file must be converted first, which " +
                "`cyberchef_bake` can do with [{\"op\":\"To Base64\"}] plus PEM headers.",
                { received: `${args.input.length} characters` });
        }
        if (blocks.length > MAX_CERTS) {
            throw createInputError(
                `${blocks.length} certificates, and ${MAX_CERTS} is the limit. Ordering compares ` +
                "every certificate against every other, so a large bundle is quadratic — and a " +
                "chain longer than a handful is a bundle of unrelated certificates rather than a " +
                "chain.",
                { certificates: blocks.length, maximum: MAX_CERTS });
        }

        const now = args.as_of ? new Date(args.as_of) : new Date();
        if (Number.isNaN(now.getTime())) {
            throw createInputError(
                `"${args.as_of}" is not a date this can parse. Use ISO 8601, e.g. 2026-01-31 or ` +
                "2026-01-31T12:00:00Z.", { received: args.as_of });
        }

        const certs = blocks.map((pem, index) => {
            try {
                return new X509Certificate(pem);
            } catch (error) {
                throw createInputError(
                    `Certificate ${index + 1} of ${blocks.length} could not be parsed: ` +
                    `${error.message}. The block is present but its contents are not a valid ` +
                    "certificate — a truncated copy/paste is the usual cause.",
                    { index: index + 1, total: blocks.length });
            }
        });

        // ORDERING. A leaf is a certificate that issues nothing else in the bundle. Determined by
        // asking every certificate whether it issued every other, rather than by trusting the order
        // they arrived in -- an out-of-order bundle is one of the things this exists to detect.
        //
        // SELECTION REQUIRES A VERIFIED SIGNATURE, and getting this wrong was this tool's most
        // serious defect. `checkIssued()` does NOT verify the signature -- it compares issuer/
        // subject names, authority/subject key identifiers and key usage. That was established by
        // measurement after a reviewer disputed the original claim, using a certificate minted with
        // the real intermediate's subject AND a subjectKeyIdentifier equal to the leaf's authority
        // key identifier, over a different key:
        //
        //     leaf.checkIssued(skidImposter)         true
        //     leaf.verify(skidImposter.publicKey)    FALSE
        //
        // The earlier draft took the FIRST `checkIssued` match and stopped. A certificate shaped
        // like that therefore captured the edge, and the real issuer sitting in the same bundle was
        // never considered -- so a good bundle containing one hostile certificate was reported as a
        // broken chain. `tests/mcp/fixtures/cert-skid-imposter.pem` is that certificate, committed
        // so the case stays pinned.
        //
        // Every candidate is now evaluated. One whose signature verifies always wins. A
        // metadata-only match is kept ONLY as a fallback when nothing verifies, because dropping it
        // would turn a substituted certificate into a silent orphan -- the link has to be reported
        // as broken, not omitted.
        //
        // There is deliberately NO separate record of which edges were chosen on metadata alone.
        // It would be redundant: a fallback selection happens only when nothing verified, so such a
        // link always reports `signature_verifies: false`, and a verified selection always reports
        // true. An earlier draft carried a `metadataOnlyLink` set that was written and never read --
        // reviewer-found dead code, removed rather than wired into the output that already says it.
        const issuedBy = new Map();
        for (const [i, cert] of certs.entries()) {
            let fallback;
            for (const [j, candidate] of certs.entries()) {
                if (i === j) continue;
                let issued;
                try {
                    issued = cert.checkIssued(candidate);
                } catch {
                    // A malformed or unsupported certificate is not an issuer. Swallowed rather
                    // than thrown: one bad member of a bundle must not stop the rest being ordered.
                    issued = false;
                }
                if (!issued) continue;

                let verifies;
                try {
                    verifies = cert.verify(candidate.publicKey);
                } catch {
                    // An unsupported key type cannot be confirmed, so it is not a verified issuer.
                    verifies = false;
                }
                if (verifies) {
                    issuedBy.set(i, j);
                    fallback = undefined;
                    break;
                }
                if (fallback === undefined) fallback = j;
            }
            if (!issuedBy.has(i) && fallback !== undefined) issuedBy.set(i, fallback);
        }
        const issuers = new Set(issuedBy.values());
        const leaves = certs.map((_, i) => i).filter(i => !issuers.has(i));

        // Walk from a leaf up. `seen` guards a certificate cross-signed into a cycle, which is rare
        // and would otherwise loop forever.
        const start = leaves.length > 0 ? leaves[0] : 0;
        const order = [];
        const seen = new Set();
        for (let at = start; at !== undefined && !seen.has(at); at = issuedBy.get(at)) {
            seen.add(at);
            order.push(at);
        }
        const orphans = certs.map((_, i) => i).filter(i => !seen.has(i));

        // LINK VERIFICATION. Name agreement and signature agreement are reported separately,
        // because the case where they disagree is the whole point of checking cryptographically --
        // and it is REACHABLE, contrary to what this file claimed until it was measured. See the
        // selection loop above.
        const links = [];
        for (let step = 0; step + 1 < order.length; step++) {
            const child = certs[order[step]];
            const parent = certs[order[step + 1]];
            const namesMatch = child.issuer === parent.subject;
            let signatureVerifies;
            try {
                signatureVerifies = child.verify(parent.publicKey);
            } catch {
                // An unsupported key type verifies as false rather than throwing the whole report
                // away -- the link is then reported unverified, which is the honest answer.
                signatureVerifies = false;
            }
            links.push({
                from: child.subject.replace(/\n/g, ", "),
                to: parent.subject.replace(/\n/g, ", "),
                "names_match": namesMatch,
                "signature_verifies": signatureVerifies,
                // Whether the issuer is even allowed to be one. A non-CA certificate that appears
                // as an issuer is a defect regardless of whether the signature verifies.
                "issuer_is_ca": parent.ca === true,
                ...(!signatureVerifies ? {
                    warning: "This certificate's issuer metadata points at the one above it — " +
                        "matching issuer name and authority key identifier — but the signature " +
                        "does NOT verify against that certificate's key. Nothing else in the " +
                        "bundle signed it either. That is what a SUBSTITUTED issuer looks like: " +
                        "anyone can mint a certificate carrying a chosen subject and key " +
                        "identifier. Do not treat this chain as verified."
                } : {}),
                ...(parent.ca !== true ? {
                    "ca_warning": "The issuer is not marked as a CA (basicConstraints CA:TRUE), so " +
                        "it is not permitted to sign certificates even if the signature verifies."
                } : {})
            });
        }

        const described = order.map(i => describe(certs[i], now));
        const expiringSoon = described.filter(
            entry => !entry.expired && entry.days_until_expiry <= args.expiry_warning_days);
        const broken = links.filter(link => !link.signature_verifies);
        const top = order.length ? certs[order.at(-1)] : null;
        const rootIsSelfSigned = top !== null && top.subject === top.issuer;

        // THE SUBSTITUTION SIGNATURE, and the first version of this asked the wrong question.
        //
        // It compared an orphan's subject against subjects already IN the chain, which finds
        // nothing in the case that matters: when an imposter replaces the real intermediate, the
        // real one is absent, so its subject is not in the chain either. Measured against a real
        // bundle -- leaf, imposter, root -- and it reported `shares_subject_with_chain: false` for
        // the very certificate it was written to catch.
        //
        // The right question is about the name the chain is LOOKING FOR. Every certificate in the
        // chain names its issuer; the top of the chain names an issuer that is not present, and
        // that is the slot an imposter occupies. A certificate bearing exactly that name, which
        // issued nothing here, is a certificate claiming to be your issuer on a key that signed
        // nothing.
        const wantedIssuers = new Set(order.map(i => certs[i].issuer));
        const impostors = orphans.filter(i => wantedIssuers.has(certs[i].subject));

        const problems = [];
        if (impostors.length) {
            problems.push(
                `${impostors.length} certificate(s) carry exactly the issuer name a certificate in ` +
                "this chain is looking for, and issued nothing in the bundle. A name that matches " +
                "an expected issuer, on a key that signed nothing, is what a substituted " +
                "certificate looks like — check which one your verifier would pick.");
        }
        if (orphans.length > impostors.length) {
            problems.push(
                `${orphans.length - impostors.length} certificate(s) are not part of the chain from ` +
                "the leaf. Either the bundle contains unrelated certificates, or an intermediate " +
                "that would join them is missing.");
        }
        if (broken.length) {
            problems.push(
                `${broken.length} link(s) do not verify cryptographically. See each link's ` +
                "`warning`: an issuer whose metadata matches while its signature does not is the " +
                "shape of a substituted certificate.");
        }
        const nonCaIssuers = links.filter(link => !link.issuer_is_ca);
        if (nonCaIssuers.length) {
            problems.push(
                `${nonCaIssuers.length} issuer(s) are not marked as a CA (basicConstraints ` +
                "CA:TRUE) and are not permitted to sign certificates.");
        }
        // A self-signed top must actually be self-signed. Its name says so; only its own key can
        // establish it, and a certificate whose subject equals its issuer while failing its own
        // signature is malformed or tampered with.
        if (rootIsSelfSigned) {
            let selfVerifies;
            try {
                selfVerifies = top.verify(top.publicKey);
            } catch {
                selfVerifies = false;
            }
            if (!selfVerifies) {
                problems.push(
                    "The certificate at the top of the chain names itself as its own issuer, but " +
                    "its signature does not verify against its own key. It is malformed or has " +
                    "been altered.");
            }
        }
        if (described.some(entry => entry.expired)) problems.push("A certificate in the chain has expired.");
        if (described.some(entry => entry.not_yet_valid)) problems.push("A certificate is not yet valid.");

        // NOTES ARE NOT PROBLEMS, and conflating them made this tool contradict itself in a single
        // response. A missing root went into `problems` while its own text said "that is NORMAL",
        // and `self_consistent` was `problems.length === 0` -- so the commonest real input in the
        // world, a server's leaf + intermediate `fullchain.pem`, came back `self_consistent: false`
        // beside an assessment saying a missing root is not a defect. A reader who believes the
        // flag distrusts a good bundle; a reader who believes the prose learns to ignore the flag.
        // Neither is acceptable, so the two categories are now separate fields and `self_consistent`
        // keys off defects alone.
        const notes = [];
        if (!rootIsSelfSigned && order.length > 0) {
            // Says only what the condition establishes. `!rootIsSelfSigned` means the issuer of
            // the TOP certificate is not in the bundle; it does not establish that the absent
            // certificate is the root. For a bare leaf it is the intermediate that is missing, and
            // the earlier wording asserted "the root is not in this bundle" in that case too.
            notes.push(
                "The chain does not end at a self-signed certificate, so the issuer above the top " +
                "certificate is not in this bundle. Most often that is the root, which is NORMAL " +
                "for a server's `fullchain.pem` — the root lives in the client's trust store. It " +
                "can also mean an intermediate is missing, which this tool cannot distinguish " +
                "from the outside. Either way it means this tool cannot tell you the chain is " +
                "trusted, only that it is internally consistent.");
        }

        return {
            "certificates_found": certs.length,
            "chain_length": order.length,
            chain: described,
            links,
            ...(orphans.length ? {
                "not_in_chain": orphans.map(i => ({
                    ...describe(certs[i], now),
                    // Names the certificate as occupying an issuer slot the chain needs filled,
                    // rather than merely being unrelated. The two are very different findings.
                    "claims_an_issuer_name_in_this_chain": wantedIssuers.has(certs[i].subject)
                }))
            } : {}),
            ...(expiringSoon.length ? {
                "expiring_soon": expiringSoon.map(entry => ({
                    subject: entry.subject, "not_after": entry.not_after,
                    "days_until_expiry": entry.days_until_expiry
                }))
            } : {}),
            // The chain's own validity window: the INTERSECTION of its members', which is the
            // number that matters and the one no per-certificate operation can produce.
            ...(described.length ? {
                "chain_valid_until": described.reduce(
                    (soonest, entry) => entry.not_after < soonest ? entry.not_after : soonest,
                    described[0].not_after)
            } : {}),
            "evaluated_at": now.toISOString(),
            ...(notes.length ? { notes } : {}),
            // Defects only. See the note above `notes` for why this is not `problems.length +
            // notes.length`.
            "self_consistent": problems.length === 0,
            ...(problems.length ? { problems } : {}),
            assessment: problems.length === 0 ?
                "Every link verifies cryptographically and every certificate is within its validity " +
                "window" + (notes.length ? ", and nothing in `notes` is a defect" : "") +
                ". This says the chain is internally consistent — it does NOT say it is " +
                "trusted, which depends on whether the root is in the verifier's trust store." :
                "See `problems` for what is wrong. Anything in `notes` is an observation rather " +
                "than a fault and is not counted against `self_consistent`."
        };
    }
};
