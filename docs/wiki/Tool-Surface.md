# The Tool Surface

**Why you see 42 tools and not 545.** This is the most common question about the server, and the
answer is a deliberate design decision rather than a limitation.

## The problem

`tools/list` is sent to the model on **every** request. Exposing all 504 operations plus the
meta-tools costs roughly **424,810 bytes** before the user has typed anything — and model
tool-selection quality is known to degrade well before that many definitions are in play.

So the default is an **index**, not a catalogue.

## The three surfaces

Measured with `npm run measure:surfaces`, which drives a real MCP client and counts the exact
bytes of the `tools/list` payload, rather than estimated:

| `CYBERCHEF_TOOL_SURFACE` | Tools | Payload | Exact bytes |
|---|---|---|---|
| **`index`** *(default)* | 42 | 43 KB | **44,406** |
| `curated` | 120 | 105 KB | 107,652 |
| `all` | 545 | 415 KB | 424,810 |

The 42 in the default index are 23 meta-tools, `cyberchef_magic`, and the eighteen
[analysis tools](Analysis-Tools) — and that arithmetic is the point: 23 + 1 + 18 = 42, matching the
table above. The index grew from 28 to 40 in v3.3.0 because twelve new registry tools have no
navigation path of their own — a registry tool that is not listed cannot be called at all — then to
41 with `cyberchef_ecdsa_recover` in v3.4.0 and 42 with `cyberchef_cert_chain` in v3.8.0.

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

## Two things are always exposed, at every surface

**`cyberchef_magic`**, because it is what you reach for *before* you know what you are looking at.
Making it three calls deep would invert the cost.

**The eighteen analysis tools**, because unlike an operation, none of them is reachable through
`cyberchef_bake` — they are not in `OperationConfig`. Hiding them behind a surface setting would
make them unreachable rather than merely inconvenient. They form part of the 44,406-byte index
payload.

## Shaping it yourself

```bash
CYBERCHEF_TOOL_SURFACE=all                                   # everything
CYBERCHEF_TOOL_SURFACE=curated                               # ~100 common operations
CYBERCHEF_TOOL_ALLOWLIST="To Base64,From Base64,SHA2,Gunzip" # exactly these; overrides the mode
CYBERCHEF_EXPOSE_ALL_OPS=true                                # historical alias for =all
```

`CYBERCHEF_TOOL_ALLOWLIST` takes **CyberChef operation names**, not tool names — `To Base64`, not
`cyberchef_to_base64`.

## Upgrading from v2.0.0 or earlier

The default changed in v2.1.0. A client that hard-codes a tool name outside the index —
`cyberchef_to_morse_code`, say — will no longer find it in `tools/list`. Either set
`CYBERCHEF_TOOL_SURFACE=all` to restore the old behaviour, or call the operation through
`cyberchef_bake`, which never stopped working.
