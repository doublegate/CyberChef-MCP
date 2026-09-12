import { randomBytes } from "node:crypto";
import tool from "../../../src/node/tools/entropy-scan.mjs";

// PARSE THROUGH THE SCHEMA, do not call `run` with a raw object.
//
// `run` receives already-validated input in production -- `handleCallTool` does
// `inputSchema.safeParse` first -- so it trusts that Zod has applied the defaults for
// `window_bytes` (256), `step_bytes`, `threshold` (7) and `max_regions` (32). Passing a bare
// object leaves `window` and `step` undefined, the scan loop produces ZERO windows, and every
// trial is counted as a split.
//
// That is not hypothetical: the salvaged version of this script did exactly that and reported
// **100.00%**, which was recorded without question. Measured both ways over 40 trials:
//
//     unparsed args -> != 1 region in 40 of 40 trials   (the artefact)
//     parsed args   -> != 1 region in  1 of 40 trials   (the real rate)
//
// A measurement that comes out at exactly 100.00% deserves suspicion before it deserves a
// changelog entry. Reviewer-found.
const TRIALS = 400;
let splits = 0;
for (let i = 0; i < TRIALS; i++) {
    const args = tool.inputSchema.parse({
        input: randomBytes(8192).toString("latin1"),
        input_format: "Raw"
    });
    const r = await tool.run(args);
    if (r.regions.length !== 1) splits++;
}
console.log(`  ${TRIALS} trials of randomBytes(8192): ${splits} produced != 1 region ` +
    `(${(splits / TRIALS * 100).toFixed(2)}%)`);
