# Day 2 — actor-gate propagation to `pull-request-target-ai`

- Regression: `tests/prt-step-gate.test.ts` (8 tests). Before the fix: 2 failed (`regression-before-fix.txt`). After: 8 passed (`regression-after-fix.txt`).
- Fix: `src/scanner.ts` — `pull-request-target-ai` now fires only if some agent step is reachable on `pull_request_target` with neither a job-level nor a step-level recognized actor gate. Other steps (unsafe checkout, another agent) keep their own gate judgment.
- Behavioral effect on the frozen benchmark: **0 of 152 cases changed** (`behavior-diff.md`). Explanation: the only benchmark workflow with an `if:` adjacent to an agent step under `pull_request_target` is `ai-032` (webframp/swamp-extensions), whose step condition is an event-name/provenance test the model already treated at job scope, not a step-level actor gate; no case exercises the corrected path. The fix is therefore validated by the regression suite, not by a benchmark movement.
