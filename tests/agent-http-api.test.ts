import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  looksLikeAiUsage,
  scanWorkflow,
  scanWorkflowFiles,
} from "../src/index.js";

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
    expect(rules).not.toContain("agentci/ai-shell-access");
  });

  it("does not count status polling as a new agent invocation", () => {
    const rules = ruleIds(`
on: push
jobs:
  poll:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X GET https://api.cursor.com/v1/agents/abc123
`);
    expect(rules.size).toBe(0);
    expect(
      looksLikeAiUsage("curl -X GET https://api.cursor.com/v1/agents"),
    ).toBe(false);
  });

  it("requires a command rather than a quoted endpoint mention", () => {
    expect(
      looksLikeAiUsage("echo 'curl -X POST https://api.cursor.com/v1/agents'"),
    ).toBe(false);
  });

  it("uses documented create routes and methods", () => {
    for (const request of [
      "curl -X POST https://api.cursor.com/v1/agents",
      "curl -X POST https://api.cursor.com/v1/agents/agent-1/runs",
      "curl -X POST https://api.cursor.com/v0/agents",
      "curl --request POST https://api.devin.ai/v1/sessions",
      'curl --request="POST" https://api.cursor.com/v1/agents',
      'curl -d\'{"prompt":"hi"}\' https://api.cursor.com/v1/agents',
      "curl -d '{}' https://api.devin.ai/v3/organizations/org-1/sessions",
      "curl -X POST https://api.github.com/agents/repos/owner/repo/tasks",
    ]) {
      expect(looksLikeAiUsage(request), request).toBe(true);
    }
    for (const request of [
      "curl -X GET https://api.cursor.com/v1/agents",
      "curl -G -d status=active https://api.cursor.com/v1/agents",
      "curl -X GET -d '{}' https://api.cursor.com/v1/agents",
      "curl -X GET https://api.devin.ai/v1/sessions",
      "curl -X GET https://api.devin.ai/v3/organizations/org-1/sessions",
      "curl -X GET https://api.github.com/agents/repos/owner/repo/tasks",
      "curl -X POST https://api.githubcopilot.com/v1/agents",
      "curl -X POST https://api.cursor.com/v1/agents/agent-1",
    ]) {
      expect(looksLikeAiUsage(request), request).toBe(false);
    }
  });

  it("does not let a prior GET hide a later POST command", () => {
    expect(
      looksLikeAiUsage(
        "curl -X GET https://api.cursor.com/v1/agents; curl -X POST https://api.cursor.com/v1/agents",
      ),
    ).toBe(true);
  });

  it("does not treat an endpoint in a request body or heredoc as dispatch", () => {
    expect(
      looksLikeAiUsage(
        `curl -X POST https://example.com -d '{"link":"https://api.cursor.com/v1/agents"}'`,
      ),
    ).toBe(false);
    expect(
      looksLikeAiUsage(
        "cat <<'EOF'\ncurl -X POST https://api.cursor.com/v1/agents\nEOF",
      ),
    ).toBe(false);
  });

  it("recognizes an explicit POST without a request body", () => {
    const raw = `
on: push
jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST --url https://api.cursor.com/v1/agents
`;
    const rules = ruleIds(raw);
    expect(rules).not.toContain("agentci/ai-shell-access");
    const result = scanWorkflowFiles(
      [{ path: ".github/workflows/test.yml", document: YAML.parse(raw), raw }],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(result.agent_usages).toHaveLength(1);
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
