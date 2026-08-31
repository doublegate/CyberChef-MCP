/**
 * Ciphersaber2 tests.
 *
 * @author n1073645 [n1073645@gmail.com]
 *
 * @copyright Crown Copyright 2020
 * @license Apache-2.0
 */
import TestRegister from "../../lib/TestRegister.mjs";

// The two Encrypt cases hex-encode their output before asserting on its length.
//
// CipherSaber2 prepends a 10-byte random IV, so the only stable property of the ciphertext is its
// SIZE -- but the original assertions (`/.{21}/s`, `/.{10}/s`) counted CHARACTERS of a string the
// harness produced from those random bytes. When two of them happened to form a decodable
// multi-byte sequence, the string came out shorter than the byte count and the test failed on
// nothing. Observed in CI: 10 random bytes rendering as `,áiɉwA$5` -- 8 characters, because
// C9 89 decoded to a single U+0249.
//
// Appending `To Hex` makes the assertion count bytes, which is what it always meant. It is also
// strictly stronger: `/.{10}/s` is unanchored and passes on anything at least 10 characters long,
// whereas `/^[0-9a-f]{20}$/` pins the length exactly. Verified over 1,000 runs of each case.

TestRegister.addTests([
    {
        name: "CipherSaber2 Encrypt",
        input: "Hello World",
        // 11 bytes of input + a 10-byte IV = 21 bytes = 42 hex characters.
        expectedMatch: /^[0-9a-f]{42}$/,
        recipeConfig: [
            {
                op: "CipherSaber2 Encrypt",
                args: [{ "option": "Latin1", "string": "test" }, 20],
            },
            {
                op: "To Hex",
                args: ["None"],
            },
        ],
    },
    {
        // input taken from https://ciphersaber.gurus.org/
        name: "CipherSaber2 Decrypt",
        input: "\x6f\x6d\x0b\xab\xf3\xaa\x67\x19\x03\x15\x30\xed\xb6\x77"  +
            "\xca\x74\xe0\x08\x9d\xd0\xe7\xb8\x85\x43\x56\xbb\x14\x48\xe3" +
            "\x7c\xdb\xef\xe7\xf3\xa8\x4f\x4f\x5f\xb3\xfd",
        expectedOutput: "This is a test of CipherSaber.",
        recipeConfig: [
            {
                op: "CipherSaber2 Decrypt",
                args: [{ "option": "Latin1", "string": "asdfg" }, 1],
            },
        ],
    },
    {
        name: "CipherSaber2 Encrypt",
        input: "",
        // No input, so the output is exactly the 10-byte IV = 20 hex characters.
        expectedMatch: /^[0-9a-f]{20}$/,
        recipeConfig: [
            {
                op: "CipherSaber2 Encrypt",
                args: [{ "option": "Latin1", "string": "" }, 20],
            },
            {
                op: "To Hex",
                args: ["None"],
            },
        ],
    },
]);
