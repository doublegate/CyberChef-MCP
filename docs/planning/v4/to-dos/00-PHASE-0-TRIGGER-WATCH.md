# Phase 0 — the standing trigger watch

**Not a sprint.** A recurring check, because v4.0.0 is defined by an event that has not happened and
the difference between a plan and a wish is whether anyone can tell it has come true.

## Cadence

Once per release, as part of the RE-MEASURE pass. Not on a calendar — calendars produced the
36,700-line corpus.

## The checks, each concrete enough to answer yes or no

| # | Observation | How to check | Last measured |
|---|---|---|---|
| T-1 | The draft spec has accumulated changes | `https://modelcontextprotocol.io/specification/draft/changelog` is non-empty | **2026-09-10: EMPTY** |
| T-2 | A revision after 2026-07-28 is Current | `/specification/versioning` names a later date | 2026-09-10: still 2026-07-28 |
| T-3 | Tasks (SEP-2663) entered core | SEP marked `final` **and** present in a revision, not only in an extension | 2026-09-10: extension, tracking issue closed 2026-08-23 |
| T-4 | Result contracts standardised | SEP-2419 `final`, or a result-envelope SEP in the changelog | 2026-09-10: open, updated that day |
| T-5 | Progressive discovery has a SEP number | search the SEP label; today it has none | 2026-09-10: "proposed, design phase", no number |
| T-6 | `securitySchemes` standardised | SEP-1488 `final` | 2026-09-10: open, updated that day |
| T-7 | Audit context standardised | SEP-2817 or SEP-3004 `final` | 2026-09-10: both open, updated that day |
| T-8 | SDK moved | `@modelcontextprotocol/server`/`node`/`client` past 2.0.0 | 2026-09-10: all 2.0.0 |
| T-9 | Conformance suite moved | `@modelcontextprotocol/conformance` past 0.2.0-alpha.11 | 2026-09-10: unchanged |
| T-10 | `server.json` schema moved | a dated schema later than 2025-12-11 resolves | 2026-09-10: 2025-12-11 newest |
| T-11 | A published, versioned MCP eval benchmark exists that this project could **consume** rather than build | search npm and the SDK org; it must carry its own stability characterisation | 2026-09-10: not checked this pass — **do it next** |
| T-12 | A model API offers reproducible sampling with a stated guarantee | provider documentation | 2026-09-10: none known |

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

## The rule

**If no trigger has fired, do not open a v4.0.0 branch.** Ship the next minor. Record the
measurement in that release's findings log so the next reader sees a date rather than a silence.
