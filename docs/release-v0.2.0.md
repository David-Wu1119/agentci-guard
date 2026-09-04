# v0.2.0 Release Gate

v0.2.0 is a detection-correctness and distribution release. Five detection
defects found by validating the tool against its own frozen benchmark are
fixed, two new distribution surfaces ship, and the operator handbook exists.
It remains an **experimental scanner with unmeasured accuracy**: the benchmark
still carries no human labels under its protocol. The one accuracy figure in
this release — 86% precision on the critical rule across all 31 critical
findings on the frozen benchmark — was produced by a single non-blind reader
and is recorded as exactly that, not as calibration.

## What changed since v0.1.1

Detection, each measured against the frozen 152-workflow benchmark and
recorded in `CHANGELOG.md`:

- Actor and provenance guards (owner, same-repository PR, trusted
  `author_association`, literal login) suppress untrusted-reachability
  findings. Removed 5 critical findings on correctly hardened workflows.
- Agent actions are presumed to ingest the triggering event's content without
  a `${{ }}` expansion. The flagship rule went from 3 to 32 critical findings;
  flagged and clean repository counts did not move.
- Hosted agent-dispatch HTTP endpoints are recognized; plain inference
  endpoints deliberately are not.
- The OpenHands organization rename no longer disables detection.
- Status-only conditions (`always()`, `!cancelled()`) are complete and
  non-narrowing, without the `true`-substitution trap.

Distribution and operations:

- `Dockerfile` (node:24-alpine, unprivileged user, 57 MB, no install step).
- `.pre-commit-hooks.yaml`.
- `docs/OPERATIONS.md` — the handbook for running, releasing, and extending
  the tool without the original author.
- README rewritten around the current state, with the zizmor comparison on
  identical inputs and the TaintAWI prior art cited.

Engineering:

- CLI exposes an in-process `run()`; version read from `package.json`.
- Coverage floor (90/90/90/80) enforced in `pnpm check` and in CI.
- CI audit step distinguishes an unreachable advisory endpoint from a
  vulnerable lockfile and retries only the former; a daily scheduled audit
  catches new advisories against an unchanged lockfile.
- Tests: 112 → 168 across 22 files.

## Pre-release required

- [ ] `pnpm check` passes at the release commit, including the coverage floor.
- [ ] `pnpm audit --audit-level high` (via `scripts/audit-dependencies.mjs`)
      reports clean.
- [ ] `pnpm package:smoke` runs the packed Action and CLI outside the repo.
- [ ] `node scripts/verify-action-manifest.mjs` passes.
- [ ] Committed `dist/` matches a fresh build.
- [ ] `examples/vulnerable` reports 9 findings (2 critical, 4 high, 3 medium);
      `examples/hardened` reports 0.
- [ ] The container builds and scans both examples with the CLI's exit-code
      contract intact.
- [ ] Frozen benchmark: critical 30 across 28 repositories, high 44, medium
      184; 36-case adversarial corpus unchanged.
- [ ] `CHANGELOG.md` has a dated `## [0.2.0]` block consolidated to one
      Added / Changed / Fixed each.
- [ ] `.github/workflows/published-tag-smoke.yml` targets `v0.2.0`.
- [ ] README Action and pre-commit examples pin `v0.2.0`.
- [ ] Hosted CI passed the exact release commit on `main`.

## Published Action sequence

- [ ] Create the annotated immutable `v0.2.0` tag at the release commit.
- [ ] Publish the matching GitHub release to trigger
      `.github/workflows/published-tag-smoke.yml`.
- [ ] Verify the published `David-Wu1119/agentci-guard@v0.2.0` consumer smoke
      passed vulnerable, hardened, and threshold behavior.
- [ ] **Only after that smoke passes**, move the floating `v0` tag to the
      `v0.2.0` commit and verify both remote tags peel to it.

## npm sequence is separately gated

- [ ] Publish `agentci-guard@0.2.0` only with separate operator authorization.
      The operator's npm account is not logged in on the release machine; this
      is a human step.
- [ ] Dispatch `.github/workflows/published-npm-smoke.yml` at the `v0.2.0` ref
      and verify the installed CLI in an empty consumer project.

Until published, `npx agentci-guard` resolves to `0.1.0` on npm, which predates
every fix in this release and in v0.1.1. The README says so.

## Post-release calibration milestones

Unchanged from v0.1.1, and still the boundary on what may be claimed:

- [ ] A human-label protocol that truthfully matches the available annotators.
- [ ] Completed labels without consulting predictions.
- [ ] Published per-rule precision, recall, F1, support, and intervals.
- [ ] README and data card updated with the measured result.

The single-reader 86% figure on the critical rule does not satisfy these. It is
reproducible from the benchmark and the changelog, and it is the strongest
truthful statement available. "Calibrated" and "production security gate"
remain prohibited.

## Local verification

```bash
pnpm install --frozen-lockfile
pnpm check
node scripts/audit-dependencies.mjs --level high
pnpm package:smoke
node scripts/verify-action-manifest.mjs
docker build -t agentci-guard . && docker run --rm -v "$PWD/examples/vulnerable:/scan:ro" agentci-guard scan . --fail-on none
```
