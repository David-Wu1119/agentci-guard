# Contributing to agentci-guard

Thanks for being here. **agentci-guard** is a static linter for GitHub Actions workflows that use AI coding agents (Claude Code, Aider, OpenHands, Codex, and friends). It flags risky patterns — untrusted input reaching a write-capable agent, unpinned AI actions, broad permissions — and emits SARIF. It ships as the npm package [`agentci-guard`](https://www.npmjs.com/package/agentci-guard) and as the GitHub Action `David-Wu1119/agentci-guard@v0`.

Contributions are very welcome, especially **new agent detectors**. That's the centerpiece of this guide.

## Dev setup

We use pnpm via Corepack. From the repo root:

```bash
corepack enable
pnpm install
pnpm test     # vitest
pnpm build    # tsup -> dist/
```

Useful while iterating:

```bash
pnpm typecheck   # tsc --noEmit
pnpm test --watch
```

## The precision principle (read this first)

> Detect AI-agent usage only from **specific, load-bearing signals** — known agent actions, agent CLI invocations, and provider credentials / model identifiers. **Never** from generic words.

This is not a style preference; it's the lesson from the real-world scan. We ran agentci-guard across **75 public repos** whose `.github/workflows` reference `anthropics/claude-code-action` (found via GitHub code search). Generic tokens like `agent`, `ai`, `node`, `codex`, and `mcp` legitimately appear all over ordinary CI — self-hosted runner labels (`build-agent`), `User-Agent` headers, action slugs (`datadog/agent-action`), and everyday tooling. Match on those and the tool cries wolf, then gets uninstalled after the first run.

The self-audit drove this home. Our **first scan reported 59 criticals**. Auditing those against well-configured repos exposed three false-positive classes **in the tool itself**:

1. `id-token: write` was being counted as repo write.
2. Untrusted content inside an `if:` guard was treated as a prompt sink.
3. `ai-with-secrets` was rated high, even though nearly every AI action needs a provider key.

After fixing all three: reported criticals fell **78% (59 -> 13)**. Every new detector should be held to that same bar — a specific signal, not a generic word. (A later exploitability triage found most remaining critical *ratings* are gated by `claude-code-action`'s default write-access check — see `WRITEUP.md`. Treat rule output as scanner ratings, not confirmed exploits.)

### Responsible-use note

agentci-guard flags **patterns** in workflow YAML, not proven exploits. Many flagged repos have author-side mitigations a static scanner can't see (output allowlists, `author_association` gates, fork checks, SHA-pinned actions). When you write about findings, **report aggregates only and never name a repo as vulnerable**. If you discover a genuinely exploitable case, disclose it privately.

## Add a new agent detector in 3 steps

Say you want agentci-guard to recognize a new AI coding agent — a new GitHub Action, a new CLI, or a new provider key.

### Step 1 — Add a specific pattern to `AI_AGENT_PATTERNS`

Open [`src/detect.ts`](src/detect.ts) and add a regex to the `AI_AGENT_PATTERNS` array. The array is grouped — drop your pattern in the section it belongs to:

- **Known agent GitHub Actions** (matched in `uses:`), e.g. `/anthropics\/claude-code(?:-base)?-action/i`, `/\baider-ai\/aider\b/i`
- **Agent CLIs / tools**, e.g. `/\bcursor-agent\b/i`. Note how bare-generic names are deliberately constrained: `/\bcodex\s+(?:exec|run|--)/i` (not bare `codex`), `/\bllm\s+(?:-m|--model)\b/i` (not bare `llm`).
- **Provider credentials / endpoints / SDKs / model identifiers**, e.g. `/\bANTHROPIC_API_KEY\b/i`, `/api\.(?:anthropic|openai)\.com/i`, `/\bclaude-(?:3|4|opus|sonnet|haiku)\b/i`

Rules of thumb:

- Anchor on the **product/org slug, binary name, env var, endpoint, or model id** — something that doesn't show up in non-AI CI.
- Use `\b` word boundaries and require disambiguating context for any word that could be generic. If your token is a common English word or a common CI noun, it needs a qualifier (a subcommand, a flag, a namespace) or it doesn't belong here.
- Keep it case-insensitive (`/i`) unless case is meaningful.

`looksLikeAiUsage(value)` simply tests every pattern in the array, so adding one regex is all it takes to teach the detector a new agent. The downstream rules then apply automatically.

### Step 2 — Add a benign + positive fixture and assert it

Detectors are only trustworthy if they're pinned by tests on both sides. Edit [`tests/precision.test.ts`](tests/precision.test.ts), which has exactly two guarantees:

- **Benign:** zero findings on `tests/fixtures/benign` (ordinary CI — a `build-agent` runner, `datadog/agent-action`, a `User-Agent` header). This is the false-positive tripwire.
- **Positive:** real agent usage in `tests/fixtures` still trips the expected rules.

When you add a detector:

1. Add a **positive fixture** workflow under `tests/fixtures/` that uses your new agent, and extend the positive test so its rule(s) fire — e.g. `expect(rules.has("agentci/ai-with-secrets")).toBe(true)`.
2. Add a **benign fixture** under `tests/fixtures/benign/` containing a look-alike that must NOT match (the runner-label / header / slug your pattern could be confused with), and confirm `result.findings` stays `[]`.

If you can't write a benign fixture that your pattern survives, the pattern is too generic — tighten it before moving on.

### Step 3 — Typecheck, test, and open a PR

```bash
pnpm typecheck && pnpm test
```

Green? Open a PR. Describe the agent you're adding and why the signal is specific, and link the fixtures you added.

## How rules and severities work

Detectors find AI usage; **rules** decide what's risky and how loud to be. All rule metadata lives in [`src/rules.ts`](src/rules.ts) in the `RULES` map. Each entry is a `RuleDefinition`:

```ts
type RuleDefinition = {
  id: string;          // e.g. "agentci/untrusted-ai-write-token"
  title: string;
  severity: Severity;  // "critical" | "high" | "medium" | "low"
  why: string;         // the threat model, in plain language
  fix: string[];       // concrete remediation steps
};
```

There are **8 rules** today, spanning critical to medium. A few worth knowing as you calibrate new work:

- `agentci/untrusted-ai-write-token` (**critical**) — untrusted event content can reach a write-capable agent.
- `agentci/pull-request-target-ai` (**critical**) — agent runs in the base-repo security context.
- `agentci/untrusted-input-in-prompt` (**high**) and `agentci/ai-shell-access` (**high**).
- `agentci/ai-with-secrets` (**medium**) — deliberately *not* high. Most AI actions need a provider key, so this is a baseline exposure to review, not a vulnerability on its own; it escalates only when combined with untrusted input or write permissions. This is one of the three self-audit fixes — keep severities honest the same way.

If you change a severity or add a rule, update the `why`/`fix` text to match the threat model, and make sure the precision tests still reflect reality.

## What we expect in a PR

- `pnpm typecheck && pnpm test` pass.
- **No new false positives on `tests/fixtures/benign`** — that suite must stay at zero findings.
- New detectors come with both a positive and a benign fixture.
- Severity changes come with reasoning grounded in the threat model, not vibes.
- Findings discussed in issues/PRs are framed as **patterns**, reported in aggregate, with **no repo named as vulnerable**.

## License

agentci-guard is MIT licensed. By contributing, you agree your contributions are licensed under the same terms. Maintained by David Wu ([@David-Wu1119](https://github.com/David-Wu1119)).

Happy hunting — and thank you for keeping the false-positive rate low.
