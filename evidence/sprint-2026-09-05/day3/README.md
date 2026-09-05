# Day 3 — completeness through every output surface

Problem: an incomplete zero-finding scan was distinguishable from a clean one in JSON and text, but not in SARIF (findings only), not in the organization summary table ("Repositories clean" counted incomplete repositories), and not visibly in the Action log.

- Regression: `tests/completeness.test.ts` (8), two new cases in `tests/org.test.ts`, one new schema case in `tests/sarif-schema.test.ts`. Before the fix: 7 of the 8 completeness tests failed (`regression-before-fix.txt`); the one that passed is the compatibility case (a bare findings array still renders). After: all pass (`regression-after-fix.txt`); full `pnpm check` green, 215 tests (`check.txt`).
- SARIF: `toSarif` accepts a scan result; the run gains `invocations[0].executionSuccessful` (= `analysis_complete`) and one `toolExecutionNotification` per diagnostic, plus `agentci/analysisComplete` / `agentci/diagnosticCount` properties. Validated against the vendored OASIS 2.1.0 schema both in tests and on a real benchmark case with findings and a diagnostic (`sample-ai-001.sarif`: 3 results, `executionSuccessful: false`, 1 notification).
- Organization: `categories` (five, summing to `scanned_count`) and `diagnostics` (repository-prefixed) on the result; the report table shows the five categories instead of "clean".
- Action: `::warning::` annotation + step-summary note when incomplete. Exit codes unchanged.
- CLI: text says `Analysis: incomplete (N diagnostic(s))`; `scan` and `org` write the whole-scan SARIF form.
- Benchmark: `behavior-diff.md` — 0 of 152 cases changed against Day 2, as expected for a change that adds no detection.
