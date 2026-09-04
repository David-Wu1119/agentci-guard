# Static Analysis Model

AgentCI Guard v0.1.1 evaluates each AI step under an explicit effective
context. This document states the approximation boundary so a finding can be
reproduced and challenged.

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

## Why an uninterpretable condition is not a false negative

Roughly two thirds of real workflows carry at least one condition outside the
supported subset, and the diagnostic count can look alarming. Auditing the
frozen benchmark, the dominant constructs are runtime values: step outputs
(`steps.*`), job outputs (`needs.*`), and `env.*`, `inputs.*`, `matrix.*`, and
`vars.*` references, none of which a static reader can resolve even in
principle.

Conservative handling retains the event set, so an uninterpretable condition
errs toward reporting more, never less. Actor-gate recognition is separate and
also fails closed: an unrecognized guard leaves the job ungated. So this class
costs precision and reporting noise, and does not hide findings.

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

## Untrusted content reaching an agent

Untrusted content reaches an agent by two different routes, and only one of
them is visible as an expression.

The first is interpolation: `${{ github.event.issue.title }}` and its siblings
expanded into a prompt, an input, or a `run:` block. This is what
`agentci/untrusted-input-in-prompt` reports.

The second is self-fetching, and it is the dominant shape in practice. Agent
_actions_ such as `anthropics/claude-code-action` receive a token and read the
triggering issue, comment, or pull request through the GitHub API at runtime.
The attacker's text arrives in the agent's context without ever appearing in
the workflow file. A reachability model that requires an expression therefore
misses the ordinary case: a job triggered by `issue_comment`, holding
`contents: write`, running an agent action, and gated on nothing but a trigger
phrase that any stranger can type.

So an agent action reachable on an event in `UNTRUSTED_EVENTS` is treated as
ingesting that event's untrusted content, whether or not an expression is
present. A `run:` invocation of an agent CLI is treated differently: it only
receives what the shell hands it, so it still requires interpolation.

The two routes stay distinguishable in output.
`agentci/untrusted-input-in-prompt` remains specific to interpolation, and
`agentci/untrusted-ai-write-token` reports either route, naming which one it
found in the finding's evidence.

## Actor and provenance guards

An untrusted trigger does not by itself mean an untrusted actor can reach a job.
A job or step condition is treated as _actor-gated_ when it restricts execution
to one or more literal logins (`github.actor == 'maintainer'`, or
`contains(fromJSON('["a","b"]'), github.actor)` — GitHub resolves the actor
before the job starts and a stranger cannot be that user, so this is exactly as
sound as an owner comparison, and it is the shape Anthropic's workflow template
ships; inequality such as `!= 'dependabot[bot]'` excludes one account and
admits everyone else, so it is not a gate), to the repository owner (`github.actor` or `github.event.sender.login` compared
against `github.repository_owner`), to pull requests originating in the base
repository (`github.event.pull_request.head.repo.full_name ==
github.repository`, or a negated `head.repo.fork`), or to a trusted
`author_association` — `OWNER`, `MEMBER`, or `COLLABORATOR` — by equality or by
`contains(fromJSON(...), ...)` membership.

Recognition is an implication check rather than an evaluation. A conjunction is
gated when _either_ operand is gated, because `A && B` implies `A`. A
disjunction is gated only when _every_ operand is gated. Negation and every
unrecognized construct are treated as ungated.

Actor-gated jobs and steps do not raise `agentci/untrusted-ai-write-token`,
`agentci/untrusted-input-in-prompt`, `agentci/pull-request-target-ai`, or
`agentci/unsafe-checkout`. Findings that do not depend on who can trigger the
workflow — permission breadth, action pinning, and secret exposure — are
unaffected, because a guard restricts the attacker, not the blast radius.

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

## Reusable workflows

Job-level local calls such as
`./.github/workflows/review.yml` are resolved recursively. Caller events,
inputs, secret exposure, and token permissions are propagated; input
expressions are materialized transitively through nested calls into the called
workflow. Cycles and missing local targets are diagnostics.
`workflow_call` entrypoints with no reachable local caller are also marked
incomplete because their caller-supplied context is unavailable; any separate
direct trigger is still analyzed on its own event set.

Token permissions are intersected across the call chain because GitHub states
that a called workflow can only
[maintain or reduce caller permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations#access-and-permissions-for-nested-workflows).

Remote reusable workflows are not downloaded. They emit
`agentci/analysis-remote-reusable-workflow`, and `analysis_complete` is false.

## Shell semantics

An AI CLI invoked in `run:` executes through the runner shell and receives the
`ai-shell-access` rule. For an AI Action, the rule requires an explicit shell or
command-tool capability in its inputs. Incidental prompt prose such as
“Python,” “node,” or “bash” does not itself establish shell capability.

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
`diagnostics` and `analysis-complete`.

Finding locations point to the relevant job or step line. This is a YAML-aware
layout heuristic rather than a full source-map, so unusual flow-style YAML may
fall back to the containing job.

The library also returns `agent_usages`, a non-rule observation stream with a
stable file, job, zero-based step index, source kind, line, and reachable event
set. The benchmark uses it to measure agent-usage detection separately from
security-rule classification. It is not itself a security finding.
