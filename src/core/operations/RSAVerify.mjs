/**
 * @author Matt C [me@mitt.dev]
 * @copyright Crown Copyright 2020
 * @license Apache-2.0
 */

import Operation from "../Operation.mjs";
import OperationError from "../errors/OperationError.mjs";

/**
 * RSA Verify operation
 */
class RSAVerify extends Operation {

    /**
     * RSAVerify constructor
     */
    constructor() {
        super();

        this.name = "RSA Verify";
        this.module = "Ciphers";
        this.description = "Verify a message against a signature and a public PEM encoded RSA key.";
        this.infoURL = "https://wikipedia.org/wiki/RSA_(cryptosystem)";
        this.inputType = "string";
        this.outputType = "string";
        this.args = [
            {
                name: "RSA Public Key (PEM)",
                type: "text",
                value: "-----BEGIN RSA PUBLIC KEY-----"
            },
            {
                name: "Message",
                type: "text",
                value: ""
            },
            {
                name: "Message format",
                type: "option",
                value: ["Raw", "Hex", "Base64"]
            },
            {
                name: "Message Digest Algorithm",
                type: "option",
                value: ["SHA-1", "SHA-256", "SHA-384", "SHA-512", "MD5"]
            }
        ];
    }

    /**
     * @param {string} input
     * @param {Object[]} args
     * @returns {string}
     */
    run(input, args) {
        throw new OperationError("RSA Verify is temporarily disabled due to an unpatched vulnerability in node-forge (CVE-2026-85393). Please use an external verification tool.");
    }

}

export default RSAVerify;
