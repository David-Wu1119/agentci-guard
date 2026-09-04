# Operating AgentCI Guard

This is the handbook for whoever runs, releases, or extends AgentCI Guard
without the original author in the room. It covers what the tool is allowed to
claim, how to verify it, how to release it, and how to change it safely. Read
[`docs/analysis-model.md`](analysis-model.md) for how the analysis works and
[`THREAT_MODEL.md`](../THREAT_MODEL.md) for what it is trying to catch.

## What it is, in one paragraph

A static analyzer for `.github/workflows/*.yml` that answers one question
before a workflow runs: can text a stranger controls reach an AI coding agent
that holds a write token or secrets? It ships as a GitHub Action, a CLI, a
container image, and a pre-commit hook. It emits findings, diagnostics, SARIF,
Markdown, and GitHub Action outputs. It reads YAML only — it does not observe
prompts, tool calls, network egress, or anything the agent actually did.

## What may and may not be claimed

The tool's accuracy has not been measured against human labels. Until the
benchmark in [`BENCHMARK.md`](../BENCHMARK.md) carries a completed labeling
protocol, the permitted description is **"experimental scanner with unmeasured
accuracy."** Do not use "calibrated," "production security gate," or a
precision or recall figure in any public material.

What can truthfully be said today:

- Eight rules, one threat model, documented in [`RULES.md`](../RULES.md).
- Deterministic regression against a 36-case adversarial corpus and a frozen
  152-workflow real-world benchmark, both reproducible from the repository.
- Every critical finding on the benchmark was hand-read during development,
  and four detection defects were found and fixed by that process; the
  defects and their measured effects are recorded in
  [`CHANGELOG.md`](../CHANGELOG.md).
- On the same 152 workflows, zizmor 1.30.0 flags 146 repositories to this
  tool's 77, and catches classes this tool does not model. This tool raises a
  top-severity finding on 8 repositories where zizmor reports nothing
  equivalent, all of them agent-reachability. Both facts belong together.
- The academic prior art is Wang et al., "Demystifying and Detecting Agentic
  Workflow Injection Vulnerabilities in GitHub Actions" (arXiv 2605.07135),
  whose TaintAWI analyzes the same class at far larger scale with confirmed
  exploitability. Cite it; do not compete with it.

## Verifying the tree

Every merge to `main` must pass the full gate. Run it locally before opening a
pull request:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check            # format, typecheck, tests with coverage floor, build,
                      # bundled licenses, v0.1.0 baseline, benchmark snapshot
pnpm audit --audit-level high
pnpm benchmark:smoke  # annotation toolchain round-trip
pnpm package:smoke    # packed Action and CLI run outside the repo, no node_modules
node scripts/verify-action-manifest.mjs
```

`pnpm check` enforces a coverage floor of 90% lines, statements, and functions
and 80% branches. These are a ratchet, not a target: raise them when coverage
rises, never lower them to make a change pass. If a change genuinely needs a
lower floor, that is a signal the change needs tests.

Two example repositories are the fastest sanity check. They must not drift:

```bash
node dist/cli.js scan examples/vulnerable --fail-on none   # 9 findings: 2 critical, 4 high, 3 medium
node dist/cli.js scan examples/hardened   --fail-on none   # 0 findings
```

The committed `dist/` must match a fresh build. CI checks this; locally, run
`pnpm build` and confirm `git status` shows no change under `dist/`.

## Measuring a change against the benchmark

Any change to detection or reachability must report its effect on the frozen
benchmark before it merges, as every entry in the changelog does. The pattern:

```bash
# before the change
for c in $(jq -r '.cases[].case_id' benchmark/manifest.json); do
  node dist/cli.js scan "benchmark/snapshots/$c" --json --fail-on none
done > /tmp/before.jsonl
# apply the change, pnpm build, repeat into /tmp/after.jsonl, then diff the
# per-case critical/high/medium counts.
```

Report four numbers in the changelog entry: critical, high, medium, and how
many cases changed. A detection fix that adds findings should change only the
cases it targets; if the count of flagged repositories moves, explain why. A
false-positive fix should remove findings only on cases you have read by hand.

If a change makes the adversarial corpus fail, assume the corpus is right. It
has overruled two proposed changes so far, correctly both times. Edit the
corpus only with a written argument in the pull request for why the frozen
expectation was wrong, and expect that argument to be challenged.

## Releasing

Releases are immutable semver tags plus a floating `v0` that every README pins.
The order matters, because `v0` is what consumers actually run.

1. Bump `version` in `package.json`. The CLI reads it from there.
2. Move the `## [Unreleased]` changelog block under a dated `## [x.y.z]`
   heading.
3. Write `docs/release-vx.y.z.md` following the previous one: pre-release
   checklist, published-Action sequence, npm sequence, post-release
   milestones.
4. Update `.github/workflows/published-tag-smoke.yml` to the new tag. It runs
   the published Action as a consumer would, against the vulnerable, hardened,
   and threshold fixtures.
5. Merge through a pull request with CI green. Never release from an unmerged
   branch.
6. Create the annotated tag on the merge commit and publish a GitHub release
   for it. The release event triggers the tag smoke.
7. **Only after the tag smoke passes**, force-move `v0` to the same commit:
   `git tag -fa v0 <sha> && git push --force origin v0`. Verify both tags peel
   to the same commit with `git ls-remote --tags origin`.

Moving `v0` before the smoke passes is how v0.1.0 shipped a no-op Action to
every consumer for weeks. Do not skip step 7's condition.

npm publication is a separate decision with its own authorization. The Action
release does not imply it. When it happens, dispatch
`.github/workflows/published-npm-smoke.yml` at the immutable tag and confirm
the installed CLI works in an empty consumer project. Until then, README
`npx agentci-guard` commands resolve to whatever is on npm, which may lag the
Action.

## Adding or changing a rule

A rule is a contract, and four places must agree:

1. **Definition** — add the id, title, severity, `why`, and `fix` to
   `src/rules.ts`. The `why` text is what users read; write it for them.
2. **Detection** — emit the finding from `src/scanner.ts` with `makeFinding`.
   Reachability and permission questions go through `src/workflow-model.ts`;
   do not re-derive them inline.
3. **Documentation** — describe the rule in `RULES.md` and, if it changes what
   the analysis can or cannot see, in `docs/analysis-model.md`.
4. **Evidence** — add at least one adversarial corpus case under
   `corpus/adversarial/cases/` with an expectation in its `manifest.json`, and
   a unit test. Then measure the benchmark effect as described above.

Severity follows the threat model: critical means untrusted content can reach
an agent that can change the repository; high means one of the three
ingredients is present and the others are plausible; medium is hygiene that
widens blast radius. Do not add a critical rule that fires without an
untrusted trigger.

## Adding an agent

Detection is a hand-maintained list in `src/detect.ts` with three shapes:

- `AI_AGENT_ACTION_PATTERNS` — `uses:` references. Anchor the organization
  and leave the repository open where a vendor publishes several agents;
  the OpenHands rename silently disabled detection when the pattern required
  a specific repository name.
- `AI_AGENT_CLI_PATTERNS` — `run:` invocations at a command boundary. Keep
  the boundary and the `--version` / `--help` exclusion; installation and
  version checks are not executions.
- `AI_AGENT_API_PATTERNS` — HTTP calls to hosted **agent-dispatch** routes.
  Require a scheme so prose does not match. Do not add inference endpoints:
  a `chat/completions` call returns text and holds no tools, so it cannot
  reach the repository, and the `misleading-non-agent` corpus case will
  reject it.

Actions are presumed to fetch the triggering event's content themselves; CLIs
and HTTP calls are not, because a shell hands them only what the script puts
in. Preserve that distinction when adding a pattern.

A quick audit for stale patterns: run the 16 held-out diversity cases
(`benchmark/snapshots/holdout-*`) and confirm each reports at least one agent
usage or an explicit unresolvable-workflow diagnostic. A confident clean scan
on a workflow that visibly names an agent is the failure to look for.

## Known limits that are not bugs

- Agents invoked from a script the workflow calls (`./run.sh`, `make`,
  `python dispatch.py`) are invisible. Inferring them from `pip install` or an
  environment variable would flag configuration as execution. This is a floor
  on reading workflow files.
- Conditions on runtime values (`steps.*`, `needs.*`, `env.*`) cannot be
  resolved and are kept conservative, which errs toward more findings. Roughly
  two thirds of real workflows carry one; it costs precision, not recall.
- Runtime permission checks (a step that queries collaborator access and
  exports an `allowed` output) are not trusted as actor gates, because a static
  reader cannot prove they run before untrusted content is fetched. This is a
  chosen false positive.
- Remote reusable workflows cannot be resolved and are reported as such rather
  than guessed at.
- `pull_request_target` with read-only permissions still raises the critical
  finding, because that trigger exposes base-repository secrets regardless of
  token scope. The corpus pins this.

## Where things live

| Concern                                | Path                                                      |
| -------------------------------------- | --------------------------------------------------------- |
| Rule contract                          | `src/rules.ts`, `RULES.md`                                |
| Detection patterns                     | `src/detect.ts`                                           |
| Reachability, permissions, actor gates | `src/workflow-model.ts`                                   |
| Scan orchestration and findings        | `src/scanner.ts`                                          |
| CLI, Action runner                     | `src/cli.ts`, `src/action-runner.ts`, `action.yml`        |
| Reports and SARIF                      | `src/report.ts`, `src/sarif.ts`                           |
| Adversarial corpus                     | `corpus/adversarial/`                                     |
| Frozen benchmark and tooling           | `benchmark/`, `scripts/benchmark/`                        |
| Release gates                          | `docs/release-v*.md`, `.github/workflows/published-*.yml` |
| Container and hook                     | `Dockerfile`, `.pre-commit-hooks.yaml`                    |
