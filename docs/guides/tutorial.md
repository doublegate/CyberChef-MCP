# Tutorial: your first hour with CyberChef MCP

A guided path from "nothing installed" to "decoding a real sample". It assumes no prior CyberChef
knowledge and no MCP knowledge. Every command here is one you can paste.

If you would rather read code than prose, [`examples/`](../../examples/) contains the same
material as eight runnable scripts, and the test suite executes them on every change — so they are
guaranteed to work against the version you have.

**Contents**

1. [What this thing actually is](#1-what-this-thing-actually-is)
2. [Install it](#2-install-it)
3. [Your first call](#3-your-first-call)
4. [Finding an operation among 504](#4-finding-an-operation-among-504)
5. [Chaining operations: recipes](#5-chaining-operations-recipes)
6. [Arguments, and how to get them right](#6-arguments-and-how-to-get-them-right)
7. [A real task, start to finish](#7-a-real-task-start-to-finish)
8. [Saving work you will repeat](#8-saving-work-you-will-repeat)
9. [Where to go next](#9-where-to-go-next)

---

## 1. What this thing actually is

[CyberChef](https://github.com/gchq/CyberChef) is GCHQ's "cyber swiss army knife" — 504 operations
for encoding, encryption, compression, parsing and forensics, normally used through a web page
where you drag operations into a recipe.

This project wraps that engine as an **MCP server**, so an AI assistant can use it directly. You
ask the assistant to decode something; it calls the operations; you get an answer. No copying
strings into a browser.

Three ideas carry the whole design, and knowing them will save you time:

| Idea | What it means |
|---|---|
| **Operations** | The 504 units of work: `To Base64`, `AES Decrypt`, `Gunzip`, `Extract IP addresses`. |
| **Recipes** | An ordered list of operations. The output of each feeds the next. |
| **`cyberchef_bake`** | The tool that runs a recipe. It can run **any** of the 504 operations by name. |

That last row matters more than it looks. Because `bake` reaches everything, the server does not
need to advertise 504 separate tools — and by default it does not. More on that in step 4.

---

## 2. Install it

### The quickest route: Docker

```bash
docker pull ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

Check it works. The `-i` flag is **required** — without stdin the container exits immediately,
which is the single most common setup mistake:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | docker run -i --rm ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

You should get a JSON response listing tools. If you get nothing, you left out `-i`.

### Wiring it into a client

For Claude Desktop or any MCP client using the standard config shape:

```json
{
  "mcpServers": {
    "cyberchef": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/doublegate/cyberchef-mcp_v2:latest"]
    }
  }
}
```

Restart the client. It should report the CyberChef tools as available.

### From a checkout

Two commands, and the second is not optional — the operation index is generated, not committed:

```bash
npm install
npx grunt configTests     # generates OperationConfig.json and src/node/index.mjs
npm run mcp
```

If you see `ERR_MODULE_NOT_FOUND` for a Config file, you skipped `grunt configTests`.

---

## 3. Your first call

The stdio transport is line-delimited JSON-RPC, so a shell is a complete client. This is worth
doing once even if you will only ever use an assistant — it makes the rest concrete.

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"cyberchef_to_base64","arguments":{"input":"Hello, CyberChef!"}}}' \
  | npm run --silent mcp 2>/dev/null | jq -r '.result.content[0].text'
```

```
SGVsbG8sIEN5YmVyQ2hlZiE=
```

And back:

```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
  "name":"cyberchef_from_base64","arguments":{"input":"SGVsbG8sIEN5YmVyQ2hlZiE="}}}' \
  | npm run --silent mcp 2>/dev/null | jq -r '.result.content[0].text'
```

```
Hello, CyberChef!
```

Two things to notice:

- Every tool name starts with **`cyberchef_`**. That prefix is permanent. v1.8.0 announced its
  removal and v2.0.0 withdrew that decision — dropping it saved 2.6% of the payload while making
  19 names (`search`, `hash`, `filter`, `diff`…) collide with other MCP servers you might have
  connected. Do not write code that strips it.
- Diagnostics go to **stderr**, results to **stdout**. That is why `2>/dev/null` is safe here.

The equivalent runnable script is [`examples/01-quickstart.mjs`](../../examples/01-quickstart.mjs).

---

## 4. Finding an operation among 504

Ask for the tool list and you will get about two dozen tools, not 504. That is deliberate, and it
is the thing most worth understanding about this server.

**Why.** `tools/list` is sent to the model on *every* request. With all 504 operations exposed it
is roughly 86,000 tokens — most of a context window, spent before you have typed anything. So the
default surface is an **index**: navigation tools plus the executor, about 2,500 tokens.

**Nothing is lost.** Every operation is still reachable. You walk down to it:

```
cyberchef_categories          16 categories, with counts and examples
  cyberchef_list_operations   the operations in one category, one line each
    cyberchef_describe_operation   the full argument schema for the ones you chose
      cyberchef_bake          runs it
```

Try it:

```bash
# Level 1 -- what kinds of thing are there?
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"cyberchef_categories","arguments":{}}}' \
  | npm run --silent mcp 2>/dev/null | jq -r '.result.content[0].text' | jq '.categories[:5]'
```

```json
[
  { "category": "Data format", "operations": 80, "examples": ["To Hexdump", "From Hexdump", "To Hex"] },
  { "category": "Encryption / Encoding", "operations": 95, "examples": ["AES Encrypt", "AES Decrypt", "Blowfish Encrypt"] },
  ...
]
```

```bash
# Level 2 -- what is in "Compression"?
... "name":"cyberchef_list_operations","arguments":{"category":"Compression"} ...

# Level 3 -- how do I call Gunzip?
... "name":"cyberchef_describe_operation","arguments":{"operations":["Gunzip"]} ...
```

If you already know roughly what you want, **skip the walk** and search:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"cyberchef_search","arguments":{"query":"base64"}}}' \
  | npm run --silent mcp 2>/dev/null | jq -r '.result.content[0].text' | jq -r '.[].name'
```

**If you would rather have every tool pre-loaded**, that is one environment variable:

| `CYBERCHEF_TOOL_SURFACE` | Tools | Approx. tokens per `tools/list` |
|---|---|---|
| `index` *(default)* | ~24 | ~2,500 |
| `curated` | ~100 | ~16,600 |
| `all` | 524 | ~86,000 |

`Magic` is present in every surface, including `index`, because it is what you reach for *before*
you know what you are looking at.

Runnable version: [`examples/03-discover-operations.mjs`](../../examples/03-discover-operations.mjs).

---

## 5. Chaining operations: recipes

One tool call per step means a round trip per step. `cyberchef_bake` runs a whole chain server-side:

```json
{
  "name": "cyberchef_bake",
  "arguments": {
    "input": "chain me",
    "recipe": [
      { "op": "To Hex", "args": { "delimiter": "None" } },
      { "op": "To Upper case" },
      { "op": "To Base64" }
    ]
  }
}
```

Operation names in a recipe are the **CyberChef display names** — `"To Hex"`, not
`"cyberchef_to_hex"`. That is on purpose: a recipe copied out of the CyberChef web UI works here
unchanged.

Flow-control operations work too, which they did not before v2.1.0:

```json
{ "recipe": [
    { "op": "Fork", "args": { "split_delimiter": ",", "merge_delimiter": "-" } },
    { "op": "To Upper case" }
] }
```

`"a,b,c"` becomes `"A-B-C"` — `Fork` splits the input, everything after it runs per branch, and the
results are joined. `Merge`, `Jump`, `Conditional Jump`, `Label`, `Register`, `Subsection`,
`Comment`, `Return` and `Magic` all work the same way.

Runnable version: [`examples/02-recipe-chain.mjs`](../../examples/02-recipe-chain.mjs).

---

## 6. Arguments, and how to get them right

This is where most first attempts go wrong, and all three traps are avoidable.

### Argument names come from the schema, not from the UI label

The CyberChef web UI labels SHA2's argument **Size**. The tool schema calls it `size`. Read the
schema — `cyberchef_describe_operation` prints it — rather than guessing from a screenshot.

### `Input` is renamed to `input_arg`

31 operations, including every symmetric cipher, have an argument literally named `Input` meaning
the input *format* (`Raw` or `Hex`). That collides with `input`, the data itself. The schema
exposes it as **`input_arg`**:

```json
{
  "name": "cyberchef_aes_encrypt",
  "arguments": {
    "input": "secret message",
    "key": { "string": "00112233445566778899aabbccddeeff", "option": "Hex" },
    "iv":  { "string": "000102030405060708090a0b0c0d0e0f", "option": "Hex" },
    "mode": "CBC",
    "input_arg": "Raw",
    "output": "Hex"
  }
}
```

### Keys and IVs carry their encoding

A key is not just a string — it is a string *plus how it is written*. Both forms work:

```json
"key": "00112233445566778899aabbccddeeff"                      // option defaults to the first (Hex)
"key": { "string": "hunter2", "option": "UTF8" }               // explicit
```

Get this wrong and the operation decodes your key with the wrong scheme, and the failure appears
much later as a decryption error. `cyberchef_describe_operation` tells you the permitted options
and the default.

---

## 7. A real task, start to finish

You are handed this and told nothing about it:

```
H4sIAAAAAAAA/y3JPQrFIAwA4KvkAib+dOrU5R1EfCkNpCo0iMeXQufvN09R...
```

**Step 1 — find out what it is.** Do not guess; ask:

```json
{ "name": "cyberchef_magic", "arguments": { "input": "H4sIA...", "depth": 3 } }
```

Magic brute-forces candidate decodings and reports which looked plausible, with entropy for each.
It is the correct first move, and it is in the tool list of every surface for that reason.

**Step 2 — peel it.** Magic says base64; the decoded bytes start `1f 8b`, which is gzip:

```json
{ "name": "cyberchef_bake", "arguments": { "input": "H4sIA...",
  "recipe": [ { "op": "From Base64" }, { "op": "Gunzip" } ] } }
```

```
Exfil to 203.0.113.42 -- contact ops@example.invalid -- http://evil.example/c2
```

**Step 3 — extract what is actionable:**

```json
{ "recipe": [{ "op": "Extract IP addresses" }] }      -> 203.0.113.42
{ "recipe": [{ "op": "Extract URLs" }] }              -> http://evil.example/c2
{ "recipe": [{ "op": "Extract email addresses" }] }   -> ops@example.invalid
```

**Step 4 — fingerprint it** so the finding can be correlated later:

```json
{ "name": "cyberchef_sha2", "arguments": { "input": "Exfil to ...", "size": "256" } }
```

That is the whole shape of the work: **detect, decode, extract, fingerprint**. The runnable
version, with assertions, is
[`examples/04-forensic-triage.mjs`](../../examples/04-forensic-triage.mjs).

---

## 8. Saving work you will repeat

A recipe you will run more than once does not belong in the conversation. Save it:

```json
{ "name": "cyberchef_recipe_create", "arguments": {
    "name": "b64-of-sha256",
    "description": "SHA-256 the input, then base64 the digest",
    "operations": [ { "op": "SHA2", "args": { "size": "256" } }, { "op": "To Base64" } ],
    "tags": ["hashing"] } }
```

Then run it by id, export it to share, or delete it. Recipes live in a JSON file
(`CYBERCHEF_RECIPE_STORAGE`), so they survive restarts.

And when you have many inputs rather than many steps, use `cyberchef_batch` — one call, many
results, with per-item failures reported instead of the whole batch abandoned.

Runnable: [`examples/05-saved-recipes.mjs`](../../examples/05-saved-recipes.mjs) and
[`examples/06-batch-processing.mjs`](../../examples/06-batch-processing.mjs).

---

## 9. Two shortcuts you have not needed yet

Everything above works by calling tools. Two other MCP surfaces exist, and both save you steps.

### Prompts: start here when you do not know what you have

Your client shows these as slash commands or menu entries. Pick one instead of composing the
workflow yourself:

| Prompt | Use it when |
|---|---|
| `analyse-unknown-data` | You have a blob and no idea what it is. |
| `extract-iocs` | You need indicators out of a document or script, defanged. |
| `deobfuscate-script` | You have obfuscated PowerShell, JavaScript, VBScript or PHP. |
| `identify-hash` | You have a hash and need the algorithm. |
| `decode-chain` | You know roughly what was done and want it unwrapped. |

They encode the order the work is actually done in — `Magic` before guessing, defang before an
indicator reaches a ticket — which is precisely what section 7 walked you through by hand.

### Results that are not text

Most operations return text. Some do not, and it is worth knowing before a result surprises you:

- **`Generate QR Code`, `Render Image` and the image operations return an `image` block.** The
  payload is `content[0].data` (base64) with `content[0].mimeType` — not `content[0].text`. A
  client that renders images will show you the picture.
- **`Play Media` returns an `audio` block**, the same way.
- **Compression and encoding operations return bytes as latin1 text**, one character per byte. It
  looks like mojibake and is exactly reversible. If you would rather have base64, start the server
  with `CYBERCHEF_BINARY_OUTPUT=base64`.

Try it:

```json
{"name": "cyberchef_bake",
 "arguments": {"input": "https://example.com", "recipe": [{"op": "Generate QR Code"}]}}
```

### Saved recipes are also resources

A recipe you saved in section 8 is readable at `recipe://<id>` without a tool call, so a client can
browse and attach it like a file. `cyberchef_recipe_list` reports the ids.

---

## 10. Where to go next

| If you want to… | Read |
|---|---|
| Look up a tool's exact contract | [`docs/guides/commands.md`](commands.md) |
| Run it over HTTP, or for several clients | [`docs/guides/http-transport.md`](http-transport.md) |
| Tune it: limits, caching, workers, surfaces | [`docs/guides/user_guide.md`](user_guide.md) |
| Manage recipes properly | [`docs/guides/recipe_management.md`](recipe_management.md) |
| See working code | [`examples/`](../../examples/) |
| Understand the architecture | [`docs/architecture/architecture.md`](../architecture/architecture.md) |

### The three things worth remembering

1. **`cyberchef_bake` runs anything.** If a tool is not in `tools/list`, it is still one `bake`
   call away. That is what makes the small default surface free rather than limiting.
2. **Read the schema before calling.** `cyberchef_describe_operation` is faster than guessing an
   argument name, and it is the only reliable source for `input_arg` and key encodings.
3. **`Magic` first, on anything you do not recognise.** It is designed for exactly that moment.
