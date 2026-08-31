/**
 * @author n1474335 [n1474335@gmail.com]
 * @copyright Crown Copyright 2022
 * @license Apache-2.0
 */

import Operation from "../Operation.mjs";
import forge from "node-forge";

/**
 * The constant every LM hash encrypts. "KGS!@#$%", from the original LAN Manager algorithm.
 */
const LM_MAGIC = "KGS!@#$%";

/**
 * Expand a 7-byte half-key into the 8-byte key DES expects.
 *
 * DES keys are 64 bits of which 56 are significant; the LM algorithm supplies 56 bits and the
 * remaining parity bits are ignored, so they are left clear here.
 *
 * @param {number[]} seven - Seven key bytes.
 * @returns {string} An 8-character binary string.
 */
function expandKey(seven) {
    const out = [];
    for (let i = 0; i < 8; i++) {
        let v;
        if (i === 0) v = seven[0];
        else if (i === 7) v = seven[6] << 1;
        else v = (seven[i - 1] << (8 - i)) | (seven[i] >> i);
        out.push(v & 0xfe);
    }
    return out.map(c => String.fromCharCode(c)).join("");
}

/**
 * LM Hash operation
 */
class LMHash extends Operation {

    /**
     * LMHash constructor
     */
    constructor() {
        super();

        this.name = "LM Hash";
        this.module = "Crypto";
        this.description = "An LM Hash, or LAN Manager Hash, is a deprecated way of storing passwords on old Microsoft operating systems. It is particularly weak and can be cracked in seconds on modern hardware using rainbow tables.";
        this.infoURL = "https://wikipedia.org/wiki/LAN_Manager#Password_hashing_algorithm";
        this.inputType = "string";
        this.outputType = "string";
        this.args = [];
    }

    /**
     * FORK CHANGE (patches/fork/06): computed with node-forge rather than the `ntlm` package.
     *
     * `ntlm@0.1.3` calls `crypto.createCipheriv("DES-ECB", ...)` (lib/smbhash.js:46). Single DES
     * moved to OpenSSL 3's *legacy provider*, which the Chainguard runtime image does not carry --
     * a filesystem walk of the published image finds no `*legacy*.so`, and Node prints "Unable to
     * load legacy provider." at startup. So this threw
     *
     *     error:0308010C:digital envelope routines::unsupported
     *
     * in the shipped container, and took `Generate all hashes` down with it: one unavailable
     * algorithm discarded the twenty that had computed correctly.
     *
     * `--openssl-legacy-provider` does not fix it. It was already set in the image's NODE_OPTIONS
     * and is inert, because there is no module to load.
     *
     * node-forge is already a direct dependency and implements DES in JavaScript, so this works
     * wherever Node runs rather than only where a legacy provider happens to be installed. Verified
     * against both canonical vectors: LM("password") = E52CAC67419A9A224A3B108F3FA6CB6D and
     * LM("") = AAD3B435B51404EEAAD3B435B51404EE.
     *
     * @param {string} input
     * @param {Object[]} args
     * @returns {string}
     */
    run(input, args) {
        // Uppercased, truncated to 14 characters, NUL-padded, then split into two 7-byte halves.
        //
        // Indexed `charCodeAt`, NOT `Array.from`. `slice`/`padEnd` count UTF-16 code UNITS while
        // `Array.from` iterates code POINTS, so an astral character in the first 14 units yields
        // fewer than 14 entries -- leaving the second half six bytes long and `expandKey` reading
        // an undefined seventh. LM is a byte algorithm over a legacy code page; code units are the
        // right unit here, and this keeps both halves exactly seven bytes for any input.
        const padded = input.toUpperCase().slice(0, 14).padEnd(14, "\0");
        const bytes = [];
        for (let i = 0; i < 14; i++) bytes.push(padded.charCodeAt(i) & 0xff);

        let out = "";
        for (const half of [bytes.slice(0, 7), bytes.slice(7, 14)]) {
            const cipher = forge.cipher.createCipher("DES-ECB", expandKey(half));
            cipher.start();
            cipher.update(forge.util.createBuffer(LM_MAGIC));
            cipher.finish();
            // One 8-byte block per half; forge appends padding, which is not part of the hash.
            out += cipher.output.toHex().slice(0, 16);
        }
        return out.toUpperCase();
    }

}

export default LMHash;
