# v4 planning

**Written 2026-09-10, immediately after v3.9.0.** Entry point for everything in this directory.

## Read this before adding anything here

The v2-era planning corpus reached **62 files and ~36,700 lines**, written almost entirely in one
month, and was largely wrong within two releases — not because it was careless, but because it
described a server that was then built differently. `docs/planning/v3/RE-MEASURE.md` records the
score: **seven consecutive releases** opened by measuring the plan against the running server, and
**every one found the plan wrong**. v3.9.0 made it eight, in a new way — it had no plan at all.

So this directory is deliberately shaped against that failure:

| | |
|---|---|
| **One measured plan** | `v4.0.0-plan.md` — long, evidence-first, and it currently concludes **do not cut v4.0.0 yet** |
| **Nine thin charters** | `charters/v4.1.0.md` … `v4.9.0.md` — one page each: intent, candidate scope, **measurable trigger**, kill criteria |
| **Phase/sprint checklists** | `to-dos/` — execution structure, filled in when a charter is actually taken |

Every charter carries a **trigger** (the observation that would make it real) and **kill criteria**
(the observation that would make it dead). A charter with neither is a wish, and wishes are what
produced the 36,700 lines.

## The rules that govern this directory

1. **No charter may be executed without the `../v3/RE-MEASURE.md` pass first.** That ritual is not
   v3-specific; it is the project's, and it stays where it is rather than being copied here, because
   two copies of a ritual diverge.
2. **A charter that is measured and found dead gets archived with a dated banner naming what
   replaced it** — never deleted. The reasoning is the useful part, and a reader who finds no trace
   of a plan assumes it was never considered.
3. **Order is not commitment.** The numbering is a reading order, not a schedule. Charters will be
   executed out of order, merged, or dropped as measurement dictates; v3 executed its charters out
   of order twice and was right to.
4. **A release is cut when work is done, not when a number comes up.** v2.x ran to eleven minors and
   was better for it.

## Why there are exactly nine

Because nine was asked for, and that is worth stating plainly rather than implying the number came
from analysis. What *did* come from analysis is their **content**: each is grounded in something
already measured — an item on the carried-forward list, a defect recorded in a findings log, a
programme already scoped in `../ext-proj-int/`, or a live SEP with a number and a date.

None of them invents a capability. If a charter here looks speculative, it has failed its own
standard and should be archived rather than executed.

## Contents

```text
v4.0.0-plan.md          the measured plan, and why v4.0.0 is not scheduled
charters/
  v4.1.0.md   entry-point refactor -- the F-13 defect, which needs its own release
  v4.2.0.md   ext-proj-int phase 1
  v4.3.0.md   ext-proj-int phase 2
  v4.4.0.md   arm64 from reporting to gating
  v4.5.0.md   tool result contracts (SEP-2419 and successors)
  v4.6.0.md   auth metadata and mixed-auth surfaces (SEP-1488)
  v4.7.0.md   progressive discovery, if it standardises
  v4.8.0.md   audit and invocation context (SEP-2817, SEP-3004)
  v4.9.0.md   consolidation before a major
to-dos/
  00-PHASE-0-TRIGGER-WATCH.md    the standing watch, and what each trigger looks like
  01-PHASE-1-FOUNDATION.md       v4.1.0 -- sprint breakdown
  02-PHASE-2-TOOLS.md            v4.2.0-v4.3.0 -- the ext-proj-int programme
  03-PHASE-3-MEASUREMENT.md      v4.4.0
  04-PHASE-4-PROTOCOL.md         v4.5.0-v4.8.0
  05-PHASE-5-CONSOLIDATION.md    v4.9.0 and the v5.0.0 question
  DECISION-GATES.md              every kill criterion in one table
```
