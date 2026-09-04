#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * 09 -- Prompts, resources, and results that are not text.
 *
 * The three surfaces v2.2.0 added, and the reason each exists.
 *
 * Two of them are answers to questions the tool list cannot answer. `tools/list` says what the
 * server can do; it does not say what to do FIRST, which with 504 operations is the harder problem.
 * And a saved recipe is reference material -- browsed far more often than executed -- which is what
 * resources are for.
 *
 * The third is a defect fix. `Generate QR Code` produced a valid PNG and the caller received an
 * empty string, because the payload rides in an `<img src="data:...">` and the html-to-text
 * conversion deleted the tag. `Play Media` lost audio the same way. Neither had ever worked over
 * MCP.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { connect, call, expect, step } from "./_lib.mjs";

/**
 * Call a tool and return the raw first content block, rather than its text.
 *
 * `call()` returns `content[0].text`, which is right for the 329 string-output operations and
 * wrong here: an image block carries `data` and `mimeType` and has no `text` at all.
 *
 * @param {import("@modelcontextprotocol/sdk/client/index.js").Client} client - A connected client.
 * @param {string} name - Tool name.
 * @param {Object} args - Tool arguments.
 * @returns {Promise<Object>} The first content block.
 */
async function callBlock(client, name, args = {}) {
    const res = await client.callTool({ name, arguments: args });
    if (res.isError) throw new Error(`${name} failed: ${res.content?.[0]?.text ?? "unknown"}`);
    return res.content[0];
}

const client = await connect("prompts-and-media");
try {
    step("Prompts: where to start when you do not know what you have");
    const { prompts } = await client.listPrompts();
    for (const p of prompts) console.log(`  ${p.name.padEnd(22)} ${p.description.split(".")[0]}.`);
    expect("six workflow prompts", prompts.length, 6);

    // A prompt is rendered with your data and handed back as a user message. Your client shows
    // these as slash commands, so this is what it sends on your behalf.
    const analysis = await client.getPrompt({
        name: "analyse-unknown-data",
        arguments: { data: "VGhlIHF1aWNrIGJyb3duIGZveA==" }
    });
    const text = analysis.messages[0].content.text;
    console.log(`  rendered ${text.length} chars, first line: ${text.split("\n")[0]}`);
    expect("the data is embedded", text.includes("VGhlIHF1aWNrIGJyb3duIGZveA=="), true);
    // The value is in the ORDER it prescribes, not in listing tools: Magic before guessing.
    expect("it says to identify before decoding", text.includes("cyberchef_magic"), true);

    step("An image operation returns an image, not an empty string");
    const qr = await callBlock(client, "cyberchef_bake", {
        input: "https://example.com",
        recipe: [{ op: "Generate QR Code" }]
    });
    console.log(`  type=${qr.type} mimeType=${qr.mimeType} base64=${qr.data.length} chars`);
    expect("an image block", qr.type, "image");
    expect("declared as PNG", qr.mimeType, "image/png");
    // Before v2.2.0 this was "" -- the whole PNG, deleted by the html-to-text conversion.
    expect("carries a real PNG", Buffer.from(qr.data, "base64").subarray(0, 4).toString("hex"),
        "89504e47");

    step("Markup that is NOT an image is still reduced to readable text");
    // Magic's answer is a table of candidate decodings. Fixing the image case must not turn this
    // back into raw `<table class='table table-hover'>`, which is unreadable and expensive.
    const magic = await callBlock(client, "cyberchef_bake", {
        input: "VGhlIHF1aWNr",
        recipe: [{ op: "Magic", args: { depth: 2 } }]
    });
    expect("a text block", magic.type, "text");
    expect("markup stripped", magic.text.includes("<table"), false);

    step("Binary stays byte-lossless text by default");
    // It looks like mojibake and is exactly reversible: one character per byte. That was measured,
    // and it is why the default was NOT changed -- `CYBERCHEF_BINARY_OUTPUT=base64` opts in.
    const gzipped = await call(client, "cyberchef_bake", {
        input: "hello world", recipe: [{ op: "Gzip" }]
    });
    const firstTwo = [gzipped.charCodeAt(0), gzipped.charCodeAt(1)];
    console.log(`  ${gzipped.length} chars; first two bytes: ${firstTwo.map(b => b.toString(16))}`);
    expect("the gzip magic survives as bytes", firstTwo.join(","), "31,139");   // 0x1f 0x8b

    step("Saved recipes are readable as resources, without a tool call");
    const created = JSON.parse(await call(client, "cyberchef_recipe_create", {
        name: "example-09-roundtrip",
        description: "base64 encode",
        operations: [{ op: "To Base64" }]
    }));

    const { resources } = await client.listResources();
    const mine = resources.find(r => r.uri === `recipe://${created.id}`);
    console.log(`  ${resources.length} resource(s); mine: ${mine?.uri} (${mine?.name})`);
    expect("listed by id", Boolean(mine), true);

    // Keyed by id rather than name on purpose: recipe names are user-supplied and not unique, so a
    // name-keyed URI would silently return the wrong recipe.
    const read = await client.readResource({ uri: `recipe://${created.id}` });
    const recipe = JSON.parse(read.contents[0].text);
    expect("reads back as JSON", read.contents[0].mimeType, "application/json");
    expect("and is the recipe we saved", recipe.operations[0].op, "To Base64");

    await call(client, "cyberchef_recipe_delete", { id: created.id });

    step("Annotations tell a client what it may run unattended");
    const { tools } = await client.listTools();
    const bake = tools.find(t => t.name === "cyberchef_bake");
    const magicTool = tools.find(t => t.name === "cyberchef_magic");
    console.log(`  cyberchef_magic  readOnly=${magicTool.annotations.readOnlyHint}`);
    console.log(`  cyberchef_bake   readOnly=${bake.annotations.readOnlyHint} ` +
        `openWorld=${bake.annotations.openWorldHint}`);
    expect("a pure operation is read-only", magicTool.annotations.readOnlyHint, true);
    // Deliberately false: bake runs caller-supplied recipes, which may contain `HTTP request` with
    // a POST. Convenient and wrong would teach a client to ignore the whole set.
    expect("the executor is not", bake.annotations.readOnlyHint, false);

    console.log("\n09-prompts-and-media complete.");
} finally {
    await client.close();
}
