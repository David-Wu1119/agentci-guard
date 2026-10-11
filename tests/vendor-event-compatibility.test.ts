import { describe, expect, it } from "vitest";
import { parseWorkflowFile, scanWorkflowFiles } from "../src/scanner.js";

const VERIFIED_REF = "1d6de8cb0c237e7c15e9e1bdf973826ebae490cc";

function scan(raw: string) {
  return scanWorkflowFiles(
    [parseWorkflowFile(".github/workflows/agent.yml", raw)],
    ".",
    { ignore: [], ignorePaths: [] },
  );
}

describe("Anthropic Action discussion-event compatibility", () => {
  it.each([
    ["discussion", "github.event.discussion.body"],
    ["discussion_comment", "github.event.comment.body"],
  ])(
    "does not claim an AI run for the pinned revision on %s",
    (event, source) => {
      const result = scan(`
on: ${event}
permissions:
  discussions: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_REF}
        with:
          prompt: "Fix \${{ ${source} }}"
`);
      expect(result.agent_usages).toEqual([]);
      expect(result.findings).toEqual([]);
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        "agentci/analysis-agent-event-unsupported",
      ]);
      expect(result.analysis_complete).toBe(false);
    },
  );

  it("retains supported events on the same pinned Action step", () => {
    const result = scan(`
on: [discussion, issues]
permissions:
  issues: write
  discussions: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_REF}
        with:
          prompt: "Fix \${{ github.event.issue.body }} or \${{ github.event.discussion.body }}"
`);
    expect(result.agent_usages).toHaveLength(1);
    expect(result.agent_usages[0]?.reachable_events).toEqual(["issues"]);
    expect(result.findings.map((finding) => finding.rule_id)).toContain(
      "agentci/untrusted-ai-write-token",
    );
    expect(
      result.findings.every(
        (finding) =>
          finding.reachable_events?.length === 1 &&
          finding.reachable_events[0] === "issues",
      ),
    ).toBe(true);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "agentci/analysis-agent-event-unsupported",
    ]);
  });

  it("keeps a mutable v1 ref conservative and explicitly incomplete", () => {
    const result = scan(`
on: discussion_comment
permissions:
  discussions: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: "Fix \${{ github.event.comment.body }}"
`);
    expect(result.agent_usages).toHaveLength(1);
    expect(result.findings.map((finding) => finding.rule_id)).toContain(
      "agentci/untrusted-ai-write-token",
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "agentci/analysis-agent-event-unknown",
    ]);
    expect(result.analysis_complete).toBe(false);
  });

  it("still analyzes a CLI agent on discussion events", () => {
    const result = scan(`
on: discussion
permissions:
  discussions: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - run: claude -p "\${{ github.event.discussion.body }}"
`);
    expect(result.agent_usages).toHaveLength(1);
    expect(result.findings.map((finding) => finding.rule_id)).toContain(
      "agentci/untrusted-ai-write-token",
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.analysis_complete).toBe(true);
  });

  it("does not apply the full Action's incompatibility to the base Action", () => {
    const result = scan(`
on: discussion
permissions:
  discussions: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-base-action@${VERIFIED_REF}
        with:
          prompt: "Fix \${{ github.event.discussion.body }}"
`);
    expect(result.agent_usages).toHaveLength(1);
    expect(result.findings.map((finding) => finding.rule_id)).toContain(
      "agentci/untrusted-ai-write-token",
    );
    expect(result.diagnostics).toEqual([]);
  });
});
