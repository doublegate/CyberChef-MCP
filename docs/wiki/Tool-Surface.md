# The Tool Surface

**Why you see 28 tools and not 531.** This is the most common question about the server, and the
answer is a deliberate design decision rather than a limitation.

## The problem

`tools/list` is sent to the model on **every** request. Exposing all 504 operations plus the
meta-tools costs roughly **100,000 tokens** before the user has typed anything — and model
tool-selection quality is known to degrade well before that many definitions are in play.

So the default is an **index**, not a catalogue.

## The three surfaces

Measured on the serialised `tools/list` payload from a real MCP client at v2.4.0, not estimated:

| `CYBERCHEF_TOOL_SURFACE` | Tools | Payload | Approx. tokens |
|---|---|---|---|
| **`index`** *(default)* | 28 | 19 KB | **~4,900** |
| `curated` | 106 | 81 KB | ~20,700 |
| `all` | 531 | 391 KB | ~100,000 |

The 28 in the default index are 23 meta-tools, `cyberchef_magic`, and the four
[analysis tools](Analysis-Tools).

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

So the index costs a round trip on an unusual operation and saves ~95,000 tokens on every request.
For an assistant that mostly reaches for base64, hex, JWT and hashes, that is the right trade — and
when it is not, one environment variable changes it.

## Two things are always exposed, at every surface

**`cyberchef_magic`**, because it is what you reach for *before* you know what you are looking at.
Making it three calls deep would invert the cost.

**The four analysis tools**, because unlike an operation, none of them is reachable through
`cyberchef_bake` — they are not in `OperationConfig`. Hiding them behind a surface setting would
make them unreachable rather than merely inconvenient. They cost about 1,500 tokens together.

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
