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
For a hosted agent dispatched by HTTP, the runner job's `GITHUB_TOKEN` scope
does not establish remote write capability; that path emits
`analysis-remote-agent-capability-unknown` rather than this finding.

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
secret. `secrets: inherit` makes secrets available to a called workflow but
does not alone expose them to each Action; the built-in workflow token is
modeled through permissions.

## `agentci/untrusted-input-in-prompt`

Raw PR, issue, comment, review, branch, or commit text is interpolated into
an AI Action input or a recognized local CLI command. For a direct hosted
HTTP dispatch, the request body is the input sink. Environment values count
as proven CLI or HTTP prompt input only when expanded in those inputs;
unreferenced inherited CLI environment values leave analysis incomplete.
Display metadata such as the step name is not an input sink.

## `agentci/ai-shell-access`

A local AI CLI executes through runner `run:`, or an AI Action explicitly
enables a shell or command tool. This does not prove every local CLI agent has
its own shell tool. An HTTP dispatch does not satisfy the rule merely because
`curl` runs on the runner. Incidental prose such as “Python” is not shell
capability.

## `agentci/broad-write-permissions`

Effective workflow/job permissions grant a sensitive write scope near AI
usage. Absent permissions are `unknown` unless configured.

## `agentci/unpinned-ai-action`

An AI-related third-party action is not pinned to a full commit SHA.

## `agentci/unsafe-checkout`

A `pull_request_target` workflow explicitly bypasses current checkout
protection, or uses a known-unprotected checkout release, while requesting PR
head/fork code. Ambiguous fixed Action refs are an analysis diagnostic.
