# Decision gates — every kill criterion in one table

**Rewritten 2026-09-11, after v4.0.0 shipped.** Collected so a reader sees them together rather than
discovering them one charter at a time. A charter whose kill criterion fires is **archived with a
dated banner**, never deleted.

| Charter | Dies when | Escalates to |
|---|---|---|
| **v4.1.0** surface navigation — **SHIPPED 2026-09-11, no criterion fired** | The dispatcher cannot carry arguments through schema validation as faithfully as a direct call — *listing must never be stricter than dispatch*, and an unlisted-but-uncallable tool inverts it | Keep the tools listed; the ceiling is then a fact about the design. Re-scope the tool programme instead |
| | Measured model behaviour degrades behind one extra hop | Same — the index cost was buying something real |
| | The byte win does not survive counting the dispatcher's own schema | Re-measured: the dispatcher costs **1,080 bytes** (1,409 once its `analysisTools` output schema landed) and the index came to **15,620**, better than the `~15,905` projection |
| | *(retired)* The index costs more than `curated` at 59 registry tools | **Arithmetically impossible — F-02.** Registry tools are listed on every surface, so forty synthetic ones grew all three by the same 76,440 bytes and the gap moved by zero. Never a criterion that could fire |
| **v4.2.0** dispatch consolidation — **SHIPPED 2026-09-12, one criterion fired and was obeyed** | The refactor cannot be proven behaviour-preserving through a real client | **Fired for 2 of 10.** `recipe_execute` lost its `validateInputSize` guard and returned `{"recipeId":…}` where it had returned `SGVsbG8=`; `recipe_export` was JSON-encoded a second time and broke its round-trip through `recipe_import`. Both keep their branches; the table holds 8. For the other 8 the proof is byte-level — `tools/list` identical on all three surfaces including order, and 27 meta-tool calls identical through a real client |
| | v4.1.0 does not land, so the 24th entry never exists | Did not fire — v4.1.0 shipped 2026-09-11 |
| | *(unlisted, and the one that mattered)* The gate this charter exists to build **already exists** | **`meta-tool-parity.test.mjs`, v3.7.0**, asserting both directions — so the charter's "the dispatch table has never had its version" was false. Not a kill: it is *syntactic*, and the refactor breaks it, which makes it a lock rather than a gate. Superseded, not patched, because two overlapping checks leave the more fragile one authoritative |
| **v4.3.0** tools, slice 1 | A candidate is expressible as one pure function over one input | Upstream operation, not a registry tool |
| | A candidate needs network access | Declined — it sidesteps `CYBERCHEF_OFFLINE`, tested at four engine entries |
| | `password_corpus` can only be derived from a CC-BY-SA or NC source | Does not ship. A licence problem found late costs far more than one avoided |
| | v4.1.0 does not land | Charter does not start. The dependency is the point of writing it down |
| **v4.4.0** tools, slice 2 | `@virustotal/yara-x` leaks under a long-lived server and `.free()` cannot be made reliable at the tool boundary | Not worth 5.9 MB plus a memory risk |
| | A Node 26 native is not measurably faster on this project's hot paths | A rewrite for fashion; the benchmark gate says so |
| | `steg_detect` cannot be calibrated without a corpus encoding its author's assumptions | Same trap as v4.5.0 names for magic |
| | Any dependency is larger than the tool it enables | Declined — 453 MB image, pruned to production-only |
| **v4.5.0** magic scoring | The corpus cannot be built without encoding its author's assumptions — "the correct answer" turns out to be a judgement call | Stop. A confident accuracy figure on a rigged corpus is worse than none |
| | The figure does not move for any ranking change tried | Record the number, keep it as a regression gate, close the charter |
| **v4.6.0** arm64 gate | Spread so wide that any threshold catching a real regression also fires on noise | Keep reporting, and say so |
| | GitHub withdraws free arm64 runners for public repositories | — |
| **v4.7.0** result contracts | The SDK already implements it — **read the source, not the changelog** | Close as a one-line note, not a release |
| | Advisory, and changes a shape callers depend on for no measured benefit | Decline in writing, with a negative test as a tripwire |
| | Requires state outliving the request | Declined on the same ground as tasks |
| **v4.8.0** auth metadata + audit | Requires resolving authorization from arguments, moving the `recipe_execute` check after a storage read | Decline publicly with the reason |
| | Makes listing stricter than dispatch | Same |
| | Audit requires recording tool arguments, or an external datastore | Declined; v2.6.0's withdrawn Redis store is the precedent |
| **v4.9.0** consolidation | Nothing needs consolidating | Fold the re-measurement into whatever minor is open. There is no virtue in reaching v4.9.0 |
| | T-13 fires first | The consolidation belongs *inside* that major, which is how v4.0.0 behaved |

## Recorded as declined, so they are not re-proposed as though cheap

| | Why |
|---|---|
| **Lattice work** (`hnp_recover`, Coppersmith) | An LLL does exist on npm (`lll-reduction`, indutny, MIT) — this row said otherwise until 2026-09-11. What is absent is an *industrial* reduction: no WASM fplll/flatter/NTL. The one TypeScript proof caps at 32 signatures with float Gram-Schmidt. Ships only with a declared feasibility envelope in its own output |
| **Shellcode emulation** | Running untrusted shellcode inside the server is a security-posture change, not a feature, and is not decided by a feature charter |
| **Detect It Easy's 2,077 signature files** | They are JavaScript `function detect(){}` files. Loading them is what ADR 0002 forbids; `node:vm` is not a boundary |
| **Composite PQC certificates** | Drafts at rev 19 and 21 — an identifier built today chases a moving OID table |
| **YARA, protobuf decode, file carving** | Verified already present upstream. Checking cost ten minutes |

## Three standing gates that outrank every charter

1. **`src/core/**` is never hand-edited.** A deliberate change is a `patches/fork/*.patch` that fails
   the sync if it stops applying. A ReDoS mitigation was once hand-edited in and silently reverted,
   staying gone for four releases while three documents claimed it was active.
2. **A gate must be able to fail, and must be verified by reintroducing the real defect.** Three
   gates in v3.8.0, two in v3.9.0, and four in v4.0.0 were proven this way. A gate whose pattern has
   quietly stopped matching is how a check silently stops checking.
3. **A measurement scoped to the thing you are fixing cannot tell you what you broke.** v3.10.0
   verified a leak fix with a filter that excluded the two directories its own new test was leaking.
   Re-measure widely, not narrowly.
