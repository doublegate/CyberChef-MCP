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

# Marks where the archive SECTION begins -- i.e. the `<details>` wrapper, which sits OUTSIDE
# the start/end sentinels.
#
# Why a third sentinel rather than reusing AGY_ARCHIVE_START for both jobs: the two boundaries
# are not the same boundary. `agy_body_head` needs "where does the newest round stop", which is
# before the wrapper; `agy_body_archive` needs "where do the accumulated rounds begin", which is
# after it. Conflating them put the wrapper inside the extracted region, so every run captured
# the previous wrapper and nested a new one around it -- the archive grew a fresh `<details>`
# layer per round and `agy_drop_oldest_round` then tore holes in it. Measured on a real PR at
# round six: seven "Earlier review rounds" wrappers, 15 `<details>` against 13 `</details>`.
AGY_ARCHIVE_SECTION='<!-- agy-archive-section -->'

# The newest round of a comment body: everything after the marker, before the archive.
#
# `awk` matching WHOLE LINES rather than `sed` with a pattern, because a review body
# legitimately contains regex metacharacters, backslashes and HTML, and the sentinels must not
# match a line that merely mentions one.
agy_body_head() {
  local marker="$1"
  # Stops at the SECTION sentinel, not the start sentinel: the `<details>` wrapper lives
  # between the two, and capturing it here would append a stray opener to the newest round.
  # Falls back to the start sentinel so a body written before the section sentinel existed
  # still splits correctly.
  awk -v s="$AGY_ARCHIVE_START" -v sec="$AGY_ARCHIVE_SECTION" \
      '$0 == sec { exit } $0 == s { exit } { print }' \
    | grep -v -F -x "$marker" || true
}

# The archived rounds of a comment body: everything strictly between the sentinels.
#
# The `$0 == e` test comes FIRST so a body whose archive is empty yields nothing rather than
# emitting its own end sentinel.
agy_body_archive() {
  # Emits only whole rounds: inside the sentinels, output starts at the FIRST round mark.
  #
  # That skip is also the migration path. Bodies written before the wrapper moved out have a
  # `<details>`/`<summary>` pair and possibly a "N earlier round(s) dropped" note sitting
  # inside the sentinels ahead of the first round; starting at the round mark discards them,
  # so a corrupted archive heals on its first pass instead of needing a manual edit. The
  # matching stray `</details>` is dropped by the tail filter below for the same reason.
  awk -v s="$AGY_ARCHIVE_START" -v e="$AGY_ARCHIVE_END" -v r="$AGY_ROUND_MARK" '
    $0 == e { inside = 0 }
    inside  { buf[n++] = $0; if (first < 0 && $0 == r) first = n - 1 }
    $0 == s { inside = 1 }
    BEGIN   { first = -1; n = 0 }
    END {
      # With round marks present, start at the first one: that discards a wrapper captured
      # by an older layout. With NONE present the archive predates round marks entirely, so
      # emit it verbatim -- dropping it would silently destroy the review history, which is
      # a worse failure than the nesting this guards against.
      start = (first >= 0) ? first : 0
      for (i = start; i < n; i++) print buf[i]
    }' \
  | awk 'BEGIN { n = 0 }
         { line[n++] = $0 }
         END {
           # Trim a trailing wrapper close (plus any blank lines before it) left by a
           # pre-migration body. A legitimate round always ends with its own </details>
           # followed by nothing, so only ONE trailing close is ever removed here.
           while (n > 0 && line[n-1] == "") n--
           if (n > 0 && line[n-1] == "</details>") {
             closes = 0; opens = 0
             for (i = 0; i < n; i++) {
               if (line[i] ~ /^<details>/) opens++
               if (line[i] == "</details>") closes++
             }
             if (closes > opens) n--
           }
           for (i = 0; i < n; i++) print line[i]
         }' || true
}

# Prefix of the hidden line that records when a review was posted. The comment head carries
# it so that, when the round is archived on the next run, the summary can say when it was
# REVIEWED; the time of archiving says nothing useful.
AGY_REVIEWED_AT_PREFIX='<!-- agy-reviewed-at: '

# Assemble the archive for the next comment: the previous head becomes the newest round,
# ahead of the rounds already archived.
#
# Args: $1 previous head, $2 previous archive (may be empty), $3 time to show when the head
# carries no reviewed-at line (labelled "archived at", because that is all it is).
#
# A previous archive with no round marker predates markers. It is wrapped as ONE round behind
# its own marker; emitted bare, the only marker would be the new round's, and trimming the
# "oldest round" cut at it and discarded the new round together with the whole legacy history.
agy_assemble_archive() {
  local head="$1" archive="$2" fallback="$3" when label
  # The line sits right under the marker, so only the first lines are read. Here-strings, not
  # `printf | ...`: the caller runs under `set -o pipefail`, and a reader that stops early makes
  # printf die of SIGPIPE on a head larger than the pipe buffer, which failed the substitution
  # and aborted the script (agy review of #6).
  when="$(awk -v p="$AGY_REVIEWED_AT_PREFIX" '
    NR > 5 { exit }
    index($0, p) == 1 { s = substr($0, length(p) + 1); sub(/ -->$/, "", s); print s; exit }' \
    <<< "$head")"
  if [ -n "$when" ]; then
    label="Round reviewed at $when"
  else
    label="Round archived at $fallback"
  fi
  printf '%s\n' "$AGY_ROUND_MARK"
  printf '<details>\n<summary>%s</summary>\n\n' "$label"
  printf '%s\n' "$head"
  printf '\n</details>\n'
  [ -n "$archive" ] || return 0
  # Here-string for the same reason: `grep -q` stops at the first match, and the resulting
  # SIGPIPE would make the test false for a large archive and wrap it again on every run.
  if grep -qxF -- "$AGY_ROUND_MARK" <<< "$archive"; then
    printf '%s\n' "$archive"
  else
    printf '%s\n' "$AGY_ROUND_MARK"
    printf '<details>\n<summary>Earlier rounds (archived before round markers)</summary>\n\n'
    printf '%s\n' "$archive"
    printf '\n</details>\n'
  fi
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
