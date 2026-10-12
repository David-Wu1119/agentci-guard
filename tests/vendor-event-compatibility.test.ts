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
      expect(result.analysis_complete).toBe(true);
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
    expect(result.analysis_complete).toBe(true);
  });

  it("remains incomplete when an unsupported event accompanies an unresolved condition", () => {
    const result = scan(`
on: discussion
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_REF}
        with:
          prompt: hello
      - if: steps.gate.outputs.ok
        run: echo hello
`);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "agentci/analysis-agent-event-unsupported",
      "agentci/analysis-event-condition",
    ]);
    expect(result.analysis_complete).toBe(false);
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
      "agentci/analysis-agent-implicit-ingestion-unknown",
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
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "agentci/analysis-agent-implicit-ingestion-unknown",
    ]);
    expect(result.analysis_complete).toBe(false);
  });
});

describe("Anthropic Action tracked PR activity compatibility", () => {
  const workflow = (ref: string, activities: string) => `
on:
  pull_request_target:
    types: [${activities}]
permissions:
  contents: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${ref}
        with:
          track_progress: true
`;

  it("excludes a pinned Action that rejects every configured PR activity", () => {
    const result = scan(workflow(VERIFIED_REF, "closed"));
    expect(result.agent_usages).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "agentci/analysis-agent-event-unsupported",
    ]);
    expect(result.analysis_complete).toBe(true);
  });

  it("retains an accepted activity even when another is rejected", () => {
    const result = scan(workflow(VERIFIED_REF, "closed, opened"));
    expect(result.agent_usages).toHaveLength(1);
    expect(result.findings.map((finding) => finding.rule_id)).toContain(
      "agentci/untrusted-ai-write-token",
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("does not claim implicit ingestion for an unverified mutable ref", () => {
    const result = scan(workflow("v1", "closed"));
    expect(result.agent_usages).toHaveLength(1);
    expect(result.findings.map((finding) => finding.rule_id)).not.toContain(
      "agentci/untrusted-ai-write-token",
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "agentci/analysis-agent-implicit-ingestion-unknown",
    );
  });

  it("excludes a pinned PR Action with no prompt or progress trigger", () => {
    const result = scan(
      workflow(VERIFIED_REF, "opened").replace(
        "        with:\n          track_progress: true\n",
        "",
      ),
    );
    expect(result.agent_usages).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.analysis_complete).toBe(true);
  });

  it("retains a pinned PR Action with a prompt in default agent mode", () => {
    const result = scan(
      workflow(VERIFIED_REF, "closed").replace(
        "track_progress: true",
        "prompt: Review this PR",
      ),
    );
    expect(result.agent_usages).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });

  it("does not treat an uppercase progress input as enabled", () => {
    const result = scan(
      workflow(VERIFIED_REF, "closed").replace(
        "track_progress: true",
        'track_progress: "TRUE"\n          prompt: Fix this',
      ),
    );
    expect(result.agent_usages).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
    expect(result.findings.map((finding) => finding.rule_id)).not.toContain(
      "agentci/untrusted-ai-write-token",
    );
  });

  it("does not treat a whitespace-only prompt as absent", () => {
    const result = scan(
      workflow(VERIFIED_REF, "opened").replace(
        "track_progress: true",
        "prompt: '   '",
      ),
    );
    expect(result.agent_usages).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });

  it("does not invent tag-mode ingestion for a whitespace Issue prompt", () => {
    const result = scan(`
on:
  issues:
    types: [opened]
permissions:
  issues: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_REF}
        with:
          prompt: '   '
`);
    expect(result.agent_usages).toHaveLength(1);
    expect(result.findings.map((finding) => finding.rule_id)).not.toContain(
      "agentci/gated-ai-write-token",
    );
  });

  it("excludes a pinned Action when progress tracking rejects the event", () => {
    const result = scan(
      workflow(VERIFIED_REF, "opened").replace(
        "  pull_request_target:\n    types: [opened]",
        "  push:\n    branches: [main]",
      ),
    );
    expect(result.agent_usages).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.analysis_complete).toBe(true);
  });

  it("preserves caller PR activities through a local reusable workflow", () => {
    const caller = parseWorkflowFile(
      ".github/workflows/caller.yml",
      `
on:
  pull_request_target:
    types: [closed]
permissions:
  contents: write
jobs:
  delegate:
    uses: ./.github/workflows/agent.yml
    with:
      progress: true
`,
    );
    const callee = parseWorkflowFile(
      ".github/workflows/agent.yml",
      `
on:
  workflow_call:
    inputs:
      progress:
        type: boolean
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_REF}
        with:
          track_progress: \${{ inputs.progress }}
`,
    );
    const result = scanWorkflowFiles([caller, callee], ".", {
      ignore: [],
      ignorePaths: [],
    });
    expect(result.agent_usages).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "agentci/analysis-agent-event-unsupported",
    );
    expect(result.analysis_complete).toBe(true);
  });
});
