/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The three tool surfaces, and the navigation hierarchy the default one rests on.
 *
 * The property that matters is not "the index is small" -- it is **small AND complete**: no
 * operation may become unreachable just because its schema is no longer pre-loaded. A test that
 * only measured the payload would happily pass on a server that had lost half its functionality,
 * so every size assertion here is paired with a reachability assertion.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import OperationConfig from "../../src/core/config/OperationConfig.json" with {type: "json"};

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, "../../src/node/mcp-server.mjs");
const BOOT_TIMEOUT_MS = 120_000;

/**
 * Connect a client to a server started with a given tool surface.
 *
 * @param {string|undefined} surface - Value for CYBERCHEF_TOOL_SURFACE, or undefined for default.
 * @returns {Promise<Client>} A connected client.
 */
async function connectWith(surface) {
    const env = { ...process.env };
    if (surface === undefined) delete env.CYBERCHEF_TOOL_SURFACE;
    else env.CYBERCHEF_TOOL_SURFACE = surface;

    const client = new Client({ name: "surface-test", version: "0.0.0" }, { capabilities: {} });
    await client.connect(new StdioClientTransport({
        command: process.execPath, args: [SERVER], env
    }));
    return client;
}

/**
 * The first text block of a tool result, parsed as JSON.
 *
 * @param {Client} client - Connected client.
 * @param {string} name - Tool name.
 * @param {Object} args - Arguments.
 * @returns {Promise<*>} Parsed result.
 */
async function callJson(client, name, args) {
    const res = await client.callTool({ name, arguments: args });
    expect(res.isError, `${name} returned an error: ${res.content?.[0]?.text}`).toBeFalsy();
    return JSON.parse(res.content[0].text);
}

describe("tool surface: index (the default)", () => {
    let client;
    let tools;

    beforeAll(async () => {
        client = await connectWith(undefined);
        ({ tools } = await client.listTools());
    }, BOOT_TIMEOUT_MS);

    afterAll(async () => {
        await client?.close();
    });

    it("is the default without any environment variable set", () => {
        // Asserted by count rather than by reading the env: the question is what a user gets out
        // of the box, not what the code intends.
        expect(tools.length).toBeLessThan(40);
    });

    it("still exposes the executor and the navigation tools", () => {
        const names = new Set(tools.map(t => t.name));
        for (const required of [
            "cyberchef_bake", "cyberchef_search",
            "cyberchef_categories", "cyberchef_list_operations", "cyberchef_describe_operation"
        ]) {
            expect(names.has(required), `${required} must be in the index`).toBe(true);
        }
    });

    it("exposes Magic, because it is the entry point for unknown data", () => {
        // The one operation kept in every surface. Reaching the tool that tells you WHAT you are
        // looking at should not require first knowing where to look.
        expect(tools.map(t => t.name)).toContain("cyberchef_magic");
    });

    it("does NOT pre-load ordinary operation tools", () => {
        const names = tools.map(t => t.name);
        expect(names).not.toContain("cyberchef_to_morse_code");
        expect(names).not.toContain("cyberchef_aes_encrypt");
    });

    it("keeps every operation reachable through bake anyway", async () => {
        // The claim the whole design rests on. If this fails, the index is not a smaller surface,
        // it is a smaller product.
        const res = await client.callTool({
            name: "cyberchef_bake",
            arguments: { input: "hi", recipe: [{ op: "To Morse Code" }] }
        });
        expect(res.isError).toBeFalsy();
        expect(res.content[0].text.trim()).toBe(".... ..");
    }, BOOT_TIMEOUT_MS);

    it("lists categories that account for every operation", async () => {
        const index = await callJson(client, "cyberchef_categories", {});
        expect(index.categories.length).toBeGreaterThan(10);
        expect(index.totalOperations).toBe(Object.keys(OperationConfig).length);
        // Each entry must be actionable: a name you can pass straight to list_operations.
        for (const c of index.categories) {
            expect(typeof c.category).toBe("string");
            expect(c.operations).toBeGreaterThan(0);
        }
    }, BOOT_TIMEOUT_MS);

    it("lists the operations in a category, and they are real", async () => {
        const listing = await callJson(client, "cyberchef_list_operations", { category: "Hashing" });
        expect(listing.category).toBe("Hashing");
        expect(listing.operations.length).toBeGreaterThan(10);
        for (const entry of listing.operations) {
            expect(
                Object.prototype.hasOwnProperty.call(OperationConfig, entry.operation),
                `${entry.operation} is listed but does not exist`
            ).toBe(true);
        }
    }, BOOT_TIMEOUT_MS);

    it("matches a category name case-insensitively, and explains an unknown one", async () => {
        const ok = await callJson(client, "cyberchef_list_operations", { category: "hashing" });
        expect(ok.category).toBe("Hashing");

        const res = await client.callTool({
            name: "cyberchef_list_operations", arguments: { category: "Nonsense" }
        });
        expect(res.isError).toBeTruthy();
        // The error has to be USEFUL -- it must name the categories that do exist, or the model
        // is left guessing at the one thing it needed.
        expect(res.content[0].text).toMatch(/Hashing/);
    }, BOOT_TIMEOUT_MS);

    it("describes an operation well enough to call it", async () => {
        const { operations } = await callJson(client, "cyberchef_describe_operation", {
            operations: ["AES Encrypt"]
        });
        const aes = operations[0];
        expect(aes.operation).toBe("AES Encrypt");

        const argNames = aes.args.map(a => a.name);
        // `input_arg`, not `input`: the operation's own "Input" argument is renamed to avoid the
        // reserved data parameter. A caller reading this description must see the real key.
        expect(argNames).toContain("input_arg");
        expect(argNames).toContain("key");

        const key = aes.args.find(a => a.name === "key");
        expect(key.options).toContain("Hex");
        expect(key.default).toEqual({ option: "Hex", string: "" });
    }, BOOT_TIMEOUT_MS);

    it("describes several operations in one call", async () => {
        const { operations } = await callJson(client, "cyberchef_describe_operation", {
            operations: ["Gzip", "To Base64"]
        });
        expect(operations.map(o => o.operation)).toEqual(["Gzip", "To Base64"]);
    }, BOOT_TIMEOUT_MS);

    it("reports an unknown operation without failing the whole call", async () => {
        const { operations } = await callJson(client, "cyberchef_describe_operation", {
            operations: ["Gzip", "Not A Real Operation"]
        });
        expect(operations[0].operation).toBe("Gzip");
        expect(operations[1].error).toMatch(/No such operation/);
    }, BOOT_TIMEOUT_MS);
});

describe("index hierarchy: EVERY operation is reachable", () => {
    let client;

    beforeAll(async () => {
        client = await connectWith(undefined);
    }, BOOT_TIMEOUT_MS);

    afterAll(async () => {
        await client?.close();
    });

    it("walks categories -> listings and reaches all 504 operations", async () => {
        // The claim the index surface is sold on, checked exhaustively rather than sampled. A
        // single unreachable operation would mean the small default is a smaller PRODUCT, and
        // sampling would very likely miss it -- the risk is concentrated in odd corners
        // (operations in no category, or named in a category but absent from the build).
        const index = await callJson(client, "cyberchef_categories", {});

        const reached = new Set();
        for (const category of index.categories) {
            const listing = await callJson(client, "cyberchef_list_operations", {
                category: category.category
            });
            for (const entry of listing.operations) reached.add(entry.operation);
        }

        const everything = Object.keys(OperationConfig);
        const unreachable = everything.filter(op => !reached.has(op));
        expect(unreachable, `unreachable by browsing: ${unreachable.join(", ")}`).toEqual([]);
        expect(reached.size).toBe(everything.length);
    }, BOOT_TIMEOUT_MS * 4);

    it("describes every operation it lists", async () => {
        // Reaching a name is not enough: an agent needs the argument schema before it can call
        // one. Chunked because 504 names in a single argument would be a needlessly large request,
        // not because the tool cannot take them.
        const everything = Object.keys(OperationConfig);
        const failures = [];

        for (let i = 0; i < everything.length; i += 60) {
            const { operations } = await callJson(client, "cyberchef_describe_operation", {
                operations: everything.slice(i, i + 60)
            });
            for (const op of operations) {
                if (op.error) failures.push(op.operation);
                else if (!Array.isArray(op.args)) failures.push(`${op.operation} (no args array)`);
            }
        }

        expect(failures, `could not describe: ${failures.slice(0, 10).join(", ")}`).toEqual([]);
    }, BOOT_TIMEOUT_MS * 4);
});

describe("tool surface: curated and all", () => {
    it("curated pre-loads a useful subset, and all pre-loads everything", async () => {
        const curated = await connectWith("curated");
        const all = await connectWith("all");
        try {
            const c = (await curated.listTools()).tools;
            const a = (await all.listTools()).tools;

            expect(c.length).toBeGreaterThan(40);
            expect(c.length).toBeLessThan(a.length);
            expect(a.length).toBeGreaterThan(500);

            // Ordering of the three surfaces is the actual contract: index < curated < all.
            const cNames = c.map(t => t.name);
            expect(cNames).toContain("cyberchef_aes_encrypt");
            expect(cNames).not.toContain("cyberchef_to_morse_code");
            expect(a.map(t => t.name)).toContain("cyberchef_to_morse_code");
        } finally {
            await curated.close();
            await all.close();
        }
    }, BOOT_TIMEOUT_MS * 2);
});
