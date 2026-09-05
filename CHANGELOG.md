# Changelog

All notable changes to AgentCI Guard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  documented runtime-gate limit — 77% precision on the critical rule before
  this fix, 86% after, as measured by a single non-blind reader, not by the
  benchmark's labeling protocol.
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
  corpus reported **59 criticals**; auditing those against well-configured
  repositories exposed three false-positive classes in the tool itself, each
  since fixed:
  1. `id-token: write` was counted as repo-write. OIDC token minting cannot
     modify a repo; only `contents` / `pull-requests` / `issues` / `packages` /
     `deployments` now count toward write scope.
  2. Untrusted content inside an `if:` guard was treated as a prompt sink.
     `if:` conditions are now excluded from sink detection.
  3. `ai-with-secrets` was rated high; nearly every AI action needs a provider
     key, so this is a baseline exposure to review rather than a vulnerability
     on its own. Recalibrated to medium.

  After these fixes: **59 → 13 criticals.**

[Unreleased]: https://github.com/David-Wu1119/agentci-guard/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/David-Wu1119/agentci-guard/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/David-Wu1119/agentci-guard/releases/tag/v0.1.0
