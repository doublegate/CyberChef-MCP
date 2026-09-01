/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The socket transport: the stdio binding over a stream rather than a pipe.
 *
 * This replaces the "WebSocket" line of v2.3.0's roadmap theme, which named a transport MCP does
 * not define and no SDK ships (see docs/planning/ROADMAP.md). What it actually delivers is the
 * SDK's own documented custom-transport route — a `StdioServerTransport` over a Unix domain socket
 * or TCP stream — so an existing client speaks it without a private extension.
 *
 * Two properties are load-bearing and both are asserted here:
 *
 *   - **Isolation.** Each connection gets its own `serveStdio` entry, which pins one `Server` for
 *     that connection's lifetime. That is the same isolation the HTTP branch was rewritten for in
 *     issue #36, obtained without session ids, because the socket *is* the session.
 *   - **Fail closed on exposure.** This transport carries no authentication — the stdio binding's
 *     security model is "the peer already has your process", which on a Unix socket means file
 *     permissions and on TCP means nothing. A non-loopback bind is therefore refused unless it is
 *     asked for explicitly, and the Unix socket is chmod 0600 rather than left to the umask.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, afterEach, afterAll } from "vitest";
import net from "node:net";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
    createTransport, isLoopbackAddress, maxSocketPathLength, TransportType
} from "../../src/node/transports.mjs";

let instances = 0;

/** A server that reports which instance answered, so isolation is observable. */
function makeServer() {
    const id = ++instances;
    const s = new Server({ name: "socket-test", version: "0.0.0" }, { capabilities: { tools: {} } });
    s.setRequestHandler("tools/list", async () => ({
        tools: [{
            name: "whoami",
            description: `instance ${id}`,
            inputSchema: { type: "object", properties: {} }
        }]
    }));
    return s;
}

/**
 * A client transport speaking the stdio binding over an already-connected socket.
 *
 * The SDK ships no socket *client* transport, but `StdioServerTransport` is symmetric over a
 * duplex stream, so the client side is the same class pointed at the same socket.
 *
 * @param {net.Socket} socket - A connected socket.
 * @returns {StdioServerTransport} The transport.
 */
function clientTransportOver(socket) {
    return new StdioServerTransport(socket, socket);
}

const open = [];

/**
 * A private directory for this file's sockets, created 0700 by `mkdtemp`.
 *
 * NOT a predictable name under `os.tmpdir()`. That is a shared, world-writable directory, so a
 * name anyone can guess lets a local user pre-create a symlink at it and redirect whatever the
 * test writes -- which CodeQL flags as `js/insecure-temporary-file`, at high severity, correctly.
 * `mkdtemp` returns a directory only this process can enter, so nothing inside it is guessable or
 * pre-creatable, and one `rm -rf` at the end cleans up every file at once.
 *
 * It also keeps socket paths short. `sun_path` is a fixed 108-byte field, and mkdtemp adds only
 * six characters.
 */
const TMP = fs.mkdtempSync(join(os.tmpdir(), "cyberchef-mcp-test-"));

afterEach(async () => {
    while (open.length) {
        const closeAll = open.pop();
        try {
            await closeAll();
        } catch { /* teardown is best-effort */ }
    }
});

afterAll(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
});

/** @returns {string} A unique socket path inside this file's private temp directory. */
function tmpSocket() {
    return join(TMP, `s${socketSeq++}.sock`);
}

let socketSeq = 0;

/**
 * Connect a real MCP client over a Unix socket.
 *
 * @param {string} path - Socket path.
 * @returns {Promise<{client: Client, socket: net.Socket}>} Connected client and its socket.
 */
async function connectClient(path) {
    const socket = net.connect(path);
    await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
    });
    const client = new Client({ name: "socket-probe", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientTransportOver(socket));
    return { client, socket };
}

describe("socket transport", () => {
    it("is a declared transport type", () => {
        expect(TransportType.SOCKET).toBe("socket");
    });

    it("serves a real MCP client over a Unix domain socket", async () => {
        const path = tmpSocket();
        const handle = await createTransport({ type: "socket", socketPath: path, createServer: makeServer });
        open.push(handle.closeAll);
        expect(handle.transport).toBeNull();

        const { client } = await connectClient(path);
        try {
            const { tools } = await client.listTools();
            expect(tools[0].name).toBe("whoami");
        } finally {
            await client.close();
        }
    });

    it("pins a separate Server per connection, so two clients never share one", async () => {
        const path = tmpSocket();
        const handle = await createTransport({ type: "socket", socketPath: path, createServer: makeServer });
        open.push(handle.closeAll);

        const a = await connectClient(path);
        const b = await connectClient(path);
        try {
            const first = (await a.client.listTools()).tools[0].description;
            const second = (await b.client.listTools()).tools[0].description;
            // Different instances answered. A shared server would return the same id twice --
            // which is issue #36's defect, arriving by a different door.
            expect(first).not.toBe(second);
            expect(handle.connections.size).toBe(2);
        } finally {
            await a.client.close();
            await b.client.close();
        }
    });

    it("creates the Unix socket owner-only, not at the mercy of the umask", async () => {
        const path = tmpSocket();
        const handle = await createTransport({ type: "socket", socketPath: path, createServer: makeServer });
        open.push(handle.closeAll);
        // A Unix socket's access control IS its file mode. A permissive umask would otherwise let
        // any local user drive the server.
        expect(fs.statSync(path).mode & 0o777).toBe(0o600);
    });

    it("refuses a non-loopback TCP bind unless it is asked for explicitly", async () => {
        await expect(createTransport({
            type: "socket", port: 0, host: "0.0.0.0", createServer: makeServer
        })).rejects.toThrow(/no authentication/);
    });

    it("serves over loopback TCP", async () => {
        const handle = await createTransport({
            type: "socket", port: 0, host: "127.0.0.1", createServer: makeServer
        });
        open.push(handle.closeAll);
        const { port } = handle.socketServer.address();

        const socket = net.connect(port, "127.0.0.1");
        await new Promise((resolve, reject) => {
            socket.once("connect", resolve);
            socket.once("error", reject);
        });
        const client = new Client({ name: "tcp-probe", version: "0.0.0" }, { capabilities: {} });
        await client.connect(clientTransportOver(socket));
        try {
            expect((await client.listTools()).tools[0].name).toBe("whoami");
        } finally {
            await client.close();
        }
    });

    it("requires exactly one address, and a server factory", async () => {
        await expect(createTransport({ type: "socket", createServer: makeServer }))
            .rejects.toThrow(/CYBERCHEF_SOCKET_PATH/);
        await expect(createTransport({ type: "socket", socketPath: "/tmp/x.sock", port: 1, createServer: makeServer }))
            .rejects.toThrow(/not both/);
        await expect(createTransport({ type: "socket", socketPath: tmpSocket() }))
            .rejects.toThrow(/createServer factory/);
    });

    it("refuses to remove a path that is not a socket", async () => {
        const path = join(TMP, "regular-file");
        fs.writeFileSync(path, "not a socket");
        // Existence alone cannot distinguish a stale socket from someone's data. Deleting the
        // wrong one would be silent destruction, so it fails loudly instead.
        await expect(createTransport({ type: "socket", socketPath: path, createServer: makeServer }))
            .rejects.toThrow(/is not a\s+socket|is not a socket/);
    });

    it("rejects an over-long socket path before the kernel does, and says why", async () => {
        // sun_path is a fixed 108-byte field (104 on macOS), and the kernel's own answer is a bare
        // EINVAL naming the path but not the reason. That was hit here with an ordinary
        // 128-character path under a temp directory, and is close to unguessable from the error.
        const tooLong = "/tmp/" + "x".repeat(maxSocketPathLength()) + ".sock";
        await expect(createTransport({ type: "socket", socketPath: tooLong, createServer: makeServer }))
            .rejects.toThrow(/socket path is \d+ bytes, and this platform allows/);
    });

    it("refuses to take over a path a live server is already serving", async () => {
        const path = tmpSocket();
        const first = await createTransport({ type: "socket", socketPath: path, createServer: makeServer });
        open.push(first.closeAll);
        await expect(createTransport({ type: "socket", socketPath: path, createServer: makeServer }))
            .rejects.toThrow(/already served/);
    });
});

describe("socket transport: configuration it must refuse or bound", () => {
    it("rejects a port that is not a number", async () => {
        await expect(createTransport({
            type: "socket", port: "not-a-port", createServer: makeServer
        })).rejects.toThrow(/is not a number/);
    });

    it("drops connections past the cap instead of accepting unboundedly", async () => {
        const path = tmpSocket();
        const handle = await createTransport({
            type: "socket", socketPath: path, createServer: makeServer, maxConnections: 1
        });
        open.push(handle.closeAll);

        const first = await connectClient(path);
        try {
            // The cap is a resource control, so the second connection is refused rather than
            // queued: a queue would just move the unboundedness somewhere less visible.
            const second = net.connect(path);
            await new Promise((resolve) => {
                second.once("close", resolve);
                second.once("error", resolve);
            });
            expect(handle.connections.size).toBe(1);
        } finally {
            await first.client.close();
        }
    });
});

describe("socket transport: connection lifecycle", () => {
    it("drops a connection from the set when the peer disconnects", async () => {
        const path = tmpSocket();
        const handle = await createTransport({ type: "socket", socketPath: path, createServer: makeServer });
        open.push(handle.closeAll);

        const { client, socket } = await connectClient(path);
        expect(handle.connections.size).toBe(1);

        await client.close();
        socket.destroy();
        // The pinned server instance is closed alongside the socket. Dropping only the socket
        // would leak one Server per connection for the process's lifetime.
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(handle.connections.size).toBe(0);
    });

    it("drops a connection that dies with an error, not just one that closes politely", async () => {
        const path = tmpSocket();
        const handle = await createTransport({ type: "socket", socketPath: path, createServer: makeServer });
        open.push(handle.closeAll);

        const socket = net.connect(path);
        await new Promise((resolve, reject) => {
            socket.once("connect", resolve);
            socket.once("error", reject);
        });
        expect(handle.connections.size).toBe(1);

        // A client that vanishes mid-conversation, which is the common case in practice and must
        // not leave the connection counted against the cap forever. `destroy(err)` rather than
        // `resetAndDestroy()`: an RST is TCP-only and a Unix socket rejects it outright.
        socket.destroy(new Error("client vanished"));
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(handle.connections.size).toBe(0);
    });

    it("removes a genuinely stale socket file and binds anyway", async () => {
        const path = tmpSocket();
        // A crash, reproduced honestly: a child binds the socket and is SIGKILLed. node unlinks the
        // file on a *clean* close, so closing a server in-process would leave nothing behind and
        // test nothing. Only a killed process leaves the file with nothing listening — which is the
        // exact state this branch exists for, and refusing to start in it would mean a crash needs
        // manual cleanup before the service can come back.
        const child = spawn(process.execPath, [
            "-e", `require("net").createServer().listen(${JSON.stringify(path)}, () => console.log("up"))`
        ]);
        await new Promise((resolve, reject) => {
            child.stdout.once("data", resolve);
            child.once("error", reject);
        });
        child.kill("SIGKILL");
        await new Promise(resolve => child.once("exit", resolve));
        expect(fs.existsSync(path)).toBe(true);

        const handle = await createTransport({ type: "socket", socketPath: path, createServer: makeServer });
        open.push(handle.closeAll);
        const { client } = await connectClient(path);
        try {
            expect((await client.listTools()).tools[0].name).toBe("whoami");
        } finally {
            await client.close();
        }
    });
});

describe("isLoopbackAddress", () => {
    it("accepts the whole 127.0.0.0/8 block, not just 127.0.0.1", () => {
        for (const h of ["127.0.0.1", "127.0.0.53", "127.1.2.3", "localhost", "::1", "[::1]"])
            expect(isLoopbackAddress(h), h).toBe(true);
    });

    it("rejects anything routable", () => {
        for (const h of ["0.0.0.0", "192.168.1.10", "10.0.0.1", "example.com", "", undefined])
            expect(isLoopbackAddress(h), String(h)).toBe(false);
    });
});
