#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * 04 -- A realistic triage: what IS this blob, and what is inside it?
 *
 * The example worth reading if you want to see what this server is for. An analyst handed an
 * unknown string does roughly this: identify the encoding, peel it, look for structure, extract
 * anything actionable. Each step here is a decision made from the previous step's output, which
 * is exactly the shape of work an MCP client is good at driving.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { connect, call, expect, step } from "./_lib.mjs";

// A payload built the way a real one arrives: gzipped, then base64'd. Constructed here rather
// than shipped as a fixture so you can see exactly what the answer should be.
const SECRET = "Exfil to 203.0.113.42 -- contact ops@example.invalid -- http://evil.example/c2";

const client = await connect("triage");
try {
    step("Build the sample (gzip, then base64)");
    const sample = await call(client, "cyberchef_bake", {
        input: SECRET,
        recipe: [{ op: "Gzip" }, { op: "To Base64" }]
    });
    console.log(`  sample: ${sample.slice(0, 60)}...`);

    step("1. What is it? Ask Magic rather than guessing");
    // `Magic` brute-forces candidate decodings and reports which looked plausible, with an entropy
    // reading for each. It is the right first move on an unknown blob, and it is why "detect, then
    // decode" beats "try From Base64 and see".
    //
    // Magic is a FLOW-CONTROL operation. Until v2.1.0 it -- and nine others -- appeared in the
    // tool list and failed on every call, because the Node API wrapper refused flow control
    // outright. They run on the core engine now, which always supported them.
    const magic = await call(client, "cyberchef_magic", { input: sample, depth: 3 });
    console.log(`  Magic suggests: ${magic.replace(/\s+/g, " ").slice(0, 130)}...`);
    // Asserted on Magic returning a candidate table rather than on a specific candidate.
    //
    // Gzip embeds an mtime, so `sample` differs on every run -- verified: three runs a second
    // apart produced `H4sIADWZlWoA`, `H4sIADaZlWoA`, `H4sIADeZlWoA`. Magic's ranking shifts with
    // those bytes, so asserting that it names base64 specifically is a coin flip, and this example
    // is run by the test suite. Pinning a non-deterministic output is how a green suite starts
    // lying; the deterministic decode two steps below is the real check.
    expect("Magic returned candidate decodings", magic.includes("Recipe"), true);

    step("2. Peel it: base64, then gunzip");
    const plain = await call(client, "cyberchef_bake", {
        input: sample,
        recipe: [{ op: "From Base64" }, { op: "Gunzip" }]
    });
    console.log(`  decoded: ${plain}`);
    expect("recovered the original text", plain, SECRET);

    step("3. Extract indicators from the decoded text");
    const ips = await call(client, "cyberchef_bake", {
        input: plain,
        recipe: [{ op: "Extract IP addresses" }]
    });
    console.log(`  IPs:    ${ips.trim()}`);
    expect("found the IPv4 address", ips.includes("203.0.113.42"), true);

    const urls = await call(client, "cyberchef_bake", {
        input: plain,
        recipe: [{ op: "Extract URLs" }]
    });
    console.log(`  URLs:   ${urls.trim()}`);
    expect("found the C2 URL", urls.includes("http://evil.example/c2"), true);

    const emails = await call(client, "cyberchef_bake", {
        input: plain,
        recipe: [{ op: "Extract email addresses" }]
    });
    console.log(`  Emails: ${emails.trim()}`);
    expect("found the contact address", emails.includes("ops@example.invalid"), true);

    step("4. Fingerprint it, so the finding can be correlated later");
    const sha256 = await call(client, "cyberchef_sha2", { input: plain, size: "256" });
    console.log(`  sha2-256: ${sha256}`);
    expect("digest is well formed", /^[0-9a-f]{64}$/.test(sha256), true);

    console.log("\nTriage complete: decoded, indicators extracted, sample fingerprinted.");
} finally {
    await client.close();
}
