# AgentCI Guard Reproducibility

This document reproduces the v0.1.1 candidate implementation, frozen benchmark,
annotation toolchain, and—once human labels exist—every reported metric.

## Environment

- Node.js: supported from 20.18; CI uses Node 22
- JavaScript Action runtime: Node 24
- pnpm: 10.11.0
- Lockfile: `pnpm-lock.yaml`
- Benchmark inputs: checked-in snapshots and `benchmark/manifest.json`

Use a clean checkout of the exact scanner commit recorded in the metric JSON.
The checkout must include full history and tags so the frozen v0.1.0 baseline
can be checked against its recorded Git objects.

## Code and Action verification

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm build

git diff --exit-code -- dist
node scripts/verify-action-manifest.mjs
pnpm baseline:verify
pnpm audit --audit-level high
```

The hosted CI additionally invokes `uses: ./` for vulnerable, hardened, and
threshold-failure cases. `scripts/verify-sarif.mjs` checks SARIF structure,
severity properties, relative artifact locations, and meaningful line numbers.

After the immutable `v0.1.1` tag and GitHub release exist,
`.github/workflows/published-tag-smoke.yml` repeats those checks through the
fully qualified `David-Wu1119/agentci-guard@v0.1.1` consumer reference without
installing repository dependencies. The moving `v0` tag must not be updated
until this run passes.

After npm publication, manually dispatch
`.github/workflows/published-npm-smoke.yml` with the workflow ref set to
`v0.1.1`. The job refuses any other ref, creates an empty consumer project,
installs exactly `agentci-guard@0.1.1` from the public registry, and verifies
vulnerable and hardened scans before `v0` can move.

Local Action execution can be reproduced without a GitHub token:

```bash
tmp_dir="$(mktemp -d)"
env \
  INPUT_PATH=examples/vulnerable \
  INPUT_SARIF="$tmp_dir/result.sarif" \
  'INPUT_FAIL-ON=none' \
  GITHUB_OUTPUT="$tmp_dir/output" \
  node dist/action.js
node scripts/verify-sarif.mjs "$tmp_dir/result.sarif"
```

## Package verification

```bash
tmp_dir="$(mktemp -d)"
npm pack --json --dry-run --ignore-scripts > "$tmp_dir/pack.json"
node scripts/verify-package.mjs "$tmp_dir/pack.json"
pnpm package:smoke
```

The verifier requires `action.yml`, `dist/action.js`, CLI/library bundles, and
the documented package version. The standalone smoke creates the actual
tarball, extracts it outside the repository, confirms `node_modules` is absent,
and executes both the Action and CLI from that extracted package. This catches
external runtime imports that an in-repository smoke can hide.

## Benchmark integrity

```bash
pnpm benchmark:verify
```

This command:

- validates every snapshot byte count, SHA-256, and computed Git blob SHA;
- verifies fixed commits, blob SHAs, exact workflow paths, unique repositories,
  licenses, and attribution;
- checks the archived v1/v2 provenance and v3 holdout correction;
- regenerates the 7,056-unit blank annotation registry in memory and compares
  it byte-for-byte with the checked-in CSV;
- regenerates the 5,676-unit independent-review plan;
- validates annotation schemas and any published label package.

The collection scripts document how the frozen files were selected, but rerun
search is not the reproduction unit because public search ranking changes. The
manifest and snapshots are.

## Annotation toolchain smoke

```bash
pnpm build
pnpm benchmark:smoke
```

The smoke test fills temporary synthetic labels, runs import, comparison,
adjudication, dev scoring, and schema validation, then deletes the temporary
directory. It never writes benchmark labels or metrics.

## Human label import

Follow `ANNOTATION_GUIDE.md`. The public package is incomplete unless all three
files exist together:

```text
benchmark/labels/annotator-a.jsonl
benchmark/labels/annotator-b.jsonl
benchmark/labels/adjudicated.jsonl
```

After adjudication, update `benchmark/manifest.json` status from `unlabeled` to
`adjudicated` in the same reviewed commit that freezes the label files. Do not
run the evaluation split before that commit.

## Metrics and error analysis

Development scoring may be run while refining only against development data:

```bash
pnpm build
AGENTCI_BENCHMARK_SPLIT=dev \
  node scripts/benchmark/score.mjs benchmark/labels/adjudicated.jsonl
```

Generate the first sealed evaluation and error template outside the repository:

```bash
eval_tmp="$(mktemp -d)"
AGENTCI_BENCHMARK_SPLIT=eval \
  AGENTCI_BENCHMARK_OUTPUT_DIR="$eval_tmp" \
  node scripts/benchmark/score.mjs benchmark/labels/adjudicated.jsonl

cp "$eval_tmp/errors-eval.csv" \
  benchmark/labels/error-analysis-eval.csv
```

This temporary run writes:

```text
$eval_tmp/metrics-eval.json
$eval_tmp/metrics-eval.md
$eval_tmp/errors-eval.csv
```

Fill `error_type`, `explanation`, and `reviewer` for every row. Without changing
scanner code, review that file, set the manifest status to `evaluated`, and
commit both. The final public run must begin from that clean commit and write to
a temporary directory so result files do not falsify the worktree-clean check:

```bash
git status --short # must print nothing
final_eval_tmp="$(mktemp -d)"
AGENTCI_BENCHMARK_SPLIT=eval \
  AGENTCI_BENCHMARK_OUTPUT_DIR="$final_eval_tmp" \
  node scripts/benchmark/score.mjs \
  benchmark/labels/adjudicated.jsonl \
  benchmark/labels/error-analysis-eval.csv

mkdir -p benchmark/results
cp "$final_eval_tmp/metrics-eval.json" benchmark/results/
cp "$final_eval_tmp/metrics-eval.md" benchmark/results/
cp "$final_eval_tmp/errors-eval.csv" benchmark/results/
```

The scorer refuses missing labels, wrong review coverage, duplicate units,
modified provenance, invalid evidence lines, or an unadjudicated evaluation
status. Final qualification also requires a clean scanner worktree and complete
error classification. Review and commit the copied result artifacts without
changing scanner code. The metric JSON records the exact clean scanner commit
used before any result file was written; schema validation rejects published
metrics under any status earlier than `evaluated`.

## Historical 75-repository claim

The old 75-repository totals cannot be exactly reproduced because the original
repository list, commits, snapshots, raw outputs, and durable aggregation
artifact are missing. The recovered evidence and explicit retraction are under
`studies/v0.1.0-baseline/` and `docs/real-world-findings.md`.

Do not reconstruct a new corpus and call it the old study. The truthful
replacement is the fixed v3 benchmark.
