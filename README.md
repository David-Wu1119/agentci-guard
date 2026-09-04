# AgentCI Guard

[![npm](https://img.shields.io/npm/v/agentci-guard)](https://www.npmjs.com/package/agentci-guard) [![CI](https://github.com/David-Wu1119/agentci-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/David-Wu1119/agentci-guard/actions/workflows/ci.yml) [![license: MIT](https://img.shields.io/npm/l/agentci-guard)](LICENSE)

AgentCI Guard is a static analyzer for GitHub Actions workflows that answers
one question before a workflow runs: **can text a stranger controls reach an
AI coding agent that holds a write token or secrets?**

Teams now run Claude Code, Codex, Gemini CLI, OpenHands, and Cursor inside
Actions to triage issues, review pull requests, and push fixes. Those agents
read issue and comment text through their own tokens, and they hold
credentials. That makes the prompt the payload: a stranger opens an issue, the
agent reads it, and the agent has `contents: write`. AgentCI Guard reads the
workflow YAML and reports when that chain can close. It ships as a GitHub
Action, a CLI, a container image, and a pre-commit hook, and it emits SARIF so
findings land in GitHub's security tab.

![AgentCI Guard scanning a vulnerable workflow](docs/demo.gif)

## Status, honestly

This is an **experimental scanner with unmeasured accuracy.** Its frozen
152-workflow benchmark has no human labels yet, so there is no precision,
recall, or F1 figure to quote, and findings should be treated as review
hypotheses rather than a production merge gate.

What has been measured: every critical finding on that benchmark was read by
hand during development, and four detection defects were found and fixed that
way — over-firing on correctly hardened workflows, a flagship rule that caught
roughly 3% of what it should, blindness to agents dispatched over HTTP, and a
rule silently disabled by a vendor rename. Each is recorded with its measured
effect in [`CHANGELOG.md`](CHANGELOG.md). A 36-case adversarial corpus is
frozen and has overruled two proposed changes; both times it was right.

On the same 152 workflows, [zizmor](https://github.com/zizmorcore/zizmor)
1.30.0 flags 146 repositories to this tool's 77 and covers classes this tool
does not model. This tool raises a top-severity finding on 8 repositories where
zizmor reports nothing equivalent, all of them agent reachability. Run both.

The academic treatment of this vulnerability class is Wang et al.,
[_Demystifying and Detecting Agentic Workflow Injection Vulnerabilities in
GitHub Actions_](https://arxiv.org/abs/2605.07135), whose taint analysis
covers 13,392 workflows with confirmed exploitability. If you need a
production-grade detector, start there.

## What it detects

Eight rules, one threat model — the full contract is in [`RULES.md`](RULES.md)
and the reasoning in [`THREAT_MODEL.md`](THREAT_MODEL.md).

| Rule                        | Severity | Fires when                                                                                    |
| --------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `untrusted-ai-write-token`  | critical | Untrusted event content reaches an agent in a job holding a sensitive write scope             |
| `pull-request-target-ai`    | critical | An agent is reachable on `pull_request_target`, which runs in base-repo context with secrets  |
| `untrusted-input-in-prompt` | high     | Attacker-controlled context is interpolated into an agent's prompt or inputs                  |
| `ai-shell-access`           | high     | The agent step can execute shell commands                                                     |
| `unsafe-checkout`           | high     | Untrusted PR head code is checked out without GitHub's built-in protection                    |
| `ai-with-secrets`           | medium   | An agent job's environment references a secret — baseline exposure, not a vulnerability alone |
| `broad-write-permissions`   | medium   | The job holds write scopes wider than its purpose needs                                       |
| `unpinned-ai-action`        | medium   | The agent action is referenced by tag rather than commit SHA                                  |

Two things the reachability model understands that a trigger-only check would
not: a job gated to the repository owner, to same-repository pull requests, or
to a trusted `author_association` is **not** reachable by a stranger and is not
flagged; and an agent _action_ reads the triggering event's content itself, so
it is flagged even when no `${{ }}` expression appears in the workflow. A
`contains(github.event.comment.body, '@claude')` check is a trigger phrase, not
an actor gate — anyone can type it. Details in
[`docs/analysis-model.md`](docs/analysis-model.md).

## Run it

### GitHub Action

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
      # Pin an immutable release tag. The floating `v0` is moved to each
      # release only after its published-Action smoke passes.
      - uses: David-Wu1119/agentci-guard@v0.3.0
        with:
          path: .
          sarif: agentci-results.sarif
          fail-on: high
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: agentci-results.sarif
```

The Action sets `findings`, `critical`, `high`, `medium`, `low`, `sarif-path`,
`diagnostics`, and `analysis-complete` as outputs:

```yaml
- uses: David-Wu1119/agentci-guard@v0.3.0
  id: agentci
  with:
    fail-on: none
- if: steps.agentci.outputs.critical != '0'
  run: echo "::warning::${{ steps.agentci.outputs.critical }} critical finding(s)"
```

### CLI

```bash
npx agentci-guard scan .            # npm may lag the Action release; see below
npm install -g agentci-guard && agentci scan .

agentci scan . --json
agentci scan . --sarif agentci-results.sarif
agentci scan . --markdown report.md
agentci scan . --fail-on critical
agentci explain agentci/untrusted-ai-write-token
```

Exit codes: `0` nothing at or above `--fail-on` (default `high`); `2` at least
one finding at or above it; `1` scanner error — a parse failure or a bad input.
An incomplete analysis is never reported as a clean one: unsupported constructs
become diagnostics and set `analysis_complete: false`.

### Whole organization

```bash
export GITHUB_TOKEN=ghp_...            # unauthenticated calls are limited to 60/hour
agentci org my-org                      # Markdown report to stdout, exit 2 at high or above
agentci org my-org --markdown org-report.md --sarif org.sarif --fail-on none
agentci org my-org --include-archived --include-forks --json
```

Lists every repository through the GitHub API, fetches each one's workflow files
without cloning, runs the same analysis as `scan`, and produces one report:
totals, a severity-sorted table of repositories, per-repository findings,
skipped repositories with reasons, and which analyses were incomplete. Archived
repositories and forks are skipped unless asked for. A repository that could not
be fetched is listed as skipped and makes the command exit 1, because a report
with holes must not read as clean. This is the deliverable for an audit of an
organization's agent workflows.

### Container

The committed bundle has no runtime dependencies, so the image is Node plus
one file. It runs as the unprivileged `node` user and only needs read access to
the mount.

```bash
docker build -t agentci-guard .
docker run --rm -v "$PWD:/scan:ro" agentci-guard                       # scan . --fail-on high
docker run --rm -v "$PWD:/scan:ro" agentci-guard scan . --json
docker run --rm -v "$PWD:/scan:ro" -v "$PWD/out:/out" agentci-guard \
  scan . --sarif /out/agentci.sarif
```

### pre-commit

```yaml
repos:
  - repo: https://github.com/David-Wu1119/agentci-guard
    rev: v0.3.0
    hooks:
      - id: agentci-guard
```

The hook runs when a file under `.github/workflows/` changes and fails the
commit at `high` or above.

## Example finding

```text
CRITICAL agentci/untrusted-ai-write-token
File: .github/workflows/ai-agent.yml / job: claude
Evidence: AI agent action reachable on an untrusted event reads that event's
          content through its own token + effective write permission

Why:
An attacker can place prompt-injection text in a PR, issue, or comment. If that
text reaches an AI agent with repository write permissions, the agent can be
induced to modify code, comments, workflows, or releases.

Fix:
- Do not run privileged AI agents on untrusted triggers.
- Use read-only GITHUB_TOKEN permissions for untrusted events.
- Require maintainer approval before running the agent.
- Sanitize and summarize untrusted content before passing it to an agent.
```

## Suppressing findings

Two ways to silence a finding you have reviewed and accepted without disabling
the scan.

**Inline, per file** — a standalone column-zero comment in the workflow:

```yaml
# agentci-ignore agentci/unpinned-ai-action -- mirrored internally, reviewed 2026-06
# agentci-ignore-all                          -- silence every rule in this file
```

**Config file** — `agentci.config.json` (or `.agentcirc.json`) in the scanned
path, or `--config <path>`:

```json
{
  "ignore": ["agentci/unpinned-ai-action"],
  "ignorePaths": ["**/generated-*.yml"],
  "defaultPermissions": "read-all"
}
```

`ignore` suppresses a rule everywhere; `ignorePaths` excludes matching
workflow files (`*` within a segment, `**` across). Ignored files are still
parsed. When a workflow omits `permissions`, the effective permission is
reported as `unknown` rather than assumed read-only; set `defaultPermissions`
only when repository or organization policy makes the default explicit.

## What it cannot see

AgentCI Guard reads workflow files. It does not observe prompts, tool calls,
shell commands, network egress, or anything the agent actually did at runtime.
Concretely:

- An agent invoked from a script the workflow calls — `./run.sh`, `make`,
  `python dispatch.py` — is invisible. Inferring it from `pip install` or an
  environment variable would flag configuration as execution.
- Conditions on runtime values (`steps.*`, `needs.*`, `env.*`) cannot be
  resolved. They are kept conservative, which errs toward more findings.
- A runtime permission check that exports an `allowed` output is not trusted
  as an actor gate, because a static reader cannot prove it runs before
  untrusted content is fetched. This is a chosen false positive.
- Remote reusable workflows are reported as unresolvable, not guessed at.
- Agent detection is a maintained list of vendors, actions, CLIs, and dispatch
  endpoints. A new or renamed agent is invisible until a pattern is added.
- `anthropics/claude-code-action` refuses users without write access by
  default, and this is **not modeled**: a bare `@claude` workflow on an
  untrusted trigger is reported critical even though the action itself blocks
  strangers unless `allowed_non_write_users` or `allowed_bots` is set. On the
  frozen benchmark 19 of 24 confirmed critical findings are this shape. Whether
  to report them as high instead is an open severity decision; until it is
  made, treat a critical on a bare `claude-code-action` as "one config line
  from exploitable," not "exploitable now."

For the runtime layer, see
[StepSecurity Harden-Runner](https://github.com/step-security/harden-runner).

## Development and operations

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check            # format, typecheck, tests with coverage floor, build, licenses, baseline, benchmark
pnpm audit --audit-level high
pnpm package:smoke    # packed Action and CLI run outside the repo without node_modules
```

[`docs/OPERATIONS.md`](docs/OPERATIONS.md) is the handbook for running,
releasing, and extending the tool without the original author: what may be
claimed, how to measure a change against the frozen benchmark, the release and
`v0`-tag sequence, and how to add a rule or an agent pattern. Release gates are
in [`docs/`](docs/) as `release-v*.md`.

## Security boundary

AgentCI Guard is a static research prototype. It does not sandbox workflows,
model downloaded third-party actions, or prove that a workflow is safe or
exploitable. Findings are review hypotheses. Parse and incomplete-analysis
conditions are emitted as diagnostics rather than security findings. Report
security issues per [`SECURITY.md`](SECURITY.md).

See also the [adversarial regression corpus](corpus/adversarial/README.md),
the [benchmark protocol](BENCHMARK.md), and the retained
[historical 75-repository scan](docs/real-world-findings.md), which is
exploratory and not accuracy evidence.

## License

MIT. Licenses for dependencies included in the committed bundles are preserved
in [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).
