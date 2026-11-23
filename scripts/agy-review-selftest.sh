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
# to exist here. `normalize_numeric_env` logs its fallback; keep that off the checks' stdout.
log() { :; }

# Every marked block must exist and be sourceable. A renamed or unbalanced marker would
# otherwise extract EMPTY, and an empty guard sources fine and asserts nothing -- the same
# absence-reads-as-agreement failure the markers were adopted to prevent.
for guard in "service-error guard" "oauth guard" "ours-comment filter" "duration parser" \
             "numeric env validation" "diff-size scaling" "truncation helpers" \
             "diff-limit classifier" "script capture filter" "error cap validation"; do
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
for fn in agy_body_head agy_body_archive agy_drop_oldest_round agy_assemble_archive \
          agy_body_dropped_count; do
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

# REGRESSION (agy reviews of SLAC #24 and Rusty2600 #53): the pre-migration tail trim used to run
# on EVERY archive and drop the last `</details>` whenever closes outnumbered `^<details>` opens.
# A clean archive whose round QUOTES a standalone `</details>` (a code block, a review of this very
# script) or uses `<details open>` tips that count and lost a legitimate closing tag.
clean_quote="$(printf '%s\n<details>\n<summary>Round reviewed at X</summary>\n\nreview text\n```html\n</details>\n```\n\n</details>' "$AGY_ROUND_MARK")"
check "a clean archive quoting a standalone </details> keeps its closing tag" "$clean_quote" \
  "$(printf '%s\n%s\n%s\n%s\n' "$MARKER" "$AGY_ARCHIVE_START" "$clean_quote" "$AGY_ARCHIVE_END" | agy_body_archive)"
clean_open="$(printf '%s\n<details>\n<summary>Round reviewed at X</summary>\n\n<details open>\n<summary>log</summary>\nL\n</details>\n\n</details>' "$AGY_ROUND_MARK")"
check "a clean archive with a <details open> block keeps its closing tag" "$clean_open" \
  "$(printf '%s\n%s\n%s\n%s\n' "$MARKER" "$AGY_ARCHIVE_START" "$clean_open" "$AGY_ARCHIVE_END" | agy_body_archive)"
# The migration path must still heal: a pre-migration wrapper captured inside the sentinels ahead
# of the first round mark, with its stray trailing close, comes out as the bare rounds.
legacy_wrap="$(printf '<details>\n<summary>Earlier review rounds</summary>\n\n%s\n</details>' "$clean_quote")"
# REGRESSION (agy review of Rusty2600 #53): the "N earlier round(s) dropped" note sits between the
# section and start sentinels, outside both regions the next run reads back, and the count restarted
# at 0 every run -- so a later round that dropped nothing erased the disclosure. The prior count
# must be readable so the next comment can carry the cumulative total.
dropped_body="$(printf '%s\nNEW\n%s\n<sub>3 earlier round(s) dropped to stay under GitHub'"'"'s comment size limit.</sub>\n\n<details>\n<summary><b>Earlier review rounds</b> (newest first)</summary>\n\n%s\n%s\nR\n%s\n</details>\n' \
  "$MARKER" "$AGY_ARCHIVE_SECTION" "$AGY_ARCHIVE_START" "$AGY_ROUND_MARK" "$AGY_ARCHIVE_END")"
check "the prior dropped-round count is read back" "3" \
  "$(printf '%s\n' "$dropped_body" | agy_body_dropped_count)"
check "a body without a dropped note reads as 0" "0" \
  "$(printf '%s\n' "$round_trip_body" | agy_body_dropped_count)"
check "a dropped note quoted inside a ROUND is not counted" "0" \
  "$(printf '%s\n%s\n%s\n<sub>9 earlier round(s) dropped to stay under GitHub'"'"'s comment size limit.</sub>\n%s\n' \
       "$MARKER" "$AGY_ARCHIVE_START" "$AGY_ROUND_MARK" "$AGY_ARCHIVE_END" | agy_body_dropped_count)"
check "the assembled comment carries the cumulative dropped total" "yes" \
  "$(grep -q 'prior_dropped' "$SCRIPT_DIR/agy-review.sh" && grep -q 'dropped + prior_dropped\|prior_dropped + dropped' "$SCRIPT_DIR/agy-review.sh" && echo yes || echo no)"
check "a pre-migration wrapper and its stray close are still removed" "$clean_quote" \
  "$(printf '%s\n%s\n%s\n%s\n' "$MARKER" "$AGY_ARCHIVE_START" "$legacy_wrap" "$AGY_ARCHIVE_END" | agy_body_archive)"

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
# grep reads a process substitution, not a pipe: under pipefail, grep -q exiting on an early
# match SIGPIPEs the writer and fails the pipeline, which here would read as a PASS.
if grep -qE 'gh api[^|]*--(arg|argjson)' \
     < <(sed -e ':a' -e '/\\$/{N;s/\\\n//;ba' -e '}' "$SCRIPT_DIR/agy-review.sh"); then
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
# The live proxy and its socket dir are removed too if the suite exits early.
# Each is cleared as soon as the suite cleans it up itself, so the trap never signals a reaped
# (possibly reused) PID; the suite's own exit status is kept.
px_pid= sockd=
selftest_exit() {
  local st=$?
  rm -rf "$TMPD"
  if [ -n "$px_pid" ]; then kill "$px_pid" 2>/dev/null || true; fi
  if [ -n "$sockd" ]; then rm -rf -- "$sockd"; fi
  exit "$st"
}
trap selftest_exit EXIT

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
# green check. Any capitalization of the word is the same failure.
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
# REGRESSION (agy reviews of SLAC #24 and RustyNES_MiSTer #78): agy_cap_prompt cut at the budget
# MINUS its notice before checking the size, so a prompt that already fit -- anywhere in the last
# ~260 bytes below the cap -- was cut and falsely told the model its diff was truncated.
head -c 590 /dev/zero | tr '\0' 'f' > "$TMPD/fits"
check "a prompt that fits the cap is not cut" "kept:590" \
  "$(agy_cap_prompt "$TMPD/fits" 600 && echo "cut:$(wc -c < "$TMPD/fits")" || echo "kept:$(wc -c < "$TMPD/fits")")"
# A non-positive cut size must be refused, never handed to GNU `head -c -N` (all-but-last-N bytes).
printf '0123456789' > "$TMPD/neg"
check "a non-positive cut size is refused and the file is untouched" "kept:10" \
  "$(agy_cut_file "$TMPD/neg" -5 && echo "cut:$(wc -c < "$TMPD/neg")" || echo "kept:$(wc -c < "$TMPD/neg")")"
check "a cap smaller than its own notice never cuts with a negative size" "kept:10" \
  "$(agy_cap_prompt "$TMPD/neg" 50 && echo "cut:$(wc -c < "$TMPD/neg")" || echo "kept:$(wc -c < "$TMPD/neg")")"
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
# REGRESSION (agy review, GH-ListRollup PR #4): GNU `iconv -c` exits 1 when it drops a byte, and
# the iconv branch treated that as failure, so only python3 ever scrubbed byte-cut input --
# python3 was a silent hard requirement. With iconv present and python3 absent, iconv's output
# must be used.
if command -v iconv >/dev/null 2>&1; then
  mkdir -p "$TMPD/nopython"
  for t in iconv mv rm; do ln -sf "$(command -v "$t")" "$TMPD/nopython/$t"; done
  printf 'abc\xe2\x82' > "$TMPD/split"
  ( PATH="$TMPD/nopython"; agy_scrub_utf8 "$TMPD/split" )
  check "iconv alone scrubs a split sequence (python3 absent, iconv -c exits 1)" "abc" \
    "$(cat "$TMPD/split")"
fi
printf '\xe2\x82' > "$TMPD/allbad"            # no valid byte: every sanitizer yields nothing
agy_scrub_utf8 "$TMPD/allbad"
check "a sanitizer's empty result never replaces the file" "2" "$(wc -c < "$TMPD/allbad" | tr -d ' ')"
check "both byte-cap paths call the shared scrub" "2" \
  "$(grep -c '^ *agy_scrub_utf8 "\$' "$SCRIPT_DIR/agy-review.sh")"
# --- script(1) fallback capture: its framing records are not agy output -----------
# REGRESSION (Codex review, GH-ListRollup PR #4): util-linux `script -qfec` still writes
# "Script started on" / "Script done on" records into the typescript, so an empty or failed agy
# run read as non-empty output, and a backend error was no longer on the first line.
ts_start='Script started on 2026-11-16 02:05:52-05:00 [COMMAND="x" <not executed on terminal>]'
ts_done='Script done on 2026-11-16 02:05:52-05:00 [COMMAND_EXIT_CODE="0"]'
check "script records around an empty run leave nothing" "" \
  "$(printf '%s\n\n%s\n' "$ts_start" "$ts_done" | agy_strip_script_records)"
check "script records around a review leave only the review" "## Review|body" \
  "$(printf '%s\n## Review\nbody\n\n%s\n' "$ts_start" "$ts_done" | agy_strip_script_records | paste -sd'|')"
check "a backend error is back on the first line" "MATCH" \
  "$(se "$(printf '%s\nerror: backend unavailable\n%s\n' "$ts_start" "$ts_done" | agy_strip_script_records)")"
check "text that merely mentions a record mid-review is kept" "a|Script done on Tuesday|b" \
  "$(printf 'a\nScript done on Tuesday\nb\n' | agy_strip_script_records | paste -sd'|')"
check "the script fallback pipes its capture through the filter" "1" \
  "$(grep -c 'col -b < "\$raw" | agy_strip_script_records > "\$out_file"' "$SCRIPT_DIR/agy-review.sh")"
# REGRESSION (agy review, GH-ListRollup PR #6): util-linux localizes the record prose, so a
# non-English runner must still be handled through the untranslated key=value fields.
ts_start_de='Skript gestartet am 2026-11-16 02:05:52-05:00 [COMMAND="x" <not executed on terminal>]'
ts_done_de='Skript beendet am 2026-11-16 02:05:52-05:00 [COMMAND_EXIT_CODE="0"]'
check "localized script records are stripped too" "## Review|body" \
  "$(printf '%s\n## Review\nbody\n\n%s\n' "$ts_start_de" "$ts_done_de" | agy_strip_script_records | paste -sd'|')"

# --- every mktemp'd variable is removed by the EXIT trap -------------------------
# REGRESSION (agy review, GH-ListRollup PR #4): _perm_err, compare_err and trimmed were created
# mid-flight but missing from cleanup(), so an abort while they existed leaked them.
cleanup_src="$(sed -n '/^cleanup() {/,/^}/p' "$SCRIPT_DIR/agy-review.sh")"
missing=""
for v in $(grep -oE '[A-Za-z_][A-Za-z0-9_]*="\$\(mktemp' "$SCRIPT_DIR/agy-review.sh" | cut -d= -f1 | sort -u); do
  # A here-string, not `printf | grep -q`: under pipefail an early match can SIGPIPE printf and
  # report a present variable as missing (this check flaked that way, 2026-11-23).
  grep -qF "\${$v:-}" <<<"$cleanup_src" || missing="$missing $v"
done
check "every mktemp'd variable is in the cleanup trap" "" "${missing# }"
# REGRESSION (agy review, GH-ListRollup PR #6): listing a variable in cleanup() is not enough if
# the trap is installed after the file is created -- agy_has_write_access ran (and created
# _perm_err) before `trap cleanup EXIT`, and the pre-declarations then reset it. The trap and
# every pre-declaration must precede the first mktemp anywhere in the script.
# `tail -1`, not `head -1` (agy review, GH-ListRollup PR #6): a duplicate pre-declaration block
# left lower in the script by a merge would reset _perm_err again, and head -1 would not see it.
trap_line="$(grep -n '^trap cleanup EXIT$' "$SCRIPT_DIR/agy-review.sh" | tail -1 | cut -d: -f1 || true)"
first_mktemp="$(grep -nE '="\$\(mktemp' "$SCRIPT_DIR/agy-review.sh" | grep -vE '^[0-9]+:[[:space:]]*#' | head -1 | cut -d: -f1 || true)"
decl_line="$(grep -n "^_perm_err='' " "$SCRIPT_DIR/agy-review.sh" | tail -1 | cut -d: -f1 || true)"
diff_decl_line="$(grep -n '^diff_file= ' "$SCRIPT_DIR/agy-review.sh" | tail -1 | cut -d: -f1 || true)"
check "the EXIT trap and pre-declarations precede the first mktemp" "yes" \
  "$([ -n "$trap_line" ] && [ -n "$first_mktemp" ] && [ -n "$decl_line" ] && [ -n "$diff_decl_line" ] \
      && [ "$trap_line" -lt "$first_mktemp" ] && [ "$decl_line" -lt "$first_mktemp" ] \
      && [ "$diff_decl_line" -lt "$first_mktemp" ] \
      && echo yes || echo "no (trap:${trap_line:-none} decl:${decl_line:-none}/${diff_decl_line:-none} first mktemp:${first_mktemp:-none})")"
check "the trap and each pre-declaration block appear exactly once" "1 1 1" \
  "$(grep -c '^trap cleanup EXIT$' "$SCRIPT_DIR/agy-review.sh") $(grep -c "^_perm_err='' " "$SCRIPT_DIR/agy-review.sh") $(grep -c '^diff_file= ' "$SCRIPT_DIR/agy-review.sh")"

# A failed jq step in the archive lookup must be logged, not swallowed.
check "archive jq failures are logged" "no" \
  "$(grep -n 'SELECT_OURS_JQ" 2>/dev/null' "$SCRIPT_DIR/agy-review.sh" >/dev/null && echo yes || echo no)"

# --- byte limits are normalized before any arithmetic uses them -------------------
# REGRESSION (agy review, GH-ListRollup PR #4): MAX_PROMPT_BYTES=080000 passed the `[ ]` check and
# then aborted in `$(( ))` as invalid octal; MAX_BODY_BYTES=60k aborted the same way; and a
# non-numeric MAX_DIFF_BYTES silently disabled the diff cap. Each must be normalized, and before
# the first line that does arithmetic on it or passes it to agy_cut_file.
for v in MAX_DIFF_BYTES MAX_PROMPT_BYTES MAX_BODY_BYTES; do
  # `|| true`: under pipefail a missing line must report as a FAIL below, not abort the selftest.
  norm_line="$(grep -n "^normalize_numeric_env $v " "$SCRIPT_DIR/agy-review.sh" | head -1 | cut -d: -f1 || true)"
  # Code lines only: the explanatory comments quote the arithmetic they guard against. Matches the
  # variable ANYWHERE inside an arithmetic expansion, or as any argument to an agy_cut_*/agy_cap_*
  # helper -- not only as the first operand (agy review, GH-ListRollup PR #6).
  use_line="$(grep -nE "\\(\\([^)]*\\b$v\\b|agy_c(ut|ap)_[a-z_]+ .*\\\$\\{?$v\\b" "$SCRIPT_DIR/agy-review.sh" \
                | grep -vE '^[0-9]+:[[:space:]]*#' | head -1 | cut -d: -f1 || true)"
  check "$v is normalized before its first arithmetic use" "yes" \
    "$([ -n "$norm_line" ] && [ -n "$use_line" ] && [ "$norm_line" -lt "$use_line" ] && echo yes || echo "no (normalize:${norm_line:-none} use:${use_line:-none})")"
done
_nne_probe=080000; normalize_numeric_env _nne_probe 120000
check "normalize_numeric_env turns a leading-zero 080000 into 80000" "80000" "$_nne_probe"

# --- an archive emptied by trimming renders no empty <details> -------------------
# REGRESSION (agy review, GH-ListRollup PR #4): when every archived round was dropped, the
# "Earlier review rounds" <details> wrapper was still emitted around nothing.
# Whitespace-tolerant (agy review, GH-ListRollup PR #6): not coupled to the exact indentation.
check "the archive <details> wrapper is guarded on a non-empty archive" "2" \
  "$(grep -cE '^[[:space:]]*if \[ -s "\$archived_file" \]; then[[:space:]]*$' "$SCRIPT_DIR/agy-review.sh")"
# AGY_ERROR_MAX_BYTES: run the real validation with bad values, not a grep for its shape
# (agy review, GH-ListRollup PR #7). A non-numeric value or 0 would disable the backend-error
# guard; both must fall back to the default, and a leading-zero value must parse as decimal.
for _cap in "0:2000" "abc:2000" "5MB:2000" ":2000" "080:80" "4096:4096"; do
  AGY_ERROR_MAX_BYTES="${_cap%%:*}"; agy_validate_error_cap
  check "AGY_ERROR_MAX_BYTES='${_cap%%:*}' validates to ${_cap#*:}" "${_cap#*:}" "$AGY_ERROR_MAX_BYTES"
done
check "the script calls the error cap validation" "1" \
  "$(grep -c '^agy_validate_error_cap$' "$SCRIPT_DIR/agy-review.sh")"
AGY_ERROR_MAX_BYTES=2000

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
  normalize_numeric_env T 240 >/dev/null 2>&1 || echo "CRASHED"
  printf '%s' "$T"
}
check "numeric env: plain integer passes through"   "300"  "$(nne 300)"
check "numeric env: zero is a legal setting"        "0"    "$(nne 0)"
# 9, not a crash and not 8: `09` is all digits, so the digits-only check admits it, and bash then
# reads the leading zero as OCTAL. This is the case the digits-only check alone did NOT cover.
check "numeric env: leading zero canonicalizes"     "9"    "$(nne 09)"
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
  "$( { T=a_name; normalize_numeric_env T 240; } 2>&1 >/dev/null || true )"
# It assigns THROUGH a caller-supplied name, so its own locals must not collide with one. With
# plain `name`/`default`/`val` locals these two silently no-op -- the function reads and writes its
# own local and the caller's variable is never touched. Verified as a real failure before fixing.
name=09; normalize_numeric_env name 240
check "numeric env: a caller variable named 'name' is not shadowed" "9" "$name"
val=07;  normalize_numeric_env val 240
check "numeric env: a caller variable named 'val' is not shadowed"  "7" "$val"
default=08; normalize_numeric_env default 240
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
T=09; normalize_numeric_env T 240
# 9. Feeding the RAW `09` to the same expansion dies "value too great for base" under `set -e`,
# which is the crash this canonicalization exists to prevent -- asserted directly below.
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
check "a head without the line is labeled archived-at" "1" \
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
# A workflow that PINS AGY_PRINT_TIMEOUT bypasses the per-MiB scaling and its cap entirely
# (agy-review.sh: AGY_PRINT_TIMEOUT_EXPLICIT), so every attempt waits the pinned value; the budget
# must use it, or raising the pin past the cap could exceed timeout-minutes unnoticed (agy review
# of RustyNES_MiSTer #78). The value is a duration ("15m"), so wf_val's digits-only read won't do.
wf_pin() { sed -n "s/^[[:space:]]*AGY_PRINT_TIMEOUT:[[:space:]]*[\"']\{0,1\}\([0-9][0-9]*[smh]\{0,1\}\).*/\1/p;T;q" "$wf"; }
# budget_verdict: "fits" or "exceeds"; empty when the budget cannot be read. Uses $wf.
budget_verdict() {
  local job_min max_s lock_s retries delay pin per worst
  job_min="$(wf_val timeout-minutes)"
  max_s="$(wf_val AGY_PRINT_TIMEOUT_MAX_SECONDS)"; [ -n "$max_s" ] || max_s="$(sh_default AGY_PRINT_TIMEOUT_MAX_SECONDS)"
  lock_s="$(wf_val AGY_LOCK_WAIT)";               [ -n "$lock_s" ] || lock_s="$(sh_default AGY_LOCK_WAIT)"
  retries="$(wf_val AGY_RETRIES)";  [ -n "$retries" ] || retries="$(sh_default AGY_RETRIES)"
  delay="$(wf_val AGY_RETRY_DELAY)"; [ -n "$delay" ] || delay="$(sh_default AGY_RETRY_DELAY)"
  pin="$(wf_pin)"
  per="$max_s"
  if [ -n "$pin" ]; then per="$(duration_to_seconds "$pin")" || return 0; fi
  [ -n "$job_min" ] && [ -n "$per" ] && [ -n "$lock_s" ] && [ -n "$retries" ] && [ -n "$delay" ] || return 0
  worst=$(( lock_s + retries * per + delay * retries * (retries - 1) / 2 ))
  if [ "$worst" -lt $(( job_min * 60 - 120 )) ]; then echo "fits ${worst}s ${job_min}m"; else echo "exceeds ${worst}s ${job_min}m"; fi
}
verdict="$(budget_verdict)"
case "$verdict" in
  fits*) echo "  ok    worst case ${verdict#fits } (job timeout) fits with 2 minutes to spare" ;;
  exceeds*) echo "  FAIL  worst case ${verdict#exceeds } does not fit the job timeout"; fails=$((fails + 1)) ;;
  *) echo "  FAIL  could not read the timeout budget from $wf"; fails=$((fails + 1)) ;;
esac
# lock_verdict: "covers" when AGY_LOCK_WAIT outlasts ONE other review's whole hold of the
# host-wide agy lock (every attempt at the per-attempt budget plus the pauses between them),
# else "short"; empty when unreadable. The sum above can fit the job timeout while the wait
# itself is shorter than another review's hold, and then a review queued behind a busy
# repository's still times out red (AGY_LOCK_WAIT 300 against a ~15-minute review, RustyNES
# #664 / RustyNES_MiSTer #79, 2026-11-15; Antigravity on RustyNES #665).
lock_verdict() {
  local max_s lock_s retries delay pin per hold
  max_s="$(wf_val AGY_PRINT_TIMEOUT_MAX_SECONDS)"; [ -n "$max_s" ] || max_s="$(sh_default AGY_PRINT_TIMEOUT_MAX_SECONDS)"
  lock_s="$(wf_val AGY_LOCK_WAIT)";               [ -n "$lock_s" ] || lock_s="$(sh_default AGY_LOCK_WAIT)"
  retries="$(wf_val AGY_RETRIES)";  [ -n "$retries" ] || retries="$(sh_default AGY_RETRIES)"
  delay="$(wf_val AGY_RETRY_DELAY)"; [ -n "$delay" ] || delay="$(sh_default AGY_RETRY_DELAY)"
  pin="$(wf_pin)"
  per="$max_s"
  if [ -n "$pin" ]; then per="$(duration_to_seconds "$pin")" || return 0; fi
  [ -n "$per" ] && [ -n "$lock_s" ] && [ -n "$retries" ] && [ -n "$delay" ] || return 0
  hold=$(( retries * per + delay * retries * (retries - 1) / 2 ))
  if [ "$lock_s" -gt "$hold" ]; then echo "covers ${lock_s}s ${hold}s"; else echo "short ${lock_s}s ${hold}s"; fi
}
lv="$(lock_verdict)"
case "$lv" in
  covers*) read -r lw lh <<<"${lv#covers }"; echo "  ok    AGY_LOCK_WAIT $lw outlasts one other review's whole hold of the agy lock ($lh)" ;;
  short*)  read -r lw lh <<<"${lv#short }"; echo "  FAIL  AGY_LOCK_WAIT $lw is shorter than one other review's hold of the agy lock ($lh)"; fails=$((fails + 1)) ;;
  *) echo "  FAIL  could not read the lock-wait budget from $wf"; fails=$((fails + 1)) ;;
esac
# And it must be able to fail: the old 300 s wait against the same workflow is short.
real_wf="$wf"
sed 's/^\([[:space:]]*AGY_LOCK_WAIT:[[:space:]]*\)"\{0,1\}[0-9]*"\{0,1\}/\1"300"/' "$real_wf" > "$TMPD/lock300.yml"
wf="$TMPD/lock300.yml"
check "a 300 s AGY_LOCK_WAIT is reported shorter than one review's hold" "short" "$(lock_verdict | cut -d' ' -f1)"
wf="$real_wf"
# The pin must count: the same workflow with a 50-minute pin has to be reported as exceeding.
real_wf="$wf"
# Drop any pin the real workflow already carries first, so the synthetic file has exactly one
# AGY_PRINT_TIMEOUT key whatever this repository pins (a duplicate key only "worked" because the
# reader stops at the first match).
sed -e '/^[[:space:]]*AGY_PRINT_TIMEOUT:/d' \
    -e 's/^\([[:space:]]*\)AGY_EFFORT:.*/&\n\1AGY_PRINT_TIMEOUT: 50m/' "$real_wf" > "$TMPD/pinned.yml"
check "the synthetic pinned workflow has exactly one AGY_PRINT_TIMEOUT key" "1" \
  "$(grep -c '^[[:space:]]*AGY_PRINT_TIMEOUT:' "$TMPD/pinned.yml")"
wf="$TMPD/pinned.yml"
check "a pinned AGY_PRINT_TIMEOUT counts in the timeout budget" "exceeds" "$(budget_verdict | cut -d' ' -f1)"
wf="$real_wf"
# The prompt cap's default must sit at or below its own ceiling; above it, every run logged a
# spurious "invalid ... clamping" warning and overrode its own default (agy review of Rusty2600 #53).
ceiling="$(sed -n 's/^ARG_SIZE_CEILING=\([0-9][0-9]*\).*/\1/p' "$SCRIPT_DIR/agy-review.sh")"
check "the MAX_PROMPT_BYTES default is within ARG_SIZE_CEILING" "yes" \
  "$([ "$(sh_default MAX_PROMPT_BYTES)" -le "${ceiling:-0}" ] 2>/dev/null && echo yes || echo no)"

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

# agy runs under --dangerously-skip-permissions and reads an untrusted diff, so the repository
# checkout must never be in its workspace: a planted .git/hooks or .git/config would execute in a
# later token-bearing git call. The large-diff handoff once used `--add-dir "$PWD"`.
check "agy is never given the checkout via --add-dir" "0" \
  "$(grep -cE -- '--add-dir[[:space:]]+"?\$(PWD|\{PWD\})' "$SCRIPT_DIR/agy-review.sh")"
check "agy runs from its private sandbox directory (both PTY paths)" "2" \
  "$(grep -cE '\( cd "\$agy_sandbox" && ' "$SCRIPT_DIR/agy-review.sh")"
check "both PTY paths start inside the allowlisted environment (env -i before unbuffer/script)" "2" \
  "$(grep -cE '\( cd "\$agy_sandbox" && "\$\{agy_env\[@\]\}" (unbuffer|AGY_BIN=)' "$SCRIPT_DIR/agy-review.sh")"
# bubblewrap isolation (AGY_ISOLATION=bwrap): agy's --sandbox does not confine reads and agy loads
# the user's MCP servers/skills/hooks, so the jail is the real boundary. Statically pin its shape.
SCRIPT="$SCRIPT_DIR/agy-review.sh"
check "isolation defaults to bwrap" "1" \
  "$(grep -c '^AGY_ISOLATION="\${AGY_ISOLATION:-bwrap}"' "$SCRIPT")"
check "both PTY paths launch agy through the jail" "2" \
  "$(grep -cE 'unbuffer "\$\{agy_jail\[@\]\}" "\$AGY_BIN"|printf .%q . "\$\{agy_jail\[@\]\}" "\$here/_agy_print.sh"' "$SCRIPT")"
check "the jail gives agy an empty private HOME (tmpfs /home + private bind)" "1" \
  "$(grep -c -- '--tmpfs /home --bind "\$agy_jail_home" "\$HOME"' "$SCRIPT")"
check "Item.GetSecret is granted only on the resolved keyring item(s)" "1" \
  "$(grep -c 'Secret.Item.GetSecret@' "$SCRIPT")"
check "the GetSecret grant uses the resolved item variable, never a wildcard" "1" \
  "$(grep -c 'Secret.Item.GetSecret@\${_it}' "$SCRIPT")"
check "the bulk Service.GetSecrets call is never granted" "0" \
  "$(grep -c 'Secret.Service.GetSecrets' "$SCRIPT")"
check "a missing bwrap/xdg-dbus-proxy/gdbus fails closed" "1" \
  "$(grep -c "refusing to run agy unjailed (set AGY_ISOLATION=none" "$SCRIPT")"
check "the proxy runs with --filter (deny by default)" "1" \
  "$(grep -c 'xdg-dbus-proxy "\$DBUS_SESSION_BUS_ADDRESS" "\$agy_jail_rt/bus" --filter' "$SCRIPT")"
# Egress filtering (AGY_EGRESS=filtered): without it a prompt-injected diff could make agy send its
# own Google login token anywhere. Static shape first, then the embedded proxy exercised offline.
check "egress defaults to filtered" "1" \
  "$(grep -c '^AGY_EGRESS="\${AGY_EGRESS:-filtered}"' "$SCRIPT")"
check "the filtered jail drops --share-net (only its own loopback)" "1" \
  "$(grep -c '^    _net=()   # --unshare-all without --share-net' "$SCRIPT")"
check "the default allowlist has no wildcard or suffix entry" "0" \
  "$(grep '^AGY_EGRESS_ALLOW=' "$SCRIPT" | grep -cE '[*]|[ "-]\.')"
check "storage.googleapis.com is never allowlisted" "0" \
  "$(grep '^AGY_EGRESS_ALLOW=' "$SCRIPT" | grep -c 'storage\.googleapis\.com')"
check "allowlist entries are validated as exact host names" "1" \
  "$(grep -c 'exact lowercase host names only, no wildcards' "$SCRIPT")"
check "the CA and leaf keys are never bound into the jail" "0" \
  "$(grep -E -- '--(ro-)?bind[^)]*(pki|ca\.key|leaf\.key)' "$SCRIPT" | grep -vc '^ *#')"
check "egress needs socat/python3/openssl or fails closed" "1" \
  "$(grep -c '\[ "\$AGY_EGRESS" = filtered \] && _need+=( socat python3 openssl )' "$SCRIPT")"
check "egress needs python3 >= 3.11 or fails closed" "1" \
  "$(grep -c "sys.exit(sys.version_info < (3, 11))" "$SCRIPT")"
check "the bridge wrapper refuses to launch agy when the bridge is down" "1" \
  "$(grep -c 'agy-jail: the egress bridge did not start' "$SCRIPT")"
check "path rules must name an allowlisted host" "1" "$(grep -c 'which is not in AGY_EGRESS_ALLOW' "$SCRIPT")"
check "the leaf certificate covers every allowlisted host" "1" "$(grep -c '_san="DNS:\${_allow//,/,DNS:}"' "$SCRIPT")"
check "the job log prints egress verdict counts, never names" "1" \
  "$(grep -c "awk '{print \$1}' \"\$agy_jail_rt/egress.log\"" "$SCRIPT")"
proxy_py="$TMPD/egress.py"
sed -n "/^  cat <<'AGYPY'$/,/^AGYPY$/p" "$SCRIPT" | sed '1d;$d' > "$proxy_py"
check "the embedded egress proxy compiles" "0" \
  "$(python3 -I -m py_compile "$proxy_py" >/dev/null 2>&1; echo $?)"
# The egress proxy, exercised offline over real TLS (round 6). EVERY allowlisted host is
# TLS-terminated and each request is rebuilt, because Google's front end routes by Host on any
# googleapis connection (fronting to Cloud Storage was verified through oauth2, aicode and
# daily-cloudcode-pa). Every refusal below happens before any upstream connection, so no network
# is needed. A host that has python3 and openssl must run these: a certificate failure is a FAIL.
# The proxy needs Python 3.11 (StreamWriter.start_tls); an older python3 would fail every TLS case
# with an opaque error, so it is reported as a skip instead.
if command -v python3 >/dev/null 2>&1 && python3 -I -c 'import sys; sys.exit(sys.version_info < (3, 11))' \
   && command -v openssl >/dev/null 2>&1; then
  # Unix socket paths are capped at 108 bytes, so the socket lives in a short dir, not under TMPD.
  sockd="$(mktemp -d "${XDG_RUNTIME_DIR:-/tmp}/agyst.XXXXXX")"
  ip="$TMPD/icpt"; mkdir -p "$ip"
  certs_ok=no
  if { openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 1 \
         -subj "/CN=selftest CA" -addext "basicConstraints=critical,CA:TRUE" \
         -addext "keyUsage=critical,keyCertSign" -keyout "$ip/ca.key" -out "$ip/ca.pem" \
       && openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -subj "/CN=selftest" \
         -keyout "$ip/leaf.key" -out "$ip/leaf.csr" \
       && openssl x509 -req -in "$ip/leaf.csr" -CA "$ip/ca.pem" -CAkey "$ip/ca.key" -days 1 \
         -extfile <(printf 'subjectAltName=DNS:allowed.example,DNS:paths.example\nextendedKeyUsage=serverAuth\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n') \
         -out "$ip/leaf.pem"; } >/dev/null 2>&1; then
    certs_ok=yes
  fi
  check "the self-test can create its TLS certificates (openssl present)" "yes" "$certs_ok"
  if [ "$certs_ok" = yes ]; then
    px_log="$ip/log"; : > "$px_log"
    python3 -I "$proxy_py" "$sockd/p.sock" "$px_log" "allowed.example,paths.example" \
      "$ip/leaf.pem" "$ip/leaf.key" "paths.example=/v1/user.info" 2>"$ip/err" &
    px_pid=$!
    for _ in $(seq 1 50); do [ -S "$sockd/p.sock" ] && break; sleep 0.1; done
    cat > "$ip/client.py" <<'PYC'
import socket, ssl, sys
sock_path, ca, target, raw = sys.argv[1:5]
head = raw.encode("latin-1").decode("unicode_escape").encode("latin-1")
s = socket.socket(socket.AF_UNIX); s.settimeout(10); s.connect(sock_path)
s.sendall(f"CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n\r\n".encode())
first = s.recv(4096).split(b"\r\n", 1)[0].split(b" ")
if len(first) < 2 or first[1] != b"200":
    print(first[1].decode() if len(first) > 1 else "closed"); sys.exit()
if raw == "-":
    print("200"); sys.exit()
t = ssl.create_default_context(cafile=ca).wrap_socket(s, server_hostname=target.rsplit(":", 1)[0])
t.sendall(head)
try:
    print(t.recv(4096).split(b"\r\n", 1)[0].split(b" ")[1].decode())
except (OSError, IndexError):
    print("closed")
PYC
    pc() { python3 -I "$ip/client.py" "$sockd/p.sock" "$ip/ca.pem" "$1" "$2" 2>/dev/null || echo error; }
    A='allowed.example:443'; H='Host: allowed.example\r\n'
    check "proxy refuses an unlisted host" "403" "$(pc 'secret-token-in-name.evil.example:443' -)"
    check "proxy refuses a suffix of an allowed host" "403" "$(pc 'x.allowed.example:443' -)"
    check "proxy refuses an allowed host on another port" "403" "$(pc 'allowed.example:80' -)"
    check "fronting refused: foreign Host on an allowed connection" "403" \
      "$(pc "$A" 'GET /storage/v1/b/x HTTP/1.1\r\nHost: storage.googleapis.com\r\n\r\n')"
    check "fronting refused: bucket subdomain Host" "403" \
      "$(pc "$A" 'GET /p?t=secret HTTP/1.1\r\nHost: evil-bucket.storage.googleapis.com\r\n\r\n')"
    check "duplicate Host refused" "403" "$(pc "$A" "GET / HTTP/1.1\\r\\n${H}Host: storage.googleapis.com\\r\\n\\r\\n")"
    check "missing Host refused" "403" "$(pc "$A" 'GET / HTTP/1.1\r\n\r\n')"
    check "absolute-form target refused" "403" \
      "$(pc "$A" "GET https://storage.googleapis.com/x HTTP/1.1\\r\\n${H}\\r\\n")"
    check "Content-Length with Transfer-Encoding refused" "403" \
      "$(pc "$A" "POST / HTTP/1.1\\r\\n${H}Content-Length: 3\\r\\nTransfer-Encoding: chunked\\r\\n\\r\\n")"
    check "a transfer coding other than chunked refused" "403" \
      "$(pc "$A" "POST / HTTP/1.1\\r\\n${H}Transfer-Encoding: gzip, chunked\\r\\n\\r\\n")"
    check "conflicting Content-Length values refused" "403" \
      "$(pc "$A" "POST / HTTP/1.1\\r\\n${H}Content-Length: 3\\r\\nContent-Length: 4\\r\\n\\r\\n")"
    check "bare LF inside the head refused (smuggling)" "403" \
      "$(pc "$A" "GET / HTTP/1.1\\r\\n${H}X-A: 1\\nHost: storage.googleapis.com\\r\\n\\r\\n")"
    check "obs-fold refused" "403" "$(pc "$A" "GET / HTTP/1.1\\r\\n${H}X-A: 1\\r\\n folded\\r\\n\\r\\n")"
    check "control byte refused" "403" "$(pc "$A" "GET / HTTP/1.1\\r\\n${H}X-A: a\\x01b\\r\\n\\r\\n")"
    check "HTTP/1.0 refused" "403" "$(pc "$A" "GET / HTTP/1.0\\r\\n${H}\\r\\n")"
    P='paths.example:443'; PH='Host: paths.example\r\n'
    check "path rule: a query string is refused" "403" \
      "$(pc "$P" "GET /v1/user.info?x=secret HTTP/1.1\\r\\n${PH}\\r\\n")"
    check "path rule: another path is refused" "403" "$(pc "$P" "GET /storage/v1/b/x HTTP/1.1\\r\\n${PH}\\r\\n")"
    check "path rule: a POST to the allowed path is refused" "403" \
      "$(pc "$P" "POST /v1/user.info HTTP/1.1\\r\\n${PH}Content-Length: 1\\r\\n\\r\\n")"
    check "path rule: the path is literal, not a regex (. is not a wildcard)" "403" \
      "$(pc "$P" "GET /v1/userXinfo HTTP/1.1\\r\\n${PH}\\r\\n")"
    check "Expect: 100-continue is answered 417, not stalled" "417" \
      "$(pc "$A" "POST / HTTP/1.1\\r\\n${H}Content-Length: 1\\r\\nExpect: 100-continue\\r\\n\\r\\n")"
    kill "$px_pid" 2>/dev/null; wait "$px_pid" 2>/dev/null || true   # 143 from the kill is expected
    px_pid=
    check "proxy never logs a denied host name" "0" "$(grep -c 'evil' "$px_log")"
    # One verdict per refused case above: 3 CONNECT, 12 request-head, 4 path-rule, 1 Expect.
    check "every denial is logged by verdict, one per refused request" "20" "$(grep -cE '^DENY' "$px_log")"
    # rebuild_request, unit level: Host set by the proxy, hop-by-hop dropped, framing canonical.
    rb="$(python3 -I - "$proxy_py" "$ip/leaf.pem" "$ip/leaf.key" <<'PYR' 2>/dev/null
import sys
src = open(sys.argv[1]).read().split("\nasyncio.run(main())", 1)[0]
sys.argv = ["x", "/dev/null", "/dev/null", "allowed.example", sys.argv[2], sys.argv[3], ""]
ns = {"__name__": "agy_egress_test"}
exec(compile(src, "proxy", "exec"), ns)
head = (b"POST /v1/x HTTP/1.1\r\nHost: allowed.example\r\nAuthorization: Bearer t\r\n"
        b"Connection: keep-alive, X-Diag\r\nX-Diag: local\r\nUpgrade: h2c\r\nTransfer-Encoding: chunked\r\n"
        b"X-Goog-Api-Client: a\r\n\r\n")
out, kind, n = ns["rebuild_request"](head, "allowed.example")
print(kind + "|" + "|".join(out.decode().split("\r\n")))
PYR
)" || rb="(rebuild_request missing or failed)"
    check "the rebuilt request sets Host itself, drops hop-by-hop and Connection-named headers, keeps chunked framing" \
      "chunked|POST /v1/x HTTP/1.1|Host: allowed.example|Authorization: Bearer t|X-Goog-Api-Client: a|Transfer-Encoding: chunked|Connection: close||" "$rb"
    cl0="$(python3 -I - "$proxy_py" "$ip/leaf.pem" "$ip/leaf.key" <<'PYL' 2>/dev/null
import sys
src = open(sys.argv[1]).read().split("\nasyncio.run(main())", 1)[0]
sys.argv = ["x", "/dev/null", "/dev/null", "allowed.example", sys.argv[2], sys.argv[3], ""]
ns = {"__name__": "agy_egress_test"}
exec(compile(src, "proxy", "exec"), ns)
for head in (b"POST /v1/x HTTP/1.1\r\nHost: allowed.example\r\nContent-Length: 0\r\n\r\n",
             b"POST /v1/x HTTP/1.1\r\nHost: allowed.example\r\n\r\n",
             b"GET /v1/x HTTP/1.1\r\nHost: allowed.example\r\n\r\n"):
    out, kind, n = ns["rebuild_request"](head, "allowed.example")
    print(kind + "|" + "|".join(out.decode().split("\r\n")))
PYL
)" || cl0="(rebuild_request missing or failed)"
    check "an empty POST keeps Content-Length: 0 (Google answers 411 without it)" \
      "none|POST /v1/x HTTP/1.1|Host: allowed.example|Content-Length: 0|Connection: close||" "$(printf '%s\n' "$cl0" | sed -n 1p)"
    check "a POST with no length header is sent with Content-Length: 0" \
      "none|POST /v1/x HTTP/1.1|Host: allowed.example|Content-Length: 0|Connection: close||" "$(printf '%s\n' "$cl0" | sed -n 2p)"
    check "a GET with no body gets no framing header" \
      "none|GET /v1/x HTTP/1.1|Host: allowed.example|Connection: close||" "$(printf '%s\n' "$cl0" | sed -n 3p)"
    # copy_chunked on real streams (round 9): a trailer after the last chunk is consumed and NOT
    # forwarded, exactly the terminating `0\r\n\r\n` goes upstream, and the bytes of a following
    # request stay unread (never smuggled upstream behind the body).
    cc="$(python3 -I - "$proxy_py" "$ip/leaf.pem" "$ip/leaf.key" <<'PYC' 2>/dev/null
import asyncio, sys
src = open(sys.argv[1]).read().split("\nasyncio.run(main())", 1)[0]
sys.argv = ["x", "/dev/null", "/dev/null", "allowed.example", sys.argv[2], sys.argv[3], ""]
ns = {"__name__": "agy_egress_test"}
exec(compile(src, "proxy", "exec"), ns)


class Rec:
    def __init__(self):
        self.out = bytearray()

    def write(self, b):
        self.out += b

    async def drain(self):
        pass


async def run(feed):
    r = asyncio.StreamReader()
    r.feed_data(feed)
    r.feed_eof()
    w = Rec()
    await ns["copy_chunked"](r, w)
    return bytes(w.out), await r.read()


for feed in (b"0\r\nX-Injected: 1\r\n\r\nGET /next HTTP/1.1\r\n",
             b"3;ext=1\r\nabc\r\n0\r\n\r\nGET /next HTTP/1.1\r\n"):
    out, rest = asyncio.run(run(feed))
    print(repr(out) + "|" + repr(rest))
PYC
)" || cc="(copy_chunked missing or failed)"
    check "a chunk trailer is dropped and exactly 0 CRLF CRLF goes upstream; the next request stays unread" \
      "b'0\\r\\n\\r\\n'|b'GET /next HTTP/1.1\\r\\n'" "$(printf '%s\n' "$cc" | sed -n 1p)"
    check "a data chunk is forwarded without its extension, then the terminator; the next request stays unread" \
      "b'3\\r\\nabc\\r\\n0\\r\\n\\r\\n'|b'GET /next HTTP/1.1\\r\\n'" "$(printf '%s\n' "$cc" | sed -n 2p)"
  fi
  rm -rf -- "$sockd"; sockd=
else
  echo "  skip  the egress-proxy cases: they need python3 >= 3.11 and openssl"
fi
# A jail launch diagnostic is never accepted as a review (Codex P2), and cleanup survives a dead proxy.
jf="$TMPD/jail-fail.txt"
printf '\n\nbwrap: Can'"'"'t find source path /x: No such file or directory\n' > "$jf"
check "a bwrap launch diagnostic is recognized as a jail failure" "yes" "$(agy_jail_failed "$jf" && echo yes || echo no)"
printf 'agy-jail: line 1: socat: command not found\n' > "$jf"
check "an in-jail wrapper diagnostic is recognized as a jail failure" "yes" "$(agy_jail_failed "$jf" && echo yes || echo no)"
printf '## Review\n\nThe bwrap: prefix appears only mid-review here.\nbwrap: not first\n' > "$jf"
check "a review that merely mentions bwrap is not a jail failure" "no" "$(agy_jail_failed "$jf" && echo yes || echo no)"
check "the capture loop refuses a jail failure before any retry or post" "1" \
  "$(grep -c '^  if agy_jail_failed "\$out_file"; then' "$SCRIPT")"
check "cleanup reaps both proxies before removing their runtime dir" "2" \
  "$(grep -cE '^  \[ -n "\$\{agy_(proxy|egress)_pid:-\}" \] && \{ wait "\$agy_(proxy|egress)_pid" 2>/dev/null \|\| true; \}$' "$SCRIPT")"
lock_line="$(grep -n '^flock -w "\$AGY_LOCK_WAIT" 9 || {$' "$SCRIPT" | head -1 | cut -d: -f1)"
jail_line="$(grep -n '^  agy_jail_rt="\$(mktemp -d' "$SCRIPT" | head -1 | cut -d: -f1)"
check "the agy lock is taken before the jail and its proxies are started" "yes" \
  "$([ -n "$lock_line" ] && [ -n "$jail_line" ] && [ "$lock_line" -lt "$jail_line" ] && echo yes || echo no)"
check "each attempt starts with no redactions recorded" "1" \
  "$(grep -c '^  redacted_kinds=   # this attempt' "$SCRIPT")"
check "the last guard scans the assembled comment body" "1" \
  "$(grep -c '^if cred_kind="\$(credential_kind_present "\$body_file")"; then$' "$SCRIPT")"
check "an empty AGY_EGRESS_ALLOW is refused by name" "1" "$(grep -c 'AGY_EGRESS_ALLOW is empty; refusing' "$SCRIPT")"
check "cleanup ignores a failed kill of either proxy (set -e safe)" "2" \
  "$(grep -cE '^  \[ -n "\$\{agy_(proxy|egress)_pid:-\}" \] && \{ kill "\$agy_(proxy|egress)_pid" 2>/dev/null \|\| true; \}$' "$SCRIPT")"
# Round-4 review fixes.
cred_line="$(grep -n '^  if cred_kind="\$(credential_kind_present "\$out_file")"; then' "$SCRIPT" | head -1 | cut -d: -f1 || true)"
svc_line="$(grep -n '^  if \[ "\$svc_err" = yes \]; then' "$SCRIPT" | head -1 | cut -d: -f1 || true)"
svc_class="$(grep -n '^  svc_err=no; service_error_present "\$out_file" && svc_err=yes$' "$SCRIPT" | head -1 | cut -d: -f1 || true)"
check "each capture is credential-scanned before any handler logs it" "yes" \
  "$([ -n "$cred_line" ] && [ -n "$svc_line" ] && [ "$cred_line" -lt "$svc_line" ] && echo yes || echo no)"
# Round 8: a backend error is classified on the unredacted capture, because a redaction marker
# is longer than the key it replaces and can push a short error past AGY_ERROR_MAX_BYTES.
check "a backend error is classified before redaction can lengthen it" "yes" \
  "$([ -n "$svc_class" ] && [ -n "$cred_line" ] && [ "$svc_class" -lt "$cred_line" ] && echo yes || echo no)"
grow="$TMPD/grow.txt"
{ printf 'Error: backend failed for key AKIA%s ' "$(printf 'Q%.0s' {1..16})"; head -c 1945 /dev/zero | tr '\0' x; } > "$grow"
check "(why) a near-limit backend error is caught as agy produced it" "yes" \
  "$(service_error_present "$grow" && echo yes || echo no)"
agy_redact_credentials "$grow"
check "(why) the same error, redacted, has grown past the size guard" "no" \
  "$(service_error_present "$grow" && echo yes || echo no)"
check "the public stderr tail is scanned from a regular file and withheld on a match" "1" \
  "$(grep -c '^    if log_cred="\$(credential_kind_present "\$log_tail")"; then' "$SCRIPT")"
check "an empty AGY_KEYRING_ATTRS is refused (SearchItems {} matches every item)" "1" \
  "$(grep -c 'AGY_KEYRING_ATTRS is empty; refusing to grant agy keyring access' "$SCRIPT")"
check "agy gets TMPDIR=/tmp inside the jail" "1" "$(grep -c '"TMPDIR=/tmp"' "$SCRIPT")"
check "top-level dirs mirror the host layout (no hard-coded lib64 link)" "0" \
  "$(grep -c -- '--symlink usr/lib /lib64' "$SCRIPT")"
check "denied egress names go to a host-private log, never the job log" "1" \
  "$(grep -c 'AGY_EGRESS_DENIED_LOG:-\$HOME/.gemini/antigravity-cli/agy-egress-denied.log' "$SCRIPT")"
lt="$TMPD/log-tail.txt"; printf 'boom\nghp_%s\n' "$(printf 'k%.0s' {1..36})" > "$lt"
check "a credential in agy stderr is detected from a file" "yes" \
  "$(credential_kind_present "$lt" >/dev/null && echo yes || echo no)"
# The host-private denied-host log: created on the FIRST run (no prior file), mode 600, appended
# on later runs, and bounded.
dsrc="$TMPD/denied.txt"; ddst="$TMPD/sub/agy-egress-denied.log"; mkdir -p "$TMPD/sub"
printf 'new-host.example:443\nnew-host.example:443\nother.example:443\n' > "$dsrc"
agy_record_denied "$dsrc" "$ddst" "o/r#1"
check "denied-host log is created on the first run" "2" "$(wc -l < "$ddst" 2>/dev/null || echo 0)"
check "denied-host log is mode 600" "600" "$(stat -c %a "$ddst" 2>/dev/null || echo none)"
agy_record_denied "$dsrc" "$ddst" "o/r#2"
check "denied-host log appends on a later run" "4" "$(wc -l < "$ddst" 2>/dev/null || echo 0)"
for _ in $(seq 1 300); do agy_record_denied "$dsrc" "$ddst" "o/r#n"; done
check "denied-host log keeps exactly the newest 500 records" "500" "$(wc -l < "$ddst")"
check "the newest record survives trimming" "yes" "$(tail -n 1 "$ddst" | grep -q 'o/r#n other.example:443' && echo yes || echo no)"
# Round 10: control bytes never reach the host log, and a custom log path's directory is created.
printf 'evil\033]0;pwned\007.example:443\n' > "$dsrc"
ddst2="$TMPD/new/dir/agy-egress-denied.log"
agy_record_denied "$dsrc" "$ddst2" "o/r#c" || true   # a failure is reported by the checks below
check "denied-host log creates a missing parent directory" "yes" "$([ -s "$ddst2" ] && echo yes || echo no)"
check "denied-host log strips control bytes from attacker-chosen targets" "0" \
  "$(LC_ALL=C grep -c "$(printf '[\001-\010\013-\037\177]')" "$ddst2" || true)"
printf 'a|b&c\\d.example:443\n' > "$dsrc"
agy_record_denied "$dsrc" "$ddst2" 'o/r|&\x' || true   # a failure is reported by the checks below
check "denied-host log prefixes a tag with sed metacharacters intact" "yes" \
  "$(tail -n 1 "$ddst2" | grep -qF 'o/r|&\x a|b&c\d.example:443' && echo yes || echo no)"
# Redaction (redact-and-post): every positive shape is fully redacted, boundaries survive, and a
# fixture-style JWT in an otherwise ordinary review leaves the rest of the text intact.
rd="$TMPD/redact.txt"
s_jwt2="eyJ""hbGciOiJIUzI1NiJ9.""eyJ""zdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop"
printf '## Review\n\nThe fixture (%s) in tests/auth.rs is fine.\nKeep this line.\n' "$s_jwt2" > "$rd"
agy_redact_credentials "$rd"
check "a fixture JWT is redacted, not fatal" "yes" "$(grep -q '(\[REDACTED: jwt\]) in tests/auth.rs is fine.' "$rd" && echo yes || echo no)"
check "redaction leaves the rest of the review intact" "yes" "$(grep -qx 'Keep this line.' "$rd" && echo yes || echo no)"
printf 'one\n-----BEGIN OPENSSH ''PRIVATE KEY-----\nAAAAB3NzaC1yc2E\nmore-key-body\n-----END OPENSSH ''PRIVATE KEY-----\ntwo\n' > "$rd"
agy_redact_credentials "$rd"
check "a private-key block is redacted whole, body lines included" "one|[REDACTED: private-key-block]|two" "$(paste -sd'|' "$rd")"
printf 'one\nkey -----BEGIN RSA ''PRIVATE KEY-----MIIEabc-----END RSA ''PRIVATE KEY----- here\ntwo\nthree\n' > "$rd"
agy_redact_credentials "$rd"
check "a one-line private key is redacted without eating the rest of the review" \
  "one|key [REDACTED: private-key-block] here|two|three" "$(paste -sd'|' "$rd")"
printf 'one\n-----BEGIN RSA ''PRIVATE KEY-----\nMIIEabc\n' > "$rd"
agy_redact_credentials "$rd"
check "an unterminated private key is removed to the end, and the comment says text was removed" \
  "one|[REDACTED: private-key-block]|[REDACTED: the rest of this review was removed: it quoted the start of a private key with no END line]" "$(paste -sd'|' "$rd")"
# Round 10: an END followed by a second BEGIN on the same line must not hide the second key.
printf -- '-----BEGIN RSA ''PRIVATE KEY-----\nAAAA\n-----END RSA ''PRIVATE KEY----- x -----BEGIN EC ''PRIVATE KEY-----\nBBBB\n-----END EC ''PRIVATE KEY-----\ntwo\n' > "$rd"
agy_redact_credentials "$rd"
check "a second private key opened on the first key's END line is redacted too" \
  "[REDACTED: private-key-block]| x [REDACTED: private-key-block]|two" "$(paste -sd'|' "$rd")"
printf 'a -----BEGIN RSA ''PRIVATE KEY-----K1-----END RSA ''PRIVATE KEY----- b -----BEGIN RSA ''PRIVATE KEY-----K2-----END RSA ''PRIVATE KEY----- c\n' > "$rd"
agy_redact_credentials "$rd"
check "two one-line private keys on one line keep the text between them" \
  "a [REDACTED: private-key-block] b [REDACTED: private-key-block] c" "$(cat "$rd")"
printf 'keys %s.%s and %s\n' "AKI""AABCDEFGHIJKLMNOP" "AKI""AQRSTUVWXYZ234567" "gh""p_$(printf 'c%.0s' {1..36})" > "$rd"
agy_redact_credentials "$rd"
check "adjacent matches are all redacted, boundaries kept" "keys [REDACTED: aws-access-key-id].[REDACTED: aws-access-key-id] and [REDACTED: github-token]" "$(cat "$rd")"
check "the capture loop redacts instead of failing" "1" \
  "$(grep -c '^    if ! agy_redact_credentials "\$out_file" || left="\$(credential_kind_present "\$out_file")"; then' "$SCRIPT")"
check "a redacted review says so in the comment" "1" "$(grep -c 'credential-shaped strings were redacted from this review before posting' "$SCRIPT")"
# Commit security review of 1d782bb: chunk trailers are discarded, never forwarded, and redaction
# uses no scratch file (a predictable sibling in a shared TMPDIR).
# (The trailer handling is exercised on real streams in the TLS block above.)
check "redaction works in memory, with no scratch file" "0" \
  "$(sed -n '/^agy_redact_credentials() {/,/^}/p' "$SCRIPT" | grep -cE 'mktemp|\.redact|> *"\$tmp"')"
# Credential scan: every shape is caught, ordinary review text is not.
cred_tmp="$TMPD/cred.txt"
printf 'key AKIA%s and gh''p_%s here\n' "$(printf 'Q%.0s' {1..16})" "$(printf 'k%.0s' {1..36})" > "$cred_tmp"
check "every credential kind present is named, not only the first" "github-token, aws-access-key-id" \
  "$(credential_kinds_present "$cred_tmp")"
# Samples are assembled at runtime from split pieces, so this file never contains a literal that a
# repository secret scanner (gitleaks) would flag.
s_jwt="eyJ""hbGciOiJIUzI1NiJ9.""eyJ""zdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop"
s_aws="AKI""AABCDEFGHIJKLMNOP"
s_key="-----BEGIN OPENSSH ""PRIVATE KEY-----"
for sample in "token ya2""9.$(printf 'a%.0s' {1..30})" "refresh 1/""/0$(printf 'b%.0s' {1..30})" \
              "gh""p_$(printf 'c%.0s' {1..36})" "github""_pat_$(printf 'd%.0s' {1..50})" \
              "$s_key" "$s_jwt" "key $s_aws." "sk-a""nt-$(printf 'e%.0s' {1..40})" \
              "sk-pro""j-$(printf 'f%.0s' {1..40})" "xox""b-1234567890-abcdef" \
              "sk-pro""j-$(printf 'aB3_-%.0s' {1..9})" "sk-svc""acct-$(printf 'Zq9-_%.0s' {1..8})"; do
  printf '## Review\n\nfound %s here\n' "$sample" > "$cred_tmp"
  check "credential scan catches: ${sample:0:14}..." "yes" \
    "$(credential_kind_present "$cred_tmp" >/dev/null && echo yes || echo no)"
  agy_redact_credentials "$cred_tmp"
  check "redaction removes it entirely: ${sample:0:14}..." "no" \
    "$(credential_kind_present "$cred_tmp" >/dev/null && echo yes || echo no)"
done
# No false positives on ordinary identifiers that merely CONTAIN a token prefix.
for benign in "task-$(printf 'g%.0s' {1..40})" "disk-$(printf 'h%.0s' {1..40})" \
              "risk-assessment-of-the-new-staging-pipeline-in-detail" \
              "xghp_$(printf 'i%.0s' {1..36})" "myxoxb-thing" "BAKIA$(printf 'J%.0s' {1..16})Z"; do
  printf '## Review\n\nsee %s for details\n' "$benign" > "$cred_tmp"
  check "credential scan ignores: ${benign:0:14}..." "no" \
    "$(credential_kind_present "$cred_tmp" >/dev/null && echo yes || echo no)"
done
printf '## Review\n\nNo blocking issues. GH_TOKEN is stripped; see ya29 docs and the BEGIN marker.\n' > "$cred_tmp"
check "credential scan passes ordinary review text" "no" \
  "$(credential_kind_present "$cred_tmp" >/dev/null && echo yes || echo no)"
check "post-agy git calls disable hooks and fsmonitor" "2" \
  "$(grep -cE 'git -c core\.hooksPath=/dev/null -c core\.fsmonitor=false update-ref' "$SCRIPT_DIR/agy-review.sh")"

# The allowlisted environment: run the real function against a fake job environment. Anything not
# on the allowlist is dropped, including credentials under ordinary-looking names.
env_fn="$(sed -n '/^agy_allowlisted_env_args() {/,/^}/p' "$SCRIPT_DIR/agy-review.sh")"
check "the allowlist function was found in agy-review.sh" "yes" "$([ -n "$env_fn" ] && echo yes || echo no)"
env_out="$(
  export GH_TOKEN=x GITHUB_TOKEN=x ACTIONS_RUNTIME_TOKEN=x ACTIONS_ID_TOKEN_REQUEST_TOKEN=x \
         RUNNER_TEMP=/t NPM_TOKEN=x DATABASE_URL='postgres://u:pw@h/db' SOME_SETTING=x \
         HOME=/home/u PATH=/usr/bin DBUS_SESSION_BUS_ADDRESS=unix:path=/b XDG_RUNTIME_DIR=/run/u \
         EXTRA_OK=1 AGY_ENV_PASSTHROUGH='BAD=NAME 1 1FOO * ../x EXTRA_OK'
  eval "$env_fn"
  args=( env )
  while IFS= read -r -d '' a; do args+=( "$a" ); done < <(agy_allowlisted_env_args)
  "${args[@]}" env
)"
check "agy's environment drops everything off the allowlist (tokens, ordinary-named secrets)" "0" \
  "$(grep -cE '^(GH_TOKEN|GITHUB_TOKEN|ACTIONS_RUNTIME_TOKEN|ACTIONS_ID_TOKEN_REQUEST_TOKEN|RUNNER_TEMP|NPM_TOKEN|DATABASE_URL|SOME_SETTING|AGY_ENV_PASSTHROUGH|BAD)=' <<<"$env_out" || true)"
# Invalid passthrough entries (an assignment, a bare digit that would read $1, `1FOO` that used
# to abort with "bad substitution", a glob, a path) are skipped without aborting, so EXTRA_OK,
# listed last, must still arrive.
check "agy's environment keeps the session variables it needs, plus AGY_ENV_PASSTHROUGH names" "5" \
  "$(grep -cE '^(HOME|PATH|DBUS_SESSION_BUS_ADDRESS|XDG_RUNTIME_DIR|EXTRA_OK)=' <<<"$env_out" || true)"

if [ "$fails" -ne 0 ]; then
  echo "$fails check(s) failed" >&2
  exit 1
fi
echo "all checks passed"
