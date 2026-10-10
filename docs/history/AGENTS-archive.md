# AGENTS.md archive

## Moved from AGENTS.md on 2026-10-07 (lines 33-33, verbatim)

Original 'Image' metrics row, including the release-by-release correction history.

| Image | **453 MB** (was 643 MB in v2.7.0), and a package count that depends on how you count: **402** by `find -maxdepth 3 -name package.json`, **384** by walking directories that contain one. The row said `432 packages` with no method until v3.2.0, which is the defect -- all three are defensible answers to slightly different questions. `Dockerfile.mcp` runs `npm prune --omit=dev` -- NOT a hardcoded `rm -rf` list, which is what it was through v2.7.0 and could not keep pace with a 1,310-path tree. Any change here must be re-verified by running the FULL operation suite against production-only deps, not a smoke test. **<50 MB is unreachable**: `@jimp` 89 MB + `tesseract.js-core` 44 MB are production deps of real operations. |

## Moved from AGENTS.md on 2026-10-07 (lines 39-39, verbatim)

Original 'Tests' metrics row, including the release-by-release re-count history.

| Tests | **1,728 MCP (75 files)** + 241 Node-API + 2,289 operations + 9 CI-executed examples. Re-counted in v4.2.0. This row said **77 files** for one release and that was never true: `git ls-tree v4.1.0 tests/mcp` returns 75, and `vitest.config.mjs` includes exactly `tests/mcp/**/*.test.mjs`, which finds 75 recursively. A count carried into the row that exists to warn against carrying counts. v4.2.0 is net-zero on files -- `dispatch-table.test.mjs` added, `meta-tool-parity.test.mjs` deleted as superseded -- and +8 tests. Previously 1,720/77 in v4.1.0. Previously 1,713/74 in v4.0.0, DOWN from 1,804/77, because that release deleted the deprecation and migration suites (1,188 lines across three files) along with the code they covered. A falling test count is the right outcome of a removal and the wrong one of anything else. Nothing gates it -- `check:versions` covers version strings and operation counts, `tool-surface-figures` covers the surface tuple, and `registry-tool-docs` covers the registry-tool count; the test count is a fourth figure with no check behind it. Re-run `npm run test:mcp` rather than trusting this row. |
