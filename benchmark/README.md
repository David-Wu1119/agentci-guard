# AgentCI Guard Real-Workflow Benchmark

**Status: v3 corpus frozen and development-only; human labels absent; no
accuracy claim is valid.**

The reader-facing protocol is [`../BENCHMARK.md`](../BENCHMARK.md). This
directory contains the machine-verifiable research artifacts:

- `manifest.json`: 152 fixed workflows from 152 repositories, source
  provenance, split, sampling frames, review plan, and qualification targets.
- `snapshots/`: exact workflow bytes used for annotation and scoring.
- `archive/agentci-real-workflows-v1/` and `agentci-real-workflows-v2/`:
  superseded unlabeled candidate manifests.
- `annotation-sheet.csv`: 7,056 blank workflow/job/step/task units.
- `review-sheet.csv`: deterministic 5,676-unit candidate secondary-pass plan.
- `pilot/`: deterministic development-only, single-annotator test-retest pilot; never
  counted as accuracy evidence.
- `schemas/`: manifest and annotation JSON Schemas.
- `labels/`: human source labels, adjudicated labels, and post-evaluation error
  analysis when available.
- `THIRD_PARTY_NOTICES.md`: source attribution and repository SPDX metadata.

V1 lacked agent-family diversity and contained 15 mis-cased control paths. V2
fixed those defects, but its 16 diversity snapshots were later inspected during
pre-label detector correction. V3 keeps those 16 as development data and adds
16 mechanically selected replacements. The v3 evaluation partition was later
used for detector tuning, so it is development data. Both superseded manifests
remain available for audit.

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

Follow the development-only [`pilot/README.md`](pilot/README.md) procedure to
measure annotation time and single-annotator test-retest agreement. The current
two-human import/adjudication scripts remain for historical toolchain smoke;
they do not create independent review when one person supplies both files.
Formal evaluation requires a fresh v4 sample, a nine-rule annotation registry,
and a frozen human protocol. The v3 scorer rejects `eval` and `all` regardless
of manifest status or label presence.

The registry generator can be tested against a separate, synthetic manifest
without changing v3: `pnpm vitest run tests/benchmark-registry.test.ts`. After
`pnpm build`, a coordinator can pass a new manifest and a nonexistent output
path to the generator, then use `--check` with the same paths:

```bash
node scripts/benchmark/generate-annotation-sheet.mjs --write \
  path/to/manifest.json path/to/new-annotation-sheet.csv
```

The custom path requires exact parity with the bundled scanner's current rule
IDs and refuses to overwrite existing files. This only prepares blank structural
units; it does not collect or seal v4 repositories, validate their provenance,
replace the human protocol, or produce accuracy evidence.
