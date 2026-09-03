/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Prompts and resources, driven in-process by a real MCP client.
 *
 * Both are surfaces this server declared nothing for until v2.2.0. They are tested through the
 * client rather than by calling the modules, because the failure that matters is not "the function
 * returns the wrong object" -- it is "the capability is advertised and the method answers `method
 * not found`", or the reverse. Only a real client exercises that seam.
 *
 * That is not a hypothetical failure mode here: adding these updated the capability list on the
 * per-session factory and left the module singleton -- the one backing stdio, which is most
 * clients -- advertising `tools` only. Both construction sites now read one shared constant, and
 * the test below asserts the singleton and the factory agree.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

let createMcpServer;
let storageDir;

beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "cyberchef-mcp-pr-"));
    process.env.CYBERCHEF_RECIPE_STORAGE = join(storageDir, "recipes.json");
    process.env.CYBERCHEF_RECIPE_BACKUP = "false";
    ({ createMcpServer } = await import("../../src/node/mcp-server.mjs"));
});

afterAll(async () => {
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
});

/**
 * A connected client/server pair sharing this process.
 *
 * @returns {Promise<{client: Client, close: Function}>} The client and its teardown.
 */
async function connected() {
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "prompt-test", version: "1.0.0" }, { capabilities: {} });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return {
        client,
        /** @returns {Promise<void>} Closes both ends. */
        async close() {
            await client.close();
            await server.close();
        }
    };
}

describe("prompts", () => {
    it("advertises the workflow entry points", async () => {
        const { client, close } = await connected();
        try {
            const { prompts } = await client.listPrompts();
            const names = prompts.map(p => p.name);
            expect(names).toEqual(expect.arrayContaining([
                "analyse-unknown-data", "extract-iocs", "deobfuscate-script",
                "identify-hash", "decode-chain"
            ]));

            for (const prompt of prompts) {
                expect(prompt.description, prompt.name).toBeTruthy();
                expect(prompt.title, prompt.name).toBeTruthy();
            }
        } finally {
            await close();
        }
    });

    it("renders a prompt with the caller's data embedded", async () => {
        const { client, close } = await connected();
        try {
            const got = await client.getPrompt({
                name: "analyse-unknown-data",
                arguments: { data: "VGhlIHF1aWNr" }
            });
            expect(got.messages).toHaveLength(1);
            expect(got.messages[0].role).toBe("user");

            const text = got.messages[0].content.text;
            expect(text).toContain("VGhlIHF1aWNr");
            // The procedure, not a restatement of the tool list: Magic first, because guessing
            // before identifying is what wastes calls.
            expect(text).toContain("cyberchef_magic");
        } finally {
            await close();
        }
    });

    it("tells an IOC prompt to defang, which is the part that matters", async () => {
        const { client, close } = await connected();
        try {
            const got = await client.getPrompt({
                name: "extract-iocs",
                arguments: { content: "see http://evil.example/x" }
            });
            // An indicator pasted live into a ticket is a clickable link to a malicious host.
            expect(got.messages[0].content.text).toMatch(/Defang/);
        } finally {
            await close();
        }
    });

    it("renders an optional argument's absence without complaint", async () => {
        const { client, close } = await connected();
        try {
            const withHint = await client.getPrompt({
                name: "decode-chain", arguments: { data: "abc", hint: "base64 twice" }
            });
            const without = await client.getPrompt({
                name: "decode-chain", arguments: { data: "abc" }
            });
            expect(withHint.messages[0].content.text).toContain("base64 twice");
            expect(without.messages[0].content.text).toContain("No hint was given");
        } finally {
            await close();
        }
    });

    it("refuses a required argument that is missing", async () => {
        const { client, close } = await connected();
        try {
            // A prompt rendered without its data is a request to analyse nothing, and the failure
            // would otherwise surface much later as a confusing answer.
            await expect(client.getPrompt({ name: "analyse-unknown-data", arguments: {} }))
                .rejects.toThrow(/requires: data/);
        } finally {
            await close();
        }
    });

    it("names the available prompts when asked for one that does not exist", async () => {
        const { client, close } = await connected();
        try {
            await expect(client.getPrompt({ name: "not-a-prompt", arguments: {} }))
                .rejects.toThrow(/Unknown prompt.*Available:/);
        } finally {
            await close();
        }
    });
});

describe("resources", () => {
    it("answers a missing resource with -32602 and data.uri, not Internal Error", async () => {
        // Before v3.0.0 this was -32603 Internal Error with no data, because
        // `CyberChefMCPError.code` is the STRING "INVALID_INPUT" and the SDK dispatcher keeps a
        // thrown code only when it is a safe integer. A caller could not distinguish "that
        // resource does not exist" from "the server broke".
        const { client, close } = await connected();
        try {
            const missing = "recipe://00000000-0000-4000-8000-000000000000";
            const failure = await client.readResource({ uri: missing }).catch(e => e);

            expect(failure.code).toBe(-32602);
            // `data.uri` is the shape the SDK documents clients to recognise resource-not-found
            // by, and is what separates this from a malformed request below.
            expect(failure.data).toEqual({ uri: missing });
        } finally {
            await close();
        }
    });

    it("distinguishes a malformed URI from a missing one", async () => {
        // Both are -32602. Only the missing one carries `data.uri`; a client that keys off it
        // must not be told an unsupported scheme is a resource that merely does not exist yet.
        const { client, close } = await connected();
        try {
            const failure = await client.readResource({ uri: "file:///etc/passwd" }).catch(e => e);

            expect(failure.code).toBe(-32602);
            expect(failure.data.uri).toBeUndefined();
            expect(failure.data.supported).toBe("recipe://<id>");
        } finally {
            await close();
        }
    });

    it("exposes saved recipes, keyed by id rather than by name", async () => {
        const { client, close } = await connected();
        try {
            // Two recipes deliberately share a name. A name-keyed URI would make one unreachable
            // and silently return the other; recipe names are user-supplied and not unique.
            const a = JSON.parse((await client.callTool({
                name: "cyberchef_recipe_create",
                arguments: { name: "duplicate", operations: [{ op: "To Base64" }] }
            })).content[0].text);
            const b = JSON.parse((await client.callTool({
                name: "cyberchef_recipe_create",
                arguments: { name: "duplicate", operations: [{ op: "To Hex" }] }
            })).content[0].text);

            const { resources } = await client.listResources();
            const uris = resources.map(r => r.uri);
            expect(uris).toContain(`recipe://${a.id}`);
            expect(uris).toContain(`recipe://${b.id}`);
            expect(a.id).not.toBe(b.id);

            // And each reads back as itself, not as the other.
            const readA = await client.readResource({ uri: `recipe://${a.id}` });
            expect(JSON.parse(readA.contents[0].text).operations[0].op).toBe("To Base64");
            expect(readA.contents[0].mimeType).toBe("application/json");

            const readB = await client.readResource({ uri: `recipe://${b.id}` });
            expect(JSON.parse(readB.contents[0].text).operations[0].op).toBe("To Hex");

            for (const id of [a.id, b.id]) {
                await client.callTool({ name: "cyberchef_recipe_delete", arguments: { id } });
            }
        } finally {
            await close();
        }
    });

    it("advertises a URI template so a client need not list first", async () => {
        const { client, close } = await connected();
        try {
            const { resourceTemplates } = await client.listResourceTemplates();
            expect(resourceTemplates.map(t => t.uriTemplate)).toContain("recipe://{id}");
        } finally {
            await close();
        }
    });

    it("rejects a URI it does not serve, saying what it does serve", async () => {
        const { client, close } = await connected();
        try {
            await expect(client.readResource({ uri: "file:///etc/passwd" }))
                .rejects.toThrow(/Unsupported resource URI.*recipe:\/\//);
        } finally {
            await close();
        }
    });

    it("reports an unknown recipe id as not found", async () => {
        const { client, close } = await connected();
        try {
            await expect(client.readResource({
                uri: "recipe://00000000-0000-4000-8000-000000000000"
            })).rejects.toThrow(/not found/i);
        } finally {
            await close();
        }
    });
});

describe("capabilities", () => {
    it("advertises exactly the surfaces it serves", async () => {
        const { client, close } = await connected();
        try {
            const caps = client.getServerCapabilities();
            expect(caps.tools).toBeDefined();
            expect(caps.prompts).toBeDefined();
            expect(caps.resources).toBeDefined();

            // Each advertised capability must actually answer, or a client calls something that
            // returns "method not found" -- which is worse than not advertising it.
            await expect(client.listTools()).resolves.toBeDefined();
            await expect(client.listPrompts()).resolves.toBeDefined();
            await expect(client.listResources()).resolves.toBeDefined();
        } finally {
            await close();
        }
    });

    it("agrees between the stdio singleton and the per-session factory", async () => {
        // The drift this exists to catch: adding prompts and resources updated the FACTORY and
        // left the SINGLETON -- which backs stdio, i.e. most clients -- advertising `tools` only.
        //
        // An earlier version of this test connected a second factory instance and compared it to
        // the first, which would have passed happily through exactly that bug. It reads the
        // singleton's own declaration now, which is the thing that was wrong.
        const mod = await import("../../src/node/mcp-server.mjs");
        const singleton = mod.server;

        const factoryServer = mod.createMcpServer();
        const [ct, st] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "caps", version: "1.0.0" }, { capabilities: {} });
        await Promise.all([factoryServer.connect(st), client.connect(ct)]);
        try {
            const factoryCaps = Object.keys(client.getServerCapabilities()).sort();
            expect(factoryCaps).toEqual(["prompts", "resources", "tools"]);

            // Both construction sites read one `SERVER_CAPABILITIES`, so the singleton must
            // advertise the same set. Asserted against the singleton itself rather than against a
            // second instance of the same factory.
            expect(singleton, "the singleton must be exported for this to test anything")
                .toBeDefined();
            expect(Object.keys(singleton.getCapabilities()).sort()).toEqual(factoryCaps);
        } finally {
            await client.close();
            await factoryServer.close();
        }
    });
});
