# Open-alert sweep — 2026-08-31

Disposition of every security finding open on `master` at the time of the sweep: 3 Dependabot
alerts and 10 code-scanning alerts. Each is either **fixed**, **suppressed with a written
justification**, or **dismissed with a reason** — nothing is left in the "someone will look at it"
state that let 194 alerts accumulate before `.github/dependabot.yml` existed.

Numbers are the alert numbers in this repository's Security tab.

---

## Fixed

### CVE-2026-42615 — XSS in `Show Base64 offsets` (Trivy alert 307, HIGH, CVSS 7.2, CWE-79)

GCHQ CyberChef < 11.0.0 built this operation's `<span>`-annotated output by concatenating
attacker-influenced text straight into an HTML string. The injection vector is the **Alphabet**
argument, not the input: the alphabet's characters end up inside span bodies and inside the
single-quoted `title='...'` tooltip attribute. Reproduced against the pre-fix file — 7 span bodies
carried raw `<`, `>` and `"`.

**Fixed by adopting upstream v11.4.0's file byte-for-byte.** The whole upstream diff is
`Utils.escapeHtml(...)` around every interpolated segment; there is no other behavioural change, so
this is a pure security fix that also makes the file converge on upstream rather than fork away
from it. Pinned by `tests/mcp/cve-regressions.test.mjs`, which fails against the pre-fix file.

**Exposure for this fork was nil, and saying so matters.** `Show Base64 offsets` declares
`outputType: "html"`, and `DishHTML.toArrayBuffer()` runs
`Utils.unescapeHtml(Utils.stripHtmlTags(...))` (`src/core/dishTypes/DishHTML.mjs:21`) before any
Node-API or MCP consumer sees the value. The MCP client therefore receives stripped, unescaped
plain text either way. The CVE is a web-UI issue; the fix is taken because the image also ships
`src/core` for direct use, and because tracking upstream is cheaper than diverging from it.

The Trivy alert itself keys on `package.json`'s `name: "cyberchef", version: "10.19.4"`, not on the
code, so it will keep matching until the version field moves in the v2.0.0 release. It is dismissed
as a false positive **for this tree** on the strength of the fix above, with that reasoning
recorded on the alert.

### minimatch 3.0.8 (Dependabot 76 HIGH; Trivy 90, 101, 102 — CVE-2026-26996 / -27903 / -27904)

Reached the tree through exactly one path:

```
grunt-contrib-watch@1.1.0 -> gaze@1.1.3 -> globule@1.3.4 -> minimatch@3.0.8
```

Every other consumer in the tree was already on 3.1.5 or 10.x. Fixed with a version-selector
override, `"minimatch@3": "^3.1.5"`, which lifts the 3.x line without touching `minimatch@10.2.6`
under `glob@13`. A bare `"minimatch": "^3.1.5"` override would have forced the whole tree back to
3.x and broken `glob`; a nested `"globule": {"minimatch": ...}` override was tried first and npm
declared the constraint without applying it, leaving `3.0.8 invalid:` in the tree. Verified after
install: no `minimatch@3.0.8` remains, `minimatch@10.2.6` intact.

### uuid 8.3.2 (Dependabot 190, MEDIUM — missing buffer bounds check in v3/v5/v6)

Reached the tree only through `nightwatch@3.16.0`. **Fixed at the root by removing `nightwatch`
rather than by overriding its dependency**, because the browser tests it runs do not exist in this
fork: `tests/browser/` and `nightwatch.json` were both removed in v1.7.1, and `upstream-sync.yml`
fails the run if a sync tries to reintroduce them. `nightwatch` was unrunnable dead weight.

Removed with it: the `testui` / `testuidev` scripts, the `testui` grunt task, the `exec.browserTests`
command, `grunt-contrib-connect` and its `connect:prod` config (used only to serve `build/prod/` for
those tests), and `chromedriver` (no remaining reference anywhere in the repository). 274 packages
left the tree.

### Trivy DS-0002 (alert 140, HIGH) — "Last USER command in Dockerfile should not be 'root'"

Correct as a reading of the file, wrong about the running image. The last `USER` directive was
`USER root` at line 41, in the **builder** stage; the runtime stage declared no `USER` at all and
relied on the Chainguard base image's UID 65532 default. Trivy's check is textual and does not model
stage boundaries.

Fixed by stating it: `USER 65532:65532` in the runtime stage. Behaviour is unchanged —
`docker run --rm --entrypoint id` reported `uid=65532(node)` before and after — but depending on a
base image's default for something this load-bearing was the weaker choice regardless.

### Trivy DS-0001 (alert 139, MEDIUM) — "Specify a tag in the 'FROM' statement"

Both `FROM` lines now pin a digest. Chainguard's public catalog publishes only `latest` and
`latest-dev`, so a version tag is not available — but Chainguard does not delete images, so an old
digest keeps pulling, which makes the digest the only reproducible reference and is what Chainguard
recommends for public-tier users. The staleness risk that normally argues for `latest` is covered by
the `docker` ecosystem in `.github/dependabot.yml`, which bumps the pin weekly.

Digests as of 2026-08-31 (both Node v26.8.1):

```
builder  cgr.dev/chainguard/node:latest-dev@sha256:4cd2bedce5955f933c8dca76df9bdff301505f3d0994c1e7e829a01e1718e650
runtime  cgr.dev/chainguard/node:latest@sha256:a422ef283675c760d801378646f2a7fdc96f4e2023121a247e215ed3cd39f199
```

Verified by building and smoke-testing the image: `tools/list` returns 483 tools.

---

## Suppressed, with justification

### CVE-2025-14505 / GHSA-848j-6mx2-7j84 — elliptic ≤ 6.6.1 (Dependabot 46 LOW; Trivy 50, 52)

**No fix exists.** Every published version is in the vulnerable range and the advisory names no
patched version, so this cannot be resolved by a bump.

**Not reachable here.** `elliptic` is not a dependency of this project. It arrives through
`crypto-browserify@3.12.1` (`browserify-sign`, `create-ecdh`), which exists solely as a webpack
browser polyfill for Node's `crypto` — `webpack.config.js` aliases `"crypto"` to it for the web
build. The MCP server runs on Node, where `crypto` resolves to the built-in module and the alias is
never applied. Nothing under `src/` imports `elliptic`, `browserify-sign` or `create-ecdh`, and no
operation performs ECDSA signing through them.

Recorded in `.trivyignore` with the same reasoning, wired into the two SARIF-producing scan steps
via an explicit `trivyignores:` input rather than trivy's cwd default. Removable when elliptic
publishes a fix, or — better — when `crypto-browserify` goes along with the vestigial web build.

---

## Dismissed, with reasons

### The three CodeQL alerts (1, 5, 6)

```
src/core/operations/DeriveEVPKey.mjs:72     js/insufficient-password-hash   HIGH
src/core/operations/JSONBeautify.mjs:166    js/incomplete-sanitization      HIGH
src/core/operations/PHPDeserialize.mjs:154  js/incomplete-sanitization      HIGH
```

All three sites are **byte-identical to upstream v11.4.0**, and each carries an upstream
`// lgtm [<rule>]` comment — upstream's own suppression, written when LGTM honoured it. LGTM was
retired; CodeQL does not read those comments, so upstream's decision survives in the source but no
longer reaches the scanner.

* **`js/insufficient-password-hash`** — `Derive EVP Key` *implements* OpenSSL's `EVP_BytesToKey` as
  a user-facing operation, so an analyst can decrypt data that already uses it. The rule fires on
  "a passphrase reaches a weak KDF", which describes the operation's specification, not a defect.
  CyberChef ships Argon2, scrypt and bcrypt for anyone actually storing passwords.
* **`js/incomplete-sanitization`** ×2 — both escape a quote for *display*, and neither is a security
  boundary. Neither is reachable as a sanitiser in this fork's MCP path, for the `DishHTML` reason
  set out above.

**A configuration fix was attempted first and does not exist.** The intention was
`.github/codeql/codeql-config.yml` excluding these two rules **only** under
`src/core/operations/**`, leaving them fully live over the fork-authored `src/node/**`. CodeQL does
not support that: `query-filters` match query *metadata* (`id`, `tags`, `problem.severity`) and
cannot be scoped to a path, while `paths-ignore` drops files from analysis entirely and applies to
every rule. The only expressible options were "disable these rules repository-wide, including over
our own MCP server" or "stop analysing all upstream operations" — both strictly worse than
dismissing three assessed alerts. The config file was written, found unworkable, and removed rather
than shipped with a comment describing a scope it did not have.

Hand-editing the three files was never on the table: `src/core/**` is mirrored verbatim, and this
repository has already lived that failure — see
[the SafeRegex incident record](2026-08-30-saferegex-reverted-by-upstream-sync.md).

Both upstream conditions (adopt the fixes, or migrate `lgtm` comments to `// codeql[<rule>]`) are
tracked in issue #73.

---

## Held, with evidence — `@xmldom/xmldom` 0.8.x

Not an open alert, but the reason dependabot's `@xmldom/xmldom` 0.8.15 → 0.9.12 PR is declined, and
it belongs in the record because 0.9.12 fixes **nine** parser DoS advisories.

0.9 breaks two APIs this fork uses, both confirmed by running 0.9.12:

```
new DOMParser().parseFromString("<a/>")
  -> DOMParser.parseFromString: the provided mimeType "undefined" is not valid.
     (src/core/operations/CSSSelector.mjs:59 omits the mimeType)

new DOMParser({ errorHandler: { fatalError(e) { throw e; } } })
  -> errorHandler object is no longer supported, switch to onError!
     (src/core/operations/XPathExpression.mjs:54)
```

Both call sites are in `src/core/**`, and **upstream is still on `^0.8.14` at v11.4.0**, so there is
no already-migrated upstream version to adopt. Fixing them on `master` would be a hand-edit to the
exact directory the narrow sync mirrors — the SafeRegex shape again.

The correct home is `release/v2.0.0`, where `patches/fork/` exists and a patch that stops applying
fails the sync. Tracked there; requested upstream in issue #73.

Residual exposure in the meantime: `cyberchef_css_selector` and `cyberchef_xpath_expression` parse
caller-supplied XML with a parser that has quadratic paths on hostile input. The advisories are DoS,
not disclosure, and the server bounds concurrency and input size — but a blocking parse is not
interruptible by `OPERATION_TIMEOUT`, so this is a real, bounded risk rather than a theoretical one.
