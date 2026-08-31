#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * 06 -- Many inputs in one call, with `cyberchef_batch`.
 *
 * Twenty separate tool calls is twenty round trips and twenty entries in the conversation.
 * `cyberchef_batch` takes a list of calls and returns a list of results, reporting per-item
 * failures instead of abandoning the run -- which is what you want when one input in a dump is
 * malformed and the other nineteen are fine.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { connect, call, expect, step } from "./_lib.mjs";

const client = await connect("batch");
try {
    step("Hash several inputs in one request");
    const inputs = ["alpha", "beta", "gamma", "delta"];
    const raw = await call(client, "cyberchef_batch", {
        operations: inputs.map(input => ({
            tool: "cyberchef_sha2",
            arguments: { input, size: "256" }
        })),
        mode: "parallel"
    });
    const res = JSON.parse(raw);
    console.log(`  ${res.total} operations, ${res.successful} succeeded, ${res.failed} failed`);
    expect("all four succeeded", res.successful, 4);

    const { createHash } = await import("node:crypto");
    const wanted = inputs.map(i => createHash("sha256").update(i).digest("hex"));
    const got = res.results.map(r => r.result ?? r.output ?? r);
    console.log(`  first digest: ${String(got[0]).slice(0, 32)}...`);
    expect("results are in request order", String(got[0]), wanted[0]);
    expect("and the last one matches too", String(got[3]), wanted[3]);

    step("A bad input fails ITS item, not the batch");
    // "not-base64!!" cannot be decoded. Sequential mode makes the ordering deterministic, which
    // matters when you are correlating results back to inputs.
    const mixed = JSON.parse(await call(client, "cyberchef_batch", {
        operations: [
            { tool: "cyberchef_from_base64", arguments: { input: "aGVsbG8=" } },
            { tool: "cyberchef_gunzip", arguments: { input: "definitely not gzip" } },
            { tool: "cyberchef_to_base64", arguments: { input: "still fine" } }
        ],
        mode: "sequential"
    }));
    console.log(`  ${mixed.successful} succeeded, ${mixed.failed} failed -- the batch still returned`);
    expect("two of three succeeded", mixed.successful, 2);
    expect("one failure was reported", mixed.failed, 1);
    expect("the failure is described", mixed.errors.length > 0, true);

    step("Batch also runs whole recipes, not just single operations");
    const recipes = JSON.parse(await call(client, "cyberchef_batch", {
        operations: [
            {
                tool: "cyberchef_bake",
                arguments: {
                    input: "one",
                    recipe: [{ op: "To Hex", args: { delimiter: "None" } }, { op: "To Upper case" }]
                }
            },
            {
                tool: "cyberchef_bake",
                arguments: {
                    input: "two",
                    recipe: [{ op: "To Hex", args: { delimiter: "None" } }, { op: "To Upper case" }]
                }
            }
        ]
    }));
    console.log(`  recipe batch: ${recipes.successful}/${recipes.total} succeeded`);
    expect("both recipes ran", recipes.successful, 2);

    console.log("\nBatch processing complete.");
} finally {
    await client.close();
}
