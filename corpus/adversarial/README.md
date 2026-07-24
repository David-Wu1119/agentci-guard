# AgentCI Guard Adversarial Corpus

This corpus contains synthetic workflows designed to break specific scanner
assumptions. Every case is public, minimal, and checked in CI through
`tests/adversarial-corpus.test.ts`.

This is **not an accuracy benchmark**:

- cases were written with knowledge of the implementation;
- cases are deliberately small and adversarial;
- labels are rule-regression expectations, not independent human judgments;
- multiple cases are variants of the same semantic edge.

The corpus answers “did a known bug return?” It cannot answer “how accurate is
AgentCI Guard on real workflows?” The frozen human-labeled benchmark under
`benchmark/` serves that separate purpose.

Case definitions and expected outputs are in [`manifest.json`](manifest.json).
