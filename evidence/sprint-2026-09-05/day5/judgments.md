# Pre-scan judgments — developer spot check, twelve unseen workflows

Reader: the developer (Codex, operating this checkout). Reading began
2026-09-05T18:17:21Z after the sample closed at commit `2a2ef56`; this file is
committed **before the candidate is run on any of these snapshots** — the
commit hash is the proof of order. Verdicts are per the predicates in
`RULES.md` (rows `untrusted-ai-write-token`, `gated-ai-write-token`,
`pull-request-target-ai`) and `docs/analysis-model.md`. Reference sets used:
untrusted events = pull_request, pull_request_target, issue_comment, issues,
pull_request_review, pull_request_review_comment, discussion,
discussion_comment; sensitive write scopes = contents, pull-requests, issues,
discussions, packages, deployments (`id-token`, `actions` are not sensitive
write scopes under the contract).

Abbreviations: UAWT = `untrusted-ai-write-token`, GATED =
`gated-ai-write-token`, PRT = `pull-request-target-ai`. Verdicts: **positive**
(predicate holds), **negative** (predicate fails), **indeterminate** (the file
does not decide it).

## u-01 remotion-dev/remotion `.github/workflows/claude.yml` (G1)

- Agent present: **yes** — `anthropics/claude-code-action@v1` (l.35), job `claude`.
- Events: issue_comment, pull_request_review_comment, issues, pull_request_review (l.3–11) — all untrusted.
- Actor gate: **none** — the job `if` (l.15–19) only tests `contains(..., '@claude')`, a trigger phrase anyone can type.
- Permissions (l.21–26): contents/pull-requests/issues **read**, id-token write, actions read → **no sensitive write scope**.
- UAWT: **negative** — no sensitive write scope in the job.
- GATED: **negative** — requires every UAWT condition, including the write scope.
- PRT: **negative** — not on `pull_request_target`.
- Note: `claude_args` grants Bash and WebFetch (l.49); with a read-only token that is shell access, not a write-token exposure (outside the three rules).

## u-02 instructure/canvas-lms `.github/workflows/claude.yml` (G1)

- Agent present: **yes** — `anthropics/claude-code-action@v1` (l.37), job `claude`.
- Events: issue_comment, pull_request_review_comment, issues, pull_request_review (l.3–11) — all untrusted, and all in the set the action's docs list as checked.
- Actor gate: **none**. `github.repository_owner == 'instructure-internal'` (l.16) tests the repository's owner, a constant, not the actor; the rest are trigger phrases.
- Permissions (l.23–28): pull-requests **write**, issues **write** → sensitive write scopes.
- Gate intact: no `allowed_non_write_users`, no `allowed_bots`, no `prompt` (tag mode), no `run:` step expands event text.
- UAWT: **negative** — every condition holds but the gated rule takes precedence under the contract.
- GATED: **positive** — evidence l.3–11, l.16–21, l.25–26, l.37–39.
- PRT: **negative**.
- Caveat for adjudication: in the public repository `instructure/canvas-lms` the owner is `instructure`, so l.16 is false and the job never runs there; the YAML-only model cannot know the repository's owner. Positive per predicate, practically moot in this repository.

## u-03 shopware/shopware `.github/workflows/claude.yml` (G1)

- Agent present: **yes** — `anthropics/claude-code-action@d40ddef…` (l.35), job `claude`.
- Events: same four untrusted events (l.3–11). Actor gate: **none** (trigger phrases only, l.15–19).
- Permissions (l.21–26): all read except id-token write → no sensitive write scope.
- UAWT **negative**; GATED **negative**; PRT **negative**.

## u-04 fxsound2/fxsound-app `.github/workflows/claude.yml` (G1)

- Agent present: **yes** — `anthropics/claude-code-action@v1` (l.32), job `claude`.
- Events: same four untrusted events (l.2–10).
- Actor gate: **present** — every disjunct of the job `if` (l.13–17) conjoins `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), <event>.author_association)`, so the whole condition implies a trusted association.
- Permissions (l.19–24): read-only except id-token write.
- UAWT **negative** (gated actor and no write scope); GATED **negative**; PRT **negative**.

## u-05 openclaw/openclaw `.github/workflows/dated-todo-sweep.yml` (G2, Codex)

- Agent present: **yes** — `openai/codex-action@52fe01e…` (l.55), job `analyze`.
- Events: schedule, workflow_dispatch (l.3–12) — neither is an untrusted event; workflow_dispatch requires write access to trigger.
- Permissions: workflow-level contents **read** (l.14–15); no job override.
- UAWT **negative** (no untrusted event, no write scope); GATED **negative** (not the Claude action); PRT **negative**.
- Note: secrets `OPENAI_API_KEY` reach the agent (l.59) — baseline exposure, outside the three rules. The privileged `upsert` job (l.77) mints an app token but runs no agent.

## u-06 google-gemini/gemini-cli `.github/workflows/docs-audit.yml` (G2, Gemini)

- Agent present: **yes** — `google-github-actions/run-gemini-cli@a3bf790…` (l.31), job `audit-docs`.
- Events: schedule, workflow_dispatch (l.3–7) — not untrusted.
- Permissions (l.12–14): contents **write**, pull-requests **write** → sensitive, but no untrusted event reaches the agent.
- UAWT **negative**; GATED **negative**; PRT **negative**.
- Note: broad write scopes with an agent on a trusted trigger is a hygiene matter (`broad-write-permissions`), not one of the three rules.

## u-07 TheAgentCompany/TheAgentCompany `.github/workflows/openhands-resolver.yml` (G2, OpenHands)

- Agent present: **yes in substance, not as a step** — the only job (l.8) `uses:` the remote reusable workflow `All-Hands-AI/openhands-resolver/.github/workflows/openhands-resolver.yml@main`, which is the OpenHands issue resolver; this file contains no step of its own.
- Events: issues `labeled` (l.4–5) — an untrusted event class; the label is applied by someone with triage rights, but the issue body the resolver acts on is stranger-controlled. Job `if` (l.10) tests the label name, not the actor.
- Permissions: none declared → repository default (unknown from the YAML). The resolver receives `PAT_TOKEN` (l.15), a personal access token whose scope is invisible here and independent of `GITHUB_TOKEN` permissions.
- UAWT: **indeterminate** — the agent, its ingestion, and the token that writes all live in the callee; the predicate's "job's effective permissions include a sensitive write scope" cannot be evaluated from this file, and the write capability that matters is a PAT, which the predicate does not model.
- GATED: **negative** (not the Claude action).
- PRT: **negative** (issues event).
- Expectation recorded: this is the case most likely to show the model's limit — a real agent behind a remote reusable workflow, decided by a secret rather than a token scope.

## u-08 dbcli/pgcli `.github/workflows/codex-review.yml` (G2, Codex)

- Agent present: **yes** — `openai/codex-action@v1` (l.43), job `codex-review`.
- Events: `pull_request_target` opened/labeled/reopened/ready_for_review (l.4–5) — untrusted, base-repository context with secrets.
- Actor gate: **none** — the job `if` (l.22) tests draft state and a label; any stranger's non-draft PR passes.
- Permissions (l.24–25): contents **read** in the agent's job. The write scopes (issues, pull-requests) are in `post-feedback` (l.72–74), a separate job with no agent that posts the agent's output.
- UAWT: **negative** — no sensitive write scope in the agent's job.
- GATED: **negative** (not the Claude action).
- PRT: **positive** — evidence l.4, l.22, l.43, l.49 (`OPENAI_API_KEY` reaches the agent under `pull_request_target`).
- Notes for adjudication: the PR merge ref is checked out under `pull_request_target` (l.30–33) — the unsafe-checkout pattern, outside the three rules. PR title/body are placed in env (l.46–47) and referenced as `$PR_TITLE`/`$PR_BODY` in the prompt text (l.65–66); GitHub does not expand those, but the agent process can read its environment.

## u-09 ranisalt/node-argon2 `.github/workflows/ci.yml` (G3 control)

- Agent present: **no** — checkout, setup-node, npm, lcov, Codacy reporter, a FreeBSD VM action; no agent action, CLI, or API call.
- Events: push, pull_request; permissions contents read.
- UAWT **negative**; GATED **negative**; PRT **negative**. Expected finding set for the three rules: empty.

## u-10 avishayil/react-native-restart `.github/workflows/ci.yml` (G3 control)

- Agent present: **no** — lint, tests, Android/iOS builds.
- Events: push, pull_request on master; permissions contents read.
- UAWT **negative**; GATED **negative**; PRT **negative**.

## u-11 heroku/heroku-slugs `.github/workflows/ci.yml` (G3 control)

- Agent present: **no** — checkout, setup-node, npm ci/test/lint.
- Events: push; no permissions block (repository default; irrelevant without an agent).
- UAWT **negative**; GATED **negative**; PRT **negative**.

## u-12 Rfym21/Qwen2API `.github/workflows/ci.yml` (G3 control)

- Agent present: **no** — the word "Qwen" is the repository's subject, not a step; the jobs run npm lint/test only.
- Events: push, pull_request; permissions contents read.
- UAWT **negative**; GATED **negative**; PRT **negative**.

## Summary of judgments (denominator 12 cases, 13 agent-relevant jobs judged)

| Verdict | UAWT | GATED | PRT |
| --- | ---: | ---: | ---: |
| positive | 0 | 1 (u-02) | 1 (u-08) |
| negative | 11 | 11 | 12 |
| indeterminate | 1 (u-07) | 0 | 0 |

Agent present: 8 of 12 (u-01–u-08); absent: 4 of 12 (controls). Reading ended
at the timestamp of the commit that adds this file; elapsed time is recorded
in `reconciliation.md`.
