# v0.5.0 Release Gate

v0.5.0 is the sprint candidate: the version a reviewer outside this checkout
is asked to run. It carries two behavior changes over v0.4.0, each with a
regression test written before the fix and a recorded benchmark diff.

- `agentci/pull-request-target-ai` honors a recognized actor gate on the agent
  step, not only on the job, as `docs/analysis-model.md` had already claimed.
  Eight counterexamples pin what is and is not a gate. Frozen benchmark: 0 of
  152 cases changed.
- Analysis completeness travels through every output. SARIF runs carry an
  `invocation` (`executionSuccessful` = `analysis_complete`, one notification
  per diagnostic); the organization report replaces "Repositories clean" with
  five categories that sum to the scanned count; the Action prints a
  `::warning::` and a step-summary note when it did not finish. Exit codes are
  unchanged. Frozen benchmark: 0 of 152 cases changed.

Detection is otherwise identical to v0.4.0, and so is the accuracy boundary:
experimental scanner, unmeasured accuracy, benchmark is development data.

The detector and rule contract are **frozen at this version for the Day 5 spot
check.** A later detector change requires a new candidate identity, and the
Day 5 cases then become development material.

## Pre-release required

- [ ] `pnpm check` passes at the release commit, including the coverage floor.
- [ ] `node scripts/audit-dependencies.mjs --level high` reports clean.
- [ ] `pnpm package:smoke` passes, including the v0.5.0 checks: packed
      `--version` equals `package.json`, step-gated `pull_request_target` is
      not critical from the packed CLI, and an incomplete scan is visible in
      the packed CLI's text and SARIF and the packed Action's outputs, log, and
      step summary. `node scripts/verify-action-manifest.mjs` passes;
      committed `dist/` matches a fresh build.
- [ ] `examples/vulnerable` 9 findings (2 critical); `examples/hardened` 0.
- [ ] Frozen benchmark: critical 6 across 4 repositories, high 68, medium 184,
      total 258; 38-case adversarial corpus green.
- [ ] `CHANGELOG.md` has a dated `## [0.5.0]` block.
- [ ] Both published smokes and the README pins target `v0.5.0` / `0.5.0`.
- [ ] Hosted CI passed the exact release commit on `main`.

## Published Action sequence

- [ ] Annotated immutable `v0.5.0` tag at the release commit.
- [ ] GitHub release published with the verified tarball
      `agentci-guard-0.5.0.tgz` and its SHA-256 attached, triggering
      `published-tag-smoke.yml`.
- [ ] Consumer smoke against `David-Wu1119/agentci-guard@v0.5.0` passes.
- [ ] **Only after that smoke passes**, move `v0` to the `v0.5.0` commit and
      verify both remote tags peel to it.

## Installation routes for reviewers

Two routes resolve to the tested candidate; both are recorded in
`evidence/sprint-2026-09-05/day4/`:

- Action: `uses: David-Wu1119/agentci-guard@v0.5.0` (immutable tag), or the
  release commit SHA.
- CLI: `npm install -g <release asset URL>/agentci-guard-0.5.0.tgz`, then
  verify the SHA-256 against the record.

## npm sequence is separately gated

- [ ] Publish `agentci-guard@0.5.0` only with separate operator authorization.
      Until then, publication is **pending** and the registry serves an older
      version; route trials to the tarball above.
- [ ] Dispatch `published-npm-smoke.yml` at the `v0.5.0` ref after publishing.

## Local verification

```bash
pnpm install --frozen-lockfile
pnpm check
node scripts/audit-dependencies.mjs --level high
pnpm package:smoke
node scripts/verify-action-manifest.mjs
```
