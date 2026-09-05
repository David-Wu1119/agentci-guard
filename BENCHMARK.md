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
- 5,676 units in the deterministic secondary-pass candidate plan (80.4%).
  Existing formal tooling still names this independent review, but no second
  human annotator is currently available.

The synthetic cases under `corpus/adversarial/` are development fixtures and
are never counted as accuracy data.

### Status change, 2026-09-05: the v3 evaluation split is development data

Between 2 and 5 September 2026 (releases v0.2.0–v0.4.0), every detector change
was measured by scanning all 152 cases, both splits, and all 31 critical
findings at the pre-#22 state — **21 of them in the v3 evaluation split** —
were read by hand. Rules were then changed after those errors were seen (#14,
#15, #22, #26). Under the leakage rule in this document ("if rules change after
evaluation errors are seen, the affected evaluation data becomes development
data"), the entire v3 evaluation split is reclassified as development data.

Nothing is retracted: no v3 evaluation labels or predictions were ever sealed
or published. But no accuracy claim may cite the v3 evaluation split as held
out, and the per-case results in `evidence/` are behavioral regression
records, not accuracy evidence. A formal evaluation requires a v4
repository-disjoint sample that is not opened for rule tuning. A checksum
freeze proves the snapshots are immutable; it does not make them unseen.

**Formal-evaluation blocker — rule registry mismatch.** The manifest's
annotation registry (`annotation_schema_version` 2) names eight rules. The
scanner at v0.4.0 has nine: `agentci/gated-ai-write-token` was added on
2026-09-05. The 7,056 v3 annotation units therefore cannot label the ninth
rule, and the existing registry must not be used to claim evaluation of all
current rules. Rebuilding the annotation system is out of scope for the current
sprint and is recorded here as a blocker.

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

- Before formal labeling, the sole available human runs the deterministic
  development-only feasibility pilot under `benchmark/pilot/`.
- The same stable pseudonym is used for both pilot passes. Pass 2 starts at
  least seven full days after pass 1 ends, and pass-1 decisions remain closed
  until pass 2 is complete.
- The pilot measures active time, raw exact agreement, chance-corrected
  test-retest agreement, and protocol ambiguity on 168 development units. It
  is not accuracy or inter-rater agreement evidence.
- Formal evaluation labeling has not begun. The current formal comparison,
  adjudication, validation, and scoring path still requires two genuinely
  independent human identities. It must not be bypassed by assigning two
  aliases to one person.
- After the pilot, the formal single-annotator secondary-pass and disagreement
  resolution protocol must be frozen and implemented before any evaluation
  labels are opened. The checked-in 5,676-unit plan is only a candidate input
  to that future protocol.
- AI assistance may navigate a file only when isolated from scanner code,
  predictions, and prior-pass context; it cannot supply an accepted label
  without human verification.
- Evaluation predictions remain sealed until final labels and the scanner
  commit are frozen. If rules change after evaluation errors are seen, the
  affected evaluation data becomes development data.

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
- security-rule overall micro recall ≥ 80%, with scanner abstentions on human
  positives counted as false negatives;
- decision coverage ≥ 80% separately for agent detection, security rules, and
  all tasks combined;
- secondary-pass coverage ≥ 80%, with the mode disclosed and never described as
  independent review unless a second human actually supplied it;
- published test-retest agreement, disagreement counts, and resolution
  provenance;
- high/critical per-rule precision ≥ 80% with sufficient support;
- complete error classification;
- a clean scanner worktree at the recorded commit.

The current scorer still implements the existing two-human wording for this
gate. The gate is therefore not executable until the formal protocol and scorer
are versioned after the pilot. This is a blocker, not permission to relabel one
person as two reviewers.

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
