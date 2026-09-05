# Day 5 — developer spot check on unseen workflows: pre-registered protocol

Written 2026-09-05 **before any candidate workflow was searched for, opened,
or scanned.** The git commit that introduces this file is the timestamp. What
this exercise is: a small, targeted, descriptive check by the developer, with
judgments written down before the scanner runs. What it is not: independent
validation, a prevalence estimate, an accuracy figure, or a replacement for
the labeling protocol in `BENCHMARK.md` (seven-day washout, timing records),
which it does not complete. No precision, recall, F1, or calibration will be
headlined from it.

## Candidate under test

`agentci-guard-0.5.0.tgz` as recorded in `../day4/package-smoke-record.json`
(SHA-256 in that file), run from the extracted tarball with
`node dist/cli.js scan <snapshot> --json --fail-on none`. The detector is
frozen at v0.5.0 for this exercise; if a detector change lands before the
scan step, this exercise restarts with a new candidate identity and these
cases become development material.

## Sample

Target twelve workflow files, one per repository, in three groups of four:

- **G1 Claude** — the workflow uses `anthropics/claude-code-action` (any
  ref) or `anthropics/claude-code-base-action`.
- **G2 other agent** — the workflow uses one of, cycling in this order so the
  group is not one vendor: `openai/codex-action`,
  `google-github-actions/run-gemini-cli`, an OpenHands action
  (`All-Hands-AI/openhands` or `openhands/*`), then the cycle repeats.
- **G3 control** — ordinary CI: the workflow references none of the agent
  action, CLI, or API patterns in `src/detect.ts`. Controls exist so the
  exercise can expose false positives, not only misses.

If a group cannot be filled within the six-hour timebox, the shortfall is
reported as the actual count; nothing is substituted across groups.

## Source and selection order

GitHub code search REST API (`GET /search/code`), authenticated as the
developer, `sort=indexed`, `order=desc`, `per_page=100`, queries:

- G1: `"anthropics/claude-code-action" path:.github/workflows`
- G2a: `"openai/codex-action" path:.github/workflows`
- G2b: `"google-github-actions/run-gemini-cli" path:.github/workflows`
- G2c: `"All-Hands-AI/openhands" path:.github/workflows`
- G3: `"actions/setup-node" "npm test" path:.github/workflows`

Results are walked **in the order the API returns them**, and the first
eligible result is taken, then the next, until the group is full. The API
response order at collection time is recorded verbatim (`search-results/`),
so the walk is auditable even though the index changes over time.

## Eligibility (mechanical, applied in this order; first failure is the recorded reason)

1. Repository is not in `benchmark/manifest.json` (any of the 152 cases), not
   in `corpus/adversarial/`, and not `David-Wu1119/agentci-guard`.
2. Repository is not already selected in this exercise (one workflow per
   repository, across all groups).
3. Repository is not archived and not a fork (GitHub repository metadata).
4. Path is directly under `.github/workflows/` with a `.yml`/`.yaml` suffix.
5. File is fetchable from the default branch's head commit at collection time
   and is at most 200 KB.
6. File parses as YAML with a top-level `jobs` mapping (otherwise it is not a
   workflow the tool analyzes).
7. Group membership check by regular expression on the raw text, without
   reading it: G1 must match `anthropics/claude-code-(base-)?action`; G2 must
   match its cycle's pattern; G3 must match **none** of the agent patterns.

Regular-expression checks are eligibility mechanics, not judgment; the
developer does not open a file until the sample is closed.

## Provenance recorded per case

Repository, path, default branch, head commit SHA at collection, raw URL
pinned to that SHA, SHA-256 of the content, byte size, group, search rank in
the recorded response, collection timestamp. Snapshots live in
`snapshots/<case>/.github/workflows/<file>` so the candidate is run on the
same layout it expects. `manifest.json` holds the table.

## Pre-scan judgments

After the sample is closed and before the candidate is run, the developer
reads each file and records, per job that contains an agent (and for controls,
per job): whether an agent is present; and for each of
`agentci/untrusted-ai-write-token`, `agentci/gated-ai-write-token`, and
`agentci/pull-request-target-ai`, a verdict of **positive**, **negative**, or
**indeterminate** with the evidence lines and a one-sentence reason. Reasons
cite the rule predicates in `RULES.md` and `docs/analysis-model.md`. The
judgments are committed (`judgments.md`) before the first scan; the commit
hash is the proof of order. Elapsed reading time is recorded.

## Scan and reconciliation

One run of the frozen candidate per snapshot, output kept verbatim in
`results/<case>.json`. Reconciliation (`reconciliation.md`) lists, per case
and per job: the pre-scan verdict, the scanner's finding set for the three
rules, diagnostics, and a classification — agree, scanner-only (possible false
positive), judgment-only (possible miss), or indeterminate — with an
adjudication note. Original judgments are never edited; adjudication is
appended. Counts are reported with denominators. Any correction the exercise
motivates is follow-up work and cannot be reported as success on this set.

## Independent review

None is scheduled. This is recorded as **independent review pending**. A
second AI identity is not an independent human annotator and will not be used
as one.
