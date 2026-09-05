# Benchmark behavioral report

Generated 2026-09-05T17:57:02.767Z at commit `5ef64b9` (scanner 0.4.0, working tree changes: 9). Benchmark `agentci-real-workflows-v3`, 152 manifest cases.

This is a behavioral report. Alert counts are not precision, recall, or exploit confirmations.

| | Count |
|---|---:|
| Cases in manifest | 152 |
| Cases scanned | 152 |
| Cases failed to scan | 0 |
| Critical findings | 6 |
| High findings | 68 |
| Medium findings | 184 |
| Low findings | 0 |
| Repositories with a critical finding | 4 |

## Completeness × findings

| Category | Cases |
|---|---:|
| complete, with findings | 14 |
| complete, no findings | 44 |
| incomplete, with findings | 63 |
| incomplete, no findings | 31 |
| **Sum** | **152** |

"Complete" means the documented static analysis met no construct it could not interpret. It is not a security guarantee. "No findings" with "incomplete" is not "clean".

## Findings by rule

| Rule | Count |
|---|---:|
| `agentci/ai-with-secrets` | 76 |
| `agentci/unpinned-ai-action` | 57 |
| `agentci/broad-write-permissions` | 51 |
| `agentci/ai-shell-access` | 40 |
| `agentci/gated-ai-write-token` | 24 |
| `agentci/untrusted-ai-write-token` | 4 |
| `agentci/untrusted-input-in-prompt` | 4 |
| `agentci/pull-request-target-ai` | 2 |

## Diagnostics by code

| Code | Count |
|---|---:|
| `agentci/analysis-event-condition` | 279 |
| `agentci/analysis-reusable-without-caller` | 6 |
| `agentci/analysis-remote-reusable-workflow` | 4 |
| `agentci/analysis-permissions-unknown` | 3 |
| `agentci/analysis-checkout-protection-unknown` | 2 |

## Repositories with a critical finding

- `ai-024` greynewell/llm-router-env: untrusted-ai-write-token
- `ai-027` DIYgod/RSSHub: untrusted-ai-write-token
- `ai-040` StackOneHQ/pydantic-ai: pull-request-target-ai, pull-request-target-ai, untrusted-ai-write-token
- `openhands-003` cloudera/cybersec: untrusted-ai-write-token

## Incomplete, no findings (31)

- `control-001`
- `control-006`
- `control-016`
- `control-018`
- `control-022`
- `control-028`
- `control-031`
- `control-036`
- `control-040`
- `control-041`
- `control-052`
- `control-053`
- `control-054`
- `control-058`
- `control-v2-006`
- `control-v2-007`
- `control-v2-008`
- `control-v2-009`
- `control-v2-012`
- `control-v2-014`
- `cursor-003`
- `holdout-aider-001`
- `holdout-aider-002`
- `holdout-aider-004`
- `holdout-openhands-001`
- `holdout-openhands-002`
- `holdout-openhands-003`
- `holdout-openhands-004`
- `openhands-001`
- `openhands-002`
- `openhands-004`
