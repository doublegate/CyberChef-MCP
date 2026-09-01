# 2. The tool registry is not a plugin loader, and will not be one until sandboxing is real

Date: 2026-09-01
Status: Accepted

## Context

The v2.4.0 roadmap line reads **"Plugin system, sandboxed execution, plugin registry"**, and the
`docs/planning/ext-proj-int/` programme specifies a `ToolRegistry`, a `BaseTool` interface and a
`ToolLoader` for "dynamic tool discovery and loading".

Two different things are bundled in that sentence, and they have very different security
properties:

- A **registry** for tools that are not CyberChef operations — first-party code, written in this
  repository, reviewed here and shipped in the package. Needed regardless: every tool exposed so
  far is derived from `OperationConfig`, a pure `run(input, args)` over one input, and that shape
  cannot express an *analysis* — trying dozens of candidate key lengths and scoring each, or composing
  several operations and comparing results. `cyberchef_bake` does not help, because a recipe is a
  linear pipeline, not a loop.
- A **plugin loader** that reads code from disk at runtime. That is a different trust decision
  entirely, and the roadmap's own wording concedes it by asking for "sandboxed execution" in the
  same breath.

Nobody has asked for the second. The first is a prerequisite for the external-tool integration
programme, so it is being built now.

## The measurement that decides this

`node:vm` cannot sandbox a plugin. Node's documentation states it directly — *"The node:vm module is
not a security mechanism. Do not use it to run untrusted code."* — but the reason it applies **here
specifically** is worth recording, because the obvious counter-argument ("we will only pass in a
narrow API") is exactly what fails:

```js
const hostBake = () => "result";                       // the one capability a tool needs
const ctx = vm.createContext({ bake: hostBake });
vm.runInContext('bake.constructor("return process")()', ctx);
// -> the real process object: pid, cwd(), env, argv
//    (`require` is module-scoped, not global, so it is NOT reachable this way -- measured:
//     `typeof require` is "undefined" inside the context. `process` alone is enough.)
```

Measured on Node 26.8.1, not quoted. A host function carries its own realm with it, and
`Function.prototype.constructor` reaches that realm's `Function`. **Every useful tool needs at least
one capability** — this registry's whole purpose is tools that compose operations, which means
handing them `bake` — so the narrow-API defence is unavailable by construction. A vm context with no
capabilities is a sandbox for code that can do nothing, which is not a plugin.

Worker threads do not close the gap either. They bound **CPU**, not **authority**: a worker shares
the process's filesystem, network and environment. `worker-pool.mjs` exists here for concurrency,
and it would be a mistake to read it as isolation.

A real sandbox means **process isolation plus an explicit capability allowlist** — a child process
with Node's permission model or an equivalent, a defined IPC surface, and a decision about what a
plugin may read and reach. That is a design with a threat model, not a bullet point.

## Decision

1. **Build the registry.** `src/node/tools/registry.mjs` holds tools that are not CyberChef
   operations. Tools are registered by **explicit import** from a manifest in this repository.
2. **The registry loads nothing from disk.** No globbing, no directory scan, no `import()` of a
   path from configuration. Registered tools are first-party code at the same trust level as the
   rest of the server, because that is what they are.
3. **A registry tool can never shadow a CyberChef operation or a meta-tool.** Registration fails
   loudly on a name collision rather than resolving it by import order. `cyberchef_aes_decrypt` must
   always be AES Decrypt, and the winner of a collision must never depend on import sequence.
4. **"Sandboxed execution" is not shipped, and the roadmap line is corrected rather than quietly
   dropped** — the same rule applied to the withdrawal of DEP001/007/008 in v2.0.0.

## Consequences

**Good.** The external-tool programme gets its foundation now. The security surface does not grow:
nothing this release adds can execute code that was not reviewed into the repository. The collision
rule closes a hijacking route *before* any loader could exist to use it — including one built later
by someone who has not read this.

**Costs.** A third-party tool cannot be added without a pull request. For a security tool with 504
operations and a fork-patch discipline, that is the correct default rather than a limitation.

**Reconsider when** someone has an actual requirement for third-party plugins, and the design
answers: what capability a plugin receives and how it is revoked; what it may read from the
filesystem and reach on the network; what happens when it hangs, allocates without bound, or exits
non-zero; and how a user knows what they installed. Until those have answers, a loader would be
shipping the *word* "sandboxed" rather than the property.

**Explicitly not a reason to revisit:** that `vm` looks like it would work. It does not, and the
snippet above is the evidence. If a future proposal is built on `vm`, it is wrong for this reason
and this ADR is the response.
