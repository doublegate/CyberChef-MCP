# Conformance

The official MCP conformance suite, run against this server as an **external oracle**.

```bash
npm run conformance
```

Starts the server on a free port over Streamable HTTP, runs
[`@modelcontextprotocol/conformance`](https://www.npmjs.com/package/@modelcontextprotocol/conformance)
for both protocol eras against [`expected-failures.yaml`](expected-failures.yaml), and exits
non-zero if anything does not match. It runs in `core-ci.yml` on the Node 26 leg.

## Why this exists

Every test in `tests/` was written in this repository. That makes them a check that the server does
what its authors believe — not that it does what the specification says. Module 20's rule is that
accuracy-critical behaviour is verified against an independent oracle, and **v3.0.0 shipped "MCP
2026-07-28 conformance" verified entirely by its own tests.**

The suite had scenarios for the exact SEPs that release implemented — `caching` for SEP-2549,
`sep-2164-resource-not-found`, `server-stateless` for SEP-2575 — published four weeks earlier.
Nobody looked. On its first run it found a real defect (v3.1.0 findings log F-03), of a kind the
1,426 in-tree tests could not find: they assert the shape this server was written to produce, and
only an independent encoding of the spec asks the question the other way round.

## What it confirms

```text
2026-07-28   96 passed, 31 baselined
2025-11-25   45 passed, 23 baselined
```

The ones worth naming, because they are v3.0.0's work checked by someone else's code:

| Scenario | Result | Covers |
|---|---|---|
| `caching` | 7/7 | SEP-2549 `ttlMs`/`cacheScope` on all five list methods, non-negative integers, valid scopes |
| `server-stateless` | 26/28 | SEP-2575 `_meta` validation, `server/discover`, capabilities matching handlers, unsupported-version error |
| `http-header-validation` | 14/14 | SEP-2243 `Mcp-Method`/`Mcp-Name`, `-32020` HeaderMismatch, header-name case handling |
| `sep-2164-resource-not-found` | 4/4 | The error code, the absent empty `contents`, and the `data.uri` SHOULD this release fixed |

## The baseline, and why it is a baseline

Most failures are the harness calling the SDK reference server's own fixtures — `test_simple_prompt`,
`test://static-text`, a tool that returns an image. No server with its own surface can pass those.

The obvious response is to run only the scenarios that apply. That is the wrong shape: the list
gets written once and never revisited, and a scenario added by a later release never runs at all.

`--expected-failures` inverts it. Everything runs, every non-applicable result is recorded **with a
reason**, and the run fails when a baselined entry starts passing — reported as a *stale baseline
entry*. A reason that stops being true becomes a red build instead of a silence. That is the same
property `scripts/check-version-consistency.mjs` was built for in v2.10.0, where a pattern matching
nothing is itself a failure.

Nothing in the baseline is a deferred defect. The one real defect the suite found was fixed, not
baselined.

Three reasons appear there:

1. **Reference-server fixtures** — the scenario names a prompt, resource or tool only the SDK's own
   test server ships.
2. **Capability deliberately not declared** — `completions`, `logging`, `resources.subscribe`.
   `SERVER_CAPABILITIES` lists `tools`, `prompts` and `resources`, the capability gates the method,
   and `-32601` is the correct answer. The scenarios test the method unconditionally.
3. **SEP-2322 input-required results** — never produced, because every operation here is a pure
   function of its arguments and there is no point at which the server has a question for the
   caller. A server that never asks trivially complies; the scenarios need a fixture tool built to
   ask. Same reasoning as the tasks/extensions decision in v3.0.0.

## Adding to the baseline

Only with a reason, in prose, saying which of the three it is. If the answer is "because it fails",
it is a defect and belongs in `tests/` with a fix.

## Two things to know about the harness

- **The pending suite is where the new scenarios live.** `--suite active` excludes it, and it is
  where `caching`, `server-stateless` and `sep-2164-resource-not-found` sit — running only `active`
  would skip every scenario that validates v3.0.0. The runner passes `--suite all`.
- **Its summary and its baseline check disagree about warnings.** A `WARNING` counts as passed in
  the printed totals and as a failure for the baseline. Two entries here exist only because of that
  and say so.
