# Vendored: `crypto-api` 0.8.5

Source: <https://github.com/nf404/crypto-api> · npm `crypto-api@0.8.5` · **MIT** (see `LICENSE.md`).
Vendored 2026-08-31 from the published tarball, unmodified except for import specifiers (below).

## Why this is vendored rather than a dependency

`crypto-api@0.8.5` — the latest published version — is **unusable as published**, in two independent
ways:

1. Its `package.json` declares `"main": "index"`, but the tarball contains **no `index.js`**. The
   `files` allowlist names `index.js`, `index.min.js` and `index.min.js.map`; none of the three were
   ever included. So `require("crypto-api")` fails outright, and there is no prebuilt bundle to fall
   back on.
2. The ESM sources under `src/` use **extensionless relative imports** (`from "./hasher/has160"`).
   Node's ESM resolver rejects those, so `import "crypto-api/src/crypto-api.mjs"` dies with
   `ERR_MODULE_NOT_FOUND` on the first transitive import.

Upstream CyberChef works around (2) with a `postinstall` script that rewrites the specifiers inside
`node_modules`. That is fine for a repository checkout and **impossible for a published npm package**:
since npm 12, dependency install scripts are blocked by default (`npm help install-scripts`), so the
rewrite never runs for anyone who installs `cyberchef-mcp` from the registry — and the server dies at
startup with the error above. That blocked npm as a distribution channel entirely; it is recorded as
F-14 in `docs/internal/v2.2.0-findings-log.md`.

Vendoring removes the need for any install script, which is the whole point. A package that cannot be
loaded as published is not a dependency; it is source we have to carry.

## What was changed

`src/index.mjs` was **removed**, not vendored. It reads

```js
import CryptoApi from './crypto-api'
module.exports = CryptoApi
```

which mixes an ES import with a CommonJS export and names a file that does not exist
(`crypto-api.mjs` does). It cannot load under any Node version, nothing here imports it — the
consumers name `crypto-api.mjs`, `hasher/sm3.mjs` and `encoder/hex.mjs` directly — and it is part of
why the published package is unusable. Carrying a file that cannot be loaded would just be shipping
the defect.

Otherwise, exactly one mechanical transformation, applied to 16 of the 24 `.mjs` files:

```text
from "./foo"   ->   from "./foo.mjs"
```

Nothing else — no reformatting, no logic changes, no removals. Regenerate with:

```sh
npm pack crypto-api@0.8.5 && tar -xzf crypto-api-0.8.5.tgz
cp -r package/src/. src/vendor/crypto-api/ && cp package/LICENSE.md src/vendor/crypto-api/
# then re-append ".mjs" to every extensionless relative import
```

## How it is consumed

Seven upstream-owned files under `src/core/` import it. Because those files are mirrored verbatim
from GCHQ CyberChef, the import rewrite is a **fork patch**, not a hand edit:
[`patches/fork/08-crypto-api-vendored.patch`](../../../patches/fork/08-crypto-api-vendored.patch).
If upstream ever changes those import lines the sync fails loudly rather than silently reverting us —
see [`patches/fork/README.md`](../../../patches/fork/README.md) for why that matters here.

## When to delete this directory

When `crypto-api` publishes a release that ships its `main` entry **and** resolvable ESM specifiers.
At that point: drop the vendored tree, drop patch 08, restore the `crypto-api` dependency, and check
that a `--ignore-scripts` install of the packed tarball still starts.

This tree is third-party code: it is exempt from this repository's linter and is not counted in
coverage.
