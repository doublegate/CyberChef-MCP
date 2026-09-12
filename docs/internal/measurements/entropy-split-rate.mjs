import { randomBytes } from "node:crypto";
import tool from "../../../src/node/tools/entropy-scan.mjs";
let splits = 0, worstMin = 9;
for (let i = 0; i < 400; i++) {
    const r = await tool.run({ input: randomBytes(8192).toString("latin1"), input_format: "Raw" });
    if (r.regions.length !== 1) splits++;
}
console.log(`  400 trials of randomBytes(8192): ${splits} produced != 1 region  (${(splits/4).toFixed(2)}%)`);
