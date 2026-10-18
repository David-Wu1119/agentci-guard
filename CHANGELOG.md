# Changelog

All notable changes to AgentCI Guard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Opt-in Action JSON now emits `json-sha256`, the Action-computed hash of its
  exact JSON file bytes. The synthetic reusable-workflow CI check compares
  that step output with the file before projecting findings. This detects a
  post-Action JSON swap, not a signed or complete E4 provenance seal.

### Changed

- Documented the instruction-file ingestion blind spot, including the limits
  of `unsafe-checkout` and `analysis_complete=true`. This adds no detection
  or exploit-prevention claim.
- Clarified that the 160-unit candidate pilot is pinned to `38a3272` and
  cannot validate the current scanner's rule semantics. Its frozen contract
  and packet are unchanged; no human labels were created.
- The browser trial lists findings by review severity (critical before high,
  medium, and low), keeping their original order within a severity. The scanner
  result and rule priorities are unchanged.
- Findings and agent uses now distinguish event paths resolved by modeled
  `if` predicates from paths retained only because a predicate is unknown.
  Text, Markdown, SARIF, and the browser show that distinction; the development
  scorer abstains on possible-only paths. A schema-v4 before/after report on
  the fixed 152-workflow development corpus changed 55 case signatures solely
  in certainty metadata (166 findings and 59 agent uses carry possible paths);
  finding identity/counts, agent-use identity/counts, diagnostics, and
  completeness were unchanged. This is not an accuracy measurement or a
  formal-v4 scoring result.
- Implicit Issue/PR/comment ingestion now requires evidence for the exact AI
  Action revision and event path. Unverified Action refs with write capability
  produce `analysis-agent-implicit-ingestion-unknown` instead of a definite
  write-token finding solely from their trigger. Explicit event expressions
  remain analyzable. The high-severity actor-gate downgrade now requires an
  inspected immutable gate for every ingesting step and no other reachable
  path with unresolved implicit ingestion, tool fetch, or CLI input flow.
  Synthetic tests and adversarial fixtures pin these boundaries; accuracy on
  human labels is not yet measured.
  The earlier `f1cdf51` candidate versus clean `5ad017c` changed 51 case
  signatures under the then-current comparison. A fresh schema-v2 comparison
  of published `4369c9e` versus `52d43cc` on the same 152-workflow manifest
  records 90 cases with changed finding/diagnostic identity or completeness;
  the legacy narrower signature reports 54. Schema v2 additionally tracks
  step index, line, severity, and duplicate counts, so these totals must not
  be treated as interchangeable detection counts. Critical findings are
  32→4, high 36→36, medium 180→180, and complete scans 57→48. This is
  coverage/behavior evidence, not proof that removed alerts were false
  positives.

### Fixed

- The development toolchain pins Vite 8.1.6 to address GHSA-587h-7wmj-h5pm;
  the high-severity dependency audit remains enforced.
- CI pins npm 11.16.0 for script-isolated packaging verification instead of
  relying on Node 22's bundled npm 10, which runs `prepare` despite
  `--ignore-scripts`. Existing package tests and Node runtime choices remain.
- The browser render check writes screenshots and its JSON report under the
  actual site directory even when the checkout path contains URL-encoded
  characters; it no longer creates an encoded sibling output directory.
- Standalone package verification rejects malformed or repeated `--record`
  options before invoking npm instead of silently dropping or misreading them.
- Recorded package verification preserves existing receipts and tarballs,
  including symlinks and same-name collisions, and retains the artifact before
  writing a new receipt exclusively.
- Package-smoke Action and CLI runs no longer inherit parent JSON, GitHub
  output or step-summary destinations, avoiding writes outside temporary outputs.
- Synthetic E3 projection rejects duplicate Action finding or agent-usage IDs
  within each collection instead of accepting ambiguous records.
- Synthetic E3 projection rejects malformed registry CSV quoting and preserves
  quoted carriage returns instead of silently repairing an invalid identity.
- Benchmark tools and the four top-level verification scripts resolve checkout
  paths containing spaces, Unicode, `%` or `#` without mistaking URL-encoded
  characters for filesystem names. Frozen registries, snapshots and scanner
  behavior are unchanged; the full Vitest suite does not support `#` paths.
- Blank annotation-registry export rejects empty or zero-unit manifests before
  writing CSV and accepts absolute or repository-root-relative snapshot paths.
- The dependency audit gate rejects malformed responses, failed processes and
  invalid or repeated command options instead of accepting an unreliable result.
- Candidate-pilot test-retest reports retain the frozen source-manifest,
  contract, scanner-commit, source-tree and bundle pins without changing labels.
- Browser empty, oversized, non-workflow, and step-limit YAML errors plus
  file-size/read errors now identify the affected input to assistive technology;
  the error state clears when input changes or a scan succeeds.
- A standalone `toJSON(github.event)` from `issue_comment` now counts as both
  comment and parent Issue/PR text when passed to a local AI CLI, or to a
  verified Anthropic Action's direct prompt or bare environment reference. An unused Action
  environment value, unsupported input, or Boolean use does not count as task
  text. Compound Action prompt expressions and other event containers remain
  outside this narrow fix. A schema-v4 before/after comparison changed 0 of
  152 fixed public development workflows; this is not measured accuracy.
- `pull_request_review_comment` no longer treats nonexistent
  `github.event.review_comment.body` as attacker text. The documented
  `github.event.comment.body` route remains recognized; this is a narrow
  false-positive fix, not a measured accuracy result.
- AI inputs consuming unresolved prior step or cross-job outputs no longer
  report a complete clean analysis. They emit the path-scoped
  `analysis-output-provenance-unknown` diagnostic
  rather than a definite untrusted-input finding; literal first-step/job
  outputs and disjoint event paths remain closed. This also covers an output
  routed through `strategy.matrix` into the AI input. Development scoring now keeps
  that uncertainty off unrelated rules, and keeps hosted-agent capability
  uncertainty off the runner's broad-permissions rule. These are synthetic
  regressions, not a human-label accuracy result. Against the fixed 152-workflow
  public development set at 88e8f59, 11 workflows changed only by 13 added
  output-provenance diagnostics; agent usages stayed at 80, findings at 220,
  and complete scans changed from 48 to 46. No formal v4 sample or human label
  was used for this comparison.
- AI inputs reading a matrix built directly from supported untrusted event text
  now leave analysis incomplete instead of appearing clean. The bounded model
  abstains rather than claiming that matrix expansion proves prompt ingestion.
- Composed local reusable-workflow inputs now carry unresolved caller output
  aliases into AI sink diagnostics; an opaque dynamic input after further
  forwarding also leaves analysis incomplete. These bounded uncertainties also
  follow `GITHUB_ENV` relays to AI steps. Dynamic matrices on reusable caller
  jobs also propagate uncertainty to the callee AI step. Literal inputs remain
  closed.
- For a job's first step on a default Ubuntu shell without startup overrides,
  a single literal `echo "NAME=value" >> "$GITHUB_ENV"` no longer treats unused
  untrusted or secret step environment values as exported to later AI steps.
  Variable expansion, environment dumps, pipelines, file hops, later steps,
  custom shells, and shell-startup overrides remain analysis-incomplete.
  Synthetic regressions cover both sides; the schema-v4
  comparison changed 0 of 152 fixed development workflows (4 critical, 36
  high, 180 medium in both). This is not measured accuracy.
- Write-token findings now partition disjoint trigger events: a critical path on
  one event no longer makes a separately gated event critical, and uncertainty
  on one event no longer erases a proven finding on another. CLI shell-variable,
  pipe, inherited-environment, and earlier `GITHUB_ENV` input paths that cannot
  be proven are marked analysis-incomplete instead of clean. Synthetic
  regressions cover these boundaries. A schema-v4 comparison against `ba3fa61`
  changed 0 of 152 fixed public development workflows (4 critical, 36 high,
  180 medium; 48 complete in both); this is behavior, not accuracy evidence.
- Unverified Anthropic Action discussion-event support now marks matching agent
  uses and findings as possible paths, not confirmed execution. The development
  scorer also keeps that diagnostic from making unrelated step rules unknown.
  Synthetic regressions cover both; the schema-v4 behavioral comparison changed
  0 of 152 public development workflows, with critical/high/medium counts
  unchanged at 4/36/180. This is not a human-label accuracy result.
- Local Action CI now expects the vulnerable fixture's documented incomplete
  scan (one implicit-ingestion diagnostic) instead of incorrectly requiring
  `analysis-complete=true`.
- A vendor-verified unsupported Action event remains visible as a diagnostic but
  no longer makes the whole scan `analysis_complete: false`: that path is
  conclusively closed. Any unresolved diagnostic still marks the scan
  incomplete. This changes completeness/abstention reporting, not measured
  accuracy.
- Development behavioral-report schema v3 keeps the numeric `agent_usages`
  count and adds agent-use identity, so moving one recognized agent step no
  longer disappears from same-count comparisons. Existing schema-v2 reports
  must be regenerated for v3 comparisons, which also reject differing manifest
  hashes; the 90/152 figure above is a v2 behavioral count, not an accuracy
  result.
- Text/Markdown reports and the browser now show job-local step indices for
  findings; the browser also shows them for agent-use steps. Same-line or
  identically named steps therefore remain distinct in those outputs.
  The development behavioral report also preserves step indices and compares
  location/severity changes and duplicate counts. That change introduced
  schema v2, now superseded by v3 above; historical reports must be regenerated
  before comparison. These reports are not accuracy measurements.
- Step-scoped diagnostics now carry `step_index` in JSON, SARIF, text,
  Markdown, and the browser display. The development scorer no longer assigns
  one step's uncertainty to another step in the same job.
  A two-step checkout/Claude regression covers the previous false abstention;
  job-level uncertainty still applies across the job. This corrects scoring
  attribution, not measured accuracy.
- The website now serves its scanner and result renderer from
  content-addressed filenames with Subresource Integrity. Cached HTML can no
  longer silently run newer JavaScript under an older page-source label; if
  an old script is unavailable, scanning stops. The real-browser test confirms
  that tampered scanner bytes are rejected. This does not change scanner rules
  or establish precision or recall.
- The verified Anthropic Action revision `1d6de8c` no longer produces AI
  findings when its configured `track_progress` event/activity is rejected
  before Claude starts, or when a PR path has no prompt and progress tracking
  is off. Caller PR activities are preserved through local reusable workflows.
  Synthetic regressions cover accepted and rejected paths. This does not
  establish implicit-ingestion behavior for mutable or unverified Action refs.
  A scanner-bundle comparison
  against clean `b63ac94` changed 0 of 152 public development workflows
  (critical 32→32, high 36→36, medium 180→180); those counts are behavior, not
  accuracy, and the new pinned-version edge cases are synthetic.
- A `run:` step that launches the `@anthropic-ai/claude-code` package through
  `npx -y` is now recognized as an agent instead of silently returning a
  complete scan with zero agent uses. The synthetic
  `issue_comment`/write-token regression is covered by `tests/cli-run-flow.test.ts`.
- `untrusted-input-in-prompt` now lists only the reachable events that supply
  its matched prompt input, rather than every event of a multi-trigger job.
  `tests/rules.test.ts` covers one-event, multiple-event, and wildcard sources.
  The frozen 152-workflow behavioral comparison from `e4e7fd9` to `f67aad2`
  found **32 → 32 critical, 36 → 36 high, 180 → 180 medium, and 0 of 152 cases
  changed** under its finding/diagnostic/completeness signature; agent-use
  counts also matched for all 152. The report does not compare finding
  `reachable_events`; the synthetic tests cover that metadata correction.
  These counts are scanner behavior, not measured precision or recall.
- Literal `github.event.*` names in prompt text no longer count as GitHub
  expression interpolation. This classifier change has a workflow-level
  regression but has not been remeasured on the human corpus.
- A parent Issue or pull-request author is no longer mistaken for the actor
  who wrote a triggering comment; a re-run initiator is no longer mistaken
  for the original event actor. Explicit parent-object interpolation on
  comment/review events remains flagged even when the commenter is trusted.
  An owner-triggered `pull_request_target` checkout of attacker PR code is
  still unsafe. These fixes do not complete source-provenance analysis for
  Action self-fetching or all event activities.
- Replaced the scanner's fixed `fast-glob` pattern with direct workflow-directory
  enumeration, removing the vulnerable `braces` dependency chain without
  changing the intended one-level `.yml`/`.yaml` discovery contract. Pinned
  patched `source-map-js` and `fast-uri` releases and aligned Vitest with its
  coverage plugin. Directory and symlink behavior is covered by a regression
  test.
- The browser file picker now preserves existing pasted YAML when a selected
  file is too large or cannot be read.

## [0.6.2] - 2026-09-09

### Fixed

- v0.6.1 regressed detection of agents run as container images from a
  registry named without a dot: its registry-stripping expression required a
  dot in the host, so `docker://registry:5000/all-hands-ai/openhands:0.9`,
  `docker://localhost:5000/…`, and `docker://localhost/…` were no longer
  recognized (v0.6.0 recognized them). Found by the 2026-09-09 follow-up
  review's live comparison of the two published tarballs. The registry
  component now follows Docker's rule — the first path segment is a registry
  when it contains a dot or a colon or is `localhost` — and owner identity
  stays exact behind any registry form. Tests in `tests/precision.test.ts`.
  Frozen benchmark: 0 of 152 cases changed (no snapshot uses a `docker://`
  agent image).

### Changed

- `scripts/benchmark/report-behavior.mjs` records the SHA-256 of the
  `dist/cli.js` that scanned, in each report's metadata and in the
  comparison header, so a report identifies the implementation even when the
  working tree was dirty (the Day 8 report had recorded a commit plus 21
  uncommitted changes).

## [0.6.1] - 2026-09-09

### Fixed

- Action owner identity is exact. Every entry in `AI_AGENT_ACTION_PATTERNS`
  that began with `\b` accepted a prefixed owner, because a hyphen is a word
  boundary: `not-google-github-actions/run-gemini-cli`,
  `fake-openai/codex-action`, and `not-anthropics/claude-code-action` all
  matched, and the follow-up review's fixture with the first of these produced
  a critical finding. `looksLikeAiAction` now requires the vendor match at the
  start of the `uses:` reference, for every vendor, after reducing a
  `docker://registry/owner/image` reference to `owner/image` so an agent
  shipped as a container image keeps matching. Tags, SHAs, subpaths, and
  leading whitespace still match. Tests: `tests/precision.test.ts` ("action
  owner identity is exact"), `tests/agent-gemini.test.ts`; corpus case
  `lookalike-prefixed-owner` (41 cases). Frozen benchmark and corpus contain
  no `uses:` value where a pattern matched anywhere but the start, so 0 of 152
  cases changed. Detector matcher behavior changed, so this is a new candidate
  identity.

## [0.6.0] - 2026-09-05

Corrective release for the three findings of the 2026-09-05 external review.
The detector changes (Gemini), so this is a new candidate identity; the Day 5
spot-check case u-06 is development material from this version on.

### Added

- `google-github-actions/run-gemini-cli` and its archived predecessor
  `google-gemini/gemini-cli-action` are recognized as agent actions (review
  finding 3). Before, a workflow handing `github.event.comment.body` to Gemini
  in a job with `contents: write` scanned as no agent, no findings, analysis
  complete. Exact repository names only: the vendor's `auth`, `setup-gcloud`,
  and `deploy-*` actions stay silent (pinned by the new `gemini-lookalike`
  corpus case). Semantics were read from the action's `action.yml`: its
  `github_issue_number`/`github_pr_number` inputs default to the triggering
  event's payload and `settings` configures MCP servers, so it is treated like
  the other agent actions — presumed to operate on the event, no documented
  write-access gate. `tests/agent-gemini.test.ts` covers the risky shape with
  and without interpolation, the schedule/dispatch shape (no privileged-agent
  finding), read-only, `pull_request_target`, and five lookalikes. Corpus grows
  to 40 cases (`gemini-write`, `gemini-lookalike`); no existing expectation
  changed. Frozen benchmark: no snapshot references either action, so 0 of 152
  cases changed.
- Organization scans record a repository that could not be fetched as an
  error diagnostic `agentci/org-fetch-failed` naming the repository and the
  reason, so exported SARIF carries it as a notification instead of an
  unexplained `executionSuccessful: false` (review finding 2). Archived and
  fork exclusions remain skips, not diagnostics.

### Fixed

- `agentci org` exits 1 when any fetched workflow fails to parse, at every
  `--fail-on` value, matching `scan` and the Action (review finding 1). It
  previously checked only fetch failures and finding thresholds, so a malformed
  workflow yielded exit 0 with `analysis_complete: false`. Error outranks the
  finding threshold; the Markdown and SARIF reports are still written.

## [0.5.1] - 2026-09-05

### Fixed

- The CLI ran as a no-op when invoked through a symlink. `dist/cli.js`
  decided whether it was the main script by comparing `import.meta.url`, which
  Node resolves through symlinks, with `process.argv[1]`, which it does not;
  on mismatch the module loaded, did nothing, and exited 0. Every `npm
install -g` bin entry is a symlink, so `agentci --version` and `agentci scan`
  from a global install printed nothing and exited 0 at v0.2.0 through v0.5.0
  (the guard was introduced on 2026-09-03 in `bb76b6b`; v0.1.0 and v0.1.1 call
  `main()` unconditionally and are not affected — range corrected 2026-09-05
  after review). Found on 2026-09-05 when the Day 5 spot check
  ran the release tarball from macOS `/tmp`, itself a symlink. The comparison
  now resolves the argv path with `realpathSync` first (`isInvokedAsScript`,
  unit-tested with a symlinked file and against the committed bundle through a
  symlink), and `pnpm package:smoke` installs the tarball with `npm install -g`
  into a temporary prefix and runs the bin shim. `scripts/audit-dependencies.mjs`
  had the same guard and gets the same fix. Detection code is unchanged; the
  detector remains the one frozen at v0.5.0 for the spot check.

## [0.5.0] - 2026-09-05

### Added

- SARIF output now describes the whole scan, not only its findings. When
  `toSarif` is given a scan result, the run carries an `invocation` whose
  `executionSuccessful` is the scan's `analysis_complete` and whose
  `toolExecutionNotifications` are the diagnostics (one per diagnostic, with
  the diagnostic code as descriptor, its severity as level, and its file and
  line as location), plus `agentci/analysisComplete` and
  `agentci/diagnosticCount` run properties. The CLI (`scan` and `org`) and the
  Action write this form. **Correction (2026-10-12):** An earlier version of
  this note incorrectly said that counting only `results` prevents an
  incomplete zero-finding scan from appearing clean. Such a run has an empty
  `results` array; consumers must inspect `invocations` or the
  `agentci/analysisComplete` run property. Both forms validate against the
  vendored OASIS SARIF 2.1.0 schema. A bare findings array is still accepted
  and then makes no claim about completeness.
- The Action prints a `::warning::` annotation and appends a note to the step
  summary when the analysis is incomplete, naming the diagnostic codes. Exit
  codes are unchanged: warnings do not fail the step; error diagnostics still
  exit 1 and findings at or above `fail-on` still exit 2.
- Organization results carry `diagnostics` (files prefixed by repository, like
  findings) and `categories`: every scanned repository is in exactly one of
  complete-with-findings, complete-no-findings, incomplete-with-findings,
  incomplete-no-findings, or no-workflows, and the five sum to
  `scanned_count`. Skipped repositories stay outside all five.

### Changed

- The organization report's summary table replaces the single "Repositories
  clean" row, which counted incomplete zero-finding repositories as clean,
  with the five categories above and an explicit note that only
  "Complete, no findings" means the analyzer read everything and reported
  nothing.
- The text report says `Analysis: incomplete (N diagnostic(s))` instead of
  `partial`, matching the `analysis_complete` field and the organization
  report's vocabulary.

### Fixed

- `agentci/pull-request-target-ai` now honors a recognized actor/provenance
  gate on the agent step, not only on the job, matching the documented gate
  contract. An agent step guarded by `github.actor == github.repository_owner`
  on `pull_request_target` was reported critical at v0.4.0. Counterexamples
  pinned by `tests/prt-step-gate.test.ts`: an unguarded step, a job-level gate,
  the step-level gate, a job mixing a gated and an ungated agent (still
  critical), an `||` condition that admits untrusted actors (still critical), a
  runtime-output condition the analyzer cannot prove (still critical), an unsafe
  checkout in an earlier unguarded step (still reported; the agent's gate does
  not cover it), and a read-only job with an unguarded agent (still critical —
  `pull_request_target` exposes secrets regardless of token scope). Frozen
  benchmark: 0 of 152 cases changed; no benchmark workflow places an actor gate
  on an agent step under `pull_request_target`.

## [0.4.0] - 2026-09-05

### Changed

- New rule `agentci/gated-ai-write-token` (high). When the untrusted-trigger,
  agent, write-token pattern is present but every ingesting step is
  `anthropics/claude-code-action` with its default write-access gate intact —
  no `allowed_non_write_users` or `allowed_bots`, an event the action's docs
  list as checked, and no untrusted text expanded into a `run:` step — the
  finding is reported at high instead of `untrusted-ai-write-token` at
  critical. `claude-code-base-action`, `pull_request_target`, discussion
  events, any bypass value, and any other agent keep critical. This is a
  severity contract set by the project owner on 2026-09-05 after review of the
  action's security documentation. Frozen benchmark: critical 30 → 6 across
  4 repositories (each carries a bypass, runs on `pull_request_target`, or uses
  an unverified agent — the same four a full hand-read had identified), high
  44 → 68, medium unchanged, total unchanged. The adversarial case
  `local-reusable` is updated to the new contract with its rationale recorded,
  and two cases, `gated-write` and `gated-write-bypass`, pin the boundary from
  both sides.

## [0.3.0] - 2026-09-04

### Added

- `agentci org <login>` scans every repository in a GitHub organization or user
  account without cloning: repositories are listed through the API, each one's
  workflow files are fetched through the contents API, and the same analysis
  `scan` performs runs per repository. Output is one Markdown report — totals, a
  severity-sorted repository table, per-repository findings, skipped
  repositories with reasons, incomplete analyses — plus optional JSON and SARIF
  with files prefixed by repository. Archived repositories and forks are skipped
  unless `--include-archived` / `--include-forks`; a repository that cannot be
  fetched is reported as skipped and exits 1 so a report with gaps never reads
  as clean. Rate-limit exhaustion is reported with the reset time and a pointer
  to `GITHUB_TOKEN`. Local reusable workflows resolve exactly as on disk through
  a virtual repository root. The filesystem scanner and the organization scanner
  now share one analysis entry point, `scanWorkflowFiles`, so a fetched workflow
  is analyzed identically to a checked-out one; the frozen benchmark's per-case
  results are unchanged.

## [0.2.0] - 2026-09-04

### Added

- A `Dockerfile` that packages the committed bundle on `node:24-alpine`, runs
  as the unprivileged `node` user, and needs no install step or network access
  at build time. Verified against both example repositories with the CLI's
  exit-code contract intact.
- A `.pre-commit-hooks.yaml` so the scanner runs on changes under
  `.github/workflows/` and fails the commit at `high` or above.
- `docs/OPERATIONS.md`, a handbook for running, releasing, and extending the
  tool without the original author: what may truthfully be claimed, the full
  verification gate, how to measure a change against the frozen benchmark, the
  release and `v0`-tag sequence, and how to add a rule or an agent pattern.
- The README was rewritten around the current state: the honest status
  paragraph now records the four defects found and fixed by hand-reading the
  benchmark, the zizmor comparison on identical inputs, and the TaintAWI prior
  art; a rule table replaces the feature list; container and pre-commit
  quickstarts were added; and a "what it cannot see" section names the
  coverage floor and the chosen false positives.
- Agent detection now anchors the OpenHands organization and leaves the
  repository open, covering the rename from All-Hands-AI and agents published
  under `extensions` and `software-agent-sdk`. The previous pattern required
  both a legacy org and a repository named `openhands`, so
  `OpenHands/extensions/plugins/pr-review@main` matched nothing: corpus case
  openhands-003 (cloudera/cybersec) produced zero observations on a
  `pull_request`-triggered review agent holding `pull-requests: write` and
  `issues: write`. Eval corpus effect: critical 32 to 33, medium 181 to 184,
  confined to that one case.
- Agent detection now recognizes hosted agent-dispatch HTTP endpoints, a shape
  that uses no action and no local binary. Found by running the frozen
  benchmark's 16 held-out agent-diversity workflows, where two cases invoked a
  coding agent purely over HTTP and produced zero observations, leaving every
  rule inert. Plain inference endpoints are deliberately excluded: a
  `chat/completions` or `messages` call returns text and holds no tools, so it
  cannot reach the repository the way the threat model requires. Eval corpus
  effect: high 38 to 44 and medium 179 to 181, confined entirely to the two
  recovered cases, with critical unchanged.

### Changed

- The CLI now exposes an in-process `run(argv, io, env)` entry that returns the
  exit code instead of setting it, so the command surface is exercised and
  measured by the unit suite rather than only through a spawned `dist/cli.js`.
  Behavior is unchanged: exit 0 clean, 2 at or above threshold, 1 on parse
  errors, bad inputs, or unknown rules. The version string now comes from
  `package.json` instead of a hard-coded literal.
- `pnpm check` now enforces a coverage floor (90% lines, statements, and
  functions; 80% branches) as a ratchet. Tests were added for every product
  surface that had none: the Markdown report, config validation and discovery,
  the reusable-workflow permission ceiling, Action input aliasing and
  validation, and the actor-guard expression parser's quoting and
  parenthesization. 112 tests became 150.

### Fixed

- Actor-gate recognition now accepts a literal login — `github.actor ==
'maintainer'`, the same on `sender.login` and `comment.user.login`, and a
  `contains(fromJSON([...]), github.actor)` allowlist. GitHub resolves the actor
  before the job starts and a stranger cannot be that user, so this is exactly
  as sound as comparing against `github.repository_owner`. Anthropic's workflow
  template ships this shape with the maintainer's own login filled in, and three
  benchmark repositories using it were reported critical, including
  marktext/marktext (~61k stars). Inequality (`!= 'dependabot[bot]'`) and empty
  allowlists are not accepted. Eval corpus effect: critical 33 to 30, confined
  to those three cases. All 31 critical findings on the benchmark were read by
  hand for this change: 24 are confirmed, these 3 were this class, and 4 are the
  documented runtime-gate limit. The historical single-reader, non-blind
  judgments were 24 of 31 findings before this fix and 24 of 28 after it;
  these are not protocol-based precision estimates or public accuracy claims.
- Event reachability now treats a condition made only of `always()`,
  `success()`, `failure()`, and `cancelled()` as complete and non-narrowing.
  These depend on prior step status, never on the trigger, so they cannot
  exclude an event; the analyzer previously reported them as uninterpretable.
  They are not substituted with `true`, which would make `!cancelled()` empty
  the event set. Mixed conditions stay conservative. No finding changes on the
  frozen benchmark; the effect is confined to diagnostics and the
  `analysis_complete` flag.
- `agentci/untrusted-ai-write-token` now recognizes agent actions that read
  event content through their own token instead of through a `${{ }}`
  expansion. The rule previously required interpolation, which missed the
  dominant real-world shape: an agent action on `issue_comment` or `issues`
  holding a write scope, gated only on a trigger phrase any stranger can type.
  Measured against the frozen 152-workflow benchmark, critical findings rise
  from 3 to 32 across 30 repositories, with no change to the 74 flagged
  repositories or the 78 clean ones — existing findings were escalated rather
  than new noise introduced. Three of the recovered cases were hand-verified
  against the upstream workflows. Agent CLI invocations still require
  interpolation, since a `run:` step receives only what the shell passes it.
- Event reachability now recognizes actor and provenance guards, so a job
  restricted to the repository owner, to same-repository pull requests, or to a
  trusted `author_association` no longer raises untrusted-reachability
  findings. Recognition is an implication check: `A && B` is gated when either
  operand is gated, a disjunction only when every operand is. Gates computed by
  workflow code at runtime remain untrusted by design. Measured against the
  frozen 152-workflow benchmark, this removes 2 of 5 critical and 2 of 40 high
  findings, all of them on workflows that were correctly hardened; the 36-case
  adversarial corpus is unchanged.

## [0.1.1] - 2026-07-31

### Fixed

- Replaced the broken v0.1.0 Action wiring with a dedicated `dist/action.js`
  entrypoint that reads `INPUT_*`, writes SARIF and declared outputs, validates
  inputs, and implements `fail-on` exit behavior.
- Bundled every runtime dependency into the committed Action/CLI artifacts and
  added a tarball smoke that executes them without `node_modules`; the earlier
  in-repository smoke could hide external imports.
- CI now executes the real `action.yml` through `uses: ./` and checks vulnerable,
  hardened, and expected-threshold-failure cases.
- Resolved known semantic defects around workflow/job/step environment
  precedence (including untrusted values), `run:` shell semantics,
  event-specific reachability, absent and overridden permission defaults,
  discussion events/permissions, nested local and remote reusable workflows,
  YAML parse errors, current checkout protection, and SARIF lines.
- Restricted agent observations to structured Action targets and executable
  coding-agent CLI commands; provider keys, model names, prose, install
  commands, and version/help checks no longer establish agent execution.
- Reject nonexistent or non-directory scan roots instead of returning a false
  clean result, and create missing parent directories for CLI SARIF and Markdown
  report paths.

### Added

- Explicit workflow analysis model with parse/incomplete-analysis diagnostics.
- Public synthetic adversarial regression corpus.
- Frozen, licensed, repo-disjoint real-workflow candidate benchmark with fixed
  commits, blob hashes, snapshots, a 7,056-unit annotation protocol, independent
  review plan, schema validation, separate agent-detection and rule metrics,
  supported/overall universes, confidence intervals, abstention coverage, and
  generated error analysis. Accuracy remains unreported until human labeling
  and adjudication are complete.
- A non-rule `agent_usages` observation stream with stable job and step
  locations so agent identification can be measured independently.
- Targeted Codex Action, Aider CLI, Cursor Agent CLI, and OpenHands benchmark
  strata. Unlabeled v1/v2 candidates are archived; v2 replaced 15 noncanonical
  mis-cased control paths, and v3 moved 16 inspected diversity cases to
  development and froze 16 unseen replacements before labeling.
- Reproducible v0.1.0 baseline and historical artifact inventory.
- Draft 2020-12 schemas that are compiled and applied to the benchmark manifest
  and any published annotation records in CI.
- Generated license notices for every production dependency included in the
  committed bundles.
- Cross-file label provenance checks, stable adjudicator identities, computed
  Git blob verification, and clean-worktree capture before metric outputs are
  created.

### Changed

- Positioned AgentCI Guard as an experimental AI-workflow linter, not a
  production security gate.
- Separated the functional Action correction from later accuracy calibration:
  v0.1.1 is released with explicit unmeasured-accuracy warnings rather than
  leaving the public major Action tag on the broken v0.1.0 entrypoint.
- Retracted the reproducibility and accuracy implications of the historical
  75-repository exploratory scan. Its raw corpus, fixed commits, and outputs do
  not survive; archived aggregates remain historical only.

## [0.1.0] - 2026-06-22

First public release. AgentCI Guard is a CLI and GitHub Action that detects
unsafe AI coding-agent usage in CI/CD workflows — the high-risk pattern where
untrusted GitHub event content reaches an AI agent that holds secrets, write
permissions, shell access, or performs unsafe checkout.

### Added

- **8-rule scanner** for `.github/workflows/*.yml` covering the AI-agent-in-CI
  threat surface:
  - `agentci/untrusted-ai-write-token` — untrusted trigger content reaches an
    AI agent with repository write permissions.
  - `agentci/pull-request-target-ai` — an AI agent runs on
    `pull_request_target`.
  - `agentci/ai-with-secrets` — an AI-agent job references secrets or
    token-like environment variables.
  - `agentci/untrusted-input-in-prompt` — raw PR, issue, comment, review,
    branch, or commit text is passed into an AI prompt or shell command.
  - `agentci/ai-shell-access` — an AI-agent job has shell or arbitrary command
    access.
  - `agentci/broad-write-permissions` — workflow or job permissions grant
    write scopes near AI usage.
  - `agentci/unpinned-ai-action` — an AI-related third-party action is not
    pinned to a full commit SHA.
  - `agentci/unsafe-checkout` — a privileged workflow checks out untrusted PR
    head code.
- **Precise, signal-based AI-usage detection.** Detection keys on specific
  signals (known AI actions, prompt sinks, untrusted event context) rather than
  generic keyword matching, to avoid over-firing on safe AI-agent setups.
- **Suppression** for reviewed-and-accepted findings, two ways:
  - Inline directives: `# agentci-ignore <rule> -- reason` and
    `# agentci-ignore-all` within a workflow file.
  - Config file: `agentci.config.json` (auto-detected in the scanned path, or
    via `--config <path>`) with `ignore` (rule IDs) and `ignorePaths` (glob
    patterns). Ignored files are still parsed; they just don't report findings.
- **SARIF output** via `--sarif <path>` for upload to GitHub code scanning and
  other SARIF consumers.
- **CLI** (`agentci` / `agentci-guard`) with `scan` and `explain` commands,
  `--json` and `--sarif` outputs, and a configurable `--fail-on` threshold
  (default `high`). Exit codes: `0` (no findings at or above threshold), `2`
  (findings at or above threshold), `1` (scanner error).
- **GitHub Action** (`David-Wu1119/agentci-guard@v0`) on the `node24` runtime,
  with `path`, `sarif`, and `fail-on` inputs and outputs `findings`,
  `critical`, `high`, `medium`, `low`, and `sarif-path` for downstream steps to
  react to. **Known defect discovered after release:** the manifest used
  unsupported JavaScript Action `runs.args`, so v0.1.0 did not actually pass
  inputs or run a scan through `uses:`.
- **Historical real-world findings report** ([`docs/real-world-findings.md`](docs/real-world-findings.md)):
  a scan of 75 public repositories whose workflows reference
  `anthropics/claude-code-action`, found via GitHub code search.
  The raw corpus, fixed commits, and output files were not preserved, so these
  numbers are non-reproducible historical scanner output, not accuracy evidence.
  - Severity totals across the corpus: 13 critical, 69 high, 225 medium, 0 low.
  - Repositories by worst finding (of 75): 8 critical (11%), 32 high (43%),
    35 medium (47%), 0 clean.
  - By rule: `unpinned-ai-action` 90, `ai-with-secrets` 82, `ai-shell-access`
    57, `broad-write-permissions` 53, `untrusted-input-in-prompt` 11,
    `untrusted-ai-write-token` 11, `pull-request-target-ai` 2,
    `unsafe-checkout` 1.
  - Reports aggregates only; no repository is named. Findings flag patterns in
    workflow YAML, not proven exploits — several flagged repos have author-side
    mitigations a static scanner cannot see (output allowlists,
    `author_association` gates, fork checks, SHA-pinned actions). Genuinely
    exploitable cases should be disclosed privately, not published.
- Documentation: README, [threat model](docs/threat-model.md),
  [rules reference](docs/rules.md), and an animated terminal demo.

### Changed

- Recalibrated severities after a self-audit. The first scan of the 75-repo
  corpus reported **59 criticals**; selected workflow inspections exposed two
  detection mistakes and one severity-calibration mistake, later changed:
  1. `id-token: write` was counted as repo-write. OIDC token minting cannot
     modify a repo; only `contents` / `pull-requests` / `issues` / `packages` /
     `deployments` now count toward write scope.
  2. Untrusted content inside an `if:` guard was treated as a prompt sink.
     `if:` conditions are now excluded from sink detection.
  3. `ai-with-secrets` was rated high; nearly every AI action needs a provider
     key, so this is a baseline exposure to review rather than a vulnerability
     on its own. Recalibrated to medium.

  The historical reported critical count changed from **59 to 13**. Raw
  pre/post scan outputs and human labels were not preserved, so this is not a
  measured false-positive reduction.

[Unreleased]: https://github.com/David-Wu1119/agentci-guard/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/David-Wu1119/agentci-guard/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/David-Wu1119/agentci-guard/releases/tag/v0.1.0
