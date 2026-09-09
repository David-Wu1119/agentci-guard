# Day 8 (2026-09-09) — action owner boundary, the follow-up review's one bounded defect

Review: `/Users/davidwu/Downloads/AgentCI-Guard-Next-2-Days-2026-09-05.md`, item 3. Reviewed commit `de1eb2e`; the reviewer's fixture used the owner `not-google-github-actions` and produced a critical finding.

## Root cause and scope

`\b` treats a hyphen as a word boundary, so every entry in `AI_AGENT_ACTION_PATTERNS` that began with `\b` accepted a prefixed owner — not only the two Gemini patterns that claimed exactness. On the shipped v0.6.0 build (`reviewer-fixture-after-fix.txt` shows the same probes after the fix):

| `uses:` reference | v0.6.0 | v0.6.1 |
| --- | --- | --- |
| `not-google-github-actions/run-gemini-cli@v0` | agent | not an agent |
| `not-google-gemini/gemini-cli-action@…` | agent | not an agent |
| `fake-openai/codex-action@v1` | agent | not an agent |
| `not-anthropics/claude-code-action@v1` | agent | not an agent |
| `google-github-actions/run-gemini-cli@v0` | agent | agent |
| `docker://ghcr.io/all-hands-ai/openhands:0.9` | agent | agent |

## Fix (one place, all vendors)

`looksLikeAiAction` (`src/detect.ts`) now requires the vendor pattern to match at the **start** of the trimmed `uses:` reference — a reference names its owner first — after reducing a `docker://registry/owner/image` reference to `owner/image` so an agent shipped as a container image keeps matching (the registry host is recognized by its dot or port; `docker://all-hands-ai/openhands` without a host is left as is). The patterns themselves are unchanged.

## Tests first

`regression-before-fix.txt` on `de1eb2e`: 3 failed (both prefixed Gemini owners; the reviewer's workflow fixture; the class-level prefixed-owner cases for four other vendors). `regression-after-fix.txt`: all pass. Retained positives: tag, SHA, subpath (`OpenHands/extensions/plugins/pr-review@main`), leading whitespace, `docker://` agent images; `docker://oskarstark/php-cs-fixer-ga` stays negative. Corpus gains `lookalike-prefixed-owner` (41 cases; the reviewer's fixture, expected no agent, no findings); no existing expectation changed.

## Gates (`check.txt`)

`pnpm check` exit 0 — 238 tests, coverage 94.12 / 88.32 / 95.04 / 96.65. Package smoke 10 checks; Action manifest verified. Frozen benchmark against v0.6.0: **0 of 152 cases changed** (`behavior-diff.md`) — a pre-check found no `uses:` value in the benchmark or corpus where a pattern matched anywhere but the start. Holdout audit unchanged (`holdout-audit.txt`): per-case agent counts are identical to v0.6.0 — 8 of 16 report an agent usage, 6 are covered by an unresolvable-reusable-workflow diagnostic, and the 2 documented expected negatives remain. (Day 7's "14 of 16 report an agent" counted the audit's OK criterion, which includes the diagnostic route; corrected here.)

## Candidate identity

Detector precision changed → v0.6.1, a new candidate identity (`v0.6.1.md` once released). Time spent on this correction: about 35 minutes of the 60–90 allowed.
