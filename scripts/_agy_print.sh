#!/usr/bin/env bash
#
# _agy_print.sh -- inner helper for the script(1) PTY fallback in agy-review.sh.
# Only used when `unbuffer` (from the `expect` package) is unavailable.
#
# Invoked as:  _agy_print.sh <prompt_file> [agy flags...]
# (agy-review.sh passes it through `script -qfec` so agy runs attached to a PTY,
# working around agy issue #76 where `-p` drops stdout on a non-TTY.)
set -euo pipefail
prompt_file="$1"; shift
exec "${AGY_BIN:-agy}" "$@" --print "$(cat "$prompt_file")"
