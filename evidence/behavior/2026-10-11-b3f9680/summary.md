# Benchmark behavioral report

Generated 2026-10-11T12:27:10.754Z at commit `b3f9680` (scanner 0.6.2, working tree changes: 0, dist/cli.js sha256 `591f86e2880ec8234c67f669ed7b700a4f08d9d40c868bf7d632709285027ee2`). Benchmark `agentci-real-workflows-v3`, 152 manifest cases.

This is a behavioral report. Alert counts are not precision, recall, or exploit confirmations.

| | Count |
|---|---:|
| Cases in manifest | 152 |
| Cases scanned | 152 |
| Cases failed to scan | 0 |
| Critical findings | 32 |
| High findings | 45 |
| Medium findings | 184 |
| Low findings | 0 |
| Repositories with a critical finding | 31 |

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
| `agentci/untrusted-ai-write-token` | 30 |
| `agentci/untrusted-input-in-prompt` | 5 |
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

- `ai-001` DataBoar/data-boar: untrusted-ai-write-token
- `ai-008` robertogogoni/claude-cross-machine-sync: untrusted-ai-write-token
- `ai-010` jaypetez/glean: untrusted-ai-write-token
- `ai-015` marktext/marktext: untrusted-ai-write-token
- `ai-016` Baukebrenninkmeijer/table-evaluator: untrusted-ai-write-token
- `ai-017` vals-ai/model-library: untrusted-ai-write-token
- `ai-018` deriv-com/deriv-analytics: untrusted-ai-write-token
- `ai-019` justinlindh/bramble: untrusted-ai-write-token
- `ai-020` infosecB/LOOBins: untrusted-ai-write-token
- `ai-021` DrewDawson2027/claude-lead-system: untrusted-ai-write-token
- `ai-022` aspardog/ROLI-dashboard: untrusted-ai-write-token
- `ai-024` greynewell/llm-router-env: untrusted-ai-write-token
- `ai-025` barad1tos/GenreUpdater: untrusted-ai-write-token
- `ai-028` listellm/claude-code-azdo: untrusted-ai-write-token
- `ai-029` ben-vargas/ai-sdk-provider-gemini-cli: untrusted-ai-write-token
- `ai-030` PrefectHQ/prefect: untrusted-ai-write-token
- `ai-034` JagravNaik/bedrock-chat-java: untrusted-ai-write-token
- `ai-035` ericmann/journal: untrusted-ai-write-token
- `ai-036` gitcommitshow/resilient-llm: untrusted-ai-write-token
- `ai-037` bborbe/python-skeleton: untrusted-ai-write-token
- `ai-038` mkizka/linkat: untrusted-ai-write-token
- `ai-040` StackOneHQ/pydantic-ai: pull-request-target-ai, pull-request-target-ai
- `ai-043` evansenter/dotfiles: untrusted-ai-write-token
- `ai-044` Acumenus-Data-Sciences/Parthenon: untrusted-ai-write-token
- `ai-045` mbcrawfo/vibefun: untrusted-ai-write-token
- `ai-046` smsilva/wasp-agent: untrusted-ai-write-token
- `ai-047` Wolfe-Jam/grok-faf-mcp: untrusted-ai-write-token
- `ai-050` trinhpham48/brchat-aurora: untrusted-ai-write-token
- `ai-053` aiKrice/homebrew-badgetizr: untrusted-ai-write-token
- `ai-054` masbadges-anthony/mas-swim-badges: untrusted-ai-write-token
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
