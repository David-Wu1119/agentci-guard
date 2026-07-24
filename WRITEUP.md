# AgentCI Guard v0.1 Retrospective: the result that did not survive

The original write-up promoted an exploratory scan of 75 public repositories
and a reported change from 59 to 13 critical findings. That framing was too
strong.

The exact repository/workflow list, fixed commits, fetched YAML snapshot, and
raw scanner outputs were temporary files and are no longer available. The
surviving transcript proves that a scan was attempted and preserves its query,
script, and printed aggregates. It does not make the result independently
reproducible, and no human-labeled ground truth was ever created.

Therefore:

- the 75-repository tables are historical scanner output, not research
  evidence;
- `59 → 13` is a change in reported findings after implementation changes, not
  a measured false-positive reduction;
- “critical” was a rule severity, not a confirmed exploit;
- the old scan cannot support prevalence, precision, recall, or security-gate
  claims.

The engineering lesson survives: selected real workflows exposed concrete
semantic mistakes, including misclassifying `id-token: write`, treating an
`if:` guard as a prompt sink, and assigning an unjustified severity to ordinary
provider-key exposure. The empirical headline does not survive.

v0.1.1 replaces the missing evidence with two distinct artifacts:

1. a public adversarial regression corpus for known failure modes; and
2. a frozen real-workflow benchmark with fixed repository commits, blob hashes,
   immutable snapshots, repo-disjoint splits, two-human labeling, adjudication,
   and reproducible metric scripts.

The benchmark is intentionally unscored until the independent labels exist.
AgentCI Guard remains an experimental workflow linter, not a production
security product.

See:

- [v0.1.0 baseline and artifact inventory](studies/v0.1.0-baseline/README.md)
- [historical aggregate tables](docs/real-world-findings.md)
- [adversarial corpus](corpus/adversarial/README.md)
- [real-workflow benchmark protocol](benchmark/README.md)
