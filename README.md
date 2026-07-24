# AgentCI Guard

[![npm](https://img.shields.io/npm/v/agentci-guard)](https://www.npmjs.com/package/agentci-guard) [![CI](https://github.com/David-Wu1119/agentci-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/David-Wu1119/agentci-guard/actions/workflows/ci.yml) [![license: MIT](https://img.shields.io/npm/l/agentci-guard)](LICENSE)

AgentCI Guard is an **experimental GitHub Actions workflow linter** for risky
AI coding-agent configurations.

It statically checks whether untrusted GitHub event content can reach an AI
agent with secrets, write permissions, shell capability, or an unsafe checkout.
It is a calibrated research prototype, not a production security gate.

> **Release status:** v0.1.0's JavaScript Action entrypoint is broken. The CLI
> works, but `uses: David-Wu1119/agentci-guard@v0` does not pass manifest inputs
> to it. v0.1.1 fixes the entrypoint and will not be tagged until manifest-based
> CI passes. Do not use v0.1.0 as an Action.

The old 75-repository scan is retained as a
[historical, non-reproducible exploratory result](docs/real-world-findings.md).
It is not accuracy evidence. The new
[real-workflow benchmark](benchmark/README.md) is frozen but has no accuracy
result until two humans independently label and adjudicate it.

![AgentCI Guard scanning a vulnerable workflow](docs/demo.gif)

> Regenerate the demo with `vhs docs/demo.tape` (see [`docs/demo.tape`](docs/demo.tape)). A static version is also at [`docs/demo.svg`](docs/demo.svg).

## What It Detects

- AI-agent usage in `.github/workflows/*.yml`
- `pull_request_target` combined with AI agents
- PR/issue/comment/review/branch/commit content passed into prompts or shell commands
- discussion and discussion-comment content
- `contents: write`, `pull-requests: write`, or other broad write scopes near AI usage
- effective workflow → job → step environment and secret references
- AI CLIs executed through `run:` and explicit Action shell/tool capability
- unpinned third-party AI actions
- checkout of untrusted PR head code in privileged contexts
- local reusable workflows, with incomplete-analysis diagnostics for remote calls
- event-specific job/step reachability and explicit/unknown permission defaults

## CLI Quickstart

```bash
# Run without installing
npx agentci-guard scan .

# Or install globally
npm install -g agentci-guard

agentci scan .
agentci scan . --json
agentci scan . --sarif agentci-results.sarif
agentci explain agentci/untrusted-ai-write-token
```

Exit codes:

- `0`: no findings at or above `--fail-on`
- `2`: at least one finding at or above `--fail-on`
- `1`: scanner error

Default fail threshold is `high`.

## GitHub Action

```yaml
name: agentci-guard
on: [pull_request, push]

permissions:
  contents: read
  security-events: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Available after the v0.1.1 release is published.
      - uses: David-Wu1119/agentci-guard@v0.1.1
        with:
          path: .
          sarif: agentci-results.sarif
          fail-on: high
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: agentci-results.sarif
```

### Outputs

The action sets `findings`, `critical`, `high`, `medium`, `low`,
`sarif-path`, `diagnostics`, and `analysis-complete` so later steps can react:

```yaml
- uses: David-Wu1119/agentci-guard@v0.1.1
  id: agentci
  with:
    fail-on: none
- if: steps.agentci.outputs.critical != '0'
  run: echo "::warning::${{ steps.agentci.outputs.critical }} critical finding(s)"
```

If `agentci.config.json` exists in the scanned path it is picked up automatically (see [Suppressing Findings](#suppressing-findings)).

## Example Finding

```text
CRITICAL agentci/untrusted-ai-write-token
File: .github/workflows/ai-agent.yml / job: claude
Evidence: untrusted trigger + AI usage + write permissions + untrusted GitHub event context

Why:
An attacker can place prompt-injection text in a PR, issue, or comment. If that text reaches an AI agent with repository write permissions, the agent can be induced to modify code, comments, workflows, or releases.

Fix:
- Do not run privileged AI agents on untrusted triggers.
- Use read-only GITHUB_TOKEN permissions for untrusted events.
- Require maintainer approval before running the agent.
- Sanitize and summarize untrusted content before passing it to an agent.
```

## Suppressing Findings

Real workflows sometimes have a finding you've reviewed and accepted. Two ways to silence one without disabling the whole scan:

**Inline (per file)** — add a comment anywhere in the workflow:

```yaml
# agentci-ignore agentci/unpinned-ai-action -- mirrored internally, reviewed 2026-06
# agentci-ignore-all                          -- silence every rule in this file
```

**Config file** — `agentci.config.json` in the scanned path (or pass `--config <path>`):

```json
{
  "ignore": ["agentci/unpinned-ai-action"],
  "ignorePaths": ["**/generated-*.yml"],
  "defaultPermissions": "read-all"
}
```

`ignore` suppresses a rule everywhere; `ignorePaths` excludes matching workflow files (`*` within a path segment, `**` across segments). Ignored files are still parsed — they just don't report findings.

When a workflow omits `permissions`, AgentCI Guard reports the effective
permission as `unknown`; it does not silently assume read-only. Set
`defaultPermissions` to `none`, `read-all`, `write-all`, or a scope map only
when repository or organization policy makes that default explicit.

## Development

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm build
npm pack --dry-run
node scripts/benchmark/verify-snapshot.mjs
```

The exact publication blockers are tracked in the
[v0.1.1 release gate](docs/release-v0.1.1.md).

## Security Boundary

AgentCI Guard is a static research prototype. It does not sandbox workflows,
model downloaded third-party actions, or prove that a workflow is safe or
exploitable. Findings are review hypotheses. Parse and incomplete-analysis
conditions are emitted as diagnostics rather than security findings.

See the [threat model](docs/threat-model.md), the
[static analysis model](docs/analysis-model.md), the
[adversarial regression corpus](corpus/adversarial/README.md), and the
[benchmark protocol](benchmark/README.md).

## License

MIT
