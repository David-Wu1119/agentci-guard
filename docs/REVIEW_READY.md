# Review index — sprint of 2026-09-05, revised after external review

Entry point for reviewing the work done against the six-day roadmap and the
corrective patch that followed the external review of 2026-09-05. Every link
is repository-relative. Where a claim rests on a command, the command and its
recorded output are linked; where evidence is missing, it says pending.

## Status, separated

| Completed (implementation)                                                                            | Pending (human, owner's)                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roadmap fixes 1–3 with tests written first; benchmark diffs recorded                                  | Human review of spot-check cases u-02, u-06, u-08 (append to [`reconciliation.md`](../evidence/sprint-2026-09-05/day5/reconciliation.md) without editing the original judgments) |
| Packaging defect (CLI symlink no-op) fixed, v0.5.1                                                    | Sending the five evaluation invitations ([drafts](../evidence/sprint-2026-09-05/invitations/README.md)); log records **zero sent, zero responses**                               |
| External review findings 1–3 fixed, v0.6.0                                                            | Observing one external installation and recording accepted/rejected findings                                                                                                     |
| Automated, predictions-hidden spot check on 12 unseen workflows                                       | Independent (human) review of that spot check                                                                                                                                    |
| Releases v0.5.0, v0.5.1, v0.6.0 with attached verified tarballs; `v0` moved after each consumer smoke | npm registry publication (registry serves 0.1.0)                                                                                                                                 |

The sprint's engineering is closed. Its human-evidence half is not, and no
statement here should be read as customer or market evidence.

## Identity

|                                     |                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roadmap starting commit             | `5b99fb5c571f4601a40a69af97a68eb7f5abae4a` (v0.4.0)                                                                                                                                                                                                                                                                                    |
| Commit the external review examined | `ccf125b5c1fe5c6555cf67cbb515525fe55db2fa`                                                                                                                                                                                                                                                                                             |
| Final commit                        | the `main` commit that squash-merges the evidence pull request from branch `evidence/day7-v0.6.0` (its SHA is in the review message); it differs from the v0.6.0 release commit only in `evidence/` and `docs/REVIEW_READY.md`                                                                                                         |
| Working tree at final commit        | clean — [`day7/final-checks.txt`](../evidence/sprint-2026-09-05/day7/final-checks.txt)                                                                                                                                                                                                                                                 |
| Candidate artifact                  | `agentci-guard-0.6.0.tgz`, SHA-256 `e1d56ca2026655b40a05acfaf9f764c49bf55ded447937b05aefd52d0399d23e`, release commit `8af758a9779a46e04b3da8e557f067cb6e9d9b3b`, tag `v0.6.0` — [identity](../evidence/sprint-2026-09-05/day7/v0.6.0.md), [package-smoke record](../evidence/sprint-2026-09-05/day7/package-smoke-record-v0.6.0.json) |
| Detector                            | v0.6.0 recognizes the Gemini CLI action; otherwise identical to v0.5.x. New candidate identity: Day 5 case u-06 is development material from v0.6.0                                                                                                                                                                                    |
| Registry                            | npm publication **pending**; the tarball attached to the GitHub release is the CLI route                                                                                                                                                                                                                                               |

Baseline reproduced before any change: [`baseline/`](../evidence/sprint-2026-09-05/baseline/) — five gates with exit statuses and the per-case behavioral report of the frozen benchmark (152/152 scanned; critical 6 / high 68 / medium 184; completeness quadrant 14 / 44 / 63 / 31). The external review re-ran the same numbers at `ccf125b` and got the same values.

## Corrected behaviors — the roadmap's three

### 1. `pull-request-target-ai` ignored a step-level actor gate (Day 2, PR #29)

`docs/analysis-model.md` said actor-gated jobs **and steps** do not raise the four untrusted-reachability findings; the rule consulted only the job gate, so an agent step guarded by `github.actor == github.repository_owner` on `pull_request_target` was reported critical.

- Fix: [`src/scanner.ts`](../src/scanner.ts) records each AI step's effective gate (job or step); the rule fires only if some agent step is reachable with neither.
- Regression written first: [`tests/prt-step-gate.test.ts`](../tests/prt-step-gate.test.ts) (8 cases) — [2 failed before](../evidence/sprint-2026-09-05/day2/regression-before-fix.txt), [8 pass after](../evidence/sprint-2026-09-05/day2/regression-after-fix.txt). Counterexamples: unguarded step, job gate, step gate, gated+ungated agents in one job, `||` widening, runtime step-output condition, unsafe checkout before a gated agent (checkout still reported), read-only job (still critical).
- Benchmark effect: [0 of 152 cases changed](../evidence/sprint-2026-09-05/day2/behavior-diff.md); [why](../evidence/sprint-2026-09-05/day2/README.md).
- Contract wording: [`RULES.md`](../RULES.md), [`docs/analysis-model.md`](../docs/analysis-model.md).

### 2. SARIF for an incomplete scan carried only `tool` and `results` (Day 3, PR #30)

- Fix: [`src/sarif.ts`](../src/sarif.ts) `toSarif` accepts a whole scan result and emits `invocations[0].executionSuccessful` (= `analysis_complete`) with one `toolExecutionNotification` per diagnostic plus `agentci/analysisComplete` and `agentci/diagnosticCount` run properties; CLI (`scan`, `org`) and Action write this form; a bare findings array still works and claims nothing. [`src/action-runner.ts`](../src/action-runner.ts) additionally prints `::warning::` and a step-summary note when incomplete; exit codes unchanged.
- Regression written first: [`tests/completeness.test.ts`](../tests/completeness.test.ts) — [7 of 8 failed before](../evidence/sprint-2026-09-05/day3/regression-before-fix.txt), [all pass after](../evidence/sprint-2026-09-05/day3/regression-after-fix.txt); schema validation of the incomplete form in [`tests/sarif-schema.test.ts`](../tests/sarif-schema.test.ts) and on a real benchmark case ([`sample-ai-001.sarif`](../evidence/sprint-2026-09-05/day3/sample-ai-001.sarif)).
- Benchmark effect: [0 of 152 cases changed](../evidence/sprint-2026-09-05/day3/behavior-diff.md).

### 3. The organization report counted incomplete zero-finding repositories as "clean" (Day 3, PR #30)

- Fix: [`src/org.ts`](../src/org.ts) adds `categories` — complete/incomplete × with/without findings, plus no-workflows — summing to `scanned_count` (skipped repositories outside), and repository-prefixed `diagnostics`; the report table replaces "Repositories clean" with the five categories.
- Regression written first: two cases in [`tests/org.test.ts`](../tests/org.test.ts) with a five-repository fake organization covering each category plus a fetch failure and an archived skip.

## Additional defects found and fixed after the roadmap's three

### Packaging: the CLI was a silent no-op through any symlink, including `npm install -g` (found Day 5; PR #32; v0.5.1)

`dist/cli.js` compared `import.meta.url` (symlink-resolved) with `process.argv[1]` (unresolved); on mismatch it loaded, did nothing, exited 0. **Affected range: v0.2.0 through v0.5.0** — the guard entered in `bb76b6b` (2026-09-03); v0.1.0 and v0.1.1 call `main()` unconditionally and are not affected (range corrected after review). Fix: [`src/cli.ts`](../src/cli.ts) `isInvokedAsScript` resolves the argv path with `realpathSync`; same in [`scripts/audit-dependencies.mjs`](../scripts/audit-dependencies.mjs). Regression: [`tests/cli-entry.test.ts`](../tests/cli-entry.test.ts) (fails on the v0.5.0 bundle); [`scripts/verify-standalone-package.mjs`](../scripts/verify-standalone-package.mjs) installs the tarball with `npm install -g --prefix <tmp>` and runs the bin shim. Records: [`day5/results/_scan-note.md`](../evidence/sprint-2026-09-05/day5/results/_scan-note.md), [`day4/README.md`](../evidence/sprint-2026-09-05/day4/README.md).

### External review findings 1–3 (2026-09-05; PR #34; v0.6.0) — [`day7/`](../evidence/sprint-2026-09-05/day7/)

| Finding                                                                                                 | Before (`ccf125b`)                                                                  | After                                                                                                                                 | Test                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — `agentci org` with a workflow that fails to parse                                                   | exit 0 at `--fail-on none` and at the default                                       | exit 1 at both; reports still written                                                                                                 | [`tests/org.test.ts`](../tests/org.test.ts) "exits 1 on a parse error …" (2 cases)                                                                                 |
| 2 — repository fetch fails (HTTP 5xx)                                                                   | JSON keeps the reason, but `diagnostics: 0`; SARIF `toolExecutionNotifications: []` | `agentci/org-fetch-failed` error diagnostic naming repository and reason, carried into SARIF; archived/fork skips stay non-diagnostic | "records a fetch failure as an error diagnostic …"                                                                                                                 |
| 3 — `google-github-actions/run-gemini-cli` receiving `github.event.comment.body` with `contents: write` | no agent, no findings, `analysis_complete: true`                                    | agent recognized; `untrusted-ai-write-token`, `untrusted-input-in-prompt`, `ai-with-secrets`, `broad-write-permissions`               | [`tests/agent-gemini.test.ts`](../tests/agent-gemini.test.ts) (7 cases incl. five vendor lookalikes that stay negative); corpus `gemini-write`, `gemini-lookalike` |

[9 new cases failed on `ccf125b`](../evidence/sprint-2026-09-05/day7/regression-before-fix.txt); [all pass after](../evidence/sprint-2026-09-05/day7/regression-after-fix.txt). Reviewer's reproductions re-run: [`review-reproductions-after-fix.txt`](../evidence/sprint-2026-09-05/day7/review-reproductions-after-fix.txt). Benchmark: [0 of 152 changed](../evidence/sprint-2026-09-05/day7/behavior-diff.md). Holdout audit: [14 of 16 report an agent, 2 documented expected negatives](../evidence/sprint-2026-09-05/day7/holdout-audit.txt). Gemini semantics read from the upstream `action.yml`; rationale in [`day7/README.md`](../evidence/sprint-2026-09-05/day7/README.md).

### Intentional public API and CLI changes (v0.4.0 → v0.6.0)

- `toSarif(findings)` still works; `toSarif(scanResult)` is the preferred form (additive).
- `OrgScanResult` gains `diagnostics` and `categories` (additive); fetch failures appear in `diagnostics` as `agentci/org-fetch-failed`. The organization Markdown table's rows changed: "Repositories clean" is gone.
- `agentci org` exits 1 on any error diagnostic (parse failure, fetch failure) at every `--fail-on`, as `scan` and the Action already did for parse failures.
- Text report says `Analysis: incomplete (…)` instead of `partial (…)`.
- The Action prints `::warning::` and appends to `GITHUB_STEP_SUMMARY` when the analysis is incomplete. Exit codes unchanged.
- The CLI runs when invoked through a symlink.
- Detector: the Gemini CLI action (exact repositories) is an agent action.
- Versions 0.5.0, 0.5.1, 0.6.0; README pins and both published smokes follow.

## Commands and their recorded outputs

| Command                                            | Purpose                                                                               | Output                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                       | format, types, tests + coverage floor, build, licenses, baseline, benchmark integrity | [`day7/final-checks.txt`](../evidence/sprint-2026-09-05/day7/final-checks.txt); earlier [`day6/final-checks.txt`](../evidence/sprint-2026-09-05/day6/final-checks.txt)                                                                                                                                                   |
| `node scripts/audit-dependencies.mjs --level high` | dependency advisories                                                                 | same files                                                                                                                                                                                                                                                                                                               |
| `pnpm benchmark:smoke`                             | annotation toolchain                                                                  | same files                                                                                                                                                                                                                                                                                                               |
| `pnpm package:smoke`                               | packed artifact, 10 checks incl. npm -g shim                                          | same files; per-release records in [`day4/`](../evidence/sprint-2026-09-05/day4/) and [`day7/`](../evidence/sprint-2026-09-05/day7/)                                                                                                                                                                                     |
| `node scripts/verify-action-manifest.mjs`          | Action manifest                                                                       | same files                                                                                                                                                                                                                                                                                                               |
| `pnpm benchmark:behavior` / `--compare`            | per-case behavioral report and diff                                                   | [`baseline/behavior/`](../evidence/sprint-2026-09-05/baseline/behavior/), [`day2/behavior-diff.md`](../evidence/sprint-2026-09-05/day2/behavior-diff.md), [`day3/behavior-diff.md`](../evidence/sprint-2026-09-05/day3/behavior-diff.md), [`day7/behavior-diff.md`](../evidence/sprint-2026-09-05/day7/behavior-diff.md) |

Tool introduced for this: [`scripts/benchmark/report-behavior.mjs`](../scripts/benchmark/report-behavior.mjs) (documented in [`docs/OPERATIONS.md`](../docs/OPERATIONS.md)).

## Spot check — automated, predictions hidden beforehand; not a human review

[`day5/`](../evidence/sprint-2026-09-05/day5/): [protocol](../evidence/sprint-2026-09-05/day5/PROTOCOL.md) (committed before searching), [deviations](../evidence/sprint-2026-09-05/day5/DEVIATIONS.md) (collection run 1 voided), [manifest](../evidence/sprint-2026-09-05/day5/manifest.json) (12 cases: 4 Claude, 4 other agent, 4 controls; provenance per case), [judgments](../evidence/sprint-2026-09-05/day5/judgments.md) (committed before the scan; the reader is the AI operator, elapsed 3 min 01 s), [outputs](../evidence/sprint-2026-09-05/day5/results/) (unedited), [reconciliation](../evidence/sprint-2026-09-05/day5/reconciliation.md) with a post-review addendum.

Counts with denominators: 36 rule-verdict slots; 35 agree, 1 indeterminate (agent inside a remote reusable workflow; scanner said incomplete), 0 scanner-only, 0 judgment-only. **Only 2 slots were judged positive** (`gated-ai-write-token` on canvas-lms, `pull-request-target-ai` on pgcli) and **none `untrusted-ai-write-token`**, so the agreement figure says little about missed vulnerabilities and is not an accuracy headline. Agent presence disagreed on 2 of 12: the Gemini action (now detected in v0.6.0 — u-06 is development material from there) and a remote reusable callee (documented limit). Controls 4/4 clean. Completed 12 of 12. **Human review of u-02, u-06, u-08: pending (owner). Independent review: pending.**

## External evaluation

Pending. Five targeted invitations were drafted ([`invitations/README.md`](../evidence/sprint-2026-09-05/invitations/README.md)); **none has been sent** — sending is the owner's act. No installation by an outside party has been observed. The external review of 2026-09-05 was an engineering review, not a user evaluation.

## Remaining problems, in priority order (three)

1. **Completeness diagnostics need presentation work, not suppression.** `analysis-event-condition` marks 94 of 152 benchmark cases and 7 of 12 spot-check cases incomplete, mostly for trigger-phrase and runtime-output conditions, so the Day 3 warning fires on most real agent workflows. The Day 4 idea of suppressing event-free conditions was shown unsound by the review (indirect dependence via `env`/step outputs) and is retracted in [`day4/event-condition-audit.md`](../evidence/sprint-2026-09-05/day4/event-condition-audit.md). Options: aggregate/present these diagnostics distinctly from structural incompleteness, or implement a scoped dependency analysis with its own tests.
2. **Accuracy remains unmeasured.** The benchmark's evaluation split is development data, its annotation registry predates the ninth rule ([`BENCHMARK.md`](../BENCHMARK.md)), the spot check is descriptive and now partly development material (u-06). Any accuracy claim needs a fresh sealed sample with the labeling protocol's washout and timing, and human annotators.
3. **`pull_request_target` checkout of `refs/pull/N/merge` yields a diagnostic, not a finding.** Spot-check case u-08 checks out the PR merge ref under `pull_request_target` before running an agent; the scanner emitted `analysis-checkout-protection-unknown` rather than `unsafe-checkout`. The rule's predicate should decide that shape explicitly (positive or negative, with a corpus case) instead of leaving it as uncertainty.

## One résumé bullet (justified by the evidence above)

> Built and shipped a static analyzer for prompt-injection reachability in GitHub Actions workflows that run AI coding agents (TypeScript; GitHub Action, CLI, SARIF, org-wide audit); maintained a frozen 152-workflow behavioral benchmark and a 40-case adversarial corpus; ran a pre-registered spot check that surfaced a silent-no-op packaging defect before release, and closed an external engineering review's three findings with regression tests in one bounded patch.

Not claimed: accuracy figures, production-gate status, users, revenue, human validation.
