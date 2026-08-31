#!/usr/bin/env bash
#
# _agy_print.sh -- inner helper for the script(1) PTY fallback in agy-review.sh.
# Only used when `unbuffer` (from the `expect` package) is unavailable.
#
# Invoked as:  _agy_print.sh <prompt_file> [agy flags...]
# (agy-review.sh passes it through `script -qfec` so agy runs attached to a PTY,
# working around agy issue #76 where `-p` drops stdout on a non-TTY.)
set -euo pipefail

# `$# -eq 0` rather than `[ -z "${1:-}" ]`: both avoid the bare `$1` that aborts under `set -u`
# with "$1: unbound variable", but only the arity test distinguishes "no argument" from "an empty
# argument". `_agy_print.sh ""` is a caller passing a bad path, and it should get the readability
# error below rather than a usage message implying it passed nothing. This is the script a person
# is most likely to invoke by hand while debugging a review, so the diagnostics matter.
if [ $# -eq 0 ]; then
  printf 'usage: %s <prompt_file> [agy flags...]\n' "${0##*/}" >&2
  printf '  Reads the prompt from <prompt_file> and execs `agy --print` with it.\n' >&2
  printf '  Normally invoked by agy-review.sh through `script -qfec`, not directly.\n' >&2
  exit 2
fi
if [ ! -r "$1" ]; then
  printf '%s: prompt file not readable: %s\n' "${0##*/}" "$1" >&2
  exit 2
fi
prompt_file="$1"; shift
# `$(<file)` rather than `$(cat "$file")`: `cat` parses a leading `-` in the path as an option, so
# `_agy_print.sh -weird-name` fails obscurely -- and this script is now explicitly documented as
# hand-runnable. The bash redirection form takes the word as a path unconditionally, and reads it
# in-process rather than forking. Both forms strip trailing newlines identically inside `$( )`.
exec "${AGY_BIN:-agy}" "$@" --print "$(<"$prompt_file")"
