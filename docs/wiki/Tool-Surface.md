# The Tool Surface

**Why you see 23 tools and not 545.** This is the most common question about the server, and the
answer is a deliberate design decision rather than a limitation.

## The problem

`tools/list` is sent to the model on **every** request. Exposing all 504 operations plus the
meta-tools costs roughly **426,377 bytes** before the user has typed anything — and model
tool-selection quality is known to degrade well before that many definitions are in play.

So the default is an **index**, not a catalogue.

## The three surfaces

Measured with `npm run measure:surfaces`, which drives a real MCP client and counts the exact
bytes of the `tools/list` payload, rather than estimated:

| `CYBERCHEF_TOOL_SURFACE` | Tools | Payload | Exact bytes |
|---|---|---|---|
| **`index`** *(default)* | 23 | 15 KB | **15,291** |
| `curated` | 120 | 107 KB | 109,219 |
| `all` | 545 | 416 KB | 426,377 |

The 41 in the default index are 21 meta-tools, `cyberchef_magic`, and the nineteen
[analysis tools](Analysis-Tools) — and that arithmetic is the point: 21 + 1 + 19 = 41, matching the
table above. The index grew from 28 to 40 in v3.3.0 because twelve new registry tools have no
navigation path of their own — a registry tool that is not listed cannot be called at all — then to
41 with `cyberchef_ecdsa_recover` in v3.4.0, 42 with `cyberchef_cert_chain` in v3.8.0 and 43 with
`cyberchef_pqc_identify` in v3.11.0. **v4.0.0 took it back to 41** by removing two meta-tools that
navigated to nothing: `cyberchef_migration_preview` and `cyberchef_deprecation_stats`, which
existed to help callers reach v2.0.0.

## Nothing becomes unreachable

This is the claim the whole design rests on. Every one of the 504 operations is callable at every
surface:

```
cyberchef_categories            16 categories, with counts and examples   (~2 KB)
  cyberchef_list_operations     the operations in one category            (~8 KB for 50)
    cyberchef_describe_operation  full argument schema for the ones chosen (~1.6 KB each)
      cyberchef_bake            runs it, by operation name
```

`cyberchef_search` short-circuits the walk when you already know roughly what you want.

So the index costs a round trip on an unusual operation and saves roughly 380,000 bytes on every
request. For an assistant that mostly reaches for base64, hex, JWT and hashes, that is the right
trade — and when it is not, one environment variable changes it.

## What is always exposed, at every surface

**`cyberchef_magic`**, because it is what you reach for *before* you know what you are looking at.
Making it three calls deep would invert the cost.

**`cyberchef_analyse`**, the dispatcher for the nineteen analysis tools. None of them is reachable
through `cyberchef_bake` — they are not in `OperationConfig` — so something has to be able to run
them on every surface, and since v4.1.0 that is this one tool rather than nineteen listings.

## The analysis tools moved off the index in v4.1.0

They were listed on every surface until then, and on the index they were **30,683 of 44,968 bytes:
68%** of the payload whose whole purpose is being small.

They were listed for a real reason, not an oversight: `cyberchef_describe_operation` refused them
and pointed at `tools/list`, so the **listing was their only schema path** and a tool absent from it
could not be called at all. v4.1.0 removed that dependency rather than the tools:

| Need | Now served by |
|---|---|
| Find them | `cyberchef_categories` → `analysisTools`, or `cyberchef_search` → `analysis_tools` |
| Get a schema | `cyberchef_describe_operation({operations: "hash_identify"})` |
| Run one | `cyberchef_analyse({tool: "hash_identify", arguments: {...}})` |

They are **still listed outright on `curated` and `all`** and callable directly by name there.
Nothing became unreachable; only the default listing changed. A dispatched call runs the same code
as a direct one, so results are byte-identical.

## Shaping it yourself

```bash
CYBERCHEF_TOOL_SURFACE=all                                   # everything
CYBERCHEF_TOOL_SURFACE=curated                               # ~100 common operations
CYBERCHEF_TOOL_ALLOWLIST="To Base64,From Base64,SHA2,Gunzip" # exactly these; overrides the mode
```

`CYBERCHEF_TOOL_ALLOWLIST` takes **CyberChef operation names**, not tool names — `To Base64`, not
`cyberchef_to_base64`.

## Upgrading from v2.0.0 or earlier

The default changed in v2.1.0. A client that hard-codes a tool name outside the index —
`cyberchef_to_morse_code`, say — will no longer find it in `tools/list`. Either set
`CYBERCHEF_TOOL_SURFACE=all` to restore the old behaviour, or call the operation through
`cyberchef_bake`, which never stopped working.
