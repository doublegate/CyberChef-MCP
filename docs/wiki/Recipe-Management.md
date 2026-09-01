# Recipe Management

A **recipe** is a chain of CyberChef operations. `cyberchef_bake` runs one directly; these ten
tools let you save, validate and reuse them.

| Tool | What it does |
|---|---|
| `cyberchef_recipe_create` | Save a named recipe |
| `cyberchef_recipe_get` | Fetch one by id |
| `cyberchef_recipe_list` | List saved recipes with their ids |
| `cyberchef_recipe_update` | Modify one |
| `cyberchef_recipe_delete` | Remove one |
| `cyberchef_recipe_execute` | Run a saved recipe against input |
| `cyberchef_recipe_validate` | Check a recipe without running it |
| `cyberchef_recipe_test` | Run it against expected output and report pass/fail |
| `cyberchef_recipe_export` | Serialise for sharing |
| `cyberchef_recipe_import` | Load an exported recipe |

All ten are in the default [tool surface](Tool-Surface).

## The shape of a recipe

```json
{
  "name": "decode-nested-payload",
  "description": "base64 -> gunzip -> pretty JSON",
  "operations": [
    { "op": "From Base64" },
    { "op": "Gunzip" },
    { "op": "JSON Beautify", "args": { "indent_string": "  " } }
  ]
}
```

`op` is the **CyberChef operation name** — `From Base64`, not `cyberchef_from_base64`. Argument
names are the sanitised forms shown by `cyberchef_describe_operation`.

> One argument name is renamed, and it catches people: 31 operations — including AES Encrypt and
> AES Decrypt — have an argument literally called `Input`. Since `input` is reserved for the tool's
> own data parameter, the server exposes it as **`input_arg`**. Passing `input` there gets you
> "Unknown argument".

## Validate before you save

`cyberchef_recipe_validate` catches an unknown operation name, an unknown argument, or a nesting
depth over the limit, without executing anything. `cyberchef_recipe_test` goes further: it runs the
recipe against an input and an expected output, which turns a saved recipe into something with a
regression test attached.

That matters more than it sounds. A recipe references operations by name, and upstream CyberChef
does rename and remove operations between releases — a recipe that worked at v10 may not at v11.4.

## Where they are stored

`CYBERCHEF_RECIPE_STORAGE` sets the location; `CYBERCHEF_RECIPE_BACKUP` controls backups. Limits
are `CYBERCHEF_RECIPE_MAX_COUNT`, `_MAX_OPERATIONS` and `_MAX_DEPTH`.

In a Docker run with no volume mounted, storage is **inside the container** and disappears with
`--rm`. Mount a volume if you want recipes to persist:

```bash
docker run -i --rm -v cyberchef-recipes:/data \
  -e CYBERCHEF_RECIPE_STORAGE=/data/recipes.json \
  ghcr.io/doublegate/cyberchef-mcp_v2:latest
```

## Saved recipes are also resources

Every saved recipe is readable at `recipe://{id}` — see
**[Prompts & Resources](Prompts-and-Resources)**.
