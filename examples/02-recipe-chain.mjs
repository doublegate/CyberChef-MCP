#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * 02 -- Chaining operations with `cyberchef_bake`.
 *
 * Calling one tool per step costs a round trip each and makes the model hold intermediate values.
 * `cyberchef_bake` takes a whole recipe and runs it server-side in one call. It also reaches
 * every one of the 504 operations by name, including any not exposed as its own tool.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { connect, call, expect, step } from "./_lib.mjs";

const client = await connect("recipe-chain");
try {
    step("A recipe is a list of operations, applied in order");
    // Operation names here are the CyberChef display names ("To Hex"), NOT the snake_case tool
    // names. The recipe format is CyberChef's own, so a recipe copied out of the web UI works.
    const hex = await call(client, "cyberchef_bake", {
        input: "chain me",
        recipe: [{ op: "To Hex", args: { delimiter: "None" } }]
    });
    console.log(`  To Hex          -> ${hex}`);
    expect("hex encodes", hex, Buffer.from("chain me").toString("hex"));

    step("Several operations in one pass");
    const chained = await call(client, "cyberchef_bake", {
        input: "chain me",
        recipe: [
            { op: "To Hex", args: { delimiter: "None" } },
            { op: "To Upper case" },
            { op: "To Base64" }
        ]
    });
    console.log(`  hex|upper|b64   -> ${chained}`);
    const byHand = Buffer.from(
        Buffer.from("chain me").toString("hex").toUpperCase()
    ).toString("base64");
    expect("matches the same steps applied by hand", chained, byHand);

    step("And back again, in one call");
    const back = await call(client, "cyberchef_bake", {
        input: chained,
        recipe: [
            { op: "From Base64" },
            { op: "To Lower case" },
            { op: "From Hex", args: { delimiter: "None" } }
        ]
    });
    console.log(`  reversed        -> ${back}`);
    expect("round-trips to the original", back, "chain me");

    step("An operation with no dedicated tool is still reachable");
    // This is the argument for keeping the default tool surface small: `bake` can run anything,
    // so nothing is lost by not exposing every operation as its own tool.
    const rot = await call(client, "cyberchef_bake", {
        input: "Attack at dawn",
        recipe: [{ op: "ROT13", args: { amount: 13 } }]
    });
    console.log(`  ROT13           -> ${rot}`);
    expect("ROT13 is its own inverse", await call(client, "cyberchef_bake", {
        input: rot,
        recipe: [{ op: "ROT13", args: { amount: 13 } }]
    }), "Attack at dawn");

    console.log("\nRecipe chaining complete.");
} finally {
    await client.close();
}
