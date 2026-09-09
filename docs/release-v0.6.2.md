# v0.6.2 Release Gate

v0.6.2 repairs a regression v0.6.1 introduced: container-image agents from a
registry named without a dot (`registry:5000`, `localhost:5000`, `localhost`)
were no longer recognized. The registry component now follows Docker's rule
(dot, colon, or `localhost` in the first path segment). Owner identity stays
exact. Detector changed → new candidate identity; no benchmark case moves.

## Pre-release required

- [ ] `pnpm check` passes at the release commit, including the coverage floor.
- [ ] `node scripts/audit-dependencies.mjs --level high` reports clean.
- [ ] `pnpm package:smoke` (10 checks) and `node scripts/verify-action-manifest.mjs`
      pass; committed `dist/` matches a fresh build (bump, build, then check).
- [ ] New regressions fail on `7e84598` and pass here (registry forms in
      `tests/precision.test.ts`); prefixed owners still rejected behind any
      registry form.
- [ ] Frozen benchmark behavioral diff against v0.6.1 recorded with both
      `dist/cli.js` hashes: 0 of 152.
- [ ] `CHANGELOG.md` has a dated `## [0.6.2]` block; both published smokes and
      the README pins target `v0.6.2` / `0.6.2`.
- [ ] Hosted CI passed the exact release commit on `main`.

## Published Action sequence

- [ ] Annotated immutable `v0.6.2` tag at the release commit; GitHub release
      with `agentci-guard-0.6.2.tgz` and its SHA-256 attached.
- [ ] Consumer smoke against `David-Wu1119/agentci-guard@v0.6.2` passes;
      **only then** move `v0` and verify both remote tags peel to it.

## npm sequence is separately gated

- [ ] Publish `agentci-guard@0.6.2` only with separate operator authorization;
      until then publication is **pending** (the registry serves 0.1.0).
