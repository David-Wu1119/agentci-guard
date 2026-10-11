# Rules

The nine-rule working reference is [`../RULES.md`](../RULES.md). The frozen
v0.1.1 eight-rule pilot contract is
[`../benchmark/pilot/contracts/v0.1.1/RULES.md`](../benchmark/pilot/contracts/v0.1.1/RULES.md).
This shorter page is retained for package and historical links.

Rules are security hypotheses over an explicit workflow model. YAML parse
failures, unknown permission defaults, unsupported reachability expressions,
missing local reusables, cycles, and remote reusable workflows are reported as
diagnostics—not forced into a security rule.

## `agentci/untrusted-ai-write-token`

Untrusted content reaches an AI agent with modeled sensitive write capability
without qualifying for the documented actor-gate downgrade.

## `agentci/gated-ai-write-token`

Untrusted content reaches a write-capable Claude Code Action whose default
actor write-access gate is modeled as intact. The unreleased candidate narrows
this rating to content attributable to the actor that gate checks.

## `agentci/pull-request-target-ai`

An AI step is reachable on `pull_request_target` by an untrusted actor, with
no recognized actor gate on the job or that step. PR-head provenance alone
does not authenticate the triggering actor.

## `agentci/ai-with-secrets`

An AI step's effective workflow → job → step environment or inputs reference a
secret.

## `agentci/untrusted-input-in-prompt`

Raw PR, issue, comment, review, branch, or commit text is interpolated into an
AI step's inputs, command, shell, working directory, or effective environment.
Display metadata such as the step name is not an input sink.

## `agentci/ai-shell-access`

An AI CLI or hosted-agent HTTP dispatch executes through runner `run:`, or an
AI Action explicitly enables a shell or command tool. For HTTP dispatch, this
does not prove the remote agent has shell tools. Incidental prose such as
“Python” is not shell capability.

## `agentci/broad-write-permissions`

Effective workflow/job permissions grant a sensitive write scope near AI
usage. Absent permissions are `unknown` unless configured.

## `agentci/unpinned-ai-action`

An AI-related third-party action is not pinned to a full commit SHA.

## `agentci/unsafe-checkout`

A `pull_request_target` workflow explicitly bypasses current checkout
protection, or uses a known-unprotected checkout release, while requesting PR
head/fork code. Ambiguous fixed Action refs are an analysis diagnostic.
