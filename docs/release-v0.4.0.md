# v0.4.0 Release Gate

v0.4.0 is a severity-contract release. It adds `agentci/gated-ai-write-token`
(high): the untrusted-trigger, agent, write-token pattern is reported one level
below critical when the agent is `anthropics/claude-code-action` with its
documented default write-access gate intact, on an event the action's docs say
it checks, with no bypass configured and no untrusted text expanded into a
`run:` step. Everything else that was critical remains critical. Detection
otherwise matches v0.3.0.

The decision was made by the project owner on 2026-09-05 after review of the
action's `docs/security.md`. It is recorded in `docs/analysis-model.md` ("The
agent's own gate"), in `RULES.md`, and in the adversarial corpus, where the
frozen case `local-reusable` is updated with its rationale and two new cases pin
the boundary from both sides.

The accuracy boundary is unchanged: experimental scanner, unmeasured accuracy
under the labeling protocol. What can now truthfully be said is narrower and
stronger than before: on the frozen benchmark, the six findings that remain
critical across four repositories are the same four a full hand-read of all
critical findings had identified as genuine exposures, and the twenty-four that
moved to high are the same twenty-four that hand-read had found mitigated by
the action's default.

## Pre-release required

- [ ] `pnpm check` passes at the release commit, including the coverage floor.
- [ ] `node scripts/audit-dependencies.mjs --level high` reports clean.
- [ ] `pnpm package:smoke`, `node scripts/verify-action-manifest.mjs`, and the
      packed-version check pass; committed `dist/` matches a fresh build.
- [ ] `examples/vulnerable` 9 findings (2 critical: it is on
      `pull_request_target` and pipes PR text into a `run:` step, so the gate
      does not apply); `examples/hardened` 0.
- [ ] Frozen benchmark: critical 6 across 4 repositories, high 68, medium 184,
      total 258; 38-case adversarial corpus green.
- [ ] `CHANGELOG.md` has a dated `## [0.4.0]` block.
- [ ] Both published smokes and the README pins target `v0.4.0` / `0.4.0`.
- [ ] Hosted CI passed the exact release commit on `main`.

## Published Action sequence

- [ ] Annotated immutable `v0.4.0` tag at the release commit.
- [ ] GitHub release published, triggering `published-tag-smoke.yml`.
- [ ] Consumer smoke against `David-Wu1119/agentci-guard@v0.4.0` passes.
- [ ] **Only after that smoke passes**, move `v0` to the `v0.4.0` commit and
      verify both remote tags peel to it.

## npm sequence is separately gated

- [ ] Publish `agentci-guard@0.4.0` only with separate operator authorization.
- [ ] Dispatch `published-npm-smoke.yml` at the `v0.4.0` ref.

## Local verification

```bash
pnpm install --frozen-lockfile
pnpm check
node scripts/audit-dependencies.mjs --level high
pnpm package:smoke
node scripts/verify-action-manifest.mjs
```
