#!/usr/bin/env node
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * 10 -- Breaking ciphers with no key, and knowing when the answer is a lead rather than an answer.
 *
 * Every step here is a decision made from the previous step's output, and none of it can be
 * expressed as a recipe: a recipe is a fixed pipeline, and this is a search. That is the whole
 * reason the analysis tools are not operations.
 *
 * The example also shows the part that matters more than the solving: each tool reports what its
 * answer rests on, and two of the four calls below return something the caller has to read rather
 * than accept. A cipher solver that hands back a confident wrong key is worse than one that hands
 * back nothing.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { connect, call, expect, step } from "./_lib.mjs";

const PLAIN =
    "The study of computer security begins with the observation that every system has a boundary " +
    "and that the interesting questions live at that boundary. What crosses it, who is permitted " +
    "to make it cross, and what happens when something crosses that should not have.";

/** @returns {string} `text` enciphered with a repeating Vigenere key. */
function vigenere(text, key) {
    let at = 0;
    return [...text].map(ch => {
        const upper = ch.toUpperCase();
        if (upper < "A" || upper > "Z") return ch;
        const shift = key.toUpperCase().charCodeAt(at++ % key.length) - 65;
        const out = String.fromCharCode(65 + (upper.charCodeAt(0) - 65 + shift) % 26);
        return ch === upper ? out : out.toLowerCase();
    }).join("");
}

const client = await connect("break-a-cipher");
try {
    step("Is it plaintext already? The cheapest question, so it goes first");
    const already = await call(client, "cyberchef_plaintext_check", { input: PLAIN });
    const alreadyParsed = JSON.parse(already);
    console.log(`  verdict "${alreadyParsed.verdict}" via ${alreadyParsed.decided_by}`);
    expect("recognises English prose", alreadyParsed.verdict, "plaintext");

    step("A Vigenere ciphertext, with no key");
    const ciphertext = vigenere(PLAIN, "CIPHERS");
    const notPlain = JSON.parse(await call(client, "cyberchef_plaintext_check", { input: ciphertext }));
    console.log(`  same tool on the ciphertext: "${notPlain.verdict}"`);
    // It does NOT say "not plaintext" -- a monoalphabetic or polyalphabetic cipher over English
    // letters is printable, and the tool refuses to guess rather than being confidently wrong.
    expect("does not claim a false negative", notPlain.verdict !== "plaintext", true);

    step("Recover the key");
    const broken = JSON.parse(await call(client, "cyberchef_vigenere_break", { input: ciphertext }));
    console.log(`  key ${broken.key} (length ${broken.key_length}) -- ${broken.key_length_source}`);
    console.log(`  ${broken.plaintext.slice(0, 60)}...`);
    expect("recovers the exact key", broken.key, "CIPHERS");
    expect("and the plaintext with it", broken.plaintext.startsWith("The study of computer"), true);

    // The length search reports what it nearly chose instead. Every MULTIPLE of the true key
    // length scores as well or better on the index of coincidence -- Practical Cryptography's own
    // worked example with this very key scores period 14 above period 7 -- so the ranked list is
    // part of the answer rather than diagnostics.
    step("What it nearly answered instead");
    const alternatives = broken.length_candidates.filter(c => !c.chosen).slice(0, 3);
    for (const alt of alternatives) {
        console.log(`  length ${alt.length}: IoC ${alt.index_of_coincidence}, ${alt.letters_per_coset} letters per coset`);
    }
    expect("shows the runners-up", alternatives.length > 0, true);

    step("A substitution cipher, solved by hill-climbing rather than by a formula");
    const alphabet = "QWERTYUIOPASDFGHJKLZXCVBNM";
    const substituted = [...PLAIN].map(ch => {
        const upper = ch.toUpperCase();
        if (upper < "A" || upper > "Z") return ch;
        const out = alphabet[upper.charCodeAt(0) - 65];
        return ch === upper ? out : out.toLowerCase();
    }).join("");
    const solved = JSON.parse(await call(client, "cyberchef_substitution_break", {
        input: substituted, seed: 12345
    }));
    console.log(`  ${solved.plaintext.slice(0, 60)}...`);
    console.log(`  trigram score ${solved.trigram_score} over ${solved.restarts_run} restarts`);
    expect("recovers the plaintext", solved.plaintext.startsWith("The study of computer"), true);

    step("A cipher CyberChef has no operation for");
    // Playfair, Polybius, ADFGVX and Baudot are all absent from the 504 operations. This is the
    // Wikipedia worked example, reproduced exactly.
    const playfair = JSON.parse(await call(client, "cyberchef_classical_cipher", {
        cipher: "playfair", mode: "encode", key: "playfair example",
        input: "HIDETHEGOLDINTHETREESTUMP"
    }));
    console.log(`  ${playfair.output}`);
    expect("matches the published vector", playfair.output, "BMODZBXDNABEKUDMUIXMMOUVIF");

    step("And search knows these tools exist, which is not automatic");
    // `help()` searches OperationConfig, and registry tools are deliberately not in it -- so
    // without an explicit index, searching for a capability that only a registry tool provides
    // returned nothing at all.
    const found = JSON.parse(await call(client, "cyberchef_search", { query: "playfair" }));
    console.log(`  operations: ${found.matches}; analysis tools: ${(found.analysis_tools ?? []).map(t => t.tool).join(", ")}`);
    expect("no operation matches", found.matches, 0);
    expect("but the tool is found", (found.analysis_tools ?? [])[0]?.tool, "cyberchef_classical_cipher");

    console.log("\nCipher-breaking complete: two keys recovered, one vector reproduced, and every " +
        "answer carried what it rests on.");
} finally {
    await client.close();
}
