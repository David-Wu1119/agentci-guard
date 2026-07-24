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
