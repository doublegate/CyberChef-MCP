# v4 planning

**Rewritten 2026-09-11, immediately after v4.0.0 shipped.** Entry point for everything here.

## Read this before adding anything

The v2-era planning corpus reached **62 files and ~36,700 lines**, written almost entirely in one
month and largely wrong within two releases — not through carelessness, but because it described a
server that was then built differently. `../v3/RE-MEASURE.md` keeps the score: **nine consecutive
releases** opened by measuring the plan against the running server, and every one found the plan
wrong. v4.0.0 made it ten, in the sharpest way yet — the plan said *do not cut this release*, and the
measurement said the plan had left out the only trigger that could ever have fired.

So this directory is shaped against that failure:

| | |
|---|---|
| **One measured plan** | [`v4.x-plan.md`](./v4.x-plan.md) — evidence first, and its central finding reorders the charters |
| **Nine thin charters** | `charters/v4.1.0.md` … `v4.9.0.md` — intent, candidate scope, **measurable trigger**, kill criteria |
| **Phase checklists** | `to-dos/` — execution structure, filled in when a charter is actually taken |

Every charter carries a **trigger** (the observation that would make it real) and **kill criteria**
(the observation that would make it dead). A charter with neither is a wish, and wishes are what
produced the 36,700 lines.

## What v4.0.0 changed here

Two things, and both are structural rather than cosmetic:

1. **The numbers are real now.** Under the old regime a "v4.2.0 charter" shipped as a v3 minor,
   because `4.2.0` could not precede a `4.0.0` the plan said not to cut. v4.0.0 exists, so `v4.1.0`
   is simply the next release. **Every ordering banner in `charters/` is retired**, and the two
   charters whose content already shipped were rewritten rather than renumbered — see below.
2. **A major no longer needs the specification's permission.** Triggers A–D mean *the protocol
   forced one*; **T-13** means *this project has surface to retire*. v4.0.0 was cut on T-13. The
   v5.0.0 question at the end of this line is therefore answerable without waiting on anyone.

## The rules that govern this directory

1. **No charter may be executed without the [`../v3/RE-MEASURE.md`](../v3/RE-MEASURE.md) pass
   first.** That ritual is the project's, not v3's, and it stays where it is rather than being
   copied here, because two copies of a ritual diverge.
2. **A charter that is measured and found dead gets archived with a dated banner naming what
   replaced it** — never deleted. The reasoning is the useful part, and a reader who finds no trace
   of a plan assumes it was never considered.
3. **Order is not commitment.** v3 executed its charters out of order twice and was right to. What
   *is* committed here is one dependency: **the tool programme does not start before the surface can
   carry it.** That is measured, not preference — see the plan's section 1.
4. **A release is cut when work is done, not when a number comes up.** v2.x ran to eleven minors and
   v3.x to eleven; both were better for it.

## How the nine are laid out

Grouped by what blocks what, not by number:

| | Charters | Depends on |
|---|---|---|
| **Unblock** | `v4.1.0` surface navigation · `v4.2.0` dispatch consolidation | nothing — measured, local, ready |
| **Build** | `v4.3.0`–`v4.5.0` the tool programme, in slices | v4.1.0 landing first |
| **Watch** | `v4.6.0`–`v4.9.0` spec-dependent, and the v5 question | triggers that have **not** fired |

The Watch group is deliberately the back half. Its triggers were re-measured on 2026-09-11 and none
had moved. Those charters stay thin on purpose, and any that never fires gets archived rather than
executed to fill a number.

## Contents

```text
v4.x-plan.md            the measured plan for the line, and the finding that reorders it
v4.0.0-plan.md          HISTORICAL -- why v4.0.0 was not scheduled, and what that got wrong
charters/
  v4.1.0.md   registry tools get a navigation path   <- unblocks everything below
  v4.2.0.md   one place to add a tool
  v4.3.0.md   the tool programme, slice 1
  v4.4.0.md   the tool programme, slice 2
  v4.5.0.md   magic, and scoring that is measured rather than asserted
  v4.6.0.md   arm64, from reporting to gating
  v4.7.0.md   tool result contracts, if they standardise
  v4.8.0.md   auth metadata, audit context, and the rest of the spec watch
  v4.9.0.md   consolidation, and the v5.0.0 question
to-dos/
  00-PHASE-0-TRIGGER-WATCH.md    the standing watch, including T-13
  01-PHASE-1-SURFACE.md          v4.1.0-v4.2.0 -- sprint breakdown
  02-PHASE-2-TOOLS.md            v4.3.0-v4.5.0 -- the tool programme
  03-PHASE-3-MEASUREMENT.md      v4.6.0
  04-PHASE-4-PROTOCOL.md         v4.7.0-v4.8.0
  05-PHASE-5-CONSOLIDATION.md    v4.9.0 and the v5.0.0 question
  DECISION-GATES.md              every kill criterion in one table
archive/
  v4.1.0-entry-point.md          shipped as v3.10.0
  v4.2.0-ext-proj-int-phase-1.md first slice shipped as v3.11.0; programme moved to v4.3.0
```

## Why there are still exactly nine

Because nine was asked for originally, and that is worth stating plainly rather than implying the
number came from analysis. What *does* come from analysis is their **content and their order**: the
first two are measured defects with numbers attached, the middle three are a programme that now has
a costed prerequisite, and the last four are watches on triggers that have not fired.

If a charter here looks speculative, it has failed its own standard and should be archived rather
than executed.
