import { describe, expect, it } from "vitest";
import {
  renderMarkdownReport,
  renderTextReport,
  scanRepository,
} from "../src/index.js";

describe("Markdown report", () => {
  it("renders a summary, one section per finding, and the diagnostics block", async () => {
    const result = await scanRepository("examples/vulnerable");
    const markdown = renderMarkdownReport(result);

    expect(markdown).toContain("# AgentCI Guard Scan");
    expect(markdown).toContain(`- Findings: ${result.findings.length}`);
    expect(markdown).toContain(`- Critical: ${result.summary.critical}`);
    expect(markdown).toContain("- Analysis complete: no");
    expect(markdown).toContain("## Diagnostics");
    expect(markdown).toContain(
      "agentci/analysis-agent-implicit-ingestion-unknown",
    );

    for (const finding of result.findings) {
      expect(markdown).toContain(
        `## ${finding.severity.toUpperCase()} ${finding.rule_id}`,
      );
      expect(markdown).toContain(`**File:** ${finding.file}`);
      for (const fix of finding.fix) expect(markdown).toContain(`- ${fix}`);
    }
  });

  it("escapes backticks in evidence so the Markdown stays well formed", () => {
    const markdown = renderMarkdownReport({
      scanned_at: "2026-01-01T00:00:00.000Z",
      root: ".",
      workflow_count: 1,
      agent_usages: [],
      findings: [
        {
          id: "x",
          rule_id: "agentci/ai-shell-access",
          title: "t",
          severity: "high",
          file: "wf.yml",
          job: "job",
          step: "step",
          message: "m",
          why: "why",
          fix: ["do the thing"],
          evidence: "run: echo `whoami`",
          line: 3,
          reachable_events: ["push"],
        },
      ],
      summary: { critical: 0, high: 1, medium: 0, low: 0 },
      diagnostics: [
        {
          code: "agentci/analysis-event-condition",
          kind: "analysis",
          severity: "warning",
          file: "wf.yml",
          message: "could not interpret",
          line: 7,
        },
      ],
      analysis_complete: false,
    });

    expect(markdown).toContain("**Evidence:** `run: echo 'whoami'`");
    expect(markdown).toContain("**Line:** 3");
    expect(markdown).toContain("**Job:** job");
    expect(markdown).toContain("**Step:** step");
    expect(markdown).toContain("- Analysis complete: no");
    expect(markdown).toContain("## Diagnostics");
    expect(markdown).toContain(
      "- **agentci/analysis-event-condition** — wf.yml:7: could not interpret",
    );
  });
});

describe("text report", () => {
  it("distinguishes same-line findings with duplicate step names", () => {
    const result = {
      scanned_at: "2026-01-01T00:00:00.000Z",
      root: ".",
      workflow_count: 1,
      agent_usages: [],
      findings: [0, 1].map((step_index) => ({
        id: `finding-${step_index}`,
        rule_id: "agentci/ai-shell-access",
        title: "Shell access",
        severity: "high" as const,
        file: "wf.yml",
        job: "agent",
        step: "Duplicate",
        step_index,
        line: 5,
        message: "same finding",
        why: "same reason",
        fix: [],
        evidence: "same evidence",
      })),
      summary: { critical: 0, high: 2, medium: 0, low: 0 },
      diagnostics: [],
      analysis_complete: true,
    };
    const text = renderTextReport(result);
    const markdown = renderMarkdownReport(result);
    expect(text).toContain(
      "wf.yml:5 / job: agent / step: Duplicate / step_index: 0",
    );
    expect(text).toContain(
      "wf.yml:5 / job: agent / step: Duplicate / step_index: 1",
    );
    expect(markdown).toContain("**Step index:** 0");
    expect(markdown).toContain("**Step index:** 1");
  });

  it("distinguishes step diagnostics that share one YAML line", () => {
    const result = {
      scanned_at: "2026-01-01T00:00:00.000Z",
      root: ".",
      workflow_count: 1,
      agent_usages: [],
      findings: [],
      summary: { critical: 0, high: 0, medium: 0, low: 0 },
      diagnostics: [0, 1].map((step_index) => ({
        code: "agentci/analysis-agent-event-unknown",
        kind: "analysis" as const,
        severity: "warning" as const,
        file: "wf.yml",
        line: 5,
        step_index,
        message: "Unknown Action event path",
      })),
      analysis_complete: false,
    };
    for (const report of [
      renderTextReport(result),
      renderMarkdownReport(result),
    ]) {
      expect(report).toContain("wf.yml:5 [step_index=0]");
      expect(report).toContain("wf.yml:5 [step_index=1]");
    }
  });

  it("labels every severity level", () => {
    const base = {
      scanned_at: "2026-01-01T00:00:00.000Z",
      root: ".",
      workflow_count: 1,
      agent_usages: [],
      diagnostics: [],
      analysis_complete: true,
    };
    const finding = (severity: "critical" | "high" | "medium" | "low") => ({
      id: severity,
      rule_id: "agentci/x",
      title: "t",
      severity,
      file: "wf.yml",
      message: "m",
      why: "w",
      fix: [],
      evidence: "e",
      reachable_events: [],
    });
    const text = renderTextReport({
      ...base,
      findings: [
        finding("critical"),
        finding("high"),
        finding("medium"),
        finding("low"),
      ],
      summary: { critical: 1, high: 1, medium: 1, low: 1 },
    });
    expect(text).toContain("[CRITICAL]");
    expect(text).toContain("[HIGH]");
    expect(text).toContain("[MEDIUM]");
    expect(text).toContain("[LOW]");
  });
});
