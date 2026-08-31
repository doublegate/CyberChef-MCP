# Vendored: CyberChef bitmap fonts

Source: `src/web/static/fonts/bmfonts/` in [GCHQ CyberChef](https://github.com/gchq/CyberChef)
(v11.4.0) · **Apache-2.0**, © Crown Copyright — the same grant as the rest of the upstream tree, and
recorded in `LICENSE.Apache-2.0`. The glyphs are rendered from Roboto, Roboto Mono and Roboto Slab
(Apache-2.0, © Google). Copied verbatim; no modification.

Four bitmap fonts, each a `.fnt` descriptor plus its page atlas `.png`: Roboto, Roboto Black,
Roboto Mono, Roboto Slab.

## Why these are here

`Add Text To Image` is the only operation that needs them, and in this fork it could never run.
Upstream loads them with webpack-only `import()` of `.fnt`/`.png` under `src/web/`, then builds an
absolute URL from `self.docURL`. This fork **removed `src/web/` in v1.7.1** and runs under plain
Node, where neither the webpack loader nor `self.docURL` exists — so every call failed with

```
Error preparing fonts. (Cannot find module '/src/web/static/fonts/bmfonts/RobotoBlack72White.fnt')
```

The operation was advertised in `tools/list` throughout, so this was a tool that could only ever
return an error. Restoring the assets alone is not enough: Node cannot `import()` a `.fnt`, and
there is no document URL to resolve against. `patches/fork/10-add-text-to-image-node-fonts.patch`
therefore also replaces the loader with `loadFont(<path to the vendored .fnt>)`, which jimp supports
directly in Node and which resolves each font's page atlas relative to its descriptor.

## When to delete this directory

If this fork ever restores `src/web/`, or upstream makes the operation load fonts without webpack.
Drop the directory and patch 10 together — neither is useful without the other.

This tree is third-party data: it is exempt from this repository's linter and is not counted in
coverage.
