import pc from "picocolors";
import type { Finding, ScanResult } from "./types.js";

/**
 * Render the GitHub Actions `$GITHUB_OUTPUT` lines for a scan, so downstream
 * steps can branch on the result (e.g. comment on a PR when critical > 0).
 */
export function formatGithubOutputs(
  result: ScanResult,
  sarifPath?: string,
): string {
  return (
    [
      `findings=${result.findings.length}`,
      `critical=${result.summary.critical}`,
      `high=${result.summary.high}`,
      `medium=${result.summary.medium}`,
      `low=${result.summary.low}`,
      `sarif-path=${sarifPath ?? ""}`,
    ].join("\n") + "\n"
  );
}

export function renderTextReport(result: ScanResult): string {
  const lines = [
    "AgentCI Guard scan",
    `Workflows: ${result.workflow_count}`,
    `Findings: ${result.findings.length}`,
    `Summary: critical=${result.summary.critical} high=${result.summary.high} medium=${result.summary.medium} low=${result.summary.low}`,
    "",
  ];

  for (const finding of result.findings) {
    lines.push(`${label(finding.severity)} ${finding.rule_id}`);
    lines.push(
      `File: ${finding.file}${finding.job ? ` / job: ${finding.job}` : ""}${finding.step ? ` / step: ${finding.step}` : ""}`,
    );
    lines.push(`Evidence: ${finding.evidence}`);
    lines.push(`Why: ${finding.why}`);
    lines.push("Fix:");
    for (const fix of finding.fix) lines.push(`- ${fix}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function renderMarkdownReport(result: ScanResult): string {
  return [
    "# AgentCI Guard Scan",
    "",
    `- Workflows: ${result.workflow_count}`,
    `- Findings: ${result.findings.length}`,
    `- Critical: ${result.summary.critical}`,
    `- High: ${result.summary.high}`,
    `- Medium: ${result.summary.medium}`,
    `- Low: ${result.summary.low}`,
    "",
    ...result.findings.flatMap(renderFindingMarkdown),
    "",
  ].join("\n");
}

function renderFindingMarkdown(finding: Finding): string[] {
  return [
    `## ${finding.severity.toUpperCase()} ${finding.rule_id}`,
    "",
    `**File:** ${finding.file}`,
    finding.job ? `**Job:** ${finding.job}` : "",
    finding.step ? `**Step:** ${finding.step}` : "",
    `**Evidence:** \`${finding.evidence.replace(/`/g, "'")}\``,
    "",
    finding.why,
    "",
    "**Fix:**",
    "",
    ...finding.fix.map((fix) => `- ${fix}`),
    "",
  ].filter(Boolean);
}

function label(severity: string): string {
  if (severity === "critical") return pc.red("[CRITICAL]");
  if (severity === "high") return pc.red("[HIGH]");
  if (severity === "medium") return pc.yellow("[MEDIUM]");
  return pc.cyan("[LOW]");
}
