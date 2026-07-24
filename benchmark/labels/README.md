# Human Label Files

Required files before scoring:

- `annotator-a.jsonl`
- `annotator-b.jsonl`
- `adjudicated.jsonl`

Each line represents one benchmark case:

```json
{
  "case_id": "ai-001",
  "annotator": "stable-pseudonym",
  "labels": {
    "agentci/untrusted-ai-write-token": "positive",
    "agentci/pull-request-target-ai": "negative",
    "agentci/ai-with-secrets": "uncertain"
  },
  "rationales": {
    "agentci/untrusted-ai-write-token": "One sentence tied to workflow lines."
  },
  "error_types": {},
  "notes": ""
}
```

Every case must contain all rule IDs. `uncertain` labels are retained for
coverage reporting and excluded from precision/recall denominators. The
adjudicated file uses `annotator: "adjudicated"` and should use `uncertain` only
when the static artifact genuinely cannot decide the rule.

Recommended error types for adjudication:

- `agent-detection`
- `event-reachability`
- `environment-resolution`
- `permission-resolution`
- `secret-flow`
- `shell-semantics`
- `reusable-workflow`
- `checkout-semantics`
- `parser-or-location`
- `rule-definition-ambiguity`
- `other`
