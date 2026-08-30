---
applyTo: ".github/workflows/**"
---

# Workflow security

This repository runs the Antigravity `agy` review job on a **self-hosted runner — the maintainer's
own workstation**, not a disposable VM. A workflow that executes attacker-influenced code executes
it there. Treat these as blocking:

- Untrusted `github.event.*` data interpolated directly into a `run:` block. Pass it via `env:` and
  reference `"$VAR"` instead. The risky fields include `issue.title`, `issue.body`,
  `pull_request.title`, `pull_request.body`, `comment.body`, `head_commit.message`, `head_ref`,
  `pull_request.head.ref`, and anything under `client_payload`.
- `pull_request_target` combined with a checkout of PR head code. That is the classic privilege
  escalation: `pull_request_target` runs with a **write** token and repository secrets.
- Checking out PR head code and then executing it on the self-hosted runner. The `agy` job
  deliberately sources its scripts from the **default branch** so a PR cannot rewrite its own
  reviewer. The one exception is the guarded first-install bootstrap, which fires only when the
  default branch has no reviewer at all *and* the PR head is in this same repository.
- `ref:` in `actions/checkout` taking a branch name from untrusted input. Use a commit SHA
  (`pull_request.head.sha`).

## Pinning

Third-party actions that run on the self-hosted runner should be pinned to a full 40-character
commit SHA with a trailing `# vN` comment, which is the form Dependabot updates. Tags are mutable;
a retagged action changes what executes with no diff in this repository.

`aquasecurity/trivy-action@0.28.0` is a live cautionary tale: the tag was removed upstream and every
Security Scan run failed at "Set up job" for months.

## Gating

Keep reporting separate from gating. A step that produces SARIF for the Security tab must not exit
non-zero on findings — a failed SARIF producer can skip its own upload and hide the very findings it
exists to publish. Gate in a separate step.
