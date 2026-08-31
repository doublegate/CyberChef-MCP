# Third-Party Notices

CyberChef-MCP is distributed under **GPL-3.0-or-later** (see `LICENSE`). This file records the
third-party works incorporated into it, and the licence each arrives under. Incorporating a work
does not change that work's own licence — see `NOTICE` for how the combined licence relates to the
parts.

## Upstream base

| Work | Copyright | Licence | Source |
|---|---|---|---|
| **CyberChef** | © 2016 Crown Copyright (GCHQ) | Apache-2.0 | <https://github.com/gchq/CyberChef> |

Everything under `src/core/`, plus `src/node/api.mjs`, `apiUtils.mjs`, `NodeDish.mjs`,
`NodeRecipe.mjs`, `File.mjs`, the config generation scripts, and the inherited test suites, is
upstream code. Those files keep their Apache-2.0 headers and are **not** to be hand-edited — they
are synced verbatim by `.github/workflows/upstream-sync.yml`. The full Apache-2.0 text is preserved
in `LICENSE.Apache-2.0`.

## Vendored source

Third-party source carried in-tree rather than installed, because the published package cannot be
loaded as shipped. Each vendored tree keeps its own licence file and a `README.md` recording the
provenance, the exact modification made, and the condition under which it should be deleted.

| Work | Copyright | Licence | Vendored at | Source |
|---|---|---|---|---|
| **crypto-api** 0.8.5 | © 2015 Nikolay Fedorov | MIT | `src/vendor/crypto-api/` | <https://github.com/nf404/crypto-api> |

`crypto-api@0.8.5` declares a `main` entry that is absent from its own tarball, and its ESM sources
use extensionless relative imports that Node's resolver rejects. Upstream CyberChef works around the
second problem with a `postinstall` rewrite inside `node_modules`; since npm 12 blocks dependency
install scripts by default, that workaround cannot reach anyone installing this server from the
registry. The vendored copy is byte-identical apart from appending `.mjs` to relative import
specifiers in 16 files. See `src/vendor/crypto-api/README.md`.

## Reference tools incorporated in v2.0.0

Algorithms ported into `src/node/tools/`. Each ported file carries an
`SPDX-License-Identifier: GPL-3.0-or-later` header and a provenance comment naming the source
project, file, and commit it was derived from.

| Project | Licence | GPLv3-compatible | Source |
|---|---|---|---|
| **John the Ripper** | GPL-2.0-**or-later** | Yes — "or later" permits use under GPLv3 | <https://github.com/openwall/john> |
| **katana** | GPL-3.0-or-later | Yes — and it is why GPLv2 was not an option | <https://github.com/JohnHammond/katana> |
| **Ares** | MIT | Yes | <https://github.com/bee-san/Ares> |
| **Ciphey** | MIT (© 2020 Brandon Skerritt) | Yes | <https://github.com/Ciphey/Ciphey> |
| **cryptii** | MIT | Yes | <https://github.com/cryptii/cryptii> |
| **pwntools** | MIT | Yes | <https://github.com/Gallopsled/pwntools> |
| **RsaCtfTool** | MIT | Yes | <https://github.com/RsaCtfTool/RsaCtfTool> |
| **xortool** | MIT | Yes | <https://github.com/hellman/xortool> |

### cyberchef-recipes — a note on scope

**<https://github.com/mattnotmax/cyberchef-recipes> ships no LICENSE file.** Absence of a licence is
not a grant; the default is all rights reserved. What is incorporated is therefore deliberately
narrow:

- **Incorporated:** the recipe *configurations* only — short functional JSON structures dictated
  entirely by CyberChef's operation grammar. Expression merges with function in the same way it
  does for a command line or a spreadsheet formula, so these are very unlikely to attract copyright.
  Every one has been revalidated against CyberChef v11.4.0, repaired where the operations moved on,
  and reworked into parameterised tools.
- **Not incorporated:** the README prose and explanations (ordinary copyrightable authorship by five
  named contributors), the `screenshots/` and `logo/` images, and the `source_files/` sample data of
  unstated provenance. All descriptive text shipped with these presets is our own; all test fixtures
  are generated.

The repository is credited here as the source of the recipe ideas regardless, and an issue has been
opened upstream asking the author to add an explicit licence.

## npm dependencies

The dependency tree was audited for GPLv3 compatibility at the time of the relicense: 1,694
packages, overwhelmingly MIT (1,379), ISC (131), Apache-2.0 (56) and BSD-2/3-Clause (71). Six
entries needed individual review — LGPL-3.0+, MPL-2.0, `MPL-2.0 OR Apache-2.0`,
`MIT OR GPL-3.0-or-later`, `BSD-3-Clause OR GPL-2.0`, and CC-BY-SA-4.0 — and each is
GPLv3-compatible, whether directly or by electing the permissive half of a dual licence.

No GPL-incompatible dependency was found. A full machine-readable inventory is published as the
CycloneDX SBOM attached to each release.
