# AgentCI Guard Adversarial Corpus

This corpus contains synthetic workflows designed to break specific scanner
assumptions. The cases are public, minimal, and checked in CI through
`tests/adversarial-corpus.test.ts`.

This is **not an accuracy benchmark**:

- cases were written with knowledge of the implementation;
- cases are deliberately small and adversarial;
- labels are rule-regression expectations, not independent human judgments;
- multiple cases are variants of the same semantic edge.

Synthetic 40-hex Action references are syntax stand-ins, not evidence that a
vendor Action actually runs on the fixture's event. The discussion cases
distinguish a verified incompatible revision from unverified references.

The corpus answers “did a known bug return?” It cannot answer “how accurate is
AgentCI Guard on real workflows?” The frozen workflows under `benchmark/` are
development data, not a sealed evaluation. A fresh human-labeled sample is
required to answer that question.

The version-2 manifest records each case's target, subject location, reachable
events, exact finding rule and severity, optional exact agent-usage evidence,
diagnostic and analysis status, rationale, and primary/project assumption
sources. CI validates the metadata and exact scanner outcomes; it also directly
checks job reachability for non-reusable workflows.

Case definitions and expected outputs are in [`manifest.json`](manifest.json).

## Replaying an external baseline locally

With an already installed `zizmor` on `PATH`, run the offline, development-only
replay from the repository root. The destination's parent must exist and the
destination itself must not exist:

```bash
node scripts/benchmark/replay-zizmor-dev.mjs --self-test
node scripts/benchmark/replay-zizmor-dev.mjs --out /absolute/path/to/new-zizmor-replay
```

The output manifest records the corpus-manifest hash, installed binary path,
version and SHA-256, exact flags, and each workflow's input and output hashes,
raw stdout, stderr, and exit status. A finding exit with valid JSON is an audit,
not a crash; the deliberately malformed `parse-error` fixture is marked as an
expected invalid input. Any other tool error makes the runner exit nonzero,
while preserving its raw output for inspection. No tool is downloaded;
`--offline` requests zizmor's offline mode.

Zizmor audits are **not** assumed equivalent to AgentCI Guard rules. This
replay is a reproducibility aid over developer-authored synthetic fixtures,
not a precision/recall study, a fair comparative score, or evidence of unique
coverage. A task-aligned comparison still needs a predeclared mapping and the
same fresh, human-labeled evaluation workflows for both tools.
The raw manifest includes the local executable path; review it before sharing.
