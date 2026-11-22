#!/usr/bin/env bash
#
# agy-review.sh -- headless GitHub PR reviewer driven by Antigravity CLI (`agy`).
#
# Runs on a SELF-HOSTED GitHub Actions runner that lives on a machine where `agy`
# is already logged in via Google OAuth. Because it uses the CLI's cached OAuth
# session (not an API key), every review is billed against your Google AI Ultra
# rate limits -- i.e. free under the subscription, no metered API spend.
#
# Flow: resolve PR -> `gh pr diff` -> build an adversarial-reviewer prompt
#       (+ repo style guide) -> `agy --print` under a PTY -> post via `gh pr comment`.
#
# See README.md (installed into target repos as .github/AGY-REVIEWER.md) for setup, the issue #76
# PTY workaround, and the ToS caveat.
set -euo pipefail

# Helpers are defined FIRST: the configuration block below calls log() from the MAX_PROMPT_BYTES
# clamp, so log() must already exist. (Defined later, a clamp that fires would die with
# `log: command not found` under set -e instead of warning — a latent misconfiguration trap.)
log() { printf '[agy-review] %s\n' "$*" >&2; }

# A capture that is only a BACKEND ERROR, not a review. When agy's upstream is down it prints
# something like:
#
#   Error: Eligibility check failed: UNAVAILABLE (code 503): The service is currently unavailable.
#
# That text is non-empty, so have_text() alone treats it as a valid review, POSTs it as the
# review comment, and the job exits 0 -- a green check for a review that never happened. Observed
# on SLAC PR #14: the `review` check passed in 7 seconds with that string as its entire body,
# twice. A control that cannot fail is worse than no control.
#
# The match is deliberately ANCHORED to the start of the capture rather than being a substring
# search. A genuine review may legitimately quote a 503, an "UNAVAILABLE" constant, or an
# eligibility check while reviewing retry logic -- and aborting on that would be the
# false-positive the OAuth guard's design notes warn about. agy's backend failures occupy the
# WHOLE capture and begin with `Error:`, so requiring the error at the top, in a capture short
# enough to contain nothing else, separates the two without a content heuristic.
#
# Adopted FROM SLAC, which had it while the template and the other installs did not.
# >>> SELFTEST-EXTRACT: service-error guard
# `have_text` lives INSIDE this block, not above it: `backend_outage_should_fail` calls it, so
# an extracted block without it is not self-contained and the selftest cannot run it. It is a
# general helper used throughout the script -- the marker is a comment, so its position
# changes nothing about where the function is defined.
have_text() { [ -s "$1" ] && grep -q '[^[:space:]]' "$1"; }
# Any `Error:` on line 1 of a short capture -- NOT an enumeration of known backend messages.
#
# This was previously a list: Eligibility check failed | UNAVAILABLE | RESOURCE_EXHAUSTED |
# INTERNAL | DEADLINE_EXCEEDED | code 4xx/5xx. That list is unmaintainable by construction,
# and it failed exactly as you would expect. Observed on CyberChef-MCP PR #72, where agy posted
# this as its entire review and the `review` check went GREEN:
#
#     ## Antigravity review (Gemini via Ultra)
#
#     Error: timeout waiting for response
#
# A timeout is not in the list, so the guard let it through -- reproducing the precise failure
# the guard exists to prevent, one signature later. Enumerating failure modes only ever catches
# the ones already seen.
#
# Inverted: treat ANY leading `Error:` as a failure. The false-positive protection does not come
# from the message text at all, and never did -- it comes from the two conditions below, which
# are unchanged: the error must be on LINE 1, and the whole capture must be under
# AGY_ERROR_MAX_BYTES. The load-bearing half is the LINE 1 anchor: a review does not *open*
# with a bare "Error:" line, however short it is.
# Case-insensitive on the word itself: under `unbuffer` agy 1.2.x prints its eligibility failure
# as lowercase `error: Eligibility check failed: PERMISSION_DENIED (code 403) ...`, and the
# case-sensitive `Error:` let it through. Observed on VeridianOS PR #5: that line was posted as
# the entire review and the `review` check went green in 14 seconds.
AGY_ERROR_RE='^[[:space:]]*[Ee][Rr][Rr][Oo][Rr]:'
# Secondary safety net, not the primary discriminator. A backend failure IS the whole capture and
# is a couple of hundred bytes; the cap only ensures that if a review ever did open with an
# "Error:" line, length alone keeps it from being discarded. Reviews shorter than this exist, so
# the cap is deliberately generous rather than a claim about minimum review length.
AGY_ERROR_MAX_BYTES="${AGY_ERROR_MAX_BYTES:-2000}"
# `head -n 1`, not `head -n 5`. grep matches line-by-line, so scanning five lines
# means "any of the first five lines is an error line" -- which would discard a short,
# genuine review whose heading is on line 1 and which happens to discuss `Error: ...
# UNAVAILABLE` on line 3. That is the false positive the anchoring was supposed to
# prevent, reintroduced by the very check meant to enforce it. The invariant is that a
# backend failure IS the whole capture, so only the first line can carry it.
# A tool notice from agy's own file viewer, returned as the whole answer when the model stopped
# after a truncated read instead of writing a review. Observed on VeridianOS PR #15: the posted
# "review" was only `_The output was truncated. To view the remaining content, please use the
# ContentOffset parameter ..._`, under a green check. Same rules as the error line: line 1 of a
# short capture.
AGY_TOOL_NOTICE_RE='^[[:space:]_*]*The output was truncated\.'
service_error_present() {
  [ -s "$1" ] || return 1
  [ "$(wc -c < "$1")" -le "$AGY_ERROR_MAX_BYTES" ] || return 1
  head -n 1 "$1" | grep -qE "$AGY_ERROR_RE|$AGY_TOOL_NOTICE_RE"
}

# True when the run must FAIL rather than post: the backend errored at least once and no review
# survived. A separate named function rather than an inline condition, because a structural grep
# for the condition is too weak to notice it being disabled -- `if false && [ ... ]` still
# contains the text a grep looks for, and that mutation came back NOT CAUGHT.
#
# The `have_text` half is redundant today (the retry loop truncates the capture whenever it
# counts a backend error) and is kept deliberately: it makes the "post nothing" guarantee
# independent of that truncation surviving a future edit.
backend_outage_should_fail() {
  [ "${1:-0}" -gt 0 ] || return 1
  ! have_text "$2"
}

# agy's own --print-timeout marker. When the turn is still running at the timeout, agy does NOT
# fail: it exits 0 and prints `[agy] print timeout after 5m0s with turn in progress; returning
# partial output`, alone or after whatever it had written so far. That capture is non-empty, so
# `have_text` passed it and it was posted AS the review -- a truncated review, or a bare timeout
# notice, under a green check. Measured 2026-09-28 (agy 1.2.12): a 10 s timeout on a long prompt
# exits 0 with exactly that line as the whole 78-byte capture. Anchored at a line start so a
# review that merely quotes the message mid-sentence is not discarded.
AGY_TIMEOUT_RE='^\[agy\] print timeout after '
print_timeout_present() { [ -s "$1" ] && grep -qE "$AGY_TIMEOUT_RE" "$1"; }
# <<< SELFTEST-EXTRACT
# Guarding against a leak of agy's interactive Google OAuth login flow. When agy's cached
# session lapses on the runner, `--print` emits the login prompt (a live OAuth URL + "paste the
# authorization code here") instead of a review; that text is non-empty, so have_text() alone
# would treat it as a valid review and POST it — leaking the URL into a public PR comment (the
# incident this guards against).
#
# The guard keys on the ONE artifact that reliably distinguishes agy's login flow from any
# review: a live Google OAuth *authorization URL* (scheme + host + endpoint path). This choice
# is deliberate and is the convergence point of several rounds of agy's own adversarial review:
#   * It does NOT false-positive on reviewing the reviewer or on an OAuth-related PR. A code
#     review quotes this script's BARE regex ("accounts.google.com/o/oauth2", no scheme) or
#     discusses auth in prose; neither contains the "https://…/o/oauth2" URL form. (Earlier
#     signature/prompt-phrase heuristics wrongly flagged such reviews.)
#   * It needs NO "is this a review?" exemption, so it CANNOT be disarmed by a section header
#     (or the phrase "blocking issues") appearing in the same output as a URL — a false
#     NEGATIVE would be a leak. (Earlier "### Blocking issues" exemptions had exactly this hole,
#     and were also brittle to header case / trailing punctuation.)
# So this is both necessary (agy's login flow always prints the URL) and sufficient (nothing
# else legitimately carries a live authorization URL), with no heuristic that flips between
# false-positive and false-negative.
#
# The regex requires the scheme (`https?://`) and the host + `/o/oauth2` endpoint prefix, but
# deliberately NOT a trailing slash: agy round-4 flagged that a `.../o/oauth2/` requirement
# would miss a URL emitted as `.../o/oauth2?client_id=…` or bare `.../o/oauth2` (a leak). The
# scheme is what keeps a review's bare-pattern quote from matching, so dropping the trailing
# slash loses no safety.
# >>> SELFTEST-EXTRACT: oauth guard
OAUTH_URL_RE='https?://accounts\.google\.com/o/oauth2'

# The single guard, used at BOTH the retry-loop capture (Layer 1) and the assembled body before
# posting (Layer 3): true iff a text contains a live OAuth authorization URL. There is no
# separate heuristic and no "is this a review?" exemption — earlier a secondary "authentication
# failed or timed out" substring fallback was tried, but agy round-4 flagged it (correctly) as
# broad enough to abort a genuine review that merely discusses auth-timeout handling. The live
# URL is always present in a real login flow, so it alone is both necessary and sufficient; a
# lapse is detected AND a leak is blocked by the same unconditional check.
oauth_url_present() { [ -s "$1" ] && grep -qiE "$OAUTH_URL_RE" "$1"; }

# Append this run's denied egress targets (deduplicated, tagged, bounded to the newest 500 lines)
# to a host-private log created mode 600. Never called with a public destination.
agy_record_denied() {
  local src="$1" dst="$2" tag="$3" stamp
  [ -s "$src" ] || return 0
  stamp="$(date -u +%FT%TZ)"
  (
    umask 077
    {
      if [ -f "$dst" ]; then cat "$dst"; fi
      sort -u "$src" | cut -c1-253 | sed "s|^|${stamp} ${tag} |"
    } > "$dst.new" || exit 1
    tail -n 500 "$dst.new" > "$dst.tmp" && mv -f "$dst.tmp" "$dst" && rm -f -- "$dst.new"
  )
}

# True when the captured output is a jail launch diagnostic rather than agy's: its first
# non-blank line comes from bwrap itself or from the in-jail wrapper (argv0 `agy-jail`).
agy_jail_failed() {
  [ -s "$1" ] || return 1
  grep -m1 -v '^[[:space:]]*$' "$1" | grep -qE '^(bwrap|agy-jail): '
}

# Credential shapes that must never reach a public PR comment. Every pattern is anchored on a
# leading non-identifier boundary, so an ordinary identifier (`task-...`, `disk-...`, a word ending
# in `ghp`) cannot match and wrongly block a review. agy's --sandbox does NOT confine
# reads (verified 2026-11-22: from the sandbox it read a canary file in $HOME with both its file
# tool and a shell `cat`), so a prompt-injected diff could make it print a token from the runner
# host. Fail closed on any match in agy's output. The log names only the KIND that matched, never
# the value, since Actions logs of a public repository are public too.
# One table for detection AND redaction (`~`-separated, a non-whitespace IFS so empty fields
# survive: kind, leading boundary, core, trailing
# boundary), so the two can never drift apart. The boundaries keep an ordinary identifier
# (`task-...`, a word ending in `ghp`) from matching.
agy_credential_patterns() {
  cat <<'CREDS'
google-oauth-access-token~(^|[^A-Za-z0-9_-])~ya29\.[0-9A-Za-z_-]{20,}~
google-oauth-refresh-token~(^|[^A-Za-z0-9_/-])~1//0[0-9A-Za-z_-]{20,}~
github-token~(^|[^A-Za-z0-9_])~gh[pousr]_[A-Za-z0-9]{30,}~
github-fine-grained-pat~(^|[^A-Za-z0-9_])~github_pat_[A-Za-z0-9_]{40,}~
private-key-block~~-----BEGIN [A-Z ]*PRIVATE KEY-----~
jwt~(^|[^A-Za-z0-9_-])~eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}~
aws-access-key-id~(^|[^A-Za-z0-9])~(AKIA|ASIA)[0-9A-Z]{16}~([^A-Za-z0-9]|$)
anthropic-key~(^|[^A-Za-z0-9_-])~sk-ant-[A-Za-z0-9_-]{32,}~
openai-key~(^|[^A-Za-z0-9_-])~sk-(proj-)?[A-Za-z0-9]{32,}~([^A-Za-z0-9_-]|$)
slack-token~(^|[^A-Za-z0-9_-])~xox[abprs]-[A-Za-z0-9-]{10,}~
CREDS
}
credential_kind_present() {
  [ -s "$1" ] || return 1
  local kind lead core trail
  while IFS='~' read -r kind lead core trail; do
    if grep -qE -- "${lead}${core}${trail}" "$1"; then printf '%s' "$kind"; return 0; fi
  done < <(agy_credential_patterns)
  return 1
}
# Replace every credential-shaped string in $1 (in place) with `[REDACTED: <kind>]`, keeping the
# boundary characters. A private-key block is replaced whole, from its BEGIN line through its END
# line (or to the end of the text, which fails safe). Several passes, because adjacent matches
# can share a boundary character. The caller re-scans and fails closed on anything left.
agy_redact_credentials() {
  # In memory, not through a scratch file: the capture is bounded (GitHub's comment limit), and a
  # predictable sibling in a shared TMPDIR would be readable or symlink-raceable. The `x` sentinel
  # keeps trailing newlines through the command substitution.
  local f="$1" buf kind lead core trail groups n pass
  for pass in 1 2 3; do
    while IFS='~' read -r kind lead core trail; do
      if [ "$kind" = private-key-block ]; then
        buf="$(sed -E "/${core}/,/-----END [A-Z ]*PRIVATE KEY-----/c\\[REDACTED: ${kind}]" "$f" && printf x)" || return 1
      else
        groups="${core//[^(]/}"; n=$(( 2 + ${#groups} ))
        buf="$(sed -E "s#${lead:-()}${core}${trail:-()}#\\1[REDACTED: ${kind}]\\${n}#g" "$f" && printf x)" || return 1
      fi
      printf '%s' "${buf%x}" > "$f"
    done < <(agy_credential_patterns)
    : "$pass"
  done
}
# <<< SELFTEST-EXTRACT

# --- configuration (all env-overridable from the workflow) ---------------------
AGY_BIN="${AGY_BIN:-agy}"
command -v "$AGY_BIN" >/dev/null 2>&1 || AGY_BIN="$HOME/.local/bin/agy"
# Absolute paths before anything is created or a subshell changes directory: agy runs in a
# subshell that first changes into the sandbox, so a relative TMPDIR (which every later mktemp honors), a relative
# RUNNER_TEMP or a relative AGY_BIN would otherwise resolve against the sandbox.
AGY_BIN="$(command -v "$AGY_BIN" 2>/dev/null || printf '%s' "$AGY_BIN")"
case "$AGY_BIN" in /*) ;; *) AGY_BIN="$PWD/$AGY_BIN" ;; esac
for _v in TMPDIR RUNNER_TEMP; do
  case "${!_v:-}" in
    ''|/*) ;;
    *) if _abs="$(cd "${!_v}" 2>/dev/null && pwd -P)"; then export "$_v=$_abs"; else unset "$_v"; fi ;;
  esac
done
unset _v _abs
AGY_MODEL="${AGY_MODEL:-}"                 # empty = agy's configured default (Gemini 3.x Pro)
AGY_EFFORT="${AGY_EFFORT:-high}"           # low|medium|high
# Base timeout for a normal review. Scaled up for a large diff further down -- see
# `scale_timeout_for_diff`. Set AGY_PRINT_TIMEOUT explicitly to pin it and skip the scaling.
AGY_PRINT_TIMEOUT_EXPLICIT="${AGY_PRINT_TIMEOUT:+set}"
# Base 10m (was 5m). Backported from three repositories that each pinned 10-15m after reviews
# timed out at the old base: Infinity-Context PR #31 saw a 79 KB INLINED diff at high effort time
# out twice at the scaled 367 s, and GH-ListRollup / RustyNES_MiSTer pinned 10m / 15m for the same
# reason. The scaling below adds to this base for large diffs; the per-attempt cap still bounds it.
AGY_PRINT_TIMEOUT="${AGY_PRINT_TIMEOUT:-10m}"
# Seconds of budget per MiB of diff handed to agy, on top of the base. Reading a 1.6 MB patch and
# reasoning over it is not work a five-minute budget can absorb, and the failure is indistinguishable
# from a backend outage: `Error: timeout waiting for response`, three times, with no review.
#
# 900, not the 240 this started with: a diff handed over as a FILE costs agy 6-8 minutes almost
# whatever its size (reading it through its tools at high effort is mostly fixed cost). Measured on
# VeridianOS: a 1.15 MB diff took 465 s, and a 426 KB one timed out three times at 300 + 240 x 0.41
# = 397 s. At 900 s/MiB the 426 KB diff gets 665 s and anything over ~650 KB the cap.
AGY_TIMEOUT_SECONDS_PER_MIB="${AGY_TIMEOUT_SECONDS_PER_MIB:-900}"
AGY_PRINT_TIMEOUT_MAX_SECONDS="${AGY_PRINT_TIMEOUT_MAX_SECONDS:-1800}"

# Both of the above reach `$(( ... ))`, so both are validated before they get there.
# >>> SELFTEST-EXTRACT: numeric env validation
# Validate and canonicalize a numeric setting that will reach an arithmetic expansion.
#
# @param $1 name of the variable to validate, assigned in place.
# @param $2 default to fall back to when the value is not a non-negative decimal integer.
#
# Two hazards, and the honest status of each is different -- so they are recorded separately
# rather than under one "unsafe input" heading.
#
#  1. Bash arithmetic recursively expands variable CONTENTS as a name, so `$(( V ))` with V=a and
#     a=5 yields 5, at any depth. Contents that are a command substitution are NOT executed on
#     bash 5.3 (measured here): they reach the parser as a literal and are refused with
#     "arithmetic syntax error: operand expected". This was reported in review as a CWE-78, and an
#     earlier version of this comment asserted the execution -- WRONGLY, from a nested-quoting
#     artifact in the test that ran it. It does not reproduce. What is left is still worth
#     refusing: a value naming another variable silently means something other than what it says.
#  2. Digits-only is not sufficient on its own. `09` is all digits, and bash reads the leading
#     zero as OCTAL:
#         $(( 1000000 * 09 / 1048576 ))   ->  value too great for base
#     So a *valid* setting takes the script down under `set -e`. That one is demonstrated, not
#     theoretical, and is the reason this function exists. Canonicalizing to base 10 here, once,
#     means no downstream `$(( ))` has to remember `10#`.
# The locals are `_nne_`-prefixed because this function assigns THROUGH A NAME the caller supplies.
# Plain `name`/`val` locals shadow a caller variable of the same name, and the failure is silent --
# `normalize_numeric_env val 240` reads and writes the local, leaving the caller's `val` untouched.
# Verified: with unprefixed locals, `val=07; normalize_numeric_env val 240` leaves val as `07`.
normalize_numeric_env() {
  local _nne_name="$1" _nne_default="$2" _nne_val="${!1}"
  case "$_nne_val" in
    ""|*[!0-9]*)
      log "$_nne_name ('$_nne_val') is not a non-negative integer; using the default ($_nne_default)"
      printf -v "$_nne_name" '%s' "$_nne_default" ;;
    *) printf -v "$_nne_name" '%s' "$(( 10#$_nne_val ))" ;;   # digits-only, verified above
  esac
}
# <<< SELFTEST-EXTRACT
normalize_numeric_env AGY_TIMEOUT_SECONDS_PER_MIB   900
normalize_numeric_env AGY_PRINT_TIMEOUT_MAX_SECONDS 1800
# >>> SELFTEST-EXTRACT: error cap validation
# AGY_ERROR_MAX_BYTES is set above, inside the service-error block (which cannot call
# normalize_numeric_env: it is defined later). A non-numeric value (GH-ListRollup PR #6) or 0
# (PR #7) made service_error_present's `-le` test always fail, silently disabling the
# backend-error guard. A function, so the selftest can run it with bad values (PR #7, round 2).
agy_validate_error_cap() {
  normalize_numeric_env AGY_ERROR_MAX_BYTES 2000
  [ "$AGY_ERROR_MAX_BYTES" -gt 0 ] || { log "AGY_ERROR_MAX_BYTES=0 would disable the backend-error guard; using the default (2000)"; AGY_ERROR_MAX_BYTES=2000; }
}
# <<< SELFTEST-EXTRACT
agy_validate_error_cap
# OS-level isolation of agy (bubblewrap). agy's own --sandbox does NOT confine reads, and agy loads
# the user's whole config (MCP servers, skills, hooks), so a prompt-injected diff could read host
# files or drive powerful local tools. With `bwrap` (the default) agy runs in a jail with an empty
# private HOME, read-only /usr and /etc, the review sandbox, and a D-Bus that is an xdg-dbus-proxy
# exposing only agy's own Secret Service item. `none` runs agy unjailed (not recommended). A host
# missing bwrap/xdg-dbus-proxy/gdbus fails closed rather than silently running unjailed.
AGY_ISOLATION="${AGY_ISOLATION:-bwrap}"
case "$AGY_ISOLATION" in bwrap|none) ;; *) echo "AGY_ISOLATION must be bwrap or none, got '$AGY_ISOLATION'" >&2; exit 1 ;; esac
# Attributes agy uses to look up its keyring item (observed on the Secret Service bus).
AGY_KEYRING_ATTRS="${AGY_KEYRING_ATTRS:-username=antigravity service=gemini}"
# Network egress from the jail. `filtered` (default) gives the jail NO network namespace access:
# its only route out is an allowlisting HTTPS CONNECT proxy outside the jail, reached through a
# bind-mounted Unix socket. Without this, a prompt-injected diff could make agy read its own
# Google login token (which it must be able to read) and send it anywhere. `open` keeps the host
# network (not recommended). Hosts are EXACT names, never wildcards: `.googleapis.com` would
# include Cloud Storage, where anyone can own a writable bucket.
AGY_EGRESS="${AGY_EGRESS:-filtered}"
case "$AGY_EGRESS" in filtered|open) ;; *) echo "AGY_EGRESS must be filtered or open, got '$AGY_EGRESS'" >&2; exit 1 ;; esac
# Observed 2026-11-22: the Gemini backends, the OAuth token endpoint, and www.googleapis.com for the
# userinfo eligibility check. Telemetry, the avatar host and the auto-updater are left out (agy
# works without them).
AGY_EGRESS_ALLOW="${AGY_EGRESS_ALLOW:-daily-cloudcode-pa.googleapis.com aicode.googleapis.com oauth2.googleapis.com www.googleapis.com}"
# Every allowlisted host is TLS-intercepted and each request is REBUILT with the proxy's own Host
# header: Google's front end routes by Host on ANY googleapis connection (verified: a request to
# oauth2, aicode or daily-cloudcode-pa carrying `Host: storage.googleapis.com` reaches Cloud
# Storage). A host listed here additionally accepts only a body-less GET of exactly this path (no
# query; matched literally): www.googleapis.com also serves the Cloud Storage JSON API, and agy
# needs only its userinfo call there. Entries are `host=/path`, space-separated.
AGY_EGRESS_PATH_RULES="${AGY_EGRESS_PATH_RULES:-www.googleapis.com=/oauth2/v2/userinfo}"
AGY_DIFF_MODE="${AGY_DIFF_MODE:-auto}"     # auto|inline|file. A diff is passed to agy either inlined
                                           # in the --print prompt, or written to a FILE agy reads with
                                           # its own tools. `auto` inlines a diff that fits under the
                                           # arg-size budget and files anything larger (so large PRs are
                                           # never truncated); `inline`/`file` force one path.
MAX_DIFF_BYTES="${MAX_DIFF_BYTES:-5000000}" # sanity cap on a pathological diff (5 MB). No longer the
                                           # arg-size limit -- a large diff goes to agy as a file, not
                                           # as an argv value -- just a guard against a runaway diff.
# Same validation as the other numerics (agy review, GH-ListRollup PR #4): a non-numeric value such
# as `5MB` failed agy_cut_file's `-gt 0` test and SILENTLY disabled the cap, and `0` does the same.
normalize_numeric_env MAX_DIFF_BYTES 5000000
[ "$MAX_DIFF_BYTES" -gt 0 ] || { log "MAX_DIFF_BYTES=0 would disable the sanity cap; using the default (5000000)"; MAX_DIFF_BYTES=5000000; }
MAX_PROMPT_BYTES="${MAX_PROMPT_BYTES:-120000}" # hard ceiling on the INLINED prompt: agy takes it as a
                                           # --print VALUE (not stdin), and a single execve argument
                                           # cannot exceed MAX_ARG_STRLEN (PAGE_SIZE*32 = 128 KiB on
                                           # Linux). Over it, execve fails with E2BIG before agy even
                                           # starts. In `auto` mode this is the inline/file threshold;
                                           # it also backstops the assembled prompt in every mode.
ARG_SIZE_CEILING=120000                     # hard cap: a configured MAX_PROMPT_BYTES above the
                                           # MAX_ARG_STRLEN-derived safe bound would defeat the guard
                                           # and re-expose E2BIG, so clamp any override down to it.
                                           # 120000, not 128000: MAX_ARG_STRLEN is 131072, and the
                                           # prompt is not the only thing execve must fit - argv[0],
                                           # the other flags and the whole environment count against
                                           # the limit too. A ceiling 3 KB under it left no room for
                                           # them, so a large environment could still hit E2BIG on a
                                           # prompt the guard had just declared safe.
# Require a POSITIVE integer at or below the ceiling. The `-gt 0` half is load-bearing, not
# cosmetic: a negative override (e.g. MAX_PROMPT_BYTES=-1) satisfies `-le "$ARG_SIZE_CEILING"`,
# so without it the clamp is skipped and the `head -c "$MAX_PROMPT_BYTES"` prompt cap below runs
# as GNU `head -c -1` (print all-but-last-byte) — silently defeating the E2BIG backstop. A
# non-numeric value trips the `2>/dev/null` and is clamped too.
#
# normalize_numeric_env first (agy review, GH-ListRollup PR #4): `[ ]` reads `080000` as decimal and
# lets it through, but the `$(( MAX_PROMPT_BYTES - ... ))` arithmetic below parses a leading zero as
# octal and aborts the run under `set -e` ("value too great for base"). Normalizing strips the
# leading zero and maps anything non-numeric (including a negative) to the default.
normalize_numeric_env MAX_PROMPT_BYTES 120000
if ! { [ "$MAX_PROMPT_BYTES" -gt 0 ] && [ "$MAX_PROMPT_BYTES" -le "$ARG_SIZE_CEILING" ]; } 2>/dev/null; then
  log "MAX_PROMPT_BYTES='${MAX_PROMPT_BYTES}' invalid, non-positive, or above the ${ARG_SIZE_CEILING}-byte ceiling; clamping"
  MAX_PROMPT_BYTES="$ARG_SIZE_CEILING"
fi
STYLE_GUIDE="${STYLE_GUIDE:-.github/agy-review.md}"  # repo-relative; loaded if present
                                           # (dedicated name -- avoids colliding with GEMINI.md/AGENTS.md)
# Per-run log path. A FIXED name would collide between concurrent jobs whenever
# RUNNER_TEMP is unset (local runs fall back to /tmp, which is shared) -- and a
# predictable /tmp path is a symlink/file-tampering target. The run-id / PID
# suffix keeps it unique per run.
LOG="${RUNNER_TEMP:-/tmp}/agy-review-${GITHUB_RUN_ID:-$$}.log"
AGY_LOCK="${AGY_LOCK:-$HOME/.gemini/antigravity-cli/.agy-review.lock}"
AGY_LOCK_WAIT="${AGY_LOCK_WAIT:-600}"      # seconds to wait for the agy lock before proceeding
normalize_numeric_env AGY_LOCK_WAIT 600   # flock -w rejects a non-numeric value and aborts
AGY_RETRIES="${AGY_RETRIES:-3}"            # attempts to get a usable agy response
AGY_RETRY_DELAY="${AGY_RETRY_DELAY:-15}"   # base backoff seconds between retries (grows per attempt)
# Both reach (( )) arithmetic: `08` would abort on an octal parse and `0` retries would skip every
# attempt and report "no review output after 0 attempt(s)". Same validation as the other numerics.
normalize_numeric_env AGY_RETRIES     3
normalize_numeric_env AGY_RETRY_DELAY 15
[ "$AGY_RETRIES" -ge 1 ] || AGY_RETRIES=1
MARKER="<!-- antigravity-pr-review -->"

# The comment body's format -- sentinels plus the split/trim helpers -- lives in a sourceable
# file so `agy-review-selftest.sh` can test the REAL implementation rather than a copy of it.
# This script does its work at top level and so cannot itself be sourced.
# shellcheck source=scripts/_agy_comment_body.sh
. "$(dirname -- "${BASH_SOURCE[0]}")/_agy_comment_body.sh"

MAX_BODY_BYTES="${MAX_BODY_BYTES:-60000}"
# Reaches `$(( MAX_BODY_BYTES - 4096 ))`: `60k` or `060000` would abort the run there (agy review,
# GH-ListRollup PR #4). It must also leave room for that 4096-byte reserve.
normalize_numeric_env MAX_BODY_BYTES 60000
[ "$MAX_BODY_BYTES" -gt 8192 ] || { log "MAX_BODY_BYTES=${MAX_BODY_BYTES} leaves no room for a review; using the default (60000)"; MAX_BODY_BYTES=60000; }

# The jq program that finds THIS bot's existing review comment on the PR, so it can be edited
# rather than replaced. Named, and exercised directly by `scripts/agy-review-selftest.sh`,
# because its predecessor (which selected comments to DELETE) was wrong twice in ways nothing
# observed: first the just-posted comment was not excluded, so a run deleted its own review;
# then jq's `--arg` was handed to `gh api`, which has no such flag, so the step died silently.
# Both were invisible from the outside — the review still posted.
#
# The AUTHOR filter is load-bearing, not cosmetic: without it, any user could put the marker
# (an HTML comment, invisible when rendered) in a PR comment and have this bot edit it. Only
# ever touch our own bot's comments. `first` picks the OLDEST match, so if duplicates exist
# from an older version of this script, the canonical thread is the one that keeps growing.
#
# COUPLING, stated because it is invisible otherwise: the `github-actions[bot]` login pin assumes
# the review is posted with `GITHUB_TOKEN` from Actions, which is the only path the workflow has.
# Move this to a GitHub App or a PAT and the filter stops finding its own comments — it will post
# a fresh review every round instead of editing one, and the archive stops accumulating.
#
# Do not "fix" that in advance by dropping the login and matching on `.user.type == "Bot"` plus the
# marker. Under a PAT the comment's type is `"User"`, not `"Bot"`, so that clause fails in the same
# scenario; and the marker is an HTML comment, so any bot that quotes or summarizes a PR comment
# carries it along, which would let this script PATCH over ANOTHER bot's comment. Losing a review
# that way is worse than posting a duplicate. Change this filter when the auth changes, not before,
# and match on whatever identity the new credential actually presents.
# >>> SELFTEST-EXTRACT: ours-comment filter
SELECT_OURS_JQ='[ .[]
  | select(.user.type == "Bot" and .user.login == "github-actions[bot]")
  | select(.body | contains($marker)) ]
  | first
  | .id // empty'
readonly SELECT_OURS_JQ
# <<< SELFTEST-EXTRACT

REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY not set}"

# The EXIT trap is installed HERE, before the first mktemp anywhere in the script (the first
# is in agy_has_write_access, called from the event dispatch below). Installed later, an abort
# during the permission lookup leaked its temp file, and the pre-declarations then reset
# _perm_err so cleanup() could never see it (agy review, GH-ListRollup PR #6).
# Remove every temp file on exit. Pre-declared so the trap is safe under `set -u` even if the
# script exits before a given file is created.
diff_file= diff_err= meta_file= prompt_file= out_file= raw= body_file= agy_diff_file= agy_sandbox= agy_jail_home= agy_jail_rt= agy_proxy_pid= agy_egress_pid= jq_err= log_tail= redacted_kinds= left= prior_body_file= archived_file= api_err=
# Also created mid-flight (permission lookup, compare-API merge base, archive trimming); a signal
# or abort while one of those commands runs would otherwise leak the file in /tmp.
_perm_err='' compare_err='' trimmed=''
# Set to 1 if agy printed its interactive OAuth login flow instead of a review (lapsed session);
# gates the no-post abort below. Pre-declared so `${auth_failed:-0}` is set-u-safe on every path.
auth_failed=0
# Counts backend-error captures across attempts; see `service_error_present`. Pre-declared so
# `${service_errors:-0}` is set-u-safe even on paths that never enter the retry loop.
service_errors=0
# Set when the large-diff fallback below creates refs/agy/* so the trap can remove them.
agy_refs_created=
# Set by the AGY_DRY_RUN block so cleanup KEEPS the two artifacts dry-run exists to expose. The
# whole point of dry run is "let me look at the assembled prompt", and the EXIT trap fires on the
# `exit 0` at the end of that block -- so it deleted the prompt on the way out, every time.
# Everything else is still removed; only these two are spared, and their paths are printed.
keep_artifacts=
cleanup() {
  # Built as an argv ARRAY rather than as `rm -f ${v:+"$v"} ...`.
  #
  # The problem being solved is the EMPTY operand: `rm -f ""` is silent and exits 0 on GNU
  # coreutils -- which is why an unconditional `rm -f "$unset_var"` never surfaced on the Linux
  # runner -- but BSD/macOS `rm` writes "No such file or directory" to stderr for it.
  #
  # A note for the next reader, because this was raised in review and the intuition is wrong:
  # `rm -f ${v:+"$v"}` does NOT word-split. Bash honors the quotes inside the `:+` alternate
  # word, so a path with a space or a glob character survives as one operand. Verified:
  #
  #     v='a*b';    rm -f ${v:+"$v"}   ->   + rm -f 'a*b'      (siblings axxb, ayb untouched)
  #     v='a file'; rm -f ${v:+"$v"}   ->   one operand        (siblings a, file untouched)
  #
  # The array is used anyway, for a reason the expansion form genuinely does not cover: it lets
  # `--` terminate option parsing, so a temp path that begins with `-` is treated as a path
  # rather than as flags. An array element is also one word by construction, which does not
  # depend on knowing that `:+` quoting rule.
  local keep_set="${keep_artifacts:-}"
  local -a doomed=()
  local f
  # `${v:-}` on every name, even though all of them are pre-declared at the top of the script and
  # cannot be unset here. Belt-and-braces on purpose: this is an EXIT trap, so if a future edit
  # ever moves the trap above the pre-declarations, the failure would be an `unbound variable`
  # abort DURING cleanup -- temp files left behind, and a confusing error masking the real exit
  # cause. The pre-declaration stays and is still the actual guarantee; this is the cheap second
  # line for a function that only ever runs while something else is going wrong.
  for f in "${diff_file:-}" "${diff_err:-}" "${meta_file:-}" "${out_file:-}" "${raw:-}" "${body_file:-}" \
           "${jq_err:-}" "${log_tail:-}" "${prior_body_file:-}" "${archived_file:-}" "${api_err:-}" \
           "${_perm_err:-}" "${compare_err:-}" "${trimmed:-}"; do
    [ -n "$f" ] && doomed+=("$f")
  done
  if [ -z "$keep_set" ]; then
    for f in "${prompt_file:-}" "${agy_diff_file:-}"; do
      [ -n "$f" ] && doomed+=("$f")
    done
  fi
  [ ${#doomed[@]} -gt 0 ] && rm -f -- "${doomed[@]}"
  # agy's private working directory (see `agy_sandbox` below). It is this run's own `mktemp -d`,
  # outside the checkout, so removing it whole cannot touch anything else. Kept on dry run (it holds
  # the handed-off diff that dry run exists to expose).
  if [ -n "${agy_sandbox:-}" ] && [ -d "$agy_sandbox" ] \
     && { [ -z "$keep_set" ] || [ -z "${agy_diff_file:-}" ]; }; then
    rm -rf -- "$agy_sandbox"   # an inline dry run has nothing in it to keep
  fi
  # `|| true`: under set -e a failed kill (the proxy already exited) would otherwise end this trap
  # before the jail home and runtime dirs below are removed.
  [ -n "${agy_proxy_pid:-}" ] && { kill "$agy_proxy_pid" 2>/dev/null || true; }
  [ -n "${agy_egress_pid:-}" ] && { kill "$agy_egress_pid" 2>/dev/null || true; }
  [ -n "${agy_jail_home:-}" ] && [ -d "$agy_jail_home" ] && rm -rf -- "$agy_jail_home"
  [ -n "${agy_jail_rt:-}" ] && [ -d "$agy_jail_rt" ] && rm -rf -- "$agy_jail_rt"
  if [ -n "${agy_refs_created:-}" ] && [ -n "${PR:-}" ]; then
    # Hooks and fsmonitor disabled: these git calls run after agy, with the job token in the
    # environment, so they must not execute anything a compromised checkout could have planted.
    git -c core.hooksPath=/dev/null -c core.fsmonitor=false update-ref -d "refs/agy/pr-${PR}" 2>/dev/null || true
    git -c core.hooksPath=/dev/null -c core.fsmonitor=false update-ref -d "refs/agy/base-${PR}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Does $1 actually hold write access to this repository?
#
# `author_association` is NOT a permission check, which is the trap this replaces. It is a
# relationship label: a user granted only the *Triage* role reports as COLLABORATOR while
# holding no write access at all, and OWNER/MEMBER describe org membership rather than
# repository rights. On a self-hosted runner — someone's actual workstation — "may this
# person schedule execution here" has to be answered by the permissions API, not inferred
# from a label that was never meant to answer it.
#
# Fails CLOSED: any API error, missing token, or unrecognized role denies. A reviewer that
# stops running is a visible annoyance; one that runs for the wrong person is not.
#
# But fail-closed makes the error TEXT load-bearing, which is why stderr is captured and logged
# rather than sent to /dev/null. Denying and swallowing the reason makes two very different
# situations look identical in the log: "this person genuinely has no write access" (working as
# intended, one user affected) and "the token lost its scope / the API is rate-limited" (the
# reviewer is now dead for EVERYONE and nothing says so). The first is a decision; the second is
# an outage wearing a decision's clothes, and it would sit undiagnosed until someone noticed
# reviews had quietly stopped.
agy_has_write_access() {
  # `local` like the other helpers -- except _perm_err, which stays global ON PURPOSE: the EXIT
  # trap's cleanup() must see it to remove the temp file if the run aborts mid-lookup.
  local _login _login_enc _perm
  _login="${1:-}"
  [ -n "$_login" ] || { log "no login to check for write access"; return 1; }
  _perm_err="$(mktemp)"
  # URL-encode the login before it becomes a path segment, the same way
  # base_ref is handled below. GitHub logins are restricted in practice, but
  # this value arrives from event payload rather than from us, and an unexpected
  # character would corrupt the path and fail into the error branch as if the
  # user simply had no write access - a silent wrong answer on a permission
  # check, which is the worst place to have one.
  _login_enc="$(jq -rn --arg v "$_login" '$v|@uri')"
  if _perm="$(gh api "repos/${REPO}/collaborators/${_login_enc}/permission" \
                --jq '.permission // empty' 2>"$_perm_err")"; then
    rm -f "$_perm_err"
  else
    # Redacted before logging. gh does not echo credentials in its error text today, but this
    # log lands in a PUBLIC Actions log, and "today" is not a property worth betting a token on.
    log "permission lookup for '${_login}' FAILED: $(tr '\n' ' ' < "$_perm_err" \
          | sed -E 's/(gh[pousr]|github_pat)_[A-Za-z0-9_]+/<redacted-token>/g' \
          | cut -c1-400)"
    log "denying by default. A 404 here is an ordinary non-collaborator; a 401/403 or a rate"
    log "limit means the token is the problem and EVERY review will skip until it is fixed."
    rm -f "$_perm_err"
    return 1
  fi
  case "$_perm" in
    admin|maintain|write) return 0 ;;
    *) log "user '${_login}' has repository permission '${_perm:-<none>}'; write required"
       return 1 ;;
  esac
}

# --- resolve the PR number from the triggering event --------------------------
case "${GITHUB_EVENT_NAME:-}" in
  pull_request|pull_request_target)
    PR="$(jq -r '.pull_request.number' "$GITHUB_EVENT_PATH")"
    ;;
  issue_comment)
    is_pr="$(jq -r '.issue.pull_request // empty' "$GITHUB_EVENT_PATH")"
    body="$(jq -r '.comment.body // ""' "$GITHUB_EVENT_PATH")"
    commenter="$(jq -r '.comment.user.login // ""' "$GITHUB_EVENT_PATH")"
    [ -n "$is_pr" ] || { log "comment is not on a PR; skipping"; exit 0; }
    case "$body" in
      /agy-review*) : ;;
      *) log "comment is not an /agy-review command; skipping"; exit 0 ;;
    esac
    # THE authoritative permission gate, not defence in depth. The workflow `if:` can only
    # filter on `author_association`, which the payload carries but which does not answer the
    # question being asked (see `agy_has_write_access`). Treat that `if:` as a cheap
    # pre-filter that avoids booting a runner for obvious strangers, and settle the actual
    # decision here, where an API call is possible. A stranger's `/agy-review` must never
    # schedule an agy run on the self-hosted host.
    agy_has_write_access "$commenter" \
      || { log "commenter '${commenter}' lacks write access; skipping"; exit 0; }
    PR="$(jq -r '.issue.number' "$GITHUB_EVENT_PATH")"
    ;;
  *)
    PR="${1:-}"
    [ -n "$PR" ] || { log "unknown event; pass a PR number as \$1"; exit 1; }
    ;;
esac
# $PR is interpolated into API paths, refspecs (`refs/agy/pr-${PR}`) and a `gh` invocation, so it
# is validated once here rather than trusted at each of those sites. From an event payload it is a
# jq-parsed number and safe; from the `*)` branch above it is `$1`, i.e. whatever a hand-run or a
# future caller passed. "Practically safe" is a property of today's callers, not of the variable.
case "$PR" in
  ''|*[!0-9]*) log "invalid PR number '${PR}'; expected digits only"; exit 1 ;;
esac
log "reviewing ${REPO}#${PR}"

# --- fetch metadata first, because the fork gate + the large-diff fallback depend on it ---
# FAIL-CLOSED. A `{}` fallback was harmless when the only field read was the title,
# but is NOT harmless now that isCrossRepository gates whether an untrusted diff
# reaches agy: a lookup failure must never be indistinguishable from "same-repo".
diff_file="$(mktemp)"; meta_file="$(mktemp)"; diff_err="$(mktemp)"
gh pr view "$PR" --repo "$REPO" --json title,isCrossRepository,baseRefName,headRefOid > "$meta_file" \
  || { log "gh pr view failed; refusing to review without knowing the PR's head repo"; exit 1; }

# THE FORK GATE (see the trust model at the agy invocation below). The workflow `if:`
# blocks fork PRs on the `pull_request` trigger, but it CANNOT do so on `issue_comment`:
# that payload carries no head-repo information at all, so a collaborator commenting
# `/agy-review` on a fork PR would otherwise schedule this job against an external diff.
# A trusted person typing the command does not make the DIFF trusted -- and the diff is
# what agy ingests, under --dangerously-skip-permissions, on the maintainer's machine.
# Enforced here because this is the first point where the answer is knowable.
# NOT `.isCrossRepository // empty` -- jq's `//` treats `false` as absent, so the
# alternative fires on exactly the same-repo case this gate is meant to admit, and every
# legitimate review would be refused. Read the raw value and match all three shapes.
is_fork="$(jq -r '.isCrossRepository' "$meta_file")"
case "$is_fork" in
  true)
    log "PR #${PR} is from a fork; refusing to run agy on an external diff"
    log "(review it by hand, or push the branch into this repo first)"
    exit 0
    ;;
  false) : ;;
  *) log "could not determine whether PR #${PR} is cross-repository; refusing"; exit 1 ;;
esac

# --- fetch the diff, with a fallback for a diff over GitHub's API line limit -----
# `gh pr diff` can fail for two very different reasons and they must not be
# conflated. A genuine error (auth, network, bad PR) is fatal. But GitHub's API
# also refuses any diff over 20,000 lines with HTTP 406, and that is not an error
# -- it just means the PR is too large to fetch through the API. A large PR is
# exactly the one worth reviewing, so fall back to computing the diff locally.
#
# SECURITY: this fetches the PR's objects but NEVER checks them out. The working
# tree is untouched, and the PR content is treated exactly as the API diff was --
# read-only bytes that become prompt text and are never executed. So the fallback
# does not widen the trust boundary the workflow already sets: whatever governs
# whether a given PR's diff is allowed to reach agy at all (the workflow `if:`
# pre-filter plus `agy_has_write_access` above; see the trust model at the agy
# invocation below) is
# unchanged, and this only changes HOW an already-permitted diff is obtained when
# it is too large for the API. `refs/agy/*` are private namespaces (cannot clobber
# a real branch) and are removed on exit. Auth goes through `http.extraheader` for
# the one fetch rather than a persisted credential, so a `persist-credentials:
# false` checkout stays intact; a hand-run without GH_TOKEN falls through to git's
# ambient credential helper.
# ($diff_err was allocated alongside $diff_file / $meta_file above, so the cleanup
# trap never references it before it exists.)
# >>> SELFTEST-EXTRACT: diff-limit classifier
# GitHub refuses an oversized diff TWO ways, with different wording: over
# 20,000 lines, and over 300 FILES. Both are HTTP 406 and both mean the same
# thing here -- the PR is too big for the API, not that anything went wrong --
# so both must reach the local fallback. Matching only the `lines` variant made
# a wide-but-shallow PR -- hundreds of files, well under the line limit, as a
# bulk regeneration of test baselines produces -- fail the review outright
# instead of falling back.
#
# On a match, print the limit that actually fired and succeed. Reporting
# "20,000-line" for a file-count refusal is the same class of misleading triage
# signal that made this bug look like a runner auth failure in the first place.
# A function, not inline, so the self-test executes the real matcher and label
# against both GitHub messages rather than grepping for its text.
diff_limit_hit() {
  grep -qiE 'diff exceeded the maximum number of (lines|files)' "$1" || return 1
  if grep -qi 'maximum number of files' "$1"; then
    printf '300-file'
  else
    printf '20,000-line'
  fi
}
# <<< SELFTEST-EXTRACT
if ! gh pr diff "$PR" --repo "$REPO" > "$diff_file" 2>"$diff_err"; then
  if hit="$(diff_limit_hit "$diff_err")"; then
    base_ref="$(jq -r '.baseRefName // empty' "$meta_file")"
    if [ -z "$base_ref" ] || [ "$base_ref" = "null" ]; then
      log "diff exceeds the API limit and the base branch is unknown; cannot fall back"
      exit 1
    fi
    log "diff exceeds GitHub's ${hit} API limit; falling back to a local git diff"
    pr_ref="refs/agy/pr-${PR}"
    base_local="refs/agy/base-${PR}"
    agy_refs_created=1
    fetch_refspecs=( "+refs/pull/${PR}/head:${pr_ref}" "+refs/heads/${base_ref}:${base_local}" )
    # `bearer` is what Actions' GITHUB_TOKEN accepts; a personal token from
    # `gh auth token` is rejected ("remote: invalid credentials"), so a hand-run
    # falls through to git's ambient credentials. Neither path persists anything.
    #
    # The header is supplied through GIT_CONFIG_* (git >= 2.31), NOT `git -c`. Identical
    # config, different exposure: `git -c "http.extraheader=...bearer $TOKEN"` puts the token
    # in the process's argv, and `/proc/<pid>/cmdline` is WORLD-READABLE on Linux — any
    # concurrent job or any local process can read it for the lifetime of the fetch. This
    # runner is a shared workstation, so that window is real. `/proc/<pid>/environ` is
    # restricted to the same UID, so moving the secret from argv to the environment is what
    # actually closes it. Do not "simplify" this back to `git -c`.
    # Every fetch on this path goes through agy_fetch so they all carry the header: the
    # follow-up merge-base fetches below once omitted it, which fails on a private repo
    # (agy review, switch2-hub-patcher PR #1). Token first, then git's ambient credentials.
    agy_fetch() {
      if [ -n "${GH_TOKEN:-}" ] \
         && GIT_CONFIG_COUNT=1 \
            GIT_CONFIG_KEY_0="http.extraheader" \
            GIT_CONFIG_VALUE_0="AUTHORIZATION: bearer ${GH_TOKEN}" \
            git fetch --no-tags --quiet "$@" 2>/dev/null; then
        return 0
      fi
      git fetch --no-tags --quiet "$@" 2>/dev/null
    }
    if [ -n "${GH_TOKEN:-}" ] \
       && GIT_CONFIG_COUNT=1 \
          GIT_CONFIG_KEY_0="http.extraheader" \
          GIT_CONFIG_VALUE_0="AUTHORIZATION: bearer ${GH_TOKEN}" \
          git fetch --no-tags --quiet origin "${fetch_refspecs[@]}" 2>/dev/null; then
      :
    elif git fetch --no-tags --quiet origin "${fetch_refspecs[@]}"; then
      log "fetched PR refs using git's ambient credentials (token header not accepted)"
    else
      log "could not fetch PR #${PR} refs for the local diff fallback"
      exit 1
    fi
    # The workflow clones with `fetch-depth: 1`, so the two refs above arrive as
    # DISCONNECTED shallow histories -- there is no common ancestor for
    # `git merge-base` to find, and it fails even though both refs fetched fine.
    # (A full local clone hides this completely, which is how it got missed.)
    #
    # Ask the API for the merge base and fetch that one commit, rather than
    # unshallowing: a repo with a large history would pay a full clone on a path
    # that only exists because the PR is already unusually big. Diffing two
    # commits needs both trees, not the history between them, so a shallow fetch
    # of the merge base is enough.
    merge_base="$(git merge-base "$base_local" "$pr_ref" 2>/dev/null || true)"
    if [ -z "$merge_base" ]; then
      head_sha="$(jq -r '.headRefOid // empty' "$meta_file")"
      # Percent-encode the branch name for the URL path. `@uri` encodes EVERY reserved
      # character, `/` included -- `ci/foo` becomes `ci%2Ffoo`, verified with
      # `jq -rn --arg v 'ci/foo' '$v|@uri'`. GitHub's compare endpoint resolves the
      # escaped form back to the branch, so a `<type>/<short-desc>` name works either
      # way and the encoding is harmless there.
      #
      # It is NOT harmless to skip: `%` and `#` are legal in a git ref name and a raw
      # URL does not survive them -- `%` starts an escape sequence and `#` truncates
      # the path at the fragment. Either would fail silently into the `|| true` below,
      # which is exactly the class of bug this whole path exists to avoid.
      base_enc="$(jq -rn --arg v "$base_ref" '$v|@uri')"
      compare_err="$(mktemp)"
      api_base="$(gh api "repos/${REPO}/compare/${base_enc}...${head_sha}" \
                    --jq '.merge_base_commit.sha' 2>"$compare_err" || true)"
      [ -n "$api_base" ] || log "compare API gave no merge base ($(head -c 300 "$compare_err" | tr '\n' ' '))"
      rm -f "$compare_err"
      if [ -n "$api_base" ] && [ "$api_base" != "null" ]; then
        if agy_fetch origin "$api_base" \
           || agy_fetch --deepen=250 origin "${fetch_refspecs[@]}"; then
          merge_base="$(git merge-base "$base_local" "$pr_ref" 2>/dev/null || true)"
          # Fall back to the API's merge base only if that commit is actually
          # here. When the SHA fetch fails and `--deepen=250` succeeds without
          # reaching it, the object is absent, and using it anyway surfaced later
          # as the generic "local git diff failed" -- the wrong diagnosis.
          if [ -z "$merge_base" ]; then
            if git cat-file -e "${api_base}^{commit}" 2>/dev/null; then
              merge_base="$api_base"
            else
              log "compare API merge base ${api_base} is not in the local clone after both fetches"
            fi
          fi
          [ -z "$merge_base" ] \
            || log "shallow clone: merge base ${merge_base} resolved via the compare API"
        fi
      fi
    fi
    if [ -z "$merge_base" ]; then
      log "could not compute the merge base for PR #${PR}"; exit 1
    fi
    git diff "$merge_base" "$pr_ref" > "$diff_file" || {
      log "local git diff failed for PR #${PR}"; exit 1; }
    log "local diff: $(wc -l < "$diff_file") lines, $(wc -c < "$diff_file") bytes"
  else
    log "gh pr diff failed:"; sed 's/^/  /' "$diff_err" >&2
    exit 1
  fi
fi

if ! have_text "$diff_file"; then log "empty diff; nothing to review"; exit 0; fi

truncated=""
# `head -c` is a BYTE cut and can slice a multi-byte UTF-8 sequence in half. That is accepted, not
# overlooked: the UTF-8 scrub further down (`iconv -c`, python3 fallback) removes any partial
# sequence before the prompt reaches agy, so the split never escapes this file.
#
# A line-aware cut would avoid creating the split, but cannot honor a byte ceiling — and the
# ceiling is the actual constraint, since this bounds what is handed to a model with a hard context
# limit. One minified-asset line in a diff can exceed the whole budget by itself, so "cut at a line
# boundary" degenerates to either overshooting the cap or emitting nothing. Exact where the limit is
# real, tolerant where the damage is already handled.
# --- truncation helpers ---------------------------------------------------------
# Every byte cap in this script goes through these, so the self-test can EXECUTE them rather than
# grep for their text (CodeRabbit review, VeridianOS PR #5). A model that is handed a cut input must
# be told so, and a notice appended before a later cut can be cut away -- so each cap that can hide
# content writes its own notice AFTER cutting. Notices are plain ASCII: character count = bytes.
# >>> SELFTEST-EXTRACT: truncation helpers
# Cut file $1 to at most $2 bytes. Succeeds only when it actually cut. A non-positive size is
# refused, never handed to GNU `head -c -N`, which prints all-but-the-last-N bytes (a tiny
# MAX_BODY_BYTES or MAX_PROMPT_BYTES minus a notice gets there; agy review of SLAC #24).
agy_cut_file() {
  [ "$2" -gt 0 ] 2>/dev/null || return 1
  [ "$(wc -c < "$1")" -gt "$2" ] || return 1
  head -c "$2" "$1" > "$1.cut" && mv "$1.cut" "$1"
}
# Prompt text telling the model the diff it was given stops after $1 bytes.
agy_diff_truncation_notice() {
  printf '\n--- NOTE: TRUNCATED DIFF ---\n'
  printf 'The diff above is only the first %s bytes; everything after that was cut and you have NOT\n' "$1"
  printf 'seen it. Say at the top of your review that it covers a truncated diff, and do not state or\n'
  printf 'imply that the whole change was reviewed.\n'
}
# Cap prompt file $1 at $2 bytes, keeping room for a notice written after the cut.
agy_cap_prompt() {
  local notice=$'\n\n--- NOTE: TRUNCATED PROMPT ---\nThe prompt, including the diff, was cut at the argument-size limit; you have NOT seen\nthe rest. Say at the top of your review that it covers a truncated diff, and do not state or\nimply that the whole change was reviewed.\n'
  # Size FIRST, like agy_cap_round: cutting to the budget minus the notice before asking whether
  # the prompt even exceeds the budget cut prompts that already fit, and told the model a whole
  # diff was truncated (agy reviews of SLAC #24 and RustyNES_MiSTer #78).
  [ "$(wc -c < "$1")" -gt "$2" ] || return 1
  agy_cut_file "$1" "$(( $2 - ${#notice} ))" || return 1
  printf '%s' "$notice" >> "$1"
}
# Cap review output $1 at $2 bytes so the posted comment fits GitHub's limit, saying what was cut.
agy_cap_round() {
  local size notice
  size="$(wc -c < "$1")"
  [ "$size" -gt "$2" ] || return 1
  notice="$(printf '\n\n> **Review truncated:** about %s bytes of this round were omitted to stay under GitHub'"'"'s comment size limit.' "$(( size - $2 + 200 ))")"
  # -1: the trailing newline written below is part of the budget too.
  agy_cut_file "$1" "$(( $2 - ${#notice} - 1 ))" || return 1
  printf '%s\n' "$notice" >> "$1"
}
# Drop invalid/partial UTF-8 sequences from file $1 in place (a byte cut can split one). Every byte
# cap that feeds agy or a PR comment calls this, so the two paths cannot drift apart again (the
# review-output path once had iconv only; agy review, switch2-hub-patcher PR #1). iconv first
# (glibc and macOS ship it), then python3 -- also when iconv is present but fails. That case is the
# common one, not an edge: GNU `iconv -c` writes the cleaned bytes but EXITS 1 whenever it dropped
# anything ("incomplete character or shift sequence at end of buffer"), i.e. on exactly the byte-cut
# input this exists for. The old iconv-only branches discarded that output, so on glibc hosts the
# scrub was a no-op whenever it mattered (measured: glibc 2.44). A sanitizer that
# exits 0 with ZERO bytes is a malfunction, not a result: replace the file only with non-empty
# output, otherwise keep the original. A failed mv is fatal under `set -e`; the function returns
# 0 when no sanitizer succeeded, so a host with neither tool proceeds with the original bytes.
agy_scrub_utf8() {
  # iconv's exit status is NOT the success test. With -c, GNU iconv exits 1 precisely when it
  # dropped invalid bytes -- after writing every valid byte -- so 0 and 1 both mean "usable
  # output". Treating 1 as failure made python3 a silent hard requirement (it was the only path
  # that ever succeeded on byte-cut input), although it is documented as a fallback. Any higher
  # status, or empty output, still falls through to python3.
  local iconv_rc
  if command -v iconv >/dev/null 2>&1; then
    iconv_rc=0
    iconv -c -f UTF-8 -t UTF-8 "$1" > "$1.utf8" 2>/dev/null || iconv_rc=$?
    if [ "$iconv_rc" -le 1 ] && [ -s "$1.utf8" ]; then
      mv "$1.utf8" "$1"; return
    fi
  fi
  rm -f "$1.utf8"
  if command -v python3 >/dev/null 2>&1 \
      && python3 -c 'import sys; sys.stdout.buffer.write(open(sys.argv[1],"rb").read().decode("utf-8","ignore").encode("utf-8"))' \
           "$1" > "$1.utf8" 2>/dev/null && [ -s "$1.utf8" ]; then
    mv "$1.utf8" "$1"; return
  fi
  rm -f "$1.utf8"
}
# <<< SELFTEST-EXTRACT

# >>> SELFTEST-EXTRACT: script capture filter
# Filter (stdin -> stdout) for the script(1) fallback capture. util-linux `script` writes a
# "Script started on ..." record as the first line of the typescript and a "Script done on ..."
# record as the last, and `-q` does NOT suppress them in the file (measured: util-linux 2.42.4;
# -q only silences the terminal messages). Left in, they make an EMPTY or failed agy run look
# like non-empty output, and they push a backend error off the first line where
# service_error_present looks for it -- so the retry loop could accept, and post, session
# metadata or a failure as a review. Only those two framing records are removed: the first line
# if it is a start record, and the last non-blank line if it is a done record. A review that
# merely mentions such text elsewhere is left intact.
#
# Locale-independent (agy review, GH-ListRollup PR #6): util-linux translates the "Script started
# on" / "Script done on" prose through gettext, but NOT the key=value fields it appends, so a
# record is recognized by `[COMMAND="` (start; we always run `script -c`) or a trailing
# `[COMMAND_EXIT_CODE="N"]` (done) as well as by the English prefix. Forcing LC_ALL=C on script
# was rejected: it would also change agy's own locale, and with it its UTF-8 handling.
agy_strip_script_records() {
  awk '
    NR == 1 && (/^Script started on / || /\[COMMAND="/) { next }
    { lines[++n] = $0 }
    END {
      last = n
      while (last > 0 && lines[last] ~ /^[[:space:]]*$/) last--
      if (last > 0 && (lines[last] ~ /^Script done on / || lines[last] ~ /\[COMMAND_EXIT_CODE="[0-9]+"\][[:space:]]*$/)) {
        last--
        while (last > 0 && lines[last] ~ /^[[:space:]]*$/) last--
      } else {
        last = n
      }
      for (i = 1; i <= last; i++) print lines[i]
    }'
}
# <<< SELFTEST-EXTRACT

diff_truncated=
if agy_cut_file "$diff_file" "$MAX_DIFF_BYTES"; then
  diff_truncated=1
  truncated=$'\n\n> Note: the diff exceeded '"${MAX_DIFF_BYTES}"$' bytes and was truncated for this review.'
  log "diff truncated to the ${MAX_DIFF_BYTES}-byte sanity cap"
fi

# --- build the prompt ----------------------------------------------------------
title="$(jq -r '.title // ""' "$meta_file")"
# Bound the style guide so it can never fill the whole arg budget and crowd out the diff -- or, in
# file mode, the file pointer that the MAX_PROMPT_BYTES guard would otherwise truncate away, leaving
# agy with no diff at all. Reserve headroom for the instructions, the diff header, and the pointer.
# head -c is byte-accurate (a shell substring is by character, which is wrong for multi-byte UTF-8).
style=""
if [ -f "$STYLE_GUIDE" ]; then
  style_cap=$(( MAX_PROMPT_BYTES - 8192 )); [ "$style_cap" -lt 0 ] && style_cap=0
  style="$(head -c "$style_cap" "$STYLE_GUIDE")"
  [ "$(wc -c < "$STYLE_GUIDE")" -gt "$style_cap" ] && log "STYLE_GUIDE capped to ${style_cap} bytes so the diff / file pointer always fits under the arg budget"
fi

# The instruction HEAD (everything except the diff body). agy takes the whole prompt as one --print
# argv value, capped at MAX_ARG_STRLEN (128 KiB), so a diff that would push the prompt over the budget
# is handed to agy as a FILE it reads with its own tools instead of being inlined or truncated. Small
# diffs still inline (the proven path); only a large PR takes the file path -- and a large PR used to
# fail outright with E2BIG, so the file path can only improve on that.
prompt_file="$(mktemp)"
{
  cat <<EOF
You are an adversarial code reviewer doing a first-pass review of a GitHub pull request.
Act as a skeptical senior engineer, not the author. Be concise, specific, and honest.

Output (GitHub-flavored Markdown, no preamble):
1. A one-sentence summary of what the PR does.
2. "### Blocking issues" -- correctness, security, data-loss, or breaking-change
   problems only. Write "None found." if there are none.
3. "### Suggestions" -- non-blocking improvements; cite file and line where you can.
4. "### Nitpicks" -- optional, keep terse.
Do not praise. Focus on what could be wrong. If the change is trivial, say so briefly.

PR title: ${title}
EOF
  if [ -n "$style" ]; then
    printf '\n--- PROJECT STYLE GUIDE (enforce these) ---\n%s\n' "$style"
  fi
} > "$prompt_file"

# Decide inline vs file. Budget: keep the whole argv prompt under MAX_PROMPT_BYTES (itself clamped
# below the 128 KiB ceiling), reserving a small margin for the diff header. `file` mode writes the
# diff into agy's working directory (the repo checkout) and points the prompt at it by name.
head_bytes="$(wc -c < "$prompt_file")"
diff_bytes="$(wc -c < "$diff_file")"
inline_budget=$(( MAX_PROMPT_BYTES - head_bytes - 512 ))   # margin covers the diff header + file notice
[ "$inline_budget" -lt 0 ] && inline_budget=0             # a huge STYLE_GUIDE can exceed it: file the diff
# agy's private working directory. agy runs under --dangerously-skip-permissions and ingests an
# untrusted diff (a prompt-injection surface), so it must never have the repository checkout in its
# workspace: a write to .git/hooks or .git/config there would later execute in a git command that
# holds the job token. agy is therefore started FROM this empty directory (its workspace root),
# the large-diff handoff file is written INTO it, and only it is passed to --add-dir. It lives in
# RUNNER_TEMP (outside the checkout, wiped between jobs) and the EXIT trap removes it.
agy_sandbox="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/agy-sandbox.XXXXXX")"
# Stored canonical: a relative RUNNER_TEMP/TMPDIR would otherwise put a relative path in the prompt
# (agy's file tool needs an absolute one) and make `--add-dir` resolve against the sandbox itself
# after the `cd "$agy_sandbox"` below.
agy_sandbox="$(cd "$agy_sandbox" && pwd -P)"
case "$agy_sandbox/" in
  "$(pwd -P)"/*)
    log "agy sandbox ${agy_sandbox} is inside the checkout; refusing to expose the repository to agy"
    exit 1 ;;
esac

use_file=0
case "$AGY_DIFF_MODE" in
  file)   use_file=1 ;;
  inline) use_file=0 ;;
  *)      [ "$diff_bytes" -gt "$inline_budget" ] && use_file=1 ;;
esac

if [ "$use_file" = "1" ]; then
  # The diff goes into agy's private sandbox directory (see `agy_sandbox` above), never into the
  # checkout. The prompt hands agy an ABSOLUTE path, and the run below adds the sandbox (only) to
  # agy's workspace via --add-dir. Both are load-bearing and were proven on the live runner: agy's
  # sandboxed file tool does NOT resolve a relative path against the shell CWD (it uses its own
  # workspace root), so a relative path comes back "does not exist on the filesystem".
  agy_diff_file="$agy_sandbox/agy-review-diff.patch"
  cp "$diff_file" "$agy_diff_file"
  {
    printf '\n--- UNIFIED DIFF (in a file) ---\n'
    printf 'The unified diff for this PR is in the file at the absolute path `%s`\n' "$agy_diff_file"
    printf '(it is too large to inline). Read that file IN FULL with your file-reading tool first, then\n'
    printf 'produce the review above from its actual contents. Do not review from the PR title alone.\n'
  } >> "$prompt_file"
  log "diff is ${diff_bytes} bytes (> ${inline_budget}-byte inline budget); handing it to agy as ${agy_diff_file}"
else
  # Forced inline (AGY_DIFF_MODE=inline) on an over-budget diff: the MAX_PROMPT_BYTES guard below
  # still prevents E2BIG by truncating, but warn since `auto` would have filed it in full instead.
  [ "$diff_bytes" -gt "$inline_budget" ] && log "warning: forced inline with a ${diff_bytes}-byte diff over the ${inline_budget}-byte budget; the prompt will be truncated -- use AGY_DIFF_MODE=auto to file it in full"
  { printf '\n--- UNIFIED DIFF ---\n'; cat "$diff_file"; } >> "$prompt_file"
  log "diff is ${diff_bytes} bytes; inlined into the prompt"
fi
# The sanity cap above may have cut the diff. The note in `$truncated` used to reach only the
# posted comment, so the model was told it had the whole diff and could present a partial review
# as complete. Say so in the prompt itself, whichever way the diff was delivered.
if [ -n "$diff_truncated" ]; then
  agy_diff_truncation_notice "$MAX_DIFF_BYTES" >> "$prompt_file"
fi

# --- guard the argv size (E2BIG) -----------------------------------------------
# agy takes the prompt as a --print VALUE, so the whole prompt is one execve argument
# and must stay under MAX_ARG_STRLEN (128 KiB). MAX_DIFF_BYTES bounds the diff, but the
# boilerplate + style guide ride on top, so cap the assembled prompt as a hard backstop.
#
# Cutting the tail also cuts whatever notice was appended there (the TRUNCATED DIFF note above),
# and the model would never learn that its input was cut. So the cut leaves room for a notice of
# its own, written AFTER the cut where nothing can remove it (agy review on VeridianOS PR #5).
# The notice is plain ASCII, so its character count is its byte count.
if agy_cap_prompt "$prompt_file" "$MAX_PROMPT_BYTES"; then
  truncated+=$'\n\n> Note: the review prompt was capped to '"${MAX_PROMPT_BYTES}"$' bytes (execve arg-size limit).'
  log "prompt capped to ${MAX_PROMPT_BYTES} bytes (execve arg-size ceiling)"
fi
# Byte truncation (here or in the MAX_DIFF_BYTES cap above) can slice a multi-byte UTF-8 sequence.
# agy is a Rust binary and std::env::args() PANICS on a non-UTF-8 argument, which would reintroduce
# an instant startup failure -- exactly the class of bug this guard exists to prevent. Drop any
# invalid/partial sequences with `agy_scrub_utf8` (iconv, then python3), so a host without iconv can't
# leave a split sequence in the prompt. Explicit branches inside it, not `&& mv || rm`: that idiom
# masks an mv failure and would then feed agy the original (possibly split) bytes. A successful
# sanitize must replace the file; a failed mv is fatal (set -e); a failed/absent sanitizer leaves the
# original and we proceed (it may already be clean, and any residual invalid byte now surfaces via the
# captured stderr rather than a silent instant crash). Its non-empty guard matters here: the prompt is
# always non-empty (boilerplate at minimum), so mv-ing an empty sanitizer result over $prompt_file
# would wipe the prompt and hand agy nothing.
agy_scrub_utf8 "$prompt_file"

# Escape hatch for verifying the diff-acquisition and prompt-assembly path (including
# the large-PR API-limit fallback and the inline/file decision) without spending an agy
# run or posting to the PR. Prints the assembled prompt to stdout and stops before agy.
if [ -n "${AGY_DRY_RUN:-}" ]; then
  log "AGY_DRY_RUN set: printing the assembled prompt and exiting before agy runs"
  if [ "${use_file:-0}" = "1" ]; then
    log "prompt: $(wc -c < "$prompt_file") bytes (diff handed off on disk as ${agy_diff_file:-?}, $(wc -c < "$diff_file") bytes)"
  else
    log "prompt: $(wc -c < "$prompt_file") bytes (diff inlined, $(wc -c < "$diff_file") bytes)"
  fi
  cat "$prompt_file"
  # Keep the prompt (and the on-disk diff handoff, if used) so they can actually be inspected --
  # see `keep_artifacts` at the cleanup trap. Paths go to stderr so a `> prompt.txt` redirect of
  # stdout still captures only the prompt.
  keep_artifacts=1
  log "kept for inspection: $prompt_file${agy_diff_file:+ and $agy_diff_file}"
  log "(remove them yourself; every other temp file was cleaned up as usual)"
  exit 0
fi

# Scale the timeout with the size of the diff agy actually has to read.
#
# A fixed 5m is right for an ordinary PR and hopeless for a release merge. Observed on
# CyberChef-MCP#83 -- 323 files, 39,856 lines, 1.6 MB handed off as a file -- where agy hit the
# 5m ceiling on all three attempts, twice in a row, at 5m01s each time. The job then failed with
# `Error: timeout waiting for response`, which is INDISTINGUISHABLE from a backend outage: the
# guard did its job and refused to post a fake review, but nothing told the reader that the cause
# was diff size rather than an outage.
#
# Deliberately keyed on the diff handed to agy, not on the PR's file count: what costs time is the
# bytes it must read and reason over.
#
# An explicit AGY_PRINT_TIMEOUT wins, so a caller can still pin it.

# >>> SELFTEST-EXTRACT: duration parser
# Parse a duration ("90", "90s", "5m", "1h") to seconds. Echoes nothing and returns 1 if the value
# is not one of those forms -- deliberately, so a caller can decide, rather than feeding a
# non-numeric token into an arithmetic expansion where `$(( 1x + 60 ))` is a SYNTAX ERROR that
# takes the whole script down under `set -e`.
duration_to_seconds() {
  local v="$1" n unit
  case "$v" in
    *[!0-9smh]*|"") return 1 ;;                      # stray characters, or empty
    *h) n="${v%h}"; unit=3600 ;;
    *m) n="${v%m}"; unit=60 ;;
    *s) n="${v%s}"; unit=1 ;;
    *)  n="$v";     unit=1 ;;
  esac
  case "$n" in ""|*[!0-9]*) return 1 ;; esac         # "m" alone, or "1m2s"
  # `10#` forces base 10. Without it bash reads a leading zero as OCTAL, so a perfectly valid
  # `08m` dies with "value too great for base" -- and `010s` would silently mean 8 seconds.
  printf '%s\n' $(( 10#$n * unit ))
}
# <<< SELFTEST-EXTRACT

# >>> SELFTEST-EXTRACT: diff-size scaling
# Kept below the duration-parser block, not beside the other constants: SELFTEST-EXTRACT ranges
# end at the first closing marker, so a block declared around this one would be truncated at the
# parser's `<<<` and silently extract without the function under test.
readonly BYTES_PER_MIB=$(( 1024 * 1024 ))

# Raise --print-timeout in proportion to the diff agy has to read.
#
# @param $1 size of the diff handed to agy, in bytes. Passed explicitly rather than read from the
#           enclosing scope, so the function's inputs are visible at the call site.
scale_timeout_for_diff() {
  local bytes="${1:-0}"       # explicit default rather than leaning on `$(( ))` treating "" as 0
  # Whitespace is stripped BEFORE validating, not after: some `wc` implementations pad their count,
  # and " 1619782 " is not digits-only, so validating first would quietly fall back to 0 and
  # disable the scaling entirely -- a silent no-op, which is worse than the crash being guarded
  # against. Then the same guard the settings get, so a non-numeric value falls back rather than
  # becoming a syntax error in the expansion below.
  bytes="${bytes//[[:space:]]/}"
  normalize_numeric_env bytes 0
  [ -z "$AGY_PRINT_TIMEOUT_EXPLICIT" ] || { log "AGY_PRINT_TIMEOUT set explicitly ($AGY_PRINT_TIMEOUT); not scaling"; return 0; }

  # Computed from BYTES, not from truncated whole MiB: `mib = bytes / 1048576` in integer
  # arithmetic gives a 1.99 MiB diff exactly one MiB of extra budget, which is the wrong side to
  # round on for the case this exists to fix.
  local extra=$(( bytes * AGY_TIMEOUT_SECONDS_PER_MIB / BYTES_PER_MIB ))
  [ "$extra" -gt 0 ] || return 0        # rounds to nothing: keep the base budget untouched

  local base_s
  if ! base_s="$(duration_to_seconds "$AGY_PRINT_TIMEOUT")"; then
    log "AGY_PRINT_TIMEOUT ('$AGY_PRINT_TIMEOUT') is not a recognized duration; leaving it alone"
    return 0
  fi

  local scaled=$(( base_s + extra ))
  # Ceiling, so a pathological diff cannot pin the self-hosted runner for an hour.
  [ "$scaled" -gt "$AGY_PRINT_TIMEOUT_MAX_SECONDS" ] && scaled="$AGY_PRINT_TIMEOUT_MAX_SECONDS"

  AGY_PRINT_TIMEOUT="${scaled}s"
  log "diff is ${bytes} bytes; raised --print-timeout to ${AGY_PRINT_TIMEOUT} (base ${base_s}s + ${extra}s)"
}
# <<< SELFTEST-EXTRACT
scale_timeout_for_diff "$diff_bytes"

# --- run agy headless, under a PTY (works around agy issue #76: -p drops --------
#     stdout when stdout is not a TTY, e.g. piped/redirected/subprocess) ---------
flags=( --print-timeout "$AGY_PRINT_TIMEOUT" --sandbox --dangerously-skip-permissions )
# In file-handoff mode agy must read the on-disk diff, and --sandbox otherwise confines its file
# tool to its own workspace root (NOT the shell CWD) — so add the sandbox directory that holds it.
# Never the checkout (see `agy_sandbox`). Proven necessary on the live runner: without this (and the
# absolute path above) the large-diff handoff file reads back as "does not exist".
[ "${use_file:-0}" = "1" ] && flags+=( --add-dir "$agy_sandbox" )

# agy gets an ALLOWLISTED environment (`env -i` plus the variables below), never the job's.
# agy runs under --dangerously-skip-permissions and ingests an untrusted diff (prompt-injection
# surface); `gh` and the large-diff fetch run in THIS script, before and after, and agy needs none
# of the job's credentials: not GH_TOKEN/GITHUB_TOKEN, not ACTIONS_RUNTIME_TOKEN (cache/artifact
# API), not ACTIONS_ID_TOKEN_* (OIDC), and not whatever a workflow puts in `env:` under an
# ordinary-looking name (a DATABASE_URL with a password in it, say), which a name-pattern denylist
# would miss. What agy does need is its user session: HOME for its config and conversation store,
# PATH, the locale, and XDG_RUNTIME_DIR + DBUS_SESSION_BUS_ADDRESS to reach the desktop keyring that
# holds its Google OAuth session. Verified on the runner host with no other agy running: agy
# authenticates and answers under exactly this environment. (An earlier test that "hung" had
# collided with a concurrent review: agy is one singleton per user, which is why the flock below
# exists.) AGY_ENV_PASSTHROUGH may name extra variables, space-separated, for a host that needs one.
agy_allowlisted_env_args() {
  local name
  local -a extra=()
  # `read -a` splits on whitespace without pathname expansion, so a glob character in the
  # passthrough list can never expand against the checkout.
  # -d '' reads across newlines too, so a multi-line YAML block (`AGY_ENV_PASSTHROUGH: |`) keeps
  # every entry; read returns 1 at end of input, which is expected.
  IFS=$' \t\n' read -r -d '' -a extra <<<"${AGY_ENV_PASSTHROUGH:-}" || true
  printf '%s\0' "-i"
  for name in HOME PATH USER LOGNAME SHELL LANG LANGUAGE LC_ALL LC_CTYPE LC_MESSAGES TERM TMPDIR TZ \
              XDG_RUNTIME_DIR XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME XDG_STATE_HOME \
              DBUS_SESSION_BUS_ADDRESS DISPLAY WAYLAND_DISPLAY XAUTHORITY "${extra[@]}"; do
    # A valid identifier only: never an assignment, and never a leading digit (`1` would read the
    # positional parameter $1, and `1FOO` aborts with "bad substitution").
    [[ "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    [ -n "${!name+x}" ] && printf '%s\0' "${name}=${!name}"
  done
  return 0
}
agy_env=( env )
while IFS= read -r -d '' arg; do agy_env+=( "$arg" ); done < <(agy_allowlisted_env_args)

# The egress proxy, run with the host's python3 OUTSIDE the jail (embedded, so the vendored file
# set stays the same in every repository). The self-test extracts and exercises it.
agy_egress_proxy_src() {
  cat <<'AGYPY'
"""agy-review egress proxy: the jail's only route to the network (stdlib only, Python >= 3.11).

Serves HTTP CONNECT on a Unix socket that is bind-mounted into the jail. A CONNECT is accepted only
for port 443 of a host that EXACTLY equals an allowlist entry (no wildcards: `.googleapis.com`
would include Cloud Storage, where anyone can own a writable bucket).

Every accepted tunnel is TLS-terminated with a per-run leaf certificate the jail trusts (the CA key
never enters the jail). A raw tunnel is not enough: Google's front end routes by the Host header,
so a request on a connection to ANY allowed googleapis host that says `Host: storage.googleapis.com`
reaches Cloud Storage (verified for oauth2, aicode and daily-cloudcode-pa). So each connection
carries exactly one HTTP/1.1 request, which the proxy validates strictly and REBUILDS:
  * Host is set by the proxy to the CONNECT host; a missing, duplicate or foreign Host is refused;
  * only origin-form targets; bare CR/LF, control bytes, DEL, non-ASCII, obs-fold and non-token
    header names are refused;
  * the body is forwarded exactly once: one Content-Length (that many bytes), or Transfer-Encoding
    exactly `chunked` (parsed chunk by chunk); both, or any other coding, is refused. Bytes after
    the request are never forwarded, so nothing can be smuggled behind it;
  * hop-by-hop headers are dropped and `Connection: close` is sent, so upstream closes after one
    response, which is streamed back unchanged (server-sent events keep working).
A host with a path rule accepts only body-less GETs of exactly that path (no query).

The log records verdicts and allowlisted host names only. A denied host name or any path is
attacker-chosen and could carry a secret, so neither is written to it. Denied CONNECT targets go
to the private file named by AGY_EGRESS_DENIED_FILE (outside the jail, never the job log).

argv: SOCKET LOG ALLOW_CSV CERT KEY [PATH_RULES]   PATH_RULES: "host=/exact/path,host2=/p"
"""

import asyncio
import contextlib
import os
import re
import ssl
import sys

sock_path, log_path, allow_csv, cert, key = sys.argv[1:6]
allow = {h for h in allow_csv.split(",") if h}
path_rules = {}
for rule in (sys.argv[6] if len(sys.argv) > 6 else "").split(","):
    if rule:
        rule_host, _, rule_path = rule.partition("=")
        path_rules[rule_host] = rule_path
server_ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
server_ctx.load_cert_chain(cert, key)
server_ctx.set_alpn_protocols(
    ["http/1.1"]
)  # one HTTP/1.1 request per connection, never h2
upstream_ctx = ssl.create_default_context()
logf = open(log_path, "a", buffering=1)  # noqa: SIM115 - lives as long as the process
denied_path = os.environ.get("AGY_EGRESS_DENIED_FILE", "")
deniedf = open(denied_path, "a", buffering=1) if denied_path else None  # noqa: SIM115

TOKEN = re.compile(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+")
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-connection",
    "proxy-authorization",
    "proxy-authenticate",
    "te",
    "trailer",
    "upgrade",
    "host",
    "content-length",
    "transfer-encoding",
}
METHODS = {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
MAX_HEAD = 65536
MAX_CHUNK_LINE = 4096


class Refuse(Exception):
    """The request is refused (403); the reason is never echoed anywhere."""


def log(verdict, host=""):
    logf.write(f"{verdict} {host if host in allow else ''}".rstrip() + "\n")


def close(w):
    with contextlib.suppress(OSError, RuntimeError):
        w.close()


async def refuse(cw, status):
    with contextlib.suppress(OSError, RuntimeError):
        cw.write(status + b"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        await cw.drain()
    close(cw)


def clean_head(head):
    """Validate a request head's bytes; return its lines (request line first)."""
    if not head.endswith(b"\r\n\r\n"):
        raise Refuse
    body = head[:-4]
    if not body.isascii():
        raise Refuse
    stripped = body.replace(b"\r\n", b"")
    if b"\r" in stripped or b"\n" in stripped:
        raise Refuse
    if any(c < 0x20 or c == 0x7F for c in stripped):
        raise Refuse
    return body.decode("ascii").split("\r\n")


def rebuild_request(head, host):
    """Return (upstream head bytes, body kind, body length) or raise Refuse.

    Body kind is "none", "length" or "chunked". Nothing the client wrote is forwarded verbatim.
    """
    lines = clean_head(head)
    req = lines[0].split(" ")
    if len(req) != 3 or req[0] not in METHODS or req[2] != "HTTP/1.1":
        raise Refuse
    method, target = req[0], req[1]
    if not target.startswith("/") or target.startswith("//"):
        raise Refuse  # origin-form only: no absolute-form or authority-form target
    hosts, keep, lengths, codings = [], [], [], []
    for line in lines[1:]:
        if not line or line[0] in " \t":
            raise Refuse  # empty line inside the head, or obs-fold continuation
        name, sep, value = line.partition(":")
        if not sep or TOKEN.fullmatch(name) is None:
            raise Refuse
        lname, value = name.lower(), value.strip(" \t")
        if lname == "host":
            hosts.append(value.lower())
        elif lname == "content-length":
            lengths.append(value)
        elif lname == "transfer-encoding":
            codings.append(value.lower())
        elif lname not in HOP_BY_HOP:
            keep.append(f"{name}: {value}")
    if len(hosts) != 1 or hosts[0] not in (host, f"{host}:443"):
        raise Refuse
    if lengths and codings:
        raise Refuse
    if codings:
        if codings != ["chunked"]:
            raise Refuse
        kind, length = "chunked", 0
    elif lengths:
        if len(set(lengths)) != 1 or not lengths[0].isdigit() or len(lengths[0]) > 15:
            raise Refuse
        length = int(lengths[0])
        kind = "length" if length else "none"
    else:
        kind, length = "none", 0
    if host in path_rules and (
        method != "GET" or target != path_rules[host] or kind != "none"
    ):
        raise Refuse
    framing = []
    if kind == "length":
        framing = [f"Content-Length: {length}"]
    elif kind == "chunked":
        framing = ["Transfer-Encoding: chunked"]
    out = [
        f"{method} {target} HTTP/1.1",
        f"Host: {host}",
        *keep,
        *framing,
        "Connection: close",
        "",
        "",
    ]
    return "\r\n".join(out).encode("ascii"), kind, length


async def copy_exact(cr, uw, n):
    while n > 0:
        data = await cr.read(min(65536, n))
        if not data:
            raise Refuse
        uw.write(data)
        await uw.drain()
        n -= len(data)


async def copy_chunked(cr, uw):
    while True:
        line = await cr.readuntil(b"\r\n")
        if len(line) > MAX_CHUNK_LINE:
            raise Refuse
        size_txt = line[:-2].split(b";", 1)[0].strip()
        if not size_txt or not re.fullmatch(rb"[0-9A-Fa-f]{1,15}", size_txt):
            raise Refuse
        size = int(size_txt, 16)
        uw.write(f"{size:x}\r\n".encode())  # chunk extensions are dropped
        if size == 0:
            # Trailers are read (bounded) and DISCARDED: forwarding them would let a client add
            # headers after validation. Only the terminating CRLF goes upstream.
            for _ in range(64):
                t = await cr.readuntil(b"\r\n")
                if len(t) > MAX_CHUNK_LINE:
                    raise Refuse
                if t == b"\r\n":
                    uw.write(b"\r\n")
                    await uw.drain()
                    return
            raise Refuse
        await copy_exact(cr, uw, size)
        if await cr.readexactly(2) != b"\r\n":
            raise Refuse
        uw.write(b"\r\n")
        await uw.drain()


async def pipe(r, w):
    try:
        while data := await r.read(65536):
            w.write(data)
            await w.drain()
    except (ConnectionError, OSError, asyncio.IncompleteReadError):
        pass


async def handle(cr, cw):
    try:
        head = await asyncio.wait_for(cr.readuntil(b"\r\n\r\n"), 30)
    except (
        TimeoutError,
        OSError,
        asyncio.IncompleteReadError,
        asyncio.LimitOverrunError,
    ):
        close(cw)
        return
    parts = head.split(b"\r\n", 1)[0].decode("latin-1", "replace").split()
    if len(parts) != 3 or parts[0] != "CONNECT":
        log("REFUSE-NONCONNECT")
        await refuse(cw, b"HTTP/1.1 405 Method Not Allowed")
        return
    host, _, port = parts[1].rpartition(":")
    if port != "443" or host not in allow:
        log("DENY", host)
        if deniedf is not None:
            deniedf.write(parts[1][:300] + "\n")
        await refuse(cw, b"HTTP/1.1 403 Forbidden")
        return
    uw = None
    try:
        cw.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        await cw.drain()
        await cw.start_tls(server_ctx)
        rhead = await asyncio.wait_for(cr.readuntil(b"\r\n\r\n"), 60)
        try:
            out, kind, length = rebuild_request(rhead, host)
        except Refuse:
            log("DENY-REQ", host)
            await refuse(cw, b"HTTP/1.1 403 Forbidden")
            return
        ur, uw = await asyncio.wait_for(
            asyncio.open_connection(host, 443, ssl=upstream_ctx, server_hostname=host),
            30,
        )
        uw.write(out)
        await uw.drain()
        if kind == "length":
            await copy_exact(cr, uw, length)
        elif kind == "chunked":
            await copy_chunked(cr, uw)
        log("ALLOW", host)
        await pipe(
            ur, cw
        )  # Connection: close upstream ends the response; later client bytes are ignored
    except Refuse:
        log("DENY-BODY", host)
    except (
        TimeoutError,
        ssl.SSLError,
        OSError,
        asyncio.IncompleteReadError,
        asyncio.LimitOverrunError,
    ):
        log("FAIL", host)
    finally:
        if uw is not None:
            close(uw)
        close(cw)


async def main():
    with contextlib.suppress(FileNotFoundError):
        os.unlink(sock_path)
    srv = await asyncio.start_unix_server(handle, path=sock_path, limit=MAX_HEAD)
    os.chmod(sock_path, 0o600)
    async with srv:
        await srv.serve_forever()


asyncio.run(main())
AGYPY
}

# --- the bubblewrap jail (AGY_ISOLATION=bwrap) --------------------------------------------------
# Verified 2026-11-22: inside this jail agy authenticates and reviews, sees only an empty HOME, has
# no MCP servers/skills/hooks, cannot read any host file outside the jail, and over D-Bus can fetch
# only its own keyring item (another item's GetSecret, the bulk Service.GetSecrets and every other
# session service are AccessDenied by the proxy).
agy_jail=()
if [ "$AGY_ISOLATION" = bwrap ]; then
  _need=( bwrap xdg-dbus-proxy gdbus )
  [ "$AGY_EGRESS" = filtered ] && _need+=( socat python3 openssl )
  for _t in "${_need[@]}"; do
    command -v "$_t" >/dev/null 2>&1 || { log "AGY_ISOLATION=bwrap needs '$_t' on the runner host; refusing to run agy unjailed (set AGY_ISOLATION=none to override, not recommended)"; exit 1; }
  done
  # The egress proxy needs asyncio's StreamWriter.start_tls (Python 3.11+).
  if [ "$AGY_EGRESS" = filtered ] && ! python3 -I -c 'import sys; sys.exit(sys.version_info < (3, 11))'; then
    log "AGY_EGRESS=filtered needs python3 >= 3.11 on the runner host (found $(python3 -V 2>&1)); refusing to run agy"; exit 1
  fi
  [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ] \
    || { log "AGY_ISOLATION=bwrap needs XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS (a user session)"; exit 1; }
  # agy's own keyring item(s), resolved OUTSIDE the jail: object paths only, never secrets.
  _dict=""
  for _kv in $AGY_KEYRING_ATTRS; do
    [[ "$_kv" =~ ^[A-Za-z0-9_.-]+=[A-Za-z0-9_.:@-]+$ ]] || { log "invalid AGY_KEYRING_ATTRS entry '$_kv'"; exit 1; }
    _dict="${_dict:+$_dict, }'${_kv%%=*}': '${_kv#*=}'"
  done
  # Secret Service treats an empty attribute set as match-all, which would grant GetSecret on
  # every item (including the gh token). Refuse it outright.
  [ -n "$_dict" ] || { log "AGY_KEYRING_ATTRS is empty; refusing to grant agy keyring access"; exit 1; }
  mapfile -t _items < <(gdbus call --session --dest org.freedesktop.secrets \
      --object-path /org/freedesktop/secrets/aliases/default \
      --method org.freedesktop.Secret.Collection.SearchItems "{${_dict}}" 2>/dev/null \
    | grep -oE '/org/freedesktop/secrets/collection/[A-Za-z0-9_]+/[A-Za-z0-9_]+')
  [ "${#_items[@]}" -ge 1 ] || { log "no keyring item matches AGY_KEYRING_ATTRS ($AGY_KEYRING_ATTRS); is agy logged in on this host?"; exit 1; }
  _rules=(
    "--call=org.freedesktop.secrets=org.freedesktop.Secret.Service.OpenSession@/org/freedesktop/secrets"
    "--call=org.freedesktop.secrets=org.freedesktop.Secret.Service.Unlock@/org/freedesktop/secrets"
    "--call=org.freedesktop.secrets=org.freedesktop.DBus.Properties.Get@/org/freedesktop/secrets"
    "--call=org.freedesktop.secrets=org.freedesktop.Secret.Collection.SearchItems@/org/freedesktop/secrets/aliases/default"
    "--call=org.freedesktop.secrets=org.freedesktop.Secret.Session.Close@/org/freedesktop/secrets/session/*"
  )
  for _it in "${_items[@]}"; do _rules+=( "--call=org.freedesktop.secrets=org.freedesktop.Secret.Item.GetSecret@${_it}" ); done
  agy_jail_rt="$(mktemp -d "$XDG_RUNTIME_DIR/agy-jail.XXXXXX")"
  agy_jail_home="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/agy-home.XXXXXX")"
  agy_jail_home="$(cd "$agy_jail_home" && pwd -P)"
  xdg-dbus-proxy "$DBUS_SESSION_BUS_ADDRESS" "$agy_jail_rt/bus" --filter "${_rules[@]}" &
  agy_proxy_pid=$!
  for _ in $(seq 1 100); do [ -S "$agy_jail_rt/bus" ] && break; sleep 0.1; done
  [ -S "$agy_jail_rt/bus" ] || { log "xdg-dbus-proxy did not start; refusing to run agy unjailed"; exit 1; }
  _uid="$(id -u)"
  _net=( --share-net --ro-bind-try /run/systemd/resolve /run/systemd/resolve )
  _egress_binds=() _egress_env=() _inner=()
  if [ "$AGY_EGRESS" = filtered ]; then
    _allow=""
    for _h in $AGY_EGRESS_ALLOW; do
      [[ "$_h" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] \
        || { log "invalid AGY_EGRESS_ALLOW entry '$_h' (exact lowercase host names only, no wildcards)"; exit 1; }
      _allow="${_allow:+$_allow,}$_h"
    done
    _prules=""
    for _r in $AGY_EGRESS_PATH_RULES; do
      [[ "$_r" =~ ^([a-z0-9.-]+)=(/[A-Za-z0-9._~/-]*)$ ]] \
        || { log "invalid AGY_EGRESS_PATH_RULES entry '$_r' (expected host=/exact/path)"; exit 1; }
      [[ ",$_allow," == *",${BASH_REMATCH[1]},"* ]] \
        || { log "AGY_EGRESS_PATH_RULES names '${BASH_REMATCH[1]}', which is not in AGY_EGRESS_ALLOW"; exit 1; }
      _prules="${_prules:+$_prules,}$_r"
    done
    _san="DNS:${_allow//,/,DNS:}"
    _ca_sys=""
    for _c in /etc/ssl/certs/ca-certificates.crt /etc/pki/tls/certs/ca-bundle.crt /etc/ssl/cert.pem; do
      [ -s "$_c" ] && { _ca_sys="$_c"; break; }
    done
    [ -n "$_ca_sys" ] || { log "AGY_EGRESS=filtered: no system CA bundle found; refusing to run agy"; exit 1; }
    # Per-run CA + one leaf covering every allowlisted host. Both keys stay in the private runtime
    # dir, which is never mounted into the jail; the jail gets only a CA bundle (roots + this CA).
    _pki="$agy_jail_rt/pki"; mkdir -m 700 "$_pki"
    if ! { openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 1 \
             -subj "/CN=agy-review egress CA" -addext "basicConstraints=critical,CA:TRUE" \
             -addext "keyUsage=critical,keyCertSign" -keyout "$_pki/ca.key" -out "$_pki/ca.pem" \
         && openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
             -subj "/CN=agy-review egress" -keyout "$_pki/leaf.key" -out "$_pki/leaf.csr" \
         && openssl x509 -req -in "$_pki/leaf.csr" -CA "$_pki/ca.pem" -CAkey "$_pki/ca.key" -days 1 \
             -extfile <(printf 'subjectAltName=%s\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n' "$_san") \
             -out "$_pki/leaf.pem"; } >/dev/null 2>&1; then
      log "AGY_EGRESS=filtered: could not create the per-run certificates; refusing to run agy"; exit 1
    fi
    cat "$_ca_sys" "$_pki/ca.pem" > "$agy_jail_rt/ca-bundle.pem"
    agy_egress_proxy_src > "$agy_jail_rt/egress.py"
    : > "$agy_jail_rt/egress-denied.txt"; chmod 600 "$agy_jail_rt/egress-denied.txt"
    AGY_EGRESS_DENIED_FILE="$agy_jail_rt/egress-denied.txt" \
    python3 -I "$agy_jail_rt/egress.py" "$agy_jail_rt/egress.sock" "$agy_jail_rt/egress.log" "$_allow" \
      "$_pki/leaf.pem" "$_pki/leaf.key" "$_prules" \
      2>>"$LOG" &
    agy_egress_pid=$!
    for _ in $(seq 1 100); do [ -S "$agy_jail_rt/egress.sock" ] && break; sleep 0.1; done
    [ -S "$agy_jail_rt/egress.sock" ] || { log "egress proxy did not start; refusing to run agy"; exit 1; }
    _net=()   # --unshare-all without --share-net: the jail has only its own loopback
    _egress_binds=( --ro-bind "$agy_jail_rt/egress.sock" /run/agy-egress.sock
                    --ro-bind "$agy_jail_rt/ca-bundle.pem" /run/agy-ca-bundle.pem )
    _egress_env=( "HTTPS_PROXY=http://127.0.0.1:3128" "https_proxy=http://127.0.0.1:3128"
                  "HTTP_PROXY=http://127.0.0.1:3128" "http_proxy=http://127.0.0.1:3128"
                  "NO_PROXY=" "no_proxy=" "SSL_CERT_FILE=/run/agy-ca-bundle.pem" )
    # Inside the jail: bridge loopback 3128 to the proxy socket, wait for it, then exec the payload.
    # Inside the jail: bridge loopback 3128 to the proxy socket and wait for it. If the bridge never
    # comes up, say so with the `agy-jail:` prefix (agy_jail_failed) instead of launching agy anyway.
    _inner=( /usr/bin/bash -c 'socat TCP-LISTEN:3128,bind=127.0.0.1,fork,reuseaddr UNIX-CONNECT:/run/agy-egress.sock 2>/dev/null & up=0; for _ in $(seq 1 100); do if (exec 3<>/dev/tcp/127.0.0.1/3128) 2>/dev/null; then up=1; break; fi; sleep 0.1; done; [ "$up" = 1 ] || { echo "agy-jail: the egress bridge did not start" >&2; exit 1; }; exec "$@"' agy-jail )
  fi
  # Mirror the host's real top-level layout: merged-/usr distributions differ (Arch links /lib64
  # to usr/lib, Debian and Ubuntu to usr/lib64), and the ELF interpreter must resolve the same way.
  _toplevel=()
  for _d in /bin /sbin /lib /lib32 /lib64 /libx32; do
    if [ -L "$_d" ]; then _toplevel+=( --symlink "$(readlink "$_d")" "$_d" )
    elif [ -d "$_d" ]; then _toplevel+=( --ro-bind "$_d" "$_d" )
    fi
  done
  agy_jail=( bwrap --unshare-all "${_net[@]}" --die-with-parent --new-session
    --ro-bind /usr /usr "${_toplevel[@]}"
    --ro-bind /etc /etc --proc /proc --dev /dev --tmpfs /tmp
    --tmpfs /home --bind "$agy_jail_home" "$HOME"
    --ro-bind "$(readlink -f "$AGY_BIN")" "$AGY_BIN"
    --ro-bind "$(cd "$(dirname "$0")" && pwd)/_agy_print.sh" "$(cd "$(dirname "$0")" && pwd)/_agy_print.sh"
    --ro-bind "$prompt_file" "$prompt_file"
    --bind "$agy_sandbox" "$agy_sandbox" --chdir "$agy_sandbox"
    --dir "/run/user/$_uid" --ro-bind "$agy_jail_rt/bus" "/run/user/$_uid/bus"
    "${_egress_binds[@]}" "${_inner[@]}" )
  # Inside the jail, D-Bus is the filtered proxy (later env assignments override earlier ones).
  agy_env+=( "XDG_RUNTIME_DIR=/run/user/$_uid" "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$_uid/bus" "TMPDIR=/tmp" "${_egress_env[@]}" )
  log "agy isolation: bwrap jail, empty HOME, D-Bus limited to ${#_items[@]} keyring item(s), egress ${AGY_EGRESS}"
  unset _t _need _dict _kv _items _rules _it _uid _net _egress_binds _egress_env _inner _allow _h _ca_sys _c _pki _toplevel _d _prules _r _san
fi
[ -n "$AGY_MODEL" ]  && flags+=( --model "$AGY_MODEL" )
[ -n "$AGY_EFFORT" ] && flags+=( --effort "$AGY_EFFORT" )

out_file="$(mktemp)"
here="$(cd "$(dirname "$0")" && pwd)"
: > "$LOG"

# Serialize agy across concurrent review jobs on this host. agy runs a SINGLETON
# local language-server + conversation store per user, so two `--print` calls at
# once collide (one reports the backend "unavailable"). flock makes jobs queue
# instead of failing. FAIL CLOSED: if flock is missing, or the lock can't be
# taken/times out, exit rather than let two agy processes race each other --
# a fail-open here made the exact collision this lock exists to prevent still
# reachable (one run can burn the whole ${AGY_RETRIES}x${AGY_LOCK_WAIT}s wait).
command -v flock >/dev/null 2>&1 || {
  log "flock is required to serialize agy; refusing to run unserialized"
  exit 1
}
# Create the lock dir first: a failed `exec 9>` redirection is a FATAL shell error (it aborts
# before the `|| log` fallback can run), so ensure the parent exists on a fresh runner. `>>` opens
# for append rather than truncating the lockfile — flock uses the fd, not the contents.
# Validated before use: an empty `AGY_LOCK` (an env override set to "") would make `dirname`
# yield "." and the redirection below fail with an obscure shell error, at the one point where a
# clear message matters -- this is the guard that keeps two agy runs off each other.
if [ -z "$AGY_LOCK" ]; then
  log "AGY_LOCK is empty; refusing to run unserialized"
  exit 1
fi
mkdir -p "$(dirname "$AGY_LOCK")"
exec 9>>"$AGY_LOCK"
flock -w "$AGY_LOCK_WAIT" 9 || {
  log "agy lock timed out after ${AGY_LOCK_WAIT}s"
  exit 1
}

# Retry the whole agy attempt on empty/failed output: transient "agy is down"
# (backend rate-limit / local-server contention) usually clears within seconds.
# The flock (above) is held across all attempts, released after the loop.
for (( attempt=1; attempt<=AGY_RETRIES; attempt++ )); do
  : > "$out_file"   # clear any partial output from a prior attempt

  if command -v unbuffer >/dev/null 2>&1; then
    log "running agy via unbuffer (allocates a PTY) [attempt ${attempt}/${AGY_RETRIES}]"
    # From the sandbox directory, so agy's workspace root is never the checkout.
    # `env -i ...` starts unbuffer itself inside the allowlisted environment (verified to work in
    # the runner's environment). Putting it the other way round made every NAME=VALUE an argv
    # entry of the long-lived unbuffer process, world-readable in /proc/<pid>/cmdline.
    ( cd "$agy_sandbox" && "${agy_env[@]}" unbuffer "${agy_jail[@]}" "$AGY_BIN" "${flags[@]}" --print "$(cat "$prompt_file")" ) > "$out_file" 2>>"$LOG" || true
  else
    log "unbuffer not found; falling back to script(1) [attempt ${attempt}/${AGY_RETRIES}]"
    raw="$(mktemp)"
    # `script -c` runs its command through `sh -c`. Build that command with `printf '%q '`
    # so every argument -- including the flag values, which come from env vars
    # (AGY_MODEL / AGY_EFFORT / AGY_PRINT_TIMEOUT) -- is shell-escaped for the inner shell.
    # A raw `${flags[*]}` here would let a shell metacharacter in any of those be evaluated
    # by `sh -c` (command injection); `%q` quotes each token exactly.
    # script(1) is a plain binary, so it (and the _agy_print.sh it runs) can start inside the
    # allowlisted environment; agy inherits it from there.
    cmd="$(printf '%q ' "${agy_jail[@]}" "$here/_agy_print.sh" "$prompt_file" "${flags[@]}")"
    ( cd "$agy_sandbox" && "${agy_env[@]}" AGY_BIN="$AGY_BIN" script -qfec "$cmd" "$raw" ) >/dev/null 2>>"$LOG" || true
    # Strip script(1)'s own start/done records so they cannot pass as agy output (see
    # agy_strip_script_records).
    col -b < "$raw" | agy_strip_script_records > "$out_file"
    rm -f "$raw"   # each retry makes a fresh $raw; the EXIT trap only holds the last one
  fi

  # normalize CRs without sed -i (avoid in-place edit footguns)
  tr -d '\r' < "$out_file" > "$out_file.clean" && mv "$out_file.clean" "$out_file"

  # These two run on EVERY capture before any handler below logs or clears it: the backend-error
  # handler prints a short capture's first line to the public job log, which must never carry a
  # credential, and a jail diagnostic must never be retried or posted.
  # A credential-shaped string is REDACTED, not fatal: the scan cannot tell a leaked secret from a
  # test fixture a PR adds (a sample JWT), and either way the string never reaches the comment.
  if cred_kind="$(credential_kind_present "$out_file")"; then
    if ! agy_redact_credentials "$out_file" || left="$(credential_kind_present "$out_file")"; then
      log "refusing to post: a credential-shaped string (${left:-$cred_kind}) could not be redacted from agy's output. Nothing was posted."
      : > "$out_file"
      exit 1
    fi
    redacted_kinds="${redacted_kinds:+$redacted_kinds, }${cred_kind}"
    log "redacted credential-shaped string(s) (${cred_kind}, and any others) from agy's output (attempt ${attempt}/${AGY_RETRIES}). If this PR adds sample tokens (test fixtures), that is the likely source; otherwise inspect the runner host, the diff may carry a prompt injection."
  fi
  # A jail that never started (no user namespaces, a missing bind source, ...) prints its own
  # diagnostic, which the PTY capture keeps while `|| true` drops the exit status. Never let that
  # text be posted as a review, and do not retry: the next attempt would fail the same way.
  if agy_jail_failed "$out_file"; then
    log "the agy jail failed to start; nothing was posted. First line: $(grep -m1 -v '^[[:space:]]*$' "$out_file" | cut -c1-200)"
    exit 1
  fi

  # If the capture carries a live OAuth authorization URL, agy's cached Google session has lapsed
  # on this runner and there is NO review — just its interactive login flow (the OAuth URL + a
  # "paste the authorization code" prompt). That must never reach a public PR comment (noise,
  # phishing-shaped, and it advertises that the runner's auth dropped). Treat it as a hard,
  # NON-retryable failure: re-auth is a human action on the runner host, so retrying only thrashes
  # the backoff for a minute. Blank the capture so no later path (have_text / body assembly) can
  # ever post it, flag it, and stop.
  if oauth_url_present "$out_file"; then
    log "agy is NOT authenticated on this runner: it printed its interactive Google OAuth login flow instead of a review. Refusing to post it (it carries an OAuth URL). Re-authenticate agy on the runner host, then re-run with '/agy-review'."
    : > "$out_file"
    auth_failed=1
    break
  fi

  # NOTE: there is deliberately no SQLite-conversation-store fallback here. agy's
  # store is keyed by mtime, not session, and on a shared/multi-user runner the
  # most-recent `.db` can belong to an UNRELATED concurrent local `agy` session --
  # reading it would post that session's output into a public PR comment (data
  # leak). The PTY path above plus the retry loop cover agy issue #76 without it.

  # A backend error is TRANSIENT, so it retries like empty output rather than aborting the way a
  # lapsed session does -- but it must never be mistaken for a review. Blank the capture so no
  # later path can post it, and let the loop try again.
  #
  # A COUNTER, not a per-attempt flag. A boolean reset each attempt reflects only the last one,
  # so a 503 on attempt 1 followed by empty output on attempt 3 would report the generic "no
  # output" cause, and the reverse would claim the backend was down on every attempt when it was
  # down on one. Both exit non-zero, so nothing unsafe -- but the log line is the only thing
  # telling a human which outage they are looking at.
  if service_error_present "$out_file"; then
    log "agy returned a backend error rather than a review (attempt ${attempt}/${AGY_RETRIES}): $(head -n 1 "$out_file")"
    : > "$out_file"
    service_errors=$(( ${service_errors:-0} + 1 ))
  fi

  # A timed-out turn is a partial review at best. Discard it and retry: posting half a review as
  # if it were the whole one is the failure the service-error guard exists to prevent, one cause
  # later. Counted like backend errors, so the final log line names the real cause.
  if print_timeout_present "$out_file"; then
    log "agy hit its print timeout (${AGY_PRINT_TIMEOUT}) before finishing (attempt ${attempt}/${AGY_RETRIES}); discarding the partial output"
    : > "$out_file"
    print_timeouts=$(( ${print_timeouts:-0} + 1 ))
  fi

  have_text "$out_file" && break
  if [ "$attempt" -lt "$AGY_RETRIES" ]; then
    delay=$(( AGY_RETRY_DELAY * attempt ))
    log "no usable output (attempt ${attempt}/${AGY_RETRIES}); retrying in ${delay}s"
    sleep "$delay"
  fi
done
# Egress summary: verdict COUNTS only. A denied host name or path is attacker-chosen and could
# carry a secret, and this log is public on a public repository, so names are never printed.
# Denied names go ONLY to a host-private log (mode 600, beside agy's own state), so a new host
# that an agy update starts using can be found and added to AGY_EGRESS_ALLOW.
if [ -s "${agy_jail_rt:-}/egress-denied.txt" ]; then
  _dl="${AGY_EGRESS_DENIED_LOG:-$HOME/.gemini/antigravity-cli/agy-egress-denied.log}"
  if agy_record_denied "$agy_jail_rt/egress-denied.txt" "$_dl" "${REPO:-?}#${PR:-?}"; then
    log "egress: denied host names (if any are needed, add them to AGY_EGRESS_ALLOW) are in $_dl on the runner host"
  else
    log "egress: could not write the private denied-host log $_dl"
  fi
  unset _dl
fi
if [ -s "${agy_jail_rt:-}/egress.log" ]; then
  log "egress: $(awk '{print $1}' "$agy_jail_rt/egress.log" | sort | uniq -c | awk '{printf "%s %s, ", $2, $1}' | sed 's/, $//')"
fi
# Release the agy lock so the next queued job proceeds. NO redirection on this `exec`: a bare
# `exec` applies its redirections to the rest of the SCRIPT, so the `2>/dev/null` that used to be
# here sent every later `log` line (they write to stderr) to /dev/null -- "posted", "updated",
# and every failure cause alike. A healthy run and a silent crash looked identical in CI for as
# long as that line existed (found 2026-09-28 on RustyNES #563). Closing an fd needs no guard.
exec 9>&-

# Lapsed-auth abort takes precedence over the generic empty-output path: it is a specific,
# actionable cause (re-auth agy on the runner), not a transient backend blip, and we already
# blanked $out_file above so nothing is postable. Exit non-zero WITHOUT posting anything.
if [ "${auth_failed:-0}" = "1" ]; then
  log "aborting without posting: agy requires re-authentication on the runner host (no review was produced)."
  exit 1
fi

# A persistent backend failure is reported as its own cause, and it FAILS THE JOB. Posting the
# error as a review comment (the previous behavior) produced a passing check for a review that
# never ran; posting nothing and exiting non-zero makes the outage visible where it matters.
# The `! have_text` is redundant today -- the loop truncates $out_file whenever it counts a
# backend error -- and is kept deliberately: it makes the "post nothing" guarantee independent
# of that truncation surviving a future edit.
if backend_outage_should_fail "${service_errors:-0}" "$out_file"; then
  log "agy's backend returned an error on ${service_errors} of ${AGY_RETRIES} attempt(s) and no review was produced. Failing the check rather than posting the error as a review. Re-run with '/agy-review' once the service recovers."
  exit 1
fi

if ! have_text "$out_file"; then
  if [ "${print_timeouts:-0}" -gt 0 ]; then
    log "agy hit its print timeout (${AGY_PRINT_TIMEOUT}) on ${print_timeouts} of ${AGY_RETRIES} attempt(s) and produced no complete review. Raise AGY_PRINT_TIMEOUT for this repository's diffs, then re-run with '/agy-review'."
  fi
  log "no review output after ${AGY_RETRIES} attempt(s). Check $LOG and confirm 'agy -p \"hi\"' works for this user."
  # Surface agy's stderr into the job log. RUNNER_TEMP is wiped between jobs, so a bare
  # `exit 1` otherwise leaves the real cause invisible in CI (E2BIG, auth, backend, ...).
  if [ -s "$LOG" ]; then
    # Bound the dump to the last lines: GitHub Actions auto-masks registered secrets (incl.
    # GITHUB_TOKEN) in logs, and this is agy's own diagnostic stream, but a bounded tail avoids
    # publishing an unbounded volume of stderr (which could echo prompt/diff content) into CI.
    log "----- captured agy stderr ($LOG), last ${AGY_LOG_TAIL_LINES:-60} lines (secrets auto-masked) -----"
    # GitHub masks only REGISTERED secrets; agy's own Google token is not one. Withhold the whole
    # tail if it carries any credential shape, naming only the kind.
    # A regular file, not a pipe: the scan tests -s and reads its input once per pattern.
    log_tail="$(mktemp)"
    tail -n "${AGY_LOG_TAIL_LINES:-60}" "$LOG" > "$log_tail" || true
    if log_cred="$(credential_kind_present "$log_tail")"; then
      log "(withheld: agy's stderr contains a credential-shaped string (${log_cred}); inspect $LOG on the runner host)"
    else
      sed 's/^/[agy] /' "$log_tail" >&2 || true
    fi
    rm -f -- "$log_tail"
    log "----- end agy stderr -----"
  else
    log "(agy stderr log is empty -- agy likely failed before writing, e.g. execve E2BIG on an oversized prompt)"
  fi
  exit 1
fi

# --- assemble the comment body -------------------------------------------------
# MAX_BODY_BYTES bounded only the archive, so a review longer than GitHub's comment limit failed to
# post at all (CodeRabbit review, VeridianOS PR #5). Bound the new round too, leaving room for the
# framing and some archive, and say what was cut. A byte cut can split a UTF-8 sequence: scrub it.
if agy_cap_round "$out_file" "$(( MAX_BODY_BYTES - 4096 ))"; then
  log "review output capped to fit the ${MAX_BODY_BYTES}-byte comment budget"
  agy_scrub_utf8 "$out_file"
fi
body_file="$(mktemp)"
{
  printf '%s\n' "$MARKER"
  printf '%s%s -->\n' "$AGY_REVIEWED_AT_PREFIX" "$(date -u +'%Y-%m-%d %H:%M UTC')"
  printf '## Antigravity review (Gemini via Ultra)\n\n'
  cat "$out_file"
  printf '%s' "$truncated"
  if [ -n "${redacted_kinds:-}" ]; then
    printf '\n\n> **Note:** credential-shaped strings were redacted from this review before posting (%s). If this PR adds sample tokens, that is the likely source.\n' "$redacted_kinds"
  fi
  printf '\n\n<sub>Automated first-pass review by `agy` on a self-hosted runner -- not a human review.</sub>\n'
} > "$body_file"
# Last-resort guard before ANY post path (edit-in-place or new comment). The capture loop already
# redacted every credential shape, so reaching this means redaction missed one: fail closed.
if cred_kind="$(credential_kind_present "$out_file")"; then
  log "refusing to post: agy's output contains a credential-shaped string (${cred_kind}). Nothing was posted. Inspect the runner host; the diff may carry a prompt injection."
  exit 1
fi

# Final hard guard — the last line of defense, and UNCONDITIONAL, run BEFORE anything is
# deleted or posted. Layer 1 (the retry loop) already rejects a lapsed-session capture, but
# a public PR comment must NEVER carry a live OAuth authorization URL, whatever any upstream
# change does to the body — and with no "looks like a review" exemption that a header
# alongside a URL could disarm. A genuine review that merely discusses auth or quotes this
# script's bare regex has no live URL and posts normally; only an actual authorization URL
# blocks the post.
if oauth_url_present "$body_file"; then
  log "refusing to post: the assembled comment body contains a live OAuth authorization URL. Re-authenticate agy on the runner host."
  exit 1
fi

# --- edit our existing comment, appending the previous round to its archive ------
# One comment per PR, edited in place: newest round on top, earlier rounds folded into a
# collapsed `<details>` below. NOTHING IS DELETED. The previous design posted fresh and
# deleted the prior comment, which kept the PR tidy at the cost of destroying any round
# nobody had read yet — and left no evidence a round had happened at all.
#
# Fail-closed in the direction that matters: every step below falls back to a plain POST of
# the new review. A duplicate comment is noise; failing to publish a review, or losing one, is
# not. The lookup happens BEFORE the post so a PATCH is possible at all, but a failed lookup
# costs only the archive, never the review.
prior_id=""
prior_body_file="$(mktemp)"
# gh's stderr from the calls below. Each still falls back to a fresh post, but says WHY (expired
# token, rate limit, 404), which a bare `2>/dev/null` threw away (agy review, VeridianOS PR #5).
api_err="$(mktemp)"
# `--paginate` emits one top-level JSON array PER PAGE, concatenated — not one merged array.
# jq then runs the filter once per array, so `[ ... ] | first | .id` yields one id per page
# that matches rather than one id overall. On a thread short enough to fit a single page that
# is invisible; past 30 comments, if a fallback POST has ever left a second marked comment
# behind, `prior_id` becomes multi-line, `--argjson id` rejects it, and the in-place edit
# silently degrades into a duplicate post — exactly on the long threads where the archive
# matters most. `jq -s add` merges the pages into the single array the filter assumes.
# (`gh api --slurp` does this too, but only on gh >= 2.42; this works on any version.)
if prior_json="$(gh api "repos/${REPO}/issues/${PR}/comments" --paginate 2>"$api_err" \
                  | jq -s 'add // []' 2>/dev/null)"; then
  # Both jq steps still fall back to a fresh post (losing the archive, never the review), but the
  # failure is LOGGED: swallowing it made a broken filter indistinguishable from a first review,
  # and the archive would vanish with nothing to say why (agy review on VeridianOS PR #5).
  jq_err="$(mktemp)"
  if ! prior_id="$(printf '%s' "$prior_json" | jq -r --arg marker "$MARKER" "$SELECT_OURS_JQ" 2>"$jq_err")"; then
    log "warning: finding the previous review comment failed (jq: $(head -c 300 "$jq_err" | tr '\n' ' ')); posting a fresh review without the archive"
    prior_id=""
  fi
  if [ -n "$prior_id" ] && [ "$prior_id" != "null" ]; then
    if ! printf '%s' "$prior_json" \
        | jq -r --argjson id "$prior_id" '.[] | select(.id == $id) | .body' > "$prior_body_file" 2>"$jq_err"; then
      log "warning: reading the previous review comment failed (jq: $(head -c 300 "$jq_err" | tr '\n' ' ')); posting a fresh review without the archive"
      : > "$prior_body_file"
    fi
  else
    prior_id=""
  fi
else
  log "warning: could not list PR comments ($(head -c 300 "$api_err" | tr '\n' ' ')); posting a fresh review without the archive"
fi

if [ -n "$prior_id" ] && [ -s "$prior_body_file" ]; then
  # Split the prior body into its newest round (everything after the marker, before the
  # archive) and the archive's existing inner rounds. `awk` rather than `sed`, because the
  # sentinels must match whole lines and a review body legitimately contains regex
  # metacharacters, backslashes and HTML.
  prior_head="$(agy_body_head "$MARKER" < "$prior_body_file")"
  prior_archive="$(agy_body_archive < "$prior_body_file")"
  # Rounds earlier runs already dropped: carried forward so the disclosure is cumulative and a
  # later run that drops nothing does not erase it (agy review of Rusty2600 #53).
  prior_dropped="$(agy_body_dropped_count < "$prior_body_file")"

  archived_file="$(mktemp)"
  agy_assemble_archive "$prior_head" "$prior_archive" "$(date -u +'%Y-%m-%d %H:%M UTC')" \
    > "$archived_file"

  # Drop the oldest rounds until the whole comment fits, and SAY SO. A silent truncation
  # here would look identical to "there were never any earlier rounds", which is the exact
  # confusion this whole change exists to remove.
  dropped=0
  while :; do
    combined_size=$(( $(wc -c < "$body_file") + $(wc -c < "$archived_file") + 200 ))
    [ "$combined_size" -le "$MAX_BODY_BYTES" ] && break
    # Remove the LAST `<details>` block (the oldest round) from the archive.
    trimmed="$(mktemp)"
    agy_drop_oldest_round < "$archived_file" > "$trimmed" || { rm -f "$trimmed"; break; }
    mv "$trimmed" "$archived_file"
    dropped=$(( dropped + 1 ))
  done

  {
    # Order matters. The `<details>` wrapper and the dropped-round note sit OUTSIDE the
    # start/end sentinels, so `agy_body_archive` extracts only the rounds themselves. With
    # the wrapper inside, every run re-captured it and nested another layer around it.
    printf '\n%s\n' "$AGY_ARCHIVE_SECTION"
    total_dropped=$(( dropped + prior_dropped ))
    if [ "$total_dropped" -gt 0 ]; then
      printf '<sub>%d earlier round(s) dropped to stay under GitHub'"'"'s comment size limit.</sub>\n\n' "$total_dropped"
    fi
    # The sentinels are always written (later runs locate the archive and its dropped count by
    # them), but the visible `<details>` wrapper only when a round survived the trimming above --
    # otherwise it renders as an empty disclosure (agy review, GH-ListRollup PR #4).
    # `if`, not `[ -s ] && printf`: as the group's last command, a false `&&` list would make the
    # whole `{ } >> "$body_file"` group return 1 and abort the run under `set -e`.
    if [ -s "$archived_file" ]; then
      printf '<details>\n<summary><b>Earlier review rounds</b> (newest first)</summary>\n\n'
    fi
    printf '%s\n' "$AGY_ARCHIVE_START"
    cat "$archived_file"
    printf '%s\n' "$AGY_ARCHIVE_END"
    if [ -s "$archived_file" ]; then
      printf '\n</details>\n'
    fi
  } >> "$body_file"
  rm -f "$archived_file"

  # Re-run the OAuth guard on the ASSEMBLED body. The archive is text this script published
  # earlier and so has already passed the guard once, but the body is what gets published now
  # and the guard's contract is that it runs on exactly that.
  if oauth_url_present "$body_file"; then
    log "refusing to post: the assembled comment body contains a live OAuth authorization URL."
    exit 1
  fi

  # The body goes through STDIN as JSON, never through argv. At `MAX_BODY_BYTES`
  # the comment can approach 60 KB, and a single execve argument is capped at
  # `MAX_ARG_STRLEN` (128 KB on Linux) -- close enough that a future raise of that
  # bound would start failing with E2BIG, and the failure would look like a
  # GitHub error rather than a local limit. `--rawfile` also makes the value a
  # JSON string by construction, so no shell quoting or `-F` type-coercion can
  # reinterpret a body that happens to look like a number or a boolean.
  if jq -n --rawfile b "$body_file" '{body: $b}' \
       | gh api -X PATCH "repos/${REPO}/issues/comments/${prior_id}" --input - >/dev/null 2>"$api_err"; then
    log "updated review comment ${prior_id} on ${REPO}#${PR} (earlier rounds archived in place)"
    rm -f "$prior_body_file"
    exit 0
  fi
  log "warning: could not edit comment ${prior_id} ($(head -c 300 "$api_err" | tr '\n' ' ')); posting a fresh review instead"
fi
rm -f "$prior_body_file"

if ! post_output="$(gh pr comment "$PR" --repo "$REPO" --body-file "$body_file" 2>&1)"; then
  log "failed to post review to ${REPO}#${PR}: ${post_output}"
  exit 1
fi
log "posted review to ${REPO}#${PR}"
