# Threat Model

The canonical v0.1.1 threat boundary is
[`../THREAT_MODEL.md`](../THREAT_MODEL.md). This page is retained for older
links.

AgentCI Guard experimentally scans GitHub Actions workflow YAML for static
patterns that can increase the risk of AI coding-agent jobs.

## In Scope

- GitHub Actions workflow YAML under `.github/workflows/`
- AI action and AI CLI usage
- Untrusted GitHub event fields passed into prompts, environment variables, or shell commands
- Privileged triggers such as `pull_request_target`
- Repository write permissions
- Explicit, absent, and configured permission defaults
- Secret and token exposure
- Shell access and untrusted checkout patterns
- Local reusable workflows and remote-resolution diagnostics
- Event-specific job and step reachability
- SARIF output for GitHub code scanning

## Out of Scope

- Runtime sandboxing
- Full taint tracking through arbitrary scripts
- GitLab, CircleCI, Buildkite, or other CI systems
- Proving that an LLM did or did not follow a prompt injection
- Secret scanning inside repository contents
- Dynamic analysis of downloaded third-party actions
- Resolving remote reusable workflows
- Organization/repository permission defaults unless configured locally
- Action-internal authorization gates unless explicitly modeled

## Failure Modes

- YAML can call external scripts that hide AI usage from static analysis.
- Wrapper actions can invoke AI agents without obvious names.
- A workflow can be safe despite matching a conservative high-risk pattern.
- A workflow can be unsafe in ways not represented in YAML.
- Complex expressions can force conservative event reachability.
- An incomplete-analysis diagnostic means the scanner could not close the
  static-analysis boundary; it is not a security finding.

Treat AgentCI Guard as an experimental review aid, not a security gate or a
formal proof. Its precision and recall remain unreported until the frozen
real-workflow benchmark is independently labeled and adjudicated.
