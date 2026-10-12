import { describe, expect, it } from "vitest";
import { parseWorkflowFile, scanWorkflowFiles } from "../src/scanner.js";

const VERIFIED = "1d6de8cb0c237e7c15e9e1bdf973826ebae490cc";

function scan(action: string, prompt = "", trigger = "issue_comment") {
  const raw = `
on: ${trigger}
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: ${action}
        with:
          ${prompt ? `prompt: ${prompt}` : "claude_code_oauth_token: token"}
`;
  return scanWorkflowFiles(
    [parseWorkflowFile(".github/workflows/review.yml", raw)],
    ".",
    { ignore: [], ignorePaths: [] },
  );
}

const rules = (result: ReturnType<typeof scan>) =>
  result.findings.map((finding) => finding.rule_id);
const diagnostics = (result: ReturnType<typeof scan>) =>
  result.diagnostics.map((diagnostic) => diagnostic.code);

describe("version-specific implicit event ingestion", () => {
  it.each([
    "anthropics/claude-code-action@v1",
    "OpenHands/extensions/plugins/pr-review@main",
    "anthropics/claude-code-base-action@v1",
  ])("abstains rather than asserting implicit ingestion for %s", (action) => {
    const result = scan(action);
    expect(result.agent_usages).toHaveLength(1);
    expect(rules(result)).toContain("agentci/broad-write-permissions");
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules(result)).not.toContain("agentci/gated-ai-write-token");
    expect(diagnostics(result)).toContain(
      "agentci/analysis-agent-implicit-ingestion-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps verified tag-mode ingestion determinate", () => {
    const result = scan(`anthropics/claude-code-action@${VERIFIED}`);
    expect(rules(result)).toContain("agentci/untrusted-ai-write-token");
    expect(diagnostics(result)).not.toContain(
      "agentci/analysis-agent-implicit-ingestion-unknown",
    );
  });

  it("keeps explicit interpolation definite but does not assume an unverified actor gate", () => {
    const result = scan(
      "anthropics/claude-code-action@v1",
      '"Reply to ${{ github.event.comment.body }}"',
    );
    expect(rules(result)).toContain("agentci/untrusted-input-in-prompt");
    expect(rules(result)).toContain("agentci/untrusted-ai-write-token");
    expect(rules(result)).not.toContain("agentci/gated-ai-write-token");
    expect(diagnostics(result)).toContain(
      "agentci/analysis-agent-implicit-ingestion-unknown",
    );
  });

  it("does not promote a verified gated path to critical because another Action has an unknown implicit path", () => {
    const raw = `
on: issue_comment
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED}
        with:
          prompt: "Reply to \${{ github.event.comment.body }}"
      - uses: anthropics/claude-code-action@v1
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules(result)).not.toContain("agentci/gated-ai-write-token");
    expect(diagnostics(result)).toContain(
      "agentci/analysis-agent-implicit-ingestion-unknown",
    );
  });

  it.each([
    [
      "an unverified Action",
      "uses: anthropics/claude-code-action@v1",
      "agentci/analysis-agent-implicit-ingestion-unknown",
    ],
    [
      "an unresolved CLI input",
      "env:\n          REQUEST: \${{ github.event.issue.body }}\n        run: claude -p fixed",
      "agentci/analysis-run-dataflow-unknown",
    ],
    [
      "a run step expanding untrusted text",
      'run: echo "\${{ github.event.issue.body }}"',
      undefined,
    ],
  ])(
    "keeps a proven gated comment path when %s runs only on issues",
    (_name, secondStep, diagnostic) => {
      const raw = `
on: [issue_comment, issues]
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - if: github.event_name == 'issue_comment'
        uses: anthropics/claude-code-action@${VERIFIED}
        with:
          prompt: "Reply to \${{ github.event.comment.body }}"
      - if: github.event_name == 'issues'
        ${secondStep}
`;
      const result = scanWorkflowFiles(
        [parseWorkflowFile(".github/workflows/review.yml", raw)],
        ".",
        { ignore: [], ignorePaths: [] },
      );
      expect(rules(result)).toContain("agentci/gated-ai-write-token");
      expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
      expect(
        result.findings.find(
          (finding) => finding.rule_id === "agentci/gated-ai-write-token",
        )?.reachable_events,
      ).toEqual(["issue_comment"]);
      if (diagnostic) expect(diagnostics(result)).toContain(diagnostic);
    },
  );

  it("does not claim every path is gated when another Action may fetch the Issue through a tool", () => {
    const raw = `
on:
  issues:
    types: [opened]
permissions:
  contents: write
  id-token: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED}
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          github_token: \${{ secrets.GITHUB_TOKEN }}
          allowed_non_write_users: '*'
          prompt: 'Read issue #\${{ github.event.issue.number }} with gh issue view'
          claude_args: '--allowedTools "Bash(gh issue view:*)"'
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules(result)).not.toContain("agentci/gated-ai-write-token");
    expect(diagnostics(result)).toContain(
      "agentci/analysis-agent-tool-fetch-unknown",
    );
  });

  it("keeps tool-fetch uncertainty even when the same Action has a known gated comment input", () => {
    const raw = `
on: issue_comment
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          github_token: \${{ secrets.GITHUB_TOKEN }}
          prompt: 'Reply to \${{ github.event.comment.body }}; read issue #\${{ github.event.issue.number }}'
          claude_args: '--allowedTools "Bash(gh issue view:*)"'
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules(result)).not.toContain("agentci/gated-ai-write-token");
    expect(diagnostics(result)).toContain(
      "agentci/analysis-agent-tool-fetch-unknown",
    );
  });

  it("limits tool-fetch uncertainty to the event whose parent Issue may differ from the trigger actor", () => {
    const raw = `
on:
  issues:
    types: [opened]
  issue_comment:
    types: [created]
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          github_token: \${{ secrets.GITHUB_TOKEN }}
          prompt: 'Reply to \${{ github.event.issue.body }}; read issue #\${{ github.event.issue.number }} with gh issue view'
          claude_args: '--allowedTools "Bash(gh issue view:*)"'
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(
      result.findings.find(
        (finding) => finding.rule_id === "agentci/gated-ai-write-token",
      )?.reachable_events,
    ).toEqual(["issues"]);
    expect(
      result.findings.find(
        (finding) => finding.rule_id === "agentci/untrusted-ai-write-token",
      )?.reachable_events,
    ).toEqual(["issue_comment"]);
    expect(diagnostics(result)).toContain(
      "agentci/analysis-agent-tool-fetch-unknown",
    );
  });

  it("limits inherited CLI input uncertainty to the event carrying that input", () => {
    const raw = `
on:
  issues:
    types: [opened]
  issue_comment:
    types: [created]
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - if: github.event_name == 'issues'
        uses: anthropics/claude-code-action@${VERIFIED}
        with:
          prompt: 'Reply to \${{ github.event.issue.body }}'
      - env:
          REQUEST: \${{ github.event.comment.body }}
        run: claude -p fixed
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(
      result.findings.find(
        (finding) => finding.rule_id === "agentci/gated-ai-write-token",
      )?.reachable_events,
    ).toEqual(["issues"]);
    expect(diagnostics(result)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("does not let a direct comment input hide an unresolved inherited Issue input", () => {
    const raw = `
on:
  issues:
    types: [opened]
  issue_comment:
    types: [created]
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - if: github.event_name == 'issues'
        uses: anthropics/claude-code-action@${VERIFIED}
        with:
          prompt: 'Reply to \${{ github.event.issue.body }}'
      - env:
          DIRECT: \${{ github.event.comment.body }}
          INHERITED: \${{ github.event.issue.body }}
        run: claude -p "$DIRECT"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(rules(result)).not.toContain("agentci/gated-ai-write-token");
    expect(diagnostics(result)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps a second inherited variable unresolved even when the CLI directly uses the same event", () => {
    const raw = `
on: issues
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - env:
          DIRECT: \${{ github.event.issue.title }}
          INHERITED: \${{ github.event.issue.body }}
        run: claude -p "$DIRECT"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(rules(result)).toContain("agentci/untrusted-ai-write-token");
    expect(diagnostics(result)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("does not trust a YAML env value after an untrusted shell assignment overrides it", () => {
    const raw = `
on: [issues, issue_comment]
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    env:
      REQUEST: safe
    steps:
      - if: github.event_name == 'issue_comment'
        uses: anthropics/claude-code-action@${VERIFIED}
        with:
          prompt: 'Reply to \${{ github.event.comment.body }}'
      - if: github.event_name == 'issues'
        run: |
          REQUEST="\${{ github.event.issue.body }}"
          claude -p "$REQUEST"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(
      result.findings.find(
        (finding) => finding.rule_id === "agentci/gated-ai-write-token",
      )?.reachable_events,
    ).toEqual(["issue_comment"]);
    expect(diagnostics(result)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("does not call an agent clean after a prior step writes untrusted text to GITHUB_ENV", () => {
    const raw = `
on: issues
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - run: echo "REQUEST=\${{ github.event.issue.body }}" >> "$GITHUB_ENV"
      - run: claude -p "$REQUEST"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("does not treat an unused untrusted or secret env value as a literal GITHUB_ENV export", () => {
    const raw = `
on:
  issues:
    types: [opened]
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - env:
          TITLE: \${{ github.event.issue.title }}
          UNUSED_TOKEN: \${{ secrets.SERVICE_TOKEN }}
        run: echo "SAFE=ok" >> "$GITHUB_ENV"
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Reply to \${{ github.event.issue.body }}"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).not.toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
    expect(diagnostics(result)).not.toContain(
      "agentci/analysis-secret-env-transfer-unknown",
    );
    expect(rules(result)).toContain("agentci/gated-ai-write-token");
    expect(result.analysis_complete).toBe(true);
  });

  it("does not exempt a literal echo when BASH_ENV can change its behavior", () => {
    const raw = `
on:
  issues:
    types: [opened]
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - env:
          TITLE: \${{ github.event.issue.title }}
          BASH_ENV: ./hooks/agent.sh
        run: echo "SAFE=ok" >> "$GITHUB_ENV"
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Reply to \${{ github.event.issue.body }}"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("does not exempt a later literal echo after a prior step can change Bash startup", () => {
    const raw = `
on:
  issues:
    types: [opened]
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - run: echo "BASH_ENV=./hooks/agent.sh" >> "$GITHUB_ENV"
      - env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "SAFE=ok" >> "$GITHUB_ENV"
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Reply to \${{ github.event.issue.body }}"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it.each([
    'echo "REQUEST=$TITLE" >> "$GITHUB_ENV"',
    'env >> "$GITHUB_ENV"',
    'printenv >> "$GITHUB_ENV"',
    'env | tee -a "$GITHUB_ENV"',
    'env > /tmp/all; cat /tmp/all >> "$GITHUB_ENV"',
    'echo\n"SAFE=ok" >> "$GITHUB_ENV"',
  ])("keeps an unresolved inherited input when %s exports step env", (run) => {
    const script = run
      .split("\n")
      .map((line) => `          ${line}`)
      .join("\n");
    const raw = `
on:
  issues:
    types: [opened]
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - env:
          TITLE: \${{ github.event.issue.title }}
        run: |
${script}
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Reply to \${{ github.event.issue.body }}"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("does not call a job gated when another agent has unresolved inherited untrusted input", () => {
    const raw = `
on: issue_comment
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED}
        with:
          prompt: 'Reply to \${{ github.event.comment.body }}'
      - env:
          REQUEST: \${{ github.event.comment.body }}
        run: claude -p fixed
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules(result)).not.toContain("agentci/gated-ai-write-token");
    expect(diagnostics(result)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("does not abstain on trusted-only events", () => {
    const result = scan("anthropics/claude-code-action@v1", "", "push");
    expect(diagnostics(result)).not.toContain(
      "agentci/analysis-agent-implicit-ingestion-unknown",
    );
  });

  it("does not invent write-token uncertainty for known read-only permissions", () => {
    const result = scan("anthropics/claude-code-action@v1");
    const readOnly = scanWorkflowFiles(
      [
        parseWorkflowFile(
          ".github/workflows/review.yml",
          `on: issue_comment\npermissions:\n  contents: read\njobs:\n  review:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: anthropics/claude-code-action@v1\n`,
        ),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(result.analysis_complete).toBe(false);
    expect(diagnostics(readOnly)).not.toContain(
      "agentci/analysis-agent-implicit-ingestion-unknown",
    );
  });
});
