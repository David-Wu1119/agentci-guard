# Contributing to AgentCI Guard

AgentCI Guard is an experimental GitHub Actions AI-workflow linter. The current
priority is measurement and semantic correctness, not feature breadth.

## Scope freeze for v0.1.1

Until the frozen benchmark is human-labeled and scored, do not add:

- new security rules;
- new agent integrations or broad detector patterns;
- dashboards, hosted services, or enterprise features;
- production-security claims;
- new repository studies.

A new detector can change every downstream rule result. Adding one before the
current detector is measured would move the target and invalidate the planned
evaluation. File a focused issue with evidence instead; implementation can be
considered after v0.1.1 measurement.

## Useful contributions now

- minimal positive and negative cases for a documented semantic defect;
- fixes to workflow environment, reachability, permission, reusable-workflow,
  parser, location, or SARIF behavior;
- annotation-guide ambiguity reports;
- benchmark schema or reproduction failures;
- documentation corrections that narrow a claim to the available evidence.

Every semantic change needs:

1. a minimal public adversarial regression;
2. a negative counterpart;
3. a documented decision in `RULES.md` or `docs/analysis-model.md`;
4. no use of sealed evaluation predictions for tuning.

The adversarial corpus prevents known regressions. It is not accuracy evidence.

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm licenses:check
pnpm package:smoke
pnpm benchmark:verify
pnpm benchmark:smoke
```

Do not hand-edit `dist/`, `benchmark/annotation-sheet.csv`, or
`benchmark/review-sheet.csv`. Regenerate them and commit the generated result.
CI checks that the bundle and registries are current.

## Claim discipline

Use “finding,” “pattern match,” “scanner rating,” “supported semantics,” and
“analysis incomplete.” A matched repository is not a proven vulnerability, and
a clean finding list is not proof of safety.

Do not name a public repository as vulnerable from benchmark data. A credible
exploitability issue should use private disclosure rather than a public
benchmark discussion.

Accuracy changes may use only the development split. Evaluation remains sealed
until human labels are adjudicated. If evaluation errors influence a rule
change, the affected data must be retired from held-out evaluation.

## Pull requests

Include:

- the exact defect and supported semantic decision;
- the positive and negative regression cases;
- commands run and their results;
- any change to analysis completeness or benchmark interpretation;
- confirmation that no evaluation prediction was used for tuning.

By contributing, you agree that your contribution is licensed under MIT.
