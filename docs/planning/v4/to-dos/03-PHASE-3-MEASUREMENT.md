# Phase 3 — Measurement (v4.4.0)

Charter: [`../charters/v4.4.0.md`](../charters/v4.4.0.md). Turning the arm64 benchmark from
reporting into gating — **if** the numbers permit, which is the open question.

## Sprint 3.1 — Accumulate before deciding

- [ ] At least **twenty** arm64 runs across at least **three** releases. One run is a number.
- [ ] Each records its machine: arch, kernel, CPU count, model, memory, Node version. A benchmark
      whose machine is unrecorded is a number nobody can reuse.
- [ ] Keep the arm64 `model:` fallback working — arm64 `/proc/cpuinfo` has no `model name`, and the
      original `|| echo unknown` could not fire because grep matching nothing still exits 0 through
      `xargs`. An empty field reads as "a machine with no model" rather than "the step failed".

## Sprint 3.2 — Characterise, the way v3.6.0 did

- [ ] Noise floor: repeated runs on **unchanged** code. amd64's worst case was -7.6% over four runs.
- [ ] Detection curve from a **deliberate tunable slowdown**, not a guess. amd64: 10% extra work
      read -8.2%, 25% read -20.2%, 50% read -32.8%, untouched tasks stayed within -3.7%.
- [ ] Write both into `docs/internal/measurements/`, including anything that disproves the result.
      `v3.4.0-runner-baseline.md` keeps its study **and** its disproof, and that is the model.

## Sprint 3.3 — Only now, a threshold

- [ ] State what it catches **and what it does not**. The amd64 gate catches >25% slower, which took
      ~33% extra work — a quarter more work does *not* fail it, and saying so is the point.
- [ ] Never compare arm64 against amd64. Different machines; not doing that is what the whole
      v3.4.0-v3.6.0 line of work was about.
- [ ] Verify the gate can fail, by introducing a real slowdown.

## Done when

Either a threshold exists with its noise floor and detection curve published, or the study concludes
**no honest threshold is available** and says so in writing. Both are successful outcomes.
