# Task-level scoring: the design, and why it is not built

**Written 2026-09-04, for v3.8.0.** This is the document the charter required before any code:

> **Task-level scoring (v3.2.0 Track C)** was not started, and its objection is unanswered: it
> needs a model in the loop, an API key in CI, and a number that moves when the model changes.
> The design must survive "must not be a flaky gate" **in writing** before any code.

It does not survive. The reasoning is below, along with what *is* worth building instead and the
conditions under which this should be reopened.

Recording a decision not to build is the point of the exercise. An item that sits on a
carried-forward list for six releases because nobody wrote down why it is hard is not deferred, it
is merely unexamined.

## What was wanted

Every tool-quality claim in this project is asserted rather than measured. The tool descriptions say
what a tool is for, the surface work says an index is cheaper than 545 schemas, and the registry
tools each claim to fill a gap an operation cannot. None of that is verified against a model
actually using them.

Task-level scoring would close that: a held-out set of tasks, run through a model with this server
attached, scored on accuracy, tokens consumed, tool calls made, and error rate. Anthropic publishes
the methodology; MCP-Bench and MCP-Atlas are reference designs.

The value is real. A measurement would settle, rather than assert, whether the 42-tool index helps
or hurts selection against the 545-tool surface.

## Why it cannot be a gate

### The variance is in the model, and the model is not ours

A gate needs a threshold, and a threshold needs to sit above the noise. Here the noise has three
independent sources, and this project controls none of them:

1. **Sampling.** At any temperature above zero the same task produces different trajectories. At
   temperature zero it is *more* reproducible, not reproducible — batching, hardware and
   floating-point non-associativity all move token-level decisions.
2. **Model version.** The score moves when the model changes, for reasons entirely unrelated to
   this repository's code. This is the failure the benchmark work spent three releases on, in a
   worse form: there, the confounder was which machine CI landed on; here it is a dependency that
   is updated by someone else, on their schedule, with no version this project pins for long.
3. **Deprecation.** Pinning a model version defers (2) at the cost of eventually gating on a model
   nobody uses, which measures the wrong thing with high precision.

### The trick that rescued the benchmark gate does not transfer

The obvious rescue is the one that worked in v3.5.0–v3.6.0: stop comparing across the confounder,
and measure both sides *inside one run*. Benchmark the merge base and the head on the same runner,
and host variance cancels.

**It does not cancel here, and the reason is worth being precise about.** Host speed is a *shared
multiplicative factor*: within one job both sides experience the same machine, so the ratio between
them is nearly free of it — measured at roughly a tenfold tightening, -42% to -2.0% on the task that
motivated the work.

Model sampling noise is *independent per invocation*. Running the base and the head against the same
model in the same job gives each side its own independent draws. Nothing cancels. The difference of
two noisy binomials is noisier than either, so the same-host construction makes the comparison
**worse**, not better.

That is the technical heart of it: the tool this project built to solve exactly this shape of
problem is inapplicable, for a reason that is a property of the noise rather than of the
implementation.

### Averaging is the remaining option, and it is expensive in the wrong currency

Variance can be beaten down with trials. Scoring is per-task pass/fail, so the quantity being
estimated is a proportion, and its standard error falls as `1/sqrt(n)`. To resolve a 5-percentage-
point regression on a 100-task set with any confidence needs repeated trials per task — call it
five, conservatively.

```text
100 tasks  x  5 trials  x  2 sides (base and head)  =  1,000 model invocations per pull request
```

Each of those is a multi-turn agentic trajectory, not a single completion. The cost is real money
per pull request, a rate limit that will be hit, and a CI job measured in tens of minutes — for a
gate that still cannot separate a 3-point drift from a model update.

And the API key has to live in CI, reachable from a job that runs pull-request code. This repository
went to some trouble to *remove* a long-lived credential from the release path in v3.5.0, replacing
a stored registry token with GitHub OIDC. Adding a model API key to a job that executes contributor
code is a step in the opposite direction, for a benefit that is a number nobody can act on.

### Every stable variant measures something else

The designs that *are* deterministic all drift away from the question:

| Stable alternative | What it actually measures |
|---|---|
| Assert every tool has a valid schema | Already done — `stdio-client-contract.test.mjs` |
| Assert descriptions fit a length budget | Surface shape, not model success. Partly done |
| Measure `tools/list` payload per surface | Cost, not benefit — `npm run measure:surfaces` |
| Assert every operation is reachable by navigation | Reachability, which is a precondition, not an outcome |
| Score a fixed transcript against a rubric | The rubric's opinion, held constant, learning nothing new |

Each is worth having and several exist. None of them answers "does a model do better with this
server than without it", which is the question that made task-level scoring attractive.

## What is built instead: nothing, deliberately

The honest position is that this project can measure the **cost** side precisely — payload bytes,
tool counts, startup time, throughput — and cannot measure the **benefit** side without taking on a
non-deterministic dependency it does not control. Both halves being measurable would be better.
Half being measured honestly is better than both being measured badly.

The existing tool-quality claims stay claims, and should be read as such. Where this project asserts
that a tool is useful, that is a design argument supported by the gap it fills, not an experimental
result — and the tools' own outputs are written to say what they rest on for the same reason.

## What would reopen this

Specific, checkable conditions rather than a vague "revisit later":

- **A published, versioned benchmark this project can consume rather than build**, with its own
  stability characterisation. Running someone else's harness against this server occasionally,
  out-of-band, is a different and much cheaper proposition than gating on one.
- **A model API that offers reproducible sampling with a stated guarantee**, which would remove
  source (1) entirely and make (2) a version-pinning question rather than a statistical one.
- **Evidence that the index surface is actively harmful.** The measurement is attractive because it
  would confirm a design decision; if the decision is ever contested by a user report, the cost of
  finding out changes.

Until one of those, this stays unbuilt and — importantly — **off the carried-forward list**. It is
not deferred pending effort. It is declined, with reasons, and the reasons are here to be argued
with.
