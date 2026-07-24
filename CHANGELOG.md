# Changelog

All notable changes to AgentCI Guard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Replaced the broken v0.1.0 Action wiring with a dedicated `dist/action.js`
  entrypoint that reads `INPUT_*`, writes SARIF and declared outputs, validates
  inputs, and implements `fail-on` exit behavior.
- CI now executes the real `action.yml` through `uses: ./` and checks vulnerable,
  hardened, and expected-threshold-failure cases.
- Resolved known semantic defects around workflow/job/step environment
  precedence, `run:` shell semantics, event-specific reachability, absent and
  overridden permission defaults, discussion events/permissions, local and
  remote reusable workflows, YAML parse errors, checkout refs, and SARIF lines.

### Added

- Explicit workflow analysis model with parse/incomplete-analysis diagnostics.
- Public synthetic adversarial regression corpus.
- Frozen, licensed, repo-disjoint real-workflow candidate benchmark with fixed
  commits, blob hashes, snapshots, annotation protocol, verification, and metric
  scripts. Accuracy remains unreported until two-human labeling and adjudication
  are complete.
- Reproducible v0.1.0 baseline and historical artifact inventory.

### Changed

- Positioned AgentCI Guard as an experimental AI-workflow linter, not a
  production security gate.
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

[Unreleased]: https://github.com/David-Wu1119/agentci-guard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/David-Wu1119/agentci-guard/releases/tag/v0.1.0
