# v0.6.1 Release Gate

v0.6.1 is a precision patch over v0.6.0 for the one bounded defect the
follow-up review of 2026-09-09 named: the action matcher accepted prefixed
owners (`not-google-github-actions/run-gemini-cli`), for every vendor, because
`\b` treats a hyphen as a word boundary. The matcher now requires the vendor
match at the start of the `uses:` reference. This is a detector change and
therefore a new candidate identity; it moves no benchmark case.

## Pre-release required

- [ ] `pnpm check` passes at the release commit, including the coverage floor.
- [ ] `node scripts/audit-dependencies.mjs --level high` reports clean.
- [ ] `pnpm package:smoke` (10 checks) and `node scripts/verify-action-manifest.mjs`
      pass; committed `dist/` matches a fresh build (bump, build, then check).
- [ ] New regressions fail on `de1eb2e` and pass here: prefixed owners in
      `tests/precision.test.ts` and `tests/agent-gemini.test.ts`; corpus
      `lookalike-prefixed-owner`. Positives retained: tag, SHA, subpath,
      whitespace, `docker://` agent images.
- [ ] Frozen benchmark behavioral diff against v0.6.0 recorded: 0 of 152.
- [ ] `CHANGELOG.md` has a dated `## [0.6.1]` block; both published smokes and
      the README pins target `v0.6.1` / `0.6.1`.
- [ ] Hosted CI passed the exact release commit on `main`.

## Published Action sequence

- [ ] Annotated immutable `v0.6.1` tag at the release commit; GitHub release
      with `agentci-guard-0.6.1.tgz` and its SHA-256 attached.
- [ ] Consumer smoke against `David-Wu1119/agentci-guard@v0.6.1` passes;
      **only then** move `v0` and verify both remote tags peel to it.

## npm sequence is separately gated

- [ ] Publish `agentci-guard@0.6.1` only with separate operator authorization;
      until then publication is **pending** (the registry serves 0.1.0).
