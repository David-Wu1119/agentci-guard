# Real-World Findings

A **v0.1** scan of public GitHub repositories that run AI coding agents in CI, to
(a) validate AgentCI Guard against real workflows and (b) get an honest read on
how common the risky patterns actually are. The severity counts below are v0.1
**scanner ratings** — pattern matches, not confirmed exploits (see "Follow-up:
exploitability triage").

## Method

- **Corpus:** 75 public repositories whose `.github/workflows/*.yml` reference
  `anthropics/claude-code-action`, discovered via GitHub code search.
- **Tool:** `agentci scan` at the commit this document ships in.
- **What's counted:** findings at job/step granularity, aggregated by severity
  and rule. No repository is named here (see "Responsible use").

## Results

| Severity | Findings |
| --- | ---: |
| Critical | 13 |
| High | 69 |
| Medium | 225 |
| Low | 0 |

Repositories by their **worst** finding (of 75 scanned):

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

**Read this as:** the *medium* findings (unpinned actions, a provider key
present in the job) are near-universal hygiene items, not alarms. The signal
worth acting on is the small **critical** set — an AI agent with repo-write
scope on an untrusted trigger, with untrusted event content reaching it.

## The tool found its own false positives first

The first pass reported **59 criticals**. Auditing those against real,
well-configured repositories surfaced three over-firing patterns, each since
fixed:

1. **`id-token: write` treated as repo-write.** OIDC token minting can't modify
   a repo; counting it inflated the write-token and broad-write rules. Now only
   `contents` / `pull-requests` / `issues` / `packages` / `deployments` count.
2. **Untrusted content in an `if:` guard treated as a prompt sink.** A
   `contains(github.event.comment.body, '@claude')` gate is a guard, not a value
   that reaches the agent. `if:` conditions are now excluded from sink detection.
3. **"AI job has a secret" rated high.** Almost every AI action needs a provider
   key, so this is a baseline exposure to review, not a vulnerability on its own.
   Recalibrated to medium.

After these fixes: **59 → 13 criticals.** The remaining drop in the headline
"share of repos affected" (100% → 53% high-or-critical) is the false alarms
leaving.

## Responsible use

AgentCI Guard flags **patterns in workflow YAML**, not proven exploits. Several
repositories that match a critical pattern have author-side mitigations a static
scanner cannot see — output allowlists, `author_association` gates, fork checks,
or SHA-pinned actions. Treat a finding as "review this," not "this is hacked."

For that reason, this document reports only aggregates. Genuinely exploitable
cases should be reported privately to the maintainer, not published.

## Follow-up: exploitability triage

A later hand-triage checked the critical ratings against how
`anthropics/claude-code-action` actually behaves. It **gates on repository write
access by default**, so the comment-triggered "critical" matches are not directly
attacker-reachable, and the configs that *remove* the gate
(`allowed_non_write_users`, `allowed_bots: '*'`, `pull_request_target` + untrusted
checkout) appear in ≈0 public repos. The risky pattern is common; confirmed
exposure is rare. "Eight repositories rated critical" describes v0.1 scanner
output **before** this triage, not eight confirmed-exploitable repositories. A
scanner recalibration to model the gate is in local review and **not yet released**.

## Prior art

AgentCI Guard is not the first tool to examine GitHub Actions security and does
not claim to prove RCE from static evidence. See CodeQL Actions queries, general
workflow scanners, and prompt-injection / `pull_request_target` tooling (PromptPwnd
/ OpenGrep rules, prompt-injection scanners, TaintAWI, GitInject). Its narrower
contribution is an AI-agent-specific ruleset shipped as an npm CLI + GitHub Action
with SARIF output.
