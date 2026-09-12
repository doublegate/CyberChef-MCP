# Measurement harnesses

The scripts that produced the numbers cited in the findings logs and release notes. They were
written in a scratch directory, used once, and would have been wiped on the next reboot — which
would have left the *claims* in `docs/internal/*-findings-log.md` with no way to reproduce them.

That is the whole reason they are here. This project's discipline is "measure, do not assert", and a
measurement nobody can re-run is an assertion with a number in it.

## Running them

From the repository root, after `npm install && npx grunt configTests`:

```bash
node docs/internal/measurements/<name>.mjs
```

Paths are relative to the repository root; the originals hard-coded an absolute home directory and
were rewritten on salvage so they run for anyone. They are throwaway scripts kept for their
evidence, not library code — they are not linted, not tested, and not part of any gate.

## What each one established

### The XOR key-length tool

| | |
|---|---|
| `xor-proto.mjs` | The prototype behind **F-02**. Chi-square is the obvious scoring function and is wrong: it grows with sample size, so it ranks short key lengths highest regardless of the data. The first implementation answered "1" for every input and looked entirely plausible doing it. This is what showed index of coincidence works and chi-square does not. |
| `rule-eval.mjs` + `corpora.mjs` | The multi-corpus evaluation behind **F-03**, the most-repeated lesson in this project. A threshold tuned on one sample scored 21/21 and looked perfect; across a matrix it was 77/90, and the band had to move. `corpora.mjs` holds the code and log samples — a selection rule that works only on prose is not a selection rule. |

**F-03 happened again in v2.4.0**, on the same function, with the lesson already written down. The
`DIVISOR_MARGIN` sweep found 1.10 ideal at 71/72 on a small matrix and *worse than changing nothing*
at 400 cases. Writing the lesson down did not prevent the repeat; running the wider sweep did.

> The 400-sample harness itself is **gone** — it was written to the repository root and deleted
> rather than to the scratch directory, so it was not recoverable. Its table survives in the F-21
> entry and in a comment beside `DIVISOR_MARGIN`. Losing it is the reason this directory exists.

### Post-quantum identification (v3.11.0), and re-extraction for v4.4.0

Salvaged from a session scratchpad in v4.1.0, because they are the instruments behind a claim
`AGENTS.md` makes and no committed file could reproduce: the `pqc_identify` OID and size table
"came out of DER that Node 24 generated, not out of a specification read by eye".

| | |
|---|---|
| `pqc-oids.mjs` | Generates the ML-KEM / ML-DSA OID, SPKI and raw-public-key size table from keys Node itself produces. This is how `src/node/tools/pqc-identify.mjs`'s `BY_OID` table was built |
| `pqc-slh-params.mjs` | The same for the twelve SLH-DSA parameter sets, adding signature sizes |
| `data/pqc-ml-dsa-65-selfsigned.pem` | The self-signed **ML-DSA-65** certificate behind [`v4.3.0`](../../planning/v4/charters/v4.3.0.md)'s claim that `cert_chain` can validate PQC chains today with no new code path. Re-verified on salvage: `asymmetricKeyType: 'ml-dsa-65'`, `verify(publicKey) === true`. **Expired 2026-09-12** -- it was generated with a one-day lifetime, so it proves parsing and signature verification, not validity-window behaviour. Its private key was deliberately **not** committed |

**Run `pqc-oids.mjs` before extending that table.** [`v4.4.0`](../../planning/v4/charters/v4.4.0.md)
records that ML-KEM/ML-DSA pkcs8 export defaults to **seed-only on Node 26**, so the same key
exports differently than it did on the Node 24 that produced the shipped table. The table needs
re-extracting rather than trusting, and this is the script that does it.

### Miscellaneous probes

| | |
|---|---|
| `dump-tool-list.mjs` | Dumps a server's `tools/list` through a real client, taking the server command as argv. Useful for comparing two builds' surfaces without editing anything |
| `entropy-split-rate.mjs` | How often `entropy_scan` splits uniform random input into more than one region, over 400 trials. Written while investigating a suspected flake; measured **0.75%**. It **parses through `tool.inputSchema` before calling `run`**, as every harness here must -- `run` trusts that `handleCallTool` already applied the Zod defaults, and the salvaged version skipped that step and reported a meaningless `100.00%` |

### The RSA tool

| | |
|---|---|
| `rsa-proto.mjs` | All four attacks — Fermat, common-factor, Wiener, small-`e` — verified against known answers **before** any of it was written as a tool. This is the "pin the oracle first" rule in practice. |
| `rsa-tool-check.mjs` | The same known answers re-run through the registered tool, plus the input-bound and error-path checks. |

### The other v2.4.0 tools

| | |
|---|---|
| `hash-check.mjs` | Known-answer checks per hash format, including the ambiguous-hex case that must list every candidate rather than name one. |
| `hashprobe.mjs` | What CyberChef's own `Analyse hash` reports for bcrypt, sha512crypt and argon2 — the measurement that established the gap `hash_identify` fills. |
| `cyclic-check.mjs` | pwntools compatibility, both-endianness offsets, and the over-length refusal. |

### Protocol and packaging

| | |
|---|---|
| `client-check.mjs` | Tool presence and populated `inputSchema` through a **real MCP client** at each tool surface. The v2.1.0 lesson: raw JSON-RPC does no schema validation, so three releases shipped with every tool carrying an empty schema while the suite stayed green. |
| `shapes.mjs` | Captures the exact output shape of each registry tool. Used to write documentation from the artefact rather than from memory — the F-07/F-12 failure mode. |
| `strip-test.mjs` | The fixpoint-and-escape check for the docs-site `strip()`, after CodeQL flagged `js/incomplete-multi-character-sanitization`. One pass over `<<script>>` leaves `<script`. |
| `verify-recipes.mjs` | Runs the recipe examples used in the docs and wiki, so a documented recipe cannot quietly stop working. |

### Fork patch generators

`mkpatch.mjs`, `mkpatch09.mjs`, `mkpatch10.mjs` generated `patches/fork/09` (17 image operations
returning the shared buffer pool) and `patches/fork/10` (`Add Text To Image` with vendored fonts).

Kept because a patch that stops applying **fails the sync** by design — and when upstream moves the
files these touch, regenerating the patch is easier from the generator than by hand. They read a
scratch path from `$SP`; set it to a checkout of the upstream version you are patching against.

## What was deliberately not salvaged

The scratch directory held 1.6 GB and 2,028 candidate files. Almost none of it belonged here:

- **~1.5 GB of `node_modules`-heavy consumer and packaging test trees** — regenerable.
- **A 22 MB upstream CyberChef v11.4.0 checkout.** Vendoring upstream source into this fork is
  precisely the hygiene failure `patches/fork/` exists to prevent, and it is Apache-2.0 code freely
  available from GCHQ.
- **152 pull-request reply drafts**, already posted and permanent on the PR.
- **Four loose `.patch` working diffs** of files committed since — superseded by git history.
