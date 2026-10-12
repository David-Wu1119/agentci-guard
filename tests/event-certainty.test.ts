import { describe, expect, it } from "vitest";
import { parseWorkflowFile, scanWorkflowFiles } from "../src/scanner.js";

const config = { ignore: [], ignorePaths: [] };

function scan(raw: string) {
  return scanWorkflowFiles(
    [parseWorkflowFile("/repo/.github/workflows/agent.yml", raw)],
    "/repo",
    config,
  );
}

describe("event predicate certainty", () => {
  it("marks a finding only possible when its sole event path depends on an unknown job condition", () => {
    const result = scan(`
on: [push, pull_request_target]
permissions:
  contents: write
jobs:
  agent:
    if: github.event_name == 'pull_request_target' && github.repository == 'owner/repo'
    runs-on: ubuntu-latest
    steps:
      - run: codex exec hello
`);

    expect(result.agent_usages[0]?.reachable_events).toEqual([
      "pull_request_target",
    ]);
    expect(result.agent_usages[0]?.uncertain_reachable_events).toEqual([
      "pull_request_target",
    ]);
    expect(
      result.findings.find(
        (finding) => finding.rule_id === "agentci/pull-request-target-ai",
      )?.uncertain_reachable_events,
    ).toEqual(["pull_request_target"]);
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps the known event certain when another event is only possible", () => {
    const result = scan(`
on: [push, pull_request_target]
permissions:
  contents: write
jobs:
  agent:
    if: github.event_name == 'pull_request_target' || github.repository == 'owner/repo'
    runs-on: ubuntu-latest
    steps:
      - run: codex exec hello
`);

    expect(result.agent_usages[0]?.reachable_events).toEqual([
      "push",
      "pull_request_target",
    ]);
    expect(result.agent_usages[0]?.uncertain_reachable_events).toEqual([
      "push",
    ]);
    expect(
      result.findings.find(
        (finding) => finding.rule_id === "agentci/pull-request-target-ai",
      )?.uncertain_reachable_events,
    ).toBeUndefined();
  });

  it("prunes an inherited unknown event and lets a certain witness establish job findings", () => {
    const pruned = scan(`
on: [push, pull_request_target]
permissions:
  contents: write
jobs:
  agent:
    if: github.repository == 'owner/repo'
    runs-on: ubuntu-latest
    steps:
      - if: github.event_name == 'push'
        run: codex exec hello
`);
    expect(pruned.agent_usages[0]?.reachable_events).toEqual(["push"]);
    expect(pruned.agent_usages[0]?.uncertain_reachable_events).toEqual([
      "push",
    ]);
    expect(
      pruned.findings.some(
        (finding) => finding.rule_id === "agentci/pull-request-target-ai",
      ),
    ).toBe(false);

    const mixed = scan(`
on: pull_request_target
permissions:
  contents: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - if: github.repository == 'owner/repo'
        run: codex exec hello
      - run: codex exec hello
`);
    expect(mixed.agent_usages[0]?.uncertain_reachable_events).toEqual([
      "pull_request_target",
    ]);
    expect(mixed.agent_usages[1]?.uncertain_reachable_events).toBeUndefined();
    expect(
      mixed.findings.find(
        (finding) => finding.rule_id === "agentci/pull-request-target-ai",
      )?.uncertain_reachable_events,
    ).toBeUndefined();
    expect(
      mixed.findings.find(
        (finding) => finding.rule_id === "agentci/broad-write-permissions",
      )?.uncertain_reachable_events,
    ).toBeUndefined();
  });

  it("carries caller uncertainty into a local reusable workflow", () => {
    const result = scanWorkflowFiles(
      [
        parseWorkflowFile(
          "/repo/.github/workflows/caller.yml",
          `
on: issue_comment
jobs:
  call:
    if: github.repository == 'owner/repo'
    permissions:
      issues: write
    uses: ./.github/workflows/child.yml
`,
        ),
        parseWorkflowFile(
          "/repo/.github/workflows/child.yml",
          `
on: workflow_call
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - run: codex exec hello
`,
        ),
      ],
      "/repo",
      config,
    );

    expect(result.agent_usages).toHaveLength(1);
    expect(result.agent_usages[0]?.reachable_events).toEqual(["issue_comment"]);
    expect(result.agent_usages[0]?.uncertain_reachable_events).toEqual([
      "issue_comment",
    ]);
    expect(
      result.findings.find(
        (finding) => finding.rule_id === "agentci/broad-write-permissions",
      )?.uncertain_reachable_events,
    ).toEqual(["issue_comment"]);
  });

  it("uses only rule-relevant witnesses when a job has both possible and certain AI steps", () => {
    const result = scan(`
on: issue_comment
permissions:
  contents: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - if: github.repository == 'owner/repo'
        run: claude -p "\${{ github.event.comment.body }}"
        env:
          API_KEY: \${{ secrets.API_KEY }}
      - run: codex exec hello
`);
    const uncertainty = (rule: string) =>
      result.findings.find((finding) => finding.rule_id === rule)
        ?.uncertain_reachable_events;

    expect(uncertainty("agentci/untrusted-ai-write-token")).toEqual([
      "issue_comment",
    ]);
    expect(uncertainty("agentci/ai-with-secrets")).toEqual(["issue_comment"]);
    expect(uncertainty("agentci/broad-write-permissions")).toBeUndefined();
  });

  it("does not confirm a critical write path from a certain self-gated AI step", () => {
    const result = scan(`
on: issue_comment
permissions:
  contents: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@1d6de8cb0c237e7c15e9e1bdf973826ebae490cc
        with:
          prompt: "Reply \${{ github.event.comment.body }}"
      - if: github.repository == 'owner/repo'
        uses: openai/codex-action@v1
        with:
          prompt: "Reply \${{ github.event.comment.body }}"
`);

    expect(
      result.findings.find(
        (finding) => finding.rule_id === "agentci/untrusted-ai-write-token",
      )?.uncertain_reachable_events,
    ).toEqual(["issue_comment"]);
  });

  it("does not confirm a critical write path from a possible-only run expansion", () => {
    const result = scan(`
on: issue_comment
permissions:
  contents: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - if: github.repository == 'owner/repo'
        run: echo "\${{ github.event.comment.body }}"
      - uses: anthropics/claude-code-action@1d6de8cb0c237e7c15e9e1bdf973826ebae490cc
        with:
          prompt: "Reply \${{ github.event.comment.body }}"
`);

    expect(
      result.findings.find(
        (finding) => finding.rule_id === "agentci/untrusted-ai-write-token",
      )?.uncertain_reachable_events,
    ).toEqual(["issue_comment"]);
  });
});
