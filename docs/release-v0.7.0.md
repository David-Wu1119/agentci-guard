# v0.7.0 Release Gate

v0.7.0 ships the 44 source commits merged since v0.6.2 (`7defcb5`). It adds
the opt-in Action `json` output with `json-sha256` and per-path certainty
metadata. It also requires evidence before a write-token finding is drawn
from implicit Issue/PR/comment ingestion. On the frozen 152-case development
benchmark, high findings fall from 68 to 36 and complete scans from 58 to 46
(43 cases change). The detail and its limits are in the `[0.7.0]` changelog
block. No accuracy on human labels has been measured for this behavior.

Owner decisions, 28 October 2026: release from `main`; move `v0` after the
published-Action tag smoke alone; npm publication is a separate, later step.
The Node support floor (`>=20.18.0`, CI on Node 22) is unchanged and still an
open owner decision; Node 20 is not exercised in CI.

## Pre-release required

- [ ] `pnpm check` passes at the release commit, including the coverage floor.
- [ ] `node scripts/audit-dependencies.mjs --level high` reports clean.
- [ ] `pnpm package:smoke` and `node scripts/verify-action-manifest.mjs` pass;
      committed `dist/` matches a fresh build after the version bump.
- [ ] Frozen benchmark behavioral diff against v0.6.2 recorded with both
      `dist/cli.js` hashes (`evidence/release-v0.7.0/`).
- [ ] `CHANGELOG.md` has a dated `## [0.7.0]` block; both published smokes,
      README pins and `REPRODUCIBILITY.md` target `v0.7.0` / `0.7.0`.
- [ ] Hosted CI passed the exact release commit on `main`.

## Published Action sequence

- [ ] Annotated immutable `v0.7.0` tag at the release commit; GitHub release
      with `agentci-guard-0.7.0.tgz` and its SHA-256 attached.
- [ ] Consumer smoke against `David-Wu1119/agentci-guard@v0.7.0` passes. It
      now expects `examples/vulnerable` to report one diagnostic and
      `analysis-complete: false` alongside its 9 findings.
- [ ] **Only then** move `v0` and verify both remote tags peel to the release
      commit.

## npm sequence is separately gated

- [ ] Publish `agentci-guard@0.7.0` only with separate operator authorization;
      until then publication is **pending** (the registry serves 0.1.0).
- [ ] After publication, dispatch `published-npm-smoke.yml` at `v0.7.0`.
