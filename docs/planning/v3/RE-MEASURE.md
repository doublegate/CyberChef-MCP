# Re-measure before executing

**Mandatory before any charter in this directory becomes a release.**

## Why this file exists

Every release from v2.5.0 onward opened its findings log by measuring the plan against the running
server, and every one found the plan wrong:

| Release | What F-01 found |
|---|---|
| v2.6.0 | Redis session store withdrawn — MCP 2026-07-28 had deleted sessions |
| v2.7.0 | The OTel SDK the plan named cost 71 packages against the API's 1 |
| v2.8.0 | Three of eight planned features had shipped in v2.6.0; the image-size baseline was wrong by 3.4x |
| v2.9.0 | Four of the plan's seven features already existed |
| v2.10.0 | There was no v2.10.0 in the plan, and the release it *did* name was empty |
| v3.0.0 | All six planned breaking changes were done, withdrawn, or superseded |
| v3.1.0 | The charter's own kill criterion fired: the harness it proposed building already existed |

Seven for seven. The plans were not careless — they were written in December 2025 and describe a server
that has since been built differently. **A plan is a hypothesis with an expiry date.**

The corpus that produced those plans runs to 62 files and ~36,700 lines. This directory is
deliberately smaller, and the charters are deliberately thin, because the failure mode is not
"insufficient planning".

## The ritual

Before writing any code for a charter:

1. **Read the charter's claims and test each one against the running server.** Not against the
   docs, which is how `cyberchef.config.json` was believed to exist for nine releases.
2. **Read the dependency's source, not its changelog.** v3.0.0 planned to implement cache fields
   the SDK already filled, and planned an error-code renumbering the SDK already did — while
   missing the real defect, which was in this repository.
3. **Search the ecosystem for the thing you are about to build**, by name, on the registry. This
   step was added after v3.1.0, because its absence is what let v3.0.0 ship a conformance release
   verified only by its own tests four weeks after an official conformance suite covering the exact
   SEPs it implemented was published. `npm search`, the SDK's own org, and the spec repository are
   fifteen minutes; hand-building a suite is not.
4. **Write F-01 first**, in `docs/internal/vX.Y.Z-findings-log.md`, stating what the charter got
   wrong. If it got nothing wrong, say that too — it has not happened yet.
5. **Re-scope from the measurement**, and record the scope decision including the version number
   and why it is correct under SemVer.
6. **If the charter is empty, say so and pick different work.** v2.9.0 and v2.10.0 both did this.
   An empty release executed anyway is worse than a re-scoped one.

## Kill criteria

A charter is dead, and should be archived rather than executed, when any of these holds:

- its problem was solved by another release, upstream, or the SDK;
- the specification changed underneath it (check the MCP changelog and roadmap first);
- measuring shows the premise was never true;
- it depends on a capability this project has deliberately rejected — see `docs/adr/`.

Archive it with a dated banner naming what replaced it. Do not delete it: the reasoning is the
useful part, and a reader who finds no trace of a plan assumes it was never considered.
