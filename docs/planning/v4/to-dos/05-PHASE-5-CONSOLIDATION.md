# Phase 5 — Consolidation (v4.9.0) and the v5.0.0 question

Charter: [`../charters/v4.9.0.md`](../charters/v4.9.0.md).

## Sprint 5.1 — Re-measure everything the documentation asserts

Not spot checks. Each of these has been wrong at least once, in a shipped release:

- [ ] Surface tuple — **measured through a real client**, not read from the canonical table. v3.8.0
      shipped an image serving 44,493 bytes while every document said 44,406, and four tests passed
      because they only compared documents to each other.
- [ ] Operation count — `check:versions` discovers its locations; confirm the discovery still finds
      them (coverage went 7 → 37 in v3.7.0 when a hand-written list was replaced).
- [ ] Test count and coverage tuple — re-run, do not carry forward. Both moved twice inside v3.9.0.
- [ ] Image size and package count, **with the counting method stated** — 402 by one method, 384 by
      another, and both are defensible answers to slightly different questions.
- [ ] Node version actually shipped in the image.

## Sprint 5.2 — Re-measure the carried-forward list

- [ ] Every item, against the running server. Two consecutive releases found items whose stated
      obstacle had **evaporated**: arm64 "needs hardware" while the repo already used that hardware,
      and task-level scoring blocked on a document nobody had written.
- [ ] The entry-point refactor (F-13) should be gone by now — if it is still listed, ask why.
- [ ] Shell-free base image: re-measure `cgr.dev/chainguard/node:latest-slim`. Declined three
      releases running at Node v25.9.0 against a shipped v26.8.x.
- [ ] **Recipe dispatch runs outside the `OPERATION_TIMEOUT` contract** — added v4.2.0, from a
      CodeRabbit finding on PR #141. `recipeManager.*` calls are not wrapped in
      `executeWithTimeoutAndRetry`, so a stalled recipe can keep `tools/call` pending past the
      configured timeout. **Pre-existing, not introduced by the consolidation** — verified against
      `0d227d9d`, where the ten branches called `recipeManager` directly too — which is exactly why
      it was declined there: v4.2.0's contract is that no behaviour changes, and adding a timeout to
      ten handlers changes behaviour. It belongs in a release that can say so. `maxRetries: 0` is
      the right shape when it happens, since recipe writes are not idempotent.

      **Two facts measured while declining it, including the one that argues against the decline.**
      The exposure is real and specific: `executeRecipe` calls `bake(input, bakeRecipe)` from the
      Node API directly — not through `bakeOnCore`, not through the worker pool — so nothing bounds
      it. And `cyberchef_bake` **is** wrapped, at `mcp-server.mjs:1146`, running the same kind of
      work: the identical recipe submitted inline already stops at `OPERATION_TIMEOUT` while the
      saved-recipe path runs forever. That inconsistency is the strongest argument for just doing
      it, and it is recorded here rather than left out because it was inconvenient.

      What the release that does it must measure first: `OPERATION_TIMEOUT` defaults to **30s**, and
      no one has measured how long real saved recipes take. A caller using `recipe_execute` on a
      large input today has no cap; giving them one is correct, and it will also be the first time
      their working deployment starts failing at 30 seconds. That needs to be announced, not slipped
      into a consolidation release — which is the whole of the disagreement with the two reviewers
      who raised it, one of them blocking. Neither is wrong about the defect.

## Sprint 5.3 — Retire dead planning

- [ ] Any charter measurement has killed: archive with a dated banner naming what replaced it.
      Never delete — a reader who finds no trace assumes it was never considered.
- [ ] Check `docs/planning/v4/` has not grown into what `v3` was written to prevent.

## Sprint 5.4 — The v5.0.0 decision

- [ ] Apply the same criterion v4.0.0 uses: **a major exists because the protocol or the ecosystem
      forced one.** If nothing forced it, ship v4.10.0 and say so.
- [ ] If a major *is* warranted, note that a major **renames the image**: `mcp-release.yml` derives
      the GHCR package from the tag's major, so `values.yaml` `image.repository`, the compose
      `image:` line, `server.json` `identifier` and ~40 documents all move to `_v5`. At v3.0.0 the
      chart paired an un-bumped repository with a bumped tag and resolved to an image that would
      never be pushed, while `check:versions` reported ok. It now asserts the major too.

## Done when

Every asserted figure has been re-measured this release, or the release is folded into an open minor
because nothing needed consolidating.
