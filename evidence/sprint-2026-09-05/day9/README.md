# Day 9 (2026-09-09) — Docker registry regression introduced by v0.6.1, and report identity

Review: the follow-up verification of v0.6.1 (reviewer's evidence at `/Users/davidwu/Downloads/AgentCI-Guard-v0.6.1-Review-Evidence-2026-09-09.json`). Two items, both mine.

## 1. Regression: registries named without a dot

v0.6.1's registry-stripping expression required a dot in the host, so a container-image agent from `registry:5000`, `localhost:5000`, or `localhost` was no longer recognized — v0.6.0 recognized it. Reproduced on the shipped v0.6.1 bundle before the fix:

| `uses:` reference | v0.6.0 | v0.6.1 | v0.6.2 |
| --- | --- | --- | --- |
| `docker://registry:5000/all-hands-ai/openhands:0.9` | agent | **not an agent** | agent |
| `docker://localhost:5000/all-hands-ai/openhands:0.9` | agent | **not an agent** | agent |
| `docker://localhost/all-hands-ai/openhands` | agent | **not an agent** | agent |
| `docker://ghcr.io/all-hands-ai/openhands:0.9` | agent | agent | agent |
| `docker://all-hands-ai/openhands:0.9` | agent | agent | agent |
| `docker://registry:5000/not-all-hands-ai/openhands:0.9` | agent (owner defect) | not an agent | not an agent |
| `not-google-github-actions/run-gemini-cli@v0` | agent (owner defect) | not an agent | not an agent |

Fix (`src/detect.ts`, 5 lines): the registry component follows Docker's documented rule — the first path segment is a registry when it contains a dot or a colon or is `localhost`. Owner identity stays exact behind any registry form.

Tests first, genuinely: `regression-before-fix.txt` runs the new cases in `tests/precision.test.ts` against the v0.6.1 matcher (`git show origin/main:src/detect.ts` swapped in) — 1 failed on `docker://registry:5000/…`; `regression-after-fix.txt` — all pass. (An earlier attempt in this session inserted no tests because the edit anchor had been re-wrapped by the formatter; that run was discarded and is not the record.) `reviewer-fixtures-after-fix.txt` probes the reviewer's references on the new bundle.

## 2. Report identity

The Day 8 behavior report's metadata recorded base commit `de1eb2e` with 21 uncommitted changes, which does not identify the scanned implementation. `scripts/benchmark/report-behavior.mjs` now records the SHA-256 of `dist/cli.js` in each report's metadata and prints both hashes in the comparison header. `behavior-diff.md` here: 0 of 152 cases changed against the Day 8 report; the after-side bundle hash is recorded, the before-side reads "not recorded" because that report predates the field. `v0.6.2.md` (after release) adds a report run at the clean release commit.

Artifact hashes for the comparison the reviewer made independently (their evidence file agrees):

| Artifact | SHA-256 |
| --- | --- |
| `agentci-guard-0.6.0.tgz` | `e1d56ca2026655b40a05acfaf9f764c49bf55ded447937b05aefd52d0399d23e` |
| `agentci-guard-0.6.1.tgz` | `2a54e4222ada56dde128a21e852b15c2d5c96ec3c3e599a381d53c74a91a5f81` |
| `dist/cli.js` at the v0.6.2 patch commit | `8fb4ed58d60670ef4b52bd968b96373cf1302c970bda56e5ce710ee0aa480edc` |
| `agentci-guard-0.6.2.tgz` | `ca28b0e2f6ac02324817564c860fa571cede8e70413cf56f860b22e3447cbcf2` |

## Gates (`check.txt`)

`pnpm check` exit 0 — 238 tests, coverage 94.12 / 88.32 / 95.04 / 96.65. Package smoke 10 checks. Holdout audit identical to v0.6.1 (`holdout-audit.txt`: 8 workflows containing 13 agent usages, 6 covered by an unresolvable reusable-workflow diagnostic, 2 expected negatives; corrected 2026-09-09 after review — the earlier sentence said "8 agent usages"). Benchmark 0 of 152 (no snapshot uses a `docker://` agent image, so the benchmark could not have caught this regression; the regression test is the evidence).

## Candidate identity

Detector changed → v0.6.2. Time spent: about 30 minutes of the 60 allowed.
