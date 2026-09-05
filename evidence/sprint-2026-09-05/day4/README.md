# Day 4 — frozen installable candidate

## Candidate identities

| | v0.5.0 | v0.5.1 |
| --- | --- | --- |
| Release commit | `38aae8895538a1a511256853c09e208f38a27d3a` (PR #31 squash) | see `v0.5.1.md` in this directory |
| Tag | `v0.5.0` (annotated, immutable) | `v0.5.1` |
| Tarball | `agentci-guard-0.5.0.tgz` | `agentci-guard-0.5.1.tgz` |
| Tarball SHA-256 | `f2d0495666318ece50c9512eea1343630447f554ba2edc53d9e0bd70b7220f36` | in `v0.5.1.md` |
| Package smoke at the release commit | `package-smoke-record.json` — 8 checks, working tree clean | `package-smoke-record-v0.5.1.json` |
| Consumer smoke (published Action at the exact tag) | success — run [33983589969](https://github.com/David-Wu1119/agentci-guard/actions/runs/33983589969) | in `v0.5.1.md` |
| `v0` moved to this commit | yes, after the smoke passed (`git ls-remote` showed `v0^{}` = `v0.5.0^{}` = `38aae88`) | superseded by v0.5.1 once its smoke passes |
| Detector | frozen for Day 5 | **identical** to v0.5.0 — packaging fix only |
| npm registry publication | **pending** (human-authorized step; registry serves an older version) | pending |

Packaging success and registry publication are distinct facts: the tarball was
packed, verified, attached to the GitHub release, and installed from a clean
prefix; nothing was published to npm.

## Why there are two candidates

The Day 5 spot check ran the v0.5.0 release tarball from macOS `/tmp`, a
symlink, and the CLI produced no output and exited 0. Root cause: `dist/cli.js`
compared `import.meta.url` (symlink-resolved by Node) with `process.argv[1]`
(unresolved) to decide whether it was the main script. Every `npm install -g`
bin entry is a symlink, so **the CLI install route README gave for v0.5.0 was a
silent no-op** (`agentci --version` printed nothing; confirmed with
`npm install -g --prefix <tmp> <tarball>`). The Action route (`dist/action.js`)
has no such guard and was unaffected — the consumer smoke passed.

The fix (PR #32, v0.5.1) resolves the argv path with `realpathSync`, is
unit-tested with a symlinked file and against the committed bundle through a
symlink, and `pnpm package:smoke` now installs the tarball globally into a
temporary prefix and runs the bin shim. It changes no detector code, so the
detector frozen for Day 5 is the same code in both versions; the twelve Day 5
results were produced by v0.5.0 run through its real path and stand.

Sequence lesson recorded in the v0.5.1 commit history: a version bump must be
followed by `pnpm build` before `pnpm check`, because the test suite runs
before the build step and the new dist-version test reads the committed bundle.

## Installation routes for a reviewer

- Action: `uses: David-Wu1119/agentci-guard@v0.5.1` (immutable tag) or the
  release commit SHA. Report-only first trial: `fail-on: none`; diagnostics
  remain visible through outputs, the `::warning::` annotation, and SARIF.
- CLI: `npm install -g https://github.com/David-Wu1119/agentci-guard/releases/download/v0.5.1/agentci-guard-0.5.1.tgz`,
  then `agentci --version` (must print `0.5.1`) and
  `agentci scan . --fail-on none`. Verify the SHA-256 against the record.

## What the package smoke verifies from the extracted tarball (no `node_modules`, fixtures outside the checkout)

1. Packed CLI `--version` equals the packed `package.json` version.
2. Action on `examples/vulnerable`: 9-finding SARIF, `analysis-complete=true`.
3. CLI on `examples/hardened`: 0 findings, complete.
4. Day 2: a step-level actor gate on `pull_request_target` is not critical.
5. Day 2: the same workflow without the gate is critical.
6. Day 3: text report says `Analysis: incomplete (1 diagnostic(s))`.
7. Day 3: SARIF `invocations[0].executionSuccessful === false` with one notification.
8. Day 3: Action exits 0 at `fail-on: none`, sets `analysis-complete=false`, prints `::warning::`, writes the step summary.
9. (v0.5.1) `npm install -g` bin shim prints the version.
10. (v0.5.1) the bin shim scans and prints JSON.

Check 4 originally also asserted `analysis_complete === true` and failed: the
gate condition trips the documented `analysis-event-condition` diagnostic. That
assertion was dropped and the observation recorded below rather than changing
the detector.

## Observation recorded, not fixed: completeness diagnostics are mostly noise

`event-condition-audit.md` and `event-condition-audit.mjs` (run against the
v0.5.0 bundle on the frozen benchmark): 283 conditions the event parser could
not reduce, **198 (70%) reference no event at all** — `steps.x.outputs.… !=
'true'`, `inputs.upload-artifacts`, and the like — so they cannot change which
events reach a step, yet each marks the scan incomplete. 86 of 152 cases carry
the diagnostic; 27 are "incomplete" for that reason alone. The Day 3 warning
therefore fires on most real agent workflows. Changing this is a
detector-contract change and waits for the next candidate; it is problem #1 in
`docs/REVIEW_READY.md`.
