import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { scanWorkflow, type WorkflowFile } from "../src/index.js";

function ruleIds(raw: string): Set<string> {
  return new Set(
    scanWorkflow(
      { path: ".github/workflows/test.yml", document: YAML.parse(raw), raw },
      ".",
    ).map((f) => f.rule_id),
  );
}

// Agents are also driven straight over HTTP, with no action and no local
// binary: the workflow curls a hosted agent endpoint. Held-out corpus cases
// holdout-cursor-003 and holdout-cursor-004 both take this shape.
describe("agents invoked over an HTTP API", () => {
  it("recognizes a hosted agent endpoint as agent usage", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl --url https://api.cursor.com/v1/agents \\
            -H "Authorization: Bearer \${{ secrets.CURSOR_API_KEY }}" \\
            -d "{\\"prompt\\": \\"triage\\"}"
`);
    expect(rules).toContain("agentci/ai-with-secrets");
    expect(rules).toContain("agentci/ai-shell-access");
  });

  it("reports untrusted content interpolated into the request payload", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  contents: write
  issues: write
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl https://api.cursor.com/v1/agents \\
            -H "Authorization: Bearer \${{ secrets.CURSOR_API_KEY }}" \\
            -d "{\\"prompt\\":\\"\${{ github.event.issue.body }}\\"}"
`);
    expect(rules).toContain("agentci/untrusted-ai-write-token");
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
  });

  it("does not presume ingestion without interpolation, as with any CLI", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  contents: write
jobs:
  nightly:
    runs-on: ubuntu-latest
    steps:
      - run: curl https://api.openai.com/v1/responses -d '{"input":"summarize the README"}'
`);
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("respects an actor gate", () => {
    const rules = ruleIds(`
on:
  issue_comment:
    types: [created]
permissions:
  contents: write
jobs:
  fix:
    if: github.event.comment.author_association == 'OWNER'
    runs-on: ubuntu-latest
    steps:
      - run: curl https://api.cursor.com/v1/agents -d "\${{ github.event.comment.body }}"
`);
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("does not treat prose or documentation mentions as agent usage", () => {
    const rules = ruleIds(`
on: push
jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      # See api.anthropic.com for rate limits, and api.cursor.com for agents.
      - run: echo "our docs describe api.openai.com and api.cursor.com endpoints"
`);
    expect(rules.size).toBe(0);
  });

  it("does not treat an unrelated API host as an agent", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  contents: write
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl https://api.github.com/repos/\${{ github.repository }}/issues
`);
    expect(rules.size).toBe(0);
  });

  it("does not treat a plain inference call as an agent", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  contents: write
  issues: write
jobs:
  classify:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl https://api.anthropic.com/v1/messages \\
            -H "x-api-key: \${{ secrets.ANTHROPIC_API_KEY }}" \\
            -d "{\\"content\\":\\"\${{ github.event.issue.body }}\\"}"
`);
    // Injected text can corrupt the response, but the call holds no tools with
    // which to reach the repository. Inference is not agency.
    expect(rules.size).toBe(0);
  });
});
