# Contributing

AgentCI Guard should stay narrow, deterministic, and explainable.

## Local Setup

```bash
corepack enable
pnpm install
pnpm check
```

## Pull Request Expectations

- Add tests for new workflow patterns.
- Keep each finding tied to concrete evidence.
- Prefer actionable fixes over generic warnings.
- Update `docs/rules.md` for new rules.
- Do not add model-judged scoring to the default scanner path.

## Release Checklist

```bash
pnpm typecheck
pnpm test
pnpm build
npm pack --dry-run
```
