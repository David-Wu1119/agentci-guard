# Review index — sprint of 2026-09-05

This file is the entry point for reviewing the work done against the six-day
roadmap. Every link is repository-relative. Where a claim rests on a command,
the command and its recorded output are linked; where evidence is missing, it
says pending.

## Identity

|                              |                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starting commit              | `5b99fb5c571f4601a40a69af97a68eb7f5abae4a` (v0.4.0)                                                                                                                                                                                                                                                                                                                                               |
| Final commit                 | the `main` commit that squash-merges the evidence pull request from branch `sprint/day5-spot-check` (its SHA is in the review message); it differs from the v0.5.1 release commit `6961311` only in `evidence/`, `docs/REVIEW_READY.md`, and three `.gitignore` lines — verified in [`final-checks.txt`](../evidence/sprint-2026-09-05/day6/final-checks.txt)                                     |
| Working tree at final commit | clean (`git status --short` empty; recorded in [`evidence/sprint-2026-09-05/day6/final-checks.txt`](../evidence/sprint-2026-09-05/day6/final-checks.txt))                                                                                                                                                                                                                                         |
| Candidate artifact           | `agentci-guard-0.5.1.tgz`, SHA-256 `498ad03b588c6a88bed282873bdb9274e7f4e64275f35cb0ce5d8956a6aba3f9`, from release commit `69613119330324346ed215148db7d672b4e2fd69`, tag `v0.5.1` ([identity](../evidence/sprint-2026-09-05/day4/v0.5.1.md)); record: [`evidence/sprint-2026-09-05/day4/package-smoke-record-v0.5.1.json`](../evidence/sprint-2026-09-05/day4/package-smoke-record-v0.5.1.json) |
| Detector                     | frozen at v0.5.0 = v0.5.1 (v0.5.1 changed packaging only)                                                                                                                                                                                                                                                                                                                                         |
| Registry                     | npm publication **pending** (human step); the tarball attached to the GitHub release is the CLI route                                                                                                                                                                                                                                                                                             |

Baseline reproduced before any change: [`evidence/sprint-2026-09-05/baseline/`](../evidence/sprint-2026-09-05/baseline/) — five gates with exit statuses, and the per-case behavioral report of the frozen benchmark (152/152 scanned; critical 6 / high 68 / medium 184; completeness quadrant 14 / 44 / 63 / 31).

## Corrected behaviors

### 1. `pull-request-target-ai` ignored a step-level actor gate (Day 2, PR #29)

`docs/analysis-model.md` said actor-gated jobs **and steps** do not raise the four untrusted-reachability findings; the rule consulted only the job gate, so an agent step guarded by `github.actor == github.repository_owner` on `pull_request_target` was reported critical.

- Fix: [`src/scanner.ts`](../src/scanner.ts) records each AI step's effective gate (job or step) and the rule fires only if some agent step is reachable with neither.
- Regression written first: [`tests/prt-step-gate.test.ts`](../tests/prt-step-gate.test.ts) (8 cases) — [2 failed before](../evidence/sprint-2026-09-05/day2/regression-before-fix.txt), [8 pass after](../evidence/sprint-2026-09-05/day2/regression-after-fix.txt). Counterexamples: unguarded step, job gate, step gate, gated+ungated agents in one job, `||` widening, runtime step-output condition, unsafe checkout before a gated agent (checkout still reported), read-only job (still critical).
- Benchmark effect: [0 of 152 cases changed](../evidence/sprint-2026-09-05/day2/behavior-diff.md); [why](../evidence/sprint-2026-09-05/day2/README.md).
- Contract wording: [`RULES.md`](../RULES.md) ("reachable by an untrusted actor"), [`docs/analysis-model.md`](../docs/analysis-model.md).

### 2. SARIF for an incomplete scan carried only `tool` and `results` — no diagnostic or completeness information (Day 3, PR #30)

A remote reusable workflow produced zero findings and `analysis_complete: false`, and the exported SARIF could not show it.

- Fix: [`src/sarif.ts`](../src/sarif.ts) `toSarif` accepts a whole scan result and emits `invocations[0].executionSuccessful` (= `analysis_complete`) with one `toolExecutionNotification` per diagnostic (code as descriptor, severity as level, file/line as location) plus `agentci/analysisComplete` and `agentci/diagnosticCount` run properties. The CLI (`scan`, `org`) and the Action write this form; a bare findings array still works and claims nothing. [`src/action-runner.ts`](../src/action-runner.ts) additionally prints `::warning::` and a step-summary note when incomplete; exit codes unchanged.
- Regression written first: SARIF and CLI/Action cases in [`tests/completeness.test.ts`](../tests/completeness.test.ts) — [7 of 8 failed before](../evidence/sprint-2026-09-05/day3/regression-before-fix.txt), [all pass after](../evidence/sprint-2026-09-05/day3/regression-after-fix.txt); schema validation of the incomplete form (warning and error notifications) in [`tests/sarif-schema.test.ts`](../tests/sarif-schema.test.ts) and on a real benchmark case ([`sample-ai-001.sarif`](../evidence/sprint-2026-09-05/day3/sample-ai-001.sarif): 3 results, `executionSuccessful: false`, 1 notification).
- Benchmark effect: [0 of 152 cases changed](../evidence/sprint-2026-09-05/day3/behavior-diff.md) (no detection change).

### 3. The organization report counted incomplete zero-finding repositories as "clean" (Day 3, PR #30)

- Fix: [`src/org.ts`](../src/org.ts) adds `categories` — complete/incomplete × with/without findings, plus no-workflows — that sum to `scanned_count` (skipped repositories stay outside), and repository-prefixed `diagnostics`; the report table replaces the single "Repositories clean" row with the five categories and states that only "Complete, no findings" means the analyzer read everything and reported nothing.
- Regression written first: two cases in [`tests/org.test.ts`](../tests/org.test.ts) ("puts every scanned repository in exactly one category", "renders the categories and names the incomplete repositories") with a five-repository fake organization covering each category plus a fetch failure and an archived skip.
- Reference behavior of the same categorization on the benchmark: [`scripts/benchmark/report-behavior.mjs`](../scripts/benchmark/report-behavior.mjs) "Completeness × findings" table (baseline 14 / 44 / 63 / 31, sum 152).

### Additional defect found during the sprint — it invalidated the candidate's CLI route, so it was fixed (PR #32, v0.5.1)

The CLI was a silent no-op through any symlink, including every `npm install -g` bin shim. `dist/cli.js` compared `import.meta.url` (symlink-resolved) with `process.argv[1]` (unresolved); on mismatch it loaded, did nothing, exited 0. The README's CLI install route for v0.5.0 (and earlier) printed nothing. Detector code is untouched, so the Day 5 frozen detector is unchanged.

- Fix: [`src/cli.ts`](../src/cli.ts) `isInvokedAsScript` resolves the argv path with `realpathSync`; same fix in [`scripts/audit-dependencies.mjs`](../scripts/audit-dependencies.mjs).
- Regression: [`tests/cli-entry.test.ts`](../tests/cli-entry.test.ts) — unit cases plus "committed `dist/cli.js` through a symlink prints the package version", which fails on the v0.5.0 bundle and passes after; [`scripts/verify-standalone-package.mjs`](../scripts/verify-standalone-package.mjs) installs the tarball with `npm install -g --prefix <tmp>` and runs the bin shim.
- Discovery record: [`evidence/sprint-2026-09-05/day5/results/_scan-note.md`](../evidence/sprint-2026-09-05/day5/results/_scan-note.md), [`evidence/sprint-2026-09-05/day4/README.md`](../evidence/sprint-2026-09-05/day4/README.md).

### Intentional public API and CLI changes

- `toSarif(findings)` still works; `toSarif(scanResult)` is the new, preferred form (additive).
- `OrgScanResult` gains `diagnostics` and `categories` (additive). The organization Markdown table's rows changed: "Repositories clean" is gone, five category rows and "Repositories skipped" remain.
- Text report line: `Analysis: incomplete (…)` instead of `partial (…)`.
- The Action prints a `::warning::` annotation and appends to `GITHUB_STEP_SUMMARY` when the analysis is incomplete. Exit codes unchanged.
- The CLI now runs when invoked through a symlink (previously exited 0 silently).
- Versions 0.5.0 and 0.5.1; README pins and both published smokes follow.

## Commands and their recorded outputs

| Command                                            | Purpose                                                                               | Output                                                                                                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                       | format, types, tests + coverage floor, build, licenses, baseline, benchmark integrity | [`day6/final-checks.txt`](../evidence/sprint-2026-09-05/day6/final-checks.txt)                                                                                                                                                           |
| `node scripts/audit-dependencies.mjs --level high` | dependency advisories                                                                 | same file                                                                                                                                                                                                                                |
| `pnpm benchmark:smoke`                             | annotation toolchain                                                                  | same file                                                                                                                                                                                                                                |
| `pnpm package:smoke`                               | packed artifact, 10 checks incl. npm -g shim                                          | same file; per-release records in [`day4/`](../evidence/sprint-2026-09-05/day4/)                                                                                                                                                         |
| `node scripts/verify-action-manifest.mjs`          | Action manifest                                                                       | same file                                                                                                                                                                                                                                |
| `pnpm benchmark:behavior` / `--compare`            | per-case behavioral report and diff                                                   | [`baseline/behavior/`](../evidence/sprint-2026-09-05/baseline/behavior/), [`day2/behavior-diff.md`](../evidence/sprint-2026-09-05/day2/behavior-diff.md), [`day3/behavior-diff.md`](../evidence/sprint-2026-09-05/day3/behavior-diff.md) |

Tool introduced for this: [`scripts/benchmark/report-behavior.mjs`](../scripts/benchmark/report-behavior.mjs) (documented in [`docs/OPERATIONS.md`](../docs/OPERATIONS.md)).

## Spot check (developer, predictions hidden beforehand — not independent validation)

[`evidence/sprint-2026-09-05/day5/`](../evidence/sprint-2026-09-05/day5/): [protocol](../evidence/sprint-2026-09-05/day5/PROTOCOL.md) (committed before searching), [deviations](../evidence/sprint-2026-09-05/day5/DEVIATIONS.md) (collection run 1 voided), [manifest](../evidence/sprint-2026-09-05/day5/manifest.json) (12 cases: 4 Claude, 4 other agent, 4 controls; provenance per case), [judgments](../evidence/sprint-2026-09-05/day5/judgments.md) (committed before the scan), [outputs](../evidence/sprint-2026-09-05/day5/results/) (unedited), [reconciliation](../evidence/sprint-2026-09-05/day5/reconciliation.md).

Counts: 36 rule-verdict slots, 35 agree, 1 indeterminate (agent inside a remote reusable workflow; scanner said incomplete), 0 scanner-only, 0 judgment-only. Positives agreed: `gated-ai-write-token` on canvas-lms, `pull-request-target-ai` on pgcli. Controls 4/4 clean. Agent presence disagreed on 2 of 12: Gemini action not in the detector (gap), remote reusable callee (documented limit). Completed count 12 of 12; no shortfall. Independent review: pending.

## External evaluation

Pending. Five targeted invitations were drafted ([`evidence/sprint-2026-09-05/invitations/README.md`](../evidence/sprint-2026-09-05/invitations/README.md)); **none has been sent** — sending is the project owner's act, and the log records zero sent, zero responses. No installation by an outside party has been observed. External adoption: pending.

## Remaining problems, in priority order (three)

1. **Completeness diagnostics are mostly noise.** `analysis-event-condition` fires on any condition the event grammar cannot reduce; 198 of 283 on the benchmark reference no event at all, and 7 of 12 spot-check cases read "incomplete" for trigger-phrase or runtime-output conditions. The Day 3 warning therefore fires on most real agent workflows. Fixing it changes the contract → next candidate. [Audit](../evidence/sprint-2026-09-05/day4/event-condition-audit.md).
2. **Gemini action undetected.** [`src/detect.ts`](../src/detect.ts) has no pattern for `google-github-actions/run-gemini-cli`, although README names Gemini CLI. Spot-check case u-06 is development material for that change.
3. **Accuracy remains unmeasured.** The benchmark's evaluation split is development data, its annotation registry predates the ninth rule ([`BENCHMARK.md`](../BENCHMARK.md)), and the spot check is descriptive. Any accuracy claim needs a fresh sealed sample with the labeling protocol's washout and timing.

## One résumé bullet (justified by the evidence above)

> Built and shipped a static analyzer for prompt-injection reachability in GitHub Actions workflows that run AI coding agents (TypeScript; GitHub Action, CLI, SARIF, org-wide audit); maintained a frozen 152-workflow behavioral benchmark and a 38-case adversarial corpus, and used a pre-registered 12-workflow spot check to surface and fix a silent-no-op packaging defect before release.

Not claimed: accuracy figures, production-gate status, users, revenue.
