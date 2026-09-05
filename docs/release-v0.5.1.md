# v0.5.1 Release Gate

v0.5.1 is a packaging patch over v0.5.0: the CLI's main-module guard now
resolves symlinks, so a global npm install (whose bin entry is a symlink) and
any symlinked path run the scanner instead of loading it and exiting 0. There
is **no detector or rule-contract change**; for the Day 5 spot check the
frozen detector is the same code in v0.5.0 and v0.5.1. The reviewer install
route moves to this version because v0.5.0's tarball route was the affected
one.

## Pre-release required

- [ ] `pnpm check` passes at the release commit, including the coverage floor.
- [ ] `node scripts/audit-dependencies.mjs --level high` reports clean.
- [ ] `pnpm package:smoke` passes its 10 checks, including the `npm install -g`
      bin-shim checks; `node scripts/verify-action-manifest.mjs` passes;
      committed `dist/` matches a fresh build.
- [ ] `tests/cli-entry.test.ts` fails against the v0.5.0 bundle and passes
      against the rebuilt one (recorded in `evidence/sprint-2026-09-05/day4/`).
- [ ] Frozen benchmark unchanged: critical 6 / high 68 / medium 184.
- [ ] `CHANGELOG.md` has a dated `## [0.5.1]` block; both published smokes and
      the README pins target `v0.5.1` / `0.5.1`.
- [ ] Hosted CI passed the exact release commit on `main`.

## Published Action sequence

- [ ] Annotated immutable `v0.5.1` tag at the release commit.
- [ ] GitHub release with `agentci-guard-0.5.1.tgz` and its SHA-256 attached,
      triggering `published-tag-smoke.yml`.
- [ ] Consumer smoke against `David-Wu1119/agentci-guard@v0.5.1` passes.
- [ ] **Only after that smoke passes**, move `v0` to the `v0.5.1` commit and
      verify both remote tags peel to it.

## npm sequence is separately gated

- [ ] Publish `agentci-guard@0.5.1` only with separate operator authorization;
      until then publication is **pending** and the tarball is the CLI route.
