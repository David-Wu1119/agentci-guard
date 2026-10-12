# Static Analysis Model

AgentCI Guard evaluates each AI step under an explicit effective context. This
document describes the **source-provenance candidate in this source tree**, not
the tagged `v0.6.2` Action/CLI. The published v0.1.1 annotation predicates in
[`benchmark/pilot/contracts/v0.1.1/RULES.md`](../benchmark/pilot/contracts/v0.1.1/RULES.md)
remain a historical contract; changed candidate outcomes cannot be scored
against those labels as independent accuracy evidence. The documented vendor
mode assumptions below refer to a pinned Anthropic commit, not every future
`@v1` tag target.

## Environment

Environment values are merged in GitHub's specificity order:

```text
workflow env < job env < step env
```

The most specific value replaces the broader value with the same name. See
GitHub's [workflow syntax for `env`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env).
Secret and supported untrusted-event expressions in the resulting effective
environment are visible to the AI step; a same-key job or step override removes
the broader value.

## Event reachability

The workflow's `on` events form the initial event set. The supported expression
subset includes boolean constants; `github.event_name` equality and inequality;
parentheses; `&&`, `||`, and `!`; and
`contains(fromJSON(...), github.event_name)`. These predicates narrow the event
set independently at job and step scope. Evaluation uses three-valued logic so
a supported false branch can be removed even when another subexpression is
unknown.

Any nonconstant job or step condition outside this subset does not silently
choose a reachability state. It retains the conservative event set and emits
`agentci/analysis-event-condition`.

When such a condition leaves an event path unresolved, the result keeps that
event in `reachable_events` and also lists it in the optional
`uncertain_reachable_events` subset. Text, Markdown, SARIF, and browser output
expose the distinction. An event absent from the uncertainty subset has its
modeled event predicates resolved; that does **not** prove the job or step ran.

## Coverage floor: agents invoked outside the workflow

A workflow can name no agent at all and still run one. Several patterns in the
frozen benchmark do exactly that:

- `run: ./run_pipeline.sh`, where the script installs and drives an agent
- `run: make all`, where a Makefile target reaches an agent
- `run: python .github/openhands/dispatch.py`, which posts to a hosted agent
- a matrix whose values name providers, consumed by a shell script

In each case the only in-workflow evidence is an installation step, an
environment variable, or a secret name. This analyzer reads workflow files, so
these are invisible and will stay invisible: inferring an agent from
`pip install` or from an `OPENHANDS_*` variable would flag installation and
configuration as execution, which the version/help exclusions exist to prevent.

This is a floor on static workflow analysis, not a defect to be patched. Runtime
monitoring of the runner observes this layer; a workflow reader cannot.

## Conservative handling of uninterpretable conditions

In the v3 development sample, 94 of 152 workflows had an event-condition
diagnostic. Auditing those snapshots, the dominant constructs are runtime
values: step outputs (`steps.*`), job outputs (`needs.*`), and `env.*`,
`inputs.*`, `matrix.*`, and `vars.*` references, which this workflow-only
reader cannot resolve without runtime state or external files.

Conservative handling retains the event set, so an uninterpretable condition
can produce extra findings. Actor-gate recognition is separate and also fails
closed: an unrecognized guard leaves the job ungated. The impact on precision
and recall has not been measured against human labels.

The status functions `always()`, `success()`, `failure()`, and `cancelled()`
are event-independent: they depend on prior step status, never on the trigger,
so none of them can exclude an event. A condition built only from them and
boolean operators therefore leaves the event set untouched and is reported as
complete. They are deliberately not substituted with `true` — that would turn
`!cancelled()` into `false`, empty the event set, and silently skip the job. A
condition that mixes a status function with an unresolvable runtime value stays
conservative and keeps its diagnostic.

## What counts as an agent

Three invocation shapes are recognized: an **action** reference, a local
**CLI** command, and an HTTP call to a hosted **agent-dispatch** endpoint. The
third shape appears in workflows that drive a background coding agent with no
action and no installed binary.

Inference calls are deliberately excluded. A request to
`chat/completions`, `/v1/messages`, or `:generateContent` returns text and
holds no tools, so injected content can corrupt its output but cannot reach the
repository. The threat this project models requires that reach, so a plain
inference call is not an agent observation no matter how untrusted its input.
The `misleading-non-agent` adversarial case pins this boundary.

HTTP agent endpoints are grouped with CLIs rather than actions for ingestion
purposes, because a shell request carries only what the surrounding script puts
in it. Version and help invocations (`aider --version`) are likewise not
executions, which is why a scheduled workflow that checks a published package
version reports clean.

The `run:` CLI matcher is not a general shell parser. It handles common direct
commands, assignments, branches, pipes, and literal nested shell strings, but
dynamically constructed shell scripts can still hide an agent invocation.
An `analysis_complete: true` result means no unresolved or parse diagnostic
remains; a verified unsupported Action event can still produce a diagnostic
for provenance. Completeness does not prove the workflow is safe.

## The agent's own gate

At [the pinned Anthropic revision](https://github.com/anthropics/claude-code-action/tree/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc),
`anthropics/claude-code-action` checks the triggering actor's repository write
access for issue, pull request, comment, and review events by default. Its
[security guidance](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/docs/security.md)
documents `allowed_non_write_users` and `allowed_bots` as ways to admit actors
without that check. The lower-level `claude-code-base-action` is not modeled as
having this gate. Anthropic says `allowed_non_write_users` works **only** with
an explicit `github_token` input; the candidate checks for that input before
modeling a bypass, but cannot resolve whether a dynamic token expression is
empty. `allowed_bots` entries are not permission-checked.

The candidate classifies each reachable event path independently. When the
untrusted-trigger, agent, write-token pattern is present and **all** of the
following hold on that event, the finding is `agentci/gated-ai-write-token` at
high rather than `agentci/untrusted-ai-write-token` at critical:

- every AI step that ingests untrusted content on that event is an inspected immutable
  `anthropics/claude-code-action` revision (not `-base-action`) with neither
  `allowed_non_write_users` nor `allowed_bots` set to a non-empty value;
- the event is one the docs list as checked — `issues`,
  `issue_comment`, `pull_request`, `pull_request_review`,
  `pull_request_review_comment`; `pull_request_target` and the discussion events
  are not listed and keep potential critical findings when Action event support
  is unverified;
- every relevant text source belongs to the actor checked by that gate, and
  no other AI path reachable on that event has unresolved implicit, tool-fetch,
  or CLI input flow. Parent Issue,
  PR, or discussion content may have a different author on comment, review, or
  label activity and therefore prevents the downgrade;
- no `run:` step reachable on that event expands untrusted event text, because that path
  bypasses the agent's gate entirely. If another agent's inherited input is
  unresolved, neither the high nor the critical write-token finding is
  asserted from that unknown path. A job can have high and critical findings
  on different events without attributing either severity to the other event.

The Action's gate answers "who activated this run?", not "who authored every
piece of text the agent reads?" A trusted maintainer can label an attacker
Issue or comment on an attacker PR. When tag mode fetches that parent content,
the candidate keeps `untrusted-ai-write-token` critical if a sensitive write
capability is modeled. `broad-write-permissions`, `unpinned-ai-action`, and
`ai-with-secrets` are independent of the downgrade. The gate itself is a runtime
implementation detail, not a static proof of safety.

The v0.1.1 downgrade was set on 2026-09-05 and historically moved 24 of 30
critical benchmark findings to high. Those counts describe the **old
classifier on development data**, not the source-aware candidate or a
precision/recall estimate. No claim about the candidate's accuracy follows.

## Untrusted content reaching an agent

Untrusted content reaches an agent by two different routes, and only one of
them is visible as an expression.

The first is interpolation: `${{ github.event.issue.title }}` and its siblings
expanded into a prompt, an input, or a `run:` block. This is what
`agentci/untrusted-input-in-prompt` reports.
For a local agent CLI, the candidate traces the recognized command and only
environment variables expanded in it. A source used solely by a sibling
command is not a proven CLI input. The local CLI nevertheless inherits its
environment: an unreferenced untrusted environment value leaves analysis
incomplete instead of proving ingestion or safety. Shell assignments, pipes,
stdin redirection, earlier untrusted `GITHUB_ENV` writes, and other unresolved
flow likewise emit
`agentci/analysis-run-dataflow-unknown`. For a direct hosted-agent HTTP POST,
the candidate traces the request body and only environment variables
referenced by that body. These bounded parsers are not general shell dataflow
analysis.

The second route is Action self-fetching, which depends on vendor and mode.
At the pinned Anthropic revision, [tag mode fetches parent Issue/PR data](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/modes/tag/index.ts)
and builds a prompt from it. The [mode detector](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/modes/detector.ts)
normally selects agent mode when a nonempty `prompt` is present; in
[agent mode](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/modes/agent/index.ts),
the supplied prompt is used directly rather than automatically fetching event
text. Supported `track_progress` can force tag mode. Without a prompt, issue,
comment, and review events can use tag mode when the Action's trigger check
passes; a bare PR event does not automatically imply tag-mode ingestion. The
scanner models these event/mode routes but cannot prove a runtime `@claude`
trigger check succeeded. A single unresolved `${{ ... }}` prompt can resolve
to empty at runtime, so the candidate still permits tag-mode ingestion in that
case. An explicit event expression still counts as a source when it is passed
into the Action's inputs or effective environment.

On a PR, the [pinned tag prompt](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/create-prompt/index.ts) also includes changed-file paths. An owner can open a PR from an attacker-authored fork, so the actor gate does not authenticate those paths. Because `issue_comment` can target a PR, the candidate conservatively keeps that path possible there too.

`claude-code-base-action` has no modeled self-fetch route. For other Action
refs, including a mutable Anthropic tag, the candidate does not infer
implicit ingestion from the event alone. When the Action is reachable on an
untrusted event with a modeled write capability, it emits
`analysis-agent-implicit-ingestion-unknown` instead of a definite write-token
finding for that route; explicit interpolation is still judged separately.
At the other [inspected Anthropic revision](https://github.com/anthropics/claude-code-action/blob/787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251/src/modes/detector.ts),
a nonempty static prompt with `track_progress` off selects
[agent mode](https://github.com/anthropics/claude-code-action/blob/787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251/src/modes/agent/index.ts),
which does not automatically fetch the parent Issue body. Other modes at that
revision are not modeled as verified. A `run:` invocation of an agent CLI or
HTTP dispatch is treated differently: it only receives what the shell passes,
so untrusted content requires interpolation.

Anthropic tag mode's [data fetcher](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/github/data/fetcher.ts)
also loads pre-trigger comments and reviews. The candidate attributes its
automatic fetch to the parent Issue/PR **and** conservatively treats prior
comments/reviews as a separate untrusted history source. A PR-head provenance
guard cannot sanitize that history. The scanner does not resolve each comment's
author or the Action's `include_comments_by_actor` filter, so some findings
will be conservative.

The two routes stay distinguishable in output:
`agentci/untrusted-input-in-prompt` is specific to interpolation, while the
write-token rule covers either supported route. A static `prompt` with no event
expression is not treated as ingesting an event merely because the Action uses
an event trigger.

A third, narrower route is an explicit agent tool read. One pinned public
[Action workflow](https://github.com/dshakes/lantern/blob/73a6e17c8f3ce81cd3e8fa72dc26f8d95e6de6c1/.github/workflows/sdlc-plan.yml#L5-L46)
passes `github.event.issue.number` in a prompt and permits
`Bash(gh issue view:*)`; [GitHub CLI](https://cli.github.com/manual/gh_issue_view)
documents that this command displays the Issue body. At that revision, the
[mode detector](https://github.com/anthropics/claude-code-action/blob/787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251/src/modes/detector.ts)
selects agent mode for the explicit prompt, and the
[agent-mode implementation](https://github.com/anthropics/claude-code-action/blob/787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251/src/modes/agent/index.ts)
does not automatically fetch that body. A write-authorized labeler may invoke
the Action on an Issue written by someone else, so an actor gate does not
authenticate the parent text; the same distinction applies to a trusted
commenter on someone else's Issue. With a literal Issue-number pointer, a literal
`gh issue` Bash allowlist, a configured token path, and write capability, the
candidate emits `analysis-agent-tool-fetch-unknown` and marks analysis
incomplete. The pinned Action's [token setup](https://github.com/anthropics/claude-code-action/blob/787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251/src/github/token.ts)
supports an OIDC-to-App path, but this does not prove the external exchange
succeeded. It does not call this a critical finding: the token exchange,
issued scope, actual Claude tool choice, and any exploit are unobserved. This
check is intentionally narrower than all possible tool-mediated reads.
Because `issue_comment` can also target a PR, that event's diagnostic may be
conservative when `gh issue view` would not return the PR body.

## Actor and provenance guards

An untrusted trigger does not by itself mean an untrusted actor can reach a job.
A job or step condition has an _actor gate_ when it restricts execution to
`github.repository_owner` or to `OWNER` in the triggering comment/review's
`author_association`. `MEMBER` and `COLLABORATOR` do not prove repository
write access: GitHub gives organization members and outside collaborators
[Read or Triage roles](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization)
without write access. An inequality such as
`github.actor != 'dependabot[bot]'` is not a gate. A separate _PR provenance
gate_ recognizes a same-repository PR head or a non-fork PR. These checks are
not interchangeable: the first identifies who triggered the activity; the
second constrains the PR source.

A literal login (`github.actor == 'maintainer'`) or finite login allowlist
restricts identity but does not prove that account has write access. The
candidate no longer treats it as a verified trust gate; this can yield
conservative findings until a separate role-proof mechanism exists.

The candidate classifies supported input expressions as Issue, PR,
discussion, comment, review, commit message, or other. Actor gates remove triggering
comment/review content, but do not remove parent Issue/PR/discussion content
when its author can differ from that actor. On `issue_comment`, for example,
an owner comment can activate tag mode on an Issue opened by a stranger. On
`issues: [labeled]`, the owner who applied the label likewise need not have
written the Issue body. A PR provenance gate can separately rule out the
supported untrusted PR-derived fields.

Only a single explicit creation activity lets an actor gate authenticate the
new parent's title/body: `issues`, `pull_request`, or `pull_request_target`
with `types: [opened]`, or `discussion` with `types: [created]`. A PR opener
need not have authored the head branch name; `github.event.pull_request.head.ref`
and `github.head_ref` remain separate PR-head sources even on `opened`. A
supported same-repository/non-fork guard can constrain them. Mixed or omitted
activity lists stay conservative. This is a narrow YAML `on.types` rule, not
a general evaluator of `github.event.action` in `if:` expressions.

Parent-object `user` or `author_association` checks are not accepted as
comment-author gates: on a comment event, those values can identify the
maintainer who opened the parent while a stranger wrote the comment.

A `push` actor can merge a contributor's commit or squash a PR whose title or
commit message becomes `github.event.head_commit.message`; that message is
not authenticated by an owner-actor condition. The model keeps its
`untrusted-input-in-prompt` route even though `push` is not one of the
write-token rule's untrusted triggers. [GitHub documents the squash-merge
message sources](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests).

`github.triggering_actor` is not a trusted gate either: on a re-run it names
the re-run initiator, while the original event payload and `github.actor`
remain tied to the initial run. A maintainer re-running an attacker's comment
does not make the comment trusted.

Recognition is an implication check rather than an evaluation. A conjunction is
gated when _either_ operand is gated, because `A && B` implies `A`. A
disjunction is gated only when _every_ operand is gated. The supported
`!github.event.pull_request.head.repo.fork` form is a PR-head provenance gate;
other negation and unrecognized constructs are treated as ungated.

An actor gate can suppress untrusted-input findings for its own trigger text,
but not for a parent whose author can differ. The `pull-request-target-ai` rule
asks whether an untrusted actor can reach the AI step and still consults a
recognized job or step gate; that rule alone does not settle whether the step
will read an attacker-authored PR. `tests/prt-step-gate.test.ts` pins step-level
gating, while the source-aware regressions cover parent-content cases.
`unsafe-checkout` does **not** consult the actor gate: an owner applying a label
does not make an attacker PR head safe to execute. Permission breadth, action
pinning, and secret exposure are also unaffected by actor gates.

This is a bounded source-provenance model, not proof that every actor guard is
safe. It recognizes only the fields and creation activities above, and its
vendor self-fetch assumptions are pinned snapshots. Do not use this version as
a production security gate or quote calibrated accuracy for it.

Only guards GitHub resolves before the job starts are trusted. A gate computed
by workflow code at runtime, such as a step that queries collaborator
permission and exports an `allowed` output, is **not** trusted even though it
is a legitimate pattern: a static reader cannot confirm that such a check runs
before untrusted content is fetched or executed, and trusting an arbitrary step
output named `allowed` would be trivial to spoof. This is a deliberate source
of false positives, chosen over the false negatives the alternative would
introduce.

GitHub's [`discussion` and `discussion_comment` events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#discussion)
are included. GitHub currently documents those events as public preview.
The verified Anthropic Action revision
[`1d6de8c`](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/github/context.ts#L250-L251)
rejects both events before Claude starts. The scanner excludes only those event
paths for that immutable ref and emits a provenance diagnostic; this
conclusively closed path does not make the analysis incomplete. A mutable or
unverified ref retains potential findings with a separate
compatibility diagnostic; CLI agents and other Actions remain in scope.

## Permissions

If a workflow or job declares any permission map, omitted scopes are `none`, as
specified by GitHub's
[`jobs.<job_id>.permissions` syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idpermissions).
`read-all`, `write-all`, `{}`, and job-level replacement are modeled.

When both workflow and job permissions are absent, repository or organization
settings can change GitHub's default. AgentCI Guard therefore uses `unknown`
instead of inventing a read-only or write default. A repository can declare its
known policy through `agentci.config.json`:

```json
{
  "defaultPermissions": "read-all"
}
```

`defaultPermissions` also accepts `none`, `write-all`, `unknown`, or a scope
map.

`broad-write-permissions` is a model of the workflow's `GITHUB_TOKEN`. The
source-aware write-token rule also recognizes one separate capability path. At
the pinned Anthropic revision, the full Action without an explicit
`github_token` input [exchanges an OIDC token for its GitHub App
token](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/src/github/token.ts);
its [App permission documentation](https://github.com/anthropics/claude-code-action/blob/1d6de8cb0c237e7c15e9e1bdf973826ebae490cc/docs/security.md#github-app-permissions)
includes write access to contents, pull requests, and issues. With no
`with.github_token` and **known** effective `id-token: write`, the candidate
therefore treats that Action as potentially write-capable even if the YAML
`contents:` permission is read-only. This does not prove App installation,
token exchange success, or exact runtime scopes. Other separately minted or
supplied credentials remain outside the model, so a negative write-token
finding is not a proof of no write authority.

For a hosted agent dispatched by HTTP, the runner's `GITHUB_TOKEN`
permissions do not establish the remote agent's write capability. The
candidate reports untrusted request-body ingestion but abstains from the
write-token predicate with `agentci/analysis-remote-agent-capability-unknown`;
it may still report `broad-write-permissions` for the runner job.

## Reusable workflows

Job-level local calls such as
`./.github/workflows/review.yml` are resolved recursively. Caller events,
inputs, and token permissions are propagated; secret references inside the
called workflow are scanned syntactically, while input
expressions are materialized transitively through nested calls into the called
workflow. Cycles and missing local targets are diagnostics.
`secrets: inherit` alone does not create `ai-with-secrets` for every AI step:
the candidate requires a supported secret/token reference in that step's
effective environment or inputs. The built-in `GITHUB_TOKEN` is handled by
the permissions model.
An earlier step that may write a secret to `GITHUB_ENV` marks a later AI step's
analysis incomplete; cross-step secret flow is not a positive finding yet.
The same incomplete result applies to an earlier untrusted event-text write to
`GITHUB_ENV`; the scanner does not claim that the later agent consumed it.
`workflow_call` entrypoints with no reachable local caller are also marked
incomplete because their caller-supplied context is unavailable; any separate
direct trigger is still analyzed on its own event set.

Token permissions are intersected across the call chain because GitHub states
that a called workflow can only
[maintain or reduce caller permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations#access-and-permissions-for-nested-workflows).

Remote reusable workflows are not downloaded. They emit
`agentci/analysis-remote-reusable-workflow`, and `analysis_complete` is false.

## Shell semantics

A local AI CLI invoked in `run:` receives `ai-shell-access` because the CLI
process is launched through the runner shell; this does not prove which tools
the agent itself can call. An AI Action needs an explicit shell or command-tool
setting in its inputs. A hosted-agent HTTP dispatch is not a shell finding:
`curl` running locally says nothing about the remote agent's tools. Incidental
prompt prose such as “Python,” “node,” or “bash” is not capability evidence.

## Pull-request checkout protection

For `pull_request_target`, the checkout rule recognizes PR head/merge refs and
fork-repository expressions. As of 2026-07-25, floating
`actions/checkout@v2` through `@v7` references are modeled as carrying GitHub's
current fork-PR protection; v7 minor/patch refs are also protected. The rule fires when
`allow-unsafe-pr-checkout: true` explicitly bypasses that protection or when a
known-unprotected v1 release requests PR code.

An immutable SHA, non-v7 minor/patch ref, branch, or dynamic protection input
cannot establish whether the backported protection is present from YAML alone.
The scanner emits `agentci/analysis-checkout-protection-unknown` rather than a
security finding. This model covers GitHub's built-in fork protection; it does
not prove that same-repository PR code or subsequently executed workspace
content is trusted.

## Diagnostics and locations

YAML parse failures are parse diagnostics, not prompt-injection findings.
Error diagnostics make the CLI/Action exit with code 1 even when `fail-on` is
`none`. Conservative incompleteness warnings remain visible through
`diagnostics` and `analysis-complete`, through the Action's `::warning::`
annotation and step summary, and in SARIF as the run's `invocation`
(`executionSuccessful` mirrors `analysis_complete`; each diagnostic is a
`toolExecutionNotification` with its code as descriptor, its severity as
level, and its file and line as location). The organization result places
every scanned repository in exactly one of five categories — complete or
incomplete, with or without findings, or no workflows — that sum to the
scanned count; skipped repositories are outside all five.

Finding locations point to the relevant job or step line. This is a YAML-aware
layout heuristic rather than a full source-map, so unusual flow-style YAML may
fall back to the containing job.

The library also returns `agent_usages`, a non-rule observation stream with a
stable file, job, zero-based step index, source kind, line, and reachable event
set. The benchmark uses it to measure agent-usage detection separately from
security-rule classification. It is not itself a security finding.
