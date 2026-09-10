# Decision gates — every kill criterion in one table

Collected so a reader can see them together rather than discovering them one charter at a time.
A charter whose kill criterion fires is **archived with a dated banner**, never deleted.

| Charter | Dies when | Escalates to |
|---|---|---|
| **v4.0.0** | The specification does not force a breaking change | Ship minors. v2.x ran to eleven |
| **v4.1.0** entry point | No guard keeps `npm run mcp`, the Docker `CMD` and the `bin` entry working; or removing the module-scope call breaks the era decision in `serveStdio` | Keep the leak workaround, document why |
| **v4.2.0** tools ph.1 | Candidate already covered by one of the 504; needs network (sidesteps `CYBERCHEF_OFFLINE`); dependency larger than the tool | Next candidate |
| **v4.3.0** tools ph.2 | Index surface stops being meaningfully cheaper than `curated` (107,739 bytes at v3.9.0) | [v4.7.0](../charters/v4.7.0.md) — the mechanism, not fewer tools |
| **v4.4.0** arm64 gate | Spread so wide any threshold catching a real regression also fires on noise | Keep reporting; say so |
| **v4.5.0** result contracts | The SDK already implements it (**read the source, not the changelog**); or it is advisory and changes a shape callers depend on for no measured benefit | Decline, record |
| **v4.6.0** auth metadata | Standard requires resolving authorization from arguments, moving the `recipe_execute` check after a storage read; or makes listing stricter than dispatch | Decline publicly with the reason |
| **v4.7.0** progressive discovery | Standard cannot express a 504-operation catalogue | Keep the private surface, report upstream |
| **v4.8.0** audit | Requires recording tool arguments, or an external datastore | Decline publicly; v2.6.0 is the precedent |
| **v4.9.0** consolidation | Nothing needs consolidating | Fold into whatever minor is open |

## Two standing gates that outrank every charter

1. **`src/core/**` is never hand-edited.** A deliberate change is a `patches/fork/*.patch` that
   fails the sync if it stops applying. A ReDoS mitigation was once hand-edited in and silently
   reverted, staying gone for four releases while three documents claimed it was active.
2. **A gate must be able to fail, and must be verified by reintroducing the real defect.** Three
   gates in v3.8.0 and two in v3.9.0 were proven this way. A gate whose pattern has quietly stopped
   matching is how a check silently stops checking.
