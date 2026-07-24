# AgentCI Guard Error Analysis

## Status

Human labels and evaluation predictions do not yet exist. Therefore there is no
benchmark FP/FN taxonomy to report. Any current error percentage would be
fabricated.

This document fixes the classification procedure before evaluation is opened.

## What counts as an error

- **False positive:** scanner positive, determinate human negative.
- **False negative:** scanner negative, determinate human positive.
- **Abstained positive:** scanner unknown, determinate human positive. It is
  reported as an abstention and counts against overall recall.
- Human-indeterminate units are not forced into FP/FN denominators.

The scorer writes a stable error ID from the annotation unit, human truth, and
scanner decision. A final error-analysis file must contain exactly the current
error IDs; stale or edited provenance fails validation.

## Taxonomy

Every error receives one type:

- `agent-not-recognized`
- `non-agent-mistaken-for-agent`
- `environment-propagation`
- `permission-resolution`
- `reachability`
- `capability-inference`
- `reusable-workflow-boundary`
- `platform-version-drift`
- `parser-failure`
- `annotation-disagreement`
- `location-mapping`
- `rule-definition-ambiguity`
- `other`

The explanation must identify the decisive code path and workflow evidence.
“Scanner wrong” is not an analysis.

## Classification workflow

```bash
eval_tmp="$(mktemp -d)"
AGENTCI_BENCHMARK_SPLIT=eval \
  AGENTCI_BENCHMARK_OUTPUT_DIR="$eval_tmp" \
  node scripts/benchmark/score.mjs benchmark/labels/adjudicated.jsonl

cp "$eval_tmp/errors-eval.csv" \
  benchmark/labels/error-analysis-eval.csv

# Fill error_type, explanation, and reviewer. Review it, set manifest status to
# evaluated, commit both, and start the final run from that clean commit:
final_eval_tmp="$(mktemp -d)"
AGENTCI_BENCHMARK_SPLIT=eval \
  AGENTCI_BENCHMARK_OUTPUT_DIR="$final_eval_tmp" \
  node scripts/benchmark/score.mjs \
  benchmark/labels/adjudicated.jsonl \
  benchmark/labels/error-analysis-eval.csv
```

The generated JSON and Markdown aggregate the completed taxonomy. If the file
is absent, `error_analysis.status` is pending; if a supplied row is
unclassified or stale, scoring fails. In either case the calibration gate
cannot pass.

## Known pre-benchmark defect examples

These are regression-history examples, not v3 evaluation errors:

| Historical behavior                                                | Corrected type                 |
| ------------------------------------------------------------------ | ------------------------------ |
| Workflow-level secrets were invisible to AI steps.                 | `environment-propagation`      |
| A push-only job was treated as reachable on `pull_request_target`. | `reachability`                 |
| Prompt prose containing “Python” implied shell tools.              | `capability-inference`         |
| Missing permissions were assumed safe.                             | `permission-resolution`        |
| Remote reusable calls looked clean without disclosure.             | `reusable-workflow-boundary`   |
| Malformed YAML became a prompt-injection finding.                  | `parser-failure`               |
| Generic `agent` and `User-Agent` tokens implied AI use.            | `non-agent-mistaken-for-agent` |

Each has a public adversarial regression case. Those cases demonstrate defect
nonrecurrence; they are not unbiased accuracy evidence.
