# Human Label Package

No formal human label files exist yet. The v3 corpus is development data, and
its scorer rejects `eval` and `all` runs even if labels are added or the
manifest status changes. The following three-file package describes the
**inactive v3 two-human protocol**, not a current accuracy requirement or an
instruction for the sole available annotator:

- `annotator-a.jsonl`: all 7,056 primary units.
- `annotator-b.jsonl`: the 5,676-unit independent-review plan.
- `adjudicated.jsonl`: all primary units with source-review provenance.

Each historical v3 JSONL line follows
`../schemas/annotation-record.schema.json`. The example below illustrates that
schema; its `eval` split and `independent` review status are not instructions to
produce such a record now:

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

Development-pilot source records are not part of this historical formal label
package. They use `test-retest-pass-1` or `test-retest-pass-2` so the raw JSONL
cannot be mistaken for independent human review. Two aliases for the same
person do not create a second annotator.

In that historical package, the final file uses `annotator: "adjudicated"`,
preserves abbreviated source annotations, and names a stable human
`adjudicator` pseudonym on disputed records. `review_status` is one of:

- `single-pass`
- `independently-reviewed`
- `adjudicated`

For formal accuracy, follow the [v4 and sole-human protocol requirements in
`../../BENCHMARK.md`](../../BENCHMARK.md#human-review-protocol). A fresh
repository-disjoint sample, nine-rule registry, versioned human resolution
protocol, and compatible scorer are still needed. The candidate micro-pilot
remains development-only and cannot supply v4 accuracy labels. After a valid
sealed v4 evaluation, classify every generated error according to
`../../ERROR_ANALYSIS.md`; no v4 error-analysis path exists yet.
