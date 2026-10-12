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
  // The workflow token is read-only, but the full Action can exchange OIDC
  // for a separate write-capable App token when github_token is omitted.
  const appTokenPattern = `
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
      - uses: anthropics/claude-code-action@1d6de8cb0c237e7c15e9e1bdf973826ebae490cc
        with:
          claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
`;

  it("reports possible App-token write while keeping workflow-token breadth negative", () => {
    const rules = rulesFor(appTokenPattern);
    expect(rules.has("agentci/untrusted-ai-write-token")).toBe(true);
    expect(rules.has("agentci/broad-write-permissions")).toBe(false);
  });

  it("does not infer an App token when the Action is given the read-only workflow token", () => {
    const rules = rulesFor(
      appTokenPattern.replace(
        "claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}",
        "github_token: ${{ github.token }}",
      ),
    );
    expect(rules.has("agentci/untrusted-ai-write-token")).toBe(false);
    expect(rules.has("agentci/gated-ai-write-token")).toBe(false);
    expect(rules.has("agentci/broad-write-permissions")).toBe(false);
  });

  it("does not treat untrusted content in an if: guard as a prompt sink", () => {
    const rules = rulesFor(appTokenPattern);
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
    // contents:write is a sensitive scope, so a write-token finding fires; the
    // bare claude-code-action fixture yields the gated (high) variant.
    expect(
      rules.has("agentci/untrusted-ai-write-token") ||
        rules.has("agentci/gated-ai-write-token"),
    ).toBe(true);
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
