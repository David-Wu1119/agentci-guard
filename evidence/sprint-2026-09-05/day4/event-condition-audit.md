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

Reading: `narrowEvents` marks a condition incomplete whenever `evaluateEventCondition` returns "unknown" for any event, which happens for every atom the event grammar does not know. A condition that mentions no `github.event_name` or `github.event.*` cannot exclude an event, so its conservative reading is exact; flagging it as incomplete is noise with respect to event reachability. Fixing this changes `analysis_complete` on 27–86 benchmark cases and is a detector-contract change; not done in the frozen candidate.
