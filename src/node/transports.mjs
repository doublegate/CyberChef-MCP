/**
 * MCP Transport Factory for CyberChef.
 *
 * Provides stdio (default) or Streamable HTTP transport based on
 * the CYBERCHEF_TRANSPORT environment variable.
 *
 * @author DoubleGate
 * @license Apache-2.0
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getLogger } from "./logger.mjs";

/**
 * Supported transport types.
 */
export const TransportType = {
    STDIO: "stdio",
    HTTP: "http"
};

/**
 * Create a transport instance based on configuration.
 *
 * @param {Object} options - Transport options.
 * @param {string} options.type - Transport type ("stdio" or "http").
 * @param {number} options.port - HTTP port (default: 3000).
 * @param {string} options.host - HTTP host (default: "127.0.0.1").
 * @returns {Promise<Object>} Transport instance and optional HTTP server.
 */
export async function createTransport(options = {}) {
    const type = options.type || process.env.CYBERCHEF_TRANSPORT || TransportType.STDIO;
    const logger = getLogger();

    if (type === TransportType.HTTP) {
        const port = options.port || parseInt(process.env.CYBERCHEF_HTTP_PORT, 10) || 3000;
        const host = options.host || process.env.CYBERCHEF_HTTP_HOST || "127.0.0.1";

        const { StreamableHTTPServerTransport } = await import(
            "@modelcontextprotocol/sdk/server/streamableHttp.js"
        );
        const http = await import("node:http");
        const { randomUUID } = await import("node:crypto");

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
        });

        const httpServer = http.createServer(async (req, res) => {
            await transport.handleRequest(req, res);
        });

        httpServer.listen(port, host, () => {
            logger.info(`Streamable HTTP transport listening on ${host}:${port}`);
        });

        return { transport, httpServer };
    }

    // Default: stdio
    const transport = new StdioServerTransport();
    return { transport, httpServer: null };
}

/**
 * Get the configured transport type.
 *
 * @returns {string} The transport type.
 */
export function getTransportType() {
    return process.env.CYBERCHEF_TRANSPORT || TransportType.STDIO;
}
