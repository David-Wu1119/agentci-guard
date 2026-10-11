# AgentCI Guard nine-rule candidate: human decision contract

Version: development micro-pilot 1. This is the **candidate** contract, not
the archived v0.1.1 eight-rule contract or the pre-candidate table in the
repository `RULES.md`. Apply only this document to this packet. The contract
was prepared with access to scanner design, so this is a development exercise,
not an independent accuracy evaluation. It contains no per-case label or
scanner prediction. The human annotator alone decides every row.

## Unit and decision

Each row names one workflow, job, step (zero-based index), or local reusable
call and one rule. `agentci/agent-usage` is an observation task, not a security
finding. Judge the complete predicate at **that row's unit**, not whether the
repository is generally safe. Use `positive` when the complete predicate is
supported, `negative` when a required part is absent, and `indeterminate` when
the frozen YAML cannot decide a necessary part. For `indeterminate`, mark at
least one relevant assessment or reachability as `unknown` and explain why.
An unknown dimension need not make a row indeterminate when another required
part is definitely absent.

Use the workflow's `on` events and job/step `if` together. A condition proven
false for all configured events is `unreachable`; an unresolved condition is
`unknown`, not automatically false. Supported static event tests include
boolean constants, `github.event_name` equality/inequality, parentheses,
`&&`, `||`, `!`, and `contains(fromJSON(...), github.event_name)`. Status
functions depend on execution state, not event identity. List relevant
configured events in `triggers`, separated by semicolons.

Effective environment follows workflow → job → step override by key. Job
permissions replace workflow permissions; a declared permission map sets
omitted scopes to `none`. Without either map and without a frozen repository
default, permissions are `unknown`, never presumed read-only. A called local
workflow cannot increase caller token permissions. Remote reusable workflows
and missing local callees are unknown where needed.

An agent is a documented coding-agent Action, an executable coding-agent CLI
invocation, or a direct POST that creates/follows up a hosted coding-agent
task. Relevant Action families include `anthropics/claude-code-action`,
`anthropics/claude-code-base-action`, `openai/codex-action`, and documented
OpenHands Actions. Relevant CLI forms include an executing `claude`,
`aider`/`python -m aider`, `cursor-agent`, or `codex exec`/`codex run` command.
Relevant hosted routes create/follow up Cursor Cloud Agent, Devin session, or
GitHub Copilot agent tasks via direct `curl` POST. The name of a provider or
repository alone does not establish that its Action/command is a coding agent;
read what the frozen step actually invokes. A plain model inference request,
provider key, installation, version/help check, comment, or prose mention is
**not** agent usage. An Action's `uses`
target, its `with` inputs, and effective environment are possible direct
inputs. Display/control metadata (`name`, `id`, `if`) are not direct prompts.
For a CLI, inspect the recognized command and environment values actually
expanded by it; do not attribute an unrelated sibling command's input to it.
For a direct hosted POST, inspect its request body. If shell dataflow, a script,
or a remote agent's authority cannot be established from the packet, mark the
necessary dimension unknown rather than inventing a path or declaring safety.

Supported external text includes Issue, PR, discussion, comment, review, PR
head/branch, and push commit-message fields when their matching event reaches
the step. In particular, `github.event.issue.title/body`,
`github.event.pull_request.title/body/head.ref`, `github.head_ref`,
`github.event.discussion.title/body`, `github.event.comment.body`,
`github.event.review.body`, `github.event.review_comment.body`, and
`github.event.head_commit.message` are source shapes. `github.ref_name` is
context-dependent and may require an unknown decision. Issue/PR **number**
alone is a pointer, not the body's text. If an agent might later fetch that
body through an allowed tool, the fetch is not proven from YAML alone.

An actor gate proves only who triggered the workflow. A recognized gate must
constrain the actor to `github.repository_owner` or the triggering
comment/review's `author_association == OWNER`. `MEMBER`, `COLLABORATOR`, a
literal login, and `github.triggering_actor` do not prove repository write
access. An actor gate does not authenticate an existing parent Issue, PR, or
discussion that the actor later comments on, labels, or reviews. On a sole
creation activity (`issues` or `pull_request`/`pull_request_target` with
`types: [opened]`, `discussion` with `types: [created]`), it can cover the new
parent title/body, but not a PR head branch or changed-file path. A supported
same-repository/non-fork PR guard can cover PR-head provenance separately.
Mixed or absent activity lists remain conservative. Prior comments/reviews
fetched by an Action can have independent authors.

Supported secret/token references include `secrets.NAME`, bracket secret
access such as `secrets['NAME']`, `toJSON(secrets)`, `github.token`, and a
token/key expression supplied in effective environment or AI-step material.
The existence of a secret name does not prove its runtime value is nonempty.

For `anthropics/claude-code-action`, distinguish an intact default
write-access gate from `claude-code-base-action` and explicit non-write/bot
allowlists. The default gate checks triggering actors for documented Issue,
comment, PR, and review events; it does **not** prove authorship of parent
content. A static nonempty `prompt` normally selects direct-prompt agent mode;
without one, supported tag mode may fetch parent Issue/PR material and prior
discussion. A sole unresolved prompt expression may be empty at runtime.
Explicit event expressions in `with` or effective environment remain direct
input regardless of mode. Unsupported event/revision behavior is unknown,
not an asserted vendor guarantee.

## Rule predicates

| Rule                                | Unit                  | Positive only when…                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentci/agent-usage`               | step or reusable-call | A reachable step/call invokes or configures a documented coding agent under the definition above.                                                                                                                                                                                                                                                                             |
| `agentci/untrusted-ai-write-token`  | job                   | A reachable AI step ingests supported external event text on an untrusted trigger **and** has modeled sensitive write capability. The trigger-actor gate does not downgrade text authored by someone else. Do not also mark `gated-ai-write-token` positive for the same job path.                                                                                            |
| `agentci/gated-ai-write-token`      | job                   | The write-token pattern holds, but **every** ingesting AI step is the full Anthropic Action with an intact write-access gate, every relevant event is documented as gate-checked, all modeled ingested text is attributable to that checked actor, and no `run:` step expands untrusted event text. This is a severity-classification predicate, not proof of runtime safety. |
| `agentci/pull-request-target-ai`    | job                   | At least one AI step is reachable on `pull_request_target` by an untrusted actor; neither its job nor the step has a recognized gate that excludes the triggering untrusted actor. A same-repository/non-fork PR-head guard alone constrains source provenance, not actor trust. A separate unsafe checkout is judged separately.                                             |
| `agentci/ai-with-secrets`           | job                   | A reachable AI step has a supported secret/token reference in its effective environment, `uses`, `run`, or `with`. `secrets: inherit` alone is not enough; an explicit reference at the AI step is required. A possible prior `GITHUB_ENV` export with unresolved flow is unknown.                                                                                            |
| `agentci/untrusted-input-in-prompt` | step or reusable-call | A supported external event field reaches the AI step's direct input or effective environment outside `if`, on a reachable matching event. This is direct interpolation, not merely the Action's possible self-fetch or a later optional agent tool read.                                                                                                                      |
| `agentci/ai-shell-access`           | step or reusable-call | An AI CLI executes through nonempty `run`, or an AI Action explicitly enables shell/command tools in `with`. A local `curl` POST alone does not prove shell tools inside the remote agent. Prompt prose alone is insufficient.                                                                                                                                                |
| `agentci/broad-write-permissions`   | job                   | The job has a reachable AI step and its effective workflow `GITHUB_TOKEN` map grants `write` to `contents`, `pull-requests`, `issues`, `discussions`, `packages`, or `deployments`. Other credentials do not satisfy this rule.                                                                                                                                               |
| `agentci/unpinned-ai-action`        | step or reusable-call | A detected AI step uses a nonlocal, nondocker third-party Action at a ref other than a full 40-hex commit SHA.                                                                                                                                                                                                                                                                |
| `agentci/unsafe-checkout`           | step or reusable-call | On a reachable `pull_request_target` path, `actions/checkout` requests the PR head/fork and explicitly opts out of fork protection or uses known-unprotected v1. Floating protected v2–v7 majors are negative; an immutable/ambiguous ref whose protection cannot be established is indeterminate where necessary.                                                            |

Sensitive write capability for the write-token rules includes known effective
workflow-token write scopes above. The full Anthropic Action with no explicit
`with.github_token` and **known** effective `id-token: write` is also modeled
as potentially able to obtain an App token with sensitive write scopes; this
does not prove the exchange succeeded. Do not infer a hosted remote agent's
write authority from the runner's `GITHUB_TOKEN`.

## Required recording

Use `reachable`, `unreachable`, or `unknown`; permission status `known`,
`none`, `unknown`, or `not-applicable`; and source/sink/capability/mitigation
status `present`, `absent`, `unknown`, or `not-applicable`. A `known`,
`present`, or `unknown` status needs a short description. Positive rows need
one or more workflow line numbers (`12`, `12-15`, or semicolon-separated
ranges). Every row needs a concise explanation of the decisive predicate.
External controls may be noted but do not erase a YAML predicate unless this
contract explicitly says they do. Preserve uncertainty about unseen scripts,
repository defaults, reusable targets, runtime tool choices, and mutable
third-party implementations. No label asserts exploitability.
