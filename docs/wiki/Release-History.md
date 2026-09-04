# Release History

Full notes for every version live in
[`docs/releases/`](https://github.com/doublegate/CyberChef-MCP/tree/master/docs/releases) and on the
[releases page](https://github.com/doublegate/CyberChef-MCP/releases). This is the shape of the
2.x and 3.x lines, and what each release was actually *about*.

## v3.8.0 — two blockers that were not blockers

The carried-forward list had five live items. Re-measuring found that **two had never actually been
blocked**.

**arm64 performance** had said "needs arm64 **hardware**" since v3.3.0. `mcp-docker-build.yml` has
been running jobs on `ubuntu-24.04-arm` — free GitHub-hosted arm64 runners — the whole time, three
lines below a careful comment reasoning about that exact runner label. The hardware the note said
was missing was in the same repository's CI configuration. It now has a `benchmark-arm64` job that
**reports and does not gate**: there is no arm64 noise floor yet, and this project has set three
thresholds from a first plausible measurement and moved two of them within days. It does not compare
arm64 against amd64 either — those are different machines, which is what the whole v3.4.0–v3.6.0 line
of work was about.

**Task-level scoring** was blocked on a document. The charter required its design to survive "must
not be a flaky gate" *in writing* before any code, and nobody had written it. It is written, and it
concludes **against** building the harness: the same-host construction that rescued the benchmark
gate does not transfer, because host speed is a shared factor that cancels within a run while model
sampling noise is independent per invocation — so running both sides against the same model in one
job makes the comparison worse, not better. Recording a decision not to build is the point of the
exercise, and the item leaves the list either way.

**`cert_chain`** is the release's new capability and the 18th registry tool. Three operations parse
a single certificate each; nothing relates two, and every real question about a bundle is
relational. Its design changed twice under measurement. A first draft claimed to report "the issuer
name matches but the signature does not" — unreachable, because `checkIssued` already verifies
cryptographically, established against a purpose-built imposter carrying the real intermediate's
subject. The replacement imposter check was wrong too: it compared an orphan's subject against
subjects **in** the chain, which finds nothing precisely when an imposter has *replaced* the real
intermediate. It now asks about the issuer name the chain is **looking for**.

A missing root is reported as normal rather than as a defect, because a server's `fullchain.pem`
legitimately omits it, and a tool that cries wolf on the common case gets ignored.

## v3.7.0 — the gate that checked four of eleven files

v3.2.0's notes say it fixed the operation-count discrepancy. Three documents were corrected and
**nine live occurrences still said 505** two releases later — while `check:versions` reported every
operation-count location `ok` the whole time, because it carried a hand-written list of four files
and the claim appears in eleven.

The check's own comment already said *"a check that covers some occurrences of a claim reads as
covering the claim"*. The lesson had been learned about phrasings and not applied to files.

It now discovers the files it checks — coverage 7 to 37 locations — and found two more than reading
the tree by hand did, both operator-facing: a Grafana alert annotation and the comment explaining a
Helm memory request. The extra phrasing anchor was chosen by measurement rather than by adding
alternatives until it passed: a wide pattern flags twenty counts that are legitimately not 504, while
all nine wrong ones share the phrase "operation implementations".

Also a guard for the meta-tool duplication the v3.0.0 plan recorded and six releases carried. It has
not drifted — 23 declared, 23 dispatched — so it gets a tripwire rather than a rewrite.

Nine carried-forward items were measured against the code. Two were already done and still being
carried, which is what happens to a list nobody re-measures.

## v3.6.0 — the gate, measured into existence

The same-host benchmark comparison becomes a gate at 25% per task. That sentence has been written
twice before in this project and the number was wrong within days both times, so this release is
mostly the measurement that makes it stick.

Two halves, and the second is the one no previous attempt ever did. The **noise floor**: four
same-host runs on unchanged code, worst -7.6%. The **detection curve**: a deliberate, tunable
slowdown in `To Hex` — redoing a measured fraction of its own work, so the slowdown carries the
operation's real profile — giving -8.2% at 10% extra work, -20.2% at 25%, -32.8% at 50%, while every
untouched task stayed inside the noise floor. That last part is what makes a per-task threshold
meaningful rather than a suite-wide smear, and it had been assumed rather than shown.

The reach is stated rather than implied: it fires when a task is more than 25% slower, which took
about a third more work in the experiment. **A quarter more work does not fail the build** — it is
printed with its number. Both previous thresholds were quoted as though they caught everything.

Also the first findings log in nine releases that opens with "the plan was right".

## v3.5.0 — measuring the thing instead of estimating it

Two of v3.4.0's conclusions were tested before being built on, and both were wrong.

The `server.json` gate v3.4.0 added was **a schema version behind on the day it shipped** — 2025-09-29
against a current 2025-12-11 — and the official `mcp-publisher validate` says so in one line. The
lesson was already written down for the conformance suite ("the official suite is the oracle, not the
in-tree tests") and simply was not applied here, because `server.json` did not look like the kind of
file that has an oracle. CI now runs both: the transcribed checker as the blocking offline gate, the
registry's own validator as the thing that can contradict it.

And the benchmark fix v3.4.0 recorded — normalise against a calibration task — **would not have
worked**. Tested against the four runs that motivated it, dividing out each run's median leaves a
residual of -44% against a raw -42%: the hosts differ in profile, not by a scale factor. So the host
is removed from the comparison instead of estimated, by benchmarking the merge base and the head in
one job on one runner. First measurement is tenfold tighter — and it deliberately does not gate yet,
because one measurement on one machine is exactly what set the tolerance that failed last time.

Also: the MCP registry listing, which v3.4.0's ownership proofs made possible and nothing had used.

## v3.4.0 — three operations that had never worked

`Unzip`, `Untar` and `Extract Files` had been dead since v1.0.0. Advertised the whole time,
returning either an error thrown from inside the presenter after the operation had already
succeeded, or an archive listing with every filename right and every file zero bytes long.

Two independent defects stacked. `Utils.readFile` rejected the very `File` type its own
documentation passes it. And five operations construct a *bare global* `File` that nothing in this
process provided, because the only assignment lives in the generated bridge the server
deliberately does not import eagerly — so `new File(...)` resolved to Node's own `File`, a `Blob`
with no `.data`.

The second one **cannot be reproduced in-process**: any test harness that has loaded the bridge
puts the shim back and the bug vanishes. That is why eleven green releases never saw it, and why
the regression test drives a real server through a real client.

Also: `ecdsa_recover`, for the nonce reuse the four ECDSA operations cannot see; `server.json`
validated for the first time by anything, having declared one schema while being written to
another; both MCP registry ownership proofs, which were absent and would have had a publish
rejected; and the benchmark baseline finally captured on the runner it is compared against, which
removes a systematic -9.6% machine offset. The tolerance was cut from 50% to 20% on that basis
and put back the same day when four CI runs swung 40% on tasks the release does not touch --
recorded, because the study that supported 20% was wrong in an instructive way.

Three carried-forward questions were measured and deliberately left alone — the shell-free base
image (it works, and ships Node 25 against the current 26), the conformance suite's
`--requirements` flag, and the stdio protocol era — each recorded with what would change the
answer.

## v3.3.0 — twelve tools nobody planned

The `ext-proj-int` charter's own kill criterion fired on the phase it proposed next: six of its
nine tools already exist as upstream operations, and three of those would throw at startup because
registration refuses a shadowing name. So the scope was re-derived by reading the reference
projects as *code* rather than as documentation, and most of what that turned up contradicts what
those projects say about themselves — Ciphey's A* searcher is never imported, and both of Ares'
production call sites pass `&None` for the decoder heuristic, so neither tool's advertised ranking
runs at all.

Twelve registry tools, 4 to 16: two keyless cipher solvers (`vigenere_break`,
`substitution_break`), the four classical ciphers upstream lacks (`classical_cipher`), two tools
that compute across inputs rather than within one (`rsa_multi_key`, `corpus_diff`), and
`crib_drag`, `plaintext_check`, `entropy_scan`, `jwt_weakness`, `hash_crack`, `hash_statistics`
and `timestamp_identify`.

The default `tools/list` index doubled as a result — 28 tools to 40, 20,297 bytes to 40,637 — and
that is the cost rather than an oversight: a registry tool has no navigation path, so one that is
not listed cannot be called at all.

## v3.2.0 — every gate does what it says

A benchmark gate that said in its own output that it *"cannot fail on a regression"*; a Trivy scan
narrowed to CRITICAL-only for a dependency backlog cleared eight releases earlier; a Helm chart
nothing in CI rendered; and a README security claim — *"no shell, no package manager"* — that
measuring the published image disproved. All four fixed, and the last one by correcting the
documentation rather than the image.

## v3.1.0 — the evaluation harness

Every tool-quality claim in this project had been asserted rather than measured. This is the
release that made the later ones provable.

## v3.0.0 — conformance, and a renamed image

MCP 2026-07-28 conformance plus the breaking cleanups it forces. A major bump RENAMES the GHCR
package, so `_v2` became `_v3` — and the release pipeline had an npm-publish guard keyed to `v2.`
tags that would have silently skipped publishing, found before the tag rather than after it.

## v2.10.0 — one configuration file, finally read

`cyberchef.config.json` had been documented since v1.8.0 and read by nothing.

## v2.9.0 — the presented-output correctness rule

44 operations declare a `presentType` differing from their `outputType`, and the presenter targets
a browser. `JSON Beautify` is why this is a correctness rule and not a formatting one: its keys'
quotes were markup structure, so stripping tags returned unparseable JSON.

## v2.8.1 — testing what we actually ship

No runtime code changed. What changed is what CI measures, and two of those were wrong in ways a
green pipeline hid completely.

**CI tested Node 24 while the image shipped Node 26.8.1.** The runtime users actually get was never
exercised by a test — and nothing reported it, because 24 is a perfectly valid version to test on.
It just is not the one that ships.

Bumping everything to 26 would have inverted the bug rather than fixed it: `engines` declares
`>=24 <27`, so 24 is supported for anyone installing from npm, and an untested floor is precisely
what was wrong. The test gates now run **both boundaries** — 24 (the floor) and 26 (what ships) —
with `fail-fast: false`, because when the Node version is the variable under test, "which ones
broke" is the whole result.

**And the performance benchmarks were measured on Node 22**, which `engines` does not permit at all.
The numbers posted to every pull request came from a runtime this project does not support, on a V8
two majors behind the one it ships. Missed by the v2.0.0 plan's "all 7 workflows" bump and hidden
for eight releases, because a warning is not a failure and nobody reads a green job's log.

Also three GitHub Pages actions force-run on deprecated Node 20, now on their Node-24 majors.

What was left alone is documented with evidence rather than silently skipped: `@astronautlabs/amf`
declares `engines: ^14` but 0.0.6 **is** the latest published version and the operations were
verified to work on 26.8.1; and a category of log lines that match the word "warning" without being
warnings — echoed inputs, runner noise, and the audit trail firing on purpose in tests.

## v2.8.0 — ARM, and 30% smaller

Images for `linux/arm64` as well as `linux/amd64`, and the image itself down from 643 MB to
**453 MB** — 1,190 packages to **432**.

The build ran `npm ci` and then `rm -rf` on a hardcoded list of nine package globs, against a tree
of 1,310 paths of which 885 were dev-only: `typescript`, `@rolldown`, `@octokit`, `@babel`,
`lightningcss`. Attack surface as much as weight. Replaced with a real `npm prune --omit=dev`,
verified by re-running all 2,289 operation tests against production-only dependencies.

The prune is also what made arm64 possible: it removes every x64-locked binary in the tree, leaving
a production tree that is pure JavaScript and WebAssembly. That is why the emulated arm64 build
takes 4m46s rather than the 30–60 minutes it was expected to.

Two defects found on the way: a **local** build shipped 240 MB of Docusaurus that CI never saw
(`.dockerignore` matches only the context root), and the developer's own **saved recipes** were
being baked into the image.

Also `CYBERCHEF_OFFLINE=true`. 502 of the 504 operations never touched a network anyway; this makes
the other two fail closed instead of hanging until the OS gives up. Checked against the *recipe*
rather than the tool name — `cyberchef_bake` carrying `HTTP request` is a network call. See
**[Configuration](Configuration#offline-and-air-gapped-operation-v280)**.

Three of the plan's eight features turned out to be already shipped in v2.6.0. The <50 MB image
target is unreachable and is reported as such rather than quietly missed.

## v2.7.0 — observability

A dependency-free Prometheus endpoint at `/metrics` (**off by default** — see
**[Configuration](Configuration#observability-v270)** for why it is opt-in when the health probes
are not), OpenTelemetry spans following the MCP semantic conventions, and trace correlation on every
log line.

It adds **one** package, and that was the release's main decision: the OTel *API*, not the SDK.
Measured at 1 package / 2.6 MB / +9 ms against the SDK's 71 packages / 50 MB / +100 ms — which would
have handed back more than half of v2.6.0's startup work on every stdio launch, for users collecting
nothing. You supply the SDK, so every OTLP backend works rather than the three the plan named.

Tool arguments are never recorded. The conventions mark them Opt-In, and for this server the
arguments *are* the sensitive material.

Ships a 25-panel Grafana dashboard, 9 alert rules, a Helm `ServiceMonitor` and `PrometheusRule`, and
a runnable Prometheus + Grafana stack — all of it executed against a live server rather than
reviewed. Building the dashboard is what found the bugs: per-tool counters that could *decrease*
(and so would have made `rate()` invent traffic), counters that read zero forever on a default
deployment, a duplicated `# HELP` line that fails an entire scrape, and caller-controlled metric
labels that anyone could have used to explode a shared Prometheus.

## v2.6.0 — deployable, and seven times faster to start

Cold start ~1300 ms → **~185 ms**. 88% of it was one import pulling in all 504 operation
implementations before answering anything, on a path only three tools need. A background warm-up was
tried, measured, and removed — module loading blocks the event loop, so "in the background" is not
something it can be.

Health probes and a drain that loses no requests during a rolling update. Liveness deliberately
stays healthy while draining: a liveness failure there gets the pod killed mid-drain.

A [Helm chart and Compose file](https://github.com/doublegate/CyberChef-MCP/tree/master/deploy),
where the chart *refuses to render* configurations the server would reject at startup. Conflict
detection on saved recipes — two replicas sharing one file had been silently discarding each other's
writes. And a 5 s deadline plus a circuit breaker on JWKS calls, so an issuer outage no longer turns
every request into two outbound ones.

The plan's centrepiece — a Redis session store with affinity and sticky sessions — was dropped:
MCP `2026-07-28` removed protocol-level sessions, so there was nothing to externalise.

## v2.5.0 — authorization and multi-tenancy

OAuth 2.1 **Resource Server** on HTTP: RFC 9728 Protected Resource Metadata, JWKS bearer validation,
and RFC 8707 audience binding — the check that stops a token minted for another service being
replayed here. Scope-based RBAC with three scopes, where the scope a tool needs is *derived from its
annotations* rather than a table that goes stale. Audit logging.

Multi-tenancy across the operation cache, recipe store, concurrency pool and audit trail, with the
tenant read from a claim on an already-verified token — never from a header the caller controls.
Without it, any caller on a shared HTTP deployment could read and delete any other caller's recipes.

Also fixed a rate limiter that had never limited anything since v1.7.0: it was keyed on a
per-request UUID, so every call looked like a first-time caller. Measured at 0 denials in 1000
requests against a limit of 5.

Not applied to stdio, deliberately — the specification says stdio SHOULD NOT use OAuth, because a
bearer token protects nothing when the client already owns the process.

## v2.4.0 — the tool registry

Four analysis tools that an operation cannot express: `xor_key_length`, `cyclic_pattern`,
`hash_identify`, `rsa_attack`. See **[Analysis Tools](Analysis-Tools)**.

No plugin loader, deliberately — `node:vm` is not a security boundary, and that was measured rather
than assumed. Also corrected three documents that described work nobody had done, including a
third-party notices file crediting eight ports that were not ports.

## v2.3.0 — protocol currency and transports

Protocol revision **2026-07-28** on both stdio and HTTP, served alongside the 2025 era from one set
of handlers (MCP SDK v2). A **socket transport**. npm distribution unblocked.

And the release that found **17 image operations returning Node's shared buffer pool instead of the
image** — a `Buffer` is a view, so `.buffer` is the pool, and a 129-byte PNG came back as a
65,599-byte `ArrayBuffer` of whatever the process had recently allocated. Reported privately
upstream as GHSA-hj7h-fgw7-x6w8. `Add Text To Image` turned out never to have worked in this fork
at all.

Coverage thresholds were raised from 75/70/90/75 to **95/88/96/96** — the old numbers sat twenty
points below actual, so the gate could not fail.

## v2.2.0 — multi-modal

`Generate QR Code`, `Render Image` and the image set return a real MCP `image` content block;
`Play Media` returns `audio`. Before this, the html-to-text conversion deleted the payload and
these operations returned an empty string — they had never worked over MCP.

**Tool annotations on every tool**, so a client can skip the approval prompt for a pure operation.
The exceptions were measured, not guessed: only `HTTP request` and `DNS over HTTPS` reach the
network. Plus five [prompts and recipe resources](Prompts-and-Resources).

## v2.1.1 — security sweep

55 code-scanning alerts dispositioned: fixed, suppressed with a written justification, or dismissed
with a reason.

## v2.1.0 — the tool surface

`tools/list` became an **index** rather than a catalogue: ~24 tools instead of 527 at the time.
See
**[The Tool Surface](Tool-Surface)**.

This is also the release whose testing lesson shaped everything after it. Every test before it
spoke raw JSON-RPC — which does no schema validation — so three releases had shipped with **every
one of 524 tools carrying an empty `inputSchema`**, with the suite green throughout.

## v2.0.0 — the major

Upstream catch-up **v10.19.4 → v11.4.0** (440 → 504 operations). Relicensed to
**GPL-3.0-or-later**. Per-session HTTP transport. 272 security findings closed. The `cyberchef_`
prefix removal was **withdrawn** after measurement: it saved 2.6% of the payload against breaking
every integration and creating 19 colliding names.

## Before 2.0

The 1.x line ran from v1.0.0 to v1.9.0, building the MCP layer itself: streaming and structured
errors (1.5), recipe management (1.6), batch and caching and quotas (1.7), the deprecation contract
(1.8), worker threads (1.9).

`cyberchef-mcp_v1` is **frozen but pullable**. Its tags stay available, and a v1.9.x maintenance
branch ships security-only patches until roughly March 2027 — still under **Apache-2.0**, since the
GPL relicensing applies from v2.0.0 forward.

## Versioning

SemVer. Additive features ship off by default so non-major releases stay compatible. Breaking
save-state, format or API changes are reserved for a clearly announced major.
