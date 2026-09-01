import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const client = new Client({ name: "rsa-check", version: "1.0.0" });
await client.connect(new StdioClientTransport({
    command: "node",
    args: ["src/node/mcp-server.mjs"],
    env: { ...process.env, CYBERCHEF_TOOL_SURFACE: "curated" }
}));

const { tools } = await client.listTools();
const mine = tools.filter(t => ["cyberchef_rsa_attack", "cyberchef_cyclic_pattern",
    "cyberchef_hash_identify", "cyberchef_xor_key_length"].includes(t.name));
for (const t of mine)
    console.log(t.name, "| schema props:", Object.keys(t.inputSchema?.properties ?? {}).length,
        "| title:", JSON.stringify(t.title ?? t.annotations?.title));
console.log("all four present:", mine.length === 4);

const res = await client.callTool({
    name: "cyberchef_rsa_attack",
    arguments: { modulus: "1000000016000000063" }
});
console.log("call result:", JSON.stringify(JSON.parse(res.content[0].text)).slice(0, 220));
await client.close();
