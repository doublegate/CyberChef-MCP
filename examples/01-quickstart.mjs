#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * 01 -- Quickstart: connect, list tools, call one.
 *
 * The smallest useful program against this server. If this runs, your setup is correct.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { connect, call, expect, step } from "./_lib.mjs";

const client = await connect("quickstart");
try {
    step("What can this server do?");
    const { tools } = await client.listTools();
    console.log(`  ${tools.length} tools in tools/list`);
    // That number is small on purpose. The default tool surface is an INDEX: navigation tools
    // plus the executor, rather than 524 pre-loaded schemas. All 504 operations are still
    // reachable -- see example 03 for how you find one, and note that `cyberchef_bake` runs any
    // of them by name whether or not it appears here.
    //   CYBERCHEF_TOOL_SURFACE=curated  ~99 tools
    //   CYBERCHEF_TOOL_SURFACE=all      all 524
    // Every tool carries the `cyberchef_` prefix. It is permanent: v1.8.0 announced its removal
    // (DEP001) and v2.0.0 WITHDREW that, because dropping it saved 2.6% of the payload while
    // making 19 names -- `search`, `hash`, `filter`, `diff` -- collide with other MCP servers
    // in a namespace that is flat per session.
    expect("every tool is prefixed", tools.every(t => t.name.startsWith("cyberchef_")), true);

    step("Encode something");
    const encoded = await call(client, "cyberchef_to_base64", { input: "Hello, CyberChef!" });
    console.log(`  to_base64  -> ${encoded}`);
    expect("base64 round-trips", encoded, Buffer.from("Hello, CyberChef!").toString("base64"));

    step("And decode it again");
    const decoded = await call(client, "cyberchef_from_base64", { input: encoded });
    console.log(`  from_base64 -> ${decoded}`);
    expect("decodes back to the original", decoded, "Hello, CyberChef!");

    step("Hash it, and pass an argument");
    // Arguments are NAMED, not positional -- that was DEP005, one of the five deprecations
    // v2.0.0 did enact. `size` is an `argSelector`, so it accepts one of a fixed set of names.
    //
    // Take the key from the tool's inputSchema, not from the CyberChef UI label: the UI calls
    // this "Size" and the schema calls it `size`. Reading it is only possible at all because
    // v2.1.0 fixed the schemas -- before that every tool advertised an empty one.
    // Without the argument, SHA2 defaults to 512.
    const digest = await call(client, "cyberchef_sha2", {
        input: "Hello, CyberChef!",
        size: "256"
    });
    console.log(`  sha2(256)  -> ${digest}`);
    expect("sha2-256 is 64 hex characters", /^[0-9a-f]{64}$/.test(digest), true);

    const dflt = await call(client, "cyberchef_sha2", { input: "Hello, CyberChef!" });
    expect("and the default is 512", /^[0-9a-f]{128}$/.test(dflt), true);

    console.log("\nQuickstart complete.");
} finally {
    await client.close();
}
