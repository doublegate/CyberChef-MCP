# Preserved measurement data

Raw captures kept **in the repository** because the evidence they came from does not survive
anywhere else.

| File | What it is | Why it is here |
|---|---|---|
| `pqc-ml-dsa-65-selfsigned.pem` | Self-signed **ML-DSA-65** certificate, `CN=pqc-test`, generated with OpenSSL 3.6.4 | The evidence behind [`v4.3.0`](../../../planning/v4/charters/v4.3.0.md)'s claim that `cert_chain` can validate PQC chains today with no new code path. Salvaged from a `/tmp` scratchpad in v4.1.0 and re-verified on the way in: `asymmetricKeyType: 'ml-dsa-65'`, `verify(publicKey) === true`. **Expired 2026-09-12** -- a one-day lifetime, so it proves parsing and signature verification, NOT validity-window behaviour. Its private key is deliberately not in this repository; see `docs/SALVAGE_MANIFEST.md` |
| `v3.4.0-capture-1139.json` | The 2026-09-04T11:39:38Z runner capture, 30 tasks | One of three captures in the v3.4.0 cross-instance variance study. Its GitHub Actions artifact **expired 2026-09-11**, and it had never been committed to `master` -- it existed only on the stale `chore/benchmark-baseline` branch (`862c2f00`). 29 of its 30 per-task medians appear in no document. |

## Provenance: the file's own metadata is KNOWN-STALE, and is kept that way deliberately

`v3.4.0-capture-1139.json` describes itself wrongly. Read the file and you will find:

```text
_machine  "Captured on one developer machine. The GitHub runner measured 27-99% FASTER ..."
_comment  "... four consecutive `npm run benchmark -- --json` runs on one machine ..."
```

**Both are false for this file.** It is a runner capture. The fields are template text inherited
from the capture script as it stood before `capture-baseline.mjs` learned to record real
provenance -- the same script generation that is why this file has no `capturedOnRunnerRunId`,
while master's `benchmarks/baseline.json` does. This is the provenance defect recorded as **F-08**
in [`../../v3.4.0-findings-log.md`](../../v3.4.0-findings-log.md).

The verified provenance, from three independent directions:

| Evidence | What it shows |
|---|---|
| Commit `862c2f00`'s own message | *"Captured by `.github/workflows/benchmark-baseline.yml` on the same runner class the regression gate executes on"* |
| F-08 in the v3.4.0 findings log | Built its cross-instance study from **three runner captures**, of which this is one |
| [`../v3.4.0-runner-baseline.md`](../v3.4.0-runner-baseline.md) | Lists the three `benchmark-baseline.yml` runs of 2026-09-04 that produced them |

**The file is not corrected, and must not be.** It is preserved as evidence, and evidence that has
been edited to agree with the story told about it is no longer evidence. A reader comparing this
capture against master's must be able to see that the two were written by different script
generations -- that difference is itself part of what F-08 records. The annotation belongs here,
beside the artefact, not inside it.

When quoting this capture, cite it as a **runner** capture and cite this section for why its own
`_machine` field says otherwise.

## The rule this directory exists to enforce

**A measurement cited in a document must live in the repository, not in an artifact.**

GitHub Actions artifacts expire. `v3.4.0-runner-baseline.md` asserted that its three captures'
"artifacts are intact" and that sentence was true when written and false seven days later, with
nothing in the tree changing and nobody noticing. One of the three captures is lost outright as a
result.

So: if a document quotes a number derived from a run, commit the data the number came from. A
citation whose evidence has a retention clock is a citation with an expiry date on its truth.
