# AgentCI Guard Annotation Guide

Write labels from the frozen workflow snapshot and the rule contract. Do not
run AgentCI Guard, inspect SARIF, inspect scanner findings, or read another
annotator's decisions during an independent pass.

## Files

- Primary blank sheet: `benchmark/annotation-sheet.csv`
- Independent-review sheet: `benchmark/review-sheet.csv`
- Rule contract: `RULES.md`
- Frozen provenance: `benchmark/manifest.json`
- Snapshots: `benchmark/snapshots/<case-id>/`

The sheets are generated from YAML structure only. Their job/step units and
configured triggers do not contain scanner predictions.

## Ground-truth values

- `positive`: the complete rule predicate is present at this exact unit.
- `negative`: the predicate is absent at this exact unit.
- `indeterminate`: the frozen static artifact cannot decide the predicate.

Use `indeterminate`, not a guessed positive or negative, when a necessary
reusable workflow, script, permission default, or expression meaning is absent.
An indeterminate record must identify at least one unknown dimension.

For `agentci/agent-usage`, positive means a reachable step actually invokes or
configures an AI coding agent under the documented task definition. Installing
a package only to print its version, linting an agent's source code, mentioning
OpenHands in prose, or using a non-agent inference key is negative unless the
step runs the coding agent.

## Reachability

- `reachable`: at least one configured trigger can reach the unit.
- `unreachable`: the supported condition is false for every configured
  trigger.
- `unknown`: static evaluation cannot determine whether a trigger reaches it.

List every relevant configured trigger in `triggers`, separated by semicolons.
Evaluate workflow, job, and step conditions together. Constants and simple
`github.event_name` boolean expressions follow `docs/analysis-model.md`.

## Required semantic fields

Each row records five structured assessments:

- `permissions_status`: `known`, `none`, `unknown`, or `not-applicable`
- source, sink, capability, and mitigation status: `present`, `absent`,
  `unknown`, or `not-applicable`

When a status is `known`, `present`, or `unknown`, its description cannot be
blank. State the effective value or the exact reason it is unknowable.

### Effective permissions

Apply job permissions over workflow permissions. An explicit permission map
sets omitted scopes to none. If neither scope declares permissions, mark the
state unknown unless the frozen artifact carries an explicit repository-default
policy. Do not assume read-only.

### Untrusted source

Record the exact GitHub field and event, for example
`github.event.comment.body on issue_comment`. A field does not satisfy a rule
when its associated event cannot reach that unit.

### Agent sink

Record the Action `uses` target or the CLI invocation. Provider credentials,
model names, or prose can be evidence to inspect but are not automatically an
agent sink in human ground truth.

### Capability

Record shell/command access, token write capability, secret exposure, or
checkout behavior relevant to the task. For `run`, an agent CLI executes
through a shell. For `uses`, require explicit tool configuration rather than
prompt words such as “Python.”

### Mitigation

Record a mitigation only when it changes the rule predicate under the contract,
such as an unreachable event branch, job-level empty permissions, a trusted
base checkout, or a same-key environment override. External controls can be
noted but do not erase a YAML predicate the rule explicitly rates.

## Evidence and explanation

Use `evidence_lines` as semicolon-separated ranges:

```text
12
12-18
.github/workflows/review.yml:12-18;31
```

Positive labels require at least one line range. Every label requires a short
explanation that identifies the decisive present or absent predicate, not a
generic “safe” or “unsafe” judgment.

## Rule-specific decisions

- Job-level write rules: aggregate only the AI steps in that job and apply the
  job's effective permissions.
- Pull-request-target rule: require a reachable AI step on that event; merely
  declaring the trigger is insufficient if the job is gated elsewhere.
- Secret rule: apply workflow → job → step environment replacement by key and
  inspect the AI step's `with`/`run` material.
- Untrusted-input rule: ignore source text used only in `if`; require it in the
  agent step's material or effective workflow → job → step environment.
- Shell rule: any agent CLI in `run` is positive. Action prose is negative
  unless an explicit command tool is enabled.
- Unpinned rule: local Actions and `docker://` are outside this predicate; a
  third-party ref must be exactly 40 hexadecimal characters.
- Checkout rule: require `pull_request_target` reachability, an explicit PR
  head/fork source, and either `allow-unsafe-pr-checkout: true` or
  known-unprotected checkout v1. Current floating v2-v7 majors without the
  opt-out are negative; ambiguous fixed refs are indeterminate.

## Independent review and adjudication

Annotator A fills the primary sheet. Annotator B fills only the deterministic
review sheet. Use different stable pseudonyms.

```bash
node scripts/benchmark/import-annotation-csv.mjs \
  annotator-a-filled.csv reviewer-a benchmark/labels/annotator-a.jsonl \
  --coverage all

node scripts/benchmark/import-annotation-csv.mjs \
  annotator-b-filled.csv reviewer-b benchmark/labels/annotator-b.jsonl \
  --coverage review-plan

node scripts/benchmark/compare-annotations.mjs \
  benchmark/labels/annotator-a.jsonl \
  benchmark/labels/annotator-b.jsonl \
  disagreements.csv
```

The adjudicator fills every blank decision field in `disagreements.csv` after
reviewing both evidence records and the rule contract:

```bash
node scripts/benchmark/adjudicate.mjs \
  benchmark/labels/annotator-a.jsonl \
  benchmark/labels/annotator-b.jsonl \
  disagreements.csv \
  benchmark/labels/adjudicated.jsonl \
  reviewer-c
```

The final record stores the stable human pseudonym used for each substantive
adjudication and is cross-checked against both published independent label
files. The adjudicator may be one of the two annotators, but the identity must
not be replaced by a generic value.

Do not change the scanner after opening evaluation errors. If a rule changes,
document the leak, move affected cases to development, and freeze a new held-out
set.
