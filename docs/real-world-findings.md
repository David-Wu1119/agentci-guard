# Historical v0.1 Exploratory Scan

## Evidence status

**This study is not reproducible and is not an accuracy evaluation.**

In June 2026, v0.1 was run over GitHub code-search results described as 75
public repositories whose workflow files referenced
`anthropics/claude-code-action`. The surviving local transcript contains the
search query, generated scan script, selected manual inspections, and printed
aggregate summaries. It does **not** contain the exact 75-file list, repository
commit SHAs, fetched workflow snapshot, or raw report. Those artifacts were
written under `/tmp` and are gone.

The full recovery inventory is frozen in
[`studies/v0.1.0-baseline/artifact-inventory.md`](../studies/v0.1.0-baseline/artifact-inventory.md).
The tables below are retained only to document what v0.1 previously claimed.
They must not be cited as reproducible results, ecosystem prevalence, confirmed
vulnerabilities, or measured scanner accuracy.

## Archived aggregate output

The historical report stated:

| Severity | Findings |
| -------- | -------: |
| Critical |       13 |
| High     |       69 |
| Medium   |      225 |
| Low      |        0 |

It grouped repositories by their worst scanner rating as:

| Worst severity | Repositories | Reported share |
| -------------- | -----------: | -------------: |
| Critical       |            8 |            11% |
| High           |           32 |            43% |
| Medium         |           35 |            47% |
| Clean          |            0 |             0% |

And it reported these rule totals:

| Count | Rule                                |
| ----: | ----------------------------------- |
|    90 | `agentci/unpinned-ai-action`        |
|    82 | `agentci/ai-with-secrets`           |
|    57 | `agentci/ai-shell-access`           |
|    53 | `agentci/broad-write-permissions`   |
|    11 | `agentci/untrusted-input-in-prompt` |
|    11 | `agentci/untrusted-ai-write-token`  |
|     2 | `agentci/pull-request-target-ai`    |
|     1 | `agentci/unsafe-checkout`           |

These are unverified scanner counts. They are not labels.

## What the exploratory pass did reveal

The transcript supports a narrower engineering observation: reading selected
workflows exposed at least three implementation mistakes in v0.1:

1. `id-token: write` was treated as repository write capability.
2. untrusted text referenced only inside `if:` was treated as a prompt sink;
3. `ai-with-secrets` had been assigned an unjustifiably high severity.

The old scanner's reported critical count changed from 59 to 13 after code and
severity changes. Without the raw pre/post outputs and human labels, that change
cannot be called a measured false-positive reduction.

A later informal triage also suggested that action-level authorization gates
could make some matched patterns unreachable. That triage was not preserved as
a labeled dataset either, so no exploitability or prevalence claim survives.

## Replacement

v0.1.1 uses:

- a public synthetic adversarial corpus for known semantic regressions;
- a frozen, licensed real-workflow candidate corpus with fixed commits and
  hashes;
- repository-disjoint development/evaluation splits;
- two independent human annotators plus adjudication;
- scripts for precision, recall, F1, support, confidence intervals, analysis
  coverage, diagnostics, and error taxonomy.

The replacement benchmark remains **unscored** until the required human labels
exist. No accuracy number should appear in project claims before that point.
