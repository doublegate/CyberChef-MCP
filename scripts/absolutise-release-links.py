#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
#
# Rewrite the relative links in a release note to absolute URLs pinned to a tag.
#
# WHY
# ---
# `mcp-release.yml` publishes `docs/releases/<tag>.md` as the GitHub Release body. A release body
# renders on the Releases page, not inside the tree, so `[text](../security/foo.md)` 404s for every
# reader of the release -- which is the audience the file exists for.
#
# This is not hypothetical: v2.0.0 shipped with 8 such links and v2.1.0 with 3, all broken in
# already-published notes. v2.1.1's were caught only because a reviewer happened to look.
#
# Fixing it at publish time rather than per-file means a future note cannot reintroduce it: the
# author writes the link that works in the repository, and this makes it work on the release page
# too.
#
# TWO THINGS THAT ARE EASY TO GET WRONG, AND WERE
# -----------------------------------------------
# 1. **Depth matters.** A first attempt used `sed` to drop every leading `../` and prepend the
#    repository root. That is wrong for the commonest case: `../guides/tutorial.md` sits beside the
#    notes under `docs/`, so it resolves to `docs/guides/tutorial.md`, not `guides/tutorial.md`.
#    Only `../../` happened to land correctly. Paths are resolved here, not pattern-stripped.
#
# 2. **This belongs in a file, not a heredoc.** The first version was inlined in the workflow as
#    `python3 - <<'PY'`. Inside a YAML block scalar the terminator keeps its indentation, and a
#    quoted heredoc only ends on a line that is exactly the delimiter -- so the heredoc ran to end
#    of file and `bash -n` failed with "unexpected end of file". It would have broken every
#    release. As a script it is also testable, which the heredoc was not.
#
# Usage: absolutise-release-links.py <notes-file> <repo> <tag> [output-file]
#        Writes to stdout when no output file is given.

import os
import posixpath
import re
import sys

# Only `](../x)` and `](./x)`. A bare `](x.md)` is left alone: it is ambiguous with an anchor or an
# external shortlink, and guessing wrong would break a link that currently works.
RELATIVE_LINK = re.compile(r"\]\((\.{1,2}/[^)]+)\)")


def absolutise(text, source_path, repo, tag):
    """Rewrite relative markdown links in `text` to absolute URLs pinned to `tag`.

    Returns (rewritten_text, count).
    """
    base = "https://github.com/{}/blob/{}/".format(repo, tag)

    # The links are resolved against the note's location IN THE REPOSITORY, so the path has to be
    # repository-relative. Given an absolute path the naive `dirname` produces URLs with the
    # checkout directory embedded in them -- valid-looking and completely wrong. Made relative to
    # the working directory, which is the repository root in the release workflow.
    if posixpath.isabs(source_path):
        source_path = posixpath.relpath(source_path, os.getcwd())
    here = posixpath.dirname(source_path)

    def replace(match):
        target = posixpath.normpath(posixpath.join(here, match.group(1)))
        # normpath eats a trailing slash; a directory link needs it back, or GitHub renders a file
        # page for something that is not a file.
        if match.group(1).endswith("/"):
            target += "/"
        # Escaping the repository root would be a broken link either way. Leave it for a human
        # rather than publishing a URL that cannot resolve.
        if target.startswith(".."):
            return match.group(0)
        return "]({}{})".format(base, target)

    return RELATIVE_LINK.subn(replace, text)


def main(argv):
    if len(argv) < 4:
        sys.stderr.write(
            "usage: absolutise-release-links.py <notes-file> <repo> <tag> [output-file]\n")
        return 2

    notes_file, repo, tag = argv[1], argv[2], argv[3]
    out_file = argv[4] if len(argv) > 4 else None

    with open(notes_file, encoding="utf-8") as handle:
        text = handle.read()

    rewritten, count = absolutise(text, notes_file, repo, tag)

    if out_file:
        with open(out_file, "w", encoding="utf-8") as handle:
            handle.write(rewritten)
        sys.stderr.write(
            "Rewrote {} relative link(s) to absolute, pinned to {}\n".format(count, tag))
    else:
        sys.stdout.write(rewritten)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
