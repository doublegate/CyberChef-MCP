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

## Reference tools drawn on for `src/node/tools/`

The registry tools are written here rather than translated line-by-line, so what these projects
supplied is a *format*, an *algorithm choice*, or an *identifier table* — not source. Where a wire
format has to match for the tools to be interoperable at all, that is stated as the reason.

| Tool | Draws on | Licence | What was taken |
|---|---|---|---|
| `cyberchef_cyclic_pattern` | **pwntools** | MIT | The De Bruijn pattern format. Matching it byte-for-byte is the point: an offset found here must equal the one `cyclic -l` reports. Verified against pwntools' canonical output. |
| `cyberchef_hash_identify` | **hashcat**, **John the Ripper** | MIT / GPL-2.0-or-later | Mode numbers and format names, so the tool's output is a command you can run. The `$id$` structures it matches are the public crypt(3) and PHC formats. |
| `cyberchef_rsa_attack` | **RsaCtfTool** | MIT | Which attacks are worth trying against a public key. Fermat, Wiener, common-factor and small-e are textbook cryptanalysis; the BigInt implementations are written here. |
| `cyberchef_xor_key_length` | **xortool** | MIT | Index of coincidence as the scoring function for key length — see the findings log for why the obvious alternative is wrong. xortool's refusal to assume a most-common plaintext byte is followed too: `assumed_common_byte` has no default. |
| `cyberchef_crib_drag` | **cribdrag** (SpiderLabs) | GPL-3.0 | Three design choices, not code: every offset is reported rather than only the hits, candidates are *flagged* rather than sorted away, and the character-class test is anchored so one bad byte disqualifies a fragment. The `mod k` periodicity constraint is not from there — no published write-up of the technique states it. |
| `cyberchef_rsa_multi_key` | **RsaCtfTool**, Boneh's *Twenty Years of Attacks on the RSA Cryptosystem* | MIT / paper | Which multi-key attacks exist and their preconditions. The batch-GCD identity is Bernstein's (FactHacks); the BigInt and polynomial implementations are written here. RsaCtfTool's `common_modulus_related_message` is **not** followed — it returns early on `g == 1`, refusing the common coprime case. |
| `cyberchef_substitution_break`, `cyberchef_vigenere_break` | **Practical Cryptography** (James Lyons) | Method, not data | The hill-climbing parameters (swap two key letters, 1000 non-improving swaps, random restarts) and the Vigenere coset method. **No data was taken**: `english_quadgrams.txt` is not used and is not bundled — the trigram model is generated from this repository's own prose by `scripts/build-english-trigrams.mjs`. |
| `cyberchef_hash_crack` | **hashcat**, **RFC 1320** | MIT / IETF | Mode numbers for the follow-on advice, and MD4 from its specification. The MD4 implementation is written here because OpenSSL 3 moved MD4 to the legacy provider, so `createHash("md4")` throws. |
| `cyberchef_jwt_weakness` | **RFC 8725**, **jwt_tool**, PortSwigger | IETF / GPL-3.0 / prose | The checklist of what is checkable, and the boundary between what a token proves and what needs a server. No code. |
| `cyberchef_entropy_scan` | Lyda & Hamrock (IEEE S&P 2007), Mantovani et al. (NDSS 2020) | papers | The two-threshold packed-binary rule and its block size, and the calibration that says what an entropy of 7.0 actually means. |
| `cyberchef_classical_cipher` | ITU-T Recommendation S.1, Wikipedia, Christensen (NKU MAT/CSC 483) | standards / prose | The normative ITA2 table and the published Playfair and Polybius vectors, used as tests rather than as source. |

| Project | Licence | GPLv3-compatible | Source |
|---|---|---|---|
| **John the Ripper** | GPL-2.0-**or-later** | Yes — "or later" permits use under GPLv3 | <https://github.com/openwall/john> |
| **hashcat** | MIT | Yes | <https://github.com/hashcat/hashcat> |
| **pwntools** | MIT | Yes | <https://github.com/Gallopsled/pwntools> |
| **RsaCtfTool** | MIT | Yes | <https://github.com/RsaCtfTool/RsaCtfTool> |
| **xortool** | MIT | Yes | <https://github.com/hellman/xortool> |
| **cribdrag** | GPL-3.0 | Yes — same licence as this project | <https://github.com/SpiderLabs/cribdrag> |
| **jwt_tool** | GPL-3.0 | Yes | <https://github.com/ticarpi/jwt_tool> |

### Evaluated, and nothing taken

Four projects named in the integration plan turned out to duplicate capability this server already
has. They are listed because the plan says they were ported, and they were not:

| Project | Licence | Why nothing was taken |
|---|---|---|
| **katana** | GPL-3.0-or-later | Its useful core is auto-decode plus a flag regex. `Magic` already does the first, and the second is one recipe. It remains the reason the project is GPLv**3** rather than v2: the relicense was decided before this was measured, and is not being reversed. |
| **Ciphey** / **Ares** | MIT | Auto-decode search. CyberChef's `Magic` operation is the same idea, already exposed. Re-read as code for v3.3.0, and the finding is that their published intelligence does not run: Ciphey's A* searcher is never imported, and both of Ares' production call sites pass `&None` for the decoder heuristic. What they *do* contribute is a negative result — the boring pruning carries them — and that shaped `plaintext_check`. Still nothing taken. |
| **cryptii** | MIT | Its encodings have 26 equivalents among the 504 operations. |

### cyberchef-recipes — a note on scope

**<https://github.com/mattnotmax/cyberchef-recipes> ships no LICENSE file.** Absence of a licence is
not a grant; the default is all rights reserved. What is incorporated is therefore deliberately
narrow:

**Nothing from it has shipped yet.** The preset corpus is planned, not built, and this note records
the scope decided in advance so it is settled before any of it lands:

- **In scope:** the recipe *configurations* only — short functional JSON structures dictated
  entirely by CyberChef's operation grammar. Expression merges with function in the same way it
  does for a command line or a spreadsheet formula, so these are very unlikely to attract copyright.
  Each will be revalidated against CyberChef v11.4.0 before shipping, repaired where the operations
  moved on, and reworked into parameterised tools.
- **Out of scope:** the README prose and explanations (ordinary copyrightable authorship by five
  named contributors), the `screenshots/` and `logo/` images, and the `source_files/` sample data of
  unstated provenance. All descriptive text will be our own; all test fixtures generated.

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
