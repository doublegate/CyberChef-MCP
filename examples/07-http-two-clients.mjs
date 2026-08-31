#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * 07 -- The HTTP transport, with two clients at once.
 *
 * stdio gives one client per process. The Streamable HTTP transport serves many, each with its
 * own session -- which is what issue #36 was about: before v2.0.0 the server shared ONE transport
 * process-wide, so the first client worked and every one after it got
 * "Invalid Request: Server already initialized".
 *
 * This spawns a server on an ephemeral port, connects two independent clients, and shows they do
 * not interfere.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SERVER, expect, step } from "./_lib.mjs";

/**
 * Ask the OS for a free port, so this example cannot collide with anything already running.
 *
 * @returns {Promise<number>} A port that was free a moment ago.
 */
function freePort() {
    return new Promise((resolve, reject) => {
        const srv = createServer();
        srv.on("error", reject);
        srv.listen(0, "127.0.0.1", () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

/**
 * Wait until the HTTP server answers, rather than sleeping a guessed interval.
 *
 * @param {string} url - The endpoint to poll.
 * @param {number} timeoutMs - Give up after this long.
 * @returns {Promise<void>} Resolves once the port accepts a request.
 */
async function waitForServer(url, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
            return;
        } catch {
            if (Date.now() > deadline) throw new Error(`server did not start within ${timeoutMs}ms`);
            await new Promise(r => setTimeout(r, 100));
        }
    }
}

const port = await freePort();
const child = spawn(process.execPath, [SERVER], {
    env: {
        ...process.env,
        CYBERCHEF_TRANSPORT: "http",
        CYBERCHEF_HTTP_HOST: "127.0.0.1",
        CYBERCHEF_HTTP_PORT: String(port)
        // DNS-rebinding protection is ON by default and allows the loopback names, so nothing
        // needs configuring here. Binding a non-loopback address WOULD require
        // CYBERCHEF_ALLOWED_HOSTS -- see docs/guides/http-transport.md.
    },
    stdio: ["ignore", "inherit", "inherit"]
});

const url = `http://127.0.0.1:${port}/mcp`;
const clients = [];
try {
    step(`Start the server on ${url}`);
    await waitForServer(url);
    console.log("  listening");

    step("Connect TWO clients concurrently");
    // Both handshakes are started before either is awaited. `await` inside the loop would
    // serialise them, which would quietly stop demonstrating the thing this example is about:
    // issue #36 was a SECOND initialize being rejected, and overlapping the two is what puts the
    // per-session transport under the pressure that used to fail.
    const pending = ["analyst-a", "analyst-b"].map(async name => {
        const c = new Client({ name, version: "1.0.0" }, { capabilities: {} });
        await c.connect(new StreamableHTTPClientTransport(new URL(url)));
        console.log(`  ${name} connected`);
        return c;
    });
    clients.push(...await Promise.all(pending));
    expect("both clients connected", clients.length, 2);

    step("Each has its own session and its own results");
    const [a, b] = clients;
    const ra = await a.callTool({ name: "cyberchef_to_base64", arguments: { input: "from A" } });
    const rb = await b.callTool({ name: "cyberchef_to_base64", arguments: { input: "from B" } });
    console.log(`  A -> ${ra.content[0].text}`);
    console.log(`  B -> ${rb.content[0].text}`);
    expect("A got A's answer", ra.content[0].text, Buffer.from("from A").toString("base64"));
    expect("B got B's answer", rb.content[0].text, Buffer.from("from B").toString("base64"));

    step("Both still see the full tool list");
    const [la, lb] = await Promise.all([a.listTools(), b.listTools()]);
    console.log(`  A sees ${la.tools.length} tools, B sees ${lb.tools.length}`);
    expect("both see the same surface", la.tools.length, lb.tools.length);

    console.log("\nHTTP multi-client complete.");
} finally {
    await Promise.all(clients.map(c => c.close().catch(() => {})));
    child.kill("SIGTERM");
}
