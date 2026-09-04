# Designing tools an agent can actually use

**Sources**, retrieved 2026-09-03:
[Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) ·
[Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)

**Why this file:** the evidence base for the v3.1.0 and v3.2.0 charters. Numbers here were measured
elsewhere, on other servers — that is exactly why v3.1.0 exists before v3.2.0.

## The findings that bear on this server

**Do not expose every endpoint.** Consolidate multi-step work into one tool the way a person would
divide a task. This server's `cyberchef_bake` is already that: one call runs an N-step recipe, and
it is why the `index` surface can pre-load 40 tools without losing reach.

**Token efficiency is a design property of the response, not of the protocol.**
- `response_format: concise | detailed` measured at **65%** reduction on one case (206 → 72 tokens)
  while keeping the identifiers a chained call needs.
- Paginate, filter and truncate by default. Claude Code caps tool responses at ~25,000 tokens.
- When truncating, **say how to narrow the request**. A truncated response with no guidance teaches
  the model to retry the same broad call.

**Error messages are instructions.** Replace codes with what to do instead — `filter='status:active'`
rather than a traceback. This server keys `ErrorSuggestions` by error code, so all 504 operations
share one suggestion per code; the v2.9.0 findings log deferred fixing that, and v3.2.0 carries it.

**Descriptions are onboarding documents.** Unambiguous parameter names, defined jargon, stated
formats. Small refinements measurably move benchmark scores. v2.10.0's curated argument
descriptions for `cyberchef_magic` were the first application of this here.

**Large catalogues are a solved problem, and the solution is discovery.** Tool search reports ~85%
token reduction with the full library still reachable, and raises accuracy (Opus 4.5, 79.5% → 88.1%).
This server's `index` surface plus `cyberchef_categories` → `cyberchef_list_operations` →
`cyberchef_describe_operation` is a hand-rolled version of the same idea.

## Evaluation methodology

The part this project does not yet do.

- Build tasks from **real workflows**, requiring many calls. "Find every log line for customer 9182
  charged three times, and determine whether other customers were affected" is a task; "search for
  `purchase_complete`" is not.
- Track: accuracy against ground truth, runtime, **tool-call count**, **token consumption**, error
  rate, redundant-call patterns.
- Read the agent's reasoning alongside the transcript, and pay attention to what it *omits*.
- Hold out a test set, or you tune into your own measurement.
