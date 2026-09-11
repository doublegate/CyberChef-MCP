/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * `pqc_identify`, tested against material Node actually generated.
 *
 * NO HAND-WRITTEN FIXTURES. Node 24 implements all eighteen NIST parameter sets, so every key,
 * signature and structure here is produced by `crypto` at test time. That matters more than
 * convenience: a hand-assembled DER blob tests the parser against my understanding of the format,
 * while a generated one tests it against an implementation that has to interoperate. The OID and
 * size table in the tool was extracted the same way.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign, randomBytes, createHash } from "node:crypto";
import tool from "../../src/node/tools/pqc-identify.mjs";

/**
 * Run the tool the way the server does: through the schema, so defaults apply.
 *
 * `tool.inputSchema.parse(args)` and not a hand-built object -- the same lesson the entropy-scan
 * flake taught this release's predecessor, where a harness that skipped `parse` lost the Zod
 * defaults and reported a 100% failure rate that was pure artefact.
 */
const run = (args) => tool.run(tool.inputSchema.parse(args));

describe("pqc_identify", () => {
    describe("a DER structure with an OID is definite", () => {
        for (const [alg, expected, standard] of [
            ["ml-dsa-44", "ML-DSA-44", "FIPS 204"],
            ["ml-dsa-87", "ML-DSA-87", "FIPS 204"],
            ["ml-kem-512", "ML-KEM-512", "FIPS 203"],
            ["ml-kem-1024", "ML-KEM-1024", "FIPS 203"],
            ["slh-dsa-sha2-128s", "SLH-DSA-SHA2-128s", "FIPS 205"],
            ["slh-dsa-shake-256f", "SLH-DSA-SHAKE-256f", "FIPS 205"]
        ]) {
            it(`identifies ${expected} from a PEM public key`, () => {
                const { publicKey } = generateKeyPairSync(alg);
                const r = run({ input: publicKey.export({ type: "spki", format: "pem" }) });

                expect(r.identified).toBe(true);
                expect(r.confidence).toBe("definite");
                expect(r.algorithm).toBe(expected);
                expect(r.standard).toBe(standard);
                expect(r.decoded_as).toBe("PEM");
                // The claim must rest on the OID, not on a length that happened to match.
                expect(r.basis).toContain("OID");
            });
        }

        it("identifies a PKCS#8 private key, which carries a version INTEGER before the algorithm", () => {
            // SPKI and PKCS#8 differ in shape; a parser that only handles SPKI silently fails here.
            const { privateKey } = generateKeyPairSync("ml-dsa-65");
            const r = run({ input: privateKey.export({ type: "pkcs8", format: "pem" }) });

            expect(r.confidence).toBe("definite");
            expect(r.algorithm).toBe("ML-DSA-65");
        });

        it("accepts the same key as hex and as base64 DER", () => {
            const { publicKey } = generateKeyPairSync("ml-kem-768");
            const der = publicKey.export({ type: "spki", format: "der" });

            expect(run({ input: der.toString("hex") }).algorithm).toBe("ML-KEM-768");
            expect(run({ input: der.toString("base64") }).algorithm).toBe("ML-KEM-768");
        });

        it("reports the OID it read, so the answer can be checked rather than trusted", () => {
            const { publicKey } = generateKeyPairSync("ml-dsa-44");
            const r = run({ input: publicKey.export({ type: "spki", format: "pem" }) });
            expect(r.oid).toBe("2.16.840.1.101.3.4.3.17");
        });
    });

    describe("raw bytes give a candidate list, never a definite answer", () => {
        it("calls a lone match probable, not definite", () => {
            const { privateKey } = generateKeyPairSync("ml-dsa-44");
            const signature = sign(null, Buffer.from("message"), privateKey);

            expect(signature.length).toBe(2420);
            const r = run({ input: signature.toString("base64") });
            expect(r.identified).toBe(true);
            expect(r.confidence).toBe("probable");
            expect(r.basis).toBe("byte length only");
            expect(r.candidates).toHaveLength(1);
            expect(r.candidates[0]).toMatchObject({ algorithm: "ML-DSA-44", role: "signature" });
        });

        it("reports ML-KEM-1024's key/ciphertext collision as ambiguous rather than picking one", () => {
            // 1568 bytes is BOTH an encapsulation key and a ciphertext for this parameter set. A
            // tool that answered one would be right half the time and confident always.
            const r = run({ input: randomBytes(1568).toString("base64") });

            expect(r.confidence).toBe("ambiguous");
            expect(r.candidates.map(c => c.role).sort()).toEqual(["KEM ciphertext", "public key"]);
            expect(r.notes.join(" ")).toContain("both 1568 bytes");
        });

        it("warns that a 32-byte SLH-DSA key is indistinguishable from a hash", () => {
            // A SHA-256 digest is 32 bytes. So is an SLH-DSA-128 public key, and an Ed25519 key.
            const digest = createHash("sha256").update("not a key at all").digest();
            const r = run({ input: digest.toString("base64") });

            expect(r.notes.join(" ")).toMatch(/SHA-256.*Ed25519|Ed25519.*SHA-256/);
            expect(r.confidence).not.toBe("definite");
        });

        it("says the hash family cannot be recovered from a raw SLH-DSA signature", () => {
            // sha2-128s and shake-128s both produce 7856-byte signatures.
            const { privateKey } = generateKeyPairSync("slh-dsa-sha2-128s");
            const signature = sign(null, Buffer.from("m"), privateKey);
            expect(signature.length).toBe(7856);

            const r = run({ input: signature.toString("base64") });
            const names = r.candidates.filter(c => c.role === "signature").map(c => c.algorithm);
            expect(names).toContain("SLH-DSA-SHA2-128s");
            expect(names).toContain("SLH-DSA-SHAKE-128s");
            expect(r.notes.join(" ")).toContain("hash family");
        });
    });

    describe("what it declines to claim", () => {
        it("does not claim a non-PQC key is post-quantum, and names the OID it saw", () => {
            const { publicKey } = generateKeyPairSync("ed25519");
            const r = run({ input: publicKey.export({ type: "spki", format: "pem" }) });

            expect(r.identified).toBe(false);
            expect(r.notes.join(" ")).toContain("not a NIST PQC algorithm");
        });

        it("says a non-match is not evidence of absence", () => {
            const r = run({ input: randomBytes(999).toString("base64") });
            expect(r.identified).toBe(false);
            expect(r.confidence).toBe("none");
            // The honesty clause: 999 bytes matching nothing does not mean the input is not PQC.
            expect(r.notes.join(" ")).toContain("not evidence");
        });

        it("does not throw on malformed DER", () => {
            // A leading 0x30 with a nonsense length: the parser must fall through to the length
            // path, not read past the buffer.
            const evil = Buffer.from([0x30, 0x84, 0xff, 0xff, 0xff, 0xff, 0x06, 0x01, 0x2a]);
            expect(() => run({ input: evil.toString("hex") })).not.toThrow();
        });

        it("does not mistake a truncated OID for a valid one", () => {
            // Final byte has the continuation bit set, so the arc never terminates.
            const der = Buffer.from([0x30, 0x08, 0x30, 0x06, 0x06, 0x02, 0x2a, 0x86, 0x05, 0x00]);
            const r = run({ input: der.toString("hex") });
            expect(r.identified).toBe(false);
        });
    });

    describe("the DER walk rejects rather than guesses", () => {
        // Each of these is a structure that is well-formed enough to enter the walk and wrong
        // somewhere specific. They exist because the walk's failure paths are where a parser
        // invents an answer: the version of this tool that scanned for a 0x06 tag byte returned a
        // plausible WRONG OID for ML-KEM-1024 rather than returning nothing. A parser that cannot
        // say "no" cheaply is a parser that says something false expensively.
        //
        // `identified: false` throughout -- the tool falls through to the length path, and none of
        // these lengths matches a parameter set.
        for (const [label, hex] of [
            ["a SEQUENCE with nothing inside it", "3000"],
            ["a PKCS#8 version INTEGER with nothing after it", "3003020100"],
            ["a first element that is neither a version nor an AlgorithmIdentifier", "3003040100"],
            ["an AlgorithmIdentifier whose first element is not an OID", "30053003020100"],
            ["an OBJECT IDENTIFIER with an empty body", "3004300206 00".replace(/\s/g, "")]
        ]) {
            it(`returns nothing for ${label}`, () => {
                const r = run({ input: hex, "input_format": "Hex" });
                expect(r.identified).toBe(false);
                expect(r.oid).toBeUndefined();
            });
        }
    });

    describe("the declared input format is obeyed", () => {
        it("reads a PEM when told to, rather than only when it guesses", () => {
            const { publicKey } = generateKeyPairSync("ml-dsa-44");
            const r = run({
                input: publicKey.export({ type: "spki", format: "pem" }),
                "input_format": "PEM"
            });
            expect(r.algorithm).toBe("ML-DSA-44");
            expect(r.decoded_as).toBe("PEM");
        });

        it("raises a typed input error when PEM is declared and there is no PEM", () => {
            // The shape matters as much as the failure. Every other registry tool reports bad
            // input as INVALID_INPUT naming the field; a bare Error here would reach a client as
            // an untyped message for the same class of mistake.
            let thrown;
            try {
                run({ input: "clearly not a certificate", "input_format": "PEM" });
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeDefined();
            expect(thrown.code).toBe("INVALID_INPUT");
            expect(thrown.message).toMatch(/BEGIN/);
        });

        it("treats input as raw bytes when told to, even when it looks like hex", () => {
            // "deadbeef" is valid hex AND eight raw bytes. Auto would read it as hex; Raw must not,
            // or a declared format would be a suggestion rather than an instruction.
            expect(run({ input: "deadbeef", "input_format": "Hex" }).input_bytes).toBe(4);
            expect(run({ input: "deadbeef", "input_format": "Raw" }).input_bytes).toBe(8);
        });

        it("reads base64 when told to, for input short enough that Auto would not", () => {
            // Auto only tries base64 above 32 characters, so a short base64 string is the case
            // where the declared format is the only thing that can be right.
            const r = run({ input: "AAAA", "input_format": "Base64" });
            expect(r.decoded_as).toBe("Base64");
            expect(r.input_bytes).toBe(3);
        });
    });

    describe("the tool contract", () => {
        it("declares the registry shape and a non-prefixed name", () => {
            expect(tool.name).toBe("pqc_identify");
            expect(tool.name.startsWith("cyberchef_")).toBe(false);
            expect(typeof tool.run).toBe("function");
            expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
        });

        it("describes what it cannot do, not only what it can", () => {
            // The cert_chain lesson: a description that advertises a guarantee the tool does not
            // make is worse than no description.
            expect(tool.description).toMatch(/ambiguous|1568|guess/i);
        });
    });
});
