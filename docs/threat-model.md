# Threat Model

AgentCI Guard scans GitHub Actions workflows for static patterns that make AI coding-agent jobs dangerous.

## In Scope

- GitHub Actions workflow YAML under `.github/workflows/`
- AI action and AI CLI usage
- Untrusted GitHub event fields passed into prompts, environment variables, or shell commands
- Privileged triggers such as `pull_request_target`
- Repository write permissions
- Secret and token exposure
- Shell access and untrusted checkout patterns
- SARIF output for GitHub code scanning

## Out of Scope

- Runtime sandboxing
- Full taint tracking through arbitrary scripts
- GitLab, CircleCI, Buildkite, or other CI systems
- Proving that an LLM did or did not follow a prompt injection
- Secret scanning inside repository contents
- Dynamic analysis of downloaded third-party actions

## Failure Modes

- YAML can call external scripts that hide AI usage from static analysis.
- Wrapper actions can invoke AI agents without obvious names.
- A workflow can be safe despite matching a conservative high-risk pattern.
- A workflow can be unsafe in ways not represented in YAML.

Treat AgentCI Guard as a high-signal review gate, not a formal proof.
