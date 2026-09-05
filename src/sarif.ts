import { RULES } from "./rules.js";
import type {
  Diagnostic,
  Finding,
  SarifLog,
  SarifNotification,
  SarifScanInput,
} from "./types.js";

/**
 * Render findings as SARIF 2.1.0.
 *
 * Given a whole scan, the run also carries an `invocation` whose
 * `executionSuccessful` is the scan's `analysis_complete` and whose
 * `toolExecutionNotifications` are the diagnostics, so a consumer that only
 * counts `results` cannot mistake an incomplete zero-finding scan for a clean
 * one. Given a bare findings array, the run makes no claim about completeness.
 */
export function toSarif(input: Finding[] | SarifScanInput): SarifLog {
  const findings = Array.isArray(input) ? input : input.findings;
  const scan = Array.isArray(input) ? undefined : input;
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
        ...(scan
          ? {
              invocations: [
                {
                  executionSuccessful: scan.analysis_complete,
                  toolExecutionNotifications:
                    scan.diagnostics.map(toNotification),
                },
              ],
              properties: {
                "agentci/analysisComplete": scan.analysis_complete,
                "agentci/diagnosticCount": scan.diagnostics.length,
              },
            }
          : {}),
      },
    ],
  };
}

function toNotification(diagnostic: Diagnostic): SarifNotification {
  return {
    descriptor: { id: diagnostic.code },
    level: diagnostic.severity,
    message: { text: diagnostic.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: diagnostic.file },
          ...(diagnostic.line
            ? { region: { startLine: diagnostic.line } }
            : {}),
        },
      },
    ],
    properties: {
      "agentci/kind": diagnostic.kind,
      ...(diagnostic.job ? { "agentci/job": diagnostic.job } : {}),
    },
  };
}

function sarifLevel(severity: string): "note" | "warning" | "error" {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "note";
}
