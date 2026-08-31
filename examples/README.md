# Runnable examples

Every file here is executable and **exercised by the test suite**
(`tests/mcp/examples.test.mjs`), so an example that stops working fails CI rather than
quietly rotting in the documentation. That is the point of keeping them as scripts instead of
as fenced code blocks in a guide.

| Example | Shows | Needs |
|---|---|---|
| [`01-quickstart.mjs`](01-quickstart.mjs) | Connect over stdio, list tools, call one | nothing |
| [`02-recipe-chain.mjs`](02-recipe-chain.mjs) | `cyberchef_bake` — several operations in one pass | nothing |
| [`03-discover-operations.mjs`](03-discover-operations.mjs) | `cyberchef_search` — finding an operation by name | nothing |
| [`04-forensic-triage.mjs`](04-forensic-triage.mjs) | A realistic multi-stage analysis of an unknown blob | nothing |
| [`05-saved-recipes.mjs`](05-saved-recipes.mjs) | Save, list, execute and delete a named recipe | writes a temp file |
| [`06-batch-processing.mjs`](06-batch-processing.mjs) | `cyberchef_batch` — many inputs in one call | nothing |
| [`07-http-two-clients.mjs`](07-http-two-clients.mjs) | HTTP transport with two concurrent clients | binds a local port |
| [`08-shell-oneliners.sh`](08-shell-oneliners.sh) | Driving the server from a shell with `jq` | `jq` on PATH |
| [`09-prompts-and-media.mjs`](09-prompts-and-media.mjs) | Prompts, resources, image/audio blocks and tool annotations | nothing |

## Running them

From a checkout, after `npm install && npx grunt configTests`:

```bash
node examples/01-quickstart.mjs
```

Each script spawns its own server, so nothing needs to be running first. They print what they are
doing and exit non-zero if an assertion fails, which is what makes them usable as tests.

To run the whole set the way CI does:

```bash
npx vitest run tests/mcp/examples.test.mjs
```

## Reading them in order

`01` through `03` are the basics and take a minute each. `04` is the one to read if you want to
see what this server is actually *for* — it chains detection, decoding and extraction the way an
analyst would. `05` and `06` cover the stateful and bulk paths. `09` covers the surfaces beyond tools — prompts,
resources, and results that are images or audio rather than text. `07` matters only if you are
running the HTTP transport.
