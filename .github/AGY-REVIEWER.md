# Antigravity PR Review

A drop-in replacement for the retired **Gemini Code Assist for GitHub** consumer
app, rebuilt to run on your **Google AI Ultra** subscription with **no paid,
pay-as-you-go API usage**.

It auto-reviews pull requests (on open, on every push, and on an `/agy-review` comment) using
the **Antigravity CLI (`agy`)** running on a **self-hosted runner** on your own
machine. Because `agy` authenticates with your Google OAuth session, every
review draws on your Ultra rate limits instead of a metered Gemini API key.

---

## Why this is free under Ultra (the one idea that matters)

| Path | Auth | Cost |
|------|------|------|
| Gemini **API key** / `run-gemini-cli` / Antigravity **SDK** (`run-agy-sdk`) | API key | **metered, pay-as-you-go** |
| Antigravity **CLI** (`agy`) | Google **OAuth** | **your Ultra rate limits** |

`agy` supports OAuth sign-in with "generous rate limits on Google AI Pro and
Ultra plans." So the whole trick is to build the reviewer around the **`agy`
CLI's cached OAuth session** — never around an API key. That also means the job
must run **on a machine where `agy` is already logged in** (your desktop), which
is why this uses a self-hosted runner rather than GitHub's cloud runners.

> **ToS caveat, stated plainly:** Google deliberately moved GitHub reviews to its
> enterprise/API product. Automating a *consumer* Ultra subscription for CI-style
> workloads is a gray area — the realistic downside is rate-limiting. This template
> reviews on open, reopen, **every push** (`synchronize`) and on demand; remove
> `synchronize` from the workflow if you need to keep volume lower.

---

## How it works

```
GitHub PR event ──▶ self-hosted runner (YOUR machine, systemd --user)
                      │  gh pr diff ─▶ build adversarial-reviewer prompt (+ style guide)
                      │  agy --print  (PTY-wrapped, OAuth/Ultra)  ─▶ review text
                      └─ gh api ─▶ one comment per PR, edited in place (earlier rounds archived)
```

Files in this template:

| File | Goes where | Purpose |
|------|-----------|---------|
| `.github/workflows/antigravity-review.yml` | **copy → target repo** | trigger + job definition |
| `scripts/agy-review.sh` | **copy → target repo** | the reviewer (diff → prompt → `agy` → comment) |
| `scripts/_agy_print.sh` | **copy → target repo** | PTY fallback helper (only if `unbuffer` is absent) |
| `scripts/_agy_comment_body.sh` | **copy → target repo** | comment-body and archive format; `agy-review.sh` sources it unconditionally |
| `scripts/agy-review-selftest.sh` | **copy → target repo** | offline self-test of the reviewer; run it in the target's CI |
| `.github/actionlint.yaml` | **copy → target repo** (only if absent) | declares the self-hosted `agy` label for actionlint |
| `README.md` (this file) | **copy → `.github/AGY-REVIEWER.md`** | operations doc: setup, troubleshooting, security model |
| `agy-review.md.example` | **copy → `.github/agy-review.md`** in target repo | the review style guide (optional) |
| `scripts/provision-runner.sh`, `scripts/deprovision-runner.sh` | template-local | stand up and tear down a per-repo runner |
| `systemd/github-agy-runner@.service` | `~/.config/systemd/user/` | runs each runner in your session (template-local) |
| `gitignore.snippet` | *optional append* | precautionary ignores (see below) — never copied over an existing `.gitignore` |
| `.gitignore` | template-local | this repo's own hygiene — **do not** copy into target repos |

> **Copy into a target repo** (what `install-into-repo.sh` does): the workflow, the four
> scripts `agy-review.sh`, `_agy_print.sh`, `_agy_comment_body.sh` and
> `agy-review-selftest.sh`, this README as `.github/AGY-REVIEWER.md`,
> `.github/actionlint.yaml` when the target has none, optionally `.github/agy-review.md`,
> and one appended `.gitignore` line (`/.agy-review-work/`). Everything else
> (`systemd/`, the provision/deprovision scripts, this repo's `.gitignore`, `*.example`,
> `gitignore.snippet`) stays here.

---

## One-time host setup (do this once per machine)

### 1. Prerequisites

```fish
# agy must be installed and logged in (it already is on this box):
agy -p "reply with the single word: ok"     # should print: ok

# Tools the reviewer uses (all already present here):
#   gh jq sqlite3 col script  + unbuffer (from `expect`)
pacman -Q github-cli jq sqlite expect util-linux >/dev/null   # verify; install any missing with paru/pacman
```

If `agy -p` prints nothing, fix auth first (run `agy` interactively once to
complete the Google sign-in) — the reviewer can't work until that one-liner does.

### 2. Register a self-hosted runner (label `agy`) per repo

Personal `github.com/<you>/*` repos support only **repo-level** runners, so you
run **one instance per repo** on this one machine, each in `~/actions-runner/<name>`.
Download the runner once (get the current version + checksum from **repo →
Settings → Actions → Runners → New self-hosted runner → Linux/x64**), unpack a
copy per repo, then configure each with a freshly minted token:

```fish
# one-time download (pick the version GitHub shows you)
set VER 2.336.0
# per repo:
for pair in "RustySNES:rustysnes" "RustyN64:rustyn64"
    set repo (string split ":" $pair)[1]; set name (string split ":" $pair)[2]
    mkdir -p ~/actions-runner/$name
    tar xzf ~/Downloads/actions-runner-linux-x64-$VER.tar.gz -C ~/actions-runner/$name
    set token (gh api -X POST repos/doublegate/$repo/actions/runners/registration-token --jq .token)
    cd ~/actions-runner/$name
    ./config.sh --url https://github.com/doublegate/$repo --token $token \
        --labels agy --name (hostname)-$name --work _work --unattended --replace
end
```

Do **not** use the bundled `svc.sh` (it makes a *system* service that can't read
your keyring). Use the `--user` template unit below.

### 3. Run each runner as a `systemd --user` instance

```fish
mkdir -p ~/.config/systemd/user
cp systemd/github-agy-runner@.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now github-agy-runner@rustysnes github-agy-runner@rustyn64
systemctl --user is-active github-agy-runner@rustysnes github-agy-runner@rustyn64
```

Keyring note: the unit intentionally does **not** enable linger — it runs inside
your unlocked graphical session so `agy`'s OAuth token in the keyring is
readable. Reviews process while you're logged in; they queue otherwise.

---

## Per-repo setup

### Quickest: the installer

```fish
set TPL ~/Code/Local_Only-Projects/antigravity-pr-review
$TPL/install-into-repo.sh /path/to/existing/repo --with-style-guide
```

It copies the workflow + `scripts/` (and, with `--with-style-guide`, a starter
`.github/agy-review.md`), leaves the target's `.gitignore` untouched, and prints
the `git add/commit/push` to finish. Then jump to **Triggering it** below.

### Or by hand

1. Copy `.github/workflows/antigravity-review.yml` and the `scripts/` directory
   into the target repo (keep the paths).
2. `chmod +x scripts/*.sh` and commit (git preserves the executable bit).
3. Optionally copy `agy-review.md.example` → **`.github/agy-review.md`** and
   tailor the rules. The dedicated filename avoids clashing with an existing
   `GEMINI.md`/`AGENTS.md`. Point elsewhere with the `STYLE_GUIDE` env var.
4. Ensure the repo's **Settings → Actions** allows workflows and self-hosted
   runners (default for private repos you own).

That's it — no repository secrets. The job uses the built-in `GITHUB_TOKEN` to
post comments and your local `agy` session for the model.

### About `.gitignore` (append, don't overwrite)

The reviewer works in temporary directories (`mktemp` / `$RUNNER_TEMP`) for
everything **except** one case: when a PR's diff is too large to inline in the
argv prompt, it writes the diff to a gitignored working-tree scratch dir,
`.agy-review-work/`, so agy can read it in full with its file tools instead of
the review being truncated to the execve arg-size ceiling. The file and the
(now-empty) dir are removed by the script's `EXIT` trap. Because that path is in
the working tree, a target repo **does** need `/.agy-review-work/` in its
`.gitignore` — otherwise the transient `.patch` shows as untracked pollution on
large-diff PRs. Still **never** copy this template's own `.gitignore` over a
project's.

**Append** the ignore entries idempotently:

```fish
# from the target repo root
grep -qxF '/.agy-review-work/' .gitignore 2>/dev/null
  or cat $TPL/gitignore.snippet >> .gitignore   # TPL: your checkout of this template
```

---

## Triggering it

- **Automatic:** open, reopen, or **push to** a PR → a review is posted within a
  minute or two. This fires from the workflow on the **PR branch**, so the very PR
  that adds the workflow is itself a live test, and every follow-up push re-reviews
  (`synchronize`). Auto-runs only for PRs authored by a trusted user (see the
  security model) so a fork's code never auto-executes on the runner.
- **On demand:** comment **`/agy-review`** on any PR to (re)run it.

### One comment per PR, appended to — never replaced

Each run **edits** the existing review comment: the newest round goes on top and
every earlier round is folded into a collapsed `<details>` block beneath it. The
thread stays clean and **nothing is destroyed**.

This replaced a delete-and-repost design, and the reason is worth keeping. That
version posted a fresh comment and deleted the previous one, so a round nobody had
read before the next push was **gone**, with nothing on the PR indicating it had
ever existed. Unlike a CodeRabbit or Copilot review thread, an unaddressed
Antigravity finding left no trace at all. It was caught on a real PR where two
consecutive rounds each raised a blocking issue and only the second survived — a
clean comment list is not evidence that nothing was raised.

The script no longer issues a `DELETE` at all; `agy-review-selftest.sh` asserts
that, so the behaviour cannot come back unnoticed. The archive is bounded by
`MAX_BODY_BYTES` (default 60000, under GitHub's 65536 limit); when rounds must be
dropped to fit, the oldest go first **and the body says how many were dropped**,
because a silent truncation would look exactly like a PR reviewed only once.

> **Default-branch rule:** GitHub runs `issue_comment` workflows from the copy on
> the **default branch**. So the `/agy-review` comment trigger only works after
> the workflow is merged to `main`. The `opened` trigger works from the PR branch
> immediately.
>
> The same rule governs the **scripts**: the workflow checks out the default branch
> to run them, so a change to `agy-review.sh` (the archive behaviour above included)
> has **no effect on any PR until it is merged**, not even on the PR that makes it.

---

## Security model (read this if your repo is public)

GitHub, [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/GitHub_Actions_Security_Cheat_Sheet.html),
and [Wiz](https://www.wiz.io/blog/github-actions-security-guide) all warn that
**self-hosted runners should almost never back public repos** — runners are
non-ephemeral, so untrusted code from a fork PR can persistently compromise the
host. This template applies the standard mitigations, but the residual risk is
yours to accept:

- **Required: approval for every outside contributor.** For a `pull_request` event
  GitHub runs the workflow file **from the PR's own branch**, so a fork can edit or
  delete any `if:` in it and point a job at your runner. Only GitHub's approval gate
  stops that. Set **Settings → Actions → General → Fork pull request workflows →
  Require approval for all outside collaborators** (API:
  `gh api -X PUT repos/OWNER/REPO/actions/permissions/fork-pr-contributor-approval
  -f approval_policy=all_external_contributors`). The default,
  `first_time_contributors`, runs a returning contributor's fork PR without asking.
  Never approve a fork PR's workflows unless you have read its `.github/` changes.
- **Same-repository gate on auto-runs:** the `pull_request` job (open/reopen/push,
  i.e. `synchronize`) is written to run only when the PR head is a branch **in this
  repository** (`github.event.pull_request.head.repo.full_name == github.repository`).
  That keeps an unmodified workflow off fork PRs, but it is not a security boundary,
  for the reason above.
- **Write-access gate on comments:** `/agy-review` from a commenter whose
  `author_association` is `OWNER`/`MEMBER`/`COLLABORATOR` passes the workflow's
  cheap pre-filter, but that is not the permission check (a Triage-only user also
  reports as COLLABORATOR). The authoritative check is `agy_has_write_access` in
  `scripts/agy-review.sh`, which asks the permissions API for the commenter and
  fails closed; the script also re-checks that the PR is not from a fork, because
  the `issue_comment` payload has no head-repo field for the `if:` to gate on.
- **First-install bootstrap:** on a repository whose default branch has no
  reviewer yet, the workflow runs the PR head's scripts once, only for a same-repo
  branch whose author has write access *at run time*. Remove the bootstrap steps
  once the reviewer is on the default branch (they also trip CodeQL's
  `actions/untrusted-checkout`).
- **Least surface in the job:** review-only prompt, `--sandbox`, no repo secrets
  (built-in `GITHUB_TOKEN` only), temp files cleaned via an `EXIT` trap.

To reduce the remaining exposure, run each job on a **clean, disposable host** (a VM or
container image recreated per job). Re-registering a runner on the same host is not enough,
because the host's state survives. Making the repository private does not remove the risk either:
if fork workflows are enabled for a private repository, anyone who can fork it can still reach the
runner, so disable fork workflows there or gate them the same way.

---

## Configuration (workflow `env:`)

| Variable | Default | Meaning |
|----------|---------|---------|
| `AGY_MODEL` | *(agy default)* | e.g. `gemini-3-pro`; run `agy models` to see IDs |
| `AGY_EFFORT` | `high` | reasoning effort: `low` / `medium` / `high` |
| `AGY_PRINT_TIMEOUT` | `5m` | base wait for a single `agy --print`; raised for a large diff (next row). Setting it pins it and turns the raise off |
| `AGY_TIMEOUT_SECONDS_PER_MIB` | `900` | extra seconds per MiB of diff. A diff handed over as a file costs agy 6-8 minutes almost whatever its size, so this is deliberately steep (240 left a 426 KB diff at 397 s, too little) |
| `AGY_PRINT_TIMEOUT_MAX_SECONDS` | `1800` (workflow: `900`) | ceiling on one attempt after the raise |
| `AGY_RETRIES` | `3` (workflow: `2`) | attempts; a retry is for a transient backend error, so more of them at the same budget only repeat a timeout |
| `AGY_DIFF_MODE` | `auto` | how the diff reaches agy: `inline` (in the `--print` prompt), `file` (written to a file agy reads with its tools), or `auto` (inline if it fits the arg-size budget, else file — so **large PRs are never truncated**) |
| `MAX_DIFF_BYTES` | `5000000` | sanity cap on a pathological diff (5 MB). Not the arg-size limit — a large diff goes to agy as a file, not an argv value |
| `MAX_PROMPT_BYTES` | `125000` | the inline/file threshold in `auto` mode, and a hard backstop on the **inlined** prompt. agy takes an inlined prompt as a `--print` argv value, and a single `execve` argument cannot exceed `MAX_ARG_STRLEN` (128 KiB); over it `execve` fails with E2BIG before agy starts. Clamped below 128 KiB |
| `STYLE_GUIDE` | `.github/agy-review.md` | repo-relative style guide, loaded if present |

---

## Troubleshooting

- **Review comment never appears / job succeeds but empty:** the classic
  Antigravity **issue #76** — `agy -p` drops stdout when it isn't attached to a
  TTY. This template runs `agy` under a PTY (`unbuffer`, or `scripts/_agy_print.sh`
  if `unbuffer` is absent). If output is still empty the job fails loudly and
  dumps `agy`'s stderr; confirm `agy -p "hi"` works for the runner's user.
- **`agy: command not found` in the job:** the systemd unit's `PATH` must include
  `~/.local/bin`. Confirm with `systemctl --user show-environment`.
- **Auth errors / no output:** the keyring is probably locked (you're logged out,
  or the runner started before the session unlocked). Log in, then
  `systemctl --user restart github-agy-runner`.
- **"agy hit its print timeout ... on N of N attempt(s)":** the review needed
  more time than the budget, which is a size problem, not an outage: agy did run
  (an expired login prints its OAuth flow instead, and a backend error is logged
  as one). A diff over the inline budget goes to agy as a file, and that costs
  6-8 minutes at `AGY_EFFORT: high` almost whatever its size. Raise
  `AGY_TIMEOUT_SECONDS_PER_MIB` or `AGY_PRINT_TIMEOUT_MAX_SECONDS` in the
  workflow's `env:` and keep the job's `timeout-minutes` above the worst case
  (the selftest checks it). For a `pull_request` run GitHub takes the workflow
  from the PR branch, so an `env:` change takes effect on the PR's next push; a
  script change only after it reaches the default branch.
- **Job never starts:** no runner is online/idle with the `agy` label, or the
  machine is asleep. Check `systemctl --user status github-agy-runner`.
- **Review fails on a very large PR (`gh pr diff failed`):** GitHub's API refuses
  any diff over **20,000 lines** with HTTP 406, so `gh pr diff` cannot fetch it at
  all. This is separate from — and upstream of — the arg-size handling
  (`AGY_DIFF_MODE`): that decides how a diff *already in hand* reaches agy, but a
  406 means there is no diff in hand. The script now detects the 406 specifically
  (a genuine auth/network/bad-PR failure is still fatal) and falls back to
  computing the diff locally: it fetches `refs/pull/<n>/head` and the base branch
  into private `refs/agy/*`, takes `git merge-base`, and `git diff`s them. It
  fetches objects but **never checks them out** — the working tree is untouched and
  the PR content is never executed — and the refs are removed on exit. The
  recovered diff then flows through the normal inline/file path, so a 67k-line PR
  reviews the same as a 50-line one. The fetch authenticates via `http.extraheader`
  (Actions `GITHUB_TOKEN`), falling back to git's ambient credentials for a hand
  run, so it does not depend on `persist-credentials`.

---

## Roadmap / possible enhancements

- **Inline line comments** (map findings to diff hunks via `gh api ... /reviews`)
  instead of a single summary comment.
- **Quota guard:** skip auto-review for docs-only or tiny diffs; a daily cap.
- **`/agy-review <focus>`** to pass an ad-hoc instruction (e.g. `security only`).
- **Label gate:** only auto-review PRs carrying a `needs-review` label.
