# External evaluation invitations — record

**Drafted:** 2026-09-05, by the author's assistant. **Sent by:** David Wu, personally. **Sent:** none yet. **Responses:** none yet. **Sessions scheduled:** none yet.

Update this file when each invitation is sent (date), answered (date, yes/no/no reply), and when a session happens (date, duration, outcome). A zero-response outcome is evidence and is recorded here as such.

## Selection rationale

Five people who already run an AI coding agent in GitHub Actions and whose workflows are in the frozen benchmark, chosen because they are **well-configured** — they are evaluators, not disclosure targets. The one genuine exposure in the benchmark (DIYgod/RSSHub) is handled as a private security note and is deliberately **not** on this list, so that a disclosure is never mixed with an evaluation ask.

| # | Repository | Why this person | What they'd test |
|---|---|---|---|
| 1 | `marktext/marktext` (maintainer: Jocs) | Uses Anthropic's template with `github.actor == 'Jocs'` — a gate the tool mis-read as critical until #22. ~61k stars. | Does the scanner now read their configuration the way they intended? |
| 2 | `NVIDIA-NeMo/Speech` (Speech team) | Gates the agent behind a team-membership `authorize` job — a sophisticated pattern the tool reports as high because it cannot verify runtime checks. | Is "high, mitigated by a runtime gate we cannot verify" a useful message or noise to a team that built the gate? |
| 3 | `deriv-com/deriv-analytics` (platform/security) | First step is a shell org-membership check before checkout — a well-hardened `pull_request` agent. | Same question as #2 at an organization that clearly has a security function. |
| 4 | `rendercv/rendercv` (maintainer) | Runs an agent on fork pull requests with `pull-requests: write` and no gate other than the action's default. ~17k stars. | Does the `gated-ai-write-token` explanation match their understanding of the action's default gate? Would they change anything? |
| 5 | `CaseMark/skills` (maintainer) | Agent reviews fork PRs in automation (`prompt`) mode. | Is the automation-mode assumption (gate applies regardless of `prompt`) what they observe in practice? |

## Draft — adapt in your own words before sending

Subject: 30 minutes to try a workflow scanner on your own repo?

Hi [name],

I maintain AgentCI Guard, an open-source static analyzer for one specific risk in GitHub Actions: AI coding agents (Claude Code, Codex, OpenHands…) triggered by issue or PR text while holding a write token. Your `[workflow path]` is one of 152 real workflows in the tool's frozen benchmark, and it's one of the well-configured ones — which is exactly why I'd like your read.

I'm looking for five people who actually run agents in CI to install a release candidate, run it on their own repository, and tell me where it's wrong. 30 minutes, any day between [dates]. I'll send an exact commit and a one-line install; report-only mode, nothing blocks your CI.

What I'd learn from you specifically: [one sentence from the table above].

If it's a no, a one-word reply is genuinely useful too — I'm counting responses either way.

Thanks,
David Wu
https://github.com/David-Wu1119/agentci-guard

## Log

| # | Sent (date) | Reply (date) | Outcome |
|---|---|---|---|
| 1 | — | — | pending |
| 2 | — | — | pending |
| 3 | — | — | pending |
| 4 | — | — | pending |
| 5 | — | — | pending |
