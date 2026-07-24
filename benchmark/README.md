# AgentCI Guard Real-Workflow Benchmark

**Status: v3 corpus frozen; human labels absent; no accuracy claim is valid.**

The reader-facing protocol is [`../BENCHMARK.md`](../BENCHMARK.md). This
directory contains the machine-verifiable research artifacts:

- `manifest.json`: 152 fixed workflows from 152 repositories, source
  provenance, split, sampling frames, review plan, and qualification targets.
- `snapshots/`: exact workflow bytes used for annotation and scoring.
- `archive/agentci-real-workflows-v1/` and `agentci-real-workflows-v2/`:
  superseded unlabeled candidate manifests.
- `annotation-sheet.csv`: 7,056 blank workflow/job/step/task units.
- `review-sheet.csv`: deterministic 5,676-unit second-human plan.
- `schemas/`: manifest and annotation JSON Schemas.
- `labels/`: human source labels, adjudicated labels, and post-evaluation error
  analysis when available.
- `THIRD_PARTY_NOTICES.md`: source attribution and repository SPDX metadata.

V1 lacked agent-family diversity and contained 15 mis-cased control paths. V2
fixed those defects, but its 16 diversity snapshots were later inspected during
pre-label detector correction. V3 keeps those 16 as development data and adds
16 mechanically selected, unseen evaluation replacements. Both superseded
manifests remain available for audit.

The benchmark is targeted and enriched. It is not a prevalence sample.

## Integrity checks

```bash
pnpm benchmark:verify
pnpm build
pnpm benchmark:smoke
```

`benchmark:verify` validates all hashes and provenance, regenerates both blank
annotation registries, validates schemas, and checks any public label package.
`benchmark:smoke` runs the annotation and scoring toolchain using temporary
synthetic labels only.

## Human workflow

Follow [`../ANNOTATION_GUIDE.md`](../ANNOTATION_GUIDE.md). The independent
annotators must not run AgentCI Guard or view its predictions.

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

node scripts/benchmark/adjudicate.mjs \
  benchmark/labels/annotator-a.jsonl \
  benchmark/labels/annotator-b.jsonl \
  disagreements.csv \
  benchmark/labels/adjudicated.jsonl \
  reviewer-c
```

The eval scorer remains sealed while `manifest.json` status is `unlabeled`.
