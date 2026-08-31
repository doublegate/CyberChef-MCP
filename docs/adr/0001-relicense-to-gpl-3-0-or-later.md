# 1. Relicense CyberChef-MCP to GPL-3.0-or-later

Date: 2026-08-30
Status: Accepted

## Context

CyberChef-MCP has been distributed under Apache-2.0 since v1.0.0, inherited from upstream
[gchq/CyberChef](https://github.com/gchq/CyberChef).

v2.0.0 incorporates algorithms ported from eight reference security tools (see
`docs/planning/ext-proj-int/`) to add 80–120 native MCP tools. Two of those tools are
GPL-licensed, which is incompatible with continuing to distribute the combined work under
Apache-2.0. Either the GPL-derived work is excluded, or the combined work is relicensed.

The licence texts were read directly rather than inferred from summaries:

| Component | Licence, verbatim | Consequence |
|---|---|---|
| **katana** | `COPYING.txt`: "either **version 3** of the License, or (at your option) any later version" | GPL-3.0-or-later. **Forces v3 — GPLv2 is not an option.** |
| **John the Ripper** | `LICENSE`: "either **version 2** of the License, or (at your option) any later version" | GPL-2.0-**or-later**, so lawfully usable under GPLv3. |
| **upstream CyberChef** | Apache-2.0 | One-way compatible **into GPLv3 only**. Apache-2.0 is famously incompatible with GPLv2, so GPLv2 was never viable regardless of katana. |
| Ares, Ciphey, cryptii, pwntools, RsaCtfTool, xortool | MIT | GPLv3-compatible. |

The npm dependency tree (1,694 packages) was audited: 1,379 MIT, 131 ISC, 56 Apache-2.0, 71
BSD-2/3-Clause, plus six entries needing individual review (LGPL-3.0+, MPL-2.0, and three dual
licences, and CC-BY-SA-4.0). Every one is GPLv3-compatible. No blocker was found.

## Decision

**Distribute CyberChef-MCP v2.0.0 and later under GPL-3.0-or-later.**

GPL-3.0-or-later is not a preference among several workable options — it is the **only** licence
that simultaneously admits katana (v3+), John the Ripper (v2+), and the Apache-2.0 upstream.

We do **not** relicense GCHQ's code, and do not claim to. Upstream files keep their Apache-2.0
headers and copyright. What changes is the licence of the *combined* work, which Apache-2.0's
one-way compatibility with GPLv3 expressly permits. The full Apache-2.0 text and the original
combined notice are preserved in `LICENSE.Apache-2.0`.

AGPL-3.0 was considered and rejected. Both GPL tools permit it, and it would extend copyleft to
network use — relevant for a server. But CyberChef-MCP is overwhelmingly run locally over stdio by
a single user, so AGPL's network clause would impose obligations on essentially nobody while
deterring adoption in environments with blanket AGPL policies.

## Consequences

**Accepted:**

- Anyone distributing a derivative of CyberChef-MCP v2.0.0+ must do so under GPLv3. Merely
  *running* it — including serving it over HTTP — carries no obligation; GPLv3, unlike AGPL, has
  no network-use clause.
- **Upstream contribution becomes one-way, permanently.** GCHQ cannot accept GPLv3 code into an
  Apache-2.0 project, so MCP-layer improvements can no longer be offered upstream. In practice the
  sync has always been pull-only, so this codifies existing behaviour rather than changing it.
- The change is effectively irreversible. Once GPL-derived code from john/katana is merged,
  returning to Apache-2.0 would require excising it. This ADR and the relicense therefore land as a
  single deliberate, dated commit *before* any GPL-derived code is imported, rather than happening
  implicitly when that code arrives.
- Downstream users with policies against GPLv3 must remain on the v1.9.x line, which stays
  Apache-2.0 and receives security-only patches through the LTS window.

**No contributor consent was required.** Every prior contribution arrived under Apache-2.0, which
already permits incorporation into a GPLv3 work. The five non-`doublegate` commits touching MCP
paths are covered by that grant.

## References

- FSF licence compatibility: <https://www.gnu.org/licenses/license-list.html#apache2>
- `NOTICE`, `THIRD-PARTY-NOTICES.md`, `LICENSE.Apache-2.0`
