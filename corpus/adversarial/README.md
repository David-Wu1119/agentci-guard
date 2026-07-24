# AgentCI Guard Adversarial Corpus

This corpus contains synthetic workflows designed to break specific scanner
assumptions. All 31 cases are public, minimal, and checked in CI through
`tests/adversarial-corpus.test.ts`.

This is **not an accuracy benchmark**:

- cases were written with knowledge of the implementation;
- cases are deliberately small and adversarial;
- labels are rule-regression expectations, not independent human judgments;
- multiple cases are variants of the same semantic edge.

The corpus answers “did a known bug return?” It cannot answer “how accurate is
AgentCI Guard on real workflows?” The frozen human-labeled benchmark under
`benchmark/` serves that separate purpose.

The version-2 manifest records each case's target, subject location, reachable
events, exact finding rule and severity, diagnostic and analysis status,
rationale, and primary/project assumption sources. CI validates the metadata
and exact scanner outcomes; it also directly checks job reachability for
non-reusable workflows.

Case definitions and expected outputs are in [`manifest.json`](manifest.json).
