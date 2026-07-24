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

## Event reachability

The workflow's `on` events form the initial event set. Common
`github.event_name` equality, inequality, disjunction, negation, and
`contains(fromJSON(...), github.event_name)` predicates narrow that set at the
job and step levels.

An event-name expression the scanner cannot interpret does not silently choose
an event. It retains the conservative event set and emits
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
expressions are materialized into the called workflow. Cycles and missing local
targets are diagnostics.

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

## Diagnostics and locations

YAML parse failures are parse diagnostics, not prompt-injection findings.
Error diagnostics make the CLI/Action exit with code 1 even when `fail-on` is
`none`. Conservative incompleteness warnings remain visible through
`diagnostics` and `analysis-complete`.

Finding locations point to the relevant job or step line. This is a YAML-aware
layout heuristic rather than a full source-map, so unusual flow-style YAML may
fall back to the containing job.
