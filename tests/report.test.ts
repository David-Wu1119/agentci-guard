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
    expect(markdown).toContain("- Analysis complete: yes");

    for (const finding of result.findings) {
      expect(markdown).toContain(
        `## ${finding.severity.toUpperCase()} ${finding.rule_id}`,
      );
      expect(markdown).toContain(`**File:** ${finding.file}`);
      for (const fix of finding.fix) expect(markdown).toContain(`- ${fix}`);
    }
    expect(markdown).not.toContain("## Diagnostics");
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
