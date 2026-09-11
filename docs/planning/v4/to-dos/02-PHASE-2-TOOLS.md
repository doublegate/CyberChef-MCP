# Phase 2 — The tool programme (v4.3.0–v4.5.0)

Charters: [`v4.3.0`](../charters/v4.3.0.md) (statistics across inputs),
[`v4.4.0`](../charters/v4.4.0.md) (the ones with a cost),
[`v4.5.0`](../charters/v4.5.0.md) (magic scoring).

> **Rewritten 2026-09-11**, on research retrieved the same day. The predecessor scoped
> `ext-proj-int` at *"80–120 tools, 24 weeks"*. Both halves of that are now measured to be wrong:
> the cadence is **12 releases in 9 days**, and **80–120 more registry tools would make the index
> cost more than `curated`** — which is why Phase 1 exists and why this phase does not start
> before it lands.

---

## Sprint 2.0 — The gate that must exist before any tool is added

- [ ] **Confirm Phase 1 actually flattened the curve.** Add a registry tool stub, measure the index,
      remove it. If the index moved, Phase 1 did not do what it claimed and this phase stops.
- [ ] Re-run the three-gap bar against each candidate **in writing**, before code. The bar is: a
      loop with a decision inside it; a statistic computed across inputs; a primitive upstream
      lacks. Anything expressible as `run(input, args)` over one input is an upstream operation.
- [ ] **Any borrowed or ported algorithm is recorded in `THIRD-PARTY-NOTICES.md` in the same
      change** — the mechanism already exists and is gated by `registry-tool-docs.test.mjs`. The
      entry names the work, its copyright holder, its SPDX identifier and its source URL, matching
      the table format already in that file. Ported code additionally carries, **at the port site**,
      an `SPDX-License-Identifier` and a provenance comment naming the source project, the file and
      the **commit** it came from: "derived from the published method" and "copied from this
      function" are different acts with different obligations, and six months later nothing in the
      tree distinguishes them unless the port said so at the time. Choosing a permissively licensed
      reference (Sprint 2.2) settles *whether* a port is allowed; this settles what the port owes.

## Sprint 2.1 — Verify what is already there, because three candidates died that way

Ten minutes of checking killed three obvious proposals. Do this first, every time:

- [ ] `grep src/core/operations/` for the capability before scoping it. Verified dead already:
      **YARA** (`YARARules.mjs` ships), **schemaless protobuf** (`ProtobufDecode.mjs` ships with an
      optional schema), **file carving** (`ExtractFiles.mjs`, `ScanForEmbeddedFiles.mjs`).
- [ ] Check what ships but is **too narrow**, which is where the real gaps were: SSDEEP/CTPH compare
      is **strictly pairwise**; `Extract LSB` extracts but there are **zero statistical detectors**;
      `YARARules` returns **a string**, not structured matches.

## Sprint 2.2 — v4.3.0, no new dependencies

In confidence order, each shipping with its refusals tested as carefully as its answers:

- [ ] `beacon_analyze` — periodicity, period, jitter over N timestamps. Both reference formulas are
      published; implement one, cite it, and state which.
- [ ] `password_corpus` — mask topology, coverage, reuse. **Derive only from PACK (BSD-3) or cpack
      (MIT)** — pipal is CC-BY-SA and HashMaster1000 is CC BY-NC, neither safe for GPL-3.0.
- [ ] `pqc_readiness` — corpus classification, chain-level weakest-link risk, CycloneDX CBOM output.
      Lead with risk ranking; an exhaustive CBOM can be stale before it finishes.
- [ ] `prng_recover` — MT19937, Java LCG, bash, glibc, PHP. Scope out the Z3-dependent cases.
- [ ] PQC **verification** in `cert_chain` / `pqc_identify`. Verified to work today with no new code
      path; this is an extension, **not** a twentieth tool, and must not be counted as one.

## Sprint 2.3 — v4.4.0, where a cost is accepted deliberately

- [ ] `yara_scan` — **memory first, function second.** `@virustotal/yara-x` objects live in the WASM
      heap and must be `.free()`d; a leak in a long-lived server is not a performance note. If
      `.free()` cannot be made reliable at the tool boundary, the charter's kill criterion fires.
- [ ] `archive_bomb` — depth, ratio and entry walk **without materialising**. Cite node-tar's
      `maxDecompressionRatio` default of 1000 rather than inventing a constant. Report shape; do not
      claim detection.
- [ ] `fuzzy_cluster` — all N(N-1)/2 pairs over hashes already computed in-tree, plus TLSH, absent
      from CyberChef entirely.
- [ ] `steg_detect` — chi-square / RS / SPA, then corpus ranking. **Weakest evidence in the phase**;
      if the corpus cannot be labelled without encoding assumptions, stop and say so.
- [ ] Node 26 natives, each with a **before/after number**: `Uint8Array.fromBase64`/`toBase64`/
      `fromHex`/`toHex`, `crypto.argon2` for `hash_crack`, `crypto.hash()` in corpus loops.
- [ ] **Re-extract `pqc_identify`'s OID/size table.** ML-KEM/ML-DSA pkcs8 export defaults to
      **seed-only on Node 26** — the same key exports differently than on 24, and that table was
      built from Node-generated DER.

## Sprint 2.4 — v4.5.0, magic scoring

- [ ] Corpus with known answers, generated where possible.
- [ ] Publish an accuracy figure **with the corpus**, so it can be disputed.
- [ ] Gate calibrated with a noise floor and a detection curve, not one plausible run.
- [ ] Ranking changes only after the figure exists, each justified by movement in it.

---

## Definition of done for the phase

```text
index            unchanged by every tool added -- the Phase 1 claim, re-proven each time
every tool       three-gap bar argued in writing before code
every tool       refusals tested as carefully as answers
borrowed code    recorded in THIRD-PARTY-NOTICES.md, SPDX + provenance at the port site
magic            has a published accuracy figure and a gate that can fail
image size       re-measured; 453 MB today
```

## What this phase must not do

- **Start before [v4.1.0](../charters/v4.1.0.md) lands.** The measurement says the surface runs out
  at 59 registry tools. The gate is **v4.1.0 specifically, not all of Phase 1** — Phase 1 is
  v4.1.0 *and* v4.2.0, and v4.2.0 is a dispatch consolidation that no charter here depends on.
  Writing "Phase 1" over-gated this phase by one release.
- **Count an extension as a tool.** PQC verification extends two existing tools.
- **Build lattice work as though it were cheap.** An LLL exists on npm; an *industrial* reduction
  does not, and that is the constraint. See the charter.
- **Add an emulator.** Running untrusted shellcode in-process is a posture change, not a feature.
