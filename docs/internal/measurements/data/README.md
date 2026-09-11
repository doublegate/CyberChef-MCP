# Preserved measurement data

Raw captures kept **in the repository** because the evidence they came from does not survive
anywhere else.

| File | What it is | Why it is here |
|---|---|---|
| `v3.4.0-capture-1139.json` | The 2026-09-04T11:39:38Z runner capture, 30 tasks | One of three captures in the v3.4.0 cross-instance variance study. Its GitHub Actions artifact **expired 2026-09-11**, and it had never been committed to `master` -- it existed only on the stale `chore/benchmark-baseline` branch (`862c2f00`). 29 of its 30 per-task medians appear in no document. |

## The rule this directory exists to enforce

**A measurement cited in a document must live in the repository, not in an artifact.**

GitHub Actions artifacts expire. `v3.4.0-runner-baseline.md` asserted that its three captures'
"artifacts are intact" and that sentence was true when written and false seven days later, with
nothing in the tree changing and nobody noticing. One of the three captures is lost outright as a
result.

So: if a document quotes a number derived from a run, commit the data the number came from. A
citation whose evidence has a retention clock is a citation with an expiry date on its truth.
