# Security Policy

AgentCI Guard is security-sensitive CI/CD tooling. Do not publish exploit details for unfixed vulnerabilities in public issues.

## Supported Versions

During the `0.x` phase, only the latest `main` branch and latest published package are supported.

## Reporting a Vulnerability

Use GitHub Security Advisories when available. If private reporting is unavailable, open a minimal public issue asking for a disclosure channel without including exploit details.

A useful report includes:

- AgentCI Guard version or commit
- Workflow YAML that reproduces the issue, with secrets removed
- Expected finding
- Actual finding
- Whether the issue is false negative, false positive, crash, or SARIF/report problem

## Non-Goals

AgentCI Guard does not execute or sandbox workflows. A static scan passing does not certify an AI-agent workflow as safe.
