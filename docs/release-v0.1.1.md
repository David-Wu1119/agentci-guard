# v0.1.1 Release Gate

v0.1.1 must not be tagged, published to npm, or moved under `v0` until every
required gate below has evidence.

## Required

- [x] v0.1.0 baseline, environment, outputs, defects, and historical artifact
      inventory are frozen.
- [x] `action.yml` points to a dedicated bundled JavaScript entrypoint.
- [x] CI contains real `uses: ./` executions for vulnerable, hardened, and
      threshold-failure behavior.
- [x] Local Action harness verifies SARIF, outputs, exit 0, exit 2, and parse
      error exit 1.
- [x] Workflow environment precedence, shell semantics, event reachability,
      permission defaults, discussions, reusable workflows, parse diagnostics,
      checkout semantics, and SARIF locations have adversarial regression cases.
- [x] Public adversarial corpus is explicitly separated from accuracy evidence.
- [x] Real-workflow candidate benchmark contains at least 100 workflows from at
      least 50 repositories, with fixed commits, blob/hash provenance,
      repository-disjoint splits, and snapshot verification.
- [ ] Hosted GitHub Actions run passes the actual manifest-based CI job.
- [ ] Two independent humans complete the annotation sheet without seeing
      predictions.
- [ ] Disagreements are adjudicated and preserved.
- [ ] Evaluation metrics report per-rule and micro precision, recall, F1,
      support, 95% intervals, coverage, diagnostics, and error types.
- [ ] README reports the measured result and limitations without calling the
      tool a production gate.
- [ ] Release tarball contains `dist/action.js`; clean-install CLI and Action
      smoke checks pass.
- [ ] A human reviews the final diff, release notes, tag target, and npm
      provenance.

## Local verification

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm audit --prod
npm pack --dry-run --json
```

## External actions requiring explicit authorization

1. Push `feat/v0.1.1-research-prototype` and open a pull request so GitHub can
   execute the hosted manifest test.
2. After labels and metrics pass review, merge the exact reviewed commit.
3. Create annotated tag `v0.1.1`, update moving tag `v0`, create the GitHub
   release, and publish the matching npm tarball.

No release action should be inferred from local completion.
