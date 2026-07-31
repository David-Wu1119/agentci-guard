# v0.1.1 Functional Release Gate

v0.1.1 repairs the broken v0.1.0 JavaScript Action entrypoint. It is a
functional-correctness release, not an accuracy-calibration milestone. Human
labels and measured precision/recall remain required before any calibrated or
production-security claim, but they do not justify leaving the public `v0`
Action reference on a known no-op release.

## Pre-release required

- [x] The v0.1.0 baseline, environment, defects, and missing historical
      artifacts are frozen.
- [x] `action.yml` points to a dedicated bundled JavaScript entrypoint and
      declares its inputs and outputs.
- [x] Hosted CI executes the real Action through `uses: ./` for vulnerable,
      hardened, and threshold-failure behavior.
- [x] Local tests cover Action exit codes, SARIF, outputs, invalid paths, parse
      failures, and CLI report paths.
- [x] Workflow environment precedence, shell semantics, event reachability,
      permission defaults, discussions, reusable workflows, checkout behavior,
      and incomplete-analysis diagnostics have adversarial regression cases.
- [x] The candidate package runs its bundled Action and CLI after extraction
      outside the repository without `node_modules`.
- [x] The benchmark, annotation sheets, review plan, pilot, schemas, and
      v0.1.0 baseline remain mechanically reproducible and explicitly
      uncalibrated.
- [x] The README states that accuracy is unmeasured and that findings are
      review hypotheses rather than a production merge gate.
- [x] Hosted CI passed the exact functional candidate at commit
      [`3158601`](https://github.com/David-Wu1119/agentci-guard/commit/31586017cf86957ecaefe765599fa65456bcccfb)
      in [run `30602326580`](https://github.com/David-Wu1119/agentci-guard/actions/runs/30602326580).
- [x] The final policy commit passes the full local verification and its
      generated `dist/` matches the committed bundle.
- [x] The repository operator explicitly authorized releasing v0.1.1 as an
      uncalibrated functional correction and moving `v0` only after the
      immutable-tag consumer smoke passes.

## Published Action sequence

- [x] Created the annotated immutable `v0.1.1` tag at reviewed commit
      [`696697e`](https://github.com/David-Wu1119/agentci-guard/commit/696697ec83ebc1ed58032d706c1254d5e894d21d).
- [x] Published the matching
      [GitHub release](https://github.com/David-Wu1119/agentci-guard/releases/tag/v0.1.1)
      to trigger `.github/workflows/published-tag-smoke.yml`.
- [x] Verified the published `David-Wu1119/agentci-guard@v0.1.1` consumer smoke
      passed vulnerable, hardened, and threshold behavior in
      [run `30603107903`](https://github.com/David-Wu1119/agentci-guard/actions/runs/30603107903).
- [x] After that smoke passed, moved the floating `v0` tag to the exact
      `v0.1.1` commit and verified both remote tags peel to `696697e`.

## npm sequence is separately gated

- [ ] Publish the already reviewed `agentci-guard@0.1.1` tarball only with
      separate operator authorization.
- [ ] Dispatch `.github/workflows/published-npm-smoke.yml` at the immutable
      `v0.1.1` ref and verify the installed CLI in an empty consumer project.

The Action release and moving `v0` do not imply npm publication.

## Post-release calibration milestones

- [ ] Freeze a human-label protocol that truthfully matches the available
      annotators. Do not represent repeated labels from one human as
      independent human review.
- [ ] Complete the declared labels and review or test-retest procedure without
      consulting evaluation predictions.
- [ ] Publish agent-detection and per-rule precision, recall, F1, support,
      intervals, decision coverage, abstentions, and error classifications.
- [ ] Update the README and data card with the measured result and limitations.

Until those milestones are complete, the permitted description is
“experimental scanner with unmeasured accuracy,” not “calibrated linter” or
“production security gate.”

## Local verification

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm benchmark:smoke
pnpm audit --audit-level high
npm pack --dry-run --json --ignore-scripts --foreground-scripts=false
pnpm package:smoke
```

No npm publication is authorized by completion of this document.
