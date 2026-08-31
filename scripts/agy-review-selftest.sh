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

# Every marked block must exist and be sourceable. A renamed or unbalanced marker would
# otherwise extract EMPTY, and an empty guard sources fine and asserts nothing -- the same
# absence-reads-as-agreement failure the markers were adopted to prevent.
for guard in "service-error guard" "oauth guard" "ours-comment filter"; do
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
for fn in agy_body_head agy_body_archive agy_drop_oldest_round; do
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
if grep -q 'AGY_ROUND_MARK' "$SCRIPT_DIR/agy-review.sh"; then
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

if [ "$fails" -ne 0 ]; then
  echo "$fails check(s) failed" >&2
  exit 1
fi
echo "all checks passed"
