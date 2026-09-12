import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const [cmd, ...args] = process.argv.slice(2);
const c = new Client({ name: "ab", version: "0" }, { capabilities: {} });
await c.connect(new StdioClientTransport({ command: cmd, args,
  env: { ...process.env, CYBERCHEF_TOOL_SURFACE: "index", CYBERCHEF_LOG_LEVEL: "silent" } }));
const { tools } = await c.listTools();
console.error("bytes:", Buffer.byteLength(JSON.stringify({ tools }), "utf8"), "tools:", tools.length);
console.log(JSON.stringify(tools.map(t => ({ n: t.name, b: Buffer.byteLength(JSON.stringify(t)) })), null, 0));
await c.close();
