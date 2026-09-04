#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * 03 -- Finding the operation you need, out of 504.
 *
 * Nobody remembers 504 operation names, and a model should not have to guess. `cyberchef_search`
 * is the discovery path: search by keyword, then use the name it gives you in `cyberchef_bake`.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { connect, call, expect, step } from "./_lib.mjs";

const client = await connect("discover");
try {
    step("Search by keyword");
    const raw = await call(client, "cyberchef_search", { query: "base64" });
    const hits = JSON.parse(raw);
    console.log(`  "base64" matched ${hits.matches} operations`);
    for (const h of hits.operations.slice(0, 5)) console.log(`    - ${h.operation}: ${h.summary}`);
    expect("finds To Base64", hits.operations.some(h => h.operation === "To Base64"), true);

    step("Search is how you learn an operation's exact name");
    const jwt = JSON.parse(await call(client, "cyberchef_search", { query: "JWT" }));
    console.log(`  "JWT" matched: ${jwt.operations.map(h => h.operation).join(", ")}`);
    expect("finds a JWT operation", jwt.matches > 0, true);

    step("Then run it by that name");
    // A throwaway token, signed with the literal key "secret" -- this is the canonical example
    // token from jwt.io, not a credential.
    const token = [
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ",
        "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    ].join(".");
    const decoded = await call(client, "cyberchef_bake", {
        input: token,
        recipe: [{ op: "JWT Decode" }]
    });
    console.log(`  JWT Decode -> ${decoded.replace(/\s+/g, " ").slice(0, 90)}...`);
    expect("decoded the subject", decoded.includes("1234567890"), true);

    step("Browsing: categories -> operations -> full schema");
    // The default tool surface is an INDEX, not a catalogue. `tools/list` carries 40 tools
    // instead of 543 -- 40,637 bytes instead of 421,041 -- and the detail is fetched only for
    // what you actually use. These three tools are that hierarchy.
    const cats = JSON.parse(await call(client, "cyberchef_categories", {}));
    console.log(`  ${cats.categories.length} categories covering ${cats.totalOperations} operations`);
    console.log(`  e.g. ${cats.categories.slice(0, 4).map(c => `${c.category} (${c.operations})`).join(", ")}`);
    expect("every category has operations", cats.categories.every(c => c.operations > 0), true);

    const hashing = JSON.parse(await call(client, "cyberchef_list_operations", {
        category: "Hashing"
    }));
    console.log(`  Hashing contains ${hashing.operations.length} operations`);
    expect("the listing names real operations", hashing.operations.some(o => o.operation === "MD5"), true);

    step("Then read the exact argument schema for the one you chose");
    const { operations } = JSON.parse(await call(client, "cyberchef_describe_operation", {
        operations: ["XOR"]
    }));
    const xor = operations[0];
    console.log(`  XOR takes: ${xor.args.map(a => a.name).join(", ")}`);
    console.log(`  key accepts: ${JSON.stringify(xor.args.find(a => a.name === "key").options)}`);
    expect("XOR advertises its arguments", xor.args.length > 1, true);

    step("And run it -- no tool entry required");
    // XOR is not in `tools/list` under the default surface. It does not need to be: `bake` takes
    // any operation by name, which is what makes the small index lossless.
    const xored = await call(client, "cyberchef_bake", {
        input: "secret",
        recipe: [{ op: "XOR", args: { key: { string: "2a", option: "Hex" } } }]
    });
    const back = await call(client, "cyberchef_bake", {
        input: xored,
        recipe: [{ op: "XOR", args: { key: { string: "2a", option: "Hex" } } }]
    });
    console.log(`  XOR is its own inverse: "secret" -> ... -> "${back}"`);
    expect("round-trips through an unlisted operation", back, "secret");

    console.log("\nDiscovery complete.");
} finally {
    await client.close();
}
