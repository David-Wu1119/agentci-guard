import { RULES } from "./rules.js";
import type { Finding, SarifLog } from "./types.js";

export function toSarif(findings: Finding[]): SarifLog {
  const usedRules = Object.values(RULES).filter((rule) =>
    findings.some((finding) => finding.rule_id === rule.id),
  );
  return {
    version: "2.1.0",
    $schema:
      "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "AgentCI Guard",
            informationUri: "https://github.com/David-Wu1119/agentci-guard",
            rules: usedRules.map((rule) => ({
              id: rule.id,
              name: rule.title,
              shortDescription: { text: rule.title },
              fullDescription: { text: rule.why },
              help: {
                text: rule.fix.join(" "),
                markdown: rule.fix.map((fix) => `- ${fix}`).join("\n"),
              },
              defaultConfiguration: { level: sarifLevel(rule.severity) },
            })),
          },
        },
        results: findings.map((finding) => ({
          ruleId: finding.rule_id,
          level: sarifLevel(finding.severity),
          message: { text: `${finding.title}: ${finding.evidence}` },
          properties: {
            "agentci/severity": finding.severity,
            "agentci/reachableEvents": finding.reachable_events ?? [],
            ...(finding.job ? { "agentci/job": finding.job } : {}),
            ...(finding.step ? { "agentci/step": finding.step } : {}),
            ...(finding.step_index === undefined
              ? {}
              : { "agentci/stepIndex": finding.step_index }),
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.file },
                region: { startLine: finding.line ?? 1 },
              },
            },
          ],
        })),
      },
    ],
  };
}

function sarifLevel(severity: string): "note" | "warning" | "error" {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "note";
}
