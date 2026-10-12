import { describe, expect, it } from "vitest";
import { parseWorkflowFile, scanWorkflowFiles } from "../src/scanner.js";
import {
  predict,
  relevantDiagnostics,
} from "../scripts/benchmark/scoring-unit.mjs";

const file = ".github/workflows/agent.yml";
const annotation = (rule_id) => ({
  workflow_file: file,
  job_id: "agent",
  scope: "job",
  rule_id,
});
const diagnostic = (code) => ({ code, file, job: "agent" });
const result = (findings = [], diagnostics = []) => ({
  findings,
  diagnostics,
  agent_usages: [],
});
const classify = (rule, scan) =>
  predict(annotation(rule), scan, "agentci/agent-usage");
const stepAnnotation = (step_index) => ({
  ...annotation("agentci/agent-usage"),
  scope: "step",
  step_index,
});

describe("score diagnostic attribution", () => {
  it("does not move an uncertain AI Action event onto an earlier checkout step", () => {
    const scan = scanWorkflowFiles(
      [
        parseWorkflowFile(
          file,
          `on: discussion_comment
permissions:
  contents: read
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
`,
        ),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(
      scan.diagnostics.find(
        (item) => item.code === "agentci/analysis-agent-event-unknown",
      )?.step_index,
    ).toBe(1);
    expect(predict(stepAnnotation(0), scan, "agentci/agent-usage")).toBe(
      "negative",
    );
  });

  it("does not treat unknown AI Action event support as unknown checkout protection", () => {
    const scan = scanWorkflowFiles(
      [
        parseWorkflowFile(
          file,
          `on: discussion_comment
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
`,
        ),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(
      scan.diagnostics.some(
        (item) => item.code === "agentci/analysis-agent-event-unknown",
      ),
    ).toBe(true);
    expect(
      predict(
        { ...stepAnnotation(0), rule_id: "agentci/unsafe-checkout" },
        scan,
        "agentci/agent-usage",
      ),
    ).toBe("negative");
  });

  it("does not turn absent step features into unknowns on an unverified Action event", () => {
    const scan = scanWorkflowFiles(
      [
        parseWorkflowFile(
          file,
          `on: discussion_comment
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
`,
        ),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(predict(stepAnnotation(0), scan, "agentci/agent-usage")).toBe(
      "unknown",
    );
    for (const rule_id of [
      "agentci/ai-shell-access",
      "agentci/untrusted-input-in-prompt",
      "agentci/unpinned-ai-action",
    ]) {
      expect(
        predict({ ...stepAnnotation(0), rule_id }, scan, "agentci/agent-usage"),
        rule_id,
      ).toBe("negative");
    }
  });

  it("keeps job-level uncertainty relevant to every step", () => {
    const scan = result([], [diagnostic("agentci/analysis-event-condition")]);
    expect(predict(stepAnnotation(0), scan, "agentci/agent-usage")).toBe(
      "unknown",
    );
    expect(predict(stepAnnotation(1), scan, "agentci/agent-usage")).toBe(
      "unknown",
    );
  });

  it("keeps step-level uncertainty on its own step when no finding exists", () => {
    const scan = result(
      [],
      [
        {
          ...diagnostic("agentci/analysis-agent-event-unknown"),
          step_index: 1,
        },
      ],
    );
    expect(predict(stepAnnotation(0), scan, "agentci/agent-usage")).toBe(
      "negative",
    );
    expect(predict(stepAnnotation(1), scan, "agentci/agent-usage")).toBe(
      "unknown",
    );
  });

  it("keeps both same-line step diagnostics when YAML uses flow-style steps", () => {
    const scan = scanWorkflowFiles(
      [
        parseWorkflowFile(
          file,
          `on: discussion_comment
jobs:
  agent:
    runs-on: ubuntu-latest
    steps: [{uses: anthropics/claude-code-action@v1}, {uses: anthropics/claude-code-action@v1}]
`,
        ),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(
      scan.diagnostics
        .filter((item) => item.code === "agentci/analysis-agent-event-unknown")
        .map((item) => item.step_index),
    ).toEqual([0, 1]);
  });

  it("abstains only on the two write-token rules when implicit ingestion is unverified", () => {
    const scan = result(
      [],
      [diagnostic("agentci/analysis-agent-implicit-ingestion-unknown")],
    );
    expect(classify("agentci/untrusted-ai-write-token", scan)).toBe("unknown");
    expect(classify("agentci/gated-ai-write-token", scan)).toBe("unknown");
    expect(classify("agentci/agent-usage", scan)).toBe("negative");
    expect(classify("agentci/broad-write-permissions", scan)).toBe("negative");
  });

  it("keeps a proven critical path positive and the mutually exclusive gated rule negative", () => {
    const scan = result(
      [{ rule_id: "agentci/untrusted-ai-write-token", file, job: "agent" }],
      [diagnostic("agentci/analysis-agent-implicit-ingestion-unknown")],
    );
    expect(classify("agentci/untrusted-ai-write-token", scan)).toBe("positive");
    expect(classify("agentci/gated-ai-write-token", scan)).toBe("negative");
  });

  it("abstains when a matching finding has only possibly reachable events", () => {
    const scan = result([
      {
        rule_id: "agentci/broad-write-permissions",
        file,
        job: "agent",
        reachable_events: ["issues"],
        uncertain_reachable_events: ["issues"],
      },
    ]);
    expect(classify("agentci/broad-write-permissions", scan)).toBe("unknown");
  });

  it("keeps a confirmed event positive beside a possibly reachable event", () => {
    const scan = result([
      {
        rule_id: "agentci/broad-write-permissions",
        file,
        job: "agent",
        reachable_events: ["issues", "discussion_comment"],
        uncertain_reachable_events: ["discussion_comment"],
      },
    ]);
    expect(classify("agentci/broad-write-permissions", scan)).toBe("positive");
  });

  it("keeps a confirmed sibling positive despite a possible-only sibling", () => {
    const scan = result([
      {
        rule_id: "agentci/broad-write-permissions",
        file,
        job: "agent",
        reachable_events: ["issues"],
        uncertain_reachable_events: ["issues"],
      },
      {
        rule_id: "agentci/broad-write-permissions",
        file,
        job: "agent",
        reachable_events: ["push"],
      },
    ]);
    expect(classify("agentci/broad-write-permissions", scan)).toBe("positive");
  });

  it("keeps legacy matching findings positive without certainty metadata", () => {
    const scan = result([
      { rule_id: "agentci/broad-write-permissions", file, job: "agent" },
    ]);
    expect(classify("agentci/broad-write-permissions", scan)).toBe("positive");
  });

  it("abstains on possible-only agent use without affecting another step", () => {
    const scan = {
      ...result(),
      agent_usages: [
        {
          file,
          job: "agent",
          step_index: 0,
          reachable_events: ["issue_comment"],
          uncertain_reachable_events: ["issue_comment"],
        },
        {
          file,
          job: "agent",
          step_index: 1,
          reachable_events: ["issue_comment"],
        },
      ],
    };
    expect(predict(stepAnnotation(0), scan, "agentci/agent-usage")).toBe(
      "unknown",
    );
    expect(predict(stepAnnotation(1), scan, "agentci/agent-usage")).toBe(
      "positive",
    );
  });

  it("does not use a possible-only ungated path to make the gated rule negative", () => {
    const scan = result([
      {
        rule_id: "agentci/untrusted-ai-write-token",
        file,
        job: "agent",
        reachable_events: ["issues"],
        uncertain_reachable_events: ["issues"],
      },
    ]);
    expect(classify("agentci/untrusted-ai-write-token", scan)).toBe("unknown");
    expect(classify("agentci/gated-ai-write-token", scan)).toBe("unknown");
  });

  it("does not rule out a critical path when gated evidence coexists with unknown ingestion", () => {
    const scan = result(
      [{ rule_id: "agentci/gated-ai-write-token", file, job: "agent" }],
      [diagnostic("agentci/analysis-agent-implicit-ingestion-unknown")],
    );
    expect(classify("agentci/gated-ai-write-token", scan)).toBe("positive");
    expect(classify("agentci/untrusted-ai-write-token", scan)).toBe("unknown");
  });

  it("does not treat known unsupported Action paths as scoring abstentions", () => {
    const scan = result(
      [],
      [diagnostic("agentci/analysis-agent-event-unsupported")],
    );
    expect(classify("agentci/agent-usage", scan)).toBe("negative");
    expect(classify("agentci/untrusted-ai-write-token", scan)).toBe("negative");
    expect(
      relevantDiagnostics(annotation("agentci/unsafe-checkout"), scan),
    ).toEqual([]);
  });

  it("attributes unknown permissions to both write-token rules and broad-write", () => {
    const scan = result(
      [],
      [diagnostic("agentci/analysis-permissions-unknown")],
    );
    for (const rule of [
      "agentci/untrusted-ai-write-token",
      "agentci/gated-ai-write-token",
      "agentci/broad-write-permissions",
    ]) {
      expect(classify(rule, scan)).toBe("unknown");
    }
    expect(classify("agentci/untrusted-input-in-prompt", scan)).toBe(
      "negative",
    );
  });

  it("limits run dataflow uncertainty to input-dependent rules", () => {
    const scan = result(
      [],
      [
        {
          ...diagnostic("agentci/analysis-run-dataflow-unknown"),
          step_index: 0,
        },
      ],
    );
    for (const rule of [
      "agentci/untrusted-ai-write-token",
      "agentci/gated-ai-write-token",
    ]) {
      expect(classify(rule, scan)).toBe("unknown");
    }
    expect(
      predict(
        { ...stepAnnotation(0), rule_id: "agentci/untrusted-input-in-prompt" },
        scan,
        "agentci/agent-usage",
      ),
    ).toBe("unknown");
    for (const rule of [
      "agentci/pull-request-target-ai",
      "agentci/broad-write-permissions",
      "agentci/ai-with-secrets",
    ]) {
      expect(classify(rule, scan)).toBe("negative");
    }
    for (const rule of [
      "agentci/agent-usage",
      "agentci/unsafe-checkout",
      "agentci/ai-shell-access",
      "agentci/unpinned-ai-action",
    ]) {
      expect(
        predict(
          { ...stepAnnotation(0), rule_id: rule },
          scan,
          "agentci/agent-usage",
        ),
      ).toBe("negative");
    }
  });

  it("limits output provenance uncertainty to write-token rules", () => {
    const scan = result(
      [],
      [
        {
          ...diagnostic("agentci/analysis-output-provenance-unknown"),
          step_index: 0,
        },
      ],
    );
    expect(classify("agentci/untrusted-ai-write-token", scan)).toBe("unknown");
    expect(classify("agentci/gated-ai-write-token", scan)).toBe("unknown");
    expect(
      predict(
        { ...stepAnnotation(0), rule_id: "agentci/untrusted-input-in-prompt" },
        scan,
        "agentci/agent-usage",
      ),
    ).toBe("negative");
    expect(classify("agentci/broad-write-permissions", scan)).toBe("negative");
  });

  it("limits opaque reusable input uncertainty to write-token rules", () => {
    const scan = result(
      [],
      [
        {
          ...diagnostic("agentci/analysis-reusable-input-provenance-unknown"),
          step_index: 0,
        },
      ],
    );
    expect(classify("agentci/untrusted-ai-write-token", scan)).toBe("unknown");
    expect(classify("agentci/gated-ai-write-token", scan)).toBe("unknown");
    expect(
      predict(
        { ...stepAnnotation(0), rule_id: "agentci/untrusted-input-in-prompt" },
        scan,
        "agentci/agent-usage",
      ),
    ).toBe("negative");
    expect(classify("agentci/broad-write-permissions", scan)).toBe("negative");
  });

  it("does not turn matrix-derived input into a direct-event prompt predicate", () => {
    const issueTitle = "$" + "{{ github.event.issue.title }}";
    const matrixText = "$" + "{{ matrix.text }}";
    const scan = scanWorkflowFiles(
      [
        parseWorkflowFile(
          file,
          `on: issues
permissions:
  contents: write
jobs:
  agent:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        text: ["${issueTitle}"]
    steps:
      - uses: anthropics/claude-code-action@787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251
        with:
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
          github_token: \${{ secrets.GITHUB_TOKEN }}
          allowed_non_write_users: "*"
          prompt: "Review ${matrixText}"
`,
        ),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(scan.diagnostics.map(({ code }) => code)).toContain(
      "agentci/analysis-matrix-provenance-unknown",
    );
    expect(classify("agentci/untrusted-ai-write-token", scan)).toBe("unknown");
    expect(
      predict(
        { ...stepAnnotation(0), rule_id: "agentci/untrusted-input-in-prompt" },
        scan,
        "agentci/agent-usage",
      ),
    ).toBe("negative");
  });

  it("keeps remote agent capability uncertainty off the runner token rule", () => {
    const issueTitle = "$" + "{{ github.event.issue.title }}";
    const scan = scanWorkflowFiles(
      [
        parseWorkflowFile(
          file,
          `on: issues
permissions:
  contents: read
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST https://api.devin.ai/v1/sessions -d '{"prompt":"${issueTitle}"}'
`,
        ),
      ],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(scan.agent_usages).toHaveLength(1);
    expect(
      scan.diagnostics.some(
        ({ code }) =>
          code === "agentci/analysis-remote-agent-capability-unknown",
      ),
    ).toBe(true);
    expect([
      classify("agentci/broad-write-permissions", scan),
      classify("agentci/untrusted-ai-write-token", scan),
      classify("agentci/gated-ai-write-token", scan),
    ]).toEqual(["negative", "unknown", "unknown"]);
  });
});
