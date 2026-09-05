# Day 7 — corrective patch for the external review of 2026-09-05

Review: `/Users/davidwu/Downloads/AgentCI-Guard-Sprint-Review-2026-09-05.md` (reviewer's copy; David's colleague). Reviewed commit `ccf125b`. This directory records the bounded patch for its three findings and the evidence-wording corrections it asked for. Release identity for the resulting v0.6.0: `v0.6.0.md` (added after the release procedure completes).

## The three findings, reproduced and fixed

`review-reproductions-after-fix.txt` re-runs the reviewer's own reproductions against the patched build (the before-fix run at `ccf125b` printed exit 0 / 0 notifications / no agent, respectively):

| Finding | Before (`ccf125b`) | After |
| --- | --- | --- |
| 1 — `agentci org` on a workflow with `on: [push` (parse error) | exit **0** at `--fail-on none` and at the default | exit **1** at both; Markdown/SARIF/JSON still written; message names the count |
| 2 — repository listing returns HTTP 503 | JSON keeps `fetch failed: …` in the skipped entry, but `diagnostics: 0`, SARIF `toolExecutionNotifications: []` | one `agentci/org-fetch-failed` error diagnostic naming the repository and reason; SARIF carries it; archived/fork skips stay non-diagnostic |
| 3 — `google-github-actions/run-gemini-cli` receiving `github.event.comment.body` with `contents: write` on `issue_comment` | agents 0, findings none, `analysis_complete: true` | agent recognized; `untrusted-ai-write-token`, `untrusted-input-in-prompt`, `ai-with-secrets`, `broad-write-permissions` |

Regressions written first (`regression-before-fix.txt`: 9 failed on `ccf125b`; `regression-after-fix.txt`: all pass):
- `tests/agent-gemini.test.ts` — exact action + archived predecessor recognized; five vendor lookalikes (`auth`, `setup-gcloud`, `deploy-cloudrun`, `run-gemini-cli-docs`, `google-gemini/gemini-cli`) stay negative; risky shape with and without interpolation; schedule/dispatch shape (u-06) raises none of the three privileged-agent rules; read-only; `pull_request_target`; the vendor's non-agent actions scan as ordinary CI.
- `tests/org.test.ts` — parse error exits 1 at `--fail-on none` and at the default; fetch failure becomes an error diagnostic that reaches SARIF; deliberate skips do not. (One Day 3 assertion listing org diagnostics was extended by the new fetch-failure entry — an intended consequence of finding 2, not a weakened test.)
- Corpus: `gemini-write` (risky) and `gemini-lookalike` (negative, `agent_usages: []`) — 40 cases; no existing expectation changed.

Gemini semantics were read from the upstream `action.yml` (main, 2026-09-05): composite action; `prompt` → `--prompt`; `github_issue_number`/`github_pr_number` default to the event payload; `settings` → `.gemini/settings.json` (MCP configuration); no documented write-access gate. Under the project's stated convention (actions are presumed to read the event themselves) it is treated like `openai/codex-action`, not like the self-gating `anthropics/claude-code-action`.

## Gates at the patch commit (`check.txt`)

`pnpm check` exit 0 — 233 tests, coverage 94.12 / 88.32 / 95.04 / 96.64. Package smoke 10 checks. Action manifest verified. Frozen benchmark behavioral diff against the Day 3 report (last detector-identical run): **0 of 152 cases changed** (`behavior-diff.md`) — no snapshot references either Gemini action.

## Holdout audit (`holdout-audit.txt`)

`docs/OPERATIONS.md` "Adding an agent" prescribes running the 16 `holdout-*` cases. 14 report an agent; 2 do not, and both are correct and pre-date this patch (identical under the v0.5.0 tarball):
- `holdout-aider-003` — `pip install aider-chat` and `aider --version` only; the detector's `--version`/`--help` exclusion is deliberate (an installation check is not an execution).
- `holdout-openhands-002` — OpenHands appears only in a YAML comment ("The OpenHands cell mounts the Docker socket"); the invocation is in a runner-side script the analyzer cannot see, a documented limit; the scan is already marked incomplete (event-condition diagnostics).
OPERATIONS now names both as expected negatives so the audit's criterion is unambiguous.

## Not done, on purpose

- No suppression of `analysis-event-condition` diagnostics. The review showed the Day 4 reasoning was unsound (indirect event dependence via `env`/step outputs); `../day4/event-condition-audit.md` is corrected and the item is reframed as presentation/aggregation work or a scoped dependency analysis.
- No new agent families beyond the one the review named.

## Wording corrections applied

- CLI symlink defect range: **v0.2.0 through v0.5.0** (guard introduced in `bb76b6b`, 2026-09-03); v0.1.0/v0.1.1 call `main()` unconditionally and are not affected. Corrected in `CHANGELOG.md` (0.5.1 entry, marked as corrected), `../day4/README.md`, `../day5/reconciliation.md`.
- Spot check: "automated, predictions-hidden spot check by an AI operator" — not a manual human review; only 2 of 36 rule slots were judged positive and none `untrusted-ai-write-token`; u-06 is development material from v0.6.0 (`../day5/reconciliation.md`, addendum).
- Sprint status: implementation complete; **human review of u-02/u-06/u-08, external invitations, external evaluation, npm publication — all pending and the owner's.**
