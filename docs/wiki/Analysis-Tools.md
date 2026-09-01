# Analysis Tools

Four tools that are **not** CyberChef operations, added in v2.4.0.

## Why they exist

An operation is a pure `run(input, args)` over one input. That shape cannot express an *analysis*:
scoring forty candidate key lengths, factoring a modulus four different ways, or matching a value
against a table of structures and reporting which ones fit.

`cyberchef_bake` does not close the gap either, because a recipe is a **linear pipeline, not a
loop**. There is no way to write "try every key length from 1 to 32 and rank them" as a recipe.

Each of these replaces a separate command-line tool, and each is exposed at **every**
[tool surface](Tool-Surface) — including the default index — because none is reachable through
`cyberchef_bake`.

---

## `cyberchef_xor_key_length`

Recovers the key length of a repeating-key XOR by **index of coincidence**, then guesses the key
and decrypts. Replaces `xortool`.

**Arguments:** `input` (required, at most 1 MB), `input_format` (`Raw`/`Hex`/`Base64`, default
`Raw`), `max_key_length` (default 32), `candidates` (default 5), `preview_bytes` (default 256)

`input_format` defaults to `Raw`, so pass `"input_format": "Hex"` explicitly for hex ciphertext —
analysing hex text as raw bytes returns a confident wrong answer rather than an error.

**Read the `confidence` block before trusting the answer.** It reports the winner's ratio to
random. The method is least reliable on short inputs and on plaintext with a strong period of its
own, and it is wrong about one time in six.

> **Why not chi-square?** It is the obvious scoring function and it is wrong: chi-square grows with
> sample size, so it ranks short key lengths highest regardless of the data. The first
> implementation answered "1" for every input and looked entirely plausible doing it. Index of
> coincidence is normalised by construction.

> **Divisors, not just multiples.** Every multiple of the true length scores about as well as the
> true length, so the tool prefers the smallest candidate in the leading band. That is right for
> multiples and wrong for divisors: `secret` has `e` at positions 1 and 4, so at period 3 one
> column is a single key byte and scores respectably — and the tool used to answer 3 for a six-byte
> key. A candidate is now rejected when a multiple of it scores materially higher, since a divisor
> is beaten by the true length while a multiple is not.

---

## `cyberchef_cyclic_pattern`

Generates a De Bruijn pattern, and finds the offset of a fragment within one. This is how you
locate the return-address bytes in a stack overflow: send the pattern, crash the target, then look
up the bytes that landed in the instruction pointer. Replaces `pwntools cyclic`.

**Byte-compatible with pwntools**, which is the entire point — an offset found here equals the one
a colleague found with `cyclic -l`.

**Arguments:** `mode` (`generate`/`find`, required), `length` (default 1024), `fragment` (`find`
only), `fragment_format` (`Auto`/`Text`/`Hex`, default `Auto`), `subsequence_length` (default 4 —
use 8 for 64-bit), `alphabet`

Two behaviours worth knowing:

- A hex fragment is read as **both** endiannesses and both offsets are returned when both match. A
  crash dump rarely tells you which it is, and silently picking one hands back a plausible wrong
  number.
- A fragment **shorter** than `subsequence_length` is refused rather than answered. Uniqueness is a
  property of length-`n` windows only: with `n = 4`, `"aa"` occurs 282 times in a 1024-byte
  pattern, so any offset would be a guess.

Generating a pattern longer than the alphabet can keep unique is likewise refused — past `k^n`
bytes the windows repeat and every offset becomes ambiguous.

---

## `cyberchef_hash_identify`

Identifies a password hash by its structure and returns the **hashcat mode and John format name**,
so the output is a command you can run. Replaces `hashid` and `hash-identifier`.

**Arguments:** `input` (required, one hash per call, at most 4 KB)

This fills a real gap. CyberChef computes around forty digests and cannot tell you what one is; its
`Analyse hash` operation reads hex length only, and reports `Invalid hash` for bcrypt, sha512crypt
and argon2 — precisely the formats you are most likely to be holding.

```json
{
  "identified": true,
  "most_likely": {
    "format": "bcrypt",
    "confidence": "structural",
    "hashcat_mode": 3200,
    "john_format": "bcrypt",
    "note": "Cost is the number after the second $: 10 means 2^10 rounds."
  },
  "ambiguous": false,
  "next": "hashcat -m 3200"
}
```

**Confidence has three values, and they mean different things:**

| | |
|---|---|
| `structural` | Matched an exclusive `$id$` structure. Reliable. |
| `structural, but not exclusive` | Matched a pattern that other things satisfy by coincidence — Cisco type 7 is two decimal digits then hex, which an ordinary MD5 beginning `01` also matches. Length candidates are listed alongside. |
| `length only` | A bare hex digest. 32 hex characters is MD5, NTLM, MD4, LM and RIPEMD-128; context decides. |

---

## `cyberchef_rsa_attack`

Tests an RSA public key for the generation flaws that make it breakable, and recovers the private
key when one applies. Attack selection follows `RsaCtfTool`; the implementations are written here.

| Attack | The flaw it detects |
|---|---|
| **Fermat** | `p` and `q` too close — a generator that picked one prime and searched upward |
| **Common factor** | a prime shared with a second modulus, from a low-entropy pool at first boot. One `gcd` breaks both keys |
| **Wiener** | a private exponent chosen small to make decryption fast |
| **Small `e`, unpadded** | `e=3` with a message short enough that `m^e` never wrapped the modulus |

**Arguments:** `modulus` (required, decimal or hex), `public_exponent` (default `65537`),
`ciphertext`, `other_modulus`, `attacks`, `fermat_iterations` (default 100000)

**None of these threatens a correctly generated key.** A sound 2048-bit modulus defeats all four,
quickly and by design — so a negative result is reported as four flaws ruled out, and explicitly
**not** as evidence the key is strong. The report says so in as many words.

Pass `other_modulus` whenever you hold a second key from the same source: it is by far the cheapest
of the four and the only one that breaks two keys at once.

### Limits, and why they are where they are

A modulus above **16,384 bits** is refused, and every operand is capped at 5,000 characters. That
is not arbitrary: the cost of these attacks is driven by the *size of the numbers*, not by the
iteration count. 1,000,000 Fermat iterations against a 65-bit modulus costs 582 ms; 100 iterations
against a 262,144-bit one blocked for **72 seconds**.

The Fermat search also stops at a **ten-second budget** and says so, rather than reporting a search
it never finished as one that found nothing. A recovered plaintext is raw RSA output, so expect
PKCS#1 or OAEP padding ahead of the message.

---

## What is deliberately not here

`node:vm` is **not** a security boundary, so there is no plugin loader and tools are registered by
explicit import in a reviewed pull request. A capability handed into a vm context reaches the real
`process` through its own `constructor`, and every useful tool needs at least one capability. See
[ADR 0002](https://github.com/doublegate/CyberChef-MCP/blob/master/docs/adr/0002-tool-registry-is-not-a-plugin-loader.md)
and **[Security](Security)**.
