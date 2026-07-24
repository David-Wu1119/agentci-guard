# Human Label Package

No label files exist yet. Accuracy must remain unreported until the following
three files are published together:

- `annotator-a.jsonl`: all 7,056 primary units.
- `annotator-b.jsonl`: the 5,676-unit independent-review plan.
- `adjudicated.jsonl`: all primary units with source-review provenance.

Each JSONL line follows
`../schemas/annotation-record.schema.json`. Example:

```json
{
  "schema_version": 2,
  "unit_id": "ai-001|step|claude|1|agentci%2Fagent-usage",
  "case_id": "ai-001",
  "split": "eval",
  "workflow_file": ".github/workflows/claude.yml",
  "scope": "step",
  "job_id": "claude",
  "step_index": 1,
  "step_name": "Run Claude",
  "rule_id": "agentci/agent-usage",
  "ground_truth": "positive",
  "reachability": "reachable",
  "triggers": ["issue_comment"],
  "effective_permissions": {
    "status": "known",
    "description": "contents read; issues write"
  },
  "untrusted_source": {
    "status": "present",
    "description": "github.event.comment.body"
  },
  "agent_sink": {
    "status": "present",
    "description": "anthropics/claude-code-action"
  },
  "capability": {
    "status": "present",
    "description": "AI Action invocation"
  },
  "mitigation": {
    "status": "absent",
    "description": ""
  },
  "evidence_lines": [
    {
      "file": ".github/workflows/claude.yml",
      "start": 20,
      "end": 27
    }
  ],
  "explanation": "The reachable step invokes the Claude coding-agent Action.",
  "annotator": "reviewer-a",
  "adjudicator": null,
  "review_status": "independent",
  "notes": ""
}
```

The final file uses `annotator: "adjudicated"`, preserves abbreviated source
annotations, and names a stable human `adjudicator` pseudonym on disputed
records. `review_status` is one of:

- `single-pass`
- `independently-reviewed`
- `adjudicated`

After the first sealed evaluation, `error-analysis-eval.csv` must classify
every generated error according to `../../ERROR_ANALYSIS.md`.
