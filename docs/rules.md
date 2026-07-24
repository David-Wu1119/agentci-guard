# Rules

The normative predicate and severity contract is
[`../RULES.md`](../RULES.md). This shorter page is retained for package and
historical links.

Rules are security hypotheses over an explicit workflow model. YAML parse
failures, unknown permission defaults, unsupported reachability expressions,
missing local reusables, cycles, and remote reusable workflows are reported as
diagnostics—not forced into a security rule.

## `agentci/untrusted-ai-write-token`

Untrusted trigger content reaches an AI agent with repository write permissions.

## `agentci/pull-request-target-ai`

An AI agent runs on `pull_request_target`.

## `agentci/ai-with-secrets`

An AI step's effective workflow → job → step environment or inputs reference a
secret.

## `agentci/untrusted-input-in-prompt`

Raw PR, issue, comment, review, branch, or commit text is passed into an AI
prompt, shell command, or the AI step's effective environment.

## `agentci/ai-shell-access`

An AI CLI executes through `run:`, or an AI Action explicitly enables a shell
or command tool. Incidental prose such as “Python” is not shell capability.

## `agentci/broad-write-permissions`

Effective workflow/job permissions grant a sensitive write scope near AI
usage. Absent permissions are `unknown` unless configured.

## `agentci/unpinned-ai-action`

An AI-related third-party action is not pinned to a full commit SHA.

## `agentci/unsafe-checkout`

A `pull_request_target` workflow explicitly bypasses current checkout
protection, or uses a known-unprotected checkout release, while requesting PR
head/fork code. Ambiguous fixed Action refs are an analysis diagnostic.
