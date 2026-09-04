# Prompts & Resources

Two MCP surfaces besides tools. Both exist for the same reason: **504 operations is not a usable
starting point** when you do not yet know what you are looking at.

## Prompts

Six workflow prompts, discoverable through `prompts/list`. In a client that surfaces them, they
appear as slash commands or a picker.

| Prompt | Arguments | What it is for |
|---|---|---|
| `analyse-unknown-data` | `data` * | Identify what an unknown string or blob is, then decode it. Use when you do not yet know the encoding, cipher or file type. |
| `extract-iocs` | `content` * | Pull URLs, IPs, email addresses, domains and hashes out of a document, log or script, and **defang** them for safe reporting. |
| `deobfuscate-script` | `script` * | Unwrap an obfuscated PowerShell, JavaScript, VBScript or PHP payload layer by layer and report what it does. |
| `identify-hash` | `hash` * | Work out which algorithm produced a hash, and what can be done with it. |
| `break-cipher` | `ciphertext` *, `hint` | Recover the plaintext from a classical or repeating-key cipher when you do not have the key. The order is the substance: each step is cheaper than the next and rules out the case it would waste time on. |
| `decode-chain` | `data` *, `hint` | Walk a known chain of nested encodings, when you already know roughly what was done. |

`*` = required.

The distinction between `analyse-unknown-data` and `decode-chain` is worth knowing: the first is
for when you have no idea, and leans on `Magic`; the second is for when you can say "base64, then
gzip, then JSON" and want it done without a conversation about it.

`extract-iocs` defangs by default (`hxxp://`, `1.2.3[.]4`) because the output usually goes into a
ticket or a report, where a live link is a hazard.

## Resources

Saved recipes are exposed as readable resources, so a client can browse and attach one without a
tool call.

```
recipe://{id}
```

**The `id` is a UUID, not the name.** Recipe names are user-supplied and not unique — two recipes
can share one, and a URI that resolves differently depending on which was saved last is not a URI.
`cyberchef_recipe_list` gives you the ids.

`resources/list` returns nothing until you have saved a recipe; the template is always advertised.

## Why these are separate from tools

A tool is something the model decides to call. A prompt is something **the user** picks, and it
shapes the whole turn rather than one step of it. A resource is context the client attaches, not an
action.

Collapsing all three into tools is possible and worse: it puts "analyse this unknown blob" — a
workflow — into the same list as `cyberchef_to_base64`, and the model then has to choose between
them on every request.

## Related

- **[Recipe Management](Recipe-Management)** — creating the recipes that become resources
- **[Recipes](Recipes)** — worked multi-step examples
