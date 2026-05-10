# Rules

## `agentci/untrusted-ai-write-token`

Untrusted trigger content reaches an AI agent with repository write permissions.

## `agentci/pull-request-target-ai`

An AI agent runs on `pull_request_target`.

## `agentci/ai-with-secrets`

An AI-agent job references secrets or token-like environment variables.

## `agentci/untrusted-input-in-prompt`

Raw PR, issue, comment, review, branch, or commit text is passed into an AI prompt or shell command.

## `agentci/ai-shell-access`

An AI-agent job has shell or arbitrary command access.

## `agentci/broad-write-permissions`

Workflow or job permissions grant write scopes near AI usage.

## `agentci/unpinned-ai-action`

An AI-related third-party action is not pinned to a full commit SHA.

## `agentci/unsafe-checkout`

A privileged workflow checks out untrusted PR head code.
