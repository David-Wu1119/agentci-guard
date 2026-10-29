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

  it("does not call a job gated when a hosted agent also ingests the same comment", () => {
    const raw = `
on: issue_comment
permissions:
  contents: write
env:
  BODY: \${{ github.event.comment.body }}
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED}
        with:
          prompt: "Reply to \${{ github.event.comment.body }}"
      - run: curl -X POST https://api.cursor.com/v1/agents -d "$BODY"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(result.agent_usages.map((usage) => usage.kind)).toEqual([
      "action",
      "http",
    ]);
    expect(rules(result)).not.toContain("agentci/gated-ai-write-token");
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
    expect(diagnostics(result)).toContain(
      "agentci/analysis-remote-agent-capability-unknown",
    );
    expect(result.analysis_complete).toBe(false);
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

  it("reports only the critical rule when a run step expanding untrusted text runs only on issues", () => {
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
        run: echo "\${{ github.event.issue.body }}"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    // A confirmed run: expansion defeats the whole-job gated exception even
    // on an event the agent does not ingest (W1c, owner decision A04-D1).
    expect(rules(result)).not.toContain("agentci/gated-ai-write-token");
    expect(
      result.findings.find(
        (finding) => finding.rule_id === "agentci/untrusted-ai-write-token",
      )?.reachable_events,
    ).toEqual(["issue_comment"]);
  });

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
    // The critical issue_comment path defeats the whole-job gated exception.
    expect(
      result.findings.find(
        (finding) => finding.rule_id === "agentci/gated-ai-write-token",
      ),
    ).toBeUndefined();
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
        (finding) => finding.rule_id === "agentci/untrusted-ai-write-token",
      )?.reachable_events,
    ).toEqual(["issue_comment"]);
    expect(rules(result)).not.toContain("agentci/gated-ai-write-token");
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

  it("does not call an agent clean when a prior step output can carry untrusted text", () => {
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
      - id: capture
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "text=$TITLE" >> "$GITHUB_OUTPUT"
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          github_token: \${{ secrets.GITHUB_TOKEN }}
          allowed_non_write_users: "*"
          prompt: "Review \${{ steps.capture.outputs.text }}"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(
      result.diagnostics.find(
        ({ code }) => code === "agentci/analysis-output-provenance-unknown",
      )?.step_index,
    ).toBe(1);
    expect(result.analysis_complete).toBe(false);
    expect(rules(result)).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("does not truncate an output alias after a quoted closing delimiter", () => {
    const raw = `
on: issues
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - id: capture
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "text=$TITLE" >> "$GITHUB_OUTPUT"
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ format('}}', steps.capture.outputs.text) }}"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps a prior output in an AI CLI's inherited environment unresolved", () => {
    const raw = `
on: issues
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - id: capture
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "text=$TITLE" >> "$GITHUB_OUTPUT"
      - env:
          REQUEST: \${{ steps.capture.outputs.text }}
        run: claude -p fixed
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps a prior output used by a same-step CLI shell variable unresolved", () => {
    const raw = `
on: issues
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - id: capture
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "text=$TITLE" >> "$GITHUB_OUTPUT"
      - run: |
          REQUEST=\${{ steps.capture.outputs.text }}
          claude -p "$REQUEST"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps a prior output forwarded through GITHUB_ENV unresolved", () => {
    const raw = `
on: issues
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - id: capture
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "text=$TITLE" >> "$GITHUB_OUTPUT"
      - run: echo "REQUEST=\${{ steps.capture.outputs.text }}" >> "$GITHUB_ENV"
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: fixed
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps an event-derived matrix forwarded through GITHUB_ENV unresolved", () => {
    const raw = `
on: issues
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        text: ["\${{ github.event.issue.title }}"]
    steps:
      - run: echo "REQUEST=\${{ matrix.text }}" >> "$GITHUB_ENV"
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: fixed
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-matrix-provenance-unknown",
    );
    expect(
      result.diagnostics.find(
        ({ code }) => code === "agentci/analysis-matrix-provenance-unknown",
      )?.step_index,
    ).toBe(1);
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps a job-output matrix forwarded through GITHUB_ENV unresolved", () => {
    const raw = `
on: issues
permissions:
  contents: write
jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      matrix: \${{ github.event.issue.title }}
    steps:
      - run: echo done
  review:
    needs: prepare
    runs-on: ubuntu-latest
    strategy:
      matrix: \${{ fromJSON(needs.prepare.outputs.matrix) }}
    steps:
      - run: echo "REQUEST=\${{ matrix.text }}" >> "$GITHUB_ENV"
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: fixed
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(
      result.diagnostics.find(
        ({ code }) => code === "agentci/analysis-output-provenance-unknown",
      )?.step_index,
    ).toBe(1);
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps literal and disjoint-event GITHUB_ENV relays complete", () => {
    const scanRelay = (literal: boolean) => {
      const raw = `
on: [issues, issue_comment]
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - id: capture
        if: github.event_name == 'issues'
        env:
          TITLE: \${{ github.event.issue.title }}
        run: ${literal ? 'echo "text=safe" >> "$GITHUB_OUTPUT"' : 'echo "text=$TITLE" >> "$GITHUB_OUTPUT"'}
      - if: github.event_name == 'issues'
        run: echo "REQUEST=\${{ steps.capture.outputs.text }}" >> "$GITHUB_ENV"
      - if: github.event_name == '${literal ? "issues" : "issue_comment"}'
        uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: fixed
`;
      return scanWorkflowFiles(
        [parseWorkflowFile(".github/workflows/review.yml", raw)],
        ".",
        { ignore: [], ignorePaths: [] },
      );
    };
    for (const result of [scanRelay(true), scanRelay(false)]) {
      expect(diagnostics(result)).not.toContain(
        "agentci/analysis-output-provenance-unknown",
      );
      expect(result.analysis_complete).toBe(true);
    }
  });

  it("does not treat a first-step literal output or an unconsumed output as unknown", () => {
    const scanOutput = (run: string, prompt: string) =>
      scanWorkflowFiles(
        [
          parseWorkflowFile(
            ".github/workflows/review.yml",
            `
on: issues
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - id: capture
        env:
          TITLE: \${{ github.event.issue.title }}
        run: ${run}
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "${prompt}"
`,
          ),
        ],
        ".",
        { ignore: [], ignorePaths: [] },
      );
    for (const result of [
      scanOutput(
        'echo "text=safe" >> "$GITHUB_OUTPUT"',
        "Review \${{ steps.capture.outputs.text }}",
      ),
      scanOutput('echo "text=$TITLE" >> "$GITHUB_OUTPUT"', "Review fixed"),
    ]) {
      expect(diagnostics(result)).not.toContain(
        "agentci/analysis-output-provenance-unknown",
      );
      expect(result.analysis_complete).toBe(true);
    }
  });

  it("recognizes bracket-form step output references", () => {
    const raw = `
on: issues
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - id: capture
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "text=$TITLE" >> "$GITHUB_OUTPUT"
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ steps['capture'].outputs['text'] }}"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it.each([
    "toJSON(steps)",
    "toJSON(steps.capture)",
    "toJSON(steps.*.outputs.text)",
  ])("does not call a serialized step output clean: %s", (expression) => {
    const raw = `
on: issues
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - id: capture
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "text=$TITLE" >> "$GITHUB_OUTPUT"
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ ${expression} }}"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it.each([
    "'steps.capture.outputs.text'",
    "format('{0}', 'steps.capture.outputs.text')",
  ])(
    "does not mistake expression text for an output alias: %s",
    (expression) => {
      const raw = `
on: issues
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - id: capture
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "text=$TITLE" >> "$GITHUB_OUTPUT"
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ ${expression} }}"
`;
      const result = scanWorkflowFiles(
        [parseWorkflowFile(".github/workflows/review.yml", raw)],
        ".",
        { ignore: [], ignorePaths: [] },
      );
      expect(diagnostics(result)).not.toContain(
        "agentci/analysis-output-provenance-unknown",
      );
      expect(result.analysis_complete).toBe(true);
    },
  );

  it("keeps disjoint producer and consumer events separate", () => {
    const raw = `
on: [issues, issue_comment]
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - id: capture
        if: github.event_name == 'issues'
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "text=$TITLE" >> "$GITHUB_OUTPUT"
      - if: github.event_name == 'issue_comment'
        uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ steps.capture.outputs.text }}"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).not.toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(true);
  });

  it.each([
    "needs.prepare.outputs.text",
    "toJSON(needs)",
    "toJSON(needs.prepare)",
    "toJSON(needs.*.outputs.text)",
  ])("does not call a computed needs output clean: %s", (expression) => {
    const raw = `
on: issues
permissions:
  contents: write
jobs:
  review:
    needs: prepare
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ ${expression} }}"
  prepare:
    runs-on: ubuntu-latest
    outputs:
      text: \${{ github.event.issue.title }}
    steps:
      - run: echo done
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps a computed job output routed through a matrix unresolved", () => {
    const raw = `
on: issues
permissions:
  contents: write
jobs:
  review:
    needs: prepare
    runs-on: ubuntu-latest
    strategy:
      matrix: \${{ fromJSON(needs.prepare.outputs.matrix) }}
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          github_token: \${{ secrets.GITHUB_TOKEN }}
          allowed_non_write_users: "*"
          prompt: "Review \${{ matrix.text }}"
  prepare:
    runs-on: ubuntu-latest
    outputs:
      matrix: \${{ steps.capture.outputs.matrix }}
    steps:
      - id: capture
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "matrix=$TITLE" >> "$GITHUB_OUTPUT"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps a matrix built from a literal job output complete", () => {
    const raw = `
on: issues
permissions:
  contents: read
jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      matrix: '{"text":["safe"]}'
    steps:
      - run: echo done
  review:
    needs: prepare
    runs-on: ubuntu-latest
    strategy:
      matrix: \${{ fromJSON(needs.prepare.outputs.matrix) }}
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ matrix.text }}"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).not.toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(true);
  });

  it("does not call an event-derived matrix value clean when an AI prompt reads it", () => {
    const raw = `
on: issues
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        text: ["\${{ github.event.issue.title }}"]
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ matrix.text }}"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-matrix-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it.each([
    "matrix.item.text",
    "matrix.item['text']",
    "matrix['item'].text",
    "toJSON(matrix.item.text)",
  ])(
    "keeps a nested matrix member derived from a job output unresolved: %s",
    (expression) => {
      const raw = `
on: issues
permissions:
  contents: read
jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      matrix: \${{ github.event.issue.title }}
    steps:
      - run: echo done
  review:
    needs: prepare
    runs-on: ubuntu-latest
    strategy:
      matrix: \${{ fromJSON(needs.prepare.outputs.matrix) }}
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ ${expression} }}"
`;
      const result = scanWorkflowFiles(
        [parseWorkflowFile(".github/workflows/review.yml", raw)],
        ".",
        { ignore: [], ignorePaths: [] },
      );
      expect(diagnostics(result)).toContain(
        "agentci/analysis-output-provenance-unknown",
      );
      expect(result.analysis_complete).toBe(false);
    },
  );

  it("does not carry an Issue matrix source into a PR-only AI step", () => {
    const raw = `
on: [issues, pull_request]
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        text: ["\${{ github.event.issue.title }}"]
    steps:
      - if: github.event_name == 'pull_request'
        uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ matrix.text }}"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).not.toContain(
      "agentci/analysis-matrix-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(true);
  });

  it.each(["needs.prepare.outputs.text", "toJSON(needs)"])(
    "keeps a literal needs output complete: %s",
    (expression) => {
      const raw = `
on: issues
permissions:
  contents: write
jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      text: fixed
    steps:
      - run: echo done
  review:
    needs: prepare
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ ${expression} }}"
`;
      const result = scanWorkflowFiles(
        [parseWorkflowFile(".github/workflows/review.yml", raw)],
        ".",
        { ignore: [], ignorePaths: [] },
      );
      expect(diagnostics(result)).not.toContain(
        "agentci/analysis-output-provenance-unknown",
      );
      expect(result.analysis_complete).toBe(true);
    },
  );

  it("does not attribute a later producer to an earlier AI step", () => {
    const raw = `
on: issues
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ steps.capture.outputs.text }}"
      - id: capture
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "text=$TITLE" >> "$GITHUB_OUTPUT"
`;
    const result = scanWorkflowFiles(
      [parseWorkflowFile(".github/workflows/review.yml", raw)],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).not.toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(true);
  });

  it("keeps forwarded needs outputs unresolved inside a local reusable workflow", () => {
    const caller = `
on: issues
permissions:
  contents: write
jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      text: \${{ github.event.issue.title }}
    steps:
      - run: echo done
  delegate:
    needs: prepare
    uses: ./.github/workflows/agent.yml
    with:
      text: \${{ needs.prepare.outputs.text }}
`;
    const callee = `
on: workflow_call
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ inputs.text }}"
`;
    const result = scanWorkflowFiles(
      [
        parseWorkflowFile(".github/workflows/caller.yml", caller),
        parseWorkflowFile(".github/workflows/agent.yml", callee),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it.each([
    "format('Review {0}', inputs.text)",
    "inputs['text']",
    "toJSON(inputs)",
  ])("keeps composed reusable input aliases unresolved: %s", (expression) => {
    const caller = `
on: issues
permissions:
  contents: write
jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      text: \${{ github.event.issue.title }}
    steps:
      - run: echo done
  delegate:
    needs: prepare
    uses: ./.github/workflows/agent.yml
    with:
      text: \${{ needs.prepare.outputs.text }}
`;
    const callee = `
on: workflow_call
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ ${expression} }}"
`;
    const result = scanWorkflowFiles(
      [
        parseWorkflowFile(".github/workflows/caller.yml", caller),
        parseWorkflowFile(".github/workflows/agent.yml", callee),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps a composed reusable input forwarded through GITHUB_ENV unresolved", () => {
    const caller = `
on: issues
permissions:
  contents: write
jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      text: \${{ github.event.issue.title }}
    steps:
      - run: echo done
  delegate:
    needs: prepare
    uses: ./.github/workflows/agent.yml
    with:
      text: \${{ needs.prepare.outputs.text }}
`;
    const callee = `
on: workflow_call
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - run: echo "REQUEST=\${{ format('{0}', inputs.text) }}" >> "$GITHUB_ENV"
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: fixed
`;
    const result = scanWorkflowFiles(
      [
        parseWorkflowFile(".github/workflows/caller.yml", caller),
        parseWorkflowFile(".github/workflows/agent.yml", callee),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("does not call a composed reusable event input clean", () => {
    const caller = `
on: issues
permissions:
  contents: write
jobs:
  delegate:
    uses: ./.github/workflows/agent.yml
    with:
      text: \${{ github.event.issue.title }}
`;
    const callee = `
on: workflow_call
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ format('{0}', inputs.text) }}"
`;
    const result = scanWorkflowFiles(
      [
        parseWorkflowFile(".github/workflows/caller.yml", caller),
        parseWorkflowFile(".github/workflows/agent.yml", callee),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-reusable-input-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps a composed reusable input literal complete", () => {
    const caller = `
on: workflow_dispatch
permissions:
  contents: read
jobs:
  delegate:
    uses: ./.github/workflows/agent.yml
    with:
      text: safe
`;
    const callee = `
on: workflow_call
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ format('value {0}', inputs.text) }}"
`;
    const result = scanWorkflowFiles(
      [
        parseWorkflowFile(".github/workflows/caller.yml", caller),
        parseWorkflowFile(".github/workflows/agent.yml", callee),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(result.analysis_complete).toBe(true);
  });

  it("keeps nested reusable input forwarding analysis-incomplete", () => {
    const entry = `
on: issues
permissions:
  contents: write
jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      text: \${{ github.event.issue.title }}
    steps:
      - run: echo done
  delegate:
    needs: prepare
    uses: ./.github/workflows/mid.yml
    with:
      text: \${{ needs.prepare.outputs.text }}
`;
    const middle = `
on: workflow_call
jobs:
  delegate:
    uses: ./.github/workflows/agent.yml
    with:
      text: \${{ format('{0}', inputs.text) }}
`;
    const leaf = `
on: workflow_call
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ inputs.text }}"
`;
    const result = scanWorkflowFiles(
      [
        parseWorkflowFile(".github/workflows/entry.yml", entry),
        parseWorkflowFile(".github/workflows/mid.yml", middle),
        parseWorkflowFile(".github/workflows/agent.yml", leaf),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-reusable-input-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps nested reusable matrix forwarding analysis-incomplete", () => {
    const entry = `
on: issues
permissions:
  contents: write
jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      matrix: \${{ github.event.issue.title }}
    steps:
      - run: echo done
  delegate:
    needs: prepare
    uses: ./.github/workflows/mid.yml
    with:
      matrix: \${{ needs.prepare.outputs.matrix }}
`;
    const middle = `
on: workflow_call
jobs:
  delegate:
    uses: ./.github/workflows/agent.yml
    with:
      matrix: \${{ format('{0}', inputs.matrix) }}
`;
    const leaf = `
on: workflow_call
jobs:
  agent:
    runs-on: ubuntu-latest
    strategy:
      matrix: \${{ fromJSON(inputs.matrix) }}
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ matrix.text }}"
`;
    const result = scanWorkflowFiles(
      [
        parseWorkflowFile(".github/workflows/entry.yml", entry),
        parseWorkflowFile(".github/workflows/mid.yml", middle),
        parseWorkflowFile(".github/workflows/agent.yml", leaf),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-reusable-input-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("keeps a forwarded output unresolved when a reusable workflow expands it through a matrix", () => {
    const caller = `
on: issues
permissions:
  contents: write
jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      matrix: \${{ steps.capture.outputs.matrix }}
    steps:
      - id: capture
        env:
          TITLE: \${{ github.event.issue.title }}
        run: echo "matrix=$TITLE" >> "$GITHUB_OUTPUT"
  delegate:
    needs: prepare
    uses: ./.github/workflows/agent.yml
    with:
      matrix: \${{ needs.prepare.outputs.matrix }}
`;
    const callee = `
on: workflow_call
jobs:
  agent:
    runs-on: ubuntu-latest
    strategy:
      matrix: \${{ fromJSON(inputs.matrix) }}
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ matrix.text }}"
`;
    const result = scanWorkflowFiles(
      [
        parseWorkflowFile(".github/workflows/caller.yml", caller),
        parseWorkflowFile(".github/workflows/agent.yml", callee),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(diagnostics(result)).toContain(
      "agentci/analysis-output-provenance-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it.each([
    {
      name: "event-derived",
      prepare: "",
      matrix: `matrix:
        text: ["\${{ github.event.issue.title }}"]`,
      unknown: true,
    },
    {
      name: "job-output-derived",
      prepare: `  prepare:
    runs-on: ubuntu-latest
    outputs:
      matrix: \${{ github.event.issue.title }}
    steps:
      - run: echo done
`,
      matrix: `matrix: \${{ fromJSON(needs.prepare.outputs.matrix) }}`,
      unknown: true,
    },
    {
      name: "literal",
      prepare: "",
      matrix: `matrix:
        text: [safe]`,
      unknown: false,
    },
  ])(
    "tracks a reusable caller's $name matrix into its AI callee",
    ({ prepare, matrix, unknown }) => {
      const caller = `
on: issues
permissions:
  contents: write
jobs:
${prepare}  delegate:
    ${prepare ? "needs: prepare\n    " : ""}uses: ./.github/workflows/agent.yml
    strategy:
      ${matrix}
    with:
      text: \${{ matrix.text }}
`;
      const callee = `
on: workflow_call
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          prompt: "Review \${{ inputs.text }}"
`;
      const result = scanWorkflowFiles(
        [
          parseWorkflowFile(".github/workflows/caller.yml", caller),
          parseWorkflowFile(".github/workflows/agent.yml", callee),
        ],
        ".",
        { ignore: [], ignorePaths: [] },
      );
      expect(
        diagnostics(result).includes(
          "agentci/analysis-reusable-input-provenance-unknown",
        ),
      ).toBe(unknown);
      if (unknown) {
        expect(
          result.diagnostics.find(
            ({ code }) =>
              code === "agentci/analysis-reusable-input-provenance-unknown",
          )?.step_index,
        ).toBe(0);
      }
      expect(result.analysis_complete).toBe(!unknown);
    },
  );

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
