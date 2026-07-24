# AgentCI Guard Rule Contract

This file defines the v0.1.1 rule predicates used for regression labels and
human benchmark annotation. A finding is a scanner rating over supported static
semantics. It is not proof of exploitability or workflow insecurity.

## Shared terms

- **Reachable event set:** workflow triggers narrowed by supported job and step
  conditions.
- **AI usage:** a step's structured `uses` value matches a documented
  coding-agent Action, or its structured `run` value contains an executable
  coding-agent CLI invocation. Provider credentials, model names, prose,
  comments, install commands, and version/help checks are not sufficient.
- **Untrusted source:** a supported GitHub event field whose associated event is
  in the step's reachable event set.
- **Sensitive write:** effective `write` access to `contents`,
  `pull-requests`, `issues`, `discussions`, `packages`, or `deployments`.
- **Secret reference:** a supported `secrets.*`, `github.token`, or token/key
  expression in the effective environment, `run`, `uses`, or `with` value.
- **Unknown:** the scanner cannot close the documented analysis boundary and
  emits a diagnostic rather than assuming a safe result.

## Rule predicates

| Rule                                | Granularity | Severity | Exact v0.1.1 predicate                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentci/untrusted-ai-write-token`  | Job         | Critical | At least one reachable AI step consumes a supported untrusted event field, that event is an untrusted trigger, and the job's effective permissions include a sensitive write scope.                                                                                                                 |
| `agentci/pull-request-target-ai`    | Job         | Critical | At least one AI step in the job is reachable on `pull_request_target`.                                                                                                                                                                                                                              |
| `agentci/ai-with-secrets`           | Job         | Medium   | At least one AI step has a secret reference in its effective workflow → job → step environment or in its `uses`, `run`, or `with` material; inherited reusable-workflow secrets also count.                                                                                                         |
| `agentci/untrusted-input-in-prompt` | Step        | High     | A supported untrusted GitHub event field appears in the AI step or its effective workflow → job → step environment outside its `if` guard, and the corresponding event is reachable.                                                                                                                |
| `agentci/ai-shell-access`           | Step        | High     | A detected AI CLI executes through a nonempty `run`, or a detected AI Action explicitly enables Bash, shell, command tools, or a documented equivalent in `with`. Prompt prose alone does not satisfy this rule.                                                                                    |
| `agentci/broad-write-permissions`   | Job         | Medium   | The job contains at least one reachable AI step and its effective permissions include a sensitive write scope.                                                                                                                                                                                      |
| `agentci/unpinned-ai-action`        | Step        | Medium   | A detected AI step uses a nonlocal, nondocker third-party Action whose ref is not a full 40-hex commit SHA.                                                                                                                                                                                         |
| `agentci/unsafe-checkout`           | Step        | High     | A step reachable on `pull_request_target` asks `actions/checkout` for the PR head/fork and either explicitly sets `allow-unsafe-pr-checkout: true` or uses known-unprotected v1. A currently protected floating v2-v7 major is negative; an immutable or otherwise ambiguous Action ref is unknown. |

## Severity rationale

Critical rules combine attacker-influenced input or privileged trigger context
with an AI agent and repository-side authority. High rules expose a direct
source-to-sink path, command capability, or attacker-controlled checkout in a
privileged context. Medium rules describe consequential exposure or blast
radius but do not, by themselves, establish attacker control.

These severities are engineering priorities, not exploitability scores. A
medium finding can matter more than a critical finding in a particular
repository, and a critical pattern can be mitigated by controls outside the
workflow file.

## Diagnostics that prevent invented certainty

The following are not security findings:

- `agentci/parse-error`
- `agentci/analysis-event-condition`
- `agentci/analysis-checkout-protection-unknown`
- `agentci/analysis-permissions-unknown`
- `agentci/analysis-remote-reusable-workflow`
- `agentci/analysis-local-reusable-missing`
- `agentci/analysis-reusable-cycle`
- `agentci/analysis-reusable-without-caller`

They mark analysis incomplete. Benchmark scoring treats a relevant diagnostic
as a scanner abstention unless the scanner already emitted a positive
observation at that annotation unit.

## Agent-usage observation task

`agentci/agent-usage` is a benchmark task, not a security rule. The library
returns matching observations in `ScanResult.agent_usages`, with file, job,
zero-based step index, kind, line, and reachable events. This permits separate
measurement of agent identification and security-rule classification.

The implementation details and platform approximation are documented in
[`docs/analysis-model.md`](docs/analysis-model.md).
