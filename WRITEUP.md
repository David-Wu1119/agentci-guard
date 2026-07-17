# I scanned 75 public repos running AI agents in CI — and found false positives in my own tool first

This is a write-up of what happened when I pointed [AgentCI Guard](https://www.npmjs.com/package/agentci-guard) at real open-source repositories that run AI coding agents inside GitHub Actions. The most useful result was not the scan of other people's workflows. It was the scan finding bugs in itself.

## The threat, in three sentences

A workflow triggered by `pull_request_target` (or an issue/comment event) runs with the repository's own write-scoped `GITHUB_TOKEN`, even when the pull request comes from a fork. If that workflow passes untrusted event content — a PR title, an issue body, a comment — into an AI agent, an attacker can write prompt-injection text and have the agent act on it. With a write token in hand, the agent can be induced to modify code, comments, workflows, or releases.

## What I scanned, and how

The corpus is **75 public repositories** whose `.github/workflows/*.yml` reference `anthropics/claude-code-action`, found via GitHub code search. I ran `agentci scan` over each one and aggregated findings by severity and by rule. Two goals: validate the tool against workflows I did not write, and get an honest read on how common the risky patterns actually are.

## The honest result

Severity totals across the corpus:

| Severity | Findings |
| --- | ---: |
| Critical | 13 |
| High | 69 |
| Medium | 225 |
| Low | 0 |

Repositories grouped by their **worst** finding (of 75):

| Worst severity | Repos | Share |
| --- | ---: | ---: |
| Critical | 8 | 11% |
| High | 32 | 43% |
| Medium | 35 | 47% |
| Clean | 0 | 0% |

By rule:

| Count | Rule |
| ---: | --- |
| 90 | `agentci/unpinned-ai-action` |
| 82 | `agentci/ai-with-secrets` |
| 57 | `agentci/ai-shell-access` |
| 53 | `agentci/broad-write-permissions` |
| 11 | `agentci/untrusted-input-in-prompt` |
| 11 | `agentci/untrusted-ai-write-token` |
| 2 | `agentci/pull-request-target-ai` |
| 1 | `agentci/unsafe-checkout` |

Read this honestly: the medium findings — unpinned actions, a provider key present in the job — are near-universal hygiene items, not alarms. The signal worth acting on is the small **critical** set: an AI agent with repo-write scope, on an untrusted trigger, with untrusted event content reaching it. These are **scanner ratings, not confirmed exploits** — see *Follow-up: exploitability triage* below.

## The tool found its own false positives first

The first pass reported **59 criticals**. That number was wrong, and I knew it was wrong because several of the flagged repos were well-configured ones I could read closely. Auditing the 59 against those repos exposed three over-firing patterns — in my tool, not in their workflows:

1. **`id-token: write` was counted as repo-write.** An OIDC token-minting permission cannot modify a repository, but it was inflating the write-token and broad-write rules. Now only `contents` / `pull-requests` / `issues` / `packages` / `deployments` count as repo-write.
2. **Untrusted content inside an `if:` guard was treated as a prompt sink.** A `contains(github.event.comment.body, '@claude')` gate is a condition, not a value that reaches the agent. `if:` conditions are now excluded from sink detection.
3. **"AI job has a secret" was rated high.** Almost every AI action needs a provider key, so this is a baseline exposure to review, not a vulnerability on its own. Recalibrated to medium.

After those three fixes: **reported criticals fell 78%, from 59 to 13.** I am leading with this because it is the point. A security scanner that has never embarrassed its author has not been tested against reality. The 46 that disappeared were false alarms, and a tool you can only trust after it has been forced to retract its own over-counting is more trustworthy than one that never has.

## Follow-up: exploitability triage

Everything above is a **v0.1 scanner result** — pattern matches, not confirmed exploits. A later hand-triage against how `anthropics/claude-code-action` actually behaves found that most of the critical ratings were **not attacker-reachable**: the action refuses to run for users without repository write access by default, so on a comment or issue trigger an external attacker cannot invoke the agent. The configurations that *remove* that gate (`allowed_non_write_users`, `allowed_bots: '*'`, or a `pull_request_target` trigger with untrusted checkout) appear in ≈0 of the public repos.

So the accurate headline is narrower than the scan alone suggests: the risky *pattern* is common, but confirmed *exposure* is rare, because the popular action is safe-by-default. "Eight repositories received a critical scanner rating" is a statement about v0.1's output **before** this triage — not eight confirmed-exploitable repositories. A scanner recalibration to model the action's write-access gate is in local review and **not yet released**.

## Prior art

This is not the first tool to examine GitHub Actions security, and it does not claim to prove remote code execution from static evidence. Related and prior work includes GitHub's CodeQL Actions queries and general workflow scanners, and tools focused on the prompt-injection / `pull_request_target` surface (e.g. PromptPwnd / OpenGrep rules, prompt-injection scanners, TaintAWI, GitInject). AgentCI Guard's narrower contribution is an AI-coding-agent-specific ruleset — keying on known agent actions, provider credentials, and model identifiers — packaged as an npm CLI + GitHub Action with SARIF output.

## Responsible use

AgentCI Guard flags **patterns in workflow YAML**, not proven exploits. A static scanner cannot see author-side mitigations: output allowlists, `author_association` gates, fork checks, SHA-pinned actions. A matched critical pattern means "review this," not "this is exploitable."

For that reason:

- This write-up reports **aggregates only**. No repository is named.
- I do not characterize any specific repo as vulnerable.
- Genuinely exploitable cases get reported **privately** to the maintainer, never published.

Run it yourself: `npx agentci-guard scan .` — or add the Action, `David-Wu1119/agentci-guard@v0` (SARIF output, node24, MIT).
