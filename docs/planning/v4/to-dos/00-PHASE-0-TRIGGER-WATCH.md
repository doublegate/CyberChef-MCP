# Phase 0 — the standing trigger watch

**Not a sprint.** A recurring check, because most of what remains in this line is defined by events
that have not happened, and the difference between a plan and a wish is whether anyone can tell it
has come true.

> **Updated 2026-09-11, after v4.0.0 shipped.** This file used to open by saying v4.0.0 was defined
> by an event that had not happened. It shipped anyway — on **T-13**, the internal trigger added at
> the bottom of the table, because every other trigger here is an event somebody *else* has to cause.
> That is the correction worth carrying forward: a watch made entirely of external triggers can only
> ever tell you to wait.
>
> T-1 through T-12 still govern the **Watch** charters (v4.6.0–v4.9.0). T-13 governs whether a major
> is due on this project's own terms, and it now runs in `scripts/check-v4-triggers.mjs` alongside
> the rest.

## Cadence

Once per release, as part of the RE-MEASURE pass. Not on a calendar — calendars produced the
36,700-line corpus.

## The checks, each concrete enough to answer yes or no

| # | Observation | How to check | Last measured |
|---|---|---|---|
| T-1 | The draft spec has accumulated changes | `https://modelcontextprotocol.io/specification/draft/changelog` is non-empty | **2026-09-10: EMPTY** |
| T-2 | A revision after 2026-07-28 is Current | `/specification/versioning` names a later date | 2026-09-10: still 2026-07-28 |
| T-3 | Tasks (SEP-2663) entered core | SEP `final` **and** present in a revision, not only in an extension | **2026-09-11: Final since 2026-05-15, but as the `ext-tasks` EXTENSION.** Roadmap says work continues "toward eventual inclusion in the core protocol". Not core. Open gap: issue #3237 — no interoperable surface for partial output of a running task |
| T-4 | Result contracts standardised | a result-shape SEP reaches `final` | **2026-09-11: CORRECTED.** This row named SEP-2419, which is `cache_hint` in `CallToolResult._meta` and has nothing to do with result shape. **No result-shape SEP exists**; the roadmap assigns it to a Core Primitives WG that is not chartered. Watch **SEP-2145** (failure reporting, `in-review`), SEP-2998, SEP-3279 |
| T-5 | Progressive discovery has a SEP number | search the SEP label | **2026-09-11: worse than "none" — four attempts are closed.** SEP-1862 closed **unmerged 2026-09-02**, SEP-1928 `dormant`, SEP-1300 `rejected`, SEP-1881 closed. Live work sits in an Interest Group with no authority. This is why [v4.1.0](../charters/v4.1.0.md) builds it privately |
| T-6 | `securitySchemes` standardised | SEP-1488 `final` | 2026-09-11: open issue, `draft`, ~12 months old, purely additive if it lands |
| T-7 | Audit context standardised | SEP-2817 or SEP-3004 `final` | 2026-09-11: both open at `proposal`; 2817 still **seeking a sponsor**, 3004 has no sponsor and no WG |
| T-8 | SDK moved | `@modelcontextprotocol/server`/`node`/`client` past 2.0.0 | 2026-09-10: all 2.0.0 |
| T-9 | Conformance suite moved | `@modelcontextprotocol/conformance` past 0.2.0-alpha.11 | **2026-09-11: version unchanged, but the REPO is the most active in the org** — commits today, including a deterministic `tools/list` ordering check. The next bump is release-sized |
| T-10 | `server.json` schema moved | a dated schema later than 2025-12-11 resolves | 2026-09-10: 2025-12-11 newest |
| T-11 | A published, versioned MCP eval benchmark exists that this project could **consume** rather than build; it must carry its own stability characterisation | search npm and the SDK org | **2026-09-11: checked properly, still no.** Every published benchmark scores an *agent using* a server, not the server. The one built for this exact use case (`mcpbr`) calls a regression "passed in one baseline run, fails in one current run" with an LLM in the loop and **no variance study** — the mistake this project's benchmark gate already paid for twice |
| T-12 | A model API offers reproducible sampling with a stated guarantee | provider documentation | 2026-09-10: none known |
| **T-13** | **Accumulated removals** — surface still advertised to callers that describes a migration completed, withdrawn, or decided against | `npm run check:v4-triggers` (offline; reads `src/node/`) | 2026-09-11: **fired, and v4.0.0 was cut on it**; now none |

**T-13 is the one that was missing from the whole DESIGN, not just from this file.** T-1 to T-12
are every one of them external events: a specification revision, an SEP going final, a package
version moving. So a major could only ever be forced by somebody else — and while the project
waited, deprecated surface accumulated with no mechanism able to remove it, because removal is
breaking and breaking requires a major. v4.0.0 was cut on T-13 in September 2026, retiring the
v2.0.0 migration tooling that had been advertised on every surface for nine minors. A major is not
only a response to someone else's break; it is also how a project retires its own past.

**T-11 and T-12 were missing from the first version of this file**, which is worth recording rather
than quietly fixing. `../v3/task-level-scoring.md` is the one item this project declined **with
written reopening conditions**, and neither condition had a watch entry — so the single decision most
explicitly marked "revisit when X" had no mechanism to notice X. Its third condition ("evidence that
the index surface is actively harmful") is deliberately absent here: it arrives as a user report, not
as something to poll.

```bash
# T-8, T-9 in one line
for p in @modelcontextprotocol/server @modelcontextprotocol/node \
         @modelcontextprotocol/client @modelcontextprotocol/conformance; do
  printf '%-40s %s\n' "$p" "$(npm view "$p" dist-tags --json | jq -c .)"
done
```

## Two extensions that ARE moving, while the specification is not

Neither has a trigger row, because neither forces anything on this server. Both are worth a glance
per release, because "nothing moved" is true of the *protocol* and false of the *ecosystem*:

- **SEP-2640, Skills** — the most active extension in the ecosystem. `skill://` resource convention
  under `io.modelcontextprotocol/skills`; reference implementations landed in the TypeScript, Python,
  C# and Go SDKs; **Inspector shipped support 2026-09-05**; **conformance added skills scenarios on
  2026-09-11**, the day of this measurement. The SEP itself is still open. Watch whether it graduates
  — a server with 504 operations and six prompts has an obvious relationship to a skills convention,
  and it is better to form a view early than to be asked after it lands.
- **SEP-2127, Server Cards** — `in-review`, a static `GET <url>/server-card` metadata document with
  its own experimental repo and a graduation plan. This server already publishes `server.json` to
  the official registry; a second metadata surface would need a reason, and the reason should be
  written down before it is adopted rather than after.

## The UPSTREAM watch, which is a different question

T-1 to T-13 watch the protocol and this project. Upstream CyberChef moves on its own schedule and
the sync is where its changes arrive. Checked 2026-09-11:

- **Upstream is still v11.4.0** (2026-08-18), the base this fork sits on. Nothing cut since.
- **Unreleased on `master`, and one of them matters to this server specifically:**
  **`fix: treat numeric 0 input as a value, not an empty dish, in the Node API` (#2759).** That is a
  **Node-API behaviour change on the bake path** — exactly the surface `bakeOnCore` sits on. It
  needs a targeted test written *before* the sync lands it, not after.
- `Parse PGP Key` (#2734) is a new operation; `PEM to JWK` gained an opt-in RFC 7638 `kid` (#2771).
  Both move the operation count, which `check:versions` discovers across 37 locations.
- **Open PR #2020 adds Kaitai Struct decoding.** Worth watching rather than acting on: if it lands,
  schema-driven binary parsing gets a real substrate upstream, which changes what a structural
  analysis tool here would need to do for itself.
- **JWT is being reworked upstream from three directions at once** (#2454, #2648, #2782, #2473),
  including an expected-algorithm pin. That changes what "weakness" means for `jwt_weakness`.

The sync mechanism already fails loudly when a `patches/fork/*.patch` stops applying. It does
**not** notice a behaviour change inside a function whose signature is unchanged, which is what
#2759 is.

## The rule

**If no trigger has fired, do not open a major branch.** Ship the next minor. Record the measurement
in that release's findings log so the next reader sees a date rather than a silence.

Updated 2026-09-11: that rule used to say "do not open a v4.0.0 branch", which read as being about
one release. It is about every major, and **T-13 is now one of the triggers it applies to.**
