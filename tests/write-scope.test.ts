import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { scanWorkflow } from "../src/index.js";
import type { WorkflowFile } from "../src/index.js";

function rulesFor(workflow: string): Set<string> {
  const file: WorkflowFile = {
    path: "/repo/.github/workflows/test.yml",
    raw: workflow,
    document: YAML.parse(workflow),
  };
  return new Set(scanWorkflow(file, "/repo").map((f) => f.rule_id));
}

describe("write-scope precision", () => {
  // The Anthropic-recommended pattern: read-only repo perms, id-token for
  // OIDC, gated on an @claude mention. Must NOT be flagged as write-token risk.
  const safePattern = `
on:
  issue_comment:
    types: [created]
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
`;

  it("does not flag id-token:write as repo-write", () => {
    const rules = rulesFor(safePattern);
    expect(rules.has("agentci/untrusted-ai-write-token")).toBe(false);
    expect(rules.has("agentci/broad-write-permissions")).toBe(false);
  });

  it("does not treat untrusted content in an if: guard as a prompt sink", () => {
    const rules = rulesFor(safePattern);
    expect(rules.has("agentci/untrusted-input-in-prompt")).toBe(false);
  });

  it("still flags contents:write with untrusted content reaching the prompt", () => {
    const rules = rulesFor(`
on: issue_comment
permissions:
  contents: write
jobs:
  claude:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: \${{ github.event.comment.body }}
`);
    expect(rules.has("agentci/untrusted-ai-write-token")).toBe(true);
    expect(rules.has("agentci/untrusted-input-in-prompt")).toBe(true);
    expect(rules.has("agentci/broad-write-permissions")).toBe(true);
  });

  it("flags permissions: write-all", () => {
    const rules = rulesFor(`
on: pull_request_target
permissions: write-all
jobs:
  claude:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: \${{ github.event.pull_request.body }}
`);
    expect(rules.has("agentci/broad-write-permissions")).toBe(true);
  });
});
