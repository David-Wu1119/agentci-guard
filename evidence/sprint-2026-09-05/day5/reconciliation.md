# Reconciliation — developer spot check, twelve unseen workflows

**What this is:** a developer spot check with predictions written before the
scan. **What it is not:** independent validation, confirmed exploitability, a
prevalence estimate, or an accuracy figure. No precision/recall/F1/calibration
is headlined. Independent review: **pending** (none performed).

## Order of events (all commits on branch `sprint/day5-spot-check`)

| Step | Commit | Time (UTC) |
| --- | --- | --- |
| Protocol pre-registered | `b0b8756` | 18:15:16 |
| Collection run 1 voided, collector fixed (`DEVIATIONS.md`) | `db3533b` | ~18:16 |
| Sample closed (12 cases, unopened) | `2a2ef56` | 18:16:36 |
| Reading began | — | 18:17:21 |
| Judgments committed | `aa43be5` | 18:20:22 |
| First scan attempt: empty output (CLI entry defect, `results/_scan-note.md`) | — | 18:20:23 |
| Rerun via real path, results committed | `24c3cb4` | 18:21:44 |

Elapsed reading and judgment time: **3 min 01 s** for twelve files (about 700
lines). The reader is an AI operator; this is not a human-annotator timing and
must not be used as one.

Candidate: `agentci-guard-0.5.0.tgz`, SHA-256
`f2d0495666318ece50c9512eea1343630447f554ba2edc53d9e0bd70b7220f36`, downloaded
from the v0.5.0 GitHub release and hash-checked against
`../day4/package-smoke-record.json`; `--version` 0.5.0.

## Per-case reconciliation

Columns: pre-scan verdict for UAWT / GATED / PRT → scanner's findings for the
same three rules → classification. "Other" lists scanner findings outside the
three rules (not judged, not counted).

| Case | Group | Agent judged / scanned | UAWT | GATED | PRT | Class | Other findings (scanner) | Diagnostics |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| u-01 remotion | G1 | yes / yes | − → none | − → none | − → none | agree | ai-shell-access, ai-with-secrets, unpinned-ai-action | event-condition |
| u-02 canvas-lms | G1 | yes / yes | − → none | **+ → GATED(claude)** | − → none | agree | ai-with-secrets, broad-write-permissions, unpinned-ai-action | event-condition |
| u-03 shopware | G1 | yes / yes | − → none | − → none | − → none | agree | ai-with-secrets | event-condition |
| u-04 fxsound | G1 | yes / yes | − → none | − → none | − → none | agree | ai-with-secrets, unpinned-ai-action | event-condition |
| u-05 openclaw | G2 | yes / yes | − → none | − → none | − → none | agree | ai-with-secrets | event-condition ×6 |
| u-06 gemini-cli | G2 | **yes / no** | − → none | − → none | − → none | agree on rules; **agent missed** | — | — |
| u-07 TheAgentCompany | G2 | yes (in callee) / no | **indeterminate → none** | − → none | − → none | indeterminate, correctly signaled | — | remote-reusable-workflow, event-condition |
| u-08 pgcli | G2 | yes / yes | − → none | − → none | **+ → PRT(codex-review)** | agree | ai-with-secrets, unpinned-ai-action, untrusted-input-in-prompt | event-condition ×2, checkout-protection-unknown |
| u-09 node-argon2 | G3 | no / no | − → none | − → none | − → none | agree | — | — |
| u-10 react-native-restart | G3 | no / no | − → none | − → none | − → none | agree | — | — |
| u-11 heroku-slugs | G3 | no / no | − → none | − → none | − → none | agree | — | — |
| u-12 Qwen2API | G3 | no / no | − → none | − → none | − → none | agree | — | — |

## Counts (denominators stated)

- Three-rule verdict slots: 36 (12 cases × 3 rules). **Agree: 35.**
  Indeterminate judged, scanner reported nothing and marked the analysis
  incomplete with `analysis-remote-reusable-workflow`: **1** (u-07 UAWT).
  Scanner-only (possible false positive): **0.** Judgment-only (possible miss):
  **0.**
- Positives: GATED 1/1 agreed (u-02), PRT 1/1 agreed (u-08), UAWT 0 judged / 0
  reported.
- Controls: 4/4 with zero findings, analysis complete.
- Agent presence, 12 cases: agree 10; disagree 2 —
  - **u-06:** `google-github-actions/run-gemini-cli` is not in the detector's
    agent patterns (`src/detect.ts` has no Gemini entry at all), so the scanner
    reported no agent. On this file it did not matter (schedule/dispatch
    triggers, no untrusted event), but the same action on `issue_comment` with
    `contents: write` would be missed entirely. **Coverage gap; follow-up work
    under the freeze rule; this case is now development material for that
    change.**
  - **u-07:** the agent lives inside a remote reusable workflow; the scanner
    cannot see it and said so (`analysis_complete: false`, remote-reusable
    diagnostic). This is the model's documented limit behaving as documented.
- Analysis completeness: 7 of 12 incomplete. Substantive: u-07 (remote
  reusable). The other six are `analysis-event-condition` on trigger-phrase
  conditions (`contains(github.event.comment.body, '@claude')`) and runtime
  conditions (`inputs.dry_run`, `steps.*.outcome`) that cannot change which
  *events* reach a step. This reproduces the benchmark observation in
  `../day4/README.md` (198 of 283 such diagnostics on the benchmark come from
  event-free conditions). A consumer of the Day 3 warning will see it on most
  real agent workflows — a noise problem, recorded, not fixed in this
  candidate.

## Adjudication notes

- **u-02.** Positive per predicate and confirmed by the scanner. The job is
  guarded by `github.repository_owner == 'instructure-internal'`, which is
  false in the public `instructure/canvas-lms` repository, so this job never
  runs there. The YAML-only model cannot know the repository's owner; a
  reviewer should treat this finding as "true of the file, moot in this
  repository."
- **u-08.** Positive per predicate and confirmed. The scanner additionally
  raised `untrusted-input-in-prompt` (PR number/SHAs and `$PR_TITLE`/`$PR_BODY`
  in the prompt text) and emitted `analysis-checkout-protection-unknown` for
  the `refs/pull/N/merge` checkout instead of an `unsafe-checkout` finding; the
  judgment had flagged that checkout as the unsafe pattern. Outside the three
  rules; noted for the rule's maintainer.
- **u-04.** The negative is over-determined: the job is both actor-gated and
  read-only, so this case does not test whether the scanner recognized the
  `author_association` gate.

## Incidents during the exercise

1. Collector applied rule 4 case-insensitively; run 1 voided (`DEVIATIONS.md`).
2. The candidate CLI produced no output when invoked through a symlinked path
   (`results/_scan-note.md`). Confirmed on npm's global bin shim. This is a
   v0.5.0 CLI entry defect; the fix, with a regression test, is PR #32 (v0.5.1), which supersedes v0.5.0 as
   the reviewer route. Detection code did not change, so the twelve results stand.

## What this exercise does not license

Nothing here is a calibration claim. Twelve targeted cases with two positives
cannot bound false-positive or false-negative rates. The exercise did its job:
it found one coverage gap (Gemini action), one packaging defect (entry guard),
and reproduced the completeness-noise problem — and it did not contradict any
of the three rules on the cases it covered.
