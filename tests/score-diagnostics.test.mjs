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
});
