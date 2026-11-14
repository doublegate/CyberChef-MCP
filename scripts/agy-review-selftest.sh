#!/usr/bin/env bash
#
# agy-review-selftest.sh -- guards the comment-selection logic in `agy-review.sh`.
#
# Why this exists: that filter decides which existing comment the bot EDITS IN PLACE — the one
# whose body carries the archive of every prior review round. Pick the wrong one and a round is
# overwritten; pick none and the round is orphaned as a duplicate post. It has been wrong twice,
# both times invisibly.
#
# The two histories below are from the earlier design, which posted a fresh comment and deleted
# the previous one. That design is gone — nothing is deleted now — but the failures are recorded
# verbatim because they are what the fixtures are shaped to catch, and both remain reachable
# against an edit-in-place filter for the same underlying reasons.
#
#   1. The just-posted comment was not reliably excluded. `new_comment_id` came from re-querying
#      the comment list, which races GitHub's read replication; on a miss the exclusion became
#      `select(.id != null)`, true for every id, and the run deleted the review it had just
#      published.
#   2. jq's `--arg`/`--argjson` were handed to `gh api`, which has no such flags. It exited
#      non-zero, `2>/dev/null` hid the message, and `set -o pipefail` + `set -e` killed the script
#      AFTER posting — so stale comments silently accumulated and the job went red with nothing in
#      the log explaining why.
#
# Neither was catchable by looking at the review the bot posted: both times it posted fine. So the
# filter is tested here directly, offline, against fixtures — no network, no `gh`, no runner.
#
# Run: bash scripts/agy-review-selftest.sh

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Source the constants out of the reviewer without running it. `agy-review.sh` does its work at
# top level, so it cannot simply be sourced; the two values under test are lifted by pattern
# instead. That coupling is deliberate: if either declaration is renamed or reshaped, this test
# fails loudly rather than silently checking a stale copy of the filter.
extract_marker() {
  sed -n 's/^MARKER="\(.*\)"$/\1/p' "$SCRIPT_DIR/agy-review.sh" | head -n 1
}
# Extraction is delimited by explicit `SELFTEST-EXTRACT` markers rather than by matching the
# declaration's own syntax. Adopted FROM SLAC, and it is the better mechanism: the `sed` range
# it replaced ended at the first line closing with a quote, so a filter whose body ever ended a
# line that way would be silently TRUNCATED -- and a truncated jq program can still compile and
# still return ids, which is exactly the silent-wrong-answer this file exists to prevent.
# Markers also let a guard be several statements rather than one assignment, which is what makes
# the OAuth and service-error guards testable at all.
extract_block() {
  sed -n "/^# >>> SELFTEST-EXTRACT: $1\$/,/^# <<< SELFTEST-EXTRACT\$/p" "$SCRIPT_DIR/agy-review.sh"
}
extract_filter() {
  extract_block "ours-comment filter" \
    | sed -n "/^SELECT_OURS_JQ='/,/'\$/p" \
    | sed "1s/^SELECT_OURS_JQ='//; \$s/'\$//"
}

# The extracted blocks are eval'd without the rest of agy-review.sh, so any helper they call has
# to exist here. `normalise_numeric_env` logs its fallback; keep that off the checks' stdout.
log() { :; }

# Every marked block must exist and be sourceable. A renamed or unbalanced marker would
# otherwise extract EMPTY, and an empty guard sources fine and asserts nothing -- the same
# absence-reads-as-agreement failure the markers were adopted to prevent.
for guard in "service-error guard" "oauth guard" "ours-comment filter" "duration parser" \
             "numeric env validation" "diff-size scaling" "truncation helpers" \
             "diff-limit classifier"; do
  blk="$(extract_block "$guard")"
  [ -n "$blk" ] || { echo "FAIL: SELFTEST-EXTRACT block '$guard' is missing or empty" >&2; exit 1; }
  printf '%s\n' "$blk" | bash -n - 2>/dev/null \
    || { echo "FAIL: extracted block '$guard' is not valid shell (unbalanced markers?)" >&2; exit 1; }
  eval "$blk"
done

MARKER="$(extract_marker)"
FILTER="$(extract_filter)"

[ -n "$MARKER" ] || { echo "FAIL: could not extract MARKER from agy-review.sh" >&2; exit 1; }
[ -n "$FILTER" ] || { echo "FAIL: could not extract SELECT_OURS_JQ from agy-review.sh" >&2; exit 1; }

# The REAL body-format implementation, sourced rather than reimplemented. The first version of
# these checks inlined its own copy of the `awk` pipeline, and a mutation deleting the marker
# strip from the script came back NOT CAUGHT -- a test that reimplements its subject agrees with
# itself forever. `agy-review.sh` cannot be sourced (it works at top level), which is exactly
# why the format lives in its own file.
# shellcheck source=scripts/_agy_comment_body.sh
. "$SCRIPT_DIR/_agy_comment_body.sh"
[ -n "${AGY_ARCHIVE_START:-}" ] || { echo "FAIL: _agy_comment_body.sh defined no AGY_ARCHIVE_START" >&2; exit 1; }
[ -n "${AGY_ARCHIVE_END:-}" ]   || { echo "FAIL: _agy_comment_body.sh defined no AGY_ARCHIVE_END" >&2; exit 1; }

# The script must actually USE the shared helper, or these checks test a file nothing runs.
grep -q '_agy_comment_body.sh' "$SCRIPT_DIR/agy-review.sh" \
  || { echo "FAIL: agy-review.sh does not source _agy_comment_body.sh" >&2; exit 1; }
for fn in agy_body_head agy_body_archive agy_drop_oldest_round agy_assemble_archive; do
  grep -q "$fn" "$SCRIPT_DIR/agy-review.sh" \
    || { echo "FAIL: agy-review.sh does not call $fn" >&2; exit 1; }
done

# A non-empty extraction is not the same as a COMPLETE one. The `sed` range above ends at the
# first line closing with a quote, so a filter whose body ever ends a line that way would be
# truncated — and a truncated jq program can still be valid and still return ids, which is the
# silent-wrong-answer this whole file exists to prevent. Two independent guards:
#
#   1. it must compile (a truncated program is usually, though not always, a syntax error);
#   2. it must END with the projection, which is what makes it a complete pipeline rather than a
#      prefix of one.
# The named args must be supplied here too: the filter references `$marker`/`$new_id`, and jq
# rejects an undefined variable at COMPILE time — so omitting them fails a perfectly good program.
if ! printf '[]' | jq --arg marker x "$FILTER" >/dev/null 2>&1; then
  echo "FAIL: extracted SELECT_OURS_JQ is not a valid jq program (truncated?):" >&2
  printf '%s\n' "$FILTER" >&2
  exit 1
fi
case "$(printf '%s' "$FILTER" | tr -d '[:space:]')" in
  *'|.id//empty') : ;;
  *) echo "FAIL: extracted SELECT_OURS_JQ does not end in '| .id // empty'; extraction truncated" >&2
     printf '%s\n' "$FILTER" >&2
     exit 1 ;;
esac

fixture() {
  cat <<JSON
[
  {"id":  50, "user": {"type": "User", "login": "someone"},             "body": "$MARKER\nimpostor, posted FIRST"},
  {"id":  60, "user": {"type": "Bot",  "login": "other-bot"},           "body": "$MARKER\nwrong bot, also early"},
  {"id":  70, "user": {"type": "Bot",  "login": "github-actions[bot]"}, "body": "an ordinary bot comment"},
  {"id": 111, "user": {"type": "Bot",  "login": "github-actions[bot]"}, "body": "$MARKER\nour canonical thread"},
  {"id": 222, "user": {"type": "Bot",  "login": "github-actions[bot]"}, "body": "$MARKER\na later duplicate"}
]
JSON
}

# Ids as a single space-separated line, with no trailing space — so the expected values below read
# as what they are rather than carrying padding an assertion would have to mirror.
select_id() {
  fixture | jq -r --arg marker "$MARKER" "$FILTER"
}

fails=0
check() {
  local name="$1" want="$2" got="$3"
  if [ "$got" = "$want" ]; then
    echo "  ok    $name"
  else
    echo "  FAIL  $name"
    echo "          want: [$want]"
    echo "          got:  [$got]"
    fails=$((fails + 1))
  fi
}

echo "agy-review comment-selection self-test"

# The whole point: exactly ONE comment is chosen, and it is the OLDEST of ours -- so the canonical
# thread keeps growing rather than a new one starting whenever a duplicate exists.
check "selects the oldest of OUR OWN marked comments" "111" "$(select_id)"

# The author filter is a security control, not tidiness: without it any user could paste the
# marker (invisible when rendered) into a comment and have the bot EDIT it -- previously, delete it.
check "never selects another user or another bot" "111" "$(select_id)"

# A bot comment without the marker is somebody else's feature (a CI summary, a deploy note).
check "ignores bot comments without the marker" "111" "$(select_id)"

# No comment of ours yet: the filter must yield EMPTY, not `null`. The caller tests the result with
# `[ -n ... ]`, and the string "null" is non-empty -- it would be used as a comment id and every
# edit would 404 into the fallback, silently reverting to the post-fresh path this replaced.
check "yields empty when we have no comment yet" "" \
  "$(printf '[{"id":1,"user":{"type":"User","login":"a"},"body":"hi"}]' \
     | jq -r --arg marker "$MARKER" "$FILTER")"

check "yields empty for an empty comment list" "" \
  "$(printf '[]' | jq -r --arg marker "$MARKER" "$FILTER")"

# --- the archive round-trip ----------------------------------------------------
# A body split into head + archive and reassembled must lose neither. The failure this guards is
# not a crash: an `awk` that mismatched the sentinels would produce a body that renders fine and
# quietly contains only the newest round, which is indistinguishable from a first review.
round_trip_body="$(printf '%s\nNEWEST ROUND\n%s\n<details>\nOLDER ROUND\n</details>\n%s\n' \
  "$MARKER" "$AGY_ARCHIVE_START" "$AGY_ARCHIVE_END")"

head_part="$(printf '%s\n' "$round_trip_body" | agy_body_head "$MARKER")"
archive_part="$(printf '%s\n' "$round_trip_body" | agy_body_archive)"

check "the head split drops the marker and stops at the archive" "NEWEST ROUND" "$head_part"
check "the archive split returns only the archived rounds" \
  "$(printf '<details>\nOLDER ROUND\n</details>')" "$archive_part"

# A body with NO archive yet (the first round) must split to a head and an empty archive, not to
# an empty head -- the first re-review is exactly when this path runs for the first time.
first_body="$(printf '%s\nFIRST ROUND\n' "$MARKER")"
check "a body with no archive still yields its head" "FIRST ROUND" \
  "$(printf '%s\n' "$first_body" | agy_body_head "$MARKER")"
check "a body with no archive yields an empty archive" "" \
  "$(printf '%s\n' "$first_body" | agy_body_archive)"

# The head must NOT carry the marker forward: an archived round that still contains it would
# make every future run's `contains($marker)` match inside the archive, and the split would
# then cut at the wrong place. A mutation removing the strip must fail here.
check "the head never carries the marker into the archive" "" \
  "$(printf '%s\nX\n' "$MARKER" | agy_body_head "$MARKER" | grep -F -x "$MARKER" || true)"

# Trimming must terminate: with no `<details>` left, dropping fails rather than looping.
check "dropping from an empty archive fails rather than spinning" "1" \
  "$(printf 'no rounds here\n' | agy_drop_oldest_round >/dev/null 2>&1; echo $?)"

# An archive written by an OLDER version has no round markers. Nothing must be dropped:
# the edit then fails on size, which is recoverable, rather than the archive being mangled.
check "an unmarked (legacy) archive drops nothing" "1" \
  "$(printf '<details>\nNEW\n</details>\n<details>\nOLD\n</details>\n' \
     | agy_drop_oldest_round >/dev/null 2>&1; echo $?)"

marked_archive="$(printf '%s\n<details>\nNEW\n</details>\n%s\n<details>\nOLD\n</details>\n' \
  "$AGY_ROUND_MARK" "$AGY_ROUND_MARK")"
check "dropping removes the OLDEST round, keeping the newest" \
  "$(printf '%s\n<details>\nNEW\n</details>' "$AGY_ROUND_MARK")" \
  "$(printf '%s\n' "$marked_archive" | agy_drop_oldest_round)"

# THE BUG THIS SENTINEL EXISTS FOR. A review body legitimately contains `<details>` blocks
# -- folded logs, collapsed code, another bot's summary -- and matching the tag itself cut
# INSIDE a round, leaving torn HTML and half a review. The newest round below carries its own
# `<details>`; dropping the oldest must not touch it.
nested="$(printf '%s\n<details>\n<summary>Round</summary>\n<details>\nfolded log\n</details>\nfinding\n</details>\n%s\n<details>\nOLD\n</details>\n' \
  "$AGY_ROUND_MARK" "$AGY_ROUND_MARK")"
check "a <details> INSIDE a round is not mistaken for a round boundary" \
  "$(printf '%s\n<details>\n<summary>Round</summary>\n<details>\nfolded log\n</details>\nfinding\n</details>' "$AGY_ROUND_MARK")" \
  "$(printf '%s\n' "$nested" | agy_drop_oldest_round)"

# The writer must actually EMIT the sentinel, or every archive is legacy-shaped and the trim
# silently never fires -- the comment would then grow until the edit fails.
# It does so through agy_assemble_archive, whose output is checked to start with the mark.
if grep -q 'agy_assemble_archive' "$SCRIPT_DIR/agy-review.sh" \
   && [ "$(agy_assemble_archive X "" T | head -1)" = "$AGY_ROUND_MARK" ]; then
  echo "  ok    agy-review.sh emits the round sentinel"
else
  echo "  FAIL  agy-review.sh never emits AGY_ROUND_MARK; the archive would never trim"
  fails=$((fails + 1))
fi

# The script must not delete comments any more. A reintroduced DELETE is the regression that
# would silently restore the destructive behavior this design replaced.
if grep -qE 'gh api +-X +DELETE' "$SCRIPT_DIR/agy-review.sh"; then
  echo "  FAIL  agy-review.sh deletes comments again; the archive design forbids it"
  fails=$((fails + 1))
else
  echo "  ok    agy-review.sh never deletes a comment"
fi

# Regression #2, pinned: `--arg`/`--argjson` belong to jq. If they are ever moved onto `gh api`
# again, that command exits non-zero — assert the flags are not passed to `gh api` in the script.
# Line continuations are folded first: `--arg` moved onto a continuation line would otherwise sit
# on a different physical line from `gh api`, and a line-by-line grep would report a false pass on
# exactly the mistake this check exists to catch.
if sed -e ':a' -e '/\\$/{N;s/\\\n//;ba' -e '}' "$SCRIPT_DIR/agy-review.sh" \
     | grep -qE 'gh api[^|]*--(arg|argjson)'; then
  echo "  FAIL  --arg/--argjson passed to \`gh api\` (jq flags; gh api rejects them)"
  fails=$((fails + 1))
else
  echo "  ok    --arg/--argjson are not passed to \`gh api\`"
fi

# --- the service-error guard ---------------------------------------------------
# When agy's upstream is down it prints an error, not a review. That text is non-empty, so
# `have_text` alone treats it as a valid review and POSTs it -- a green check for a review that
# never ran. Observed twice on SLAC PR #14, where the check passed in 7 seconds with the error
# string as its entire body. A control that cannot fail is worse than no control.
se() { printf '%s' "$1" > "$TMPD/cap"; service_error_present "$TMPD/cap" && echo MATCH || echo NOMATCH; }
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT

check "a bare backend 503 is caught" "MATCH" \
  "$(se 'Error: Eligibility check failed: UNAVAILABLE (code 503): The service is currently unavailable.')"
check "RESOURCE_EXHAUSTED is caught" "MATCH" "$(se 'Error: RESOURCE_EXHAUSTED')"
check "a bare truncated-output tool notice is caught" "MATCH" \
  "$(se '_The output was truncated. To view the remaining content, please use the `ContentOffset` parameter with the exact line range._')"

# The false positives the anchoring exists to avoid. A genuine review may quote a 503 while
# reviewing retry logic, and aborting on that would be the very failure the OAuth guard's design
# notes warn about.
check "a review DISCUSSING a 503 is not caught" "NOMATCH" \
  "$(se "$(printf '## Review\n\nThe retry path should handle Error: UNAVAILABLE (code 503) here.\n')")"
check "an error on line 3 is not caught (only line 1 counts)" "NOMATCH" \
  "$(se "$(printf '## Review\n\nError: UNAVAILABLE (code 503)\n')")"
check "an empty capture is not caught" "NOMATCH" "$(se '')"

# The ANCHOR, tested where it is the only thing that matters: the error text is on LINE ONE but
# not at its start. `head -n 1` cannot exclude this; only `^` can. Without this fixture the
# anchor could be deleted and every other check still passed.
check "a heading MENTIONING an error mid-line is not caught" "NOMATCH" \
  "$(se '## Review of the Error: UNAVAILABLE (code 503) retry path')"

# ...and the anchored form still matches with leading whitespace, which the regex allows.
check "a leading-whitespace error is still caught" "MATCH" \
  "$(se '   Error: UNAVAILABLE (code 503)')"

# REGRESSION, observed on CyberChef-MCP PR #72. The guard used to enumerate known backend
# signatures (UNAVAILABLE, RESOURCE_EXHAUSTED, DEADLINE_EXCEEDED, code 4xx/5xx...). A timeout is
# none of those, so agy posted this as its entire review and the `review` check went GREEN --
# reproducing the exact failure the guard exists to prevent, one signature later.
check "a TIMEOUT error is caught (was not, before the guard stopped enumerating)" "MATCH" \
  "$(se 'Error: timeout waiting for response')"

# The general form: any leading `Error:` is a failure, whatever follows it. Enumerating failure
# modes only ever catches the ones already seen, so the guard no longer tries.
check "an unfamiliar error signature is caught" "MATCH" \
  "$(se 'Error: something nobody has seen before')"

# REGRESSION, observed on VeridianOS PR #5: agy under `unbuffer` printed the auth failure in
# lowercase, the case-sensitive guard missed it, and the error was posted as the review under a
# green check. Any capitalisation of the word is the same failure.
# --- truncation: executed, not grepped (CodeRabbit review, VeridianOS PR #5) -----
# A diff cut by MAX_DIFF_BYTES, a prompt cut by MAX_PROMPT_BYTES, and a review cut to fit the comment
# limit must each leave the model -- or the reader -- a notice. These run the real helpers.
printf '0123456789abcdefghij' > "$TMPD/diff"
check "the diff cap cuts an oversized diff" "cut:5" \
  "$(agy_cut_file "$TMPD/diff" 5 && echo "cut:$(wc -c < "$TMPD/diff")")"
check "the diff cap leaves a small diff alone" "kept" \
  "$(agy_cut_file "$TMPD/diff" 50 && echo cut || echo kept)"
{ printf 'PROMPT\n--- UNIFIED DIFF ---\n'; cat "$TMPD/diff"; agy_diff_truncation_notice 5; } > "$TMPD/prompt"
check "a truncated diff is disclosed in the prompt" "yes" \
  "$(grep -q 'NOTE: TRUNCATED DIFF' "$TMPD/prompt" && grep -q 'first 5 bytes' "$TMPD/prompt" && echo yes || echo no)"
head -c 2000 /dev/zero | tr '\0' 'x' > "$TMPD/bigprompt"
agy_diff_truncation_notice 5 >> "$TMPD/bigprompt"
agy_cap_prompt "$TMPD/bigprompt" 600
check "the prompt cap stays within its budget" "yes" \
  "$([ "$(wc -c < "$TMPD/bigprompt")" -le 600 ] && echo yes || echo no)"
check "the prompt cap's own notice survives the cut" "yes" \
  "$(tail -n 4 "$TMPD/bigprompt" | grep -q 'NOTE: TRUNCATED PROMPT' && echo yes || echo no)"
head -c 70000 /dev/zero | tr '\0' 'r' > "$TMPD/round"
agy_cap_round "$TMPD/round" 1000
check "an oversized review round is capped" "yes" \
  "$([ "$(wc -c < "$TMPD/round")" -le 1000 ] && echo yes || echo no)"
check "a capped review round says it was truncated" "yes" \
  "$(grep -q 'Review truncated' "$TMPD/round" && echo yes || echo no)"
# --- UTF-8 scrub: one helper for the prompt AND the review output, executed -------
# The review-output path once had iconv only while the prompt path also fell back to python3
# (agy review, switch2-hub-patcher PR #1). Both now call agy_scrub_utf8; exercise each sanitizer.
printf 'abc\xe2\x82' > "$TMPD/split"          # a euro sign cut after two of its three bytes
agy_scrub_utf8 "$TMPD/split"
check "a split UTF-8 sequence is scrubbed" "abc" "$(cat "$TMPD/split")"
mkdir -p "$TMPD/noiconv"
for t in python3 mv rm; do ln -sf "$(command -v "$t")" "$TMPD/noiconv/$t"; done
printf 'abc\xe2\x82' > "$TMPD/split"
( PATH="$TMPD/noiconv"; agy_scrub_utf8 "$TMPD/split" )
check "the python3 fallback scrubs when iconv is absent" "abc" "$(cat "$TMPD/split")"
printf '\xe2\x82' > "$TMPD/allbad"            # no valid byte: every sanitizer yields nothing
agy_scrub_utf8 "$TMPD/allbad"
check "a sanitizer's empty result never replaces the file" "2" "$(wc -c < "$TMPD/allbad" | tr -d ' ')"
check "both byte-cap paths call the shared scrub" "2" \
  "$(grep -c '^ *agy_scrub_utf8 "\$' "$SCRIPT_DIR/agy-review.sh")"
# A failed jq step in the archive lookup must be logged, not swallowed.
check "archive jq failures are logged" "no" \
  "$(grep -n 'SELECT_OURS_JQ" 2>/dev/null' "$SCRIPT_DIR/agy-review.sh" >/dev/null && echo yes || echo no)"

check "a lowercase error (agy under unbuffer) is caught" "MATCH" \
  "$(se 'error: Eligibility check failed: PERMISSION_DENIED (code 403): Request had insufficient authentication scopes.. Please log out (/logout) and log back in (/login).')"
check "an all-caps ERROR: is caught" "MATCH" "$(se 'ERROR: backend unavailable')"

# The size cap is what separates "the error IS the whole capture" from "a review mentions one".
long="Error: UNAVAILABLE (code 503) $(head -c 3000 /dev/zero | tr '\0' 'x')"
check "a long capture opening with an error is not caught" "NOMATCH" "$(se "$long")"

# The script must FAIL rather than post when the backend errored and nothing was produced.
# Called, not grepped for: `if false && [ "${service_errors:-0}" -gt 0 ]` still contains what a
# structural grep looks for, and that mutation came back NOT CAUGHT.
: > "$TMPD/empty"
printf 'a real review\n' > "$TMPD/review"
check "outage + no review  -> fail the job" "0" \
  "$(backend_outage_should_fail 2 "$TMPD/empty"; echo $?)"
check "outage + a review   -> do not fail"  "1" \
  "$(backend_outage_should_fail 2 "$TMPD/review"; echo $?)"
check "no outage + no review -> not THIS guard's job" "1" \
  "$(backend_outage_should_fail 0 "$TMPD/empty"; echo $?)"


# --- duration parser ---------------------------------------------------------------------------
# The point is the REJECTIONS. A value that is not a duration must be refused, not fed into an
# arithmetic expansion: `$(( 1x + 60 ))` is a SYNTAX ERROR that takes the whole script down under
# `set -e`, which would turn a mis-set variable into a reviewer that never runs.
check "duration: bare seconds"     "90"   "$(duration_to_seconds 90)"
check "duration: explicit seconds" "90"   "$(duration_to_seconds 90s)"
check "duration: minutes"          "300"  "$(duration_to_seconds 5m)"
check "duration: hours"            "3600" "$(duration_to_seconds 1h)"
check "duration: leading zero minutes"  "480" "$(duration_to_seconds 08m)"
check "duration: leading zero seconds"  "9"   "$(duration_to_seconds 09s)"
# 10, not 8. That IS the fix: without `10#` bash reads the leading zero as octal, so this would
# silently mean 8 seconds -- a wrong answer rather than an error, which is the worse of the two.
check "duration: leading zero bare"     "10"  "$(duration_to_seconds 010)"
for bad in m s "" 1m2s 5x -3 " 5m" 5M; do
  check "duration: rejects '$bad'" "1" "$(duration_to_seconds "$bad" >/dev/null 2>&1; echo $?)"
done

# --- numeric env validation ---------------------------------------------------------------------
# These values reach `$(( ... ))`. Two separate ways that goes wrong, and digits-only catches only
# one of them -- which is exactly how the octal case survived the first version of this guard.
nne() {                                    # run the real function, echo what the variable became
  local v="$1"; local T="$v"
  normalise_numeric_env T 240 >/dev/null 2>&1 || echo "CRASHED"
  printf '%s' "$T"
}
check "numeric env: plain integer passes through"   "300"  "$(nne 300)"
check "numeric env: zero is a legal setting"        "0"    "$(nne 0)"
# 9, not a crash and not 8: `09` is all digits, so the digits-only check admits it, and bash then
# reads the leading zero as OCTAL. This is the case the digits-only check alone did NOT cover.
check "numeric env: leading zero canonicalises"     "9"    "$(nne 09)"
check "numeric env: many leading zeros"             "8"    "$(nne 0008)"
check "numeric env: empty falls back"               "240"  "$(nne "")"
check "numeric env: non-numeric falls back"         "240"  "$(nne 30s)"
check "numeric env: negative falls back"            "240"  "$(nne -1800)"
# Bash arithmetic recursively expands variable CONTENTS as a name, so a value that names another
# variable silently evaluates to that one's value. It must never reach `$(( ))` at all.
check "numeric env: a variable name falls back"     "240"  "$(nne a_name)"
# Asserted on STDERR, not on the returned value: reaching `$(( ))` with a non-numeric value emits
# a bash arithmetic error there, so an empty stderr is positive evidence that it never got that
# far. Mutation-checked -- deleting the digits-only case above makes THIS check fail with
# "value too great for base", which is what a guard's test is supposed to do.
#
# The previous version of this check grepped for a command-substitution payload and was VACUOUS:
# it passed under a deliberately broken guard, because the helper's own `2>&1 >/dev/null` had
# already swallowed the evidence. Kept as a note because a test that cannot fail is worse than
# no test -- it reads as coverage.
check "numeric env: a non-numeric value never reaches arithmetic" "" \
  "$( { T=a_name; normalise_numeric_env T 240; } 2>&1 >/dev/null || true )"
# It assigns THROUGH a caller-supplied name, so its own locals must not collide with one. With
# plain `name`/`default`/`val` locals these two silently no-op -- the function reads and writes its
# own local and the caller's variable is never touched. Verified as a real failure before fixing.
name=09; normalise_numeric_env name 240
check "numeric env: a caller variable named 'name' is not shadowed" "9" "$name"
val=07;  normalise_numeric_env val 240
check "numeric env: a caller variable named 'val' is not shadowed"  "7" "$val"
default=08; normalise_numeric_env default 240
check "numeric env: a caller variable named 'default' is not shadowed" "8" "$default"

# --- diff-size scaling -------------------------------------------------------------------------
# The argument is stripped of whitespace BEFORE validation, so a padded `wc` count still scales.
# Validating first would fall back to 0 and silently disable the scaling -- a no-op is worse here
# than the crash, because the symptom is the timeout this whole feature exists to prevent.
sc() { AGY_PRINT_TIMEOUT="5m"; scale_timeout_for_diff "$1"; printf '%s' "$AGY_PRINT_TIMEOUT"; }
AGY_PRINT_TIMEOUT_EXPLICIT=""; AGY_TIMEOUT_SECONDS_PER_MIB=240; AGY_PRINT_TIMEOUT_MAX_SECONDS=1800
check "scaling: 1.6 MB gets a real raise"        "670s"  "$(sc 1619782)"
check "scaling: a padded count still scales"     "670s"  "$(sc '  1619782  ')"
check "scaling: a huge diff hits the ceiling"    "1800s" "$(sc 20000000)"
check "scaling: no argument leaves the base"     "5m"    "$(sc '')"
# The default (900 s/MiB): the 426 KB diff that timed out three times at 397 s under 240.
AGY_TIMEOUT_SECONDS_PER_MIB="$(sed -n 's/^AGY_TIMEOUT_SECONDS_PER_MIB="${AGY_TIMEOUT_SECONDS_PER_MIB:-\([0-9]*\)}".*/\1/p' "$SCRIPT_DIR/agy-review.sh")"
check "scaling: the default gives a 426 KB diff 665 s" "665s" "$(sc 425786)"
AGY_TIMEOUT_SECONDS_PER_MIB=240
check "scaling: junk leaves the base"            "5m"    "$(sc junk)"
AGY_PRINT_TIMEOUT_EXPLICIT=set
check "scaling: an explicit timeout is not touched" "5m" "$(sc 20000000)"
AGY_PRINT_TIMEOUT_EXPLICIT=""

# And the value it produces must survive the arithmetic it exists to feed.
T=09; normalise_numeric_env T 240
# 9. Feeding the RAW `09` to the same expansion dies "value too great for base" under `set -e`,
# which is the crash this canonicalisation exists to prevent -- asserted directly below.
check "numeric env: canonical value is arithmetic-safe" "9" \
  "$(bash -c 'set -e; echo $(( 1048576 * '"$T"' / 1048576 ))' 2>/dev/null || echo CRASHED)"
check "numeric env: the RAW value would have crashed"   "CRASHED" \
  "$(bash -c 'set -e; echo $(( 1048576 * 09 / 1048576 ))' 2>/dev/null || echo CRASHED)"

# --- the 406 diff-limit classifier -------------------------------------------------------
# GitHub's two "too big for the API" refusals must BOTH reach the local-diff fallback, and the
# log must name the limit that fired. Matching only the lines variant failed a wide-but-shallow
# PR outright; the label is what a reader triages from. Anything else is a real failure.
dl() { printf '%s\n' "$1" > "$TMPD/derr"; diff_limit_hit "$TMPD/derr" || printf 'NO-FALLBACK'; }
check "406, lines variant: falls back, named 20,000-line" "20,000-line" \
  "$(dl 'could not find pull request diff: HTTP 406: Sorry, the diff exceeded the maximum number of lines (20000)')"
check "406, files variant: falls back, named 300-file" "300-file" \
  "$(dl 'could not find pull request diff: HTTP 406: Sorry, the diff exceeded the maximum number of files (300)')"
check "an unrelated gh error does not fall back" "NO-FALLBACK" \
  "$(dl 'could not find pull request diff: HTTP 404: Not Found')"

# --- the print-timeout guard -------------------------------------------------------------
# agy exits 0 on its own --print-timeout and prints a notice, alone or after a partial review.
# `have_text` passed that, so a truncated review was posted as the whole one (2026-09-28).
pt() { printf '%s' "$1" > "$TMPD/cap"; print_timeout_present "$TMPD/cap" && echo MATCH || echo NOMATCH; }
check "a bare timeout notice is caught" "MATCH" \
  "$(pt '[agy] print timeout after 5m0s with turn in progress; returning partial output')"
check "a partial review ending in the notice is caught" "MATCH" \
  "$(pt "$(printf '## Review\n\nSome findings\n[agy] print timeout after 5m0s with turn in progress; returning partial output\n')")"
check "a review quoting the notice mid-line is not caught" "NOMATCH" \
  "$(pt 'The log showed [agy] print timeout after 5m0s once.')"
check "an empty capture is not a timeout" "NOMATCH" "$(pt '')"

# --- no `exec` may redirect to /dev/null -------------------------------------------------
# A legacy (markerless) archive behind a new round: trimming once must drop the LEGACY
# history and keep the new round. Assembled bare, the only marker was the new round's, so the
# cut landed on it and discarded everything while reporting one round dropped.
legacy_combined="$(agy_assemble_archive "NEW" "$(printf '<details>\nLEGACY\n</details>')" "T0")"
check "a legacy archive becomes one droppable round behind the new one" "NEW" \
  "$(printf '%s\n' "$legacy_combined" | agy_drop_oldest_round | grep -x 'NEW\|LEGACY')"

# The archived summary says when the round was REVIEWED (from the hidden line in its head),
# falling back to an honest "archived at" for a head that predates the line.
check "an archived round keeps its reviewed-at time" "1" \
  "$(agy_assemble_archive "$(printf '%s2026-10-06 12:34 UTC -->\nBODY' "$AGY_REVIEWED_AT_PREFIX")" "" "LATER" \
     | grep -c -F '<summary>Round reviewed at 2026-10-06 12:34 UTC</summary>')"
check "a head without the line is labelled archived-at" "1" \
  "$(agy_assemble_archive "BODY" "" "LATER" | grep -c -F '<summary>Round archived at LATER</summary>')"
if grep -q 'AGY_REVIEWED_AT_PREFIX' "$SCRIPT_DIR/agy-review.sh"; then
  echo "  ok    the posted head records its reviewed-at time"
else
  echo "  FAIL  agy-review.sh no longer writes the reviewed-at line"
  fails=$((fails + 1))
fi

# The job timeout must exceed the script's worst case: lock wait + every attempt at its cap +
# the linear backoff between attempts (delay x 1 + delay x 2 + ...). Read from the workflow
# and the script's defaults, so changing either without the other fails here.
wf="$SCRIPT_DIR/../.github/workflows/antigravity-review.yml"
wf_val() { sed -n "s/^[[:space:]]*$1:[[:space:]]*[\"']\{0,1\}\([0-9][0-9]*\).*/\1/p;T;q" "$wf"; }
sh_default() { sed -n "s/^$1=\"\${$1:-\([0-9][0-9]*\)}\".*/\1/p;T;q" "$SCRIPT_DIR/agy-review.sh"; }
# wf_val takes the first match: right while the workflow has one job. A second
# timeout-minutes would make it read the wrong one (adopted from VeridianOS, PR #6 review).
if [ "$(grep -c '^[[:space:]]*timeout-minutes:' "$wf")" -gt 1 ]; then
  echo "  FAIL  more than one timeout-minutes in the workflow: wf_val needs the review job's"
  fails=$((fails + 1))
fi
job_min="$(wf_val timeout-minutes)"
max_s="$(wf_val AGY_PRINT_TIMEOUT_MAX_SECONDS)"; [ -n "$max_s" ] || max_s="$(sh_default AGY_PRINT_TIMEOUT_MAX_SECONDS)"
lock_s="$(wf_val AGY_LOCK_WAIT)";               [ -n "$lock_s" ] || lock_s="$(sh_default AGY_LOCK_WAIT)"
retries="$(wf_val AGY_RETRIES)";  [ -n "$retries" ] || retries="$(sh_default AGY_RETRIES)"
delay="$(wf_val AGY_RETRY_DELAY)"; [ -n "$delay" ] || delay="$(sh_default AGY_RETRY_DELAY)"
if [ -z "$job_min" ] || [ -z "$max_s" ] || [ -z "$lock_s" ] || [ -z "$retries" ] \
   || [ -z "$delay" ]; then
  echo "  FAIL  could not read the timeout budget (job=$job_min max=$max_s lock=$lock_s retries=$retries delay=$delay)"
  fails=$((fails + 1))
else
  worst=$(( lock_s + retries * max_s + delay * retries * (retries - 1) / 2 ))
  if [ "$worst" -lt $(( job_min * 60 - 120 )) ]; then
    echo "  ok    worst case ${worst}s fits the ${job_min}-minute job timeout with 2 minutes to spare"
  else
    echo "  FAIL  worst case ${worst}s does not fit the ${job_min}-minute job timeout"
    fails=$((fails + 1))
  fi
fi

# Both helpers run under the caller's `set -euo pipefail`. A head or archive far larger than a
# pipe buffer must neither abort them nor be misread (an early-exiting reader used to SIGPIPE
# the writer). 300 KB of filler around the markers.
big="$(head -c 300000 /dev/zero | tr '\0' 'x' | fold -w 100)"
check "a huge head still yields its reviewed-at time under pipefail" "Round reviewed at T1" \
  "$( (set -euo pipefail
       agy_assemble_archive "$(printf '%sT1 -->\n%s' "$AGY_REVIEWED_AT_PREFIX" "$big")" "" "X") \
       | grep -o 'Round reviewed at T1' | head -1)"
check "a huge marked archive is not wrapped again under pipefail" "2" \
  "$( (set -euo pipefail
       agy_assemble_archive "NEW" "$(printf '%s\nOLD\n%s' "$AGY_ROUND_MARK" "$big")" "X") \
       | grep -c -x -F "$AGY_ROUND_MARK")"

# A redirection on a bare `exec` applies to the rest of the script. `exec 9>&- 2>/dev/null`
# after the retry loop sent every later `log` line (stderr) to /dev/null, so a posted review, an
# updated one and every failure looked identical in CI: nothing logged, green check.
if grep -nE '^[[:space:]]*exec[[:space:]][^#]*>[[:space:]]*/dev/null' "$SCRIPT_DIR/agy-review.sh" >/dev/null; then
  echo "  FAIL  an \`exec\` redirects to /dev/null (silences every later log line)"
  fails=$((fails + 1))
else
  echo "  ok    no \`exec\` redirects to /dev/null"
fi

if [ "$fails" -ne 0 ]; then
  echo "$fails check(s) failed" >&2
  exit 1
fi
echo "all checks passed"
