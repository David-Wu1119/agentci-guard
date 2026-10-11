# AgentCI Guard Rule Contract

This file defines the v0.1.1 rule predicates used for regression labels and
human benchmark annotation. A finding is a scanner rating over supported static
semantics. It is not proof of exploitability or workflow insecurity.

The table below is a **historical label contract**. Do not reinterpret or
rewrite those labels using the unreleased source-provenance candidate described
after the table. Its changed outputs require fresh, independently labeled
evaluation before any accuracy claim.

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

| Rule                                | Granularity | Severity | Exact v0.1.1 predicate                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentci/untrusted-ai-write-token`  | Job         | Critical | At least one reachable AI step consumes a supported untrusted event field, that event is an untrusted trigger, and the job's effective permissions include a sensitive write scope.                                                                                                                                                                                                                                                                                                      |
| `agentci/gated-ai-write-token`      | Job         | High     | Every condition of `untrusted-ai-write-token` holds, but every ingesting AI step is `anthropics/claude-code-action` with its default write-access gate intact (no `allowed_non_write_users` or `allowed_bots`), every reachable untrusted event is one the action's docs list as checked (issues, issue_comment, pull_request, pull_request_review, pull_request_review_comment), and no `run:` step in the job expands untrusted event text. `claude-code-base-action` never qualifies. |
| `agentci/pull-request-target-ai`    | Job         | Critical | At least one AI step in the job is reachable on `pull_request_target` by an untrusted actor — that is, neither the job nor that step carries a recognized actor/provenance gate. Other steps in the job (an unsafe checkout, another agent) are judged on their own gates.                                                                                                                                                                                                               |
| `agentci/ai-with-secrets`           | Job         | Medium   | At least one AI step has a secret reference in its effective workflow → job → step environment or in its `uses`, `run`, or `with` material; inherited reusable-workflow secrets also count.                                                                                                                                                                                                                                                                                              |
| `agentci/untrusted-input-in-prompt` | Step        | High     | A supported untrusted GitHub event field appears in the AI step or its effective workflow → job → step environment outside its `if` guard, and the corresponding event is reachable.                                                                                                                                                                                                                                                                                                     |
| `agentci/ai-shell-access`           | Step        | High     | A detected AI CLI executes through a nonempty `run`, or a detected AI Action explicitly enables Bash, shell, command tools, or a documented equivalent in `with`. Prompt prose alone does not satisfy this rule.                                                                                                                                                                                                                                                                         |
| `agentci/broad-write-permissions`   | Job         | Medium   | The job contains at least one reachable AI step and its effective permissions include a sensitive write scope.                                                                                                                                                                                                                                                                                                                                                                           |
| `agentci/unpinned-ai-action`        | Step        | Medium   | A detected AI step uses a nonlocal, nondocker third-party Action whose ref is not a full 40-hex commit SHA.                                                                                                                                                                                                                                                                                                                                                                              |
| `agentci/unsafe-checkout`           | Step        | High     | A step reachable on `pull_request_target` asks `actions/checkout` for the PR head/fork and either explicitly sets `allow-unsafe-pr-checkout: true` or uses known-unprotected v1. A currently protected floating v2-v7 major is negative; an immutable or otherwise ambiguous Action ref is unknown.                                                                                                                                                                                      |

## Unreleased source-provenance candidate

The local scanner keeps each supported event expression's source class through
rule evaluation. A recognized actor gate authenticates the triggering actor;
only `OWNER`, not `MEMBER` or `COLLABORATOR`, is accepted as a trusted
`author_association` value because those other roles can have
[Read/Triage access](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization)
without repository write access. The actor gate does **not** authenticate an
arbitrary literal login or login allowlist: YAML names the account but cannot
verify its repository role. Nor does it authenticate an
existing parent Issue, PR, or discussion that a maintainer later comments on,
labels, or reviews. An explicit creation-only
subscription (`issues`/`pull_request` with `types: [opened]`, or `discussion`
with `types: [created]`) lets the actor gate cover the new parent body because
the actor created that entity. PR title/body and PR-head branch or changed-file
paths are different sources: the opener need not have authored `head.ref`,
`github.head_ref`, or the changed files. PR-head sources require a separate supported provenance
guard. Other activity types remain conservative. These distinctions affect
both `untrusted-input-in-prompt` and
the write-token rules; they do not revise the v0.1.1 annotations above.

`github.event.head_commit.message` on `push` is also independent of the
triggering actor: a maintainer's squash merge can carry a contributor's PR
title or commit text into that message. The actor gate does not suppress its
prompt-interpolation finding. [GitHub's squash-merge defaults](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests)
document those message sources.

For `anthropics/claude-code-action`, the candidate models automatic parent
Issue/PR ingestion only in tag mode. At the pinned upstream revision, a
nonempty static `prompt` selects agent mode, which uses that prompt rather
than fetching event text; supported `track_progress` can force tag mode. A lone
unresolved expression can evaluate to an empty prompt, so the candidate
conservatively permits tag-mode ingestion in that case. The
`claude-code-base-action` does not self-fetch under this model. Other known
agent Actions retain a conservative event-ingestion heuristic, not a verified
vendor-mode model. See the pinned
[mode detector](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/modes/detector.ts),
[tag-mode fetch](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/modes/tag/index.ts),
and [agent-mode prompt](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/modes/agent/index.ts).

Tag mode on a PR includes changed-file paths in its prompt. An owner-opened
PR can point to a fork branch they did not author, so an actor gate alone
cannot dismiss that source. An `issue_comment` may target a PR and is
conservatively treated as capable of bringing in those paths too.

The candidate emits `gated-ai-write-token` at high only when all **modeled**
ingested source text is attributable to the actor checked by the Action's intact
write-access gate, every relevant event is modeled as checked, and no untrusted
text enters a `run:` step. If a trusted actor activates an agent on someone
else's parent Issue/PR, the gate does not justify that downgrade and the
modeled write-token rule stays critical. This is a static severity heuristic,
not proof that the Action accepted or rejected a runtime trigger.

Unlike the historical `pull-request-target-ai` predicate above, this candidate
does not treat same-repository PR-head provenance as an actor gate. It can
constrain the head branch but not who authored the PR title or body.

Two boundaries remain: the candidate recognizes `allowed_non_write_users` as
a gate bypass only with an explicit `github_token`, as Anthropic requires, but
cannot resolve whether a dynamic token expression is empty; and it treats older
fetched comments/reviews as untrusted history without evaluating each author
or configured actor filters. See the
[pinned security guidance](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/docs/security.md)
and [data fetcher](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/github/data/fetcher.ts).

The historical v0.1.1 write predicate uses effective workflow
`GITHUB_TOKEN` permissions. The unreleased candidate additionally treats the
full Anthropic Action with no `with.github_token` and **known** effective
`id-token: write` as potentially write-capable through an OIDC-backed App
token. Its documented App scopes include contents, pull requests, and issues
at write level, independent of the workflow token's content scope.
`broad-write-permissions` still describes the workflow token alone. Static
analysis cannot prove App installation or exchange success, and other Action
credentials remain unmodeled. A negative finding is not proof of no write
authority. See the pinned [token setup](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/github/token.ts)
and [App permissions](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/docs/security.md#github-app-permissions).

## Severity rationale

Critical rules combine attacker-influenced input or privileged trigger context
with an AI agent and repository-side authority. In the historical v0.1.1
contract, `gated-ai-write-token` was the one deliberate exception: it lowered
the same pattern when the Action's documented default checked the triggering
actor. The unreleased candidate narrows that downgrade to modeled content
attributable to that actor. High rules expose a direct source-to-sink path,
command capability, or attacker-controlled checkout in a privileged context.
Medium rules describe consequential exposure or blast radius but do not, by
themselves, establish attacker control.

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
- `agentci/org-fetch-failed` — an organization scan could not fetch a repository's workflows (error; the repository and reason are in the message; archived and fork exclusions are not diagnostics)
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
