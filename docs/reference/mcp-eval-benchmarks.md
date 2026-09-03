# Benchmarks for MCP tool use

**Sources**, retrieved 2026-09-03: [MCP-Bench](https://arxiv.org/pdf/2508.20453) ·
[MCP-Atlas](https://arxiv.org/abs/2602.00933) ·
[MCPToolBench++](https://arxiv.org/pdf/2508.07575)

**Why this file:** reference designs for the v3.1.0 harness. Read these before building one — the
charter's first kill criterion is that the ecosystem may already cover this.

## The three, and what each is for

**MCP-Bench** — 104 tasks over ~250 tools from production MCP servers, with tasks synthesised
automatically and phrased *fuzzily*, so the agent must work out which tools apply rather than being
told. Scores structural coherence, dependency awareness, parallelism and reflective adaptation.
The closest in spirit to what this server needs: a large catalogue where tool *selection* is the
hard part.

**MCP-Atlas** — 1,000 human-written and human-verified tasks across 36 servers and 220 tools, scored
against a **claims-based rubric**: each task defines the factual claims a correct answer must
contain, giving partial credit. The most interesting property for this project, because a CyberChef
answer is frequently partially right — the right decoding via a clumsier route.

**MCPToolBench++** — multi-domain, with AST and DAG accuracy, Pass@K and tool-call success rate.
Useful for the mechanical half: did the call even have the right shape.

## What to take, and what not to

Take: fuzzy task phrasing, claims-based partial credit, and separating *selection* accuracy from
*execution* accuracy. On a 504-operation catalogue those fail differently and a single score hides
which one moved.

Do not take: the absolute numbers. These benchmarks measure models against ecosystems, and this
project needs to measure *its own surface changes* against a fixed model. Different question.

## Caveat worth carrying

There is published work auditing the validity of tool-calling benchmarks
([Benchmarking the Benchmarks](https://arxiv.org/pdf/2607.02577)). Before this project gates a
release on a number, it should be able to say what the number would fail to notice.
