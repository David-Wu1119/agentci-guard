# AgentCI Guard Reproducibility

This document reproduces the current scanner, the frozen v3 development corpus,
and its annotation toolchain. No human-labeled accuracy metric exists. Formal
evaluation requires a qualified, separately sealed v4 sample and a compatible
nine-rule registry.

## Environment

- Node.js: supported from 20.18; CI uses Node 22
- JavaScript Action runtime: Node 24
- pnpm: 10.11.0
- Lockfile: `pnpm-lock.yaml`
- Benchmark inputs: checked-in snapshots and `benchmark/manifest.json`

For any development diagnostic, use a clean checkout of the exact scanner
commit recorded in its metric JSON.
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
threshold-failure cases. `scripts/verify-sarif-schema.mjs` validates each output
against the checksum-pinned official OASIS SARIF 2.1.0 Errata 01 schema.
`scripts/verify-sarif.mjs` separately checks AgentCI rule metadata, severity
properties, relative artifact locations, and meaningful line numbers.

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
node scripts/verify-sarif-schema.mjs "$tmp_dir/result.sarif"
node scripts/verify-sarif.mjs "$tmp_dir/result.sarif"
```

## Package verification

```bash
tmp_dir="$(mktemp -d)"
npm pack --json --dry-run --ignore-scripts --foreground-scripts=false \
  > "$tmp_dir/pack.json"
node scripts/verify-package.mjs "$tmp_dir/pack.json"
pnpm package:smoke
```

The verifier requires `action.yml`, `dist/action.js`, CLI/library bundles, and
the documented package version. The standalone smoke creates the actual
tarball, extracts it outside the repository, confirms `node_modules` is absent,
and executes both the Action and CLI from that extracted package. This catches
external runtime imports that an in-repository smoke can hide.
An optional `--record <file.json>` saves the package verification receipt and
tarball beside it. Unknown, repeated, missing-value or extra arguments are
rejected before packing; running without arguments still performs the smoke.
Recorded receipts and retained tarballs must both use new paths. Existing
files or symlinks are never replaced, and the receipt cannot share the tarball's
filename. Use a fresh output directory for another recorded run. The artifact
is retained before the receipt is written; a failed run can leave an orphan
tarball, which is not a successful verification receipt.
The smoke clears inherited `INPUT_JSON`, `GITHUB_OUTPUT` and
`GITHUB_STEP_SUMMARY` before running subprocesses. Its Action checks set their
own temporary destinations; CLI scans do not append to the caller's outputs.
`--foreground-scripts=false` keeps npm 10 lifecycle output out of the JSON
stream when `prepare` still runs during `npm pack`.

## Benchmark integrity

```bash
pnpm benchmark:verify
```

This command:

- validates every snapshot byte count, SHA-256, and computed Git blob SHA;
- checks commit SHA format, local blob hashes, exact claimed GitHub
  repository/commit/workflow URLs, unique repositories, licenses, and
  attribution; it does not fetch upstream commits or independently establish
  snapshot origin;
- checks the archived v1/v2 provenance and v3 historical split correction;
- regenerates the 7,056-unit blank annotation registry in memory and compares
  it byte-for-byte with the checked-in CSV;
- regenerates the 5,676-unit secondary-pass candidate plan, which the current
  formal tooling still encodes as independent review;
- regenerates the six-case, 168-unit development-only single-annotator
  test-retest pilot without consulting predictions or evaluation workflow
  content;
- smoke-tests an allowlisted annotator packet that excludes scanner code,
  built bundles, evaluation snapshots, and predictions;
- validates annotation schemas and any published label package.

The collection scripts document how the frozen files were selected, but rerun
search is not the reproduction unit because public search ranking changes. The
manifest and snapshots are.

### Upstream origin check

With GitHub CLI access and a network connection, run:

```bash
pnpm benchmark:verify-upstream
```

This optional command first validates the checked-in v3 manifest and snapshots,
then requests each workflow through the GitHub Contents API at the manifest's
exact repository, path, and commit. It compares returned blob SHA, size, and
bytes with the frozen snapshot and emits a timestamped JSON receipt. It exits
nonzero for any mismatch, unavailable upstream, or API error. This check is
separate from routine CI because it depends on mutable repository availability
and GitHub API access. It does not prove when or how the original collector
obtained a snapshot.

The [checked-in per-case receipt](evidence/upstream-v3-2026-10-12.json), taken
at `2026-10-12T02:38:08.478Z` against manifest SHA-256
`e66632f3926ac9a02c9107907e91d4ff12820fd3c9057f012d272cb8bd00830a`,
records **146 matches, 0 mismatches, 6 HTTP 404 unavailable upstreams, and 0
other API errors**. The six cases were `ai-008`, `ai-009`, `ai-018`, `ai-021`,
`ai-040`, and `control-028`. HTTP 404 means the requests for their exact
repository, path, and commit were unavailable to this authenticated check then;
it does not establish whether the repositories were renamed, made private, or
deleted. The six checked-in snapshots still pass the offline integrity check,
but their recorded origins are not currently independently verifiable. The
receipt records this tool run, not a GitHub attestation; a later run may
produce different counts.

A 2026-10-12 follow-up left the six original 404 results unchanged. Running
the same blob-SHA, size, and byte comparison against alternate GitHub
repositories found exact pinned matches for
[`ai-018`](https://github.com/amir-deriv/deriv-analytics/blob/f60d5e198aa102ed97b2264e5634d38dc10ae164/.github/workflows/claude.yml)
(`amir-deriv/deriv-analytics`) and
[`ai-040`](https://github.com/pydantic/pydantic-ai/blob/e7c9b823cf99c75cf9b3633351b75a84ecbd9091/.github/workflows/bots.yml)
(`pydantic/pydantic-ai`). This independently verifies those two snapshot files
at the alternate pinned commits, but does **not** prove that either repository
is a rename or transfer of the repository recorded in the frozen manifest.
The other four have no verified alternate pinned source. The original-owner
provenance of all six remains unresolved.

## Annotation toolchain smoke

```bash
pnpm build
pnpm benchmark:smoke
```

The smoke test fills temporary synthetic labels, runs import, comparison,
adjudication, development scoring, and schema validation; it also verifies that
v3 `eval` and `all` scoring fail. It then deletes the temporary directory. Its
pilot path uses one stable pseudonym across two passes and enforces the
predeclared washout; its formal path remains a synthetic test of the existing
two-human code. It never writes benchmark labels or metrics.

## Human label import

Do not begin formal evaluation labeling yet. Only one human annotator is
available, while the current formal toolchain requires two genuinely
independent humans and an adjudicated output. The development pilot must finish
first; then the formal single-annotator protocol and scorer must be versioned.
Using two aliases for one person would invalidate the review evidence.

The existing scorer expects all three files below together. This list documents
the current implementation; it is not authorization to produce them under the
one-annotator study:

```text
benchmark/labels/annotator-a.jsonl
benchmark/labels/annotator-b.jsonl
benchmark/labels/adjudicated.jsonl
```

Even a genuine two-human review of v3 would produce development evidence, not
held-out accuracy. Do not change the v3 manifest status to bypass the scorer's
`eval`/`all` rejection. Use only a qualified, separately sealed v4 sample and a
versioned human protocol for formal evaluation.

## Metrics and error analysis

After the human protocol blocker above is resolved, v3 development diagnostics
may be produced with genuine labels:

```bash
pnpm build
AGENTCI_BENCHMARK_SPLIT=dev \
  node scripts/benchmark/score.mjs benchmark/labels/adjudicated.jsonl
```

This output is explicitly development-only and lists scanner rules absent from
the v3 registry. The scorer rejects v3 `eval` and `all` even if labels exist or
the v3 manifest status changes. A v4 scoring path must be built around
repository-disjoint snapshots, a registry for every current rule, a frozen
human review protocol, and complete error classification before any formal
accuracy claim.

## Historical 75-repository claim

The old 75-repository totals cannot be exactly reproduced because the original
repository list, commits, snapshots, raw outputs, and durable aggregation
artifact are missing. The recovered evidence and explicit retraction are under
`studies/v0.1.0-baseline/` and `docs/real-world-findings.md`.

Do not reconstruct a new corpus and call it the old study. The v3 corpus is
reproducible development evidence; a new v4 evaluation is still required for
accuracy measurement.
