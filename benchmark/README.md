# AgentCI Guard Real-Workflow Benchmark

## Status

**Candidate corpus frozen; human labels pending. No accuracy claim is valid
yet.**

The benchmark separates three artifacts:

1. `manifest.json` and `snapshots/`: immutable real workflows with repository,
   path, commit, blob, hash, license, sampling stratum, and repo-disjoint split.
2. `annotation-sheet.csv`: a blank sheet for human annotation.
3. `labels/`: two independent human label sets plus an adjudicated set.

The synthetic fixtures in `corpus/adversarial/` are deliberately excluded.

## Sampling frame

The collection script takes one workflow per repository from each of two
GitHub code-search frames:

- AI-enriched: workflows containing `anthropics/claude-code-action`.
- Control: workflows containing `actions/checkout`, excluding repositories
  selected for the AI-enriched stratum.

Eligible paths are direct `.yml`/`.yaml` children of `.github/workflows/`.
Candidates are ordered by a seeded SHA-256 key, not manually selected.
Repositories without a detected SPDX license are skipped because the workflow
snapshots are redistributed here.

This is a calibration sample, not a prevalence sample. Its strata are
intentionally balanced and must not be used to estimate ecosystem prevalence.

## Annotation protocol

Two humans must independently label every workflow/rule pair as:

- `positive`: the rule's documented condition is present;
- `negative`: the condition is absent;
- `uncertain`: the available static workflow is insufficient.

Annotators must not run AgentCI Guard or inspect its predictions before their
independent pass. They should record a short rationale for positives and
uncertain labels. Disagreements are adjudicated by reviewing the workflow and
rule definition together; the adjudicated file must preserve both original
labels.

The development and evaluation splits are repository-disjoint. Rule changes
may use only `dev`; `eval` remains sealed until the release-candidate scoring
run.

See [`labels/README.md`](labels/README.md) for the JSONL schema.

Each annotator should copy `annotation-sheet.csv`, fill every rule column, and
use a stable pseudonym:

```bash
node scripts/benchmark/import-annotation-csv.mjs \
  annotator-a-filled.csv reviewer-a benchmark/labels/annotator-a.jsonl
node scripts/benchmark/import-annotation-csv.mjs \
  annotator-b-filled.csv reviewer-b benchmark/labels/annotator-b.jsonl
node scripts/benchmark/compare-annotations.mjs \
  benchmark/labels/annotator-a.jsonl \
  benchmark/labels/annotator-b.jsonl \
  disagreements.csv
# Fill the adjudicated, error_type, and rationale columns, then:
node scripts/benchmark/adjudicate.mjs \
  benchmark/labels/annotator-a.jsonl \
  benchmark/labels/annotator-b.jsonl \
  disagreements.csv \
  benchmark/labels/adjudicated.jsonl
```

## Reproduction

```bash
node scripts/benchmark/verify-snapshot.mjs
pnpm build
node scripts/benchmark/score.mjs benchmark/labels/adjudicated.jsonl
```

`score.mjs` reports per-rule and micro precision, recall, F1, support, 95%
Wilson intervals, analysis coverage, diagnostic counts, and an error taxonomy.
It refuses incomplete labels.
