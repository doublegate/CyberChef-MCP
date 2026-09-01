# Recipes

Worked examples, **each one run against the server before being written here**. Recipes go to
`cyberchef_bake`; the `recipe` array is a list of `{op, args}` steps, and argument names are the
sanitised form (`Split delimiter` → `split_delimiter`).

Ask your assistant in plain language and it will usually assemble these itself — they are here so
you can see the shape, and paste one when you want a specific answer.

---

## Triage: what *is* this blob?

The fastest first move on anything unidentified.

```json
{ "input": "504b03040a000000000000", "recipe": [{ "op": "From Hex" }, { "op": "Detect File Type" }] }
```
> `File type: PKZIP archive · Extension: zip · MIME type: application/zip`

`Magic` goes further — it tries decodings and reports which produced something plausible, with a
loadable recipe for each:

```json
{ "input": "537570657220736563726574", "recipe": [{ "op": "Magic" }] }
```

## Peel a layered payload

Base64 wrapping gzip is the commonest shape in malware triage and CTF alike:

```json
{ "input": "H4sIAAAAAAAAA8tIzcnJV0grys9VSFRIr8osUEjKyU8CAOB/HyQWAAAA",
  "recipe": [{ "op": "From Base64" }, { "op": "Gunzip" }] }
```
> `hello from a gzip blob`

If a step fails, decode **one layer at a time** to find where the chain actually breaks — the error
names the operation, not the layer you assumed.

## Extract IOCs from a log

```json
{ "input": "src 10.0.0.5 dst 8.8.8.8 via 192.168.1.1",
  "recipe": [{ "op": "Extract IP addresses" }] }
```
> `10.0.0.5` `8.8.8.8` `192.168.1.1`

Sibling operations: `Extract URLs`, `Extract domains`, `Extract email addresses`,
`Extract file paths`, `Extract MAC addresses`. Chain `Defang URL` when you are about to paste the
result somewhere that might make it clickable:

```json
{ "input": "http://evil.example.com/a?b=1", "recipe": [{ "op": "Defang URL" }] }
```
> `hxxp[://]evil[.]example[.]com/a?b=1`

## Identify a hash before trying to crack it

```json
{ "input": "5d41402abc4b2a76b9719d911017c592", "recipe": [{ "op": "Analyse hash" }] }
```

Reports length in bytes and bits and the algorithms that match. 32 hex characters is MD5, NTLM,
MD4 or an MD5-family variant — the operation says so rather than guessing one.

## Read a JWT without trusting it

```json
{ "input": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiQWxpY2UifQ.x",
  "recipe": [{ "op": "JWT Decode" }] }
```
> `{ "sub": "123", "name": "Alice" }`

`JWT Decode` reads the payload **without verifying the signature** — which is what you want for
inspection and never what you want for a security decision. Use `JWT Verify` with the key for that.

## Steganography and file carving

```json
{ "input": "<base64 image>", "recipe": [{ "op": "Detect File Type" }] }
```

```json
{ "input": "<base64 image>", "recipe": [{ "op": "Extract EXIF" }] }
```

```json
{ "input": "<base64 image>", "recipe": [{ "op": "Scan for Embedded Files" }] }
```

Three separate calls, not one chained recipe — each consumes the original bytes, so a chain would
give you only the last answer. `Extract LSB` and `View Bit Plane` are the next moves when a PNG
looks larger than its content justifies.

## Images come back as images

From v2.2.0, image operations return a real MCP `image` block rather than text, so your assistant
can see the result:

```json
{ "input": "<base64 png>", "recipe": [{ "op": "From Base64" }, { "op": "Invert Image" }] }
```

Every image operation was fixed in v2.3.0 — before that, seventeen of them returned the process's
buffer pool instead of the image.

## Measure randomness before assuming encryption

```json
{ "input": "aaaaaaaaaaaaaaaaaaaaaaaa", "recipe": [{ "op": "Entropy" }] }
```
> `Shannon entropy: 0`

High entropy suggests compression or encryption; low entropy on something claiming to be encrypted
suggests it is not. Pair with `Chi Square` and `Frequency distribution`.

## Classical ciphers (CTF)

```json
{ "input": "<ciphertext>", "recipe": [{ "op": "ROT13 Brute Force" }] }
```

```json
{ "input": "<ciphertext>", "recipe": [{ "op": "Vigenère Decode", "args": { "key": "cyberchef" } }] }
```

```json
{ "input": "<ciphertext>", "recipe": [{ "op": "XOR Brute Force", "args": { "key_length": 1, "crib": "flag{" } }] }
```

The `crib` argument on `XOR Brute Force` is the one that turns 255 candidate outputs into one
answer — give it any plaintext you expect to be present.

## Save a recipe you will reuse

```json
{ "name": "b64-gunzip", "operations": [{ "op": "From Base64" }, { "op": "Gunzip" }] }
```

`cyberchef_recipe_create`, then `cyberchef_recipe_execute` by id. Saved recipes are also exposed as
MCP **resources** at `recipe://<id>`, so a client can attach one without spending a tool call.

---

## Finding an operation you do not know the name of

```
cyberchef_search        keyword search across all 504
cyberchef_categories    the 16 categories
cyberchef_list_operations  everything in one category
cyberchef_describe_operation  full argument schema for one
```

That path exists because `tools/list` deliberately pre-loads only about 24 tools. See the
[FAQ](FAQ).

## Prompts

Five workflow prompts ship with the server for when you do not yet know where to start:
`analyse-unknown-data`, `extract-iocs`, `deobfuscate-script`, `identify-hash`, `decode-chain`.
Most clients surface them as slash commands or an attachment menu.
