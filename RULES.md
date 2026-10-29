# AgentCI Guard Rule Contract

This file describes the later nine-rule baseline and the source-aware candidate
changes, which ship in the tagged `v0.7.0` Action/CLI and are absent from
earlier tags.
It is **not** the v0.1.1 annotation contract: that exact eight-rule contract is archived in
[`benchmark/pilot/contracts/v0.1.1/RULES.md`](benchmark/pilot/contracts/v0.1.1/RULES.md).
A finding rates supported static semantics, not proven exploitability or
workflow insecurity.

The table below records the nine-rule baseline before the candidate changes
described after it. Neither this baseline nor the candidate may be scored as
v0.1.1 pilot labels or as independent accuracy evidence. Current nine-rule
accuracy requires a fresh, sealed, human-labeled evaluation.

## Shared terms

- **Reachable event set:** workflow triggers narrowed by supported job and step
  conditions.
- **AI usage:** a step's structured `uses` value matches a documented
  coding-agent Action, or its structured `run` value contains an executable
  coding-agent CLI invocation or recognized hosted agent-dispatch HTTP call.
  Plain inference API calls, provider credentials, model names, prose,
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

| Rule                                | Granularity | Severity | Pre-candidate nine-rule predicate                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentci/untrusted-ai-write-token`  | Job         | Critical | At least one reachable AI step consumes a supported untrusted event field, that event is an untrusted trigger, and the job's effective permissions include a sensitive write scope.                                                                                                                                                                                                                                                |
| `agentci/gated-ai-write-token`      | Job         | High     | Every condition of `untrusted-ai-write-token` holds, every ingesting AI step uses an inspected immutable `anthropics/claude-code-action` revision with its write-access gate intact, all relevant text sources are attributable to the checked actor, no other reachable agent has unresolved implicit, tool-fetch, or CLI input flow, and no `run:` step expands untrusted event text. `claude-code-base-action` never qualifies. |
| `agentci/pull-request-target-ai`    | Job         | Critical | At least one AI step in the job is reachable on `pull_request_target` by an untrusted actor — that is, neither the job nor that step carries a recognized actor/provenance gate. Other steps in the job (an unsafe checkout, another agent) are judged on their own gates.                                                                                                                                                         |
| `agentci/ai-with-secrets`           | Job         | Medium   | At least one AI step has a secret reference in its effective workflow → job → step environment or in its `uses`, `run`, or `with` material; inherited reusable-workflow secrets also count.                                                                                                                                                                                                                                        |
| `agentci/untrusted-input-in-prompt` | Step        | High     | A supported untrusted GitHub event field appears in the AI step or its effective workflow → job → step environment outside its `if` guard, and the corresponding event is reachable.                                                                                                                                                                                                                                               |
| `agentci/ai-shell-access`           | Step        | High     | A detected AI CLI executes through a nonempty `run`, or a detected AI Action explicitly enables Bash, shell, command tools, or a documented equivalent in `with`. Prompt prose alone does not satisfy this rule.                                                                                                                                                                                                                   |
| `agentci/broad-write-permissions`   | Job         | Medium   | The job contains at least one reachable AI step and its effective permissions include a sensitive write scope.                                                                                                                                                                                                                                                                                                                     |
| `agentci/unpinned-ai-action`        | Step        | Medium   | A detected AI step uses a nonlocal, nondocker third-party Action whose ref is not a full 40-hex commit SHA.                                                                                                                                                                                                                                                                                                                        |
| `agentci/unsafe-checkout`           | Step        | High     | A step reachable on `pull_request_target` asks `actions/checkout` for the PR head/fork and either explicitly sets `allow-unsafe-pr-checkout: true` or uses known-unprotected v1. A currently protected floating v2-v7 major is negative; an immutable or otherwise ambiguous Action ref is unknown.                                                                                                                                |

## Vendor-event compatibility

Vendor event reachability is version-aware for one verified immutable Action
revision: `anthropics/claude-code-action@1d6de8cb0c237e7c15e9e1bdf973826ebae490cc`
[rejects](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/github/context.ts#L250-L251)
`discussion` and `discussion_comment` before Claude starts. Those event paths
produce an analysis diagnostic, not AI findings. Mutable or unverified refs
retain potential findings and a compatibility diagnostic; this does not remove
discussion sources from CLI agents or other Actions.

## Source-provenance candidate

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
the write-token rules; they do not revise the archived v0.1.1 pilot contract.

Action inputs are checked in `uses`, `with`, and the effective workflow →
job → step environment. Step `name`, `id`, `if`, and other display/control
metadata do not pass text to the agent and are not direct-input sinks. This
does not prove that every Action input or environment value is consumed. For
a local CLI `run:`, the candidate traces the recognized command and
environment values expanded in it, rather than attributing a sibling
command's text to the agent. An inherited untrusted environment value that
is not referenced in the CLI command is not proven prompt input, but the
local process can still read it; this emits
`analysis-run-dataflow-unknown`, not a clean result. For a direct hosted-agent
HTTP POST, the candidate traces the request body and environment variables
referenced by that body. Unrelated commands and unused environment values are
not proven HTTP prompt input. Opaque or unresolved shell flow emits
`analysis-run-dataflow-unknown`; this bounded parser is not a general shell
dataflow analysis.

When an AI input references a prior `steps.<id>.outputs` value or a
`needs.<job>.outputs` value, the scanner does not claim a direct untrusted
input finding without proving the source. An unresolved output alias instead
emits `analysis-output-provenance-unknown` and makes the scan incomplete. The
first-step default-Ubuntu single literal `$GITHUB_OUTPUT` assignment and a
literal declared job output are narrow safe exceptions. Producer/consumer
event paths must overlap; outputs forwarded through a reusable workflow remain
unresolved. Whole-context serialization and output aliases passed through a
later `GITHUB_ENV` write, or through `strategy.matrix` into an AI input, are
also unresolved. This is bounded provenance checking, not general shell or
cross-job dataflow analysis.
An AI input that reads a matrix built directly from a supported untrusted
event field emits `analysis-matrix-provenance-unknown`; it does not become a
definite prompt-ingestion finding solely by aliasing through `matrix.*`.
Composed reusable-workflow `inputs.*` expressions are checked for caller-side
output aliases. If a dynamic caller input cannot be resolved across another
boundary, `analysis-reusable-input-provenance-unknown` keeps the scan
incomplete; literal caller inputs remain closed. The same uncertainty follows
an output, matrix value, or dynamic reusable input through a later
`GITHUB_ENV` write to an AI step.
When a reusable-workflow caller passes a value from its own dynamic matrix,
the downstream AI input remains uncertain across that call boundary. This
caller-matrix check treats all reachable caller events as possible; it does
not resolve individual matrix members.

A direct AI CLI may be preceded by literal shell `NAME=VALUE` assignments or
launched through `env`. Assignment values are not prompt arguments: dynamic
values produce `analysis-run-dataflow-unknown` unless the CLI command itself
proves the source reaches its prompt. A shell assignment can override a safe
workflow `env` value; that path remains unresolved. A nested `sh -c`/`bash -c` agent command
is unresolved, not a proven direct sink.

The candidate recognizes documented hosted-agent creation/follow-up routes
only when a direct `curl` command sends POST. GET list/status calls and URL
mentions are not agent usage. A hosted HTTP dispatch does not receive
`ai-shell-access` merely because `curl` runs in the runner shell: that would
not prove command-tool access inside the remote agent. Supported route and
method pairs are pinned to the [Cursor v1](https://prod.cursor.com/docs/cloud-agent/api/endpoints),
[Cursor v0](https://prod.cursor.com/docs/cloud-agent/api/v0),
[Devin v1](https://docs.devin.ai/api-reference/v1/sessions/create-a-new-devin-session),
[Devin v3](https://docs.devin.ai/api-reference/v3/sessions/post-organizations-sessions),
and [GitHub Copilot task API](https://docs.github.com/en/rest/agent-tasks/agent-tasks?apiVersion=2026-03-10#start-a-task)
references. Dynamic or wrapped HTTP requests are outside this direct-call
detector; absence of a finding is not proof that no agent was launched.
The hosted agent's repository permissions are not inferred from the runner's
`GITHUB_TOKEN`: an ingested untrusted HTTP payload emits
`analysis-remote-agent-capability-unknown` instead of a write-token finding.
The job can still trigger `broad-write-permissions` for its own token scopes.

`github.event.head_commit.message` on `push` is also independent of the
triggering actor: a maintainer's squash merge can carry a contributor's PR
title or commit text into that message. The actor gate does not suppress its
prompt-interpolation finding. [GitHub's squash-merge defaults](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests)
document those message sources.

For `anthropics/claude-code-action`, the candidate confirms automatic parent
Issue/PR ingestion only for inspected immutable revision `1d6de8c` in tag
mode. At that revision, a nonempty static `prompt` selects agent mode, which uses that prompt rather
than fetching event text; supported `track_progress` can force tag mode. A lone
unresolved expression can evaluate to an empty prompt, so the candidate
conservatively permits tag-mode ingestion in that case. Other Action refs,
including mutable Anthropic refs and uninspected
`claude-code-base-action` revisions, do not inherit this model. When they are
reachable on an untrusted event with modeled write capability and no explicit
input proves ingestion, the scanner emits
`analysis-agent-implicit-ingestion-unknown` instead of a definite write-token
finding. Agent usage, action pinning, and broad workflow permissions remain
separate determinate observations. At the separately inspected Anthropic
revision `787c5a0`, a nonempty static prompt with progress tracking off
selects agent mode without an automatic Issue-body fetch; a permitted tool
call to read the Issue remains a separate unknown. See the pinned
[mode detector](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/modes/detector.ts),
[tag-mode fetch](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/modes/tag/index.ts),
and [agent-mode prompt](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/modes/agent/index.ts).

An explicit agent-mode prompt can still tell Claude to read an Issue by number
with `gh issue view`. At [Anthropic Action `787c5a0`](https://github.com/anthropics/claude-code-action/blob/787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251/src/modes/agent/index.ts),
the prompt is passed directly; a configured `Bash(gh issue view:*)` allowlist
permits, but does not prove, that tool call. For reachable `issues` or
`issue_comment` events with an untrusted parent, effective write capability,
and a configured token path, the
candidate emits `analysis-agent-tool-fetch-unknown` instead of inventing a
write-token finding. The detector recognizes literal `github.event.issue.number`
in the prompt and literal `Bash(gh issue view:*)` or `Bash(gh issue:*)` in
`--allowedTools`; other tool-mediated paths remain outside this narrow check.
For `issues:opened`, an intact write-access gate at an inspected immutable
Action revision covers the Issue's creator; an explicit non-write allowlist
removes that protection. Mutable or unverified refs keep the diagnostic. For
`issues:labeled`, even an authorized labeler need not have written the Issue.
An `issue_comment` can also target a PR; the scanner does not disambiguate its
parent here, so this diagnostic can be conservative.

Tag mode on a PR includes changed-file paths in its prompt. An owner-opened
PR can point to a fork branch they did not author, so an actor gate alone
cannot dismiss that source. An `issue_comment` may target a PR and is
conservatively treated as capable of bringing in those paths too.

The candidate classifies each reachable event path, then applies the two
write-token rules at the job. An event path qualifies for the gate only when
its ingested source text is attributable to the actor checked by an inspected
Action's intact write-access gate, the event is modeled as checked, and no
same-event `run:` step expands untrusted text. `gated-ai-write-token` is
reported at high only when every ingesting event path qualifies, no AI step
in the job has unresolved input flow on any reachable untrusted event, and no
`run:` step in the job expands untrusted text on any reachable event.
Unresolved input flow defeats the whole-job gated exception even on an event
with no established ingestion. If any ingesting path is critical, the job
reports only `untrusted-ai-write-token`, on the critical events. Otherwise, an
unresolved path leaves both rules unreported while its diagnostic stays and analysis remains incomplete, unless
a `run:` expansion independently establishes a critical path.
A `run:` expansion only on an event no agent ingests
also fails the exception; the job then reports `untrusted-ai-write-token` on
its ingesting events. The two rules never appear on the same job.
If a trusted actor activates an agent on someone else's parent Issue/PR, the
gate does not justify that path's downgrade. This is a static severity
heuristic, not proof that the Action accepted or rejected a runtime trigger.

Unlike the pre-candidate `pull-request-target-ai` predicate above, this candidate
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
`GITHUB_TOKEN` permissions. The source-aware candidate additionally treats the
full Anthropic Action with no `with.github_token` and **known** effective
`id-token: write` as potentially write-capable through an OIDC-backed App
token. Its documented App scopes include contents, pull requests, and issues
at write level, independent of the workflow token's content scope.
`broad-write-permissions` still describes the workflow token alone. Static
analysis cannot prove App installation or exchange success, and other Action
credentials remain unmodeled. A negative finding is not proof of no write
authority. See the pinned [token setup](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/github/token.ts)
and [App permissions](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/docs/security.md#github-app-permissions).

## Source-aware reusable-secret correction

The pre-candidate table above and archived v0.1.1 contract count inherited
secrets as `ai-with-secrets` exposure. The candidate instead requires a
supported secret/token reference in the AI step's effective environment or
`uses`, `run`, or `with` material. `secrets: inherit` makes secrets available
to the called workflow, but does not by itself pass them to every Action;
GitHub requires an [Action input or environment mapping](https://docs.github.com/en/actions/concepts/security/secrets).
The built-in `GITHUB_TOKEN` is modeled separately through permissions. This
change does not retroactively alter historical pilot labels or prove a
referenced secret is nonempty at runtime.
The candidate recognizes bracket secret references and `toJSON(secrets)`.
A prior step that may export a secret through `GITHUB_ENV` produces an
analysis-incomplete diagnostic at a later AI step; that cross-step flow is not
yet modeled as a positive finding. The same holds for untrusted event text
written to `GITHUB_ENV`.

## Severity rationale

Critical rules combine attacker-influenced input or privileged trigger context
with an AI agent and repository-side authority. In the later nine-rule
baseline, `gated-ai-write-token` was the one deliberate exception: it lowered
the same pattern when the Action's documented default checked the triggering
actor. The source-aware candidate narrows that downgrade to modeled content
attributable to that actor. High rules expose a direct source-to-sink path,
command capability, or attacker-controlled checkout in a privileged context.
Medium rules describe consequential exposure or blast radius but do not, by
themselves, establish attacker control.

These severities are engineering priorities, not exploitability scores. A
medium finding can matter more than a critical finding in a particular
repository, and a critical pattern can be mitigated by controls outside the
workflow file.

## Diagnostics and analysis completeness

The following are not security findings:

- `agentci/parse-error`
- `agentci/analysis-event-condition`
- `agentci/analysis-checkout-protection-unknown`
- `agentci/analysis-permissions-unknown`
- `agentci/analysis-agent-tool-fetch-unknown`
- `agentci/analysis-agent-implicit-ingestion-unknown`
- `agentci/analysis-agent-event-unknown`
- `agentci/analysis-agent-event-unsupported`
- `agentci/analysis-run-dataflow-unknown`
- `agentci/analysis-shell-control-flow-unknown` — an AI CLI or HTTP call sits in a shell branch or group whose reachability cannot be resolved statically; findings at that step describe a possible path, not guaranteed execution
- `agentci/analysis-secret-env-transfer-unknown` — an earlier step may write a secret to `GITHUB_ENV`; exposure to the later AI step is not modeled, so that route alone does not produce `ai-with-secrets`
- `agentci/analysis-output-provenance-unknown`
- `agentci/analysis-matrix-provenance-unknown`
- `agentci/analysis-reusable-input-provenance-unknown`
- `agentci/analysis-remote-agent-capability-unknown`
- `agentci/analysis-remote-reusable-workflow`
- `agentci/org-fetch-failed` — an organization scan could not fetch a repository's workflows (error; the repository and reason are in the message; archived and fork exclusions are not diagnostics)
- `agentci/analysis-local-reusable-missing`
- `agentci/analysis-reusable-cycle`
- `agentci/analysis-reusable-without-caller`

All except `agentci/analysis-agent-event-unsupported` mark analysis incomplete.
That exception records a verified closed event path, so it may coexist with
`analysis_complete: true`. Benchmark scoring treats a relevant unresolved
diagnostic as a scanner abstention unless the scanner already emitted a positive
observation at that annotation unit. The implicit-ingestion diagnostic affects
only the two write-token rules; a verified unsupported Action event does not
create a scoring abstention. Output-provenance uncertainty also affects only
the write-token rules: the step-scoped prompt rule requires a direct supported
event reference in that AI step or its effective environment.

## Agent-usage observation task

`agentci/agent-usage` is a benchmark task, not a security rule. The library
returns matching observations in `ScanResult.agent_usages`, with file, job,
zero-based step index, kind, line, and reachable events. This permits separate
measurement of agent identification and security-rule classification.

The implementation details and platform approximation are documented in
[`docs/analysis-model.md`](docs/analysis-model.md).
