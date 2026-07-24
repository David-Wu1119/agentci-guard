# AgentCI Guard Benchmark

## Current status

The v3 candidate corpus is frozen and mechanically verified. Human labels are
absent. Therefore AgentCI Guard has **no measured precision, recall, F1, or
calibration claim yet**.

Current immutable data:

- 152 workflow files from 152 public repositories.
- 57 development workflows and 95 sealed evaluation workflows.
- 60 Claude-Action-enriched workflows.
- 60 nonoverlapping `actions/checkout` controls.
- 16 inspected diversity workflows moved to development: four each for Codex
  Action, Aider CLI, Cursor Agent CLI, and OpenHands configurations/lookalikes.
- 16 unseen, mechanically selected replacements in evaluation: four per family.
- 7,056 primary annotation units.
- 5,676 units in the deterministic independent-review plan (80.4%).

The synthetic cases under `corpus/adversarial/` are development fixtures and
are never counted as accuracy data.

## Why v3 supersedes v2

During pre-label detector correction, the 16 targeted diversity snapshots in
v2 were inspected. Their Aider/Cursor command shapes influenced the detector's
executable-CLI boundary, so they could no longer be called held out. No labels,
predictions, or metrics existed, but retaining the eval designation would still
be leakage.

V3 moves all 16 inspected workflows to development and uses a new fixed seed to
select 16 repository-disjoint replacements without opening them for rule
tuning. The v2 manifest is preserved at
`benchmark/archive/agentci-real-workflows-v2/manifest.json`.

The earlier v1 candidate had only Claude enrichment and 15 mis-cased control
paths such as `.GitHub/workflows`. V2 added diversity and replaced those
controls; its archived manifest links to the preserved v1 manifest. Every
current item has a fixed repository commit, Git blob SHA, SHA-256 content hash,
byte count, source URL, and SPDX license.

## Sampling interpretation

This is a targeted calibration benchmark, not a prevalence survey. The balanced
and enriched strata intentionally oversample AI-agent configurations. Results
must not be used to estimate how common AI agents or risky patterns are across
GitHub.

The unit of repository selection is one workflow per repository, so development
and evaluation repositories are disjoint. Base-frame splits are deterministic
from the recorded seed and repository name. V3's explicit reclassification and
replacement-evaluation IDs are separately frozen in the manifest.

## Tasks and annotation unit

Two tasks are measured separately:

1. reachable AI-agent usage detection (`agentci/agent-usage`);
2. classification of each of the eight security rules.

The primary unit is:

```text
(workflow, job, step-or-job scope, task, reachable state)
```

Job-level rules are labeled once per job. Step-level rules and agent detection
are labeled once per step. Reusable-workflow call jobs receive explicit
reusable-call units so unresolved code can be labeled indeterminate rather than
silently negative.

Each record contains ground truth, reachability, triggers, effective
permissions, untrusted source, agent sink, capability, mitigation, evidence
lines, explanation, annotator, and review status. The machine-readable schema
is `benchmark/schemas/annotation-record.schema.json`.

## Human review protocol

- Annotator A labels all 7,056 units without running AgentCI Guard or viewing
  predictions.
- Annotator B independently labels all agent-detection and high/critical rule
  units plus a seeded 22% sample of the remaining units. The checked-in plan
  covers 5,676 units.
- All substantive disagreements are adjudicated under a stable human
  pseudonym. Agreed, single-pass, and adjudicated records remain
  distinguishable, and final records are cross-checked against both source
  files.
- Raw ground-truth agreement, categorical-dimension agreement, Cohen's kappa,
  and independent review coverage are generated from the two source files.
- AI assistance may navigate a file but cannot supply an accepted label without
  human verification.
- Evaluation predictions remain sealed until labels are adjudicated and the
  scanner commit is frozen. If rules change after evaluation errors are seen,
  the affected evaluation data becomes development data.

See [`ANNOTATION_GUIDE.md`](ANNOTATION_GUIDE.md) for the decision rules.

## Metrics

For agent detection, each rule, security-rule micro average, and security-rule
macro average, the scorer reports:

- TP, FP, FN, and meaningful TN;
- precision, recall, F1, and positive support;
- 95% Wilson intervals for precision and recall;
- human-indeterminate count;
- scanner-unknown count;
- decision coverage and abstention rate.

Two evaluation universes are explicit:

- **Supported:** determinate human labels where the scanner made a positive or
  negative decision.
- **Overall:** all determinate human labels; scanner abstention on a positive
  counts as a false negative, while abstention is also charged against decision
  coverage.

A rule with fewer than 10 positive examples is marked insufficient for
percentage claims; exact counts remain public.

## Predeclared wording gate

“Calibrated experimental linter” is permitted only if the evaluation run has:

- agent-detection precision ≥ 90%;
- agent-detection overall recall ≥ 80%, with scanner abstentions on human
  positives counted as false negatives;
- security-rule supported micro precision ≥ 90%;
- security-rule supported micro recall ≥ 80%;
- decision coverage ≥ 80% separately for agent detection, security rules, and
  all tasks combined;
- independently reviewed coverage ≥ 80%;
- high/critical per-rule precision ≥ 80% with sufficient support;
- complete error classification;
- a clean scanner worktree at the recorded commit.

Failure does not invalidate the artifact. It means the honest description
remains “experimental scanner” and the missed targets are published.

## Reproduction commands

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm benchmark:verify
pnpm benchmark:smoke

# Only after the three human label files exist:
AGENTCI_BENCHMARK_SPLIT=dev \
  node scripts/benchmark/score.mjs benchmark/labels/adjudicated.jsonl

# Generate the error template outside the repository, classify it, and commit
# the reviewed error-analysis file before the final clean-worktree run:
eval_tmp="$(mktemp -d)"
AGENTCI_BENCHMARK_SPLIT=eval \
  AGENTCI_BENCHMARK_OUTPUT_DIR="$eval_tmp" \
  node scripts/benchmark/score.mjs benchmark/labels/adjudicated.jsonl
cp "$eval_tmp/errors-eval.csv" benchmark/labels/error-analysis-eval.csv

# After human classification, set status evaluated, commit, and verify clean:
final_eval_tmp="$(mktemp -d)"
AGENTCI_BENCHMARK_SPLIT=eval \
  AGENTCI_BENCHMARK_OUTPUT_DIR="$final_eval_tmp" \
  node scripts/benchmark/score.mjs \
  benchmark/labels/adjudicated.jsonl \
  benchmark/labels/error-analysis-eval.csv
```

See [`REPRODUCIBILITY.md`](REPRODUCIBILITY.md) and
[`DATA_CARD.md`](DATA_CARD.md) for provenance and limitations.
