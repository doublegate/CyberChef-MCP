#!/usr/bin/env bash
#
# _agy_comment_body.sh -- the review comment's body format, as sourceable functions.
#
# Sourced by `agy-review.sh` (which uses them) and by `agy-review-selftest.sh` (which tests
# them). It exists as a separate file for one reason: `agy-review.sh` does its work at TOP
# LEVEL, so it cannot be sourced without running a review, and a test that cannot call the
# real implementation ends up reimplementing it. That failure is not hypothetical here -- the
# first version of the archive test inlined its own copy of the `awk` pipeline, so a mutation
# deleting the marker strip from the script came back NOT CAUGHT. A test that reimplements its
# subject agrees with itself forever.
#
# Defines no state and runs nothing on source.

# The sentinels delimiting the archive of earlier review rounds inside the comment body.
#
# The reviewer used to POST a fresh comment each round and DELETE the previous one. That kept
# the PR tidy and destroyed the record: a round nobody read before the next push was gone, with
# nothing on the PR indicating it had existed -- and unlike a CodeRabbit or Copilot thread, an
# unaddressed finding left no trace. Observed on a real PR where two consecutive rounds each
# raised a blocking issue and only the second survived.
#
# Now there is ONE comment per PR, edited in place: newest round on top, earlier rounds folded
# into a collapsed `<details>` below. Same tidiness, no destruction.
AGY_ARCHIVE_START='<!-- agy-archive-start -->'
AGY_ARCHIVE_END='<!-- agy-archive-end -->'

# The newest round of a comment body: everything after the marker, before the archive.
#
# `awk` matching WHOLE LINES rather than `sed` with a pattern, because a review body
# legitimately contains regex metacharacters, backslashes and HTML, and the sentinels must not
# match a line that merely mentions one.
agy_body_head() {
  local marker="$1"
  awk -v s="$AGY_ARCHIVE_START" '$0 == s { exit } { print }' \
    | grep -v -F -x "$marker" || true
}

# The archived rounds of a comment body: everything strictly between the sentinels.
#
# The `$0 == e` test comes FIRST so a body whose archive is empty yields nothing rather than
# emitting its own end sentinel.
agy_body_archive() {
  awk -v s="$AGY_ARCHIVE_START" -v e="$AGY_ARCHIVE_END" '
    $0 == e { inside = 0 }
    inside  { print }
    $0 == s { inside = 1 }' || true
}

# Delimits one archived round. Emitted by the caller ahead of each round's `<details>`.
#
# A dedicated sentinel, NOT the `<details>` tag itself. Matching `/^<details>$/` looked
# equivalent and was a data-corruption bug: a review body legitimately contains `<details>`
# blocks -- folded logs, collapsed code, another bot's summary, and the archived rounds are
# themselves nested `<details>` -- so the cut could land INSIDE a round and leave torn HTML
# plus half a review. The sentinel is an HTML comment, so it is invisible when rendered and
# cannot occur by accident in prose the way a tag can. Found in review.
AGY_ROUND_MARK='<!-- agy-round -->'

# Drop the OLDEST archived round -- everything from the last round marker onward.
#
# Exits non-zero when there is no marker to cut at, so a caller trimming to a size limit
# terminates rather than spinning. That is also the fail-safe direction for an archive written
# by an older version of this script: with no markers present, nothing is dropped and the edit
# simply fails on size, rather than the archive being silently mangled.
agy_drop_oldest_round() {
  awk -v m="$AGY_ROUND_MARK" '
    $0 == m { starts[++n] = NR }
    { line[NR] = $0 }
    END {
      cut = (n > 0) ? starts[n] : 0
      if (cut == 0) exit 1
      for (i = 1; i < cut; i++) print line[i]
    }'
}
