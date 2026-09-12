# Salvage manifest

Records of files rescued from `/tmp` into this repository. `/tmp` is wiped on reboot, so anything
here was one restart away from being lost.

---

## 2026-09-11 — v4.1.0: PQC instruments and two probes

**Source:** `/tmp/claude-1000/-home-parobek-Code-OSS-Public-Projects-CyberChef/9ec29099-.../scratchpad`

Curated by hand, **4 of 145** scratch files and **1 of 2** PEMs. The `tmp-salvage` script was run
only as a dry run: it proposed claiming all four session directories **wholesale (34.1 MB)** as
opaque units, because their parent path contains "cyberchef" -- the "large dirs claimed as units"
anti-pattern its own documentation warns about.

| Rescued to | What it is | Why it survived the cut |
|---|---|---|
| `docs/internal/measurements/pqc-oids.mjs` | Generates the ML-KEM / ML-DSA OID, SPKI and raw-public-key size table from keys Node itself produces | `AGENTS.md` states the `pqc_identify` table "came out of DER that Node 24 generated, not out of a specification read by eye" -- and **no committed file could reproduce it**. v4.4.0 needs it again: pkcs8 export defaults to seed-only on Node 26 |
| `docs/internal/measurements/pqc-slh-params.mjs` | The same for the twelve SLH-DSA parameter sets, plus signature sizes | Same instrument, different family |
| `docs/internal/measurements/data/pqc-ml-dsa-65-selfsigned.pem` | Self-signed **ML-DSA-65** certificate, `CN=pqc-test` | The evidence behind v4.3.0's claim that `cert_chain` validates PQC chains today with no new code path. Re-verified on salvage: `asymmetricKeyType: ml-dsa-65`, `verify(publicKey) === true` |
| `docs/internal/measurements/dump-tool-list.mjs` | Dumps a server's `tools/list` through a real client, server command from argv | Small, generic, reusable across builds |
| `docs/internal/measurements/entropy-split-rate.mjs` | Measures how often `entropy_scan` splits uniform random input | Reusable statistical probe -- **and it arrived broken**, see below |

**Not rescued, deliberately:** the matching ML-DSA **private key**. Preserved outside the
repository at `~/.local/share/cyberchef-mcp-salvage/` with a note. This repository commits zero
private keys -- every PEM in `tests/mcp/fixtures/` is a certificate -- and it is public, scanned by
Socket Security, Trivy and CodeQL. OpenSSL regenerates the pair in seconds.

**A salvaged script is not a verified script.** `entropy-split-rate.mjs` called `tool.run()` with a
raw object, skipping the Zod defaults that `handleCallTool` applies in production. `window` and
`step` were `undefined`, the scan loop produced zero windows, and **every** trial counted as a
split -- it reported exactly `100.00%`, and that figure was recorded without question. Measured
both ways over 40 trials: unparsed 40/40, parsed 1/40. Fixed, and the real rate over 400 trials is
**0.75%**. Reviewer-found, and the lesson is that a rescued file inherits none of the review its
destination directory implies.

**Deleted after salvage:** three dead session scratch trees (20 MB of coverage dumps, build logs,
`.preedit` snapshots whose successors are committed, PR bodies that live on GitHub, and a 1.6 MB
copy of another repository's README) plus 22 stale `npx` install caches.

---

## 2026-09-01 — v2.4.0 measurement harnesses

**Source:** `/tmp/claude-1000/-home-parobek-Code-OSS-Public-Projects-CyberChef/9ec29099-.../scratchpad`
**Destination:** `docs/internal/measurements/`
**Method:** curated manual copy, not `salvage.py --execute`.

### Why not the automated plan

The dry run found **2,028 candidates across 1.6 GB**, almost all of which should not be in a
repository. The skill's own guidance says the dry run is a starting point rather than a verdict,
and this was a clear case:

| Rejected | Size | Reason |
|---|---|---|
| `consumer*/`, `sdk2/`, `replay/`, `packtest/` | ~1.5 GB | `node_modules`-heavy test trees, regenerable |
| `up1140/` | 22 MB | **An upstream CyberChef v11.4.0 checkout.** Vendoring upstream source into this fork is the hygiene failure `patches/fork/` exists to prevent; it is also Apache-2.0 code freely available from GCHQ |
| 152 × `agy*.md` | small | Pull-request reply drafts, already posted and permanent on PR #100 |
| 4 × `/tmp/*.patch` | 200 KB | Working diffs of files committed since — superseded by git history |

### Salvaged — 15 scripts, 60 KB

`xor-proto.mjs` · `rule-eval.mjs` · `corpora.mjs` · `rsa-proto.mjs` · `rsa-tool-check.mjs` ·
`hash-check.mjs` · `hashprobe.mjs` · `cyclic-check.mjs` · `client-check.mjs` · `shapes.mjs` ·
`mkpatch.mjs` · `mkpatch09.mjs` · `mkpatch10.mjs` · `strip-test.mjs` · `verify-recipes.mjs`

These produced the numbers cited in `docs/internal/*-findings-log.md`. A measurement nobody can
re-run is an assertion with a number in it, which is the opposite of this project's stated
discipline — see `docs/internal/measurements/README.md` for what each one established.

**Modified on salvage:** six hard-coded an absolute home directory in their imports and would not
have run for anyone else. Rewritten to paths relative to the repository root, and each verified to
execute afterwards.

**Verified not to disturb any gate:** `docs/` is outside the ESLint targets, outside the coverage
include list, and outside the npm `files` allowlist, so none of this is linted, measured or shipped.

### Lost, and not recoverable

The **400-sample matrix harness** behind F-21 (the `DIVISOR_MARGIN` sweep) was written to the
repository root and deleted with `rm -f` rather than written to the scratch directory. It was not in
`/tmp` and could not be salvaged. Its results survive in the F-21 entry and in a comment beside the
constant; the script that produced them does not.

That loss is the reason this directory now exists.
