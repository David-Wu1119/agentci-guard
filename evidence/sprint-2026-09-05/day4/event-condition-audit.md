# Event-condition diagnostics on the frozen benchmark (v0.5.0 bundle)

Command: `node evidence/sprint-2026-09-05/day4/event-condition-audit.mjs` from the repository root, with `dist/` built from the v0.5.0 detector. Uses a fixed six-event set as an approximation of each workflow's real triggers (the count 283 is within 4 of the 279 diagnostics the scanner itself reports).

```
uninterpretable conditions: 283; of which reference no event at all: 198 (70%)
cases with any such diagnostic: 86; cases whose ONLY such diagnostics are event-free conditions: 27
most common event-free conditions:
  13x  steps.prebuild-cache.outputs.cache-hit != 'true'
  10x  inputs.upload-artifacts
  7x   steps.filter.outputs.skip != 'true'
  6x   steps.detect_smoke.outputs.needed == 'true'
  5x   steps.validate.outputs.proceed == 'true' && steps.count.outputs.attemp
  5x   steps.prebuild-cache.outputs.cache-hit != 'true' && steps.static-cache
  5x   steps.changes.outputs.changed == 'true'
  4x   steps.check-label.outputs.has_label == 'false'
```

Reading (corrected 2026-09-05 after external review): `narrowEvents` marks a condition incomplete whenever `evaluateEventCondition` returns "unknown" for any event, which happens for every atom the event grammar does not know. The earlier claim here — that a condition mentioning no `github.event_name` or `github.event.*` "cannot exclude an event, so its conservative reading is exact" — is **wrong**: a condition can depend on the event indirectly, e.g. `env.IS_PR` set from `${{ github.event_name == 'pull_request' }}` and later `if: env.IS_PR == 'true'` on an agent step, or a step output carrying the same dependency. Suppressing the diagnostic for event-free text would therefore claim a completeness the analyzer has not established. This count (from an approximate pass over a fixed six-event set; the scanner itself emits 279) is an investigation lead about presentation, not proof of redundancy. Any change must either improve aggregation/presentation of these diagnostics or implement a narrowly scoped dependency analysis with its own tests; unresolved runtime checks stay uncertainty.
