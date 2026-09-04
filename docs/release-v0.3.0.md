# v0.3.0 Release Gate

v0.3.0 adds one capability on top of v0.2.0: `agentci org <login>` scans every
repository in a GitHub organization or user account without cloning and emits
one report. It is the unit an organization audit delivers. Detection is
unchanged from v0.2.0; the filesystem and organization scanners now share one
analysis entry point, and the frozen benchmark's per-case results are identical
before and after that extraction.

The accuracy boundary is unchanged from v0.2.0 and still governs every claim:
experimental scanner, unmeasured accuracy under the labeling protocol, one
non-blind reader's 86% precision on the critical rule, and no modeling of
`claude-code-action`'s default write-access gate. An organization report
inherits all of that; its findings are review hypotheses across more
repositories, not a stronger claim.

## Pre-release required

- [ ] `pnpm check` passes at the release commit, including the coverage floor.
- [ ] `node scripts/audit-dependencies.mjs --level high` reports clean.
- [ ] `pnpm package:smoke`, `node scripts/verify-action-manifest.mjs`, and the
      packed-version check pass; committed `dist/` matches a fresh build.
- [ ] `examples/vulnerable` 9 findings, `examples/hardened` 0.
- [ ] Frozen benchmark unchanged: critical 30 / 28 repositories, high 44,
      medium 184; 36-case adversarial corpus unchanged.
- [ ] `agentci org` runs live against a public account with exit 0 and no
      rate-limit failures.
- [ ] `CHANGELOG.md` has a dated `## [0.3.0]` block.
- [ ] Both published smokes and the README pins target `v0.3.0` / `0.3.0`
      (enforced by `tests/action.test.ts` and `scripts/verify-package.mjs`,
      which read the version from `package.json`).
- [ ] Hosted CI passed the exact release commit on `main`.

## Published Action sequence

- [ ] Annotated immutable `v0.3.0` tag at the release commit.
- [ ] GitHub release published, triggering
      `.github/workflows/published-tag-smoke.yml`.
- [ ] Consumer smoke against `David-Wu1119/agentci-guard@v0.3.0` passes
      vulnerable, hardened, and threshold behavior.
- [ ] **Only after that smoke passes**, move `v0` to the `v0.3.0` commit and
      verify both remote tags peel to it.

## npm sequence is separately gated

- [ ] Publish `agentci-guard@0.3.0` only with separate operator authorization;
      the operator's npm account is not logged in on the release machine.
- [ ] Dispatch `.github/workflows/published-npm-smoke.yml` at the `v0.3.0` ref.

## Local verification

```bash
pnpm install --frozen-lockfile
pnpm check
node scripts/audit-dependencies.mjs --level high
pnpm package:smoke
node scripts/verify-action-manifest.mjs
GITHUB_TOKEN=... node dist/cli.js org <login> --fail-on none
```
