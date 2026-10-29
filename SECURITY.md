# Security Policy

AgentCI Guard is experimental security-adjacent CI tooling, not a production
security control. Do not publish exploit details for unfixed vulnerabilities
in public issues.

## Supported Versions

During the `0.x` research phase, fixes target `main` and the latest GitHub
release (https://github.com/David-Wu1119/agentci-guard/releases/latest). The
npm package `agentci-guard@0.1.0`, a June 2026 prototype, is not supported.
No service-level or security-detection guarantee is provided.

## Reporting a Vulnerability

Report vulnerabilities in AgentCI Guard itself privately through GitHub:
https://github.com/David-Wu1119/agentci-guard/security/advisories/new

If you believe a workflow in another project is exploitable, report it to
that project's maintainers through its own security policy, not here. AgentCI
Guard findings are review hypotheses, not proof of exploitability.

A useful report includes:

- AgentCI Guard version or commit
- Workflow YAML that reproduces the issue, with secrets removed
- Expected finding
- Actual finding
- Whether the issue is false negative, false positive, crash, or SARIF/report problem

## Non-Goals

AgentCI Guard does not execute or sandbox workflows. A static scan passing does not certify an AI-agent workflow as safe.
