import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { scanWorkflow, type WorkflowFile } from "../src/index.js";
import { parseWorkflowFile, scanWorkflowFiles } from "../src/scanner.js";

const VERIFIED_TAG_REF = "1d6de8cb0c237e7c15e9e1bdf973826ebae490cc";

function ruleIds(raw: string): Set<string> {
  return new Set(
    scanWorkflow(
      { path: ".github/workflows/test.yml", document: YAML.parse(raw), raw },
      ".",
    ).map((f) => f.rule_id),
  );
}

// The dominant real-world shape: the agent action fetches issue, comment, and
// pull-request content itself through its own token, so the workflow contains
// no interpolation of untrusted context for a static reader to find. With
// anthropics/claude-code-action's default write-access gate intact, the
// parent content may have a different author from the trigger actor.
describe("agent actions that fetch untrusted content themselves", () => {
  it("flags an agent action reachable on an untrusted event with write permissions", () => {
    const rules = ruleIds(`
on:
  issue_comment:
    types: [created]
permissions:
  contents: write
  issues: write
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_TAG_REF}
        with:
          claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
`);
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });

  it("does not mislabel self-fetched content as prompt interpolation", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  issues: write
jobs:
  dedupe:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_TAG_REF}
        with:
          claude_code_oauth_token: \${{ secrets.TOKEN }}
`);
    expect(rules).toContain("agentci/gated-ai-write-token");
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
  });

  it("still reports interpolated untrusted input as prompt injection", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  issues: write
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_TAG_REF}
        with:
          prompt: "Fix \${{ github.event.issue.title }}"
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/gated-ai-write-token");
  });

  it("respects an actor gate on a self-fetching agent action", () => {
    const rules = ruleIds(`
on:
  issue_comment:
    types: [created]
permissions:
  contents: write
jobs:
  claude:
    if: github.event.comment.author_association == 'OWNER'
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_TAG_REF}
        with:
          claude_code_oauth_token: \${{ secrets.TOKEN }}
`);
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });

  it.each([
    "anthropics/claude-code-action@v1",
    "anthropics/claude-code-base-action@beta",
  ])("does not invent self-fetching for a static prompt on %s", (action) => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  contents: write
jobs:
  summarize:
    runs-on: ubuntu-latest
    steps:
      - uses: ${action}
        with:
          prompt: Summarize the repository README
`);
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules).not.toContain("agentci/gated-ai-write-token");
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
  });

  it.each([
    ["issues", "labeled", "Bash(gh issue view:*)", true],
    ["issues", "labeled", "Bash(git log:*)", false],
    ["issue_comment", "created", "Bash(gh issue view:*)", true],
  ])(
    "keeps explicit Issue-tool ingestion uncertain on %s with %s",
    (event, activity, tool, mayReadIssue) => {
      const raw = `
on:
  ${event}:
    types: [${activity}]
permissions:
  issues: write
  id-token: write
jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          prompt: "Read issue #\${{ github.event.issue.number }} with gh issue view"
          claude_args: '--allowedTools "${tool}"'
`;
      const result = scanWorkflowFiles(
        [parseWorkflowFile(".github/workflows/agent.yml", raw)],
        ".",
        { ignore: [], ignorePaths: [] },
      );
      expect(
        result.findings.some(
          (finding) => finding.rule_id === "agentci/untrusted-ai-write-token",
        ),
      ).toBe(false);
      expect(
        result.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === "agentci/analysis-agent-tool-fetch-unknown",
        ),
      ).toBe(mayReadIssue);
      expect(result.analysis_complete).toBe(!mayReadIssue);
    },
  );

  it.each([
    ["787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251", "", false],
    [
      "787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251",
      "allowed_non_write_users: '*'",
      true,
    ],
    ["v1", "", true],
  ])(
    "uses only a verified %s actor gate on a newly opened Issue (%s)",
    (actionRef, bypass, uncertain) => {
      const raw = `
on:
  issues:
    types: [opened]
permissions:
  issues: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${actionRef}
        with:
          github_token: \${{ secrets.GITHUB_TOKEN }}
          prompt: "Read issue #\${{ github.event.issue.number }} with gh issue view"
          claude_args: '--allowedTools "Bash(gh issue view:*)"'
          ${bypass}
`;
      const result = scanWorkflowFiles(
        [parseWorkflowFile(".github/workflows/agent.yml", raw)],
        ".",
        { ignore: [], ignorePaths: [] },
      );
      expect(
        result.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === "agentci/analysis-agent-tool-fetch-unknown",
        ),
      ).toBe(uncertain);
    },
  );

  it("keeps tag-mode ingestion possible when a dynamic prompt can resolve empty", () => {
    const rules = ruleIds(`
on: issue_comment
permissions:
  contents: write
jobs:
  summarize:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_TAG_REF}
        with:
          prompt: "\${{ vars.CLAUDE_PROMPT }}"
`);
    expect(rules).toContain("agentci/untrusted-ai-write-token");
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
  });

  it("does not let a same-repo PR head gate sanitize earlier review comments fetched in tag mode", () => {
    const rules = ruleIds(`
on: pull_request_review_comment
permissions:
  contents: write
jobs:
  review:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_TAG_REF}
`);
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });

  it("keeps fork changed-file context untrusted when the owner opens a PR in tag mode", () => {
    const rules = ruleIds(`
on:
  pull_request:
    types: [opened]
permissions:
  contents: write
jobs:
  review:
    if: github.actor == github.repository_owner
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_TAG_REF}
        with:
          track_progress: true
`);
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });

  it("does not flag an agent action on a trusted event", () => {
    const rules = ruleIds(`
on:
  push:
    branches: [main]
permissions:
  contents: write
jobs:
  nightly:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: \${{ secrets.TOKEN }}
`);
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("does not presume ingestion for a CLI invocation with no untrusted input", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  contents: write
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - run: claude -p "Summarize the repository README"
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
`);
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("does not flag a self-fetching agent action without a write scope", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  contents: read
  issues: read
jobs:
  classify:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: \${{ secrets.TOKEN }}
`);
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });
});
