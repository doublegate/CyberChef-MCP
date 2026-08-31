#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * 05 -- Saving a recipe once and reusing it by name.
 *
 * A recipe you will run more than once does not belong in the conversation. Save it, and every
 * later call is a name plus an input. The store is a JSON file, so recipes survive restarts.
 *
 * Writes to a temp file and cleans up after itself: CYBERCHEF_RECIPE_STORAGE points the store
 * somewhere disposable so running this example cannot disturb a real one.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SERVER, call, expect, step } from "./_lib.mjs";

const dir = await mkdtemp(join(tmpdir(), "cyberchef-example-"));
const client = new Client({ name: "saved-recipes", version: "1.0.0" }, { capabilities: {} });
await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, CYBERCHEF_RECIPE_STORAGE: join(dir, "recipes.json") },
    stderr: "inherit"
}));

try {
    step("Create a named recipe");
    const created = JSON.parse(await call(client, "cyberchef_recipe_create", {
        name: "b64-of-sha256",
        description: "SHA-256 the input, then base64 the digest",
        operations: [
            { op: "SHA2", args: { size: "256" } },
            { op: "To Base64" }
        ],
        tags: ["hashing", "example"]
    }));
    console.log(`  created id=${created.id} name=${created.name}`);
    expect("it has an id", typeof created.id === "string" && created.id.length > 0, true);

    step("List what is stored");
    const listed = JSON.parse(await call(client, "cyberchef_recipe_list", {}));
    const names = (listed.recipes ?? listed).map(r => r.name);
    console.log(`  stored recipes: ${names.join(", ")}`);
    expect("our recipe is listed", names.includes("b64-of-sha256"), true);

    step("Execute it by id");
    const out = await call(client, "cyberchef_recipe_execute", {
        id: created.id,
        input: "run me"
    });
    console.log(`  result: ${out}`);
    // The same thing, computed here, so the example asserts a value rather than a shape.
    const { createHash } = await import("node:crypto");
    const expected = Buffer.from(
        createHash("sha256").update("run me").digest("hex")
    ).toString("base64");
    expect("matches an independently computed answer", out, expected);

    step("Export it, so it can be shared or version-controlled");
    const exported = await call(client, "cyberchef_recipe_export", { id: created.id, format: "json" });
    console.log(`  exported ${Buffer.byteLength(exported)} bytes of JSON`);
    expect("export is valid JSON", (() => {
        try {
            JSON.parse(exported); return true;
        } catch {
            return false;
        }
    })(), true);

    step("Delete it again");
    await call(client, "cyberchef_recipe_delete", { id: created.id });
    const after = JSON.parse(await call(client, "cyberchef_recipe_list", {}));
    const remaining = (after.recipes ?? after).map(r => r.name);
    expect("it is gone", remaining.includes("b64-of-sha256"), false);

    console.log("\nRecipe lifecycle complete.");
} finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
}
