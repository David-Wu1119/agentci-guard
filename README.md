# AgentCI Guard

AgentCI Guard is a CLI and GitHub Action that detects unsafe AI coding-agent usage in CI/CD workflows.

It focuses on one high-risk pattern: untrusted GitHub event content reaching an AI agent that has secrets, write permissions, shell access, or unsafe checkout behavior.

## What It Detects

- AI-agent usage in `.github/workflows/*.yml`
- `pull_request_target` combined with AI agents
- PR/issue/comment/review/branch/commit content passed into prompts or shell commands
- `contents: write`, `pull-requests: write`, or other broad write scopes near AI usage
- `secrets.*`, `GITHUB_TOKEN`, and token-like environment variables in agent jobs
- shell access combined with AI usage
- unpinned third-party AI actions
- checkout of untrusted PR head code in privileged contexts

## CLI Quickstart

```bash
pnpm add github:David-Wu1119/agentci-guard

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
      - uses: David-Wu1119/agentci-guard@main
        with:
          path: .
          sarif: agentci-results.sarif
          fail-on: high
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: agentci-results.sarif
```

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

## Development

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm build
npm pack --dry-run
```

## Security Boundary

AgentCI Guard is a static scanner. It does not sandbox workflows or prove that an agent is safe. It identifies high-risk patterns that should receive human review before AI agents are allowed to run with privileged CI/CD context.

See [Threat Model](docs/threat-model.md).

## License

MIT
