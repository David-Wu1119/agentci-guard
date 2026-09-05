# v0.6.0 Release Gate

v0.6.0 is the corrective release for the three findings of the external
review dated 2026-09-05 (`evidence/sprint-2026-09-05/day7/`). It changes the
detector — the Gemini CLI action is now recognized — so it is a **new
candidate identity**; the Day 5 spot-check case u-06 is development material
from here on, and any new unseen check must sample fresh cases.

- Finding 1: `agentci org` exits 1 on a workflow parse error at every
  `--fail-on`, matching `scan` and the Action. Error outranks the threshold.
- Finding 2: a repository that could not be fetched is an error diagnostic
  (`agentci/org-fetch-failed`) with repository and reason, carried into SARIF.
- Finding 3: `google-github-actions/run-gemini-cli` and
  `google-gemini/gemini-cli-action` are agent actions (exact names; the
  vendor's other actions stay silent). Corpus 40 cases.

Not changed, deliberately: the `analysis-event-condition` diagnostics. The
review showed the proposed text-based suppression was unsound (indirect event
dependence through `env`/step outputs). Presentation/aggregation or a scoped
dependency analysis is future work.

## Pre-release required

- [ ] `pnpm check` passes at the release commit, including the coverage floor.
- [ ] `node scripts/audit-dependencies.mjs --level high` reports clean.
- [ ] `pnpm package:smoke` (10 checks incl. the `npm install -g` shim) and
      `node scripts/verify-action-manifest.mjs` pass; committed `dist/` matches
      a fresh build (sequence for a bump: build, then check).
- [ ] New regressions fail on `ccf125b` and pass here: `tests/agent-gemini.test.ts`,
      the three review cases in `tests/org.test.ts`, corpus `gemini-write` and
      `gemini-lookalike`.
- [ ] Holdout audit (`docs/OPERATIONS.md`, "Adding an agent"): each
      `benchmark/snapshots/holdout-*` reports an agent usage or an
      unresolvable-workflow diagnostic.
- [ ] Frozen benchmark behavioral diff against v0.5.x recorded; expected 0 of
      152 changed (no snapshot references the Gemini action).
- [ ] `CHANGELOG.md` has a dated `## [0.6.0]` block; both published smokes and
      the README pins target `v0.6.0` / `0.6.0`.
- [ ] Hosted CI passed the exact release commit on `main`.

## Published Action sequence

- [ ] Annotated immutable `v0.6.0` tag at the release commit.
- [ ] GitHub release with `agentci-guard-0.6.0.tgz` and its SHA-256 attached,
      triggering `published-tag-smoke.yml`.
- [ ] Consumer smoke against `David-Wu1119/agentci-guard@v0.6.0` passes.
- [ ] **Only after that smoke passes**, move `v0` to the `v0.6.0` commit and
      verify both remote tags peel to it.

## npm sequence is separately gated

- [ ] Publish `agentci-guard@0.6.0` only with separate operator authorization;
      until then publication is **pending** (the registry serves 0.1.0).
