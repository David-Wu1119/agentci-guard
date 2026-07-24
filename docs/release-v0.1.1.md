# v0.1.1 Release Gate

The immutable `v0.1.1` tag must not be created until every pre-tag gate below
has evidence. npm publication and movement of the floating `v0` tag additionally
require the post-tag consumer smoke.

## Pre-tag required

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
- [x] Benchmark v3 contains multiple agent Action/CLI families, exact-case
      workflow paths, granular annotation units, a deterministic independent
      review plan, replacement holdouts for inspected development cases,
      schemas, separate task metrics, and a reproduction smoke test.
- [x] CI validates the committed Action bundle, manifest, SARIF severity and
      locations, package contents, benchmark schemas, and full dependency
      audit.
- [x] The candidate npm tarball runs its Action and CLI after extraction outside
      the repository with no `node_modules`.
- [x] A release-triggered consumer workflow is fixed to the immutable
      `David-Wu1119/agentci-guard@v0.1.1` reference and verifies vulnerable,
      hardened, and threshold behavior without installing project dependencies.
- [x] A manual post-publication workflow installs `agentci-guard@0.1.1` into an
      empty consumer project and verifies vulnerable and hardened CLI results.
- [ ] Hosted GitHub Actions run passes the actual manifest-based CI job.
- [ ] A primary human completes all units and a second human completes the
      predeclared independent-review plan without seeing predictions.
- [ ] Disagreements are adjudicated with a stable human pseudonym, preserved,
      and mechanically cross-checked against both independent label files.
- [ ] Evaluation metrics report agent detection separately; per-rule, micro,
      and macro precision/recall/F1; support and 95% intervals; supported and
      overall universes; decision coverage; abstentions; diagnostics; and error
      types.
- [ ] README reports the measured result and limitations without calling the
      tool a production gate.
- [ ] The exact final release tarball matches the reviewed candidate and repeats
      the standalone CLI and Action smoke.
- [ ] A human reviews the final diff, release notes, tag target, and npm
      provenance.

## Post-tag required

- [ ] The release-triggered consumer workflow passes against the immutable
      `David-Wu1119/agentci-guard@v0.1.1` reference.
- [ ] The matching npm package is published and its installed CLI passes an
      external consumer smoke.
- [ ] Only after both checks pass, the floating `v0` tag is moved to the
      `v0.1.1` commit.

## Local verification

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm benchmark:smoke
pnpm audit --audit-level high
npm pack --dry-run --json --ignore-scripts
pnpm package:smoke
```

## External actions requiring explicit authorization

1. Push `feat/v0.1.1-research-prototype` and open a pull request so GitHub can
   execute the hosted manifest test.
2. After labels and metrics pass review, merge the exact reviewed commit.
3. Create the annotated immutable tag `v0.1.1` and its GitHub release. The
   release triggers `.github/workflows/published-tag-smoke.yml`.
4. After the published-tag smoke passes, publish the already reviewed matching
   npm tarball and dispatch `.github/workflows/published-npm-smoke.yml` at the
   `v0.1.1` tag ref.
5. Move `v0` only after both remote consumer checks pass.

No release action should be inferred from local completion.
